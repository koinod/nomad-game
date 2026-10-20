# NOMAD — Vehicles, Factions & Events Design Brief

**Source:** deep-dive of sodgame (Ian's 2025 2D survival sandbox, TS/Vite) — `src/vehicles/`,
`src/factions/`, `src/progression/`, `data/*.json` — read 2026-10-19.
**Purpose:** steal the proven systems, name the stubs honestly, and re-lens each one for a
3D 2026 open-world survival game (Far Cry event density, RDR2 systemic detail).
NOMAD context assumed: Outer Banks island live now; Phase 2 = crafting/building/recruit/
vehicles/skills; Phase 3 = factions + story + map depth; Phase 4 = road to D.C. at 1/10 scale.

---

## 1. Vehicles

### (a) How sodgame did it — evidence
- 3 vehicles (`data/vehicles.json`): Sedan (4 seats, 300kg cargo, 40L, 12 m/s, 200 HP),
  Pickup (600kg, 60L, 14 m/s, 260 HP, trailer-capable), Semi Tractor (200L, 500 HP,
  **requires** a trailer to carry anything).
- `VehicleDirector.ts` (499 lines, fully wired in `Game.ts`): arcade drive model,
  fuel burn `0.18 L/s × speedRatio × (1 + loadFactor×2)`, refuel with fuel can **+20L** (Y key),
  condition wear `0.02/min × speedRatio × (1 + load)`, and condition **scales top speed**
  (floor 45% at 0 condition). Noise emitted to the stealth bus every 0.75s
  (idle intensity 25, driving 45–60 by class).
- Trailers (`data/trailers.json`): Box (12×20 grid, 5000kg, lockable, can carry a vehicle),
  Flatbed, Tanker (10,000L fuel). `CargoManifest.ts` is a real grid-packing inventory —
  weight + footprint, and cargo weight feeds back into fuel burn and wear.
- **Honest gaps:** only 3 hardcoded spawn points, all vehicles spawn at 100% fuel/condition.
  `TrailerHitch.ts` is 28 lines — attach is instant state, no physics. `MaintenanceUI.ts`
  is **display-only**: there is no repair action anywhere in the code. Condition only goes down.

### (b) The loop / fantasy it serves
Logistics as survival: a vehicle is a mobile base — range limited by fuel, capacity by cargo
grid, reliability by condition. Every trip is a resource equation (distance × load × noise),
and noise means driving is never free: the engine calls husks the way gunfire does.

### (c) 2D limits
Top-down rectangles, no terrain, no collision consequence, no verticality, no weather.
Convoys and traffic don't exist — the player's vehicle is the only moving thing on the map.
Repair was designed (maintenance panel) but never implemented.

### (d) NOMAD elevation — 2026 3D lens
- **Repair becomes the loop sodgame skipped:** condition restored only with vehicle parts
  (`tire`, `engine_part`, `car_battery` — already specced for garage loot in HOUSES_DESIGN.md)
  at a garage bay or in the field at reduced effect. A dead truck mid-island is a story,
  not a softlock: you walk, you remember, you come back with a battery.
- **Physical traffic:** faction convoys and raider patrols actually drive (see §4) — the road
  becomes contested space, Far Cry-style. Your truck vs. their truck is an encounter, not a menu.
- **RDR2 detail:** vehicles persist where you left them (sodgame already saves pos/fuel/
  condition — keep that), accumulate visible damage, leak fuel when shot, and husks react to
  engine noise with real radius falloff (NOMAD's noise system already exists).
- **Boats.** sodgame has none; NOMAD is the Outer Banks. A skiff between islands is the
  signature vehicle — fuel + condition + beaching, and the water stops being a wall.

→ Full vehicle spec in **Vehicle Design** below.

---

## 2. POIs & Loot Tables

### (a) How sodgame did it — evidence
- 7 POI types (`data/poi_spawns.json`), each with: `spawn_chance` (0.2–0.8), min/max per chunk,
  `respawn_days` [7–21], `zombie_density` 0.7–1.8, `alarm` silent/active, `is_major`,
  biome allowlist, and a default loot table.
- 7 loot-scene templates (`data/poi_templates.json`): each POI instantiates 2–3 containers at
  fixed offsets — fridge/duffle/crate/locker — each bound to a loot table, some `locked: true`.
  The farmhouse's locked locker pulls **industrial T3** inside a residential T1 building:
  tier mixing is deliberate, loot ≠ building tier.
- 5 loot tables (`data/loot_tables.json`): weighted entries with `qty_range` for consumables
  and `condition_range` for gear — a T1 pistol spawns at 50–100% condition; T5 gauss rifle at
  70–100%. Tier = rarity **and** quality floor.
- Containers (`data/containers.json`): `search_seconds` 1.2–2.5 (hold-to-search), lockers
  `locked` with `lock_difficulty` 2, grid sizes per container type.

### (b) The loop / fantasy
Scavenging as route planning: you read a POI's tier/density/alarm before you commit, loot
respawns on a 1–3 week clock so the map is a rotation, not a strip-mine, and locked
containers make noise-vs-reward a decision every single room.

### (c) 2D limits
Templates are 2–3 containers in a rectangle — no verticality, no room identity, no
sightlines. Alarm is a flag with a timer controller behind it; per `docs/LIMITATIONS.md`,
alarms never actually call faction reinforcements. Respawn timers exist in data; the
re-roll path is thin.

### (d) NOMAD elevation — 2026 3D lens
- NOMAD's houses v1 already ports the template idea (furniture → tier tables). Next step is
  sodgame's two missing teeth: **respawn clocks** (looted houses re-roll on a 7–16 day timer,
  so the island sustains a long run) and **condition ranges on found gear** (a found pistol
  at 40% condition is a crafting problem, not just loot).
- **POIs as event stages:** every POI template gets an event slot (see Event Catalog) — the
  military checkpoint isn't just T4 loot, it's where a Remnant sweep can start.
- **RDR2 detail:** containers remember being opened (NOMAD already stages loot per box);
  add disturbed-state visuals — open fridges, ransacked dressers — so a looted street *reads*
  looted, and a fresh one reads as opportunity from 50m away.

---

## 3. Crafting & Facilities

### (a) How sodgame did it — evidence
- **Honest headline: only 3 recipes exist** (`data/recipes.json`) — bandage (hand, 10s),
  7.62 ammo ×30 (workbench T1, mechanics 2, 45s), auto turret (electronics T3,
  electronics 4, 180s). The *structure* is complete — `station`, `skill_req`, `time_seconds`,
  inputs, output with condition — the content was never filled in.
- 5 facilities (`data/facilities.json`), 1–2 tiers each: Workshop (parts 1.5→3/hr),
  Infirmary (meds 0.5→1.2/hr), Hydro Farm (food 3→5/hr), Radio Tower (**intel** 0.5/hr),
  Garage Bay (fuel 1/hr + parts 0.8/hr). Each tier: `power_kw` 0.4–1.2, job slots
  (mechanic/medic/farmer/scavenger/leader), build cost in materials, build time 120–260s,
  tier 2 gated by blueprint items.
- **Honest gaps** (Ian's own `docs/LIMITATIONS.md`): facility production does **not** consume
  upkeep or fuel, blueprint gating is data-only, crafting uses the player's inventory as both
  input and output — no workstation storage, no survivor job hand-off. The loop is scaffolded,
  not closed.

### (b) The loop / fantasy
The base as an economy: survivors staff facilities, facilities convert time + power into the
resources runs consume, blueprints are the progression currency. Radio Tower producing
*intel* is the standout — information as a resource that feeds the raid planner (§4).

### (c) 2D limits
Production is numbers on a panel. No one walks to the workshop, nothing animates, power is a
stat that nothing spends. Crafting time passes without world consequence.

### (d) NOMAD elevation — 2026 3D lens
- **Crafting tables first, facilities second** (already on NOMAD's roadmap): a workbench in a
  garage is a place you *go*, with the recipe list sodgame structured but never wrote —
  ammo reloading, medkit, vehicle repair kits, weapon maintenance. Fill the table to ~25
  recipes using NOMAD's existing items before inventing new ones.
- **Close the loop sodgame left open:** facilities consume fuel/upkeep; a staffed survivor
  visibly works the station; production pauses when the staffer is sick, scared, or dead.
  Consequence honesty is the brand.
- **Blueprints as POI rewards:** tier-2 facility blueprints live in T4/T5 loot (military base
  armory, convoy cargo) — crafting progression and the events layer fund each other.
- Power becomes real in 3D: a generator you fuel, hear, and defend — and its noise radius
  feeds base heat (§5).

---

## 4. Factions, Convoys & Raids

### (a) How sodgame did it — evidence
- 3 factions (`data/factions.json`): Military Remnants (rep default **−50**, outposts: airbase
  + checkpoint, trader: quartermaster), Survivors Union (**+25**, town hall, trader: medic),
  Rust Skulls raiders (**−30**, raider fort, **no trader** — null by design).
- `FactionManager.ts`: rep clamped −100..100, named standings Allied ≥75 / Friendly ≥25 /
  Neutral / Wary / Hostile / War ≤−75. Traders (`data/traders.json`) are **rep-gated**:
  Union medic needs ≥25; the military quartermaster — weapons, ammo, blueprints — needs ≥75,
  i.e. you must *earn* the best shop in the game from a faction that starts hostile.
- Convoys (`data/convoys.json`): only **2 definitions** — military tech convoy (9 guards,
  3 escort vehicles, 6h interval, cargo = turret blueprint + circuits + 7.62) and Union supply
  (3 guards, 1 escort, 12h, food/bandage/fuel).
- `ConvoyScheduler.ts`: state machine scheduled → **intel** (revealed 1h before departure) →
  enroute (1h) → cooldown (2h post-ambush). `RaidPlanner.ts` + UI: track a convoy, ambush it.
- **Honest gap — the big one:** the ambush is **abstract**. It's a button in a menu that
  resolves instantly: cargo drops into your backpack (overflow spills into a ground cache),
  rep −20, done. Guards and escort vehicles are numbers in the data — **no convoy ever
  physically drives the road graph**. `RoadNetwork.ts` builds a real POI graph with spline
  edges, and nothing travels on it.

### (b) The loop / fantasy
Intelligence-driven predation: learn a schedule, pick your moment, pay reputation for loot.
The fantasy is *planning* — the raid planner is a war-room table, and rep makes every ambush
a strategic cost, not free money.

### (c) 2D limits
Exactly the above: the war-room exists, the war doesn't. No interception geometry, no chase,
no escape, no witnesses, no improvisation.

### (d) NOMAD elevation — 2026 3D lens (the Far Cry core)
- **Convoys become physical.** On the Phase 4 D.C. road (and island roads before it), convoys
  are real vehicles + guards driving a route. The sodgame scheduler survives as the *intel
  layer*: Radio Tower / satphone / a bribed trader reveals departure + route; the ambush
  itself is played — spike strip, blocked bridge, sniped driver, or a tail-and-grab.
- **Choices mid-event:** loot and run vs. strip the escorts' vehicle vs. take a prisoner for
  intel. Rep consequences scale with witnesses and lethality (−20 flat becomes a spectrum).
- **Raiders invert the relationship:** Rust Skulls don't just wait to be raided — at high base
  heat or low rep they ambush *you* (roadblocks, camp raids). Far Cry's outpost/patrol
  pressure, driven by NOMAD's own heat + rep state.
- **Caravans as the friendly mirror:** Union/Collective supply caravans you can escort,
  trade with on the road, or rob — same system, opposite sign. One convoy engine, three
  factions, every encounter morally priced.
- NOMAD already has the rep substrate (Collective/lighthouse rep gates the ending) — extend
  that store, don't invent a second one.

---

## 5. Progression & Events

### (a) How sodgame did it — evidence
- **Distance rings** (`data/progression_curve.json` + `DifficultyScaler.ts`): 5 rings
  (5/15/30/50/75 km) — each ring raises loot tiers (T1 → T4+T5), shifts the zombie spawn mix
  (shamblers 0.9 → runners/brutes/screamers/crawlers, bloater boss at ring 5), spawn target
  `16 + ring×6 + communityPower`. Wired live: `ProgressionController` feeds
  `ZombieDirector.applyDifficulty()` every tick.
- **Base heat** (`BaseHeatTracker.ts`): score = stockpile value ×1.2 + defense ×0.8 +
  days survived ×0.5, thresholds **30/60/90**, crossing one emits "Siege threat increased
  to level N." **Honest gap:** that's all it does. The controller renders heat on a panel;
  **no siege ever spawns**. The punishment half of the loop was never built.
- **Seasons** (`SeasonManager.ts`): 30-day rotations — spring rain/mud, summer heat
  exhaustion, fall fog, winter blizzards + fuel burn. **Honest gap:** effects are string
  labels; nothing in the code consumes them.
- **Hordes** (`ai/HordeController.ts`, inside ZombieDirector): wandering → migrating
  (1%/s roll, target = player position) → sieging within 25 units. Minimal but real —
  the only ambient "event" that actually moves.
- **There is no random/dynamic event director.** No supply drops, no rescues, no ambient
  encounters. Events in sodgame are *system states* (convoy windows, heat stages, horde
  migrations), never *scenes*.

### (b) The loop / fantasy
Escalation honesty: the world gets harder because you got richer and ranged further —
wealth attracts sieges, distance attracts worse husks. Survival as a rising tax on success.

### (c) 2D limits
The escalation is all arithmetic, no theatre: a warning string instead of a siege, a label
instead of weather. The systems *know* what should happen; the game never stages it.

### (d) NOMAD elevation — 2026 3D lens
- **Stage everything sodgame only counted.** Heat crossing 60 = scout activity around your
  camp; 90 = an actual siege night (raiders or a horde, telegraphed by the Radio Tower /
  satphone a day ahead — warning is a *gameplay verb*, not a toast).
- **Rings become geography:** NOMAD's island is ring 1–2; the mainland road to D.C. is
  rings 3–5 — loot tier and husk mix shifting with distance from the lighthouse. The scaler
  is already proven math; port it nearly as-is.
- **Seasons get teeth or get cut:** in 3D, fall fog and winter fuel burn are cheap (fog
  density + burn multiplier — both systems exist). Don't ship string-label seasons.
- **The event director is the new build** — see the catalog. This is the single biggest
  delta between sodgame and a 2026 game, and it's the Far Cry lesson: *the open world must
  interrupt the player with priced choices.*

---

## Event Catalog — NOMAD (Far Cry lens)

Director rules for all events: telegraphed (sound/visual/radio cue), priced (every reward
has a risk or a rep cost), escapable (ignoring an event is always valid), and logged to the
AppBoy so the world feels remembered.

| # | Event | Trigger | Player choices | Reward / Risk | Faction tie |
|---|---|---|---|---|---|
| 1 | **Convoy interdiction** | Intel window (Radio/satphone) + convoy enroute on road | Ambush, tail & strip, or let it pass | Cargo (blueprints/ammo) / rep −, guards, noise | All 3 — victim faction pays the rep cost |
| 2 | **Raider roadblock** | Low Rust Skulls rep or high heat; road chokepoints | Pay toll (loot), fight, off-road detour | Keep cargo / combat + vehicle damage | Rust Skulls |
| 3 | **Supply drop** | Random + post-quest beats; smoke column visible island-wide | Race husks/raiders to the crate; booby-trap risk | T4 loot / it's a magnet — everyone comes | Military Remnants (it's theirs) |
| 4 | **Distress call rescue** | Radio range of a pinned survivor | Rescue, loot the scene, or ignore | **Recruit** (survivor system) / time + ammo cost | Union/Collective rep + |
| 5 | **Broken-down stranger** | Roadside vehicle POIs | Repair with parts (Mechanic), rob, or pass | Rep +, trade discount / parts cost | Union; raider fake-out variant (ambush) |
| 6 | **Migrating horde crossing** | Horde director; paths cross roads/camps | Hide & wait, divert with noise/flares, fight through | Safe passage / noise cascade, screamer risk | None — the Static's weather |
| 7 | **Siege night** | Base heat crosses 90 (warned at 60/75 by radio) | Defend, evacuate stockpile, or abandon camp | Keep base / lose stockpile + facilities | Raiders (loot-driven) or horde (heat-driven) |
| 8 | **Escort the caravan** | Union/Collective caravan departing a POI you're at | Escort (paid), ride along, ambush it yourself | Pay + rep / protection duty under fire | Union + / Rust Skulls if you betray |
| 9 | **Remnant sweep** | Military patrol checks POIs on a schedule | Hide contraband, bribe, fight, run | Keep T4+ gear / War-tier rep spiral | Military Remnants |
| 10 | **Static surge** | Story beats + rare random; The Static intensifies | Shelter (electronics fail, phone dies), or push through buffed husks | Surge zones drop relay parts / husks aggro-wider, specials spawn | Lore — feeds lighthouse endgame |
| 11 | **Stranded boat / wreck wash-up** | Shore POIs after storms (seasonal) | Salvage race vs. tide timer | Boat parts, cargo / drowning husks, tide clock | None / Union salvage rights |
| 12 | **Trader caravan at camp** | High Union rep; visits camps on rotation | Trade at road prices, host (morale +), rob (never again) | Rare stock without the trip / rep crater | Survivors Union |

Density target: one interrupt per ~6–10 minutes of traversal, never two majors stacked;
minors (6, 11) can overlap anything.

---

## Vehicle Design — NOMAD

| Vehicle | Role | Fuel | Condition/repair | Spawn |
|---|---|---|---|---|
| **Skiff (boat)** | Island-hopping, fishing runs | Small tank, sips | Engine part + patch kit | Shore camp dock, marina POI; some wrecked |
| **ATV** | Fast scout, 1 rider, tiny cargo | Small | Tire/battery common | Forest cache, farms |
| **Sedan/hatch** | Road car, balanced | Medium | All three parts | Town streets, driveways (dead until repaired) |
| **Pickup** | Cargo + trailer hitch, the workhorse | Medium-large | All three parts | Garages (suburban ~8% / rich ~18% per HOUSES_DESIGN), farms |
| **Box truck** | Base-moving hauls, huge cargo | Large, thirsty | Engine parts ×2 | Relay station, military base motor pool |
| **Armored SUV** | Endgame — Remnant surplus | Large | Rare parts, armory-gated | Military base only, T4 event reward |

Rules (ported from sodgame, hardened):
- Fuel burn scales with speed **and cargo weight**; condition scales top speed (floor ~45%);
  driving is **loud** (noise radius > sprinting) — vehicles trade stealth for speed, always.
- Repair = parts + place + time: full repair at a garage bay, field repair caps condition
  at ~60%. Found vehicles spawn at 20–60% condition and partial fuel — never free.
- Persistence: vehicles stay where left (position/fuel/condition saved, as sodgame did);
  the AppBoy map marks your vehicles. One "active" vehicle beacon at a time.
- Trailers: pickup + flatbed only at launch of the system; cargo grid-lite = weight cap,
  not sodgame's full packing grid (3D trunk UI is a Phase-later luxury).

---

## Ranked Steals — mapped to NOMAD's roadmap

| Rank | Steal | Source strength | NOMAD home |
|---|---|---|---|
| 1 | **Physical convoys + intel layer** (scheduler as intel, ambush played in 3D) | Scheduler real; physical half missing — biggest upside | Events layer, Phase 3 → Phase 4 road |
| 2 | **Event director + catalog** (telegraph → choice → priced outcome) | Absent in sodgame — build new, informed by its systems | Events layer across Phase 2/3 |
| 3 | **Base heat → staged siege** (keep formula, build the siege it promises) | Formula real, siege stubbed | Phase 2 base building + prefab structures |
| 4 | **Vehicle condition/fuel/cargo-weight model + parts repair** | Model real, repair stubbed | Vehicles wave (Phase 2), garage loot already specced |
| 5 | **Crafting tables → facilities** (fill the recipe book; close upkeep/staffing loop) | Structure real, 3 recipes only | Crafting tables wave → survivor recruiting (staffing) |
| 6 | **Rep-gated traders** (best shop earned from a hostile faction) | Fully real, cheap to port | Phase 3 factions; extends existing Collective rep |
| 7 | **Respawn clocks + gear condition on loot** | Data real, re-roll thin | POI/loot pass with houses v2 + military base POI |
| 8 | **Distance-ring difficulty scaler** | Fully real, proven math | Phase 4 road to D.C. (island = rings 1–2) |
| 9 | **Radio Tower intel as a resource** (production → raid planning) | Data real (0.5 intel/hr) | Satphone + crafting/facilities, Phase 2 |
| 10 | **Seasons with mechanical teeth** (fog density, fuel burn) | Labels only — implement or cut | Ambiance wave / Phase 3 |

**Bottom line:** sodgame's *math* is consistently better than its *staging*. NOMAD should
port the formulas and state machines nearly intact (heat, rings, rep, convoy schedule,
vehicle wear) and spend its 3D budget on the thing sodgame never built: playing these
systems out as physical scenes in the world.
