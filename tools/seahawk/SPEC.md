# MH-60S Sea Hawk — Asset Spec Sheet (Lane 2)

Asset: `public/seahawk.glb` · Source: `tools/seahawk/build_seahawk.py` (procedural, Blender 4.2)
Proofs: `design-refs/proof-seahawk/` (01 front34 · 02 rear34 · 03 side · 04 front · 05 top · 06 door gunner · 07 cockpit cutaway)
Finish-pass proofs: `design-refs/proof-seahawk-finish/` (same angles, `tools/seahawk/render_proofs_finish.py`)
Built from Ian's reference (`design-refs/seahawk-reference-ian.png`): US NAVY 615 / HSC-5, door gunner
at the open port door, FLIR ball, rescue hoist, canted tail rotor.

## Conventions

- House axes (same as the Stallion): **X = length, nose +X · Y = width, port +Y · Z = up**, meters.
- Root node `Seahawk` at origin; ground contact plane z = 0 (gear bottoms touch 0).
- glTF export with `export_yup=True`: in three.js space the nose ends up toward **+Z**; if the
  vehicle stack expects −Z forward, rotate the root 180° about Y at load (same note as GT500 lane).

## Dimensions (model as built ≈ real MH-60S)

| | model | real MH-60S |
|---|---|---|
| Fuselage length (nose → tail cone) | 15.27 m (x +7.64 … −7.63) | 15.27 m |
| Overall length, rotors turning | 19.76 m (disk) | 19.76 m |
| Fuselage width | 2.36 m | 2.36 m |
| Cabin (interior tub) | 5.6 m long × 2.02 m wide, floor z 0.99, ceiling z 2.90 | ~3.25 × 2.29 × 1.37 m crew cabin (model tub runs cockpit-aft bulkhead to tail transition — gameplay space, slightly generous) |
| Main rotor diameter | 16.36 m (4 blades, chord 0.81 m) | 16.36 m |
| Tail rotor diameter | 3.35 m (4 blades, X config) | 3.35 m |
| Main rotor hub height | z 3.92 | ~3.9 m |
| Fin top | z 4.50 | ~4.5 m |
| Overall height (parked, X-config tail rotor tip) | ≈ 5.16 m | 5.13 m |
| Wheelbase (main axle → tail wheel) | 8.90 m | ~8.9 m |

## Mass / performance targets (for the future flight-model brief)

| | value |
|---|---|
| Empty mass | ≈ 6,900 kg |
| Max gross (internal / external) | 9,979 / 10,660 kg |
| Powerplant | 2 × GE T700-GE-401C, 1,890 shp each |
| Main rotor speed | 258 rpm (100 % Nr) |
| Max level speed | ≈ 296 km/h |
| CG estimate (model space) | (1.3, 0, 1.85) — just aft/below the mast |

## Pivot map (glTF node names — integration rotates THESE)

| node | origin (model space) | motion |
|---|---|---|
| `MainRotorPivot` | (0.95, 0, 3.92) | spin about local **Z**; children: hub, cap, 4 pitch links, `SH_Blade0–3` (each with a `SH_BladeTip` child). Blades parked in X config (45°), 1.5° droop baked into geometry |
| `TailRotorMount` | (−7.18, +0.16, 3.98) | STATIC — carries the real aircraft's **20° cant** (rotation.x). Never animate |
| `TailRotorPivot` | child of mount, at mount origin | spin about local **Y**; children: `SH_TailHub`, `SH_TailBlade0–3` (X config) |
| `DoorPivot_Port` | (3.28, +1.16, 1.70) | sliding door: translate local **X −1.04** = fully open (slides aft, per real aircraft). Children: door shell, window, handle |
| `DoorPivot_Stbd` | (3.28, −1.16, 1.70) | same, starboard |
| `GunPivot_Port` | (3.30, +1.02, 1.62) | door-gun mount at port door aft jamb. Traverse = rotation about local **Z** (+28° shown in proof 06); elevation = rotate child `DoorGun_Port` about local **Y** |
| `SH_Stabilator` | center (−6.62, 0, 2.52), span 4.38 m | separate mesh (folds on the real aircraft); pitch about its local Y if animated |
| Wheels (spin about world Y at each origin) | `SH_WheelMainPort` (2.42, +1.42, 0.345) r 0.345 · `SH_WheelMainStbd` (2.42, −1.42, 0.345) · `SH_WheelTail` (−6.48, 0, 0.205) r 0.205 | hub discs are separate sibling meshes (`SH_WheelHub*`) — group wheel+hub under one node at integration if spin is needed |
| Gear contact points | (2.42, ±1.42, 0), (−6.48, 0, 0) | for ground/attitude rest pose |

