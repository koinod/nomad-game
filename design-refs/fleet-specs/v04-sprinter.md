# NOMAD Vehicle Technical Data: V-04 Sprinter Expedition Live-In Van
# Dropped by Ian 2026-10-21 (Stitch project 8315385372052040679, screen 2d3f532e)
# Reference image: v04-sprinter.png (same folder)

class: expedition_van
id: "van_sprinter_expedition"
name: "V-04 Nomad Sprinter (High-Roof Expedition)"
description: "An elevated high-roof 4x4 overland cargo van inspired by heavy-duty commercial Sprinter and Transit platforms. Custom-built as a self-sustaining mobile dwelling and mobile workshop for long-haul survivors. Features a raised standing roof, onboard sleeping bunk, modular storage cabinetry, rooftop solar array, and 4x4 high-clearance off-road suspension."
category: "medium_expedition"
seats: 2 (cab captain chairs) + 1 rear folding workstation seat
storage_slots: 36 (cabinetry, under-bed garage, roof cases)
weight_empty_kg: 3400
max_payload_kg: 2800
max_towing_kg: 4500
fuel_type: diesel
fuel_capacity_l: 110
noise_radius_m: 55
offroad_rating: 0.78
speed_max_kph: 125
can_tow: true
hitch_type: "bumper_ball_hitch"

## Living & Mobile Base Capabilities
- **Insulated Sleeping Quarters:** Rear platform bed restores 100% Stamina and Morale while sheltered from Static storms.
- **Under-Bed Cargo Garage:** Rear storage through 50/50 barn doors, up to 16 bulky resource crates, tools, replacement vehicle parts.
- **Rooftop Solar & Power Station:** 400W rooftop solar array trickle-charges deep-cycle batteries, powering internal lighting, refrigeration, wireless docking.
- **Side Awning Campsite Mode:** Deployable 2.5m waterproof side awning — shelter for outdoor cooking and field repairs.
- **Modular Station Slot:** Interior galley supports 1 compact workbench module (Field Kitchen or Medical Apothecary).

## Mod Slots
mod_slots:
  - roof_rack_solar_module    # 400W solar cells + dual auxiliary battery bank
  - side_ladder_and_awning    # Deployable awning + rooftop access ladder
  - rear_door_spare_carrier   # External spare tire + fuel jerrycan swing rack
  - front_winch_and_pushbar   # 12,000-lb recovery winch + low-profile bumper bar
  - high_lift_suspension_kit  # +3-inch lift for wading salt-marsh flats and dunes
  - interior_galley_station   # Compact cooking stove or medical station
  - security_window_grates    # Reinforces tinted side windows against Husk breaches

## Scene Structure (Godot spec — maps to our Three.js node contract at integration)
# Target Poly Budget (spec): 1600 - 2000 tris for 2.5D — NOTE: our live game is full 3D;
# the gate standard is the reference image's look, budget yields to the visual gate.

- SprinterExpeditionVan (RigidBody)
  - Chassis (high-roof body, tactical slate/olive)
  - FrontBumper (steel bumper with recovery winch and fog pods)
  - SlidingSideDoor (animated sliding cargo door) + FoldingSideStep
  - RearDoors (animated 50/50 barn doors) + SpareTireCarrier (swing-away rack)
  - RoofRackSystem (safari rack with solar panels & AC cowl) — SolarPanels, RoofCases, SideLadder, DeployableAwningCassette
  - Wheels (4x 4x4 high-clearance off-road beadlock tires): Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
  - InteriorLivingSpace (visible when doors open): PlatformBedMesh, StorageCabinets, GalleyCounter
  - Markers: driver_seat, passenger_seat, sleep_interaction_point, interior_workbench_station, rear_cargo_access_point, trailer_hitch_bumper_receiver
  - PhysicsCollision (compound box) + InteractionArea
