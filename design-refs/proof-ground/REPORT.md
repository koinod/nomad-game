# GROUND + LIGHTING LANE — REPORT (2026-10-22)

Ian: *"better graphics of the ground / maybe more detail or better lighting will do."*
Branch `lane/ground-graphics` from main `6d071c4`. Not pushed, not deployed — Ty gates and ships.

## What shipped

### 1. Ground detail (`src/game/groundDetail.ts`, applied in `World.buildTerrain` + road ribbons)
Procedural detail octaves over the baked zone vertex colors — **material-side only; not one height changed** (mesh == Rapier == sampler identity untouched; every height pin in `terrain.test.ts`/`betaTerrain.test.ts` passes unmodified).

- **Micro map** 512² RGBA DataTexture, one tile = 1.6 m of ground: R = albedo grain (×0.80–1.18), G = micro height, B = roughness field (×0.72–1.27). Seeded wrapped-lattice fBm + wrapped speckle — perfectly tileable (test pins seam steps ≤ interior steps).
- **Macro map** 256², one tile = 64 m, sampled rotated 0.41 rad: broad blotches (×0.90–1.10) + warm/cool tint drift (±5%) so the micro tile never reads as repetition across a vista.
- **Shader patch** (`applyGroundDetail`, onBeforeCompile, world-XZ sampling — no UVs needed, chunks are world-space): multiplies grain/blotch/tint over the vertex-color zones, modulates `roughnessFactor` from the same fields, **tilts the shading normal** by the micro height gradient (faded by slope and by 45–95 m distance), and adds a **shoreline damp band** (fragment height 0.12–0.9 m: −10% albedo, roughness → ×0.45 sheen) — wet sand at the waterline, rain or no rain.
- **Weather wetness composes**: `terrainWetnessLook` still drives base roughness/color from `World.updateSky` exactly as before (its test pins untouched); the detail multipliers sit on top.
- Road ribbons get the same patch at 0.7 strength (no damp band — they ride proud of the terrain). Dirt reads at foot level too.
- Texture memory: 512² + 256² RGBA with mips ≈ **0.44 MB**. Generated once, cached, deterministic (byte-identical per run; tests pin it).

### 2. Ground micro-scatter (`src/game/groundScatter.ts`, built in `World.build`)
ONE InstancedMesh of hand-built litter clusters (squashed pebble 8 tris + 2 stone chips 8 + 3 grass blades 6 = **22 tris/cluster**): **1,403 placements ≈ 30,866 tris total**; any single viewpoint sees one anchor's subset (~150–250 clusters ≈ 3.3–5.5k tris). No shadow casting (skipped by name in `applyShadowFlags`), receives shadow.

- Anchors: the 7 sector grounds (80 m discs) + every distinct POI site (46 m discs) — which is how the waist marsh (wreck shore, barn fields) gets litter despite hosting no sector. Density falls radially to 0.35 at the rim (a fade, not a ring).
- Rules (all pinned by tests on the real data): zones sand/marsh/grass/forest only, height ≥ 0.25 m, slope ≤ 0.55, ≥ 2.2 m off road centerlines, never on surveyed pads. Heights from `betaHeightAt` — stands on the physics ground by construction. Zone mix at seed 1234: grass 832, forest 388, marsh 132, sand 51.
- Zero gameplay footprint: no colliders, not loot, no interaction.

### 3. Lighting tune (`World.ts` surgical, `Game.ts` one line)
| Term | Before | After | Why |
|---|---|---|---|
| Sun peak intensity | 0.25 + dayness·2.4 → **2.65** | 0.30 + dayness·2.95 → **3.25** | direct:fill ratio was too low — slopes washed flat; still weather-scaled (`skyAdj.sunScale`, pinned) and continuous at dawn/dusk (Item 3 pins hold) |
| Sun golden color | lerp → `0xff9a4e` | lerp → `0xff9040` | deeper amber to match the stronger key at low sun |
| Hemi sky / ground | `0xbdd3e6` / `0x3a4a35` (green-gray) | `0xc7dcee` / `0x59503c` (warm earth) | bounce separates lit/shadowed ground by color, not just value |
| Day fog color | `0x9db8c8` | `0xa9c3d4` | toward the sky horizon `0xc3d7e8` — aerial perspective reads as one air (fog near/far still weather-driven + `tightenFog`, both pinned) |
| ACES exposure (`Game.ts:179`) | 1.06 | **1.10** | headroom for the stronger sun under ACES roll-off |

Untouched by design (all pinned by `lighting.test.ts` / `weatherSky.test.ts`): `SKY_PALETTES` values, `skyPaletteAt` blends, `weatherSkyAdjust`, `terrainWetnessLook`, hemi/env intensities per phase. Interiors: the hemisphere guarantee (day hemi ≥ 0.5 + env ≥ 0.4) is exactly as pinned — shaded, never black. Overcast/storm still collapse sun/fog through the same weather adjusters.

## Proof
`tools/render_ground_proof.ts` (vite-node) — software eye-level renders over the real grid at the three standard spots, BEFORE (old rig, no detail) vs AFTER (this lane's actual generated maps + scatter + tuned rig). The tool's absolute scale is calibrated once (`PROOF_LIGHT_SCALE`, identical both passes; the game's own operating point includes its PostFX grade, not modeled here) — every before/after delta is the shipped delta.

- [lighthouse_midday_before.png](lighthouse_midday_before.png) → [after](lighthouse_midday_after.png) — flat pad plateau: the delta is the grain itself (uniform wash → mottled ground + litter specks).
- [marsh_golden_before.png](marsh_golden_before.png) → [after](marsh_golden_after.png) — the full read: zone grain, damp shoreline tones, scatter tufts, warmer low sun.
- [airbase_apron_before.png](airbase_apron_before.png) → [after](airbase_apron_after.png) — apron flat: grain breaks the wash.

## Gate
- tsc clean · **full vitest 1086/1086 (69 files)** — baseline 1075 + 11 new (`src/tests/groundDetail.test.ts`), zero regressions, counts from log files · production build green.
- Height-identity statement: no changes to `betaTerrain.ts`, the grid, the sampler, or any height/collider data; `terrain.test.ts`, `betaTerrain.test.ts`, `groundTruth` and the waist pins all pass **unmodified**.
- File ownership respected: no edits to CarPhysics, Player/Combat, data files, phone UI, or Vegetation; Game.ts carries exactly one lighting-value line (exposure) — flagged here for Ty in case the perf lane touched the neighboring renderer lines.

## Honest residuals
- The proof rasterizer tessellates at 3.75 m, so frame-bottom facets near shorelines read coarser than the game's 1.25 m mesh — a tool artifact, identical in both passes.
- Micro-normal tilt is planar (world-XZ): on steep granite it fades out by design rather than pretending to be triplanar.
- Detail grain is zone-neutral (one field over all zones, tinted by the vertex colors); per-zone grain *character* (e.g. distinctly rippled sand) would need a zone-id channel — a follow-up if Ian wants it after playing this.