## Stations / hardpoints (model space)

- **Crew**: pilot seat (−Y, starboard — PIC side) head ≈ (5.05, −0.55, 2.0); copilot (+Y). Cyclics, collectives, pedals modeled.
- **Door gunner**: `GunPivot_Port` above; M240-style gun (receiver/barrel/shroud/ammo can as `DoorGun_Port` children). Starboard door has a stowed mount post only (`SH_GunPostStbd`) — second gun is an integration-time add.
- **FLIR**: ball center (6.95, 0, 0.88), lens faces +X/down — sensor station for a future camera hook.
- **Rescue hoist**: starboard above door; drum (3.30, −1.50, 2.58), hook rest (3.30, −1.52, 2.00).
- **Cabin**: 2 bench rows (6 troops) + 2 forward jump seats; dome lights emissive.

## Materials (PBR)

`naval_gray` airframe (0.335/0.365/0.385, rough .58, metal .18) · rotor charcoal · low-viz
`marking` decals as geometry text: **615 + HSC-5** on both boom sides, **US NAVY** on both
doghouse sides, **NAVY** on fin · emissive position lights (port red / stbd green / tail
white) and MFD screens (teal + amber).

FINISH PASS (Ty's conditional-approval items, 2026-10-21):
- **Panel lines + weathering** are painted into canvas textures in the lofts' parametric UV
  space (u = station fraction, v = ring angle): `naval_gray_fuse` (2048×1024) and
  `naval_gray_dog` (1024×512), exported as JPEG q90. Frame stations, longeron/floor seams,
  nose-avionics + cockpit-door + boom-avionics outlines, exhaust soot over the doghouse/boom
  top, door-sill/window/sponson grime streaks, belly shading, two replacement-panel tones,
  fine per-pixel grain. Geometry adds: tail-fold collar (`SH_TailFoldRing`, seam gray) at the
  boom fold station, rotor-deck seam strips, sliding-door gasket frames (`SH_DoorGasket*`).
- **`glass_tint` reworked**: dark blue-green dielectric (0.030/0.068/0.088, rough .05,
  metal 0), alpha **0.82 BLEND** — and `mat()` now drives the BSDF Alpha input, without
  which the original alpha never exported at all (the shipped GLB's glass was silently
  opaque 1.0). All glazing is conformal: windshield + chin are `loft_band`s that parallel
  the skin exactly; cockpit/cabin windows are framed surface patches (dark frame proud of
  skin, glass proud of frame). Cabin windows remain surface glass over the tub wall (see
  Gaps) but now read as framed windows, not decals.

## Gaps / notes for integration

- Glass is alpha 0.82 BLEND, dielectric. Alpha is deliberately not lower: the nose cone
  ahead of the instrument panel is hollow, and at ~0.55 the far skin's painted texture
  bleeds through the windshield as pale patches (diagnosed via A/B renders during the
  finish pass). If a future cockpit liner fills the nose, alpha can drop toward the
  GT500 windshield's 0.42.
- Door apertures are TRUE boolean cutouts in the fuselage loft; doors ship closed (translate to open).
- Cabin side windows aft are surface glass (not cut through) — cabin interior is a tub with its
  own walls, so cut-through windows there would show the tub wall; the framed patches read
  correctly dark against it.
- No LODs, no collision meshes, no flight model — flight integration is a later serialized step
  (heliMath was purged). Poly count ≈ 12.9k faces / 157 mesh objects — plenty of headroom.
