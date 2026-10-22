# ITEMS + CRAFTING AUDIT — Order #4 Phase A (lane/items-buildout, from main 8f44d14)

Method: full read of `src/data/items.ts` (ITEMS, FIELD_RECIPES, STATION_RECIPES),
`src/game/itemModels.ts`, `src/game/weaponMeshes.ts`, `src/data/stations.ts`,
`src/systems/crafting.ts`, `src/store/containers.ts` / `gridUtils.ts` /
`equipment.ts`, `src/ui/CraftPanel.tsx`, `World.buildStations()`, and a
scripted cross-check of every `itemId` reference in `src/data|store|systems|game`
against the catalog. Counts below are measured, not estimated.

## 1. Item catalog — 87 items

Categories: material 19 · weapon-melee 16 · mod 12 · weapon-ranged 9 · tool 7 ·
armor 6 · ammo 5 · food 5 · key 3 · medical 2 · pack 2 · blueprint 1.

### World-model presence (ground/pickup view)

| Class | Count | Items |
|---|---|---|
| (a) Modeled — dedicated multi-part silhouette, material-varied | 80 | 43 via `itemModels.buildItemModel` (ITEM_MODEL_IDS) + 37 via `weaponMeshes.buildGroundMesh` dedicated cases (11 of those reuse the hand builder lying flat) |
| (b) Minimal — single-primitive but item-true | 3 | `rock` (one dodecahedron — it is a rock), `wire` (one copper torus coil), `cloth` (one folded sheet) |
| (c) Icon-only / default box fallback | 4 | **`field_jacket`, `cargo_pants`, `hard_case`, `ammo_can`** — all four are inventory-v2 container additions; they fall through to `buildGroundMesh`'s default tan box (0.34×0.24×0.34) |

Model-less total = **4 of 87** — far under the 40-item scope-surprise line.
No GLB item models exist (public/models holds vehicles only); all item art is
procedural code-built geometry in the two modules above. That is the catalog's
established idiom and it reads at game framing.

### First-person (in-hand) presence

All 25 weapons (16 melee incl. throwables, 9 ranged) have dedicated
`buildHandMesh` cases with grips (`WEAPON_GRIPS`), plus `flare` and `torch` —
**27/27 holdable items covered**. No gap.

### Grid footprints

**Complete.** No def carries inline `w`/`h`; instead the `FOOTPRINTS` table
at the foot of items.ts assigns considered footprints to **all 87 items**
post-table (the same pattern as DISASSEMBLY): long guns 5×2 (SMG/crossbow
4×2), handguns 2×2, melee 1–5 wide by real length, bulky goods 2×2, small
goods 1×1. `gridUtils.footprintOf` reads them; the `slots`-derived fallback
never fires for catalog items. Weapon-slot routing
(`equipment.weaponSlotForDef`, width ≥3 → primary) is consistent with these
values. (Phase A correction: an early draft of this audit read only the
ITEMS literal and reported footprints missing — wrong; the table was found
in Phase B and this section rewritten. Phase B exports FOOTPRINTS and pins
coverage + agreement so the table can't silently drift from the catalog.)

### Consumers

- Loot: HUSK_LOOT / HUSK_KIND_LOOT / FURNITURE_LOOT / SAFE / LOG / BUSH /
  biome-weighted rolls — all referenced ids resolve. No dangling refs.
- Barter: `BARTER_VALUES` covers 80/87. Gaps: the same 4 unmodeled containers
  (should trade) + `phone`/`relay_part`/`beacon_cell` (key items, value 0 via
  `barterValueOf` fallback — by design).
- `src/data/base.ts` `bp_*` ids are the facility-blueprint namespace, not
  items — not dangling refs.
- Quests/dispatch/upgrades consume via `countItem`/`walkCarried` — forest-wide.

## 2. Crafting — 36 recipes (7 field + 29 station)

Every recipe's components and result resolve to ITEMS. Station split:
workbench 18 · chemistry 5 · industrial 6 (incl. blueprint-gated `r_turret`).
Field recipes are instant by design; station recipes run the timed queue in
`src/systems/crafting.ts` (consume-at-start, interrupt/resume, sleep-through),
surfaced by `CraftPanel` with live gate checks. Instant fallback path
(`gameStore.craftRecipe`) also exists and walks the forest correctly.

### Gaps found

| # | Gap | Severity |
|---|---|---|
| C1 | **Queue consume bug:** `useCraftQueue.consumeComponents` searches only the top-level `inventory` list, while `checkCraft` counts forest-wide via `countItem`. Components nested in a worn backpack pass the gate, then enqueue reports "Missing components" (or under-consumes). The instant path does it right (`walkCarried`). | Bug — fix in Phase B |
| C2 | **Missing required station sites:** world placements are jonah_camp + town (bench), relay_station (chem), marina (shop). **No stations at the airbase depot, the Refuge, or the Citadel yard** (required minimum set). | Gap — Phase B |
| C3 | **Unauthored recipe meta:** RECIPE_META covers 20/36. 13 station recipes fall back to `DEFAULT_META` (flat 120 s, no authored time/gates): r_reload_9mm_t2, r_reload_shells_t2, r_spear, r_shin_guards, r_revolver, r_smg, r_carbine, r_choke, r_flashlight, r_gunpowder, r_molotov, r_smoke_grenade, r_circuit_board. 2 field recipes (r_rock_lure, r_produce_meal) lack explicit instant entries. | Gap — Phase B |
| C4 | Station mesh props are box-built (`World.buildStations`) — construction-grade, same provisional class as the airbase kit under the high-poly law. Data/placement is this order's scope; mesh rework rides the sector structure passes. | Noted |
| C5 | `CraftPanel` hardcodes `facilityStation: null` — base facility-hosted crafting (data + engine support it) is unreachable from the phone UI; no "at facility" store signal exists. World-station crafting (this order's scope) works. | Residual — needs a base-presence signal design, out of Phase B scope |
| C6 | No cook-station family exists in data: cooking is field recipes (campfire props exist in World but are not stations). Vehicle work is `upgrades.ts` costs installed via the Vehicles app against the `garage` station def (facility-hosted, no recipes) — consistent with the data as designed; no new families invented. | By design |

## 3. Phase B plan (scope confirmed — no surprise)

1. Model the 4 class-(c) items in `itemModels.ts` (multi-part, material-varied,
   real scale): field_jacket, cargo_pants, hard_case, ammo_can.
2. Footprints: already complete via FOOTPRINTS (see correction above) —
   export the table and pin coverage/agreement/routing in tests instead.
3. BARTER_VALUES for the 4 container items.
4. Fix C1: queue consume/refund walk the carried forest like the instant path.
5. Complete RECIPE_META for all 36 recipes (authored times; field = explicit 0).
6. Stations at airbase depot (bench + shop), Citadel yard (shop + bench),
   Refuge (chem + bench) — data-first in WORLD_STATION_PLACEMENTS (extended
   with a sector anchor for Refuge), `World.buildStations` refactored to
   consume the data array as the single source of truth.
7. Tests: catalog completeness pins (model def for every item, footprint
   authored + routing, recipe→station + meta, required-site placements,
   proximity gating math) + a nested-components conservation test through
   the queue.
