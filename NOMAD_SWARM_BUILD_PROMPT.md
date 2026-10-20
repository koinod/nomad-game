# NOMAD: One-Shot Build Prompt for Agent Swarm

**Save as:** `NOMAD_SWARM_BUILD_PROMPT.md`
**Target:** Playable 3D browser game, deployed on Vercel from GitHub.
**Status of sources:** Built from the Constitution, build sequences, AppBoy PRDs, and building spec. Coordinates and geography below are approximate and must be verified against a real source before final map lock.

---

## 0. MISSION

Build **NOMAD**, a single-player, open-world, third-person survival game set on the Outer Banks of North Carolina 18 months after "The Static." The game runs in the browser, deploys to Vercel from a GitHub repo, and is playable end to end from the Prologue to one of five endings.

**Definition of done:** A URL on Vercel where a new player can start a game, pick a difficulty, play the Prologue, complete Act 1 and Act 2 on the Outer Banks, cross to the mainland, reach the D.C. Exclusion Zone, reach an ending, save and reload at any safe point, and never hit a blocking bug.

**Non-goals for v1:** multiplayer, mobile-native builds, voice acting (use subtitles and synthesized placeholder audio), user accounts, backend servers. Saves are local.

---

## 1. TECH STACK (LOCKED)

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | Type safety across agents |
| Build | Vite | Fast, Vercel-native |
| 3D | Three.js + React Three Fiber + drei | Standard, well-documented |
| Physics | Rapier (`@dimforge/rapier3d-compat`) | Fast, deterministic-enough, handles vehicles |
| State | Zustand | Simple global store for game and phone state |
| UI | React + Tailwind | Phone UI is React DOM overlaid on canvas |
| Persistence | IndexedDB via `idb` | Larger than localStorage, versioned |
| Audio | Howler.js + WebAudio for procedural | Placeholders without asset dependency |
| Testing | Vitest (logic), Playwright (smoke/e2e) | Catches regressions per milestone |
| Lint/format | ESLint + Prettier | Enforced in CI |
| Hosting | Vercel (static build) | Required |
| CI | GitHub Actions: lint, typecheck, test, build, deploy preview | Required |

**No external art assets required.** All meshes are procedural low-poly primitives or simple GLTF-free geometry. Replaceable later.

---

## 2. REPO STRUCTURE

```
nomad/
  src/
    core/          # game loop, time, events, save, rng, difficulty
    world/         # terrain, chunks, biomes, POIs, day/night, weather
    entities/      # player, husks, survivors, vehicles, props
    ai/            # state machines, perception, noise, group behavior
    combat/        # weapons, damage, hit zones, ballistics, melee
    systems/      # inventory, weight, crafting, base, factions, quests, skills
    phone/         # AppBoy UI (React DOM), tabs, screens
    narrative/     # quests, dialogue, memories, endings
    data/          # JSON: items, recipes, factions, quests, skills, buildings, loot
    audio/
    ui/            # HUD, menus, title, pause
    tests/
  public/
  scripts/         # map generation, data validation
  .github/workflows/
  vercel.json
  README.md
  CONTRIBUTING.md  # agent rules (see Section 13)
```

**Data-driven rule:** Items, recipes, quests, factions, skill nodes, buildings, and loot tables live in `src/data/*.json`, validated by a Zod schema at build time. Gameplay code never hardcodes content.

---

## 3. CORE SYSTEMS

### 3.1 Game loop and time
- Fixed timestep physics (60 Hz), variable render.
- World clock: 1 real minute = 1 in-game minute by default. Day is 06:00–18:00, night is 18:00–06:00.
- Time scale for sleep and waiting (x8 during rest, blocked when enemies nearby).
- Event bus (typed) for cross-system messages: `noise`, `damage`, `itemUsed`, `factionChanged`, `questUpdated`, `survivorDied`, `baseRaided`.

### 3.2 Difficulty
Three presets, set at new game, changeable in settings (affects future saves only for permadeath):

| Setting | Story | Survivor | Hardcore |
|---|---|---|---|
| Husk damage | 0.6x | 1.0x | 1.4x |
| Player damage taken | 0.6x | 1.0x | 1.5x |
| Resource spawn | 1.3x | 1.0x | 0.7x |
| Weight limit | +20% | base | base |
| Save anywhere | Yes | Safe points only | Safe points, limited |
| Permadeath | No | No | Yes (player death ends run; survivor deaths permanent) |
| Survivor loyalty decay | Slow | Normal | Fast |

