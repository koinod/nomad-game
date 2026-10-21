# NOMAD — Parallel Execution Plan (2026-10-21, Ian's order 01:02)

**Mandate:** no queue. A planner (this doc) partitions the whole backlog into
lanes that run CONCURRENTLY in isolated git worktrees; lane coordinators
execute; the main agent gate-reviews, merges in the order in §5, verifies in
the main tree, and deploys. Buildings are PARKED by Ian's ruling (when they
return, visuals come from Google Stitch); the already-built airfield
(`Airfield.ts`, commit d8934fa) stays HELD at its render gate — it is not a
lane and no lane wires it into `World.ts`.

**State of main at plan time:** HEAD `0cbea75`, deployed, 227/227 tests,
tsc clean. Done: total purge (one car + lighthouse only), Rapier physics
(measured stock FX 231.7 km/h / 4.53 s; max build 266.5 km/h), carSpec +
physics-native upgrade tree + build sheet, lighting baseline (real sun,
IBL, ACES), WEATHER (5-state, wet grip), topography, save migration v3.

**Lane 0 (in flight, main tree — NOT spawned from this plan):** the
continuation coordinator owns the main tree: Stallion Blender round 3
(section-variation loft vs `design-refs/stallion/05-fx-package-2026-blue-sheet.png`),
airfield proof renders for the held gate, environment wrap. Its surfaces
are RESERVED until it reports and merges: `src/game/Vehicles.ts`,
`src/game/carSpec.ts`, `src/game/CarPhysics.ts`, `src/game/World.ts`,
`src/game/Weather.ts`, `src/game/Airfield.ts`, `src/game/kit.ts`,
`tools/build_mustang.py`, `public/mustang.glb`, `design-refs/proof-mustang/**`.
No lane touches those surfaces; lanes that eventually need them prepare
additive new files and serialized integration steps (§5).

**Universal gate rules (every lane):**
- Models: proof renders FIRST (multi-angle contact sheet in the lane's
  `design-refs/proof-*/` dir) → main-agent visual verdict → only then
  integration. No exceptions, no "integrate now, render later."
- Code: tsc clean + FULL vitest green + production build green per commit.
  Small, self-contained commits. Never push, never deploy.
- Shared files (`Game.ts`, `World.ts`, `gameStore.ts`, `Phone.tsx`,
  `save.ts`, `types.ts`, `Vehicles.ts`, `Player.ts`, `items.ts`,
  `Interact.ts`) have exactly ONE owning lane each (§4 matrix). Non-owners
  never edit them; they ship NEW files + an enumerated INTEGRATION STEP
  list in their report for the main agent to apply at merge.
- Save schema: `src/store/types.ts` + `src/systems/save.ts` are owned by
  Lane 5 for this cycle. Other lanes persist NOTHING new directly; they
  declare FIELD REQUESTS in their reports (field name, type, default,
  migration note). Optional-field passthrough only.
- Worktrees: `git worktree add ~/workspace/nomad-wt/<lane> -b lane/<lane> main`
  from `~/workspace/nomad`; symlink `node_modules` from the main checkout
  (`ln -s ~/workspace/nomad/node_modules <worktree>/node_modules`), never
  commit it, never commit `PLAYTEST_CHECKLIST.md`.

---

## 1. Item inventory — everything actionable, with sources

Status key: OPEN = not built · PARTIAL = exists, spec'd work remains ·
PARKED = built but deliberately disabled/held · VERIFY = docs disagree on
whether it landed; lane confirms at start and closes or builds.

### Vehicles
1. Stallion round 3 Blender model + GLB integration — Lane 0 (in flight).
   Source: gate rejections rounds 1–2; CRAFT_WAVE_BRIEF §1.
2. Stallion Base Model + Convoy Combat Edition variant shells (matte slate
   stock spawn; armor/louvers/cowl/bullbar/MG morph from the upgrade tree) —
   OPEN. Source: CRAFT_WAVE_BRIEF §1; design-refs/stallion/03, 04 sheets.
3. GLB-modeled upgrade parts (armor plates, bullbar, racks, louvers, MG)
   replacing the procedural morph meshes — OPEN. Source: coordinator
   report gap (2026-10-21); POIS §4.1 upgrade ladder A1/A2/ENG/CRG/RAM/lift.
4. GT500 cleanup + integration: convert `vehiclelights.tga` + `tyre.tga`,
   fix rear-quarter-window decal bleed, split merged wheels into 4 pivots,
   ×0.0438 rescale, real paint material, proof renders, drivable def on the
   carSpec/Rapier stack with period Shelby spec — OPEN. Source: Ian's
   archive + main-agent extraction report (~/workspace/gt500-work).
5. Seahawk (MH-60S) Blender build from `design-refs/seahawk-reference-ian.png`
   (+ Stitch MH-60S refs, design-refs/airbase/04) → renders → gate →
   flyable (rotor/pintle per canon; flight model rebuilt — purge deleted
   heliMath) — OPEN. Source: STITCH notes; MEMORY Sea Hawk benchmark.
