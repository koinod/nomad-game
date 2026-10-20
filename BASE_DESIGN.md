# NOMAD — Base Building Design Brief (the Judge's Verdict)

**Source:** Ian's ask (2026-10-19) + judge-pass over ten reference games, scored against
NOMAD as it actually is: a single-player 3D browser game, built in waves, AABB-collision
engine (no physics solver), POI-based island now, factions in Phase 3, a road journey in
Phase 4, an evolved overworld in Stage 2.
**Companion docs:** ROADMAP.md (Wave 5 = structures/base building), HOUSES_DESIGN.md
(garage pads, vehicle parts), VEHICLES_FACTIONS_EVENTS_DESIGN.md (heat formula, garage
repair rules, facility rates from sodgame).

**The one-sentence verdict:** NOMAD's base system is **State of Decay 2's skeleton**
(facility slots at claimed POIs, one home base + outposts, survivor-gated growth),
**built with Sons of the Forest's hands** (blueprint ghosts that survivors visibly
construct), **defended on 7 Days to Die's calendar** (telegraphed siege nights driven
by sodgame's heat math), with **Dune Awakening's garage rules** — and it explicitly
rejects Rust's upkeep/decay and all freeform voxel building.

---

## 1. The Judge Matrix

Scored 1–5 per criterion, judged for NOMAD — not for the game's own quality.
**B** = fits a browser 3D game built in waves · **P** = fits the POI-claim fantasy ·
**L** = labor/economy depth · **D** = defense loop · **V** = vehicle integration.

| Game | B | P | L | D | V | Total | The one mechanic worth stealing |
|---|---|---|---|---|---|---|---|
| **State of Decay 2** | 5 | 5 | 5 | 3 | 3 | **21** | **Facility slots + outposts.** Bases are chosen places with fixed large/small slots, built-in facilities, and survivor-count gates; everything else (outposts) is a cheap satellite that yields resources, beds, or power. Scoping *is* the design — every base decision is "which 6 things," never "how many polygons." |
| **Project Zomboid** | 3 | 4 | 4 | 3 | 2 | **16** | **Barricade + rain collector texture.** Any found house becomes a base by nailing planks over its openings (1 plank + 1 nail per layer, carpentry-scaled), and a rain barrel turns weather into water. Cheap, diegetic, skill-gated — the best "initials you do yourself" model in the genre. |
| **Once Human** | 3 | 3 | 4 | 3 | 3 | **16** | **Power as a budget, workers as slots.** A Territory Core defines the claim; every station draws from a generator pool; passive workers (Deviations) occupy a limited slot pool raised by progression, not by building more pods. The limiter is a *number you manage*, not geometry. |
| **7 Days to Die** | 2 | 4 | 2 | 5 | 2 | **15** | **The telegraphed horde night + upgrade-in-place.** Everyone converts POIs into forts; the Blood Moon is a scheduled, announced exam your base either passes or doesn't, and blocks upgrade wood→cobble→concrete in place. The defense loop is the game. (Its structural-integrity physics is the part we must NOT copy — see §2.) |
| **Sons of the Forest** | 4 | 2 | 5 | 3 | 1 | **15** | **Blueprint ghosts + Kelvin.** 78 prefabs placed as translucent blueprints, completed by hauling materials — and an AI companion who physically does the hauling/building on command. This is exactly how survivor labor should *look* in 3D: a person working, not a progress bar in a menu. |
| **Dune: Awakening** | 2 | 3 | 2 | 3 | 5 | **15** | **The garage is protection, and bases are relocatable.** Vehicles left outside are destroyed by the world (storms); garaging is survival, not tidiness. Vehicle fabrication happens at base fabricators. And the blueprint snapshot/relocate tool admits players will move — bases are positions, not monuments. |
| **Grounded (1+2)** | 4 | 2 | 2 | 4 | 1 | **13** | **Aggro-driven raids.** Bases get raided by the faction whose members you've been killing nearby — defense pressure is *caused by your behavior*, locally. Also: free no-cost repairs after raids keep the loop forgiving. |
| **Rust** | 2 | 2 | 1 | 4 | 2 | **11** | **The claim radius.** The Tool Cupboard's 50m building-privilege bubble is a clean, legible claim primitive. Everything else — freeform honeycombing, 10–33%/day upkeep, decay — is a multiplayer-grief economy that punishes a solo player for sleeping. We take the bubble, burn the rest. |
| **DayZ** | 2 | 3 | 1 | 2 | 3 | **11** | **A warning, plus tents.** A decade of DayZ proves freeform base building in a loot world produces offline-raid grief, fence-code-lock jank, and bases nobody finds worth defending. Its one honest contribution: persistent deployable storage (tents) and vehicles-as-storage — loot lives in the world, not a magic menu. |
| **Valheim** | 3 | 1 | 2 | 3 | 1 | **10** | **Comfort.** Base quality (roof, fire, furnishings) produces the Rested buff — the base pays you for existing. NOMAD already has Well Rested from sleep; Valheim shows how to tie that buff to *what you've built*, making bases emotionally load-bearing. Its stability-graph physics and portal network don't transfer. |

