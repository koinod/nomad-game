# NOMAD — Roadmap (2026-10-19, Ian's direction)

The waves after houses v1, in build order. Each wave ships as a playable,
beta-testable build before the next starts.

## Wave 0 — Houses v1 (in progress)

Camp + suburban single-story enterable houses, wall collision, floor rects,
furniture loot, tiered loot, POI placement. See HOUSES_DESIGN.md.

## Wave 1 — Ambiance / feel

The world has to *feel* right before more systems land on it.
- **Depth of field** in third person (postprocess; focus on the player,
  soft distance) — adds cinematic weight and hides far-LOD seams.
- **Realistic clouds**: cloud sprites/shader dome, drifting, day/night tinted.
- **Less far visibility in third person**: tighten fog + camera far distance,
  so the world feels bigger and the horizon doesn't look cheap.
- General atmosphere pass: light shafts through trees, wind audio + grass
  motion, distant water sound at shore. (Ian: "the world could be better.")

## Wave 2 — Special husks

From sodgame's playbook, plus Ian's military ask:
- **Screamer** — screams, calls the horde. Kill it first.
- **Brute** — armored, breaks blocks (blocking a brute costs you).
- **Crawler** — low, ankle-grab, punishes knocked-down players.
- **Bloater** — toxic explosion + gas cloud, area denial.
- **Military husks** — armored ex-soldiers, spawn at the military base POI
  (Wave 6). Tougher, drop military loot (ammo, gun parts).

## Wave 3 — Search & stealth

- **Noise classes + HUD noise meter**: crouch footsteps ~2m, sprint ~14m,
  gunshot ~80m — shown as a live meter, so crouch/lean become tactical.
- **Hold-to-search**: looting takes time (2–4s), interruptable, loud actions
  draw attention.
- **Lockpick + forced entry**: locked safes/doors — pick quietly or smash loudly.

## Wave 4 — Crafting tables & recipes

- **Crafting tables**: workbench crafting at houses/camps/garages — beyond the
  field pack. Advanced recipes: ammo reloading, medkit crafting, weapon
  maintenance, vehicle parts.
- **Full recipe list expansion**: all the loot pieces get uses — gun parts,
  vehicle parts, valuables, scrap tiers. Every item has a reason to exist.

## Wave 5 — Structures: copy-paste prefabs (base building)

- **Prefab structures**: placeable walls, floors, doors, storage crates,
  workbenches, defenses — a copy-paste building kit for player bases.
- Other structures: watchtowers, fences, spike traps, rain collectors.
- Phase 2 territory — the "run the operation" fantasy needs a home base.

## Wave 6 — POI creation pass

- **Military base**: new POI with barracks, armory (locked, rich loot),
  military husks (Wave 2), high-tier tables.
- Other POIs: gas station, barn/farm, warehouse, school, marina —
  each with house-template loot scenes and a loot tier.
- Other building types beyond houses (per POI flavor).

## Wave 7 — Vehicles

- Phase 2 vehicle system: garage pads from houses v3 spawn drivable vehicles,
  world spawns on roads, fuel + condition + repair (vehicle parts from
  Wave 4 recipes).
- Drivable trailer support (sodgame had it; cheap once vehicles exist).

## Wave 8 — Survivor recruiting

- Survivors at POIs with traits/morale (sodgame's survivor sim DNA):
  recruit, assign jobs (scavenge, guard, craft), camp upgrades.
- Phase 2 — the management layer Ian actually wants.

## Wave 9 — Skill trees / archetypes

- Archetypes: Scavenger / Brawler / Mechanic / Ghost — perk trees with
  mutually-exclusive capstones, earned through play (kills, crafts, stealth
  actions feed their trees).
- Phase 2/3 — the long-tail progression system.

---

Phase map: Waves 1–3 = Phase 1 completion (feel). Waves 4–5 + 7–9 = Phase 2
(survival systems). Wave 6 = Phase 3 world depth. Stage 2 = New Dawn overworld
after an ending (unchanged).