6. Fleet return, one model at a time, each gate-approved, Stitch newest-per-
   design as refs — roster + build sub-waves from POIS §4/§6 and CRAFT_WAVE
   §2: ① sport bike, motocross, ATV, sedan, pickup, skiff · ② utility van,
   Bronco, F-250 dually, Sprinter (V-04 live-in), V-03 Hauler, Marsh Buggy ·
   ③ box truck, semi (Heavy Rig + sleeper), Goliath 6x6 APC (MG/32–40mm
   add-ons), tank (weapons preserved), tug. Specs (dims/seats/cargo/fuel/
   burn/noise) in POIS §4 table — OPEN (all).
7. Trailers rebuilt to standard: box, flatbed, tanker (2,000 L — POIS §4.2
   ruling), car carrier, HET-70 gooseneck lowboy (Stitch spec) + hitch
   matrix + bike snap-in slots — OPEN. Source: POIS §4.2; STITCH trailer
   family.
8. Vehicle systems depth: manufacture at Garage T3 (ATV/sedan/skiff only),
   vehicle noise on the noise bus per-vehicle radii, vehicles persist +
   phone map markers (exists via fleet telemetry — VERIFY post-purge),
   trunk-as-container slot-count UI — PARTIAL/OPEN. Source: POIS §4;
   BASE_DESIGN §3.4; SYSTEMS_SPEC §7.8.
9. Touch handbrake button — OPEN (flagged gap, coordinator report).
10. Dispatch re-enable when fleet ≥ 2 (GT500 merged): un-park, vehicle
    stays in-world rule kept — PARKED. Source: wave-3 dispatch ship +
    reset parking note.