**What the matrix says overall:** the winners share one trait — they *constrain*
building (slots, cores, blueprints) and spend the saved budget on economy and
consequence. The losers spend everything on geometry freedom and have no labor
system at all (Rust/DayZ labor score: 1 — the player's own grind is the only labor).
Ian's ask — survivors who build, facilities that produce, vehicles that park — is
a management fantasy wearing a building costume. The matrix says build the
management game.

---

## 2. The Verdict — NOMAD's Base Strategy

**"Slots & Ghosts":**

1. **Claim places, don't zone land** (SoD2). Bases are specific POIs with a fixed
   slot layout. One **home base** at a time + cheap **outposts**. Home base can be
   *relocated* (facilities salvage-refund at 70%, Dune-style snapshot) — because
   NOMAD's climax is a road trip, the base system must support moving forward,
   not one forever-fortress. This is the single most NOMAD-specific call in this
   doc: Rust and Dune assume you dig in; NOMAD's story says you *leave*.
2. **Facilities in slots, tiers on facilities** (SoD2 + sodgame's own facility
   table). Each facility: 3 tiers, blueprint-gated at T3, staffed by a survivor
   job. Production rates anchor to sodgame's numbers (Ian's own tuning) — but
   NOMAD closes the loop sodgame left open: production **consumes power and
   labor**, and pauses when the staffer is sick, injured, or dead.
