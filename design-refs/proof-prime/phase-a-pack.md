# NOMAD PRIME — Protocol Rebuild, PHASE A (reference pack)

Status: **COMPLETE 2026-10-21 · Phase C geometry ON HOLD** (sequence order from
Ty/Ian: Stallion is protocol build #1, Prime is #2 — this pack waits for the
Stallion pilot's acceptance numbers, which set the bar this build is measured
against).

Method: `~/workspace/custom-skills/local-blender-vehicle-protocol/SKILL.md`
(Phases A–E). Canon spec: `design-refs/fleet-specs/nomad-prime-semi.md`
(Ian, 2026-10-21) + his concept render `design-refs/fleet-specs/nomad-prime-semi.png`.
Quality bar: the human-modeled GT500 already in game — surface sheen and
proportion truth, not measured-box assembly.

Deliverables in this folder:

| File | What it is |
| :--- | :--- |
| `plate_side.png` | Dimensioned side plate: TARGET silhouette (blue) vs CURRENT GLB measured outline (red dashed, stepped from per-part world bboxes) |
| `plate_front.png` | Dimensioned front plate (target) |
| `plate_rear.png` | Dimensioned rear plate (target) |
| `landmarks.json` | Machine-readable landmark table (contract-frozen / factory / target / current) — Phase E verifies against this file |
| `make_plates.py` | Plate generator (re-runnable: `python3 make_plates.py`) |

Axes: game GLB space — nose +X, origin at ground under vehicle centre.
(Blender authoring: nose +X, left +Y, up +Z; glTF export converts.)

---

## 1. Sources & license ledger (protocol Phase A.4)

| Source | Used for | License / terms |
| :--- | :--- | :--- |
| Ian's fleet spec sheet + concept render (in-repo, `design-refs/fleet-specs/`) | Identity, colours (#171C1F / #1B2A38 + crimson pinstripes), door lettering "NOMAD PRIME / HEAVY HAUL UNIT - 01", equipment list | Ian's own project material |
| Western Star 5700XE Tech Sheet (manufacturer publication; copy at static.bidadoo.com, `5700XETechSheet.pdf`) | BBC 126″, BA 50″, WB up to 250″, tank Ø25″ 60–150 gal, grille/bumper/headlight construction notes | Manufacturer reference — consulted, not redistributed |
| Western Star Bodybuilder Book Rev 3.2, Ch. 7 "Cab Data" (manufacturer publication; copy at manuals-free.com, `07cabdata_mar2020.pdf`) | Sleeper exterior width 96.00″, sleeper lengths 34/40/54/68/82″, Stratosphere sales codes (68″ High Roof = 682-070), glass dims (windshield glass height 24.25″, door window 20.75×26.75″, centre post 2.00″), interior cab dims | Manufacturer reference — consulted, not redistributed |
| Ritchie Bros auction listings for 2018–2022 5700XE tractors (rbauction.com) | Real-world build distribution: WB 222–240″, sleepers 54/60/68/72/82″, tyres 11R22.5 / 12R22.5, DD16 600 hp exists in this chassis | Listing facts only; no images taken |
| Poly Haven / ambientCG | Phase D texture sets + studio/outdoor HDRIs for Phase E QA | CC0 — itemise exact assets at download time in the Phase D report |
| Sourced/generated meshes | **None.** Every part is hand-built in Blender (project rule: no paid models; no generator output passes the hard-surface gate per the research) | — |
| Badging | The truck wears **NOMAD PRIME** fictional branding only. No Western Star marks, no "5700XE" badging — mesh reference ≠ vehicle trademark rights (protocol A.4) | — |

Ian's concept render is the *styling* reference (tall louvered grille, panoramic
glass, full-height aero sleeper, polished tanks, deep-dish wheels). It is an
isometric concept, not an ortho plate — the plates in this pack are drawn from
the reconciled dimensions below, and Phase C traces against them + the concept.

## 2. Integration contract — FROZEN anchors (measured from the current GLB)