### 3.3 Save system
- Autosave: every safe point, every sleep, every excursion return, every quest step completion.
- Manual save: at base workbench, at safe points (Survivor and Hardcore).
- Three save slots plus autosave slot.
- Schema versioned (`saveVersion: int`). Migration functions per version. Loading an older save migrates forward; loading a newer save is refused with a message.
- Save payload: player state, inventory, equipped gear, world state diff (only changed POIs, looted containers, cleared husks, faction standings), survivors, base, vehicles (position, fuel, damage), quest flags, memory fragments, time, seed.
- World is seeded. Procedural content regenerates from seed plus diff; no full-world serialization.

---

## 4. MAP AND WORLD

### 4.1 Scale and projection
- Playable area: **approximately 24 km × 7 km** compressed from the real Outer Banks (the real chain is roughly 200 km). Compression is intentional; state it in the README.
- 1 world unit = 1 meter. Chunk size: 256 × 256 m. Chunks load within a 3-chunk radius, unload beyond 5.
- Coordinate system: X = east, Z = south, Y = up.

### 4.2 Generating the map (build order)
The agent must follow this order. Do not invent geography from memory; use the anchor points below and verify them.

**Step 1: Anchor points (approximate; verify with USGS or OpenStreetMap before lock).**
Store in `src/data/geo/anchors.json`:

| Anchor | Approx. lat, lon | Role in game |
|---|---|---|
| Bodie Island Lighthouse | 35.80 N, 75.54 W | Lighthouse Collective HQ |
| Oregon Inlet | 35.78 N, 75.53 W | Pier/Drowned water boundary |
| Pea Island NWR | 35.65 N, 75.50 W | Refuge faction |
| Hatteras Lighthouse | 35.25 N, 75.53 W | Pier faction, Harbor |
| Hatteras Village | 35.22 N, 75.70 W | Pier main settlement |
| Ocracoke Village | 35.11 N, 75.99 W | Hollow Market contact point |
| Wright Memorial Bridge | 36.03 N, 75.67 W | Tollkeepers fortress (north end of Bodie) |
| Pamlico Sound (center) | 35.40 N, 75.80 W | Drowned flotilla zone |
| Norfolk Naval Base | 36.95 N, 76.30 W | Act 3 dungeon, mainland |
| Washington D.C. (Exclusion Zone center) | 38.89 N, 77.04 W | Act 3 finale |

**Step 2: Heightmap.** Generate a 4096 × 1280 heightmap (about 6 m per pixel, then sample to chunks):
- Base: ocean at Y = -4 on the east, sound at Y = -1.5 on the west, barrier islands as ridges of dune at Y 3–12 with a hard dune line and flats of Y 0.5–2.
- Inlets: carve channels at Oregon Inlet and Hatteras Inlet (water, passable by boat only).
- Maritime forest on Bodie and Hatteras: raised, Y 6–9, dense.
- Land bridges: Wright Memorial (north Bodie) and Washington Baum (between Hatteras and Pea Island). Route 12 is a two-lane road, not a highway.
- Noise: layered simplex (4 octaves), dune ridges by ridged noise, beach slope by distance to shoreline.

**Step 3: Biomes.** Assign by heightmap + distance to shore + moisture:
- Beach/sand (flat, near ocean)
- Dune (ridge, sparse grass)
- Marsh (sound side, low, water-filled)
- Maritime forest (raised center on Bodie and Hatteras)
- Town (grid-street pattern, buildings)
- Water (ocean, sound, inlets)

**Step 4: Roads.** Route 12 traced along the island spine using anchor points. Side roads as spline paths. Two land bridges as special road segments.

**Step 5: POIs.** Place from `src/data/pois.json`, each with an anchor coordinate or a deterministic seed placement within a region. Full specs live in `NOMAD_BUILDING_POI_SPECIFICATION.md`.

**Step 6: Map UI.** The phone map renders from the same heightmap as a 2D raster (canvas) plus vector overlays (roads, faction borders, threat zones, POI icons). The agent must render the map from data at runtime, not from a static image, so zones update when factions change. Four layers: Satellite-style (shaded relief), Topo, Threat, Faction.

