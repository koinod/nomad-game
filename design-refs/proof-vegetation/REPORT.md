# MODELED VEGETATION — BETA_SCATTER world dressing (lane/vegetation)

**What shipped:** the retired cone/blob scatter is gone. Every
vegetation class `BETA_SCATTER` declares for the forest, marsh, sand,
grass, and granite zones is now a Blender-built model (branching tube
spines, noise-displaced canopy masses, leaf cards, blade strips,
hanging Spanish moss), exported as a two-LOD GLB, and instanced
in-engine — `src/game/Vegetation.ts` (placement + materials + layer),
integrated in `World.buildScatter`. Rocks and fallen logs keep their
existing passes.

## Classes, budgets, instances

Triangle counts are the shipped GLBs' own (parsed from the binaries by
`vegetation.test.ts`; ceilings also enforced in Blender by
`tools/vegetation/verify_glb.py`). Instance counts are the production
sampler's (seeded, deterministic; every def hits its target exactly).

| class | zones | LOD0 tris (cap) | LOD1 tris (cap) | instances | near/far |
|---|---|---|---|---|---|
| live oak | forest | 990 (1150) | 275 (330) | 140 | 88 / 52 |
| loblolly pine | forest | 1305 (1560) | 155 (190) | 240 | 111 / 129 |
| wax myrtle | forest + grass | 610 (720) | 180 (220) | 210 | 83 / 127 |
| pine saplings | grass | shares loblolly | 155 | 60 | 0 / 60 |
| scrub pines | granite | shares loblolly | 155 | 42 | 0 / 42 |
| needle rush | marsh, h 0.05–0.55 | 65 (80) | 21 (30) | 850 | 93 / 757 |
| spartina | marsh, h 0.12–1.12 | 70 (85) | 21 (30) | 1150 | 138 / 1012 |
| dune grass | sand, h 0.7–2.3 | 106 (125) | 18 (26) | 1050 | 37 / 1013 |

Total instances: **3,742** in **16 instanced draw calls** (one
InstancedMesh per class per LOD; the loblolly GLB serves three defs).

## LOD approach

LOD is a **static split at placement time**: an instance whose
distance to the road/POI network (roads by centerline distance, POIs
by `BETA_POI_PLACEMENTS`) is under its class's `lodNearDist` draws
LOD0; everything else draws LOD1 — the far build of the *same model*
(trunk + canopy masses, no cards/twigs), never a billboard or an
impostor texture. Saplings and scrub pines (small, seen across
slopes) are far-LOD always. Per-class near distances: oak 65 m,
loblolly 42 m, myrtle 45 m, clumps 26 m — eyes-on-roads get the full
models; the deep forest spine, which reads as canopy mass through
the near trees anyway, pays far prices.

## Frame-cost reasoning

Worst case (every instanced mesh frustum-visible): ≈ **430k
triangles** of vegetation — oak ≈101k, loblolly ≈165k, myrtle ≈74k,
saplings+scrub ≈16k, marsh/dune clumps ≈75k combined. Context: the
terrain grid alone is ~1.1M triangles and one hero vehicle (Dark
Horse) is 165k; the vegetation material is a single vertex-colored
`MeshStandardMaterial` per class (no textures, no alpha), so per-tri
cost is the floor for lit geometry. Shadow cost is bounded by law:
**only near-LOD meshes cast shadows** (an InstancedMesh draws whole
into the shadow pass, so far-LOD casting would charge the full set
for shadows nobody can see — the shadow camera is player-local).
Clump classes never cast. Vertex processing dominates; there is no
per-frame CPU cost — matrices are static, and wind is a vertex-shader
field evaluation shared with the clouds/grass system it replaced.

## Wind

All class materials are patched by `Clouds.applyWindSway` — the same
world-position sway field (pure function of world position + height
fraction, so duplicated seam/card vertices displace identically and
nothing tears or shakes). Sway heights are the GLBs' authored heights
(pinned against the files by test); strengths compensate the field's
1/scale falloff so world-space tip amplitude lands per class (oak
≈0.30 m, pine ≈0.35 m, myrtle ≈0.20 m, clumps ≈0.14–0.16 m).

## Placement law (all test-pinned)

- Zone membership per `BETA_SCATTER` via `betaZoneAt` — oak/pine in
  forest, myrtle forest+grass, saplings grass, scrub granite, rush +
  spartina marsh, dune grass sand.
- The shared scatter veto: nothing on surveyed ground (sector/extra
  pads + 3 m) and nothing inside each class's road clearance
  (5.5–7 m) — the same functions World uses for rocks/logs.
- Marsh classes sit in their water heights against `betaHeightAt`:
  needle rush in the tidal band (0.05–0.55 m), spartina just above
  it (0.12–1.12 m); dune grass holds the foredune band (0.7–2.3 m),
  not the wet beach face; scrub pines cap at slope ≤ 1.05 so they
  hug ledges instead of floating on cliff faces.
- Grounding is `betaHeightAt` itself — the one terrain truth the
  mesh, physics, and every sampler read.

## Proof renders

Eye-level (1.7 m) dioramas, identical layouts before/after —
`forest_before/after.png`, `marsh_before/after.png`,
`dune_before/after.png`, montage in `contact_sheet.png`. Before =
the retired primitives rebuilt at their exact in-game transforms
(two-tier cone pines, blob crowns, cone tufts); after = the shipped
LOD0 GLBs. Tool: `tools/vegetation/render_proofs.py` (Cycles CPU).

## Residuals (honest)

- **GLB pop-in at boot:** vegetation loads async (the Husks/Vehicles
  pattern); the world is bare of vegetation for the first fractions
  of a second and classes appear as their files land (~460 KB total).
  No placeholder stands in meanwhile — a deliberate trade against
  blocking first frame on six fetches.
- **Static LOD:** the near/far split is fixed at build; walking deep
  into the forest doesn't promote far trees. The split distances were
  chosen so this reads as canopy depth, but a camera-distance LOD
  system is the known next lever if the spine ever feels thin up
  close off-road.
- **Shadow-pass cost:** near-LOD tree meshes are island-wide single
  InstancedMeshes, so the shadow pass draws ~283k tris when they
  intersect the shadow frustum. Regional instanced splits are the
  fix if profiling ever indicts it.
- **Not remodeled (out of this task's class list):** granite lichen
  boulders still use the existing rock pass; sand-zone driftwood
  still uses the fallen-log pass (forest/marsh only); grass-zone
  wildflower patches have no class yet; the old scatter's dead snags
  were retired without a modeled replacement.
- **Vertex-color shading:** foliage reads via baked per-vertex
  color variation + real lighting/shadows; there are no leaf
  textures by design (the GLBs stay texture-free and tiny).
- Placement sampling costs ~1.2 s of world build (rejection sampling
  against the zone/height samplers), once at boot.