The swap must be drop-in for `fleetIntegration` (`src/game/primeDef.ts`,
`src/game/Vehicles.ts`, `src/game/Player.ts` CAR_SEATS, `src/tests/`). All
values measured from `public/models/nomad-prime.glb` on 2026-10-21 (Blender
dump; lateral = Blender Y, + = vehicle left):

| Anchor | Value |
| :--- | :--- |
| Origin / orientation | Ground under centre; nose +X; root object `NomadPrime` |
| Overall envelope | Def L 8.55 × W 2.55; physics collider half [1.27, 0.45, 4.30] |
| Wheel pivots (EMPTY, axle-centre origin, geometry centred on pivot) | `Wheel_Steer_Left/Right` x **+2.60**, lat ±0.95, h 0.525 |
| | `Wheel_Drive_Axle1_*` x **−2.35**; `Wheel_Drive_Axle2_*` x **−3.60**; outer lat ±0.985, inner lat ±0.665, h 0.525 |
| Tyre | OD **1.05** (radius 0.525 = CarPhysics `wheelRadiusM`), steer width 0.32 |
| `driver_seat` marker | (0.42, +0.62, 1.62) — loader reads world pos → seat anchor |
| `passenger_seat` marker | (0.42, −0.62, 1.62) |
| CAR_SEATS `nomad_prime` | cushionY **1.40**, floorY **1.14**, roofY **3.40** (interior, over the seats) |
| `headlight_left_projector` / `_right_projector` | (4.02, ±0.90, 1.33) — spotlights seat on these |
| `trailer_hitch_fifth_wheel` | (−2.90, 0, 1.30) |
| `sleeper_bunk_rest_point` | (−1.55, 0, 1.62) |
| Names | All object names above are looked up by string — keep them byte-identical |

Current GLB reference numbers: overall X −4.252…+4.212 (L 8.464), body
±1.25–1.275, mirrors to ±1.57, max height 3.919 (stack area), 36,600 tris,
369 mesh objects, 25 materials.

## 3. Landmark table — TARGET (what Phase C builds to)

Factory = Western Star published data. The game truck's axle and seat stations
are contract-frozen (§2), so two factory figures are knowingly deviated and the
proportion fix is achieved by redistributing the body around the frozen
stations — see the deviation log (§4) before judging any single row.