### 4.3 Regions and gating
| Region | Unlocks | Gate |
|---|---|---|
| Tern Rock (Prologue) | Start | None |
| Bodie Island | Act 1 start | Prologue complete |
| Hatteras | Act 1 | Pier contact made |
| Pea Island | Act 2 | Refuge contact |
| Wright Bridge corridor | Act 2 end | Tollkeepers tribute or defeat |
| Pamlico Sound | Act 2 | Drowned contact + boat |
| Mainland corridor (Virginia Beach) | Act 3 | Cross bridge |
| Norfolk Naval Base | Act 3 | Mainland unlock |
| D.C. Exclusion Zone | Act 3 finale | Norfolk key item + Drift/Restoration flag |

### 4.4 Structured map, varied play
The map is fixed. Play varies through: faction standing (who is hostile, who trades, who is open), day/night and weather spawn tables, the survivor roster (who lives, who is recruited), vehicle and boat availability, and the order you choose to take POIs. Each region has 3+ valid entry approaches.

### 4.5 Day/night and weather
- Husk speed: Shambler and Stalker are slow in day (0.7x) and fast at night (1.4x). Echo and Drifter ignore this.
- Weather: clear, overcast, rain, fog (Act 2+), storm (rare, cancels boat travel). Rain increases noise masking; fog reduces sight range.

---

## 5. CHARACTERS AND SURVIVORS

### 5.1 Player: Cass
- Female, early 30s, amnesiac, wedding ring she doesn't recognize.
- Stats: Vitality, Stamina, Carry Weight, Stealth, Accuracy, Craft, Driving, Diplomacy, Signal.
- 12 memory fragments collected through found objects. Fragment 12 gates The Drift ending.

### 5.2 Named characters (minimum)
| Name | Role | Where | Notes |
|---|---|---|---|
| Jonah Reyes | Attic/first contact | Bodie | Act 1 guide, can die in Act 2 |
| Cpt. Idris Boudreaux | Pier leader | Hatteras | Cajun, 63, honest trader |
| Sister Mariah Okonkwo | Refuge leader | Pea Island | Feed Husks, never kill |
| Wraith | Tollkeepers leader | Wright Bridge | Masked; reveal in Act 3 |
| Cpt. Selene Vesper | Drowned leader | Pamlico Sound | Ex-Coast Guard, never on land |
| Dr. Anya Kowalski | Lighthouse Collective | Bodie Lighthouse | Radio restoration |
| "The Accountant" | Hollow Market | Ocracoke | Unknown until Act 3 |
| Cal Vega | Prologue NPC | Tern Rock | Emotional anchor |

### 5.3 Recruitable survivors (pool of 20)
Each has: role (Medic, Mechanic, Scout, Guard, Cook, Radio), skills (1–3), loyalty (0–100), morale, health, gear slots, and a faction affinity.

**Recruitment methods (player chooses; at least three per survivor):**
1. **Rescue**: Find them in a POI during an excursion; escort back alive.
2. **Trade**: Pay faction scrip or items to the faction holding them.
3. **Persuade**: Diplomacy check during a dialogue, requires faction rep threshold.
4. **Quest reward**: Complete a side quest for their owner.
5. **Shelter**: They come to you if base defense rating is high enough during a raid.
6. **Steal**: Stealth extraction. Lowers faction rep if spotted.

### 5.4 Survivor AI and team behavior
- Assigned to base tasks (Farm, Guard, Repair, Radio, Cook, Medic) or excursion crew.
- Crew follow commands: Follow, Hold, Flank, Retreat, Heal Me, Take Cover.
- Crew use a utility AI: they pick the highest-scoring action each tick from health, threat, role, and morale. Scores are data-driven JSON.
- Loyalty rises with fed, rested, armed, and well-led; falls with starving, injured without medic, or being ignored.
- Morale below 20 causes refusal or desertion. Crew can die permanently (see forced death, 5.5).
- **Forced death (Act 2):** One named survivor dies on a scripted excursion. Which one depends on the crew assignment and the player's choice at the excursion briefing. The game must guarantee exactly one forced death per playthrough.

---

## 6. COMBAT AND ENEMIES

