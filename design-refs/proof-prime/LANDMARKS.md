# NOMAD PRIME — Clean-Sheet Build Landmarks (reconciled)

Axes (house): X = length, nose +X · Y = width, left +Y · Z = up. Metres.
Origin: ground under vehicle centre. Sources: **PRD** = nomad-prime-prd.md v3.0
(governs on conflict) · **PA** = Phase A pack (phase-a-pack.md /
phase-a-landmarks.json, factory 5700XE data) · **SC** = showcase render ·
**DER** = derived in reconciliation (logged below).

## Governing dimensions (PRD)

| Landmark | Value (m) | Source |
| :--- | :--- | :--- |
| Overall length (incl. boxed ram) | 8.850 → x +4.425 … −4.425 | PRD §2 |
| Wheelbase steer → bogie centroid | 6.320 | PRD §2 |
| Width (overall = ram face width) | 2.620 | PRD §2 + §4 Step 8 |
| Body/cab width | 2.550 blueprint; cab shell 2.50, sleeper 2.44 (96″) | PRD Step 1 + PA factory |
| Height (stack tips) | 4.120 | PRD §2 |
| Armored mass | 11,250 kg (report datum) | PRD §2 |
| Length budget: nose/hood 2.540 + sleeper cab 2.760 + rear 3.550 | = 8.850 | PRD §2 |
| Tire | Michelin X Works 315/80R22.5 → OD 1.076 (r 0.538), width 0.315 | PRD §1 |
| Fuel | 2 × 475 L, tanks Ø 0.660 × 1.850 | PRD §4 Step 6 |
| Kingpin socket | (−2.350, 0, 1.280) | PRD §3 sockets |
| Fifth-wheel plate | 0.920 × 0.850, top z 1.280 | PRD Step 7 |
| Stacks | Ø 0.180 to z 4.120; shields Ø 0.240, lower 1.800, TRUE holes | PRD Step 5 |
| Paint | #1B2A38 + #171C1F, crimson #8B1E1E, clearcoat 0.85 / cc-rough 0.22 | PRD §5 |

## Stations (house X)

| Station | x (m) | Note |
| :--- | :--- | :--- |
| Ram face | +4.425 | overall front |
| Grille face | +4.280 | 18 vertical slats, z 0.60…1.66, width 1.34 (PA) |
| Steer axle | +3.800 | tire front edge 4.338 — 87 mm behind ram face |
| Cowl / firewall | +1.885 | hood top z 1.88 here, 1.60 at nose (8° spine) |
| Back of cab | +0.855 | cab depth 1.030 |
| Sleeper | +0.855 → −0.875 | 68″ class, depth 1.730 (PA factory) |
| Bogie axles | −1.860 / −3.180 | spread 1.320, centroid −2.520 |
| Kingpin | −2.350 | 0.170 ahead of bogie centroid (heavy-haul practice) |
| Rail ends | +4.200 / −4.250 | PRD Step 2 |
| Tail | −4.425 | rear underrun + mudflaps |

WB check: 3.800 − (−2.520) = **6.320** ✓ · Length budget check: ram→firewall
2.540 + cab/sleeper 2.760 + rear 3.550 = 8.850 ✓

## Key heights / laterals

| Item | Value |
| :--- | :--- |
| Frame rail top / web / flange | z 1.020 / 0.300 / 0.090 wide, 0.010 thick, outer lat ±0.450 |
| Cab floor top / seat cushion top | z 1.140 / 1.400 (PA factory) |
| Driver seat anchor / eye | (1.330, +0.580, 1.400) / (1.380, +0.580, 2.320) (PRD socket) |
| Windshield | base (1.885, z 1.920) → top (1.500, z 2.740), split, 50 mm centre post (PA glass) |
| Door glass / door span | z 2.060…2.660 / x +0.900…+1.800 (PA factory) |
| Cab roof front / fairing peak / sleeper roof | z 3.020 / 3.600 @ x −0.30 / 3.550 |
| Stacks | x +0.200, lat ±1.260, shields z 1.300…3.100 |
| Tanks | centre (−0.200, ±0.940, 0.620) |
| Catwalk deck | z 1.060, x −1.450…−4.050, diamond plate (TRUE lugs) |
| Drive duals | outer centre lat ±1.100, inner centre ±0.765 (20 mm dual gap) |
| Mirrors | tips lat ±1.570 (PA, kept) |

## Reconciliation log (PRD vs Phase A — PRD wins)

1. **Length/WB/height/width**: PA pack targeted the superseded fleet sheet
   (L 8.55, WB 5.575, fairing 3.47). PRD v3.0 supersedes (L 8.850, WB 6.320,
   H 4.120 at stack tips) — build follows PRD. The old "frozen" integration
   contract was already VOIDED by Ian (commit 25873e1); anchors are
   re-measured from this model (see BUILD_REPORT anchor table).
2. **Axle stations (DER)**: PRD pins WB 6.320 + kingpin −2.350 + tire OD
   1.076 + rails +4.20/−4.25 but never stations the axles. Solved: steer
   +3.800 (tire clears ram face), bogie centroid −2.520 → fifth wheel rides
   170 mm ahead of centroid. Factory BA 1.27 (PA) is NOT satisfiable with
   PRD WB + kingpin simultaneously — PRD numbers kept, BA deviates (1.15
   bumper→steer). Logged, not hidden.
3. **Width**: PRD table 2.620 = ram width (Step 8); Step 1 blueprint 2.550
   = body. Both satisfied (ram 2.620, fenders ≤ 2.550).
4. **Surviving PA factory data**: 68″ sleeper depth, glass dims + 2″ centre
   post, tank Ø class, rail top 1.02, floor 1.14, cushion 1.40, mirror
   reach ±1.57, fifth-wheel top 1.28.
5. **Glass**: alpha-glass project standard (PA route table; NOT
   transmission) — stated per protocol Phase D.
6. **Stacks forward**: PA deviation D7 already moved stacks from
   mid-sleeper to back-of-cab corners; PRD smoke socket (y +0.150) agrees:
   stacks at x +0.200 flanking the sleeper front.