| Landmark | Target | Source |
| :--- | :--- | :--- |
| Overall length | 8.55 (nose +4.28 / tail −4.27) | CONTRACT (def) |
| Body width | 2.44 (fenders ≤ 2.50; mirrors to ±1.57 as current) | FACTORY 96″ sleeper/cab width |
| Bumper face → steer axle (BA) | 1.68 as-frozen (factory 1.27 — deviated, §4) | CONTRACT |
| BBC (bumper → back of cab) | 3.93 (factory 3.20 — deviated, §4) | DERIVED |
| Wheelbase steer → tandem centroid | 5.575 (factory builds 5.64–6.10) | CONTRACT |
| Tandem spread | 1.25 (factory ~1.32) | CONTRACT |
| Tyre OD / width | 1.05 / steer 0.32, duals 0.28 ea | CONTRACT ≈ FACTORY 11R22.5 (1.054) |
| Frame rail top | 1.02 | current GLB (real Class-8 ≈ 1.0–1.1) |
| Cab floor top | 1.14 | CONTRACT (CAR_SEATS) |
| Seat cushion top | 1.40 | CONTRACT (CAR_SEATS) |
| Fifth-wheel plate | Ø 0.95, top 1.28, centre x −2.90 (marker 1.30) | CONTRACT + current GLB |
| Catwalk deck | z 1.06, x −4.05…−1.45 (exposed aft of sleeper) | DERIVED |
| Fuel tanks | Ø 0.64 cylinders, centre z 0.62, x −0.95…+0.95, both sides (2 × 475 L per spec) | FACTORY Ø25″ + SPEC capacity |
| Grille | face x +4.24, z 0.60…1.66, width 1.34, vertical louvers | Ian's concept + FACTORY construction |
| Bumper | boxed push ram (spec equipment), face +4.28, band z 0.45…1.05 | SPEC |
| Hood | grille→cowl length 2.78; top z 1.62 at nose rising to 1.88 at cowl (x +1.50) | DERIVED from concept + factory stance |
| Windshield | base z 1.90 at x +1.50 → top z 2.74 at x +1.14; glass height 24.25″ class; two-piece, 2″ centre post; base width 2.06 | FACTORY glass data |
| Beltline (door glass bottom) | z 2.02; door glass z 2.06…2.66; door span x +0.50…+1.45 | FACTORY door window 20.75″ |
| Cab roof (front) | z 3.02 | DERIVED (interior roofY 3.40 is over the sleeper cab zone) |
| Sleeper | 68″ class: span x +0.35…−1.38 (depth 1.73); roof z 3.47; side window z 2.15…2.60 | FACTORY 68″ Stratosphere |
| Roof fairing | continuous sweep cab roof 3.02 → 3.47, peak station x −0.30 — one surface with the sleeper, no step, no wedge | Ian's concept (current wedge + 3.88 hump is the defect) |
| Sun visor | aero visor integrated at header, z 2.90…3.02, 5 amber markers | SPEC + concept |
| Exhaust stacks | Ø 0.15, x +0.25 (back-of-cab corners), lat ±1.22, tips z 3.85, heat shields + clamps | SPEC (twin chrome stacks) + current GLB stations corrected forward |
| Mirrors | aero dual-glass, tips lat ±1.57, z ~2.35…2.81 | current GLB (kept) |
| Rear underrun / mudflaps | underrun z 0.45 at tail; flap bottoms z 0.12 | Class-8 practice |
| Colours | paint #171C1F (gunmetal) + #1B2A38 (cobalt slate), crimson pinstripes, polished tanks, "NOMAD PRIME / HEAVY HAUL UNIT - 01" door lettering | SPEC (canon) |

## 4. Deviation log — current GLB vs target (the "LEGO truck" diagnosis, quantified)

Measured from the current GLB (per-part world bboxes, 2026-10-21):

| # | Defect | Current | Target / factory | Δ |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Cab+sleeper is ONE slab shell, 3.78 long — no cab/sleeper read | shell x −2.20…+1.58 | cab back +0.35, sleeper back −1.38 | sleeper zone shrinks ~0.85 |
| D2 | Sleeper too deep | back at −2.20 (≈2.2–2.6 deep zone) | 1.73 (68″) | −0.5…−0.85 |
| D3 | Roof fairing humps to 3.88 with a floating visor slab (visor z 2.99…3.24, detached read) | peak 3.88 | 3.47 continuous sweep | −0.41 |
| D4 | Hood reads stubby: 2.44 long and crown up to 2.10 (too tall for its length) | 2.44 / 2.10 | 2.78 / 1.88 | +0.34 long, −0.22 crown |
| D5 | Windshield glass z-span 1.99…2.98 (0.99) — over-tall, near-upright slab | 0.99 | ~0.70 projected, raked, 24.25″ glass | −0.29 |
| D6 | Exposed frame aft of sleeper only ~2.05; fifth wheel crowds the sleeper | catwalk −4.10…−2.30 | catwalk −4.05…−1.45 (2.60 exposed) | +0.55 working deck |
| D7 | Stacks mounted mid-sleeper (x −0.37…−0.19) instead of back-of-cab | x ≈ −0.28 | x +0.25 | +0.53 forward |
| D8 | Front overhang 1.61 vs factory BA 1.27 — **frozen** (steer station is a physics anchor); the fix is D4's longer, lower hood mass, not moving the axle | 1.61 | 1.68 as-frozen | documented, accepted |
| D9 | BBC ≈ 4.16 vs factory 3.20 — **frozen consequence** of the seat anchor (driver_seat x +0.42); target 3.93 is the best legal redistribution | ~4.16 | 3.93 | −0.23 |
| D10 | Materials read flat: no clearcoat, uniform roughness (measured material list is colour-only Principled) | 25 flat mats | protocol Phase D set | sheen gap = the GT500 gap |