### 6.1 Player combat
- **Melee:** Light attack, heavy attack, block, dodge (stamina cost). Weapons: pipe, machete, hatchet, bat, oar, crowbar.
- **Ranged:** Pistol, rifle, shotgun, bow (crafted), flare gun (lure and light). Hit zones: head (x2), torso, limbs (x0.7).
- **Stealth:** Crouch, silenced melee takedown from behind, noise meter. Husks have hearing (noise radius by action: walking 6 m, running 14 m, gunshot 60 m, vehicle horn 40 m).
- **Stamina:** Sprint, dodge, melee, climbing all consume stamina.
- **Ballistics:** Hitscan for pistols and rifles at v1; simple projectile for bow and thrown items. Damage falloff at range.
- **Durability:** Every weapon and armor loses durability; repair at workbench.

### 6.2 Husk types (AI archetypes)
| Type | Behavior | Notes |
|---|---|---|
| Shambler | Wanders, chases on sight or noise | Baseline; slow in day |
| Stalker | Ambush, waits, fast burst at night | Hides in marsh and forest |
| Bellower | Calls nearby Husks to the sound | Kill first or the pack arrives |
| Echo | Speaks, aware, may give information or hostility | Rare; dialogue option |
| Swarm | Group of 8–15, flocking | Act 3; fire required |
| Drifter | Single-file lines on roads, mainland | Act 3; avoid, do not engage |

### 6.3 AI architecture
- Each Husk is a **finite state machine**: Idle → Wander → Investigate (noise) → Hunt (sight) → Attack → Flee/Return. Transitions driven by perception.
- **Perception:** Sight cone (110°, 25 m), hearing (noise events in radius), smell (Stalkers only, short range, tracks player scent trail for 30 s).
- **Group AI:** Bellowers broadcast; nearby Husks switch to Investigate. Swarm uses boids (separation, alignment, cohesion) plus target seek.
- **Navigation:** Grid-based nav mesh per chunk, A* with obstacle cost. Recalc on player move beyond threshold, not every frame.
- **Performance cap:** Max 40 active Husks in simulation. Beyond 50 m from the player, Husks simulate at 2 Hz.

### 6.4 Enemies (human)
- **Tollkeepers:** Guard bridge, demand tribute, shoot on refusal.
- **Drowned:** Boat-based; board or shoot from water. Patrol sound lanes.
- **Hollow Market:** Ambush at trade meets only if betrayed.
- **Faction hostility:** A hostile faction sends patrols to your base after standing drops below -50.

---

## 7. VEHICLES AND PHYSICS

- **Types (v1):** Bicycle (no engine, fast on road, stamina cost), ATV (sand-capable), pickup (cargo, fuel), semi (Act 3, cargo, slow, mainland convoy), boat (small skiff for Pamlico, larger for ferry).
- **Physics:** Rapier raycast vehicles for ground; buoyancy force model for boats (sample 4 points, apply upward force by submersion depth).
- **Surface friction:** Sand 0.5x traction, marsh 0.6x with sinking, road 1.0x, water = boat only.
- **Fuel:** Each vehicle has a tank. Consumption scales with speed and load. Fuel found or crafted (Hollow Market or refinery at base).
- **Damage:** Collision damage to body, tires (blowouts), engine. Repairable at base or with parts in field.
- **Storage:** Each vehicle has a trunk with its own weight cap.
- **Driving assist:** Gentle steering assist toggle in settings, off by default.

---

## 8. ITEMS, WEIGHT, AND INVENTORY

### 8.1 Item schema (data-driven)
```
Item {
  id, name, category, rarity, description,
  weight (kg), volume (slots),
  durability?, stackSize,
  useAction?,      // eat, drink, bandage, equip, load, install
  stats?,          // damage, armor, carry bonus, etc.
  craftRecipe?, salvageYield?,
  factionValue?    // scrip value per faction
}
```

### 8.2 Categories
Weapon (melee, ranged, thrown), Ammo, Armor, Clothing, Food, Drink, Medical, Material (scrap, wire, cloth, fuel), Tool, Mod (weapon mod, phone mod, vehicle mod), Key Item (memory fragments, quest items), Trade Good.

### 8.3 Weight and storage
- **Base carry weight:** 20 kg.
- **Backpacks:** Tiers I–V, adding 8, 15, 25, 35, 50 kg and 4, 8, 14, 20, 28 slots. Backpack is a worn slot (Pack).
- **Vests and rigs:** Add 4–10 slots, no carry weight.
- **Encumbrance:** Over 100% of carry weight, sprint disabled. Over 130%, dodge disabled. Over 160%, cannot pick up.
- **Stat modifiers:** Each carry tier also adds a small stamina recovery malus when overloaded.
- **Vehicle trunks:** Separate weight caps.
- **Base storage:** Crates and lockers, unlimited weight but slot-capped per container.

