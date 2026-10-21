# NOMAD AAA High-Poly Master Technical PRD: The Stallion / Mustang Dark Horse Interceptor
## Master Photorealistic 3D Asset Creation, SubD Modeling, Nanite Architecture, Procedural Rigging & Combat Mod Specification

**Document ID:** `PRD-VEH-MUS-DARKHORSE-AAA-HIGHPOLY-v3.0`
**Target DCC / Pipeline:** Blender 4.2+ (Subdivision Surface / HardOps / CAD Retopo) ➔ Unreal Engine 5.4+ (Nanite / Lumen / Chaos Vehicles / Control Rig)
**Visual Style:** Tactical Nautical / High-Poly Cinematic Combat CAD (Mad Max Interceptor meets Cyberpunk / Modern Warfare Ground War)
**Referenced Visual Baselines:**
- **Pristine Factory Baseline (2026 Mustang Dark Horse FX / S650 Platform):** saved plate `darkhorse-factory-baseline.png` (Ian, 2026-10-21) + earlier Dark Horse reference images
- **Combat Interceptor Evolution (Ram Bumper, Louvers, Armor, Roof Pintle):** Stitch screens
- **Architectural Context & Environment:** Stitch screens

**NOMAD translation (Ty, standing):** the PRD targets UE5; NOMAD runs the browser stack. Every structural element carries over — SubD discipline, modeled (not textured) detail, flanged seams, the full interior, sockets, the Stage 0→1→2 mod ladder (which matches the game's existing upgrade-morph canon). Absolute budgets (1.2–2.8M tris, 6× 8K UDIMs) scale to the highest the browser honestly holds per Ian's acknowledged ceiling; the PRD's gates (silhouette, proportions, modeled detail, clearcoat sheen) do not scale down.

---

## 1. Executive Summary: The AAA High-Poly Mandate

This PRD establishes the definitive engineering and modeling guide to rebuild **"The Stallion" (2026 Ford Mustang Dark Horse / Dark Horse Interceptor)** in **Blender 4.2+**: a fully articulated, subdivision-ready cinematic hero vehicle with millimeter-accurate mechanical topology, physical clearances, interior instrumentation, engine plumbing, and modular combat retrofits. No low-poly budgets, no flat-shaded compromises, no baked fake bevels.

### 1.1 Geometry & Budget Specifications
* **Base Mesh Cage (SubD Level 0):** 95,000 – 135,000 pure quads. Strict Catmull-Clark quad topology (zero ngons or non-manifold poles on deformable/curved panels; max 5-pole junctions restricted to flat planar transitions).
* **High-Poly Mesh (Baked / Viewport L2 / Render L3):** 1,200,000 – 2,800,000 triangles. Fully modeled sheet metal flanges, door shut lines (hemmed inner sheet lips), stamped subframe crossmembers, true geometric hex bolts (M8/M10), modeled carbon weave, 3D radiator core finning, disc brake rotor ventilation vanes, molded tire sidewall siping and tread blocks.
* **Tolerance & Clearance Metrics:**
  - Exterior panel gaps: `3.5 mm ± 0.3 mm` (hood, fenders, doors, decklid).
  - Door jamb weatherstrip: continuous D-bulb profile, `2.0 mm` compression clearance.
  - Micro-chamfer rule: minimum physical bevel radius `1.2 mm – 2.0 mm` on all sheet metal stamped edges for specular highlight catch.

### 1.2 Multi-UDIM 8K/4K PBR Texture Architecture — 6 tiles @ 40.0 px/cm
1. **1001 — Unibody Chassis & Exterior Sheet Metal:** hood, roof, quarters, doors, decklid, factory fascias.
2. **1002 — Aerodynamics, Carbon Fiber & Glass:** splitter, rear wing + Gurney flap, hood extractor louvers, side skirts, lenses, rear glass.
3. **1003 — Powertrain & Running Gear:** Coyote Gen-4 V8, dual throttle bodies, intake, Tremec TR-3160, MagneRide dampers, Brembo 6-piston calipers, 2-piece floating rotors.
4. **1004 — Cockpit Interior & Electronics:** Recaro buckets, 12.4" + 13.2" curved driver display, AppBoy magnetic console dock, roll cage, steering wheel with Dark Horse badge.
5. **1005 — Stage 1 / Stage 2 Combat Modifications:** AR500 push ram, anti-husk wedge spikes, ballistic windshield louvers, bolt-on door armor, rear armor crash bar + Class IV receiver.
6. **1006 — Rooftop Pintle Turret & Weaponry:** 360° ball-bearing swivel ring, MG mount, feed chute, 200-round 7.62 ammo drum, casing deflector, reflex sight.

---

## 2. Vehicle Archetype Matrix: Factory Dark Horse ➔ Wasteland Interceptor

```text
                           [STAGE 0: DARK HORSE FACTORY BASELINE]
                      (2026 S650 Fastback, 5.0L Coyote V8, 500 HP, RWD)
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        [STAGE 1: HIGHWAY INTERCEPTOR]                    [STAGE 2: APEX DUST INTERCEPTOR]
   (Boxed AR500 Ram, Windshield Louvers,             (+3.5" Rally Lift, Roof Pintle Gun,
    Kevlar Door Inserts, Class IV Hitch)              Offroad Mud-Terrains, Supercharger Cowl)
```

| Parameter | Baseline Dark Horse | Stage 1: Highway Interceptor | Stage 2: Apex Dust Interceptor |
| :--- | :--- | :--- | :--- |
| **Platform / Chassis** | Ford S650 Unibody Coupe | Reinforced Unibody + AR500 Subframe | Lifted Rally Chassis + Full DOM Rollcage |
| **Wheelbase** | 2,718 mm | 2,718 mm | 2,745 mm |
| **Track Width (F / R)** | 1,582 / 1,656 mm | 1,600 / 1,675 mm (+10mm spacers) | 1,740 / 1,790 mm (Baja wide-track) |
| **Kerb Weight** | 1,795 kg | 2,180 kg (+385 kg) | 2,390 kg (+595 kg) |
| **Ground Clearance** | 135 mm | 145 mm | 240 mm (3.5" long-travel lift) |
| **Powertrain** | 5.0L Gen-4 Coyote NA V8 (500 hp) | Tuned Coyote + high-flow exhaust | Supercharged Coyote (720 hp) |
| **Peak Torque** | 567 N·m @ 4,900 | 610 N·m @ 5,100 | 840 N·m @ 4,200 |
| **Top Speed** | 275 km/h | 230 km/h (drag penalty) | 195 km/h (gearing/tires) |
| **Offroad Rating** | 0.18 | 0.45 | 0.88 |
| **Frontal Ram Defense** | 15% | 75% (AR500 spiked push bumper) | 85% (hydraulic dampened ram) |
| **Hitch Rating** | None | Class IV (4,500 kg) | Class IV + winch retrieval box |

---

## 3. Blender Scene Hierarchy & Outliner Architecture

```text
MUSTANG_DARKHORSE_ROOT [origin (0,0,0)]
  ├── [COL_GEOMETRY_STAGE0_BASE]
  │     ├── EXT_Unibody_Shell (A/B/C pillars, roof, rear fenders, floorpan)
  │     ├── EXT_Doors_Flanged (L/R, interior handles & hinges)
  │     ├── EXT_Hood_DarkHorse (dual heat extraction nostrils, cowl lines)
  │     ├── EXT_Front_Fascia_DarkHorse (gloss black trapezoidal grilles, chin splitter)
  │     ├── EXT_Rear_Fascia_Diffuser (quad exhaust tips, diffuser strakes)
  │     ├── EXT_Rear_Wing_GurneyFlap (carbon pedestal track spoiler)
  │     ├── EXT_Glass_Laminated (windshield, quarter glass, rear window, headlights, tri-bar LEDs)
  │     ├── INT_Cockpit_Recaro (dual sport seats, 6-point harnesses, shift knob)
  │     ├── INT_Dashboard_CurvedCluster (12.4" cluster + 13.2" center stack)
  │     ├── POWERTRAIN_Coyote_V8 (block, intake, valve covers, headers, alternator)
  │     ├── SUSPENSION_Front_MagneRide / SUSPENSION_Rear_IntegralLink (subframe, half-shafts, Torsen LSD)
  ├── [COL_GEOMETRY_STAGE1_STAGE2_MODS] (attachment sockets)
  │     ├── MOD_RAM_BUMPERS (AR500 boxed pusher + tow shackles; 8× wedge spikes; rear tubular armor + D-rings + Class IV receiver)
  │     ├── MOD_CAB_ARMOR (windshield ballistic louvers; quarter-glass louvers; riveted composite door plates; titanium underbody skidplate)
  │     ├── MOD_OFFROAD_CONVERSION (3.5" rally lift coilovers + reservoirs; 17" beadlock + 33" mud-terrains; snorkel cowl intake)
  │     └── MOD_ROOF_TURRET_SYSTEM (roof reinforcement ring; 360° swivel pintle; M240B/.50 MG; 200-round can + feed chute)
  ├── [RIG_Mustang_Armature]
  │     root → body_root (CoG 0, −0.18, 0.48m) → body_roll; hood_hinge (+58°); door_FL/FR hinges; trunk_hinge (−62°);
  │     steering_wheel; hub_FL/FR (steer ±34.5°) → wheel_FL/FR; hub_RL/RR → wheel_RL/RR; driveshaft_prop;
  │     turret_traverse (yaw 360°) → turret_elevation (−15°…+65°) → weapon_recoil (28mm linear)
  └── [SOCKETS_PHYSICS_ATTACHMENTS]
        socket_hitch_rear_class4 (0, −2.420, 0.380) · socket_winch_front_fairlead (0, 2.380, 0.420)
        socket_camera_driver_eye (−0.380, −0.150, 1.020) · socket_camera_roof_chase (0, −1.200, 1.550)
        socket_weapon_muzzle_flash (0, 0.820, 1.780) · socket_appboy_dash_dock (0.120, 0.320, 0.820)
        socket_headlight_tri_bar_L (−0.740, 2.080, 0.680) · socket_headlight_tri_bar_R (+0.740, 2.080, 0.680)
```

---

## 4. Modeling Execution Manual (summary of the line-by-line)

**Step 1 — Setup & references:** metric units, mm; ortho plates loaded/locked; blueprint dims — Length `4,819 mm`, Width `1,917 mm` (excl. mirrors), Height `1,400 mm`, Wheelbase `2,718 mm`. Face-orientation overlay on; wireframe 0.2.
**Step 2 — Unibody flow:** character edge from A-pillar base (740, 620, 880) along the fastback roof curve over the cantrail, down the C-pillar to the decklid lip; second loop = the S650 shoulder bone-line (headlight brow → door skin → rear quarter hip → tri-bar housing). Roof grid-filled 16×24 quads; G2 continuity cantrail→quarter glass, no pinching. Door jambs/glass recesses extruded inward 18 mm + 6 mm return lip (true stamped thickness).
**Step 3 — Front:** trapezoidal nostril grille, gloss black; 3D hex honeycomb modeled (12 mm cells, 1.5 mm walls — NOT alpha texture). Tri-bar headlights recessed 65 mm, 3 LED bars/side slanted 14°, micro-fluted fresnel lenses + projector globes. Hood: central negative-pressure channel + twin extraction vents; louvers 2.0 mm section with underside debris tray. Splitter projects 55 mm forward, dual stay-struts to the crossmember.
**Step 4 — Rear:** quarter hips +38 mm/side vs GT, blending into the fuel filler recess (left). Tri-bar taillights: concave panel, 3 red vertical LED bars/side, forward chevron protruding 22 mm, smoke acrylic lenses. Diffuser: 4 vertical strakes; quad 4.5" 304 stainless tips (dual/side), rolled edges, perforation baffles, heat-blued titanium gradient. Pedestal wing on dual die-cast stanchions + clear Gurney flap.
**Step 5 — Interior:** Recaro seats with seam piping (1.2 mm extruded bevel curve), harness pass-throughs in satin titanium trim. Curved magnesium-glass display housing (12.4" cluster + 13.2" stack, angled 10° to driver). Start/Stop button, leather drift-brake lever with red stitching, titanium sphere 6-speed knob. AppBoy ruggedized magnetic dash dock (passenger console stack).

## 5. Combat Overhaul (Stage 1 & 2)

**Mod 1 — AR500 ram + spikes:** pusher from 8/10 mm laser-cut AR500 plate contouring the fascia (2,020 mm wide); boxed beam extensions (75×75×6 mm) to the frame rails. 8 wedge spikes (260 mm long, 70 mm square base → chisel tip) + 4 hub spikes (110 mm). 12,000-lb Warn winch recessed behind the center plate, CNC hawse fairlead, forged swivel hook.
**Mod 2 — Cab armor:** 5 mm windshield louver frame hinged at the cantrail; 6 horizontal slats, 42 mm gaps, 32° downward angle (sightline preserved). Kevlar door inserts: composite panels, 12 button-head allen bolts/door, weathered gunmetal CARC, rust-haloed holes. Quarter glass → slotted steel blackout plates with VHF whip pass-throughs.
**Mod 3 — Roof pintle:** 620 mm reinforcement ring welded into roof bows + roll cage; ball-bearing 360° traverse race; twin-yoke cradle, spade grips, butterfly triggers. M240B/.50 with ventilated shroud, carry handle, red-dot, brass deflector; 200-round side can + articulated stainless feed chute.
**Mod 4 — Stage 2 lift:** Fox 3.0 bypass coilovers (+3.5"), remote reservoirs on braided lines at the strut towers. 17" forged beadlocks (24 ring bolts) + 33" Mickey Thompson Baja Boss (285/70R17). Class IV 2" receiver on the rear tubular crash bar, 4,500 kg tow.

## 6. Physics / Rigging Standards (PRD §6, UE5 Chaos — NOMAD: maps to the Rapier sim + carSpec)

- Front wheels: steer ±34.5°, suspension max drop 140 mm / compression 110 mm. Rear: driven, Torsen LSD 3.73:1, handbrake.
- Hitch socket: spherical joint; pitch ±24°, yaw ±80°, roll ±16°; break force 140,000 N / 38,000 N·m.
- Mass/CoG: baseline 1,795 kg, 53/47, CoG z 0.44 m (0.54 lifted); gear ratios [3.25, 2.23, 1.61, 1.24, 1.00, 0.63], final drive 3.73. (NOMAD note: the game's measured performance law — stock ≥220 km/h, max build ~260 km/h class, physics-native upgrades — remains the in-game authority; PRD numbers feed carSpec where they agree, and Ian's law wins conflicts.)
- Ram impulse + turret aim math: as the PRD's reference implementation (`ChaosMustangInterceptor.py`) — AR500 ram absorbs 75% of chassis trauma; turret local yaw/pitch from world delta, elevation clamped −15°…+65°.

## 7. Crafting Economy — Workshop Upgrade Recipes (faction workshops: Convoy Rig Forge, Rust Citadel, Tern Rock Marine Garage)

- **Tier 0 → 1 → 2:** Factory Dark Horse → Armored Interceptor → Apex Dust Interceptor.
- `mod_ar500_spiked_ram_interceptor` (Mechanics 3, lift + arc welder): 8× metal_sheet_hardened, 14× metal_scrap_heavy, 3× bolts_grade8_box, 1× welding_gas_cylinder (20%), 1× hydraulic_recovery_winch. Deltas: +185 kg, front deflection +75%, ram damage 2.8×, top speed −18 km/h.
- `mod_ballistic_louvers_and_door_plates` (Mechanics 2, fab table): 6× metal_sheet, 2× kevlar_insert, 4× screws_box, 6× rubber_strips. Deltas: cockpit deflection +80%, interior visibility −15% (louver letterbox in first person).
- `mod_roof_swivel_turret_m240b` (Mechanics 4 + Weaponsmith 3, armory bench + plasma torch): 1× m240b (or ar15_carbine), 1× ball_bearing_turret_ring, 12× metal_scrap, 4× electronic_parts. Deltas: 360° passenger/AI gunner coverage, 200-round belt, noise radius +65 m under fire.
- `mod_baja_dune_lift_33in_tires` (Mechanics 4, alignment bay): 4× all_terrain_tires, 2× heavy_duty_suspension sets, 4× wheel_spacers_forged. Deltas: offroad 0.18 → 0.88, clearance 135 → 240 mm, fording 0.35 → 0.75 m.

## 8. Export Checklist & Agent Quality Standards

- [ ] SubD topology: zero tris/ngons on curved bodywork; clean Catmull-Clark quad flow.
- [ ] Every cut seam terminates in a modeled 90° return lip + physical weatherstripping.
- [ ] Micro-bevels ≥1.2 mm on all sharp stamped creases.
- [ ] Cockpit instrumentation: accurate PBR emissive displays + physical 3D controls.
- [ ] `socket_appboy_dash_dock` present for the in-cockpit phone UI overlay.
- [ ] Kinematics: wheel pivots, suspension limits, tie-rods match §6 angles.
- [ ] All sockets live (hitch, winch, muzzle) with localized transforms.
- [ ] UV/texel density verified (40 px/cm across tiles) without stretching or seam breaks.
- [ ] Watertight manifold geometry, zero cracks.

---

*Source: Ian's Stitch project 8315385372052040679 (screen 788c1a9983c3447b8bd9839bb125bcbb + PRD text), dropped 2026-10-21 18:10 EDT with the order "dark horse prompt — use this." Governs the Stallion build (order of operations #1) together with the vehicle protocol skill.*
