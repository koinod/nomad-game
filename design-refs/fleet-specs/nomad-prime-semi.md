# NOMAD Vehicle Technical Specification: Western Star 5700 XE "Nomad Prime" (Heavy Haul Spec)
# Dropped by Ian 2026-10-21 (Stitch project 8315385372052040679, screen 3645f50b)
# Reference image: nomad-prime-semi.png (same folder)
# Category: Tier 4 Heavy Convoy Prime Mover & Dreadnought Tug

class: heavy_semi_prime_mover
id: "truck_semi_nomad_prime"
name: "Heavy Prime Mover — 'Nomad Prime' (Western Star 5700 XE Spec)"
description: "A modern aerodynamic long-nose custom sleeper semi-truck prime mover inspired by the modern Western Star 5700 XE / Optimus Prime platform. Evolves the boxy, scrap-armored baseline semi into a sleek, streamlined long-distance highway dreadnought. Outfitted with high-output 600hp Detroit turbo-diesel torque, integrated boxed-steel push bumper, dual vertical chrome exhaust stacks, sleeper quarters, and a 50,000-lb rated fifth-wheel turntable capable of hauling any multi-car carrier, mobile base, or lowboy flatbed across the Mid-Atlantic corridor."
category: "heavy_transport_prime_mover"
tier: 4
seats: 2 (cab captain chairs + sleeper double bunk)
storage_slots: 32 (interior sleeper lockers + chassis diamond-plate tool compartments)
weight_empty_kg: 8950
max_payload_kg: 18000
max_towing_kg: 48000  # Capable of towing Double-Deck Car Hauler, HET-70 Lowboy with MBT, or Modular Base
fuel_type: diesel
fuel_capacity_l: 950   # Dual 475L cylindrical chassis saddle tanks with diamond-plate steps
noise_radius_m: 105
offroad_rating: 0.52   # Aerodynamic highway cruiser; optimal on bridge spans, turnpikes, and hardpack
speed_max_kph: 145
can_tow_fifth_wheel: true
can_tow_bumper: false
hitch_types: ["fifth_wheel_turntable_heavy_semi"]