### 8.4 Inventory interaction (AppBoy Loadout)
- **Single-click:** Inspect (stats, durability, weight, rarity, description, actions).
- **Double-click:** Smart route. Weapon to equipped slot, food eaten, bandage applied, ammo loaded to matching weapon.
- **Drag from grid to slot:** Equip (slot highlights on valid drop).
- **Drag from slot to grid:** Unequip (must have room, else rejected with reason).
- **Drag inside grid:** Rearrange.
- **Hotbar 1–4:** Assign usable items to keys.
- **Keyboard:** E equips selected, Del drops, Tab cycles categories.

### 8.5 Crafting
- Workbench at base: full recipe list. Recipes marked green (craftable) or red (missing inputs). Each recipe lists missing ingredients.
- Field crafting: small recipe set (bandage, makeshift weapon, torch, flare, fire starter).
- Recipes unlock from skills, faction trades, and blueprints found in POIs.

---

## 9. PHONE (APPBOY) AS MANAGEMENT

The phone is the entire menu system. No floating UIs. Built as React DOM overlay.

### 9.1 Tabs
1. **LOADOUT:** Inventory grid, equipment silhouette, craft sub-page, weight meter, backpack info.
2. **WORLD:** Map (four layers), Ops (excursions), Tasks (quests), Threats, Radio.
3. **COMMAND:** Crew (roster, roles, orders), Base (structures, upgrades, storage, defense), Factions (rep and scrip, trade, quests, diplomacy), Phone Mods (install and remove), Skills (trees and perks).

### 9.2 Battery
- Drains with screen time (passive) and features (map, radio, camera).
- Dead at 0%: AppBoy locked; Command and Map unavailable.
- Recharge: generator at base, solar strip in daylight, hand-crank (action, 10 cranks = 5%).
- Phone Mods can raise battery capacity and reduce drain.

### 9.3 Hardware evolution
Phone model changes visually on install: antenna nub → extended antenna → thermal camera lens → solar strip → battery pack. Implemented as a layered sprite swap driven by the installed mod list.

---

## 10. FACTIONS (SIX)

### 10.1 Factions and leaders
| Faction | Location | Leader | Specialty | Hostile Trigger |
|---|---|---|---|---|
| The Pier | Hatteras Harbor | Cpt. Idris Boudreaux | Fishing, food, honest trade | Theft from docks |
| The Refuge | Pea Island NWR | Sister Mariah Okonkwo | Medicine, Husk-feeding, peace | Any Husk killed near camp |
| The Tollkeepers | Wright Bridge | Wraith | Bridge control, tribute, weapons | Refusing tribute twice |
| The Drowned | Pamlico Sound | Cpt. Selene Vesper | Boats, ferry, salvage | Boat theft |
| Lighthouse Collective | Bodie Lighthouse | Dr. Anya Kowalski | Radio, tech, mods | Sabotage of antenna |
| Hollow Market | Ocracoke (no territory) | The Accountant | Explosives, black trade | Failure to pay debt |

### 10.2 Rep and currency (dual tracking)
- **Reputation:** -100 to +100 per faction. Thresholds: Hostile (≤ -50), Wary (-49 to -10), Neutral (-9 to 9), Friendly (10 to 49), Allied (≥ 50).
- **Scrip:** Per-faction currency. Earned by quests, trade, and selling. Spent on that faction's goods. Scrip is not transferable between factions.
- **Rival penalty:** Aligning with one faction reduces rep with its rivals (defined in `factions.json`). You cannot max all six.

### 10.3 Faction interactions (must all be playable)
- **Trade:** Buy and sell with per-faction price multipliers. Shows scrip balance and rep tier.
- **Tasks:** Faction posts available tasks. Accept, track, complete, claim reward.
- **Missions:** Multi-step faction storylines, gated by rep tier.
- **Diplomacy:** Propose truce, request escort, offer tribute, threaten. Outcomes move rep.
- **Intel:** Faction sells map markers and rumors for scrip.

---

## 11. BASE, MANAGEMENT, AND PROGRESSION

