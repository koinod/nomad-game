# Sector Stronghold Kits — Spec §3.2 build-out report

Branch `lane/strongholds` (from main `5ac0c52`). Authority: Ian's world
spec v1.0, `design-refs/world-specs/beta-island-spec-v1.md` §3.2 —
bespoke modular kits for all six strongholds, built on the existing
kit system (`src/game/kit.ts` + `kitQa.ts`, the airbase pattern),
never a parallel one. Sites are data (`src/game/sectorSites.ts`);
builders + ground works live in `src/game/Sectors.ts`; wiring is
`World.buildStrongholds()` + the Game collider/floor/loot merges.

## Gate (all numbers from captured logs)

- `tsc --noEmit` — clean.
- Full vitest — **975/975** (63 files), including the new
  `src/tests/strongholds.test.ts` (13 pins).
- `npm run build` — built in 23.87s, `dist/assets/index-CWlBEhEV.js`.
- kitQa audit over all 24 kit buildings — **0 failures**
  (connectivity, colliders, doors, stairs, scale, roofs,
  reachability).
- Daylight audit over all enclosed buildings — **0 failures**
  (the two open-air decks, `pier_boardwalk` + `tern_fuel_dock`, are
  exempt by design: floored, railed, walkable, not interiors).
- Totals: **24 kit buildings, 21 tagged ground features, 49 prop
  colliders, 63 loot containers, zero duplicate container ids**
  across lighthouse + airbase + sectors.

## What each sector gained

Piece/triangle counts are kit pieces (walls, doors, roofs, details —
the kit's own accounting) and exported-mesh triangles per sector.

### Ridge Redoubt — 66 pieces / 2,584 tris
- **Blast-door bunker** (16×11 concrete): personnel door + shut blast
  bay, entry chicane wall, ops/stores divider, slit windows sized to
  pass the daylight audit (5.0% aperture) without giving up the
  bunker read.
- **Watchtower** (6×6, 3 stories): stairwell with real floor holes,
  glazed cab.
- **Ops canopy** (14×10, 4.4 m clear) on the hardstand.
- Ground: helipad dressing on the surveyed helipad pad, 14 m comms
  mast, two sandbag lines, rock revetment, hardstand feature.

### Convoy Citadel — 98 pieces / 4,336 tris
- **Gate towers** (4×4, 2 stories) flanking the causeway at the
  surveyed gate line, doors facing the road; **toll gantry** spanning
  the centerline with sign + barrier arms.
- **Container fortress**: 7 ground units in a U (back row + two side
  rows), offset tier-2 pair, tier-3 crown — 3-tier stacking per spec.
  Colliders only on ground-tier units (a plan collider has no height
  to give the tiers above).
- **Container office + container store**: the kit's container-room
  factory (12.2×2.9, corrugation ribs, cut door/window openings,
  interior benches/shelves) as enterable rooms.
- **Truck hall** (26×18) on the yard pad: 12.4 m open drive-in mouth,
  two lift frames; the world shop station (242,−202) stands inside
  it, furniture kept clear — station clearance is a test pin.
- Ground: diesel refinery (tank, drum farm, pipe rack), 2 floodlight
  towers.

### Lighthouse Collective — 68 pieces / 3,508 tris
The lighthouse itself is **untouched (protected)**.
- **Radar tower** (5×5, 2 stories) with rotating-dish detail group.
- **Container labs A/B**: container-room factory fitted as labs
  (benches, shelving, loot).
- **Shore shed**: walled canopy by the water. Spawn clearing kept
  open — no kit geometry within the spawn apron.

### Refuge — 90 pieces / 3,378 tris
- **Stone chapel** (13×9, gable): sanctuary + infirmary divided by a
  doored stone wall; three-bed ward in two partition bays (bay mouths
  kept walkable — pinned by the kitQa reachability audit), altar end,
  cross on the east gable.
- **Greenhouses ×2** (12×6): glazed on every face (≥8 window records
  each — test pin), gable glass-tone roofs, grow racks.
- Ground: **palisade ring** (instanced pointed logs, ~1,200 instances
  across Refuge + harbor) with two gates aligned to the road spurs;
  water filtration plant.

### Pier HQ / Hatteras Harbor — 53 pieces / 1,622 tris
- **Boardwalk as a kit building** (44×4): deck floor at 2.3 m on
  piling posts sunk to the channel bed, channel-side railing,
  net crane at the west end, open east entrance. The only kit whose
  footprint deliberately leaves its pad — over water by design,
  pinned by test (shore end on land, west end over the channel).
- **Icehouse** (11×7.5) + **gear shed** canopy.
- Ground: two **workboat slips** (piling rows + cleats), harbor
  palisade closing the landward gap at the road end.

### Tern Rock — 169 pieces / 5,778 tris
- **Three stilt cottages**: open stilt level (posts + under-floor
  obstacles), stair flight to the living floor, south porch deck with
  railing, shed roofs. Story-0 is circulation, story-1 is the home.
- **General store** (12×9): counter, shelving, NPC point behind the
  counter.
- **Marine garage** (11×8): open + shut bays, lift frame.
- **Fuel dock as a kit** (32×3): walks from the beach into the
  sound, drum cache container at the end.

### Ground works (all sectors) — 21 features / 6,586 tris
Tagged `SectorFeature` AABBs (fortress tiers, gantry, refinery,
palisades, slips, helipad, mast, filtration…) so the greeble passes
and future systems have named geometry to work with.

## Discipline held

- Kits are data + shared builders; **zero changes to `kit.ts`**.
- Openings are cuts (lintel + piers), never gaps; roofs are recorded
  pieces that never disappear; every piece is founded or carried.
- Placement pins: footprints inside their surveyed pads (boardwalk +
  fuel dock excepted, over water by design), road clearance ≥10 m
  for every building except the gate towers (flanking by design,
  symmetry pinned), no kit collider within the world crafting
  stations' footprints.
- Proof renders: 18 sheets in this folder (eye-level + overhead per
  sector, plus cottage/dock/greenhouse close-ups), rendered from the
  real TS kits via `tools/export_strongholds.ts` →
  `tools/render_strongholds.py` under the game's midday sun rig.
  Note: at proof exposure the pale container panels and the chapel's
  slate slopes wash toward the sky tone — both were re-verified by
  mesh/OBJ probes (fortress bodies: 58 faces in the side-row volume;
  chapel roof: 284 faces in the roof region). The geometry is what
  the audits measure, and the audits are green.

## Residuals (honest)

- The bunker is a concrete **headhouse**, not a carved tunnel into
  the ridge — the surveyed ridge pad is flat at grade 60 with no
  bluff face to cut into; a tunnel needs a terrain change, which is
  Phase-3 board territory.
- Boat slips are pilings + cleats + colliders with **no walkable
  floor** — boarding a workboat wants a boat first.
- Cottage upper walls follow the shipped watchtower precedent for
  collision (floors + stairs carry the movement contract).
- The lighthouse got no new bracing or dressing — it is the purge's
  sole keeper and stays exactly as Ian left it.
- Kit exteriors are construction-honest, not greebled: panel seams,
  corrugation, and trim are in; the spec's greeble pass (decals,
  clutter, wear) now has real geometry to hang on, per §3.2's intent.
