# NOMAD — POIs, Faction Bases & Vehicle Roster

**Source:** sodgame's data exhaust (`data/poi_spawns.json`, `data/poi_templates.json`, `data/vehicles.json`, `data/trailers.json`, `data/factions.json`, `data/convoys.json`, `data/structures.json` — read 2026-10-19) + Ian's vehicle list (utility van, mustang, bronco 4x4, F250, 6x6 APC, semi, trailers, sport bike, motocross bike).
**Companions:** BASE_DESIGN.md (claim rules, labor, facilities — this brief extends it, doesn't redo it), VEHICLES_FACTIONS_EVENTS_DESIGN.md (math + event catalog), HOUSES_DESIGN.md (garages, pads, POI placement).
**Stance:** the beta island must show *every* POI class sodgame proved, each faction's home must look like *them* from 100m away, and every vehicle on Ian's list gets a real spec — but the meshes ship in waves, not all at once.

---

## 1. POI Inventory — all 7 sodgame types, mapped to the island

| # | sodgame POI | Loot | Alarm | Density | Respawn | Special | NOMAD status → placement |
|---|---|---|---|---|---|---|---|
| 1 | Apartment Block (residential, 3×3) | T1 residential | silent | 1.0 | 7–12d | — | **EXISTS** — town residential streets (houses v1). |
| 2 | Farmhouse (residential, 2×2, rural) | T1 + locked locker pulls **T3 industrial** | silent | 0.7 | 10–16d | tier-mixing | **EXISTS** — jonah_camp + forest cabins. The locked-locker trick ports to Wave 3 lockpick. |
| 3 | Strip Mall (commercial, 4×3) | T2 commercial | **active** | 1.2 | 9–14d | is_major | **ADD** — town commercial strip (new building type, Wave 6). |
| 4 | Logistics Yard (industrial, 4×4) | T3 industrial | silent | 1.4 | 11–16d | is_major | **ADD** — marina/boatyard on the west shore (fits OBX, gives skiffs + Salvage Rig a home). |
| 5 | Military Checkpoint (military, 3×2) | **T4 military** + locked weapon locker | **active** | 1.8 | 14–21d | is_major | **PLANNED** — military base / old Coast Guard station, east cape (Wave 6). |
| 6 | Convoy Wreck (special, 2×3) | T4 military in one crate | silent | 1.3 | 12–18d | event stage | **RE-THEME** — the existing wreck becomes a convoy wreck: military vehicles + cargo (ties to the convoy-intel layer). |
| 7 | Faction Outpost (faction, 3×3) | T2/T3/T5 mixed, locked locker | **active** | 1.5 | 10–15d | is_major | **ADD (×2, Phase 3)** — Remnant listening post at relay_station; Rust Skulls forward camp at the dunes. |

**POIs beyond sodgame's list, needed for the beta island (from ROADMAP Wave 6 + the vehicle plan):** gas station (town edge — the `fuel_can` source), barn/farm (near jonah_camp), warehouse (town industrial corner), school (town), raider fort (dunes — Skulls main base, §3), keeper's house (lighthouse, rich tier — already in HOUSES_DESIGN).

### Island map plan (west → east; island spans x −700…700)

| x | POI | Class | Faction / note |
|---|---|---|---|
| −560 | **shore_camp** | **HOLDOUT — starter home** | Tutorial claim. See §2. |
| −560 shore | **marina / boatyard** (NEW) | Industrial Yard port | Skiff spawns (one wrecked, one repairable), Salvage Rig site. |
| −380 | jonah_camp | Home+ alternative | Forest cover, deer, worse water — the real choice vs. shore. |
| −350 | barn/farm (NEW) | Farmhouse port | T1 + locked T3 locker (the sodgame tier-mix). |
| −220 | wreck | Convoy Wreck re-theme | Military cargo, T4 crate, raider scouts in Phase 3. |
| 40 | town | Residential blocks + strip mall (NEW) + gas station (NEW) + warehouse (NEW) + school (NEW) | **Union town-hall compound** (Phase 3 main base). |
| 180 | forest_cache | Field outpost | Hunting stash, fast travel. |
| 330 | relay_station | Remnant listening post (Phase 3) | Chemistry station already there. |
| 470 | dune_cache | Field outpost | D.C.-road staging instinct. |
| ~500 | **raider fort** (NEW) | **Rust Skulls main base** | Dunes. See §3. |
| 600 | lighthouse | Story anchor, keeper's house | Not claimable (BASE_DESIGN ruling stands). |
| ~650 | **military base / Coast Guard station** (NEW) | **Remnant main base** | East cape, end of the island. Wave 6 build. |

---

## 2. The First Base Holdout — shore_camp

**What sodgame did:** nothing explicit. Its closest analog is the *starting survivor roster* + the facility panel — you begin with people and claim machinery, not a place. The holdout-as-tutorial is NOMAD's invention, and it should be, because a 3D game can teach with *geography*.

**The site:** shore_camp (−560), exactly as BASE_DESIGN decided (shore = free, guided tutorial claim; jonah/town are the free choices after).

**Why it's defensible (readable in 10 seconds by a new player):**
- Water on the west — husks don't swim, so one flank is free.
- A dune ridge to the east funnels land approach to **two** gaps (the road in, the beach path).
- The campfire sits in a natural bowl: high ground on three sides is *yours* once you put a watchtower on it.

**What it teaches in the first 30 minutes (the tutorial arc):**
1. **Minutes 0–5 (prologue → beach):** movement, the sat phone, "the world is quiet here."
2. **Minutes 5–12:** first husks at the treeline → melee, block, loot a corpse. The campfire: sleep, save, fast travel explained by the fire itself.
3. **Minutes 12–20:** the claim post: *clear the bowl* (kill the 3–4 husks inside 40m — the Rust-bubble claim rule made physical), hold F, **shore_camp is yours for free**. The AppBoy gains the Base tab.
4. **Minutes 20–30:** first ghost — a palisade across the road gap. Player labor only, ×1.5 time, built with wood from the hatchet they already have. Then the heat readout appears: a number, a label, and the honest note that the siege it promises comes in Phase 3. (sodgame shipped the number without the siege and never said so; we say so in the patch notes.)

**What it grows into:** Command Post T1 → Storage T1 → Workbench T1 (already the Wave 4 bench, so no refactor) → Rain Collector → Salvage Rig (the "mine," per BASE_DESIGN's wrecks verdict) → Garage Bay T1 when vehicles land. The two approach gaps become the two gates; the dune ridge becomes the watchtower line. By the time the player leaves for town, the holdout is a working camp — and the relocation rule (70% salvage refund, stockpile doesn't teleport) teaches the D.C.-road lesson early: *bases are positions, not monuments.*

---

## 3. Faction Main Bases + the Takeover-Branding Kit

### 3.1 The three identities (Phase 3 builds)

**Military Remnants — "the airbase."** Rep −50 (hostile until earned), quartermaster trader at ≥75, tech convoys every 6–8h.
- *Layout language:* order. HESCO-bastion perimeter (wire cubes, sand fill), razor-wire outer ring, a single gated entrance with a checkpoint booth, floodlight towers on corners, camo netting over the motor pool, a radar dome / comms mast as the skyline signature.
- *Structures:* barracks row (2–3 long huts), armory (locked, T4/T5 loot, the blueprint source), motor pool with 2 heavy bays (APC + box truck parked — *visible* endgame toys), comms building (the intel source you can sabotage).
- *Color/material code:* olive drab #4a5230 + desert tan, white stencil markings ("RMN-07", chevrons), corrugated steel.
- *Home:* the east-cape Coast Guard station (Wave 6). They own the best compound on the island and the quartermaster sells you its fruits — but only after you earn ≥75 rep from −50. The grind *is* the relationship.

**Survivors Union — "the town hall."** Rep +25 (friendly default), medic trader at ≥25, supply caravans every 12h.
- *Layout language:* community. The town settlement itself, reclaimed: garden boxes in yards, rain barrels on every corner, solar panels on roofs, a market stall row, murals on house walls, plywood-and-sandbag (not spikes) — defense that looks *built by neighbors*.
- *Structures:* town hall (command + trader), clinic (the medic), school converted to a dormitory (recruit pipeline — this is where Wave 8 survivors come from), caravan depot with flatbed trailers.
- *Color/material code:* warm wood, painted murals, string lights at night (the warm-light faction — you can see Union territory by its glow), green garden rows.
- *Home:* town. They are the reason town is the prize base in BASE_DESIGN — taking the settlement means negotiating with (or displacing) the Union.

**Rust Skulls — "the fort."** Rep −30, **no trader** (null by design — you don't shop with raiders, you pay tolls), raids instead of convoys.
- *Layout language:* menace. Spike-wall perimeter (the prefab spikes, but *theirs* are taller and blood-rust red), captured vehicles chained as barricades, skull poles / scrap totems at the gate, fire barrels (orange point lights, visible for a kilometer at night), a fighting pit, hanging cages.
- *Structures:* war-rig garage (their technicals — pickup + flatbed, visibly up-armored), the toll gate on the dune road (the event: pay or fight), scrap throne / boss hut on a rise.
- *Color/material code:* black + dried-blood red, bone white (the skulls), rust. Everything loud: engines idling, metal, fire.
- *Home:* the dune fort (~x 500). Raiders get the high ground east — they tax the road to the lighthouse, which makes them *your* problem on every late-game run.

### 3.2 The takeover-branding kit

When a faction seizes a generic POI in Phase 3 (or Stage 2's dynamic flipping), it doesn't get rebuilt — it gets **rebranded**. One kit, three skins, layered onto the existing POI:

| Layer | Remnants | Union | Skulls | Cost to implement |
|---|---|---|---|---|
| **Banner** | Stenciled flag, olive/tan | Painted mural cloth, warm colors | Skull pole / flayed banner | 1 pole + 1 cloth plane each |
| **Paint band** | Trim → olive drab | Trim → mural colors | Trim → black/red | Material swap on existing trim meshes |
| **Perimeter** | HESCO cubes at gaps | Sandbag + plywood | Spike ring | Prefab pieces, already specced |
| **Light rig** | White floodlight tower | String lights (warm) | Fire barrels (orange) | 1 light type each — the night-readable signature |
| **Patrol posts** | 2 sandbag posts + mast | 2 porch posts + garden | 2 spike posts + totem | Prop + guard NPC marker |
| **Signature prop** | Checkpoint booth | Market stall | Scrap throne fragment | One hero prop per faction |
| **Audio** | Generator hum | Chatter / music | Idling engines | Ambient hook per faction |

**Rules:** the kit reads as "theirs" from 50m (light color + banner + perimeter), details resolve on approach. Captured POIs keep their loot identity (a captured farmhouse still loots as a farmhouse — factions tax the *place*, they don't restock it). Player-cleared faction POIs revert to neutral dressing after the respawn clock (7–21d per sodgame's table) — the island *forgets*, slowly.

---

## 4. Vehicle Roster — full specs

**Shared rules (sodgame math, NOMAD-hardened):** fuel burn `0.18 L/s × burnClass × speedRatio × (1 + loadFactor×2)`; condition wear `0.02/min × speedRatio × (1+load)`; top speed floors at 45% at 0 condition; found vehicles spawn at **20–60% condition, partial fuel — never free**; repair = parts at a garage bay (full) or field-capped 60%; driving noise radius > sprinting (see per-vehicle noise below); vehicles persist where left, marked on the sat phone.

| Vehicle | Role | L×W (m) | Seats | Cargo kg | Fuel L | Burn | Top m/s | Weight kg | Noise idle/drive |
|---|---|---|---|---|---|---|---|---|---|
| **Sport bike** | Fast road scout | 2.1×0.7 | 1 | 30 | 12 | 0.5× | 22 | 180 | 30/40 |
| **Motocross bike** | Off-road scout (sand/dune king) | 2.2×0.8 | 1 | 15 | 10 | 0.5× | 20 | 110 | 32/45 |
| **ATV** | Workhorse scout | 2.1×1.1 | 1 | 90 | 15 | 0.6× | 16 | 350 | 30/42 |
| **Skiff** | Island water | 5.5×2.0 | 2 | 250 | 24 | 0.9× | 13 | 450 | 25/38 |
| **Sedan** | Balanced road car (sodgame port) | 4.7×1.8 | 4 | 300 | 40 | 1.0× | 12 | 1400 | 25/45 |
| **Mustang** | Fast, fragile, loud | 4.8×1.9 | 2 | 150 | 45 | 1.1× | 24 | 1600 | 30/55 |
| **Utility van** | Rolling storage | 5.2×2.0 | 2 | 900 | 55 | 1.3× | 14 | 2000 | 28/50 |
| **Bronco 4x4** | Off-road SUV | 4.6×1.9 | 4 | 400 | 55 | 1.3× | 15 | 2100 | 30/55 |
| **Pickup** | Workhorse + hitch (sodgame port) | 5.3×1.9 | 4 | 600 | 60 | 1.3× | 14 | 2200 | 30/55 |
| **F250** | Tow + heavy haul | 5.9×2.0 | 4 | 800 | 70 | 1.4× | 15 | 2600 | 30/55 |
| **Box truck** | Base-moving hauls | 7.5×2.5 | 2 | 2500 | 90 | 1.8× | 11 | 4500 | 30/58 |
| **Semi tractor** | Trailer hauler (sodgame port) | 6.5×2.5 | 2 | 200 | 200 | 2.5× | 10 | 8000 | 30/60 |
| **6x6 APC** | Endgame armor | 6.8×2.6 | 6 | 800 | 150 | 3.0× | 9 | 11000 | 35/65 |

**Silhouette notes for the mesh wave:** bikes = exposed frame + two wheels (moto gets knobby tires, high fender); ATV = quad + racks; skiff = flat-bottom hull + outboard; sedan/mustang = unibody (mustang: long hood, fastback); van = box body; bronco = boxy SUV, removable-top line; pickup/F250 = cab + open bed (F250 taller, dual rear wheels); box truck = cab + box; semi = cab + fifth wheel, no bed; APC = angular armor, 3 axles, roof hatch.

### 4.1 Upgrade paths (all vehicles reinforceable — Ian's rule)

| Tier | Name | Cost (parts) | Effect |
|---|---|---|---|
| A0 | Stock | — | Found state |
| A1 | Scrap-plated | scrap ×N (N = weight/200) | +60% HP, +10% weight → −5% top speed. The honest trade. |
| A2 | Welded / cage | A1 + `engine_part` ×1–2 | +120% HP over stock, ram damage ×2, noise +5 (it rattles). |
| ENG | Tuned | `fuel_can` ×2 + scrap ×10 | +15% top speed, +20% burn. Mustang gets a second ENG tier (track build, +30%/+35%). |
| CRG | Racks | scrap ×6 + `wood` ×4 | +40% cargo (bed rails / roof rack / panniers). Bikes: saddlebag → hard cases. |
| RAM | Bullbar | scrap ×8 | Ram husks/gates for 2× damage, protects front HP. |
| — | Lift kit (Bronco/moto/ATV only) | `tire` ×2 + scrap ×8 | Off-road speed penalty halved on sand/dune/marsh. The Outer Banks tax, itemized. |

**Manufacture (per BASE_DESIGN, unchanged):** ATV / Sedan / Skiff rebuildable at Garage T3 + Machine Shop T2 with a Mechanic (ATV: 20 scrap, 2 `tire`, 1 `engine_part`, 1 `car_battery`, 6h; Sedan: 35/4/1/1, 10h; Skiff: 25 scrap, 1 `engine_part`, 6 wood, 8h, shore only). **Everything heavier is found-and-repaired only** — if the semi were craftable, no found truck would ever matter.

### 4.2 Trailers + bike loading

**Trailers** (sodgame's three, kept): Box (5000kg, lockable, 1 car slot 3×6m/1500kg), Flatbed (4000kg, 1 car slot 3×6m/1600kg), Tanker (fuel — scaled to **2000L** for NOMAD; sodgame's 10,000L is a refinery, not a trailer). **NEW:** Car carrier (2 car slots, F250/semi only).

**Hitch rules:** Semi = everything. F250 = box, flatbed, tanker, car carrier. Pickup = box, flatbed. Box truck = flatbed only (it's already a box). Bronco = flatbed only, and towing halves its off-road bonus. Van / sedan / mustang / APC = no hitch (the mustang doesn't tow; that's the joke and the balance).

**Bike slots** (Ian's ask — bikes ride *in* things): pickup bed 1 · van 2 · box truck 2 · flatbed 2 · car carrier 4 · semi+carrier 4. Loading = drive/walk the bike to the slot marker, hold F (snap-in, no minigame — browser scope honesty). A slotted bike adds its weight to the burn calc and can't be stolen by the "exposed vehicle" rule while its carrier is garaged.

---

## 5. Cross-reference with BASE_DESIGN.md

**Consistent — no changes needed:** claim rules (clear 40m, hold-F, costs), one-home-plus-outposts, labor gates (solo T1 ×1.5, T2 needs Builder, T3 needs specialist + blueprint), facility tiers, heat formula and the siege contract, garage bays and the heavy-bay T3 gate, manufacture list, the mines verdict (Salvage Rig instead), "no upkeep except generator fuel."

**This brief extends:** (1) the full 7-type POI inventory with sodgame's exact attributes (BASE_DESIGN assumed the POIs; this doc proves each one belongs); (2) the island map with coordinates for all 12 sites; (3) the holdout tutorial arc (BASE_DESIGN named shore_camp the starter; this doc stages its first 30 minutes); (4) the three faction base identities + the takeover kit (BASE_DESIGN deferred faction content to Phase 3 without designing it); (5) the 13-vehicle roster with numbers, silhouettes, upgrades, and trailer/bike rules (the vehicles brief sketched 6; Ian's list demanded 13).

**One adjustment proposed:** BASE_DESIGN's Garage T2 "fuel siphon trickle 1/hr from stored wrecks" should be capped at the Tanker trailer's 2000L, not infinite — otherwise fuel stops being a resource the moment you own a bay. Everything else stands as written.

---

## 6. Build order

- **Wave 4 (crafting, in flight):** land the missing items (`tire`, `engine_part`, `car_battery`, `valuables`, `fuel_can`, `wood`) — the vehicle economy has no inputs without them. Station recipes already scaffolded.
- **Wave 5 (structures):** holdout claim at shore_camp per BASE_DESIGN's v1 slice; the claim post + ghost palisade *is* the holdout tutorial.
- **Wave 6 (POIs):** new island POIs — marina/boatyard, strip mall, gas station, farm/barn, warehouse, school, raider forward camp; wreck re-themed as convoy wreck; military-base shell on the east cape (Remnant base structure, Phase 3 content later).
- **Wave 7 (vehicles), mesh sub-waves:** ① bike, motocross, ATV, sedan, pickup, skiff (the island's daily drivers); ② van, mustang, bronco, F250 (personality + tow); ③ box truck, semi + trailers, APC (heavy + endgame). Trailers ship with ② (pickup hitch first). Fuel/condition/repair/persistence per the shared rules above.
- **Phase 3 (factions):** the three main bases as full builds + takeover-branding kit + physical convoys on the island roads + the remnant quartermaster / union medic traders.

## 7. Open decisions for Ian (5)

1. **Military base on the island's east cape (~x 650) vs. held for the mainland?** *Recommend: east cape.* Phase 3 needs a terrestrial endgame on the beta map, and "the road ends at the Coast Guard station" is a better last-island beat than an empty cape.
2. **Skiff-only water, or bigger boats later?** *Recommend: skiff now; anything bigger is a mainland/Phase 4 conversation.* One water vehicle keeps the boat code honest.
3. **APC: player-drivable or faction set-dressing?** *Recommend: drivable, but earned — Remnant quartermaster at rep ≥75 or a quest chain.* The earned toy beats the found toy.
4. **Bike loading: snap-in slots (specced) vs. a tie-down minigame?** *Recommend: snap-in.* A minigame for loading a dirt bike is scope theater; the interesting decision is *which* bike you bring.
5. **Do factions flip POIs dynamically on the beta island in Phase 3, or is ownership fixed until Stage 2?** *Recommend: fixed in Phase 3, dynamic in Stage 2.* The takeover kit is built once and pays off twice — but dynamic flipping on the beta map risks invalidating the player's base neighbors mid-run, and that's a Stage 2 "evolved world" promise, not a Phase 3 one.