### 11.1 Base
- Start at a chosen safehouse. Base has grid-based build area (planned, not free-form): 6 zones, each with 3 slots for structures.
- **Structures:** Bed (rest, time skip), Workbench (craft), Storage (crates, lockers), Water Still, Garden, Generator, Radio Tower, Defense (walls, lights, traps, turrets), Medical Bay, Vehicle Garage.
- **Upgrades:** Each structure has Tier I–III, costs materials, adds effects.
- **Defense rating:** Sum of defense structures and crew guard skill. Raids come on a schedule and scale with notoriety.

### 11.2 Resource and task management (on phone, COMMAND > BASE)
- Assign survivors to: Farm, Water, Guard, Repair, Radio, Cook, Medic, Scout (sends on timed run).
- Assignment shows output per day and risk.
- Storage map: what is in each container and vehicle.
- Resource ledger: food, water, fuel, power, scrap, ammo, medicine, scrip. Shows daily income and expenses.

### 11.3 Responsibilities and orders
- Each survivor has a role and a task. Player can reassign any time at base.
- Orders can be standing (Guard the gate at night) or one-off (Repair the generator now).

### 11.4 Progression
- **XP:** From quests, excursions, kills, crafting, discovery.
- **Skill points:** Earned on level up. Spent in skill trees.
- **Skill trees (7):** Survival, Combat, Stealth, Engineering, Diplomacy, Driving, Signal. Each has 3 branches, 5 tiers, with one capstone per tree. Far Cry-style branching with prerequisites.
- **Perks:** Unlock from faction rep thresholds and memory fragments. Passive modifiers.
- **Gear progression:** Tiers I–V for weapons, armor, and backpacks. Mods on weapons (scope, suppressor, extended mag, grip).

### 11.5 Endgame progression
- Max level 40. Level 30+ unlocks Restoration ending path prerequisites.
- Full base upgrade (all structures Tier III) unlocks a raid-proof base flag.
- Crew loyalty 90+ for all survivors unlocks the "Last Ship" event.

---

## 12. QUESTS AND SIDE CONTENT

### 12.1 Quest structure
- **Main quests:** Act-gated, linear with branches. 3 acts, each 6–10 main steps.
- **Faction quests:** 3 per faction (tier-gated), each 3–5 steps.
- **Side quests:** Local, 1–3 steps, fill the map.
- **Radio contracts:** Repeatable, generated from seed, pay scrip.
- **Excursions:** Timed multi-POI runs assigned to crew.

### 12.2 Quest data format
```
Quest {
  id, title, act, giver, region,
  requires: { flags, rep, items, memories },
  steps: [{ id, objective, type: "reach"|"kill"|"collect"|"talk"|"escort"|"choice", target }],
  choices?: [{ id, label, effects }],
  rewards: { xp, scrip, items, rep, flags }
}
```

### 12.3 Sample main arc
1. Prologue: Tern Rock (forced sacrifice at the boat).
2. Act 1: Wake on Bodie, find phone, meet Jonah, reach Pier, unlock AppBoy.
3. Act 2: All five OBX factions, the survivor death excursion, outpost liberation, memory recovery.
4. Act 3: Cross the Wright Bridge, Norfolk Naval Base, the D.C. Exclusion Zone.

### 12.4 Memory fragments
12 total. Each is an item found in a specific POI or from a faction quest. Reading a fragment plays a short scene (text plus a camera moment). Fragment 12 unlocks The Truth.

---

## 13. ENDINGS

| Ending | Requirements |
|---|---|
| The Lighthouse | Lighthouse Collective allied, 6+ crew, max signal mods |
| The Mainland Exodus | Tollkeepers allied or defeated, semi + 3 vehicles, 4+ crew |
| The Peace | Allied with the Pier, Refuge, Drowned, and Lighthouse at once |
| The Burn | Hollow Market explosives, Wright Bridge and Drowned flotilla destroyed |
| The Drift | All 12 memory fragments, Signal Booster + Audio Decoder, Vesper resolution |
| The Restoration (bonus) | Reach D.C., bring the cure data back to the islands. The Last Ship model. |

Endings are determined by flags at the final choice. The final sequence is a short scripted cutscene in engine (camera path plus text).

---

## 14. DEVELOPMENT ROADMAP (MILESTONES)

Each milestone is shippable. The swarm must not begin a milestone until the previous one passes its acceptance tests.

