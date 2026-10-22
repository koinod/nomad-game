# NOMAD PRIME — Clean-Sheet Build Report (lane/prime-build)

**Status: BUILD ONLY.** No game integration, no push, no deploy — awaiting Ty's gate.
Built under PRD v3.0 (`design-refs/nomad-prime-prd.md`) + the showcase render as visual
baseline, per the Blender vehicle protocol (micro-briefs, plates-first, mastery gate).
Reproducible: `tools/prime/build_prime.py` (staged 1–4), state in `tools/prime/prime.blend`,
renders via `tools/prime/render_prime.py`, measurements via `tools/prime/verify_glb.py`
(all numbers below are measured FROM the exported GLB, not from build constants).

**Deliverable GLB:** `design-refs/proof-prime/nomad-prime.glb` — 6,032,016 bytes,
227 mesh objects, **151,870 triangles**. Left untracked in git by design (binary);
regenerate any time with the build script, stage 4 exports it.

Axes (house convention, matches the game): X length (nose +), Y width (left +), Z up,
metres, origin at ground centre under the truck.

## Landmark delta table (built vs PRD, measured from the GLB)

| Landmark | PRD (mm) | Built (mm) | Δ (mm) |
|---|---|---|---|
| Overall length | 8,850 | 8,941 | +91 — extremes are the ram-wing swept corner (+4,501) and the rear light bar (−4,440); the ram face itself sits at +4,445 (Δ +20 on the PRD ram plane) |
| Overall width (body) | 2,620 | 2,621 | +1 |
| Overall width (mirrors) | 3,140 | 3,140 | 0 |
| Height (stack tops) | 4,120 | 4,120 | 0 — the elbow exit's top edge is the 4,120 plane, by construction |
| Wheelbase (steer → bogie centroid) | 6,320 | 6,320 | 0 |
| Steer axle | +3,800 | +3,800 | 0 |
| Drive axles | −1,860 / −3,180 (spread 1,320) | −1,860 / −3,180 | 0 |
| Kingpin socket | (−2,350, z top 1,280) | (−2,350, z 1,280) | 0 |
| Fifth-wheel plate | 920 × 850, top 1,280 | 920 × 850 × 52, centre z 1,252, top 1,278 | −2 (rounding in pedestal stack) |
| Ram face plane | +4,425 | +4,445 | +20 (bar stock 170 deep vs PRD's implied ~150) |
| Tire 315/80R22.5 — carcass Ø | 1,076 | 1,076 | 0 |
| Tire — lug-tip Ø | — | 1,120 | tread lugs protrude 22 (real lug height); wheel pivots sit at carcass radius 538, so lugs bite 24 into the ground plane — reads as tire squat, standard |
| Fuel capacity | 950 L (2 × 475) | 2 tanks Ø660 × 1,850 envelope | per Phase A pack geometry |
| Ground clearance (min, skid) | — | z −30 point is a tread lug tip; lowest hard part (ram skid) +50 | — |

Phase A reconciliation (old fleet sheet vs PRD) and the one unsatisfiable
combination (factory BA 1,270 vs PRD WB/spread) are documented in `LANDMARKS.md`;
where they conflicted, the PRD won.

## Anchor table (measured FROM the finished model — for integration)

| Anchor | Position (m) | Notes |
|---|---|---|
| Wheel_Steer_Left / Right | (+3.800, ±1.100, 0.538) | pivot empties, spin about Y |
| Wheel_Drive_Axle1_Left_Outer / Inner | (−1.860, +1.100 / +0.765, 0.538) | dual pair; right side mirrored (−) |
| Wheel_Drive_Axle2_Left_Outer / Inner | (−3.180, +1.100 / +0.765, 0.538) | dual pair; right side mirrored (−) |
| driver_seat | (+1.300, +0.580, 1.550) | hip anchor; cushion top surface at z 1.400 |
| passenger_seat | (+1.300, −0.580, 1.550) | |
| driver_eye | (+1.380, +0.580, 2.320) | |
| sleeper_bunk_rest_point | (−0.420, 0.000, 1.700) | bunk surface 1.640 + mattress |
| trailer_hitch_fifth_wheel | (−2.350, 0.000, 1.280) | plate top plane |
| fifth_wheel_kingpin | (−2.350, 0.000, 1.280) | **trailer socket — the P4 trailer work keys off this** |
| headlight_left/right_projector | (+4.330, ±0.880, 0.980) | |
| winch_fairlead | (+4.440, 0.000, 0.580) | |
| appboy_dock | (+1.620, +0.140, 1.940) | dash dock mount |
| exhaust_smoke_L / R | (+0.040, ±1.260, 4.030) | at the elbow exits |
| gladhand_service / emergency | (−0.920, −0.100 / −0.220, 1.480) | coil geometry also modeled |
| electrical_7pin | (−0.920, +0.120, 1.480) | |
| Overall bounds | X −4.440..+4.501, Y ±1.570, Z −0.030..+4.120 | min-Z point is a lug tip (see tire note) |

Seat anchor objects `SeatDriver` / `SeatPassenger` are also exported at the seat
positions for rigging convenience. Node names in the GLB carry no prefix
(`driver_seat`, `fifth_wheel_kingpin`, `Wheel_Steer_Left`, …); grouping empties
`COL_GEO_*` mirror the PRD §2 collection layout under root `NomadPrime`.

## Mastery gate evidence

- **Cage audit** (printed by the build): HoodShell 362 v / 400 f = 320 quads + 80 tris;
  BodyShell identical. The ONLY triangles are the end-cap fans; all loft barrels are
  clean Catmull-Clark quads, poles confined to the caps (flats). Two-loft construction:
  the hood is its own shell with a shut line at the firewall (PRD panel gap), the cab
  loft's front stations form the windshield slope.
- **Zebra** (`zebra_side.png`): band flow is continuous across hood/cab/fairing —
  even spacing on the flanks, smooth compression over the fairing crown, no kinks at
  the windshield slope or A-pillars.
- **Silhouette** (`contact_sheet.png`, `studio_side.png`): long-nose conventional
  proportions match the showcase — defined cowl break, sloped split windshield under a
  visor, 68″ sleeper, vertical stacks with elbows, tandem drives, fifth-wheel deck.
- **Apertures are real cuts** (EXACT booleans), glass is a separate alpha material —
  the Seahawk lesson applied: no film over paint. Windshield/door/sleeper glass all
  sit in true openings; the driver is visible seated through them in-game.
- **True geometry where the PRD demands it**: diamond plate is modeled lugs
  (1,400+ per deck panel), stack shields are ring-and-rib construction with real open
  slots, tread is 80 modeled chevron blocks per tire, grille is 18 separate slats.
- **Interior is complete**: dash with emissive gauge cluster + centre screen, AppBoy
  dock, tilting steering wheel on a column, two captain chairs at the anchors,
  18-speed shifter, pedals, bunk + curtain + lockers (`studio_interior.png` is a
  cutaway proof — shells hidden so the cockpit reads).

## Honest residuals

1. **Hood crown is rounder than the showcase's** — the showcase hood is flatter-topped
   and more squared at the nose; built hood reads slightly domed in profile. Shape is
   right, crispness is ~90%.
2. **Roof fairing reads bulbous from the rear ¾** — smooth and continuous, but fuller
   than the showcase's tighter fairing.
3. **Hex grille screen is a plain dark panel**, not geometric hex mesh (the 18 chrome
   slats in front of it carry the read). Geometric hex = a later detail pass.
4. **Tire sidewalls are lathe-clean** — no raised lettering/siping; tread lugs are
   chevron blocks, not a molded pattern.
5. **Lettering** ("NOMAD PRIME" / "HEAVY HAUL UNIT - 01") is flat mesh text on the
   sleeper flanks; from a pure side view the stack occludes the first letter — true in
   the showcase layout as well.
6. **Stack base cans** at the deck (Ø176 × 300) are the pipes' lower mount cans —
   plain cylinders, no flange detail.
7. **Interior framing in the proof render** is dash-forward; the steering wheel reads
   at frame edge. The full cockpit geometry is in the GLB regardless.
8. **No overlay diff was run against `plate_side.png`** — that plate is the OLD fleet
   sheet (WB 5,575) which the PRD supersedes; an overlay would measure PRD-vs-old
   differences, not build error. The plate-vs-PRD deltas are tabulated in
   `LANDMARKS.md` instead. A showcase-silhouette overlay needs a matched orthographic
   side render of the showcase image, which doesn't exist (it's a perspective render).
9. Poly count is 151,870 tris — smooth-first per the standard; an LOD pass belongs
   to integration, not this build.

## Files

- `tools/prime/build_prime.py` — staged parametric build (wheels → chassis/tanks/stacks →
  body/glass/front → decks/fifth → interior/markers/export)
- `tools/prime/render_prime.py` — studio/clay/zebra proof renders
- `tools/prime/verify_glb.py` — independent GLB measurement (source of every number above)
- `tools/prime/prime.blend` — saved build state (8 MB)
- `design-refs/proof-prime/contact_sheet.png` — 6-view sheet (front ¾, side, rear ¾,
  deck, interior cutaway, zebra side) + individual renders alongside
- `design-refs/proof-prime/LANDMARKS.md`, `phase-a-pack.md`, `phase-a-landmarks.json`,
  `plate_*.png` — the Phase A starting pack and the PRD reconciliation