Diagnosis in one line: the current truck's *stations* are right and its
*masses* are wrong — too much sleeper, too little hood, roof 0.4 too proud,
glass over-tall — assembled from flat-shaded boxes with no clearcoat. Phase C
fixes masses first, surfaces second, materials third.

## 5. Per-part route table (protocol Phase A.3 / C)

All parts **hand-built** (Blender Python, subdivision + bevel discipline,
mirror symmetry). Build order = critic order; each part renders and passes its
critic before the next starts (Phase C loop). Wheels are never built with the
body (protocol rule).

| # | Part | Route | Construction notes / gate |
| :--- | :--- | :--- | :--- |
| 1 | Chassis: frame rails, crossmembers, axles, driveshaft, battery/DEF boxes | hand-built | rails top z 1.02; visible only in gaps — keep honest, low detail OK |
| 2 | Wheels ×10 (ONE parametric build, instanced) | hand-built parametric | tyre: lathe profile + arrayed tread blocks, sidewall bump (Phase D); rim: deep-dish steel per concept, hub + 10 lugs, brake disc behind; steer variant + dual variant from one master; stations per §2 exactly |
| 3 | Hood + fenders + grille + bumper | hand-built | lofted sections along the hood line (1.62→1.88), grille = recessed louver stack (geometry), projector headlight clusters at the frozen marker seats, boxed ram bumper per spec; silhouette gate vs plate 1 |
| 4 | Cab shell (firewall→back of cab) | hand-built | subdivision shell, panel gaps as geometry (door seams inset), cowl at x +1.50, back of cab +0.35 |
| 5 | Sleeper + roof fairing | hand-built | one continuous fairing surface 3.02→3.47; sleeper depth 1.73; side window apertures cut, not decals |
| 6 | Glass set | hand-built | windshield pair + door glass + sleeper glass; alpha-glass standard (project choice, per Seahawk precedent — NOT transmission; stated per protocol D) |
| 7 | Interior (visible through glass) | hand-built | cab floor 1.14, captain chairs at seat markers (cushion top 1.40), dash + wheel, sleeper bunk at rest point, lockers — parity with current interior scope, re-proportioned to new cab |
| 8 | Tanks + steps + toolboxes | hand-built | Ø 0.64 polished cylinders, straps, diamond-plate steps (Phase D texture), spec's chassis tool compartments |
| 9 | Stacks + air cleaners | hand-built | Ø 0.15 chrome, heat-shield perforation via texture, elbows to cab-back corners x +0.25 |
| 10 | Fifth wheel + catwalk + umbilicals | hand-built | plate Ø 0.95 top 1.28 on the frozen marker, diamond-plate catwalk z 1.06, red/blue coiled lines (curve geometry) |
| 11 | Details: mirrors, visor + 5 markers, mudflaps, lights, lettering + pinstripes | hand-built + canvas textures | lettering/pinstripe as authored textures (no baked shadows); light lenses = glass shell + emissive internals (protocol D) |
| 12 | Materials pass (Phase D) | CC0 textures | clearcoat 1.0 / clearcoat-roughness 0.01–0.05 paint, varied roughness + grunge, tyres dark grey 0.8–0.9 + sidewall bump, polished metal tanks/stacks |

## 6. What Phase C/E will be held to (preview of the gates)

- Silhouette first: side render vs `plate_side.png` at matched scale.
- Proportions within 2% of `landmarks.json` targets; wheel stations within
  5 mm of §2 anchors (they are exact — anchors are placed, not modelled).
- The Stallion pilot's acceptance numbers, once Ty publishes them, override
  any looser reading of the above.
- Phase E: Cycles contact sheet under studio **and** outdoor HDRI, six views
  + glossy-clay set; pinch check on the cab/sleeper shell.
- GLB stays untracked until Ty's gate; this Phase A pack is the only commit
  on this lane until release.