| # | Milestone | Deliverable | Acceptance |
|---|---|---|---|
| M0 | Scaffold | Repo, CI, Vercel preview, empty Three scene | Build passes, preview URL loads |
| M1 | Movement and world | Heightmap terrain, chunks, third-person controller, day/night | Walk the island, 60 fps on mid laptop |
| M2 | Save and difficulty | IndexedDB save, slots, difficulty select, migrations | Save, reload, values identical |
| M3 | Combat and Husks | Melee, pistol, Shambler and Stalker FSMs, noise, hit zones | Kill and die loop works, 40 Husks at 60 fps |
| M4 | Inventory and weight | Item schema, grid, drag/drop, backpacks, weight | Drag equip and unequip; overload blocks sprint |
| M5 | AppBoy phone | Three tabs, battery, map with layers, hardware evolution | All tabs open, map renders from data |
| M6 | Prologue | Tern Rock authored POI, sacrifice choice | Prologue completes and saves |
| M7 | Act 1 | Bodie and Hatteras, Pier, Jonah, AppBoy unlock | Act 1 completes |
| M8 | Vehicles | Bicycle, ATV, pickup, boat with buoyancy, fuel | Drive, fuel, damage, boat travels sound |
| M9 | Base and crew | Structures, assignments, survivor AI, loyalty, raids | Base functions with 3 survivors for 3 in-game days |
| M10 | Factions | Six factions, rep, scrip, trade, tasks, diplomacy | Every faction trade and task works |
| M11 | Act 2 | Full OBX, forced death, skill trees, perks | Act 2 completes, forced death fires once |
| M12 | Act 3 | Mainland, Norfolk, D.C. Exclusion Zone, Swarm | Reach D.C. |
| M13 | Endings and NG+ | Five endings, Restoration, NG+ | Each ending reachable in test save |
| M14 | Polish and release | Audio, accessibility, perf, docs | Playwright smoke passes, Lighthouse > 80 |

---

## 15. SWARM ORCHESTRATION

### 15.1 Agent roles
| Agent | Owns | Must Not Touch |
|---|---|---|
| Orchestrator | Milestone plan, task queue, merges, gate decisions | Code (except conflict resolution) |
| Architect | `core/`, interfaces, data schemas | Content JSON |
| Terrain | `world/`, heightmap, biomes, map generation | Entities |
| Gameplay | `combat/`, `entities/` (player, Husk), vehicles | Phone UI |
| AI | `ai/`, survivors, crew behavior | Terrain |
| Systems | `systems/`, inventory, base, factions, quests, skills | Rendering |
| Phone/UI | `phone/`, `ui/`, HUD, menus | Core loop |
| Narrative | `narrative/`, `data/quests`, dialogue, endings | Code |
| QA | `tests/`, Playwright, regression | Feature code |
| DevOps | CI, Vercel, release | Gameplay |

### 15.2 Rules for every agent
1. Read `CONTRIBUTING.md` and the milestone spec before starting.
2. One milestone at a time. No work on future milestones.
3. Every system exposes a typed interface. Other systems consume the interface only.
4. Content changes go through JSON with schema validation. No hardcoded names, items, or numbers in logic.
5. Every feature ships with a unit test (Vitest) and a smoke test (Playwright) if it touches the UI.
6. No feature merges that breaks `npm run build`, `npm test`, or the Vercel preview.
7. Commit messages: `m{N}/{system}: {change}`.
8. If a spec is ambiguous, pick the simplest option, write it in `DECISIONS.md`, and continue. Do not block.
9. Never invent geography, faction facts, or lore not in the Constitution. Unknown facts go to `OPEN_QUESTIONS.md` for the Orchestrator.

### 15.3 Handoff
Each agent writes a short entry in `PROGRESS.md`: what was built, what was tested, what is open, what the next agent needs. The Orchestrator reads it before assigning the next task.

---

## 16. TESTING AND ACCEPTANCE

- **Unit (Vitest):** Weight math, save migration, rep thresholds, loot tables, recipe resolution, quest prerequisites, ending flag logic.
- **Simulation tests:** Run 1000 in-game days headless with a seeded RNG. Assert no NaNs, no negative inventory, no orphan quest flags.
- **Performance budget:** 60 fps target, 30 fps floor, 200 MB JS heap ceiling on mid-tier laptop.
- **Accessibility:** Keyboard navigation for all phone tabs, visible focus, reduced motion setting, subtitles on, colorblind-safe threat colors (use icon plus color).
- **Bug severity:** Blocker (cannot complete a milestone) is fixed before anything else.

