# NOMAD AAA High-Poly Master Technical PRD: Heavy Prime Mover — 'Nomad Prime' (Western Star 5700 XE Spec)
## Master Photorealistic 3D Asset Creation, SubD Modeling, Fifth-Wheel Kinematics & Dreadnought Tug Specification

**Document ID:** `PRD-VEH-SEMI-NOMADPRIME-AAA-HIGHPOLY-v3.0`
**Target DCC / Pipeline:** Blender 4.2+ (SubD / HardOps / CAD Retopo) ➔ UE 5.4+ (Nanite / Lumen / Chaos)
**Visual Style:** Tactical Nautical / AAA Photorealistic Highway Dreadnought CAD (Western Star 5700 XE meets Optimus Prime / SnowRunner Heavy Haul)
**Primary visual baseline:** `nomad-prime-showcase.png` (Ian, 2026-10-21 — the isometric showcase render; supersedes the earlier fleet-spec sheet where they conflict)
**NOMAD translation (Ty, standing):** same as the Dark Horse PRD — structure, dims, sockets, mod ladder are law; absolute UE5 budgets scale to the browser's honest ceiling; gates don't scale. The PRD's proportions SUPERSEDE the 2026-10-21 fleet-spec sheet (L 8,850 / H 4,120 stack tops / 11,250 kg armored) and the Phase A pack's factory table where they differ; the Phase A deviation log gets revised at build release.

## 1. Mandate & budgets
- SubD cage: 140,000–195,000 pure Catmull-Clark quads; strict quad flow on aero hood, roof fairings, fenders; poles only on flat chassis gussets. Render mesh 2.4M–4.8M tris (browser-scaled). Modeled hex hardware (M16/M20), TRUE geometric diamond-plate lugs, perforated exhaust heat-shield cutouts with wall thickness, brake rotor vanes, air brake canisters, 3D tire siping (Michelin X Works 315/80R22.5).
- Panel gaps: cab shut lines 4.0 mm ± 0.4; hood tilt hinge clearance 6.0 mm arc; micro-chamfer 1.5–2.5 mm on stamped flanges + armor.
- 7 UDIMs @ 40 px/cm: 1001 fascia/hood/aero · 1002 sleeper cab/fairings · 1003 tandem frame/suspension · 1004 powertrain (DD16, Eaton 18-sp, dual 475L saddles) · 1005 stacks/catwalk/fifth-wheel · 1006 cockpit + sleeper quarters · 1007 tactical armor/winch/upgrades.

## 2. Proportions (PRD table)
| | Factory 5700 XE | Nomad Prime |
|---|---|---|
| Wheelbase (steer→bogie center) | 6,250 mm | 6,320 mm |
| Overall length | 8,650 mm | 8,850 mm (incl. boxed ram) |
| Width | 2,550 mm | 2,620 mm |
| Height | 4,050 mm | 4,120 mm (stack tops) |
| Kerb weight | 8,950 kg | 11,250 kg (+2,300 armor/winch/tanks) |
| Payload / 5th-wheel gross | 18,000 / 36,000 kg | 24,000 / **48,000 kg** |
| Powertrain | DD15 505 hp | Tuned DD16 600 hp / 2,780 N·m |
| Transmission | DT12 AMT | HD 18-speed manual + deep reduction |
| Drive | 6x4 | 6x4, inter-axle lock + dual hub reductions |
| Fuel | 750L | 950L (2× 475L, diamond-plate steps) |
| Turning circle | 19.8 m | 20.4 m |
Length budget: nose/hood 2,540 + sleeper cab 2,760 + rear tandem catwalk/turntable 3,550 = 8,850 mm.

## 3. Outliner (structure)
NOMAD_PRIME_ROOT → COL_GEO_CAB_AND_BODYWORK (hood long-nose aero, vertical-louver grille, quad projector pods L/R, flared fenders, high-roof sleeper shell, aero sun visor + 5 amber teardrops, doors, split windshield, sleeper glass, west-coast mirrors) · COL_GEO_CHASSIS_AND_RUNNING_GEAR (boxed C-channel rails, 6 tubular crossmembers, saddle tanks L/R, vertical stacks L/R, diamond-plate catwalk, 50k fifth-wheel turntable, coiled gladhand umbilicals, front leaf/I-beam, rear tandem air-ride, 10 commercial wheels) · COL_GEO_INTERIOR_COCKPIT (wrap dash 15°, digital gauges, dual air-ride captains, 18-speed H shifter + splitter, double sleeper bunk + curtain track, AppBoy dock) · COL_GEO_TACTICAL_MODS (boxed ram, 25-ton hydraulic winch, sleeper louver armor, hub spikes ×10, mesh antenna pod) · RIG (chassis_root CoG (0, 1.150, 0.920); cabin air-ride bone; hood tilt +65° at bumper pivot; steering wheel; steer axle ±36°; tandem bogies D1/D2 with dual inner/outer wheel bones; fifth-wheel slide + pivot; interaxle driveshaft) · SOCKETS: fifth_wheel_kingpin (0, −2.350, 1.280) · gladhand emergency (−0.220, −0.920, 1.480) red · gladhand service (−0.100, −0.920, 1.480) blue · 7-pin (+0.120, −0.920, 1.480) · winch fairlead (0, 4.420, 0.580) · driver eye (−0.580, 1.380, 2.320) · appboy dock (0.140, 1.620, 1.940) · exhaust smoke L/R (±0.980, 0.150, 4.120).

