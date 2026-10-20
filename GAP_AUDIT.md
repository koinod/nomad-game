# NOMAD — Gap Audit ("make sure we haven't missed everything")

**Date:** 2026-10-20. **Method:** every `data/*.json` and `src/` subsystem in
sodgame (re-cloned from github.com/CampusCollect/sodgame — the /tmp copy had
been wiped) cross-checked against every NOMAD design doc (NOMAD_SWARM_BUILD_
PROMPT, ROADMAP, HOUSES_DESIGN, BASE_DESIGN, POIS_FACTIONS_VEHICLES,
VEHICLES_FACTIONS_EVENTS_DESIGN) and against current `src/` (items.ts,
factions.ts, quests.ts, World.ts POI_DEFS, Houses.ts variants/placements,
Husks.ts KIND_STATS, Interact.ts, weaponMeshes.ts, store/types.ts ItemDef).

**Headline:** the design docs are strong on POIs, bases, vehicles, factions,
and events. The holes are (1) a layer of sodgame systems that never got
designed at all (grenades, stealth tools, durability/disassembly, traits,
alarm behavior, turret), (2) almost everything designed is still unbuilt —
vehicles, bases, factions-as-systems, events, skills, and specials are all
zero-code — and (3) a handful of doc-vs-doc and doc-vs-src contradictions
that will bite if waves are built from different docs.

---

## A. SOURCE → DESIGN gaps

Things in sodgame's data/systems that appear in **no** NOMAD design doc
(ROADMAP one-liners count as "named, not designed").