---

## 17. DEPLOYMENT

1. Repo on GitHub, `main` protected, PRs require CI green.
2. Vercel project linked to repo. Preview per PR, production on `main`.
3. `vercel.json` sets SPA rewrites and cache headers for `/assets/*`.
4. Build: `npm run build` outputs static `dist/`.
5. Environment: no secrets required for v1. If any are added later, use Vercel env vars, never committed.
6. Release tags: `v0.1.0` at M7 (Act 1 playable), `v0.2.0` at M11, `v1.0.0` at M14.

---

## 18. PHASE-0 INSTRUCTION TO THE ORCHESTRATOR

Start here, in order:
1. Create the repo and CI skeleton (M0).
2. Confirm the anchor coordinates in Section 4.2 against a verifiable source. Record the source in `src/data/geo/SOURCES.md`. If you cannot verify, mark the value `UNVERIFIED` and proceed with the approximation.
3. Build M1 first. Do not write any combat or UI code until the player can walk the island at 60 fps.
4. Report to the human after each milestone with: what runs, the preview URL, what is open, and the next milestone.

**The human's job:** Play each milestone build on the Vercel preview, report what feels wrong in plain language, and approve the next milestone. The swarm handles everything else.

---

## APPENDIX A: REFERENCE FILES (PROJECT KNOWLEDGE)

Load these before starting. Where this prompt and a reference file conflict, this prompt wins for implementation; the reference wins for lore and tone.

- `NOMAD_CONSTITUTION.md` (lore, factions, characters, endings)
- `NOMAD_BUILD_SEQUENCE_v2.md` and `_PROMPTS_21-40.md`, `_PROMPTS_41-60.md` (granular task ideas)
- `NOMAD_APPBOY_PRD.md` and `NOMAD_APPBOY_LOADOUT_INTERACTION_PRD.md` (phone UI behavior)
- `NOMAD_BUILDING_POI_SPECIFICATION.md` (POI data)
- `NOMAD_CANONICAL_MAP_PROMPT.md` (map visual direction)
- `NOMAD_AUTONOMOUS_BUILD_FRAMEWORK_v2.md` (overnight run protocol, BRAIN.md handoff)

## APPENDIX B: UI DESIGN DIRECTION

Follow the design plan process from the frontend-design skill before writing any UI code:
- Phone UI is dark, functional, and tactical. Avoid the generic SaaS card kit and avoid Fallout green.
- Palette: 4–6 named hex values, chosen in the design plan and written to `DESIGN_TOKENS.md`.
- One memorable element: the phone's hardware evolution. Keep everything else quiet.
- No tracked all-caps eyebrow labels. No middle-dot meta strings. Sentence case copy. Active-voice button labels that match their toast text ("Equip," then "Equipped").
- This is a mobile + desktop web app, so include a touch joystick option and prevent rubber-banding (overscroll-behavior, touch-action). Without the reference files, create what is necessary — do not make assumptions, create.

---

## APPENDIX C: DIRECTION NOTES (Ian brain dump, 2026-10-19)

**Tone target:** between Skyrim and Starfield — systemic open-world RPG feel, but the State of Decay premise (survival + zombies) stays the critical core: scarcity and the husks are what force the journey to D.C.

**Stage 2 (post-v1 roadmap, not this build):** after reaching an ending, the world evolves — modeled on Far Cry 5 → New Dawn and Terraria's hardmode/secondary overworld. A completed run unlocks an evolved overworld state (new threats, shifted factions, new loot tables) rather than just NG+.

**Shipped 2026-10-19 (improvement push v0.1.1):** WASD inversion fix, sprint discoverability + mobile RUN toggle, locomotion animation (bob/lean/strafe roll/joint pivots/idle breathing), melee swing + ranged recoil arm animation, speed bump (walk 4.9 / sprint 8.8), real-time shadows + ACES tone mapping + grass tufts, loot summary toasts, standalone backpack overlay (I key, dead-phone-proof) with search/organize/drop/field crafting, Skyrim-style sleep dialog (1/2/4/8h, enemy-blocked, well-rested buff), husk clothing variation + searchable corpses with zone-tied loot tables.