## 4. Modeling manual (condensed line-by-line)
- **Step 1:** metric/mm; blueprint cams L 8,850 / WB 6,320 / W 2,550 / H 4,120; Smooth-by-Angle 38°.
- **Step 2 chassis:** rails from Y +4,200 to −4,250; web 300 mm, flange 90 mm, thickness 10 mm; inner C-liner Y +1,800…−3,600. Six crossmembers (radiator cradle +3,850; bellhousing +1,950; carrier bridge +350; tandem torque −1,550; fifth-wheel bridge −2,350 w/ 12 mm gussets; rear crash −4,250). True M18 hex flange bolts at gussets.
- **Step 3 hood/grille/fenders:** long sloping snout, 8° down-angle; raised cowl spine; side extractor scoops recessed 32 mm. Grille: 18 vertical slats (14 mm thick, 45 mm deep) in satin-charcoal surround; 3D hex bug screen recessed 25 mm behind. Fender inner clearance radius 580 mm; quad LED pods (2 DRL bars + 2 projector globes, polycarbonate lenses). Hood rear lip 22 mm, 3.5 mm gap at firewall.
- **Step 4 sleeper:** firewall/floorpan grid-fill 16×32; high-roof aero fairing sweeping over trailers. Split windshield recessed 15 mm, D-bulb gasket 2.5 mm bead. Sleeper windows: dark privacy glass + interior blinds. Visor projects 180 mm; 5 amber teardrop markers with reflector cups.
- **Step 5 stacks:** Ø180 mm tubes to Z 4,120, 45° slash-cut elbows; heat shields Ø240 mm over lower 1,800 mm, TRUE holes Ø16 mm @ 24 mm staggered pitch (no alpha), 4 band clamps with T-bolts each.
- **Step 6 tanks/catwalk/bogies:** 2× 475L (Ø660 × 1,850 mm), diamond-plate steps over tanks; catwalk 3.0 mm diamond plate, access ladder, line hooks, grab handles. Meritor RT-46-160 axles, Hendrickson PRIMAAX EX air suspension (4 bags, torque rods, shocks).
- **Step 7 fifth wheel:** slider tracks 1,500 mm on rail top flanges, pneumatic slide-lock; cast plate 920×850 mm, flared entry ramps, forged locking jaws w/ grease grooves (2" + 3.5" kingpins); kingpin socket exact (0, −2.350, 1.280).
- **Step 8 tactical:** boxed ram from 12 mm plate, 2,620 mm wide, corners angled back 22°, 2 cast shackles (Ø50 mm pins) through chassis tie-bars; 10 mm AR500 skid plate bumper→front axle; hub spikes 140 mm × Ø45 mm base on all 10 hubs.

## 5. Materials (PRD matrix)
Layer stack: base alloy → epoxy primer → metallic cobalt navy → CARC matte → salt/rust cavity. Cab paint: #1B2A38 + #171C1F, ghosted crimson pinstripes #8B1E1E, clearcoat 0.85 / clearcoat roughness 0.22, micro-flake normal; edge chipping to red primer #5C241E / bare steel #8A9296. Chassis CARC black #121517 roughness 0.58; grease at U-joints, salt crust #C8D1D6. Brightwork chrome metallic 1.0 roughness 0.08 + thermal blue-violet-amber gradient at stack elbows. Interior: black ABS, charcoal stitched leather, satin titanium; displays emissive #203A43 / #ADD461 with scan-line overlay.

## 6. Physics/kinematics (maps to Rapier + carSpec at integration)
Fifth-wheel joint: 6-DOF spring-damper; pitch ±22° (65,000 N·m/rad, damping 8,500), yaw ±95°, roll ±4.5° (120,000 N·m/rad); break 320,000 N / 115,000 N·m. Umbilicals: Verlet chains, Ø90 mm coil, cab bulkhead → trailer manifold, slack dynamic. Telemetry: DD16 2,780 N·m, 18-speed ratios [14.40…0.73], final drive 4.10, torque split equally across 8 drive wheels at 92% driveline efficiency; ram breach math per the PRD reference solver (boxed ram absorbs 65% trauma; breach force = KE(kJ) × 1.8; Titan barricade threshold 450 kN).

## 7. Workshop recipes (Rust Citadel Motorpool / Convoy Rig Forge)
- `mod_prime_boxed_ram_cowcatcher` (Mechanics 4, gantry + arc welder): 12× metal_sheet_hardened, 22× metal_scrap_heavy, 6× bolts_grade8_box, 2× welding_gas (35%), 2× shackles_forged_50mm → +480 kg, front deflection +65%, ram 3.2×, top speed −8 km/h.
- `mod_prime_turntable_50k_sliding` (Mechanics 5, 4-post lift): 1× cast_steel_turntable_plate, 2× pneumatic_slider_rails, 2× gladhand_air_hoses_coiled, 1× electrical_cable_7pin, 8× bolts_grade8_box → towing 48,000 kg (HET-70 lowboy / double-deck hauler / HQ base trailer), sway stability +92%.
- `mod_prime_saddle_tanks_950l` (Mechanics 3, fab table): 6× fuel_can_empty, 14× metal_sheet, 6× copper_tubing, 2× fuel_pump_electric → 500L → 950L, unlocks siphon-refuel of escort vehicles.

## 8. Export checklist
SubD quad integrity on curved panels · flanged shut-lines w/ weatherstrip · ≥1.5 mm bevels · emissive cockpit displays + modeled toggles · AppBoy dock socket live · fifth-wheel/gladhand/winch sockets report transforms · UDIM texel density 40 px/cm verified · watertight manifold.

---
*Source: Ian's Stitch project 8315385372052040679 (screen b5d86d989f5149dd991de8a19a645093 + PRD text + showcase render), dropped 2026-10-21 18:42 EDT: "try again for optimus with this." Governs the Prime rebuild (order #2 vehicle) with the protocol skill.*