3. **Structures as blueprint ghosts** (SotF + Roadmap Wave 5's "copy-paste
   prefabs"). A small kit — palisade, gate, spikes, watchtower, fence, rain
   barrel — placed as translucent ghosts inside the claim radius. Ghosts complete
   when materials are delivered and labor time elapses; a Builder survivor
   visibly works them. No freeform walls-anywhere, no voxel, no structural
   integrity sim: prefab pieces have HP and use the AABB colliders the engine
   already has. 7DTD's lesson kept (upgrade-in-place: wood → scrap-reinforced),
   its physics rejected.
4. **Labor is the progression currency** (PZ time + Kelvin hands). The player can
   solo Tier 1 and prefab pieces, slowly. Everything above that needs survivors —
   which makes Wave 8 recruiting the key that unlocks Wave 5's ceiling, and makes
   every recruit a build decision.
5. **Defense is a calendar event, not a sim** (7DTD + sodgame heat). Heat
   (formula in §3.7) crosses thresholds → radio warning → siege night. No
   always-on raid RNG, no decay. Your base is attacked *because you got rich*,
   on a schedule you can read — Ian's "consequence honesty" as a system.
6. **Power is the only upkeep** (Once Human). A generator burns fuel and gates
   T2+ facilities. No Rust-style material upkeep, no decay timers: in a
   single-player browser game, punishing absence is churn, not tension.

**Why this fits NOMAD's phases:** Phase 2 gets slots/ghosts/labor with the POIs
that already exist. Phase 3 factions plug straight in — outposts are rep
territory, sieges gain a raider variant, the military base becomes the endgame
compound. Phase 4's road is an outpost chain: claim, stock, move home forward.
Stage 2 inherits persistent bases in an evolved world where factions contest
them — the slot data model survives every phase unchanged.

---

## 3. System Spec

### 3.1 Claimable POIs

| POI | Class | Slots | Why |
|---|---|---|---|
| **shore_camp** | Home-eligible (Camp) | 3 facility + prefab ring | The starter. Where the game already teaches campfires/sleep; claim is the tutorial. Shore access = salvage + fish traps (§3.6). |
| **jonah_camp** | Home-eligible (Camp+) | 4 facility + prefab ring | The inland alternative — forest cover, deer, worse water. A real choice vs. shore, not an upgrade. |
| **town** | Home-eligible (Settlement) | 6 facility + 2 garage bays + prefab ring | The prize: houses, garages, loot density. Gated by survivors (§3.2) because SoD2 is right — big bases should be *earned with people*. Highest ambient husk pressure. |
| **relay_station** | Outpost+ | 1 facility + built-in Radio Tower | The intel outpost. You don't live here; you staff it and it watches the island for you. |
| **forest_cache** | Field outpost | 1 storage, no facility | A locker, a campfire, a fast-travel node. Cheap forward stash for hunting. |
| **dune_cache** | Field outpost | 1 storage, no facility | Same, east side — the D.C.-road staging instinct starts here. |
| **lighthouse_base** | **Not claimable** | — | Story anchor + Collective site. Sleep/fast-travel only. Claiming it would let the player bulldoze the ending's geography. (Revisit in Stage 2.) |
| **wreck** | **Not claimable** | — | Salvage/event stage (see Event Catalog #11). It is a resource *source* for shore bases, not a home. |
| **military base** (Wave 6 POI) | Home-eligible (Compound) | 8 facility + heavy bay | Phase 3 endgame base. Exists in the data model from day one; content arrives with its POI. |

**Outpost limit:** 2 at Command Post T1, +1 per tier (max 4). Outposts need no
staffing to hold, but production facilities in outposts need a staffer living
there (who then isn't at home — the SoD2 beds problem, deliberately).

### 3.2 Claim requirements

- **Clear:** no live husks within 40m (the Rust claim bubble, repurposed).
- **Claim action:** hold F at the campfire/claim post for 5s → pay cost → the
  AppBoy gains a Base tab; the site joins the fast-travel network.
- **Costs:** shore_camp free (story-guided) · jonah_camp 15 scrap · field
  outposts 10 scrap each · relay_station 20 scrap + 10 wire · town **40 scrap +
  3 recruited survivors** · military base: clear it (that's the cost).
- **Relocating home:** claim a new home-eligible POI → old facilities salvage
  at 70% material refund, stockpile does *not* teleport (haul it, or lose it —
  box trucks exist for a reason). Outposts persist.

### 3.3 Facility slots & tiers

Costs in NOMAD items. Existing: `scrap`, `wire`, `cloth`. Shipped in
items.ts with the workstation-crafting wave (2026-10-19): `tire`,
`engine_part`, `car_battery`, `fuel_can`, `chemicals`. Specced in
HOUSES_DESIGN but not yet in items.ts (prerequisite ticket): `valuables`.
New items proposed in §3.8: `wood`, `gun_parts`, `produce`.
Build times are in-game hours with 1 Builder on the job (player solo = ×1.5,
T1 only — §3.5). Power draw from sodgame's 0.4–1.2 kW band.

| Facility | T1 | T2 | T3 | Effect by tier |
|---|---|---|---|---|
| **Command Post** *(built-in on claim)* | — | 20 scrap, 10 wire · 3h | 40 scrap, 20 wire, 1 `relay_part` · 6h | T1: base tab, 2 outpost slots. T2: +1 slot, heat readout + siege warning. T3: +1 slot, convoy intel (spends Radio intel). |
| **Workbench → Workshop → Machine Shop** | 10 scrap, 6 wood · 2h | 25 scrap, 10 wire · 4h | 45 scrap, 15 wire, 2 `gun_parts` · 8h | T1: Wave 4 bench recipes (ammo reload, medkit). T2: weapon/armor crafting, repair kits. T3: fabricate `gun_parts`, `engine_part` (from scrap+wire, slow) — manufacturing ceiling. Staffed Mechanic: +25% craft speed. |
| **Storage Locker → Supply Depot** | 8 wood, 4 scrap · 1h | 20 scrap, 10 wood · 3h | 40 scrap, 10 wire · 6h | Stockpile cap 200kg → 600kg → 1500kg. T2+: stockpile readable at outposts (deposit anywhere, withdraw at home). This stockpile is what heat counts (§3.7). |
| **Rain Collector → Pump Station** | 6 wood, 4 cloth · 1h | 15 scrap, 8 wire · 3h · 0.4 kW | 30 scrap, 12 wire · 6h · 0.8 kW | `water_bottle` 0.4/hr → 1.0/hr → 2.0/hr. T1 is PZ's rain barrel honestly ported; T2+ is a well pump (the Outer Banks water table is 2m down — no hauling from a river). |
| **Garden → Greenhouse → Hydroponics** | 8 wood · 2h | 20 scrap, 10 cloth · 4h · 0.4 kW | 35 scrap, 15 wire · 8h · 0.8 kW | `produce` 0.8/hr → 1.6/hr → 3.0/hr. T3 adds bandage-herb trickle 0.3/hr (sodgame's Hydro Farm did food+meds at T2 — same instinct). Needs Farmer staffed at T2+. |
| **Med Cot → Infirmary → Field Hospital** | 10 cloth, 5 scrap · 2h | 25 scrap, 10 cloth · 4h · 0.4 kW | 45 scrap, 15 wire · 8h · 0.8 kW | `bandage` 0.5/hr (sodgame's Infirmary T1 rate). T2: medkit crafting + injured survivors recover 2×. T3: `medkit` 0.4/hr passive, recovery 3×. Needs Medic staffed at T2+. |
| **Radio Tower** *(built-in at relay; buildable elsewhere T2+)* | 15 scrap, 12 wire · 3h | 25 scrap, 20 wire · 6h · 0.4 kW | — | **Intel** 0.5/hr → 1.0/hr (sodgame's rate). Intel is spent, not eaten: convoy schedules, siege forecasts, Static-surge warnings. Needs Operator staffed. |
| **Garage Bay** *(see §3.4)* | 20 scrap, 10 wood · 4h | 40 scrap, 15 wire · 8h · 0.4 kW | 70 scrap, 2 `engine_part` · 12h · 1.2 kW | Bays 1 → 2 → 3 (T3 bay is heavy: box truck / semi tractor). |
| **Generator** | 12 scrap, 6 wire · 2h | 30 scrap, 12 wire · 5h | — | 1.5 kW → 3.5 kW. Burns 1 `fuel_can` per 10h (T1) / 16h (T2, more efficient). **The only upkeep in the game.** Loud: +noise, feeds heat slightly. |
| **Salvage Rig** *(shore_camp / town-dock only)* | 12 scrap, 6 wood · 3h | 30 scrap, 10 wire · 6h | — | §3.6 — the "mine." |
| **Watchtower** *(also a prefab, §3.3b)* | — | — | — | Listed with prefabs; a staffed tower is a defense facility in all but slot cost. |

### 3.3b Prefab kit (structures & defenses — Wave 5's copy-paste kit)

Placed as ghosts inside the claim radius (40m home / 20m outpost), on anchor
snap points in v1 (see §4 cuts). All have HP, all are AABB colliders — husks
path to gates and doors, as they already do at houses.

| Piece | Cost | Build time | Stats |
|---|---|---|---|
| Palisade wall (3m) | 3 `wood` | 20 min | 300 HP. Upgrade-in-place: +4 scrap → 700 HP scrap-plated. +1 defense. |
| Gate | 4 `wood`, 2 scrap | 30 min | 250 HP, player/survivor passable, husk-proof closed. +2 defense (it's the weak point, priced honestly). |
| Spike barricade | 2 `wood`, 1 scrap | 15 min | 120 HP, deals 6 dmg/s to husks in contact. +1 defense. |
| Fence (3m) | 2 `wood` | 10 min | 80 HP — channeling, not stopping. +0 defense (decoration/delineation). |
| Watchtower | 12 `wood`, 4 scrap | 2h | Climbable floor rect (houses v2 tech), +8 defense, staffed Guard fires from it during sieges. |
| Rain barrel | 3 `wood`, 1 cloth | 15 min | +0.15/hr water — stacks with, doesn't replace, the Water facility. |
| Campfire + bedroll set | 2 `wood`, 2 cloth | 10 min | Outpost utility: sleep/save point, Well Rested source. Comfort items (below). |
| Storage crate | 4 `wood` | 10 min | Physical overflow storage at outposts (DayZ's tent lesson: loot lives in the world). |

**Comfort (Valheim's steal):** bedroll sets, a table, a lit campfire inside the
claim radius raise base Comfort 0–3; Comfort ≥2 extends Well Rested duration.
Cheap to implement, makes bases feel *kept*.

### 3.4 Vehicles: storage & manufacture

- **Parking is physical** (vehicles persist where left — already specced).
  A vehicle inside a **garage bay** is *stored*: protected from Static surges
  and storm events, deprioritized as a siege target, and listed in the AppBoy
  with fuel/condition. A vehicle parked at base but **not** in a bay is
  exposed — Dune's rule: the world eats what you leave out.
- **Bay sizes:** standard bay = skiff-on-trailer / ATV / sedan / pickup.
  Heavy bay (Garage T3) = box truck, semi tractor + trailer. Ian's "park
  semitrucks" is a T3 fantasy on purpose — it should feel earned.
- **Repair:** at a bay, parts restore condition (full repair). Field repair
  caps at 60% (per the vehicles brief). Garage T2 adds a `fuel_can` siphon
  trickle 1/hr from stored wrecks (sodgame's Garage Bay rate).
- **Manufacture (Garage T3 + Machine Shop T2, Mechanic required):** assemble
  light vehicles from parts — this is a *rebuild* fantasy, not a factory:
  - **ATV:** 20 scrap, 2 `tire`, 1 `engine_part`, 1 `car_battery` · 6h
  - **Sedan:** 35 scrap, 4 `tire`, 1 `engine_part`, 1 `car_battery` · 10h
  - **Skiff:** 25 scrap, 1 `engine_part`, 6 `wood` (hull patch) · 8h — shore bases only.
  - Box trucks and semis are **never manufacturable** — found and repaired
    only. If everything is craftable, nothing found is exciting. (Judge's call;
    flagged as Decision 5's cousin if Ian disagrees.)

### 3.5 Survivor labor rules

- **Jobs:** Builder, Mechanic, Medic, Farmer, Scavenger, Guard, Operator.
  One job per survivor; job = the survivor's station. Unstaffed facility:
  T1 runs at 25% (a garden untended still grows a little), **T2+ produces
  nothing** — staffing is the tax on tier, per sodgame's job-slot design.
- **Build rules:**
  - Player solo: **Tier 1 facilities + all prefabs only**, at ×1.5 time.
    ("Initials by yourself" — Ian's words, made literal.)
  - T2: requires ≥1 Builder assigned (player may assist → ×0.75 time).
  - T3: requires Builder + the facility's specialist (Mechanic for
    Garage/Machine Shop, Medic for Field Hospital, etc.) + blueprint item
    from T4/T5 loot (military armory, convoy cargo — per the events brief).
  - One active construction per base (two if 3+ Builders). Ghosts queue.
  - Builders visibly work the ghost (Kelvin model): walk to it, hammer
    animation, progress accrues only while a builder is on site and awake.
- **Upkeep of people:** each survivor eats 2 food-units + 1 water per day
  from the stockpile. Empty stockpile → morale falls → production halves →
  at zero morale for 3 days, they leave (SoD2's stakes, softened: they
  leave *alive*, and can be re-recruited once, bitter).
- **Guards:** a staffed watchtower/guard post is the difference between a
  siege damaging facilities and a siege *failing*. Guards consume ammo from
  stockpile during sieges — defense has a logistics tail, like 7DTD says.

### 3.6 Supply generation — and the mines verdict

**Mines: no.** Ian's instinct is correct. The Outer Banks is a sandbar —
there is no ore body, no bedrock, nothing to mine; a "mine" would be a hole
in sand that fills with water. But the *fantasy* he wants (a staffed site
that converts labor into a material trickle) is right, and the island has a
thematically perfect equivalent: **the wrecks**. The Graveyard of the
Atlantic is the island's ore body.

- **Salvage Rig** (shore_camp, town dock): staffed Scavenger works the
  shallows and strips wreckage. `scrap` 1.2/hr, `wire` 0.4/hr, and ~8%/hr
  chance of a vehicle part (`tire`/`engine_part`/`car_battery` rotation —
  expected ≈1 part per 12 staffed hours). T2 adds a dredge barge: rates ×1.8,
  part chance 12%/hr.
- **Fish traps / crab pots** (any shore claim): `raw_meat` 0.5/hr — the
  protein line that pairs with the Garden for cooked meals.
- Everything else generates per §3.3: water (rain/pump), food (garden,
  traps), meds (infirmary), intel (radio), fuel (garage siphon), parts
  (salvage + machine shop). The base economy closes: a staffed Settlement
  is ~80% self-sustaining and still must leave home for ammo, blueprints,
  and gun parts — production should *support* scavenging, never replace it.

### 3.7 Heat & defense (the siege contract)

Heat is sodgame's formula, unchanged (VEHICLES brief §5):
**heat = stockpileValue ×1.2 + defenseScore ×0.8 + daysSurvived ×0.5.**

- **Stockpile value** = Σ item values in base storage: scrap 1, wood 1,
  cloth 1, wire 2, canned_food/produce 2, water 2, bandage 3, ammo_9mm 1,
  fuel_can 6, medkit 8, vehicle parts 10, gun_parts 12, valuables 15.
  Only *stored* wealth counts — carrying loot is safe, banking it is taxed.
  That tension is the system.
- **Defense score** = Σ prefab/facility defense (palisade 1, gate 2, spikes
  1, watchtower 8) + 6 per staffed Guard (cap +18) + 5 if Garage T2+
  (armored doors headcanon: it's the motor pool's shutters). Note the
  formula's deliberate irony, kept from sodgame: **defense raises heat** —
  a fortress is visible. Defense doesn't prevent the siege; it wins it.
- **Thresholds:** 30 → scout activity (husks/raider scouts sniff the
  perimeter; Radio Operator mentions it). 60 → **warning**: next night is a
  siege night, announced a full day ahead via radio/AppBoy. 90 → siege
  escalates a tier (specials join; raider variant unlocks at Phase 3).
- **Siege night:** waves path to gates/storage (existing door-seeking
  behavior), staffed guards fight from towers, survivors not on jobs take
  shelter. Win = raider/husk loot + morale. Lose = stockpile −25%, 1–2
  facilities damaged (repair = 50% build cost, no rebuild timer), possible
  survivor injury (med bay time). **Never** a total wipe, never offline:
  sieges only trigger on a night the player is at/near base — if you're
  away, the warning waits, scouts mill about, and the bill comes due when
  you come home. Valheim's rule (events only near the player), not Rust's.
- **Grounded's modifier:** husk kills within 100m of base add +0.2 heat
  each (aggro is local) — leading a horde home has a price tag attached.

### 3.8 New items required

| Item | Why |
|---|---|
| `wood` (lumber) | The missing construction material. Source: hatchet on trees (the tool and the trees both already exist — this closes a loop that's currently decorative). Stack 20. |
| `fuel_can` | Generator + vehicle economy needs a fuel *item*; sodgame refueled +20L per can. Stack 4. Loot: gas station POI (Wave 6), garage siphon. |
| `gun_parts` | Machine Shop T3 gate + weapon crafting sink for military loot. Stack 5. |
| `produce` | Garden output (food, heal ~18, cookable with raw_meat → cooked_meat ×2 via a field recipe). Stack 6. |
| *(already specced, unimplemented)* `tire`, `engine_part`, `car_battery`, `valuables` | HOUSES_DESIGN promised these in v1; they're garage/manufacture prerequisites. Implement with houses v2 or Wave 4, whichever lands first. |

---

## 4. Phased Build Order

Aligned to ROADMAP waves. Each slice is independently shippable/playable.

**Wave 4 (prereq, already planned):** crafting tables. The workbench placed
at camps *is* Facility T1 in embryo — build the recipe system on the facility
data model now so Wave 5 doesn't refactor it. Also: implement the four
specced-but-missing items + `wood` harvesting here (hatchet + tree → wood).

**Wave 5 — Base v1 (the smallest viable slice):**
- Claim system at **shore_camp + jonah_camp** (clear + hold-F + cost).
- Command Post T1, Storage T1, Workbench T1 as slot facilities.
- Prefab kit: palisade, gate, spikes, rain barrel — ghost placement on
  **fixed anchor points** around each claim (not free placement yet).
- Ghost-build with **player labor only** (timers ×1.5 solo rule active).
- Heat computed + shown in the AppBoy Base tab. **No siege yet** — heat is a
  number with a warning label, exactly like sodgame shipped it; unlike
  sodgame, we say so in the patch notes and the siege is dated (below).

**Wave 7 tie-in — Garage slice:** Garage Bay T1–T2 ships *with* vehicles
(bays, storage state, repair) — building garages before vehicles exist
would repeat houses v1's reserved-pad mistake in reverse.

**Wave 8 — Labor & the full economy:** recruiting lands → jobs, staffing
gates, T2 facilities across the board, **town claimable**, outposts
(relay/forest/dune), Garden/Med/Radio/Salvage production live, comfort.

**Phase 3 — Siege & T3:** heat thresholds stage real siege nights (husk
variant), raider sieges with factions, T3 facilities + blueprints, vehicle
manufacture, military-base compound.

**Cut list, in order, if scope bites:**
1. Vehicle manufacture → repair/storage only (manufacture is Phase 3 anyway).
2. Free ghost placement → anchor points forever (v1 ships anchors; free
   placement is a polish item, not a pillar).
3. Garden/Hydro line → water + salvage + fish traps carry supply gen alone.
4. T3 facilities → T2 is a complete game; T3 is the Phase 3 chase.
5. Relocation refunds → moving home abandons facilities at 0% (SoD2's move
   rules are generous; ours can be meaner if the code time isn't there).

**Explicitly not building, ever (judge's rulings):** structural-integrity
physics, freeform voxel building, material upkeep/decay, offline raids,
mines (on this island), manufacturable heavy trucks.

---

## 5. Open Decisions for Ian (5, with recommendations)

1. **One home base + outposts, or several full bases?**
   *Recommend: one home + outposts (SoD2).* It makes relocation — and
   therefore the D.C. road — a mechanic instead of an abandonment. Multiple
   full bases dilute every other system (staffing, heat, sieges all assume
   a center of gravity).
2. **Should sieges be able to fire while you're away from base?**
   *Recommend: no — warning waits, siege happens the first night you're
   home.* Rust-style offline punishment is churn in a single-player game;
   the dread of "it's waiting for me" is better drama than a damage report.
3. **Survivor death in sieges: real or injury-only?**
   *Recommend: real death possible, but only for survivors caught outside
   shelter during a lost siege at heat ≥90 — telegraphed three times
   (scouts, warning, tier) before it can happen.* Consequence honesty is
   the brand; un-telegraphed permadeath is just theft.
4. **Does the player get a second chance at shore vs. jonah as "home," or
   is the first claim a tutorial railroad?**
   *Recommend: shore is the tutorial claim (free, guided), jonah/town are
   free choices after.* One railroaded hour buys the tutorial the whole
   system needs; everything after is the player's map.
5. **Blueprint scarcity: are T3 blueprints loot-only, or buyable with
   valuables from the Collective?**
   *Recommend: loot-first, buyable at extortionate prices (3 valuables)
   after you've found one copy of any blueprint.* Keeps POIs as the
   progression engine (the events brief's stance) while giving the
   valuables economy a real sink — and unlucky players an exit.

---

*Judge's closing note: every reference game was scored down for the thing it
does that NOMAD can't afford — geometry freedom without economy (Rust, DayZ),
physics without waves to ship in (7DTD, Valheim), or scale without a solo
player at the center (Dune, Once Human). State of Decay 2 wins the matrix
because it is the only one that treats a base as a set of decisions about
people. NOMAD already has sodgame's math for the economy and heat. Build the
decisions; the walls are just where they stand.*
