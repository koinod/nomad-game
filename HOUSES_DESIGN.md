# NOMAD — Houses Design (2026-10-19, Ian's spec)

Real enterable structures inside POIs. Three tiers × 3–4 visual variants each,
1–4 floors, some basements, room-furniture loot, safes, garages with vehicle
spawn chances. Spawn/drop rates for vehicles, parts, safes, keyed by POI loot
tier.

## Engineering constraints (from DECISIONS.md)

- No Rapier: kinematic controller + heightmap collision. Houses add two new
  subsystems, both engine-owned, both deterministic:
  1. **Wall colliders** — AABB list per house; Player resolves a 0.45m circle
     with per-axis push-out each tick. Doors are gaps in the AABB list.
  2. **Floor rects** — `{x0,z0,x1,z1,y}` per floor. Game's `groundY` override
     returns `max(terrain, containingRect.y)`. Stairs are ramp rects with
     linear y-lerp (v2). No Player changes needed: every ground query already
     routes through `ctx.groundY`.
- All generation deterministic from `seed ^ houseId` (mulberry32), so saves and
  re-renders agree.
- Loot reuses the container loot-preview panel (`stageContainerLoot`): every
  furniture piece and safe is an `Interactable` with a loot table.

## Tiers × variants

### Tier 0 — Camp (loot tier: low)
1 floor, no basement, no garage. Food, cloth, scrap, bandages.
- **Lean-to**: three walls + sloped roof, open front. Furniture: camp crate.
- **Tent**: canvas prism + bedroll. Furniture: cooler (food), duffel (cloth).
- **Shack**: 4×5m wood box, door gap. Furniture: crate, barrel (scrap).
- **Cabin**: 5×6m log walls, pitched roof. Furniture: crate ×2, cooler.

### Tier 1 — Suburban (loot tier: mid)
1–2 floors, basement 50%, garage 40%. +ammo, wire, tools, rare medkit.
- **Ranch**: 1 floor, 8×10m, flat-ish roof. Rooms: kitchen, living, 2 bed, bath.
  Furniture: fridge (food), cabinets (food/material), dresser (cloth), crate.
- **Colonial**: 2 floors, 7×9m, pitched roof, stairs. Same rooms + upstairs
  2 bed. Basement 50% (stairs down): toolboxes (scrap/wire), crates.
- **Split-level**: 2 half-floors, garage 40%: workbench (scrap/wire), vehicle
  parts 25%.
- **Ruin** (relay/jonah flavor): collapsed variant — partial walls, roofless,
  loot tables halved, no furniture AABBs (walkable rubble).

### Tier 2 — Rich (loot tier: high)
2–4 floors, basement 80%, garage 80%. medkit, ammo bulk, valuables, gun parts.
- **Beachfront estate**: 2 floors + deck, garage. Furniture: double fridge,
  pantry cabinets, safe 45%, bookshelf (wire/electronics).
- **Modern villa**: 2 floors, glass wall sections (visual only, colliders full
  height), open plan. Furniture: safe 45%, wine rack (water bottles), crates.
- **Brick colonial**: 3 floors, basement 80% (workshop: toolboxes, gun parts).
  Furniture: safe 45% upstairs + basement, dressers, fridges.
- **Compound**: main house (2 floors) + guest house (1 floor), shared garage.
  Furniture: 2× safes possible, doubled rooms.

Visual variants per tier come from: footprint size (±20%), roof pitch/style,
wall palette (wood/brick/stucco/concrete), window trim, porch on/off. Same
generator, different parameter draws — 3–4 distinguishable silhouettes each.

## Rooms → furniture → loot

| Furniture | Found in | Loot (tier-scaled) |
|---|---|---|
| Fridge | kitchen | canned_food, water_bottle; rich: +cooked_meat |
| Cabinets | kitchen/bath | canned_food, cloth, bandage; rich: +medkit (low chance) |
| Dresser | bedroom | cloth, bandage; suburban+: ammo_9mm (low) |
| Nightstand | bedroom | bandage, cloth, flare |
| Bookshelf | living/office | wire, scrap; rich: electronics (valuables) |
| Crate | anywhere/garage | scrap, wire, cloth |
| Cooler | camp | canned_food, water_bottle |
| Toolbox | garage/basement | scrap, wire, fire_starter |
| Workbench | garage | scrap, wire, vehicle parts |
| Safe | bedroom/office/basement | valuables, ammo bulk, medkit, gun parts |

Loot tables reuse `LootEntry {id, min, max, chance}`; each furniture type has
a per-tier table. Rich-tier tables get a 1.5× quantity mult.

## Safes

- Spawn chance: camp 0% / suburban 20% / rich 45% (one per house max, rolled at
  generation; v2: rich compounds may roll two).
- v1: E opens the loot-preview panel with a rich table (valuables, ammo,
  medkit, gun parts). v2: "crack safe" — 2h game-time advance + noise radius
  30 (draws husks), so safes are a risk/reward decision.

## Garages & vehicles

- Garage room (suburban 40%, rich 80%): workbench, vehicle parts loot
  (`tire`, `engine_part`, `car_battery` — new items), parking pad.
- Vehicle spawn roll at generation: suburban 8%, rich 18% — the pad is
  **reserved** (empty concrete + tire marks) until Phase 2 ships the vehicle
  system, which reads the pad registry and spawns drivable vehicles there.
- Vehicle parts feed Phase 2 repair/crafting; until then they're trade goods.

## New items (v1)

- `valuables`: jewelry/electronics, heavy trade goods for the Collective
  (sell system = Phase 2 economy; until then, high-value, low-weight loot).
- `tire`, `engine_part`, `car_battery`: vehicle parts, Phase 2 inputs.

## POI placement

- **town**: 3 suburban + 1 rich + 2 camp (replaces the 9 non-enterable shells
  from `buildTown` — enterable versions take over).
- **shore_camp**: 2 camp. **jonah_camp**: 2 camp + 1 suburban ruin.
  **forest_cache**: 1 camp. **relay_station**: 1 suburban ruin.
  **lighthouse_base**: 1 rich (keeper's house). **dune_cache**: 1 camp.
  **wreck**: none.

## Phasing

- **v1**: camp + suburban single-story enterable houses, wall collision, floor
  rects, furniture loot tables, tiered loot, 3–4 visual variants per tier,
  POI placement. (No stairs, no basements.)
- **v2**: stairs + ramps, 2nd floors, basements, rich tier, safes with
  cracking risk, garage rooms + vehicle parts items.
- **v3** (Phase 2 dependent): vehicle pads spawn drivable vehicles; valuables
  sellable to the Collective.