| Source item | Where in sodgame | Status in NOMAD docs |
|---|---|---|
| **Grenades** — frag (160 dmg), molotov (burn status), flashbang (stun) with fuse/throw-speed/noise stats | `data/items.json` (`grenade` blocks) | **Absent.** Swarm prompt lists a "thrown" weapon category; no doc specs a throwable. NOMAD has zero throwables designed or built. |
| **Weapon mods as items** — reflex sight (optic), suppressor, extended mag; per-weapon `attachments` slot lists | `data/items.json` + `src/combat/WeaponModController.ts` + `src/ui/WeaponModPanel.ts` | **Named only.** Ian's 2026-10-20 priority list and the swarm prompt's Mod category name them; no doc specs slots, effects, or which NOMAD weapons accept which mods. |
| **Stealth tools** — thrown rock lure, boombox decoy (`noise_decoy_loop`, 60m) | `data/stealth_tools.json`, `src/stealth/StealthTools.ts` | **Absent.** NOMAD's flare covers ~half the lure concept; rock/boombox never mentioned. |
| **Alarm behavior** — POI `alarm: silent/active` + AlarmController | `data/poi_spawns.json`, `src/stealth/AlarmController.ts` | **Flag copied, behavior undesigned.** POIS_FACTIONS_VEHICLES tabulates the alarm column; no doc says what an active alarm *does* in NOMAD (noise burst? reinforcements? rep?). sodgame itself never wired it to reinforcements (LIMITATIONS.md) — NOMAD hasn't decided either. |
| **Item durability + condition** — `durability_max` on every item, `condition_range` on loot, repair actions | `data/items.json`, `data/loot_tables.json` | **Half-designed.** VEHICLES brief names "condition ranges on found gear" as a next step; swarm prompt §6 says weapons/armor lose durability, repair at workbench. No doc specs durability numbers, break behavior, or repair costs. Nothing in `ItemDef` can hold condition today. |
| **Disassembly** — every weapon yields materials (`disassembly_yield`) | `data/items.json` | **Absent.** No NOMAD doc mentions breaking items down. Cheap crafting-depth win, currently invisible. |
| **Food freshness / spoilage** — `freshness_hours` (canned food 336h) | `data/items.json` | **Absent.** No doc. (May be a deliberate skip — but it's unrecorded either way.) |
| **Turret** — auto turret recipe (electronics T3 + blueprint), turret structure | `data/recipes.json`, `data/blueprints.json`, `loot_military_t4`/`loot_special_t5` | **Absent as a buildable.** BASE_DESIGN defenses are palisade/gate/spikes/tower only; the turret — sodgame's only blueprint-gated craft — has no NOMAD home. |
| **Survivor traits** — 10 traits (optimist, cowardly, night_owl, ex_military…) | `data/traits.json` | **Named only.** ROADMAP Wave 8 says "traits/morale (sodgame's survivor sim DNA)" in one line. BASE_DESIGN specs jobs/labor in depth but never traits. |
| **Morale system + relationship graph** | `src/survivors/MoraleSystem.ts`, `RelationshipGraph.ts` | **Partially designed.** BASE_DESIGN covers morale only as a stockpile-starvation consequence. Morale events, inter-survivor relationships: undesiged. |
| **Starting roster** — Elena (medic), Mateo (mechanic/driver), Lina (stealth) with skill spreads + backgrounds | `data/survivors.json` | **Absent.** POIS doc notes sodgame's holdout analog was the roster; NOMAD has no designed recruit roster (Jonah/Kowalski are story NPCs, not recruits). |
| **Skill levels gating recipes** — 7 skills (combat/mechanics/medicine/stealth/driver/scavenging/leadership), `skill_req` per recipe, SkillProgression XP | `data/skills.json`, `data/recipes.json`, `src/survivors/SkillProgression.ts` | **Unreconciled.** ROADMAP Wave 9 designs *archetypes* (Scavenger/Brawler/Mechanic/Ghost) — a different model. No doc reconciles XP-by-use skill levels + recipe skill gates with the archetype trees. This gates crafting depth (see §D). |
| **Barter price table** — per-item barter values (AK 150, blueprint 220, fuel can 40…) | `data/traders.json` | **Partially designed.** Rep-gated traders are designed (VEHICLES brief steal #6); the price economy itself is not ported anywhere. `valuables` has no designed sell prices. |
| **Noise class table (full)** — 11 classes incl. vehicle idle 30m, vehicle crash 150m, explosion 200m, container-force 45m | `data/noise_classes.json` | **Partially designed.** ROADMAP Wave 3 quotes 3 values (crouch 2m / sprint 14m / gunshot 80m). The full class table + which NOMAD actions map to which class is undesigned. |
| **Visibility / light exposure stealth** — VisibilitySystem + LightIndicator UI | `src/stealth/VisibilitySystem.ts`, `src/ui/LightIndicator.ts` | **Absent.** NOMAD stealth design is noise-only; light/shadow exposure never mentioned. |
| **Biome → loot/POI weighting** — 7 biomes with loot-tier weights, POI-category weights, ambient tags, zombie density | `data/biomes.json` | **Absent as a system.** NOMAD has its own `biomeAt` (beach/dune/forest/town/marsh/water) for terrain, but biome-driven loot tiers and POI weighting were never ported into any doc. |
| **Grid inventory + item footprints + nested containers** | `data/containers.json`, `src/inventory/GridInventory.ts` | **Not carried over (implicitly rejected).** NOMAD uses slot-count inventory; DECISIONS.md records click-to-select as an honest cut. No doc ever explicitly decided against the grid — flagging so the rejection is on record, not accidental. |
| **Vehicle trunk as container** (sedan trunk grid 5×4 / 300kg) | `data/containers.json`, `src/vehicles/CargoManifest.ts` | **Partially designed.** POIS roster specs cargo kg per vehicle; trunk-as-lootable-container UI is undesigned. |
| **Generator extra tank upgrade** | `data/upgrades.json` | **Absent** (the other upgrade, vehicle bullbar, *is* in POIS §4.1 as RAM tier). |
| **Facility power grid as a player system** — per-facility kW draw vs generator output | `data/facilities.json`, `data/structures.json` (diesel generator 3kW, powered gate) | **Designed** in BASE_DESIGN §3.3 (power column, generator = only upkeep) ✓ — listed here only to confirm coverage. |
| **Horde controller states** (wandering → migrating → sieging) | `src/ai/HordeController.ts` | **Designed** via Event Catalog #6 + BASE_DESIGN siege contract ✓. |
| **Road network graph** (POI graph, spline edges) | `src/worldgen/RoadNetwork.ts` | **Assumed, never designed for the island.** ROADMAP Wave 7 says vehicles spawn "on roads"; VEHICLES brief convoys need routes. The current island has **no roads at all** (see §B). No doc designs the island road network. |


---

## B. DESIGN → BUILD gaps

Everything specced in the design docs but **not in current `src/`**, grouped
by system. `NOT STARTED` = zero code. `PARTIAL` = some shipped, gaps listed.

### POIs / buildings

- **NOT STARTED — new island POIs:** strip mall, marina/boatyard, military
  base / Coast Guard station (east cape), gas station, barn/farm, warehouse,
  school, raider fort (dunes), faction outposts ×2 (relay + dunes). Currently
  the island has 9 POIs in `POI_DEFS` (shore_camp, jonah_camp, wreck, town,
  forest_cache, relay_station, dune_cache, lighthouse_base/top) — no
  commercial/industrial/military POIs at all.
- **NOT STARTED — POI mechanics:** respawn clocks (7–21d re-roll), alarm
  behavior, locked containers (farmhouse locker tier-mix), disturbed-state
  visuals for looted containers (the "Empty X" label ships on furniture; open
  fridges / ransacked dressers do not), loot condition ranges on gear.
- **NOT STARTED — Houses v2:** stairs/ramps, 2nd floors, basements, rich
  tier, safes + cracking risk, garage rooms, vehicle-part items beyond
  placeholders, pad registry for vehicle spawns.
- **NOT STARTED — House variants designed but unbuilt:** tent, colonial,
  split-level, beachfront estate, modern villa, brick colonial, compound.
  Built: ranch, bungalow, farmhouse, cabin, shack, leanto, ruin — note
  `bungalow`/`farmhouse` are **not in HOUSES_DESIGN's variant list**
  (variant naming mismatch, see §C). Keeper's house at lighthouse_base
  (HOUSES_DESIGN placement) is not in the placements list.
- **NOT STARTED — Holdout staging:** shore_camp claim, claim post, clear-40m
  rule, palisade ghosts, Base tab. The tutorial-arc from POIS §2 has no code.

### Vehicles (entire system NOT STARTED — zero vehicle code in src/)

- 13-vehicle roster meshes (specs exist, no meshes, no placement).
- Driving: controller, collision with colliders/husks, terrain response.
- Fuel burn / condition wear / top-speed floor (math exists in docs only).
- Repair: parts-at-garage vs field-capped-60% — no repair action anywhere.
- Persistence + vehicle beacon on the sat phone map.
- Trailers: hitch rules, box/flatbed/tanker/car-carrier meshes, towing.
- Bike slots: snap-in loading, weight feeding burn calc.
- Upgrade ladder: A1 scrap-plated / A2 welded / tuned / racks / bullbar /
  lift kit — none of these have items, recipes, or code.
- Manufacture (ATV/sedan/skiff rebuild at Garage T3 + Machine Shop T2).
- Vehicle noise on the noise bus (idle/drive radii per vehicle).
- **Island road network** — no roads exist; convoys and "vehicle spawns on
  roads" (ROADMAP Wave 7) both need one.

### Items / recipes

- **NOT STARTED:** `valuables`, `wood` (+ tree harvesting — hatchet exists,
  wood doesn't), `gun_parts`, `produce`, `lockpick`, `tool_kit`,
  `circuit_board`/`electronics`, `gunpowder`/`brass`/`lead`, `seeds`,
  `grenades` (frag/molotov/flashbang), **armor items** (vest, plate carrier,
  helmet — no `armor` category, no damage-mitigation stat; block is the only
  mitigation in the game).
- **PARTIAL — recipes:** 14 shipped (5 field + 9 station). Target from docs
  is ~25 with the vehicle economy fully wired. Missing classes: repair kits,
  weapon maintenance, turret, ammo beyond 9mm/shells/rifle, medical above
  medkit, vehicle upgrades, traps (spikes/rain barrel have no recipes).
- **PARTIAL — crafting model:** instant, free crafting with no timers, no
  skill requirements, no blueprint items, no workstation storage. Facility
  tiers (T1–T3, staffed, power-drawn) exist only in BASE_DESIGN — the three
  world stations (workbench/chemistry/industrial) are proximity-gated
  unlocks, not the tier system.
- **NOT STARTED:** durability/condition, disassembly, item mods, barter
  prices for traders, workstation inventories.

### Husks / mobs

- **PARTIAL — husk roster:** only `shambler` + `stalker` exist in
  `KIND_STATS`. sodgame's runner is roughly the stalker; **screamer, brute,
  crawler, bloater** (ROADMAP Wave 2) are zero-code. **Military husks**
  (armor, military loot) are zero-code.
- **NOT STARTED:** special-husk abilities (lunge, scream/horde-call,
  armor-break, ankle-grab, toxic explosion + gas cloud), husk condition
  drops tied to zone, horde controller, Static surge buffed spawns.

### Factions

- **PARTIAL:** rep store exists (`-100..100` + `repTier`) but tiers differ
  from the sodgame standard quoted in docs (see §C); two in-slice factions
  (Lighthouse Collective, The Pier) have dialogue and quest rep — and
  **zero interaction beyond that** (no traders, no patrols, no rep effects).
- **NOT STARTED:** rep-gated traders, physical convoys, raider roadblocks,
  raids/ambushes on the player, takeover-branding kit, the three main bases,
  faction guards/patrols, witness-scaled rep consequences, caravan escort.

### Events

- **NOT STARTED — the entire 12-event catalog:** no event director, no
  convoy interdiction, no roadblocks, no supply drops, no distress-call
  rescues, no broken-down stranger, no migrating hordes, no siege nights,
  no caravan escort, no Remnant sweep, no Static surge, no stranded boat,
  no trader caravan. Story beats exist only as the 6-quest lighthouse chain.

### Base building (BASE_DESIGN — fully designed, zero built)

- Claim system, facility slots/tiers, prefab ghosts + placement, stockpile,
  labor rules (×1.5 solo, Builder gates), survivor jobs/staffing, power
  grid, comfort, salvage rig, fish traps, heat formula + readout, siege
  nights, watchtower guard combat, relocation refunds. **All of it.**

### Survivors / skills

- **NOT STARTED — survivors:** no recruiting, no traits, no morale, no jobs,
  no staffed production, no survivor injury/death. Jonah and Kowalski are
  static dialogue NPCs.
- **NOT STARTED — skills:** nothing in the store. Both candidate models
  (sodgame-style skill XP + recipe gates; ROADMAP Wave 9 archetype trees)
  are unbuilt and unreconciled (see §A).

### Search & stealth

- **PARTIAL:** per-action noise radii exist for player actions (pistol 60m,
  crouch halves husk hearing radius) but there is **no noise-class table,
  no HUD noise meter**, no hold-to-search (all loot is instant), no
  lockpick/forced entry, no stealth tools, no visibility/light system.

### Ambiance / visuals (ROADMAP Wave 1)

- **NOT STARTED:** depth of field, realistic clouds, tighter TP fog / reduced
  far visibility, light shafts, wind-audio-linked grass motion. (Day/night
  cycle, stars, and the ambience loops ship; this is the polish pass only.)

### Story / regions (canon per MEMORY 2026-10-20)

- Lighthouse ending ships (light/dark choice) — **1 of the prompt's endings**;
  the canon reframes it as the "leave the island" gate but no gating code
  for it as a region transition exists.
- OBX → Norfolk/Va Beach → D.C. regions: NOT STARTED. Cure → hardmode pivot
  (government + new factions + new tech tree): NOT STARTED. Side quests:
  pinned by design, not built. Stage 2: not started.


---

## C. CONTRADICTIONS

Doc-vs-doc and doc-vs-src disagreements. Each entry names both sides; the
fix is a one-line edit to the losing side, but until it's made, waves will
be built from conflicting specs.

1. **Which factions? (the big one)**
   - BASE_DESIGN + POIS_FACTIONS_VEHICLES are built on sodgame's three:
     Military Remnants, Survivors Union, Rust Skulls — with main bases and
     a takeover kit designed for them.
   - `src/data/factions.ts` + quests + dialogue instead define six NOMAD-
     original factions (Lighthouse Collective, The Pier, The Refuge,
     Tollkeepers, The Drowned, Hollow Market) — Kowalski's Collective is
     the story spine and gates the ending.
   - No doc reconciles the two sets. Do Remnants/Union/Skulls replace the
     island's minor factions, join them, or belong to the mainland/hardmode
     era? Unanswered — and it gates every Phase-3 build.
2. **Rep tier thresholds**
   - VEHICLES brief (§4, quoting sodgame as the port target): Allied ≥75 /
     Friendly ≥25 / Neutral / Wary / Hostile ≤−10 / War ≤−75.
   - `src/data/factions.ts` `repTier()`: Hostile ≤−50 / Wary ≤−10 /
     Neutral <10 / Friendly <50 / Allied ≥50. Same scale, different bands —
     trader gates (e.g. quartermaster ≥75) mean different things in each.
3. **Item availability — BASE_DESIGN §3.8 is stale**
   - §3.8 lists `tire`, `engine_part`, `car_battery`, `valuables` as
     "already specced, unimplemented." §3.3 was corrected, §3.8 was not.
   - Reality: `tire`, `engine_part`, `car_battery`, `fuel_can`, `chemicals`
     are in `items.ts` with station recipes. Missing for real: `valuables`,
     `wood`, `gun_parts`, `produce` (and POIS §6 repeats the stale list,
     asking Wave 4 to "land" items that already landed).
4. **Station model**
   - BASE_DESIGN: workbench is Facility T1 at *your base*; medkit crafting
     is listed under Workbench T1 effects; Machine Shop is a T3 facility
     that fabricates `engine_part`/`gun_parts`.
   - `src/`: three fixed world stations named **Weapons Bench** (jonah/town),
     **Chemistry Station** (relay — where the medkit recipe actually lives),
     **Machine Shop** (no world instance exists; its 3 recipes are gated on
     a station the player can never stand next to until bases exist).
   - Station names, locations, and which recipes belong where disagree
     between the design and the build.
5. **Town: claimable prize vs. Union's home**
   - BASE_DESIGN §3.1–3.2: town is home-eligible, cost 40 scrap + 3
     survivors, the "prize base."
   - POIS §1/§3: town is the Survivors Union's main base — taking it means
     "negotiating with (or displacing) the Union."
   - Both can be true in sequence, but neither doc says so; as written they
     describe two different games.
6. **Faction name for the sat phone**
   - VEHICLES brief and BASE_DESIGN repeatedly say "AppBoy" (event log,
     map, Base tab). The shipped build renamed it **Sat Phone** everywhere
     (item, UI header, quests). Docs need a sweep; harmless until a wave
     builds "AppBoy" UI from the brief.
7. **Vehicle roster naming/scope**
   - VEHICLES brief's Vehicle Design table: 6 vehicles incl. an "Armored
     SUV" (Remnant surplus, endgame).
   - POIS §4: 13 vehicles; the endgame armor slot is the 6x6 APC, drivable
     at rep ≥75. No armored SUV in the roster.
   - POIS supersedes — but the older brief is what a builder will find first
     in the file list order (both live in repo root, undated ranking).
8. **Tanker capacity**
   - VEHICLES brief §1 reports sodgame's tanker at 10,000L without a NOMAD
     ruling; POIS §4.2 rules 2,000L ("a refinery, not a trailer").
   - BASE_DESIGN's Garage T2 fuel siphon trickle is uncapped; POIS §5
     proposes capping stored fuel at the tanker's 2,000L. **Open** — the
     proposal is recorded, not accepted anywhere.
9. **Noise numbers**
   - ROADMAP Wave 3: gunshot ~80m, sprint ~14m (matches sodgame's
     `noise_gunshot_unsuppressed` 80m).
   - `src/` Combat: pistol noise 60m. Sprint noise isn't a class at all.
   - When Wave 3 builds the noise-class table, one of these wins.
10. **House variants + sizes**
    - HOUSES_DESIGN suburban tier: ranch (8×10m), colonial, split-level,
      ruin; camp tier: lean-to, tent, shack, cabin.
    - `src/` Houses.ts VARIANTS: ranch (9×7.5m), bungalow, farmhouse,
      cabin, shack, leanto, ruin — colonial/split-level/tent absent,
      bungalow/farmhouse undesigned, ranch dimensions differ.
    - Placement counts also differ: HOUSES_DESIGN wants town 3 suburban +
      1 rich + 2 camp and a rich keeper's house at lighthouse_base; shipped
      placements are town 3 suburban + 2 camp, no rich anywhere.
11. **ROADMAP internal duplication** — the "Wave 1 — Ambiance / feel"
    section appears twice, verbatim. Harmless but it makes wave numbering
    ambiguous in references ("Wave 1" is also Ian's priority-list slot for
    buildings-adjacent work in conversation).
12. **Minor stale claims**
    - DECISIONS.md/PROGRESS.md: CI workflow "written" vs "could not be
      pushed (token lacks workflow scope)" — PROGRESS is the true one.
    - OPEN_QUESTIONS.md references `src/data/geo/anchors.json` "(to be
      added)" — it never was; POI anchors live in `POI_DEFS`.
    - BASE_DESIGN says phone gains a "Base tab"; shipped Phone tabs are
      LOADOUT / WORLD / COMMAND. (Subsumed by #6's sweep.)

---

## D. RECOMMENDED BUILD ORDER

Aligned to Ian's stated focus (2026-10-20): **buildings + vehicle models
first**, then item models, vehicles + physics, weapon mods, visuals, mobs,
special mobs — with crafting-tree depth and skill trees flagged where they
gate other work. Gates are called out explicitly; everything else is
independent and can be reordered freely.

1. **Buildings wave (Ian priority #1)**
   - Houses v2: stairs/2nd floors/basements, rich tier + keeper's house,
     safes (cracking lands with Wave 3 below), garage rooms + **vehicle
     pad registry** — the pads are the spawn contract Wave 3 vehicles read.
   - Fix §C #10 by deciding the variant list once (recommend: adopt the
     built bungalow/farmhouse into HOUSES_DESIGN and cut colonial/split-
     level to v3) so design and generator stop drifting.
2. **Vehicle models wave (Ian priority #2)**
   - Meshes for roster sub-wave ① (sport bike, motocross, ATV, sedan,
     pickup, skiff) + trailers box/flatbed; static placement on pads/roads.
   - **Gate:** the island needs a **road network** first (even a simple
     spline set through town/relay/dunes) — vehicles and convoys both
     assume roads that don't exist yet (§A).
   - Item models in the same pass: ground/hand meshes for the items that
     lack them (`valuables`, `wood`, `gun_parts`, `produce` when added),
     plus armor models (vest/plate/helmet) so Wave 5 has something to show.
3. **Items + crafting depth (gates vehicles for real)**
   - Land the missing items: `wood` + tree harvesting, `valuables`,
     `gun_parts`, `produce`, `lockpick`, `tool_kit`, ammo components
     (gunpowder/brass/lead).
   - Recipe book to ~25; **craft timers + skill requirements** — but first
     resolve §A's skills contradiction (sodgame skill-XP vs Wave-9
     archetypes). Recommendation: skill XP by use is the substrate,
     archetypes are capstone specializations on top; decide before Wave 4
     content is written, because recipe `skill_req` fields depend on it.
   - Durability/condition + repair recipes + disassembly (cheap, deepens
     every loot decision; `ItemDef` gains a condition field).
4. **Vehicles + physics wave**
   - Drive model (arcade, "advanced but not too advanced"): fuel/condition/
     noise per the ported math, repair (parts at bays, field cap 60%),
     persistence + map beacon, trailers + hitch, bike snap-in loading,
     upgrade ladder (A1/A2/ENG/CRG/RAM/lift) as Machine-Shop work.
   - **Gate:** needs Wave 1's pad registry + Wave 3's parts economy +
     garage bays (BASE_DESIGN ties Garage T1–T2 to this wave deliberately).
5. **Weapon mods wave**
   - Design first (it's currently a name, §A): optic/suppressor/extended-
     mag slots, per-weapon compatibility, stat effects, mod items + meshes,
     install UI. Suppressor must hook the noise-class table (Wave 6) or
     it's cosmetic.
6. **Search & stealth wave (ROADMAP Wave 3)**
   - Noise-class table + HUD meter (settle §C #9), hold-to-search, lockpick
     + forced entry (unlocks farmhouse-style locked lockers + safes),
     stealth tools (rock/boombox), alarm behavior decision (§A) — do this
     before faction POIs so alarms ship with their POIs, not after.
7. **Visuals wave (ROADMAP Wave 1)**
   - DoF, clouds, tighter TP fog, light shafts — cheap, high-feel, zero
     dependencies. Can float earlier if a breather wave is needed.
8. **POI creation wave (ROADMAP Wave 6)**
   - Strip mall, marina/boatyard, gas station, barn/farm, warehouse,
     school, military base shell, raider fort — each with loot scenes,
     respawn clocks, density/alarm flags from the POIS inventory. Feeds
     waves 9–10 (factions need their bases to exist).
9. **Mobs wave**
   - Runner formalized (stalker tuning), military husks at the military
     base, horde controller, zone-tied husk loot tables extended.
10. **Special mobs wave**
    - Screamer, brute, crawler, bloater + abilities. After core husks feel
      right; abilities (scream → horde-call) depend on the horde controller
      from step 9 and the noise system from step 6.
11. **Systems waves (Phase 2/3, in dependency order)**
    - Base building v1 (claim + T1 facilities + prefabs + heat readout) —
      gates on survivors for its ceiling but its v1 slice is player-labor
      only, so it can start any time after step 3.
    - Survivors (recruiting, traits, jobs, morale) — traits need a design
      pass first (§A); recruiting hooks Event #4 (distress rescue).
    - Skills/archetypes — substrate decision in step 3; trees ship here.
    - Factions as systems (traders, convoys, roadblocks, takeover kit) —
      gates on §C #1 (which factions exist) and step 8's bases.
    - Event director + the 12-event catalog — last of the island systems;
      nearly every event consumes two or more systems above.
12. **Regions + hardmode (canon)**
    - OBX → Norfolk/Va Beach → D.C. at 1/10 scale, ring scaler ported,
      cure → government + new factions + tech tree, Stage 2 after an
      ending. Side quests stay pinned until the event director exists to
      carry them.

**Three decisions that unblock the most work** (recommend resolving before
the next build wave): §C #1 (faction set), §A skills model (skill-XP vs
archetypes), §A alarm behavior. Each is a paragraph of design, and each
currently blocks a named wave.
