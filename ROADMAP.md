# NOMAD — Roadmap (2026-10-19, Ian's direction; story canon updated 2026-10-20)

## ORDER OF OPERATIONS (2026-10-21, Ian — the standing build sequence; saved on his order)

1. **The Stallion + the new map.** The Dark Horse built under the vehicle protocol; Beta Island built from the master spec + aerial — **high-poly design throughout: no more squares-and-rectangles primitive construction, anywhere in the world.**
2. **Vehicle physics + interaction with the world.** The current collision logic is DELETED completely (Ian: it's not working properly) — no collision response, no tire/condition consequences to worry about in this pass. Then vehicles, physics, upgrades, in that lane.
3. **Sat phone + inventory + the rest of UI management.**
4. **Complete item build-out + rendering, and crafting tables.**
5. **Skills** — finishing and building out all features, in the sat phone.
6. **The rest of UI + rendering afterwards:** survivors, then survivor AI exhaustively (teaming up, survival behavior), zombie sprites, movement animations.

Phases already in flight out of order (inventory v2, figures) finish their current scope; nothing new starts out of sequence.

## CANON: the journey (2026-10-20, Ian)

**Easy mode = the road out:** Island (current) → Outer Banks → Norfolk / Virginia
Beach area → D.C. Each leg is a region, not a menu — the island is chapter one,
and the lighthouse ending becomes the "leave the island" gate. The Static
spreads across the regions as you travel.

**The cure flips the game:** reach D.C., get the cure — then it becomes
**hardmode**. The Static is cured but the enemy changes: the government moves
in, new factions enter (Mercenaries 2 pattern — new levels, new devils;
Terraria hardmode pattern — the whole world recontextualizes). New vehicles,
upgrades, better weapons/guns, better armor, survivor upgrades, new events —
reasons to keep playing, not a victory lap. Skyrim-style side quests and
open-ended reasons to stay busy are pinned for later (marked, not built).

**Phase map updated:** Phases 1–3 (island) → Phase 4 road regions (OBX → Norfolk →
D.C. at 1/10 scale) → cure → hardmode pivot (government + new factions + new
tech tree) → Stage 2 = New Dawn-like evolved overworld after an ending.

## CANON: the phone deck + mobile bases (2026-10-20, Ian)

**The sat phone is the command deck.** It comes up mid-screen as a physical
device (rugged sat/tac phone), app-based like a real phone — not a side panel:
- **Pack** — Tarkov-style inventory: a visual grid where items take space, so
  the player can SEE capacity (grid data model: item footprints — Phase P2).
- **Character** — health/body management fused with the skill tree + perks.
- **Craft** — the crafting TREE, and the same place you modify weapons
  (attachments) and clothing/armor.
- **Base** — base management. **Team** — survivor management (gear, jobs).
- **Vehicles** — vehicle management; live when you're in one (fuel, condition,
  and storage once trunks/trailers land).

**Vehicles become mobile bases** — the long-game vehicle vision:
sleep in vehicles; walk in the backs of vans/box trucks; load cargo (crates,
supply drops, resources) into vehicles and trailers; build inside trailers,
close them, sleep in them; pull trailers (hitch matrix); load cars onto the
carrier; haul everything back to base; then **equip survivors with gear +
vehicles and dispatch them** on tasks against the world and other AI
(expedition system).

**Build order:** P1 phone deck shell (apps, device frame; Pack stays list
until P2) → P2 Tarkov grid inventory (item footprints, grid UI) → P3 vehicle
storage + sleep-in-vehicle + walk-in backs (van/box truck) → P4 trailers
(hitch, cargo, build/sleep inside) + car carrier loading → P5 survivor
dispatch (equipped expeditions with outcomes).

The waves after houses v1, in build order. Each wave ships as a playable,
beta-testable build before the next starts.

## Wave 0 — Houses v1 (shipped 2026-10-19)

Camp + suburban single-story enterable houses, wall collision, floor rects,
furniture loot, tiered loot, POI placement, blueprint-proportioned doors/
windows/roofs, terrain pads under footprints. See HOUSES_DESIGN.md.

## Build priorities (2026-10-20, Ian's order)

Vehicle + building models are the focus. Sat phone rework is long-term.
Build order: **island → POIs → factions → buildings → item models → vehicles
with real (not too advanced) physics → weapon mods → visuals → mobs → special
mobs.** Cross-cutting: items that work and make sense, crafting trees with
depth that make crafting worthwhile/necessary, skill trees that deepen gameplay
and support archetype building.

## Wave 1 — Ambiance / feel

The world has to *feel* right before more systems land on it.
- **Depth of field** in third person (postprocess; focus on the player,
  soft distance) — adds cinematic weight and hides far-LOD seams.
- **Realistic clouds**: cloud sprites/shader dome, drifting, day/night tinted.
- **Less far visibility in third person**: tighten fog + camera far distance,
  so the world feels bigger and the horizon doesn't look cheap.
- General atmosphere pass: light shafts through trees, wind audio + grass
  motion, distant water sound at shore. (Ian: "the world could be better.")

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
(survival systems). Wave 6 = Phase 3 world depth. Phase 4 = road regions
(OBX → Norfolk/Va Beach → D.C.). Cure → hardmode pivot. Stage 2 = New Dawn
overworld after an ending.