### Figures (husks + people)
11. Husks COMPLETE rebuild — all kinds (shambler, stalker/runner, screamer,
    brute, crawler, bloater, spitter, armored/military) as rigged/Blender
    figures to the new visual standard; specials' shipped behaviors +
    HitProfiles preserved (huskMath) — OPEN (Ian's order 2026-10-20 22:59).
    Source: ROADMAP Wave 2; SYSTEMS_SPEC §8.3; wave-4 specials ship notes.
12. Survivor/NPC/player figures rebuild — rigged base pipeline (Mixamo-
    class), appearance system (skin/hair/build) + worn gear rendering
    preserved, SURVIVOR_LOOKS palettes, visible seated driver standard —
    OPEN (Ian's order). Source: wave-4 customization ship; CRAFT_WAVE §1
    (visible avatar standard).
13. Military husks at military POI + zone-tied husk loot (gun_parts) —
    PARTIAL (armored kind exists; placement/loot formalization open).
    Source: GAP_AUDIT §B; SYSTEMS_SPEC §4.5/§9.11.

### Sat phone + inventory
14. Phone-free inventory overlay — Tarkov/Unturned-style grid overlay
    usable WITHOUT opening the phone (Ian's standing preference) — OPEN.
15. Sat phone management rework: Pack/Character/Craft/Base/Team/Vehicles/
    Log polish pass on the shipped deck; build-sheet + dispatch UX
    consistency; phone as command deck per ROADMAP phone canon — PARTIAL.
16. Inventory depth: item condition display/repair flow in UI (data in
    item 21), storage transfer UX polish (select-then-Take/Put feel) —
    PARTIAL. Source: wave-3 grid ship notes; SYSTEMS_SPEC §1.3.

### Items + loot
17. Missing/remaining item IDs per SYSTEMS_SPEC §1.4 registry not yet in
    catalog: `smoke_grenade`, `rock_lure`, `decoy_boombox`, `circuit_board`,
    `gunpowder`, `brass`, `lead`, `flare_gun`, `bolts`, `ammo_556` —
    VERIFY against items.ts (191 ids at plan time), land what's missing.
18. Real item models: ground/hand meshes for items lacking them (weapons
    done in weaponMeshes; tools/materials/throwables/armor world models) —
    PARTIAL. Source: GAP_AUDIT §D.2; ROADMAP "item models" priority.
19. Disassembly yields on ItemDef (~50% craft cost rule) + bench action —
    OPEN. Source: SYSTEMS_SPEC §3.4; GAP §A.
20. Barter values on all tradable items (valuables economy anchor) —
    OPEN/PARTIAL. Source: SYSTEMS_SPEC §1.2, §3.5; GAP §A.
21. Durability/condition full loop: InvItem.condition wear rates, jam
    linkage (shipped at weapon level — VERIFY), repair actions (bench +
    tool_kit field cap 60%), loot condition rolls 35–85 — PARTIAL.
    Source: SYSTEMS_SPEC §1.3.
22. Biome → loot weighting (BIOME_LOOT_WEIGHT table, lootClass on entries)
    + POI respawn clocks (7–21 d re-roll) + disturbed-state container
    visuals — OPEN. Source: SYSTEMS_SPEC §4.5; POIS §1; GAP §B.
23. Stealth tools behavior: rock lure (20 m noise at landing, retrievable),
    boombox decoy (60 m loop, placeable, 2 uses) — OPEN (items in 17).
    Source: SYSTEMS_SPEC §2.4; GAP §A.
24. Alarm behavior on active-alarm POIs (60 m burst + scout pair + rep
    hit; tool_kit disarm) — OPEN, ships with its POIs (buildings parked,
    so: engine + flags now, POI instances when buildings return).
    Source: SYSTEMS_SPEC §4.4.

### Crafting
25. Craft timers + interruptible station crafting (game-time; sleep-through
    allowed) replacing instant station craft — OPEN. Source: SYSTEMS_SPEC
    §4.1; GAP §B.
26. Recipe book to ~30: T2 ammo-component reloads (gunpowder/brass/lead),
    chemistry line completion (molotov/smoke/fuel), repair recipes,
    r_circuit_board, fabrication (gun_parts/engine_part at Machine Shop T3)
    — PARTIAL (14+ recipes shipped). Source: SYSTEMS_SPEC §4.2.
27. Machine Shop world instance problem: `industrial` recipes currently
    gated on a station whose world instance sat at the (purged) marina —
    re-home the station interactable (data + interactable, NOT a building)
    — OPEN. Source: SYSTEMS_SPEC §0.2 #2; GAP §C #4.
28. Turret: blueprint-gated craft (bp_turret) + deployable defense —
    OPEN. Source: SYSTEMS_SPEC §4.3; GAP §A.
29. Mod attach/detach economy polish: attach costs, Gunsmith interactions
    — PARTIAL (mods shipped wave 2–4; spec §3.2 table is the target).
    Source: SYSTEMS_SPEC §3.2–3.3.

### Skills
30. Skills substrate verification + completion: 7 skills XP-by-use event
    table fully wired (all XP events in SYSTEMS_SPEC §6.1 — kills, crafts,
    repairs, heals, stealth, driving, looting, recruiting, sieges) —
    PARTIAL (skills.ts ships 7 skills/36 perks; event wiring VERIFY).
31. Archetype trees: Scavenger/Brawler/Mechanic/Ghost perk trees per
    SYSTEMS_SPEC §6.2 (9 perks/tree, tier gates, ONE capstone per run) —
    PARTIAL/OPEN (perk data exists; capstone exclusivity + tree UI per
    spec VERIFY/build).
32. Recipe skillReq gates live (mechanics 2 suppressor, 3 carbine,
    medicine 1 medkit, mechanics 5 + blueprint turret) — OPEN (depends
    on 30). Source: SYSTEMS_SPEC §6.1.
33. Visibility/light-exposure stealth state + HUD light indicator
    (Ghost-tree hook; exposure = light × crouch × motion × flashlight) —
    OPEN. Source: SYSTEMS_SPEC §6.3; GAP §A.

### Factions + story
34. factions.ts REWRITE to canon roster: keep Lighthouse Collective,
    Tollkeepers, The Drowned; fold The Pier → Union harbor quarter
    (Boudreaux = harbormaster), The Refuge → Union clinic wing (Okonkwo),
    Hollow Market → Skulls' Ocracoke fence (Accountant stays); add
    Military Remnants, Survivors Union, Rust Skulls with canon start reps
    (−50/+25/−30/0/0) — OPEN. Source: FACTIONS_CANON §1/§2/§5.
    ⚠ OPEN DECISION: rep band thresholds — FACTIONS_CANON §7.2 says the
    shipped repTier() bands stand; SYSTEMS_SPEC §0.1 says sodgame bands
    (Allied ≥75…) win. Lane ships roster + data band-agnostic; the band
    ruling is Ian's/main agent's before trader gates wire.
35. Territory/POI ownership data (canon §6 beta-island table: marina =
    Drowned, town = Union, relay = Remnant post, raider fort = Skulls,
    tollgate = Tollkeepers, Enclave cache sites) as data + map markers —
    OPEN (data only; physical bases are buildings = parked).
36. Traders: quartermaster (Remnants, rep ≥75), Union medic (≥25),
    Kowalski's bench (story-unlocked), Tollkeeper exchange, Drowned
    chandlery; Skulls/Listeners null-by-design; barter price engine on
    barterValue (item 20) — OPEN. Source: FACTIONS_CANON §2; SYSTEMS_SPEC
    §9.16.
37. Rep consequences: patrols/guards at owned POIs, witness-scaled rep,
    caravan/convoy events — PARTIAL/OPEN (Phase 3 systems; convoys +
    roadblocks also need the road network, item 40). Source: GAP §B;
    VEHICLES_FACTIONS_EVENTS_DESIGN via SYSTEMS_SPEC §9.16–17.
38. Story beats in the PURGED world: prologue → Jonah → relay (mast prop)
    → lighthouse ending wiring verified end-to-end post-purge; beacon
    light/dark choice recorded for hardmode seeding (canon Decision 4 —
    record the flag now, hardmode later); Enclave rumor beats (dead-drop
    caches, one radio burst) — PARTIAL/OPEN. Source: FACTIONS_CANON
    §2.7/§6; ROADMAP canon.
39. Side quests: PINNED by Ian (marked, not built) — data scaffolding
    only if free; no lane. Source: ROADMAP.
40. Island road network (spline graph through POIs) — gates convoys,
    vehicle world spawns, Mateo's broken-down-stranger beat — OPEN.
    Source: GAP §A/§B; ROADMAP Wave 7. (World.ts surface — serialized,
    see Lane 9 note.)

### Base systems
41. Base depth beyond parked v1: claimable-POI set per BASE_DESIGN §3.1
    (shore/jonah/town/relay/forest/dune; lighthouse + wreck never),
    relocation (70% salvage, stockpile doesn't teleport), outpost limits
    by Command Post tier — PARTIAL (claims parked to lighthouse grounds
    in the reset; data + logic un-park). Source: BASE_DESIGN §3.1–3.2;
    SYSTEMS_SPEC §7.9.
42. Facilities T2/T3 + staffing gates (Builder/specialist/blueprint),
    production lines (garden/infirmary/radio/salvage rig/fish traps),
    power budget (generator = only upkeep) — PARTIAL/OPEN. Source:
    BASE_DESIGN §3.3–3.6. NOTE: facility world geometry is buildings —
    PARKED; this item is data/logic/UI until buildings return.
43. Heat full loop: thresholds 30/60/90 → scout activity → siege warning →
    siege nights (husk variant now; raider variant Phase 3), guard posts
    + ammo logistics — PARTIAL (heat readout shipped; sieges OPEN).
    Source: BASE_DESIGN §3.7; SYSTEMS_SPEC §7.7.
44. Base tab screens per SYSTEMS_SPEC §7 (overview, claim, facility
    cards with honest gate text, stockpile w/ heat values, survivors,
    jobs board, garage, relocation dialog) — PARTIAL.
45. Survivor systems depth: generation (§5.1–5.2 name pools/backgrounds),
    17 traits (§5.3), morale model (§5.4 daily drivers + bands), jobs,
    designed recruits Elena/Mateo/Lina placed (§5.6 — Jonah/Kowalski NOT
    recruits), dormitory recruit pipeline (Union rep ≥25) — PARTIAL
    (5 recruits shipped wave 4; gen/traits/morale OPEN). Source:
    SYSTEMS_SPEC §5; GAP §A.

### Weapons / combat polish
46. Weapon roster completion per SYSTEMS_SPEC §2 tables (any of:
    crowbar, fire_axe, spear, riot_baton, flare_gun, revolver, crossbow,
    smg, carbine, marksman_rifle not yet in catalog — VERIFY vs items.ts)
    + guaranteed spawns where their POIs exist — PARTIAL.
47. Mod/finish polish: hand-mesh visual change per attached mod
    (suppressor tube, reflex hump, ext-mag length), finish kits coverage
    audit — PARTIAL. Source: SYSTEMS_SPEC §3.2.
48. Noise-class table completion: all 11 classes wired (vehicle idle/
    crash, explosion, container-force…) + suppressor hook verified real —
    PARTIAL (noise meter + classes shipped Phase A; table completion
    VERIFY). Source: GAP §A; SYSTEMS_SPEC §0.1 (gunshot 80 m ruling).
49. Mobile UI parity + revamp completion: touch handbrake (item 9),
    grenade throw affordance, hold-to-search progress/cancel, noise
    meter placement, safe/lockpick flow, drive layout — PARTIAL (Ian's
    standing order 2026-10-20). Source: MEMORY mobile UI revamp.

### Ambience / visuals
50. Wave 1 ambiance: depth of field (TP), realistic clouds, tighter TP
    fog/far plane, light shafts, wind/grass motion, shore audio — OPEN
    (weather shipped; this is the post/atmosphere layer). Source:
    ROADMAP Wave 1; GAP §B.
51. Post stack standardization for the Days Gone-tier target:ACES
    already in; add DoF + vignette/grade controls with perf budget —
    OPEN. Source: Ian 2026-10-20 23:00 north star.

### Explicitly NOT lanes (parked / pinned / later phases)
- All buildings + POI construction (Ian: parked; Stitch visuals later).
  Airfield integration (held at render gate, Lane 0 submits renders).
- Regions OBX → Norfolk → D.C., cure → hardmode, Stage 2 (Phase 4+).
- Side quests beyond scaffolding (pinned). Food spoilage (rejected on
  record, SYSTEMS_SPEC §0.1). Grid-inventory rejection stands (the grid
  shipped anyway in wave 3 — spec §0.1 note is stale; overlay item 14 is
  about phone-free access, not a new inventory model).

---

## 2. Lanes

Thirteen lanes. ALL spawn immediately (Ian: no queue) — parallelism is in
the START; integration is serialized at merge (§5). "Ring" = merge-order
band, not a start gate.

### LANE 0 — MAIN (in flight, not spawned from this plan)
Stallion r3 + airfield renders + environment wrap. Owns the reserved
surfaces listed in the header. Everything else routes around it.

### LANE 1 — GT500 (Ring 1)
Mission: GT500 from extracted mesh to gate-ready + integration-ready.
Worktree `~/workspace/nomad-wt/gt500`, branch `lane/gt500`.
Owns: `tools/gt500/**` (NEW), `design-refs/proof-gt500/**`,
`public/gt500.glb` (NEW), `src/game/gt500Def.ts` (NEW — pure def + spec
data + GLB loader helper, no edits to existing files).
Never touches: Vehicles.ts, carSpec.ts, World.ts, Game.ts.
Order: (1) texture conversion vehiclelights/tyre .tga→png; (2) decal-bleed
fix; (3) wheel split into 4 pivots; (4) ×0.0438 rescale + paint material;
(5) proof renders (6 angles + interior) → GATE; (6) gt500Def.ts with
period spec (S197 Shelby: ~500 hp class, mass, gearing) + enumerated
integration steps (Vehicles.ts registration, spawn placement at
lighthouse grounds or town remnant pad, save migration note).
M3.1: no (Blender-bound).

### LANE 2 — SEAHAWK (Ring 1, asset-only)
Mission: MH-60S Seahawk built in Blender from Ian's reference image to
gate-ready GLB. Worktree `~/workspace/nomad-wt/seahawk`, branch
`lane/seahawk`.
Owns: `tools/seahawk/**` (NEW), `design-refs/proof-seahawk/**`,
`public/seahawk.glb` (NEW).
Never touches: any src (flight integration is a later serialized step —
heliMath was purged; the integration brief comes after the gate).
Order: (1) airframe loft vs reference + airbase/04 render; (2) rotor
assembly (main + tail, separate pivots), cockpit interior, door gunner
station; (3) proof renders → GATE; (4) spec sheet for the flight-model
integration step (dims, mass, pivot map).
M3.1: no.

### LANE 3 — FLEET ASSETS (Ring 1, asset-only, long-running)
Mission: fleet models one at a time, Stitch refs, each gate-submitted
before the next starts. Worktree `~/workspace/nomad-wt/fleet-assets`,
branch `lane/fleet-assets`.
Owns: `tools/fleet/**` (NEW), `design-refs/proof-fleet/**`,
`public/models/*.glb` (NEW dir).
Order (POIS §6 sub-waves): pickup → sedan → ATV → sport bike → motocross
→ skiff → van → Bronco → F-250 → Sprinter → V-03 → Marsh Buggy → box
truck → semi → Goliath 6x6 → tank → tug → trailers (box/flatbed/tanker/
carrier/HET-70). Per model: build → renders → report (gate verdict
returns via main agent; lane starts the NEXT model's blockout while
awaiting verdicts — never integrates code).
M3.1: no.

### LANE 4 — FIGURES (Ring 2)
Mission: husks complete rebuild + survivor/NPC/player figures (items
11–13). Worktree `~/workspace/nomad-wt/figures`, branch `lane/figures`.
Owns: `src/game/Husks.ts`, `src/game/huskMath.ts`,
`src/data/survivors.ts`, `tools/figures/**` (NEW),
`design-refs/proof-figures/**`, `public/figures/*.glb` (NEW),
`src/game/figureKit.ts` (NEW — rigged-figure assembly/appearance/gear).
Never touches: Player.ts, gameStore.ts, Game.ts (avatar swap + store
appearance wiring = enumerated integration steps; appearance DATA shape
changes = field request to Lane 5).
Order: (1) figure pipeline + base rig; (2) husk kinds one at a time
(renders per kind → gate → Husks.ts integration inside the lane, since
Husks.ts is lane-owned); (3) specials' HitProfile/behavior parity tests;
(4) survivor/NPC figures + appearance/gear on figureKit; (5) military
husk + zone loot formalization (loot tables via Lane 6 interface —
items.ts is Lane 6's; lane files a data request, or takes items.ts
edit rights for husk-drop tables ONLY after Lane 6 merges).
Gates: renders per figure class; behavior parity = full vitest.
M3.1: light (test scaffolding only).

### LANE 5 — PHONE + INVENTORY (Ring 1, store/save owner)
Mission: sat phone management rework + phone-free inventory overlay
(items 14–16). Worktree `~/workspace/nomad-wt/phone-inventory`, branch
`lane/phone-inventory`.
Owns: `src/ui/Phone.tsx`, `src/ui/GridInventory.tsx`,
`src/ui/Backpack.tsx`, `src/ui/StoragePanel.tsx`, `src/ui/LootPanel.tsx`,
`src/ui/InventoryOverlay.tsx` (NEW), `src/store/gameStore.ts`,
`src/store/types.ts`, `src/store/inventoryUtils.ts`,
`src/store/gridUtils.ts`, `src/systems/save.ts`.
Never touches: Game.ts (the overlay self-registers its key handler
React-side and reads store flags — no Game.ts edit needed; if one proves
necessary it becomes an integration step), World.ts, Vehicles.ts.
Order: (1) types/save field-request intake (this lane is the schema
owner — it publishes the field contract other lanes code against);
(2) phone-free overlay (grid, drag/rotate, quick slots, storage mode);
(3) phone deck polish (apps consistency, build sheet, journal);
(4) condition/repair UI hooks (data from Lane 6); (5) panel-component
exports that Lanes 7/8/10 import at merge (CraftPanel/SkillsPanel/
BasePanel slots reserved in the deck).
M3.1: YES — heavy UI/store codegen is the prime M3.1 candidate.

### LANE 6 — ITEMS + LOOT (Ring 1)
Mission: catalog completion, item models, disassembly, barter, loot
systems (items 17–24, 46 data side). Worktree
`~/workspace/nomad-wt/items`, branch `lane/items`.
Owns: `src/data/items.ts`, `src/game/Interact.ts`,
`src/game/itemModels.ts` (NEW), `src/game/furnitureMeshes.ts`.
Never touches: types.ts/gameStore.ts (condition field etc. = field
requests to Lane 5), weaponMeshes.ts (Lane 11), World.ts (biome weights
read `biomeAt` via import only; container tagging is data-side).
Order: (1) VERIFY pass vs SYSTEMS_SPEC §1.4 registry — land missing IDs;
(2) disassembly + barterValue data; (3) item world models for unmodeled
items; (4) biome loot weighting + respawn clocks + disturbed-state
visuals; (5) stealth-tool behaviors (rock/boombox) in Interact;
(6) alarm engine (flags + trip logic, POI instances await buildings).
M3.1: YES (catalog data generation under schema checks).

### LANE 7 — CRAFTING (Ring 2)
Mission: crafting depth (items 25–29). Worktree
`~/workspace/nomad-wt/crafting`, branch `lane/crafting`.
Owns: `src/systems/crafting.ts` (NEW — timer engine, station tiers),
`src/data/stations.ts` (NEW — station/facility mapping per SYSTEMS_SPEC
§4.1), `src/ui/CraftPanel.tsx` (NEW — imported by Phone at merge).
Never touches: items.ts (recipe DATA additions are filed as a data
request to Lane 6 or applied after Lane 6 merges — the engine ships
against existing recipes first), Phone.tsx, gameStore.ts (craft-queue
persistence = field request to Lane 5).
Order: (1) timer engine + skill-gate interface (feature-detects Lane 8's
skill state; gates inert until it merges); (2) station tier mapping +
Machine Shop interactable re-home (interactable prop, not a building);
(3) T2 ammo-component recipes + chemistry completion (via Lane 6 data);
(4) turret craft + deployable (ghost logic shared with Lane 10 by
contract: Lane 10 owns base ghosts; turret deploys standalone in claim
radius — coordinate via reports, main agent arbitrates overlap).
M3.1: YES.

### LANE 8 — SKILLS (Ring 2)
Mission: skills substrate completion + archetype trees + stealth
visibility (items 30–33). Worktree `~/workspace/nomad-wt/skills`, branch
`lane/skills`.
Owns: `src/data/skills.ts`, `src/systems/skills.ts` (NEW — XP engine,
perk application), `src/ui/SkillsPanel.tsx` (NEW),
`src/game/visibility.ts` (NEW — exposure state + light indicator data).
Never touches: gameStore.ts (skill state persistence = field request to
Lane 5), Combat.ts/Husks.ts/Game.ts (XP event call sites = enumerated
integration steps with exact hook points), Phone.tsx.
Order: (1) XP event table implementation in the engine module +
hook-point inventory; (2) perk trees per SYSTEMS_SPEC §6.2 + capstone
exclusivity; (3) skillReq activation interface for Lane 7; (4)
visibility state module + HUD data (HUD.tsx edit = integration step,
Lane 11 owns HUD).
M3.1: YES (perk/XP table codegen + tests).

### LANE 9 — FACTIONS + STORY (Ring 2)
Mission: canon roster rewrite, territory data, traders, story wiring
(items 34–39). Worktree `~/workspace/nomad-wt/factions-story`, branch
`lane/factions-story`.
Owns: `src/data/factions.ts`, `src/data/quests.ts`,
`src/data/traders.ts` (NEW), `src/data/territory.ts` (NEW),
`src/game/Lighthouse.ts`, `src/ui/DialoguePanel.tsx`,
`src/ui/DialogueOverlay.tsx`, `src/ui/TraderPanel.tsx` (NEW).
Never touches: World.ts (NPC/POI-ownership placement + road network =
serialized WORLD WIRING step, §5; lane exports placement data +
a `worldWiring.ts` NEW module with pure placement tables), items.ts
(barter values are Lane 6's; traders consume them), Game.ts.
Order: (1) factions.ts rewrite (roster/folds/start reps; repTier bands
left as-is pending the §1 item-34 ruling); (2) territory data + map
marker data; (3) trader defs + TraderPanel (barter engine on Lane 6
values; functional with placeholder values if Lane 6 hasn't merged);
(4) story beat audit in the purged world (prologue/Jonah/relay-mast/
lighthouse ending; beacon choice flag — field request to Lane 5);
(5) Enclave rumor beats (cache data + one radio burst quest);
(6) road-network placement tables (data for the world wiring step).
M3.1: YES (dialogue/quest data volume).

### LANE 10 — BASE SYSTEMS (Ring 2)
Mission: base depth — claims un-park, facilities logic, heat/siege loop,
base screens (items 41–45 with Lane 4/9 interfaces). Worktree
`~/workspace/nomad-wt/base`, branch `lane/base`.
Owns: `src/data/base.ts`, `src/systems/baseClaims.ts` (NEW),
`src/ui/BasePanel.tsx` (NEW), `src/game/baseGhosts.ts` (NEW — prefab
ghost placement/rendering inside claim radius).
Never touches: World.ts (claim-post placement = world wiring step),
Phone.tsx (Base tab imports BasePanel at merge), gameStore.ts (base
state fields exist from wave 3 — extensions = field requests to
Lane 5), Husks.ts (siege waves spawn via Lane 4's exported spawn API —
contract: consume, don't edit).
Order: (1) claim set + relocation + outpost limits (data/logic);
(2) heat thresholds → scout/warning states (siege execution after
Lane 4's spawn API lands); (3) facility tiers + staffing gates + power
budget (logic + BasePanel UI; world geometry deferred — buildings
parked); (4) stockpile/heat-value screen + jobs board (survivor data
via Lane 4's survivors.ts — coordinate: Lane 10 consumes, Lane 4 owns;
job/morale LOGIC per SYSTEMS_SPEC §5.4 lives in NEW
`src/systems/morale.ts` owned by Lane 10).
M3.1: YES.

### LANE 11 — WEAPONS + MOBILE (Ring 2)
Mission: weapon/mods polish + mobile parity (items 46–49).
Worktree `~/workspace/nomad-wt/weapons-mobile`, branch
`lane/weapons-mobile`.
Owns: `src/data/mods.ts`, `src/game/weaponMeshes.ts`,
`src/game/gunMath.ts`, `src/game/Combat.ts`, `src/ui/HUD.tsx`,
`src/ui/TouchControls.tsx`, `src/game/input.ts`.
Never touches: items.ts (weapon item DATA gaps = data request to
Lane 6; Lane 11 owns weapon behavior/meshes), Player.ts (camera/ADS
hooks = integration steps), Game.ts.
Order: (1) touch handbrake + drive-layout parity (input.ts +
TouchControls); (2) mod visual deltas on hand meshes (buildHandMesh
mods param per SYSTEMS_SPEC §3.2) + finishes audit; (3) noise-class
table completion + suppressor verification (Combat); (4) mobile flows:
grenade affordance, search progress/cancel, safe/lockpick UI states;
(5) light-indicator HUD element (consumes Lane 8's visibility module).
M3.1: light.

### LANE 12 — AMBIENCE (Ring 3 modules, Ring-last integration)
Mission: Wave 1 ambiance + post stack (items 50–51). Worktree
`~/workspace/nomad-wt/ambience`, branch `lane/ambience`.
Owns: `src/game/PostFX.ts` (NEW — DoF/grade chain), `src/game/Clouds.ts`
(NEW), `src/ui/GameView.tsx`.
Never touches: World.ts (sky/fog parameters = integration step after
Lane 0's environment wrap merges — weather coupling lives there),
Game.ts.
Order: (1) cloud system module (drifting, day/night tint, weather-state
input from Weather.ts public API — read-only); (2) DoF chain with perf
budget + mobile fallback; (3) fog/far tightening as config in PostFX;
(4) light shafts + grass/wind motion hooks (module-level).
M3.1: no.

### LANE 13 — DISPATCH RE-ENABLE (Ring 3, dependency-gated START of integration)
Mission: un-park dispatch once fleet ≥ 2 (item 10). Worktree
`~/workspace/nomad-wt/dispatch`, branch `lane/dispatch`.
Owns: `src/data/dispatch.ts`, `src/ui/DispatchPanel.tsx` (NEW).
Never touches: Phone.tsx (Team tab hook at merge), Game.ts (sim tick
wiring = integration step), Vehicles.ts.
Start condition: code starts anytime (sim is pure); INTEGRATION waits
for Lane 1 merged (GT500 in the fleet) + Lane 5 merged (Team tab).
Order: (1) sim refresh vs current POI census; (2) multi-vehicle
assignment (defId duplication limit from wave 3 — fix with instance
ids from Lane 5's fleet state); (3) fuel burn on dispatches (wave-3
gap); (4) panel + journal reports polish.
M3.1: light.

---

## 3. Surface matrix (owner = sole editor; everyone else: new files + integration steps)

| Surface | Owner |
|---|---|
| Vehicles.ts, carSpec.ts, CarPhysics.ts, World.ts, Weather.ts, Airfield.ts, kit.ts | Lane 0 (reserved) → main agent after Lane 0 |
| tools/gt500, proof-gt500, public/gt500.glb, gt500Def.ts (new) | Lane 1 |
| tools/seahawk, proof-seahawk, public/seahawk.glb | Lane 2 |
| tools/fleet, proof-fleet, public/models/*.glb | Lane 3 |
| Husks.ts, huskMath.ts, survivors.ts, figureKit.ts (new), proof-figures, public/figures | Lane 4 |
| Phone.tsx, GridInventory/Backpack/StoragePanel/LootPanel, InventoryOverlay (new), gameStore.ts, types.ts, inventoryUtils, gridUtils, save.ts | Lane 5 |
| items.ts, Interact.ts, itemModels.ts (new), furnitureMeshes.ts | Lane 6 |
| systems/crafting.ts (new), data/stations.ts (new), CraftPanel.tsx (new) | Lane 7 |
| skills.ts (data), systems/skills.ts (new), SkillsPanel.tsx (new), visibility.ts (new) | Lane 8 |
| factions.ts, quests.ts, traders.ts (new), territory.ts (new), Lighthouse.ts, Dialogue*.tsx, TraderPanel.tsx (new) | Lane 9 |
| base.ts, systems/baseClaims.ts (new), systems/morale.ts (new), baseGhosts.ts (new), BasePanel.tsx (new) | Lane 10 |
| mods.ts, weaponMeshes.ts, gunMath.ts, Combat.ts, HUD.tsx, TouchControls.tsx, input.ts | Lane 11 |
| PostFX.ts (new), Clouds.ts (new), GameView.tsx | Lane 12 |
| dispatch.ts, DispatchPanel.tsx (new) | Lane 13 |
| Game.ts, Player.ts | NO lane — main agent only, via enumerated integration steps |

---

## 4. Merge protocol

1. **Order** (integration order, NOT start order):
   Lane 0 (already main) → Lane 5 → Lane 6 → Lane 1 → Lane 8 → Lane 7 →
   Lane 4 → Lane 9 → Lane 10 → Lane 11 → Lane 2 integration (when its
   flight step is briefed) → Lane 3 integrations (per model, as gates
   pass) → Lane 12 → Lane 13.
   Rationale: Lane 5 owns store/types/save — every field request resolves
   against its merged shape. Lane 6 next (items data underpins crafting,
   traders, loot). Lane 1 after Lane 0 frees Vehicles.ts. Skills (8)
   before crafting (7) so skillReq gates land live. Figures (4) after
   Lane 5 (appearance fields) — its Husks.ts work is independent but the
   avatar integration step needs Player.ts free of Lane 0. Factions (9)
   before base (10) (territory data feeds claim rules). Ambience (12)
   late because its World/GameView wiring sits on Lane 0's finished
   environment. Dispatch (13) last (needs fleet ≥ 2 + Team tab).
2. **Per-merge steps (main agent executes):** lane rebases onto current
   main (lane does this and re-greens BEFORE requesting merge) → main
   agent applies the lane's enumerated INTEGRATION STEPS (shared-file
   edits, listed in the lane's final report with exact anchors) → full
   tsc + vitest + production build IN THE MAIN TREE → visual gate check
   for any model content → merge commit → push → deploy → served-hash
   verification → Ian messaged (standing order).
3. **Conflicts:** if a rebase conflict touches a file the lane doesn't
   own, the lane STOPS and reports — it never resolves another lane's
   surface. Main agent arbitrates. Two lanes needing the same shared
   file in the same merge window: the earlier merge-order lane wins;
   the other re-enumerates its steps against the new main.
4. **World wiring train:** World.ts integration steps from Lanes 9
   (NPC/territory/road data), 10 (claim posts), 12 (sky/fog) are applied
   in ONE scheduled pass by the main agent after Lanes 9+10 have merged
   their data, to avoid three sequential World.ts conflicts.
5. **Field requests:** collected from lane reports into Lane 5's queue
   (or applied by the main agent post-Lane-5-merge as types/save-only
   commits). A lane blocked on a field codes against a declared local
   interface and lists the exact field in its integration steps.

---

## 5. Top risks to parallelism (honest)

1. **gameStore/types/save contention.** Five lanes want store fields.
   Mitigation: Lane 5 sole ownership + field-request protocol + Lane 5
   merges first. Residual risk: Lane 5 is the critical path — if it
   stalls, four lanes' integration steps queue behind it.
2. **Game.ts / Player.ts integration pileup.** No lane owns them, by
   design — but Lanes 4, 8, 11, 13 all land steps there. Mitigation:
   steps must be small, anchored, and enumerated; main agent applies
   them in merge order. If a lane's step exceeds ~30 lines in Game.ts,
   it gets bounced back for redesign around store flags/events.
3. **World.ts wiring train.** Factions, base, ambience, roads all
   converge on World.ts. Mitigation: §4.4 single pass. Residual: the
   road network (item 40) is the least-specified piece — its data shape
   may force a second pass.
4. **Blender CPU contention.** Lanes 0–4 + figures all render on one VM;
   Cycles renders already take ~100 s/angle at low samples. Mitigation:
   lanes stagger heavy render batches and use low-sample proof settings;
   expect render throughput, not code, to be the overnight bottleneck.
5. **Semantic test collisions.** Each lane green in isolation can still
   break cross-system tests at merge (loot tables vs item ids, spawn
   census vs dispatch). Mitigation: full-suite verification in the main
   tree per merge (§4.2); lanes pin their assumptions in tests.
6. **The rep-band contradiction** (FACTIONS_CANON §7.2 vs SYSTEMS_SPEC
   §0.1) and the five open canon decisions (Enclave canonization, folds
   — adopted in this plan per canon §5, town claim rule — adopted per
   FACTIONS_CANON Decision 3 + SYSTEMS_SPEC §7.2, beacon→hardmode,
   hardmode traders). Lanes build band-agnostic/data-side; trader GATES
   and town claim path must not hard-code a band until Ian rules.
7. **GT500 working set lives outside the repo** (~/workspace/gt500-work,
   18 MB). Lane 1 references it read-only and commits only the cleaned
   GLB + build script — never the raw working set.
8. **Buildings parked vs base/faction ambitions.** Facilities, faction
   bases, and POI instances are geometry-blocked. Lanes 9/10 ship data,
   logic, UI, and markers only; anyone caught building structures is
   out of scope until Ian un-parks buildings (Stitch visuals).
9. **M3.1 tunnel dependency.** The Mac mini tunnel was down at plan
   time. Lanes route heavy codegen via OpenCode/M3.1 Flash ONLY when
   `ssh macmini` answers (probe once per work session, never stall
   waiting); all M3.1 output passes the lane's full test gate — it does
   labor, the lane keeps judgment. Free window ends Oct 22 23:59 UTC.

---

## 6. Per-lane report format (every lane, every wave)

HEAD hash · commits (hash + one line each) · test count · tsc/build
status · gate submissions (render paths, if any) · INTEGRATION STEPS
(enumerated, with file + anchor + exact change) · FIELD REQUESTS ·
data requests to other lanes · gaps/risks honestly flagged.