## 1. Mechanical & Visual Architecture
- **Aerodynamic Long-Nose Silhouette:** Custom faceted front hood and aerodynamic wheel fenders housing sleek quad LED projector headlamps, channeling wind resistance over the high-roof sleeper fairing.
- **Modern Optimus Prime Styling Cues:** Bold vertical grille louvers, dual tall vertical exhaust stacks with heat shields behind the cab, high-roof aerodynamic sun visor with integrated amber marker lamps, and ghosted deep crimson pinstripe accents along dark metallic cobalt navy and gunmetal slate bodywork (#171C1F / #1B2A38).
- **Tandem Heavy Drive Axles (10 Wheels):** Dual rear axles with 8 commercial drive wheels (deep-dish tactical steel rims) plus 2 steer wheels, distributing heavy trailer tongue weights across tandem bogies.
- **Diamond-Plate Catwalk & Turntable:** Recessed fifth-wheel turntable plate centered over rear axle rails, flanked by diamond-plate rear catwalk decking, air line umbilical connections, and heavy rubber anti-spray mudflaps.
- **Chassis Saddle Tanks:** Dual 475L cylindrical diesel tanks providing uninterrupted long-distance escort and cargo extraction across all three campaign acts.

## 2. Compatible Trailer Matrix (Tier 4 Capacity)
| Trailer ID | Trailer Name | Hitch Type | Payload Role |
| :--- | :--- | :--- | :--- |
| `trailer_multi_car` | Double-Deck Multi-Car Hauler | Fifth-Wheel Turntable | Extraction of 4 scout vehicles or 2 heavy trucks |
| `trailer_3_car_hauler_v2` | 3-Car Hauler (Elongated) | Fifth-Wheel Turntable | 3 dedicated vehicle bays with hydraulic ramps |
| `trailer_enclosed_car_carrier`| Enclosed Car Carrier | Fifth-Wheel Turntable | Salt-proof, weather-shielded vehicle transport |
| `trailer_gooseneck_lowboy` | Heavy Lowboy (HET-70) | Fifth-Wheel Turntable | Hauling the Titan MBT (The Ironclad) or engineering cranes |
| `modular_trailer` | Modular Base Box Trailer | Fifth-Wheel Turntable | Fully fortified mobile living HQ & medical bay |
| `trailer_logistics` | Logistics Hauler (60-Slot) | Fifth-Wheel Turntable | High-capacity bulk transport for base construction |

## 3. Installed Equipment & Mod Slots
installed_equipment:
  front_bumper: { id: "bumper_heavy_boxed_ram_prime", name: "Integrated Boxed-Steel Push Ram Bumper & Tow Hooks", damage_mitigation_pct: 60 }
  fifth_wheel: { id: "turntable_50k_heavy_haul", name: "50,000-lb Heavy-Haul Sliding Turntable Hitch" }
  exhaust_stacks: { id: "stacks_vertical_chrome_twin", name: "Dual Polished Vertical Exhaust Stacks & Heat Shields" }
  sleeper_cab: { id: "cab_sleeper_high_roof_aerodynamic", name: "High-Roof Aerodynamic Sleeper Module (Double Bunk)" }

mod_slots:
  - front_ram_mount          # Integrated boxed-steel ram / heavy bullbar
  - roof_fairing_antenna     # High-gain convoy mesh antenna / radar dish
  - chassis_skirt_storage    # Locking diamond-plate under-chassis tool compartments (+8 slots)
  - rear_catwalk_winch       # 25-ton hydraulic recovery retrieval winch
  - auxiliary_diesel_saddle  # Expanded fuel capacity (+300L)
  - armored_sleeper_louvers  # Ballistic steel louvers over sleeper side windows
  - anti_husk_wheel_spikes   # Forged alloy wheel hub spikes on steer and drive wheels

## 4. Scene Structure (Godot spec — maps to our Three.js node contract at integration)
# Target Poly Budget (spec): 2800 - 3600 tris for 2.5D streaming — NOTE: our live game is full 3D;
# the gate standard is the reference image's look, budget yields to the visual gate.

- SemiNomadPrime (RigidBody)
  - ChassisFrame (boxed steel tandem frame rails)
  - AerodynamicHood (tapered hood + front grille + quad LED projector lights)
  - HighRoofSleeperCab (dark cobalt blue / slate with crimson pinstripes)
    - WindshieldFaceted (tinted glass with sun visor fairing)
    - RoofMarkerLights (5x amber cab indicators)
    - DualExhaustPipes (twin tall vertical stacks + heat shields)
    - SideMirrors_LR (aero dual-glass mirrors)
  - FrontPushBumper (boxed steel bumper + recovery shackles)
  - FuelTanks_LR (cylindrical saddle tanks with diamond steps)
  - RearCatwalkPlatform (diamond-plate catwalk deck)
    - FifthWheelTurntable (trailer attachment socket)
    - AirUmbilicalCables (coiled red/blue pneumatic brake lines)
    - RearMudflaps_LR
  - WheelSystem (10 wheels, commercial deep-dish rims):
    Wheel_Steer_Left, Wheel_Steer_Right,
    Wheel_Drive_Axle1_Left_Inner/Outer, Wheel_Drive_Axle1_Right_Inner/Outer,
    Wheel_Drive_Axle2_Left_Inner/Outer, Wheel_Drive_Axle2_Right_Inner/Outer
  - Markers: driver_seat, passenger_seat, sleeper_bunk_rest_point, trailer_hitch_fifth_wheel, electrical_brake_umbilical, headlight_left_projector, headlight_right_projector
  - PhysicsCollision (compound box) + InteractionZone (fuel access, cab entry, sleeper sleep trigger, hitch control)
