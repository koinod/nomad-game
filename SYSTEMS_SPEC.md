# NOMAD — Full Systems Spec

**Date:** 2026-10-20. **Inputs:** EASYMODE_DEV_PLAN.md (Ian's order of
operations), GAP_AUDIT.md (§A source gaps, §B build gaps, §C contradictions,
§D build order), POIS_FACTIONS_VEHICLES.md (island map, vehicle roster,
faction identities), BASE_DESIGN.md ("Slots & Ghosts"), and the shipped code
(`src/data/items.ts`, `src/store/types.ts`) as ground truth for the current
item/recipe/station model.

**How to read this:** TypeScript-flavored shapes are the contract — field
names and types an implementer codes against. Where this spec extends
`ItemDef`/`InvItem`/`Equipped`, the extension is marked **NEW FIELD** and
listed again in §1.3. Contradictions with the existing docs are flagged
inline as ⚠ and collected in §0.2. Nothing here touches `src/` by itself;
this is the build target.

---

## 0. Decisions this spec makes (and what it contradicts)

### 0.1 Resolved open questions

| Question (source) | This spec's ruling |
|---|---|
| Skills model: sodgame XP-by-use vs Wave-9 archetypes (GAP §A, EASYMODE §9) | **Both, layered.** Skill levels (XP-by-use, 0–10) are the substrate and gate recipes (`skillReq`). Archetype perk trees sit on top; perk points come from skill levels gained. This is GAP §D's recommendation, adopted. |
| Faction set (GAP §C #1) | **Merged canon** per EASYMODE §1 and Ian's 2026-10-20 call: Military Remnants, Survivors Union, Rust Skulls (sodgame three) + Lighthouse Collective, Tollkeepers, the Drowned (NOMAD originals). Enclave = hardmode-era faction (§8). The six-faction list in `src/data/factions.ts` (Lighthouse Collective, The Pier, The Refuge, Tollkeepers, The Drowned, Hollow Market) is **superseded** — The Pier / The Refuge / Hollow Market fold into Union holdings and Tollkeeper sub-crews, they are not independent factions. |
| Rep tier bands (GAP §C #2) | **sodgame bands win:** Allied ≥75 / Friendly ≥25 / Neutral −9…24 / Wary −49…−10 / Hostile −74…−50 / War ≤−75. Rationale: POIS §3.1's Remnant quartermaster gate (≥75 from −50) is written against them. `repTier()` in factions.ts must be re-banded. |
| Gunshot noise (GAP §C #9) | **80m unsuppressed wins** (EASYMODE §1). The 60m pistol value in `src/` Combat is a bug to fix, and per-weapon `noiseRadius` (§2.1) replaces the single number. |
| Tanker capacity + garage siphon cap (GAP §C #8, POIS §5) | **2,000L tanker; Garage T2 siphon trickle capped at 2,000L total stored fuel.** POIS's proposal is adopted here; BASE_DESIGN's uncapped trickle is superseded. |
| Vehicle roster (GAP §C #7) | POIS §4's 13-vehicle roster supersedes the vehicles brief's 6 (no "Armored SUV"; the endgame armor slot is the 6x6 APC). |
| Alarm behavior (GAP §A — never designed) | **Decided in §4.4:** active alarm = 60m noise burst + husk attraction + faction rep hit at faction POIs. Ships with the POIs that carry the flag. |
| Turret (GAP §A — no NOMAD home) | **Homed in §4.3** as a blueprint-gated T3 defense build (sodgame's only blueprint craft; it was homeless, not unwanted). |
| Food freshness / spoilage (GAP §A) | **Deliberately skipped, on record.** NOMAD's food pressure is quantity + heat, not timers. Revisit only if Stage 2 needs it. |
| Grid inventory (GAP §A) | **Rejected, on record.** Slot-count inventory stays. Vehicle trunks are slot-count containers (§7.8), not grids. |

### 0.2 Contradictions flagged (docs vs docs, docs vs code)

1. ⚠ **Medkit crafting station.** BASE_DESIGN §3.3 puts medkit crafting
   under Workbench T1 effects. Shipped code puts `r_medkit` at the
   **Chemistry Station** (`items.ts` STATION_RECIPES). **Code wins** — §4.2
   specs base chemistry access via the Med line so both statements become
   true at different tiers.
2. ⚠ **Station naming/model.** BASE_DESIGN's facility line is
   Workbench → Workshop → Machine Shop (one line, three tiers). Shipped
   code has three separate world stations: Weapons Bench (`workbench`),
   Chemistry Station (`chemistry`), Machine Shop (`industrial`), and **no
   world instance of `industrial` exists** — its 3 recipes are unreachable
   until bases ship (GAP §C #4). §4.1 adds a world Machine Shop at the
   marina/boatyard and maps facility tiers onto station IDs so the two
   models stop diverging.
3. ⚠ **"AppBoy."** BASE_DESIGN and the vehicles brief say the phone gains
   an "AppBoy Base tab." The shipped device is the **Sat Phone** (GAP §C
   #6). This spec says Sat Phone everywhere. `PhoneTab` in types.ts is
   `'loadout' | 'world' | 'command'` — §7 adds `'base'` (**type change**).
4. ⚠ **Stale item lists.** BASE_DESIGN §3.8 and POIS §6 list `valuables`,
   `wood`, `gun_parts`, `produce`, `tire`, `engine_part`, `car_battery` as
   unimplemented. As of the Phase A wave, **all of them are in `items.ts`**
   (plus `lockpick`, `tool_kit`, grenades, and two armor items). Those doc
   sections are stale; do not re-land the items.
5. ⚠ **Frag fuse.** EASYMODE §2 says grenades have a "3s fuse." Shipped
   `items.ts` has frag `fuse: 1.6`. **Code wins** (1.6s frag / 0.8s
   flashbang / instant molotov); §2.4 specs per-type fuses.
6. ⚠ **Armor has no category and no slots.** `items.ts` ships
   `armored_vest` (armor 0.25) and `riot_helmet` (armor 0.15) as
   `category: 'material'`, mitigated "while carried," and `Equipped` has
   only melee/ranged/pack. EASYMODE §2 wants armor pieces (head/chest/
   legs) as a real category. §1.2 + §2.5 spec the fix: new `'armor'`
   category, three armor slots on `Equipped`. The while-carried behavior
   is the interim hack, not the design.
7. ⚠ **Town: claimable vs Union home.** BASE_DESIGN makes town the
   claimable "prize base" (40 scrap + 3 survivors); POIS §3 makes it the
   Union's main base. **Both, in sequence** (§7.2): the town claim is gated
   on Union rep ≥25 or on displacing them (War) — the claim screen shows
   which path you're on. Neither doc said this; this spec does.
8. ⚠ **House variants.** HOUSES_DESIGN vs Houses.ts VARIANTS disagree
   (GAP §C #10). Out of this spec's scope, but §8's spawn table assumes the
   *built* variant set (ranch/bungalow/farmhouse/cabin/shack/leanto/ruin).
9. ⚠ **BASE_DESIGN §3.3 Workbench T1 "medkit" + §3.4 Garage T2 siphon** —
   see #1 and §0.1 (siphon capped). Also BASE_DESIGN's facility
   "Workbench" T3 fabricates `gun_parts`/`engine_part` — consistent with
   §4.2's station mapping, kept.
10. ⚠ **Survivor starting roster.** GAP §A: sodgame's Elena/Mateo/Lina
    roster never got a NOMAD home. §5.6 homes them as designed recruits.
    Jonah and Kowalski stay story NPCs, **not** recruits (POIS §1 note +
    GAP §B) — §5.6 flags this explicitly because Wave 8 will be tempted.

---

## 1. Shared data-model changes

Everything in §§2–7 codes against these extensions. Current shapes (from
types.ts): `ItemDef { id, name, category, weight, slots, stack, desc,
damage?, range?, heal?, ammoId?, pellets?, spread?, carryBonus?,
packSlots?, armor?, thrown? }`, `InvItem { uid, itemId, qty }`,
`Equipped { melee, ranged, pack }` (uids).

### 1.1 New item categories (**type change** to `ItemCategory`)

```ts
type ItemCategory = /* existing */ | 'armor' | 'mod' | 'blueprint';
```

- `'armor'` — worn mitigation (§2.5). Replaces the material-category hack.
- `'mod'` — weapon attachments (§3). Stack 1, never equippable directly;
  consumed onto a weapon instance.
- `'blueprint'` — T3 facility + turret unlock items (BASE_DESIGN §3.5).
  Stack 1, weight 0.1, category `'key'`-like behavior but its own category
  so loot tables can target it.

### 1.2 `ItemDef` extensions (**NEW FIELD**s, all optional)

```ts
interface ItemDef {
  // ...existing fields unchanged...
  tier?: 1 | 2 | 3;              // weapons + mods: loot/power tier
  // ranged weapons
  magSize?: number;              // rounds per reload (undefined = single-load pool, legacy)
  reloadSec?: number;
  fireMode?: 'semi' | 'auto' | 'bolt' | 'pump';
  noiseRadius?: number;          // meters, unsuppressed — feeds the noise-class table
  modSlots?: ModSlot[];          // §3.1
  // melee weapons
  swingSec?: number;             // full swing duration
  staminaCost?: number;          // per swing
  blockPct?: number;             // damage blocked while blocking (0..1)
  reach?: number;                // meters (spear is the reason this exists)
  // armor
  armorSlot?: 'head' | 'torso' | 'legs';
  // economy
  barterValue?: number;          // trader price in "value" units (§3.5); valuables economy anchor
  disassembly?: { itemId: string; qty: number }[];  // yield at a bench (§3.5)
  skillReq?: { skill: SkillId; level: number };    // crafting gate (§6.1) — on recipes, see §4.2
}
```

### 1.3 `InvItem` instance data (**NEW FIELD**s)

Weapons and armor are `stack: 1`, so per-instance state is safe:

```ts
interface InvItem {
  uid: string;
  itemId: string;
  qty: number;
  condition?: number;            // 0..100, weapons/armor/vehicles-parts excluded; undefined = 100
  mods?: string[];               // attached mod itemIds, ranged weapons only (§3)
  loadedAmmo?: number;           // rounds currently in the magazine
}
```

`Equipped` gains armor (**type change**):

```ts
interface Equipped {
  melee: string | null;
  ranged: string | null;
  pack: string | null;
  armorHead: string | null;      // NEW
  armorTorso: string | null;     // NEW
  armorLegs: string | null;      // NEW
}
```

**Condition model** (closes GAP §A durability, half-designed until now):
weapons lose 1 condition per 25 shots (ranged) / per 20 landed swings
(melee); armor loses 1 per hit absorbed. At condition <30: ranged damage
×0.85 and jam chance 2%/shot (auto-eject: 1.2s clear, noise class "small");
at 0: weapon unusable until repaired. Repair = bench action, `gun_parts`
for ranged (1 per 40 condition), `scrap` for melee (1 per 40), restores to
100 at a station, to 60 in the field with `tool_kit` (mirrors the vehicle
field-cap rule in POIS §4). Loot rolls condition 35–85 for found weapons
(the "found gear is a beater" rule, same spirit as vehicles' 20–60%).

### 1.4 Registry of new item IDs this spec introduces

Weapons: `crowbar`, `fire_axe`, `spear`, `riot_baton`, `flare_gun`,
`revolver`, `crossbow`, `bolts`, `smg`, `carbine`, `marksman_rifle`,
`ammo_556`, `smoke_grenade`.
Mods: `mod_reflex`, `mod_scope`, `mod_suppressor`, `mod_ext_mag`,
`mod_choke`, `mod_grip`, `mod_flashlight`.
Armor: `plate_carrier`, `shin_guards` (+ re-categorize `armored_vest`,
`riot_helmet`).
Tools/stealth: `rock_lure`, `decoy_boombox`.
Economy: `circuit_board` (turret + T3 electronics sink; GAP §B lists it
missing), `gunpowder`, `brass`, `lead` (ammo components, §4.2 — GAP §D
calls for them; they replace scrap/wire as reload inputs at T2+ recipes).
Blueprints: `bp_turret`, `bp_facility_<facilityId>` pattern (§4.3).

---

## 2. Weapon roster (every weapon spawns on the island)

Tier = loot/power tier (1 improvised → 2 civilian → 3 military).
Guaranteed spawn = a placed pickup (`InteractSystem` pickup def) that always
exists. Loot = also rolls in the named loot tables at the given chance band.

### 2.1 Melee

Fields per weapon: `damage`, `swingSec`, `staminaCost`, `blockPct`,
`reach` (meters). Block = hold RMB with the melee equipped (shipped).

| id | name | tier | dmg | swing | stam | block | reach | Guaranteed spawn | Loot |
|---|---|---|---|---|---|---|---|---|---|
| `pipe` | Lead pipe | 1 | 14 | 0.42 | 18 | 0.75 | 3.1 | town residential (exists) | containers/town 0.3 |
| `crowbar` | Crowbar | 1 | 13 | 0.36 | 13 | 0.75 | 2.9 | marina/boatyard (NEW POI) | garage 0.3 |
| `baseball_bat` | Baseball bat | 1 | 16 | 0.38 | 15 | 0.70 | 3.0 | town (exists) | suburban furniture 0.15 |
| `combat_knife` | Combat knife | 1 | 15 | 0.22 | 8 | 0.50 | 2.5 | wreck convoy crate | military T1 0.2 |
| `hatchet` | Hatchet | 1 | 18 | 0.34 | 14 | 0.60 | 2.8 | forest_cache (exists) + jonah_camp | camp furniture 0.2 |
| `fire_axe` | Fire axe | 2 | 24 | 0.48 | 20 | 0.75 | 3.0 | town gas station (NEW POI) | — |
| `machete` | Machete | 2 | 22 | 0.30 | 13 | 0.65 | 2.9 | forest_cache (exists) | farmhouse 0.25 |
| `spear` | Spear | 2 | 18 | 0.50 | 16 | 0.60 | 4.0 | forest_cache | craft at Weapons Bench (wood×2 + scrap×1) |
| `sledgehammer` | Sledgehammer | 2 | 30 | 0.55 | 22 | 0.80 | 2.9 | marina/boatyard + warehouse (NEW) | — |
| `riot_baton` | Riot baton | 3 | 16 | 0.30 | 12 | 0.85 | 2.6 | military base checkpoint | military T3 0.2 (stun on hit: stagger +1s) |

`fire_axe` doubles as a harvest tool: wood-harvest yields ×2 (§4.2).
`crowbar` is the forced-entry tool: smash a locked safe/locker without a
lockpick — instant open, **45m noise** (alarm-class, §4.4), destroys the
lockpick economy tradeoff honestly.

### 2.2 Ranged

Fields: `damage`, `range` (m), `magSize`, `reloadSec`, `fireMode`,
`ammoId`, `noiseRadius` (unsuppressed), `modSlots`.

| id | name | tier | dmg | range | mag | reload | mode | ammo | noise | slots | Guaranteed spawn |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `flare_gun` | Flare gun | 1 | 6 | 18 | 1 | 2.0 | single | flare | 15 | — | marina + lighthouse keeper's (NEW) |
| `pistol` | 9mm pistol | 2 | 34 | 45 | 12 | 1.8 | semi | ammo_9mm | 80 | optic, muzzle, mag | town (exists) |
| `revolver` | 9mm revolver | 2 | 40 | 40 | 6 | 3.2 | single | ammo_9mm | 80 | — | town rich/keeper's house safe |
| `shotgun` | Pump shotgun | 2 | 11×6 | 24 | 6 | 3.5 | pump | shells | 90 | optic, mag, muzzle | lighthouse_base (exists) + farmhouse locked locker |
| `crossbow` | Crossbow | 2 | 45 | 60 | 1 | 2.8 | single | bolts | 8 | optic | forest_cache + Union school dormitory |
| `hunting_rifle` | Hunting rifle | 2 | 58 | 95 | 4 | 3.0 | bolt | ammo_rifle | 85 | optic, muzzle, mag | jonah_camp (exists) |
| `smg` | SMG | 3 | 18 | 32 | 30 | 2.4 | auto | ammo_9mm | 80 | optic, muzzle, mag | raider fort (Skulls armory) |
| `carbine` | Carbine | 3 | 42 | 70 | 30 | 2.6 | auto | ammo_556 | 85 | optic, muzzle, mag, under | military base armory (locked) |
| `marksman_rifle` | DMR | 3 | 75 | 110 | 5 | 3.4 | bolt | ammo_rifle | 85 | optic, muzzle, mag | relay Remnant post (rep-gated locker) |

`bolts` and `ammo_556` are new ammo items (§1.4). The `revolver`'s lack of
mod slots is the honest-tradeoff design: simple, reliable, no growth path.
`flare_gun`'s "bullet" is a lit flare — light + 15m noise at the impact
point (stealth-tool crossover, §5 stealth tools).

### 2.3 Reload + jam behavior

`loadedAmmo` (§1.3) persists per instance. Auto-reload prompt at 0; manual
reload = R (desktop) / RELOAD button (mobile). Jam: condition <30 →
2%/shot, 1.2s clear animation, small noise. Suppressor jam chance halves
(the gas system is cleaner — the lore excuse).

### 2.4 Throwables + stealth tools

| id | name | tier | aoe | effect | fuse | Spawn |
|---|---|---|---|---|---|---|
| `frag` | Frag grenade | 3 | 5.5m | 70 dmg falloff | 1.6s | military armory + convoy wreck crate |
| `molotov` | Molotov | 2 | 4m | 25 dmg + fire zone 6s (14 dmg/0.5s) | instant | raider fort + craft at Chemistry (chemicals×1 + fuel_can… see §4.2) |
| `flashbang` | Flashbang | 3 | 12m | blind husks 6s (stunT) | 0.8s | military checkpoint locker |
| `smoke_grenade` | Smoke grenade | 2 | 8m | 12s smoke cloud — husks lose sight inside | 1.0s | relay + craft at Chemistry |
| `rock_lure` | Throwing rocks | 1 | — | 20m noise at landing, reusable pickup | throw | anywhere (stack of 5, weightless-ish 0.02) |
| `decoy_boombox` | Boombox decoy | 2 | — | 60m noise loop, 20s, placeable | placed | strip mall electronics store |

Equipped as melee (shipped pattern: `thrown` on `ItemDef`), LMB throws.
Frag/molotov/flashbang are consumables; `rock_lure` is retrievable where
it lands (interactable pickup); the boombox is a placed interactable with
a battery (2 uses).

### 2.5 Armor (completes EASYMODE §2's "first real mitigation category")

```ts
interface ArmorDef extends ItemDef {
  category: 'armor';
  armorSlot: 'head' | 'torso' | 'legs';
  armor: number;   // mitigation fraction for this slot
}
```

One item per slot (see §1.3 `Equipped` change). Total mitigation =
Σ slots, capped at 0.55. Condition wears 1/hit absorbed; at 0 the piece
is destroyed (not repairable past 50 condition — plates crack honestly).

| id | name | tier | slot | mit | Spawn |
|---|---|---|---|---|---|
| `armored_vest` | Armored vest | 2 | torso | 0.25 | re-categorized from `material` → `armor` |
| `riot_helmet` | Riot helmet | 2 | head | 0.15 | re-categorized from `material` → `armor` |
| `plate_carrier` | Plate carrier | 3 | torso | 0.40 | military base armory (locked) |
| `shin_guards` | Shin guards | 2 | legs | 0.10 | craft at Weapons Bench (scrap×2 + cloth×2) |

**Replaces** the shipped "mitigation while carried" hack — carrying armor
no longer protects you; *wearing* it does. Until the armor UI ships, the
while-carried behavior stays as the interim (flagged, not deleted).

---

## 3. Attachments & customization

### 3.1 Mod slots per weapon class

Slot types: `optic` (sights), `muzzle` (suppressor/choke),
`mag` (magazine), `under` (underbarrel).

```ts
type ModSlot = 'optic' | 'muzzle' | 'mag' | 'under';

interface ModDef extends ItemDef {
  category: 'mod';
  tier: 1 | 2 | 3;
  slot: ModSlot;
  compatible: string[];        // weapon ids (explicit allowlist — no surprises)
  effect: ModEffect;
  attachCost: { itemId: string; qty: number }[]; // consumed on attach
}

interface ModEffect {
  damageMult?: number;         // choke: edge-pellet damage up
  spreadMult?: number;         // choke: 0.6 (shotgun), suppressor: 1.05
  noiseMult?: number;          // suppressor: 0.31 (80m → 25m)
  magBonus?: number;           // extended mag: +6/+12 rounds
  adsTimeMult?: number;        // reflex: 0.7 (hip→shoulder→sights faster)
  recoilMult?: number;         // grip: 0.75 (matters when recoil exists)
  rangeMult?: number;          // scope: 1.15 effective
  fovDelta?: number;           // reflex −4 / scope −12 (sights zoom)
  lightCone?: boolean;         // flashlight: visible cone + the cost of being seen
}
```

Compatibility matrix (explicit — a mod only fits listed weapons):

| Weapon | optic | muzzle | mag | under |
|---|---|---|---|---|
| pistol | reflex | suppressor | ext_mag | — |
| shotgun | reflex | choke | ext_mag | — |
| hunting_rifle | reflex / scope | suppressor | ext_mag | — |
| crossbow | reflex | — | — | — |
| smg | reflex | suppressor | ext_mag | grip |
| carbine | reflex / scope | suppressor / choke* | ext_mag | grip / flashlight |
| marksman_rifle | reflex / scope | suppressor | ext_mag | — |
| revolver, flare_gun | — | — | — | — |

*Choke on carbine = tighter auto spread, the birdshot-for-people joke.

### 3.2 The mods (items)

| id | name | tier | slot | Effect | Spawn / recipe |
|---|---|---|---|---|---|
| `mod_reflex` | Reflex sight | 2 | optic | adsTimeMult 0.7, fovDelta −4 | craft Weapons Bench: gun_parts×2 + wire×1; strip mall 0.1 |
| `mod_scope` | 4× scope | 3 | optic | rangeMult 1.15, fovDelta −12, adsTimeMult 1.2 (heavier) | military armory loot; relay post 0.15 |
| `mod_suppressor` | Suppressor | 2 | muzzle | noiseMult 0.31, spreadMult 1.05 | craft Weapons Bench: gun_parts×3 + scrap×2; safe loot 0.1 |
| `mod_ext_mag` | Extended mag | 2 | mag | magBonus: pistol +6, shotgun +2, rifle +2, smg +12, carbine +12 | craft Weapons Bench: gun_parts×2 + scrap×2 |
| `mod_choke` | Choke | 2 | muzzle | spreadMult 0.6, damageMult 1.1 (shotgun); spreadMult 0.8 (carbine) | craft Weapons Bench: gun_parts×2 |
| `mod_grip` | Foregrip | 3 | under | recoilMult 0.75, adsTimeMult 0.9 | military armory loot |
| `mod_flashlight` | Tac light | 2 | under | lightCone true — 12m cone; **visibility system hook**: crouched+light-off is hidden; light-on in shadow = visible  (§6.3) | craft Weapons Bench: gun_parts×1 + wire×1 + battery… uses `car_battery`? No — too big. New recipe drains phone battery? Cut: simple craft, no power cost v1 |

One mod per slot. Mods attach at a **Weapons Bench** (world station or
base Workbench facility, §4.1) — not in the field, not at the phone. The
mod item is consumed; the weapon's `InvItem.mods` gains the mod id.
Detach = free, returns the mod item (no destruction — players experiment;
the cost was the attach). The hand mesh visually changes: suppressor adds
a tube, reflex adds a hump, extended mag lengthens the mag (weaponMeshes
builds from `mods` — implementers: `buildHandMesh(itemId, mods?)`).

### 3.3 gun_parts economy

**Sources:** military husk drops (0–2, 0.35), armory/safe loot (1–3,
0.6), relay post (0.15), disassembly (§3.4), Machine Shop T3 fabrication
(scrap×3 → gun_parts×1, 4h, Mechanic-staffed — BASE_DESIGN §3.3 kept).

**Sinks (all at Weapons Bench unless noted):**

| Sink | Cost |
|---|---|
| Attach mod (§3.2) | mod item + attachCost |
| Repair 40 condition (ranged) | gun_parts×1 |
| Field repair to 60 (tool_kit) | free (cap), consumes tool_kit durability* |
| Craft carbine | gun_parts×4 + scrap×6 + wire×3 (Weapons Bench T2 facility, skillReq mechanics 3) |
| Craft smg | gun_parts×3 + scrap×5 + wire×2 (Weapons Bench T2, mechanics 2) |
| Craft revolver | gun_parts×2 + scrap×3 (Weapons Bench, mechanics 1) |
| Craft suppressor | gun_parts×3 + scrap×2 (above) |
| Craft turret | gun_parts×6 + circuit_board×2 + engine_part×1 + bp_turret (Garage forge, §4.3) |

*`tool_kit` durability: new — 10 uses, repair at Workbench (scrap×1 per
5 uses). Cheap depth, keeps the kit from being infinite.

### 3.4 Disassembly (closes GAP §A — "absent everywhere")

Any weapon/armor/tool → materials at a Weapons Bench, instant, no timer:

```ts
// on ItemDef.disassembly, e.g.:
pistol:  [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'scrap', qty: 1 }]
machete: [{ itemId: 'scrap', qty: 2 }]
armored_vest: [{ itemId: 'cloth', qty: 3 }, { itemId: 'gun_parts', qty: 1 }]
```

Rule: disassembly returns ~50% of the craft cost in its primary material
type. Grenades disassemble into chemicals (molotov) / gunpowder (frag) /
scrap (flashbang). This is the "every item has a reason to exist" engine:
a found broken carbine (condition 12) is worth more as gun_parts than as
a gun.

---

## 4. Stations, workbenches, crafting depth

### 4.1 The complete station list

Station instances are world objects with a proximity radius (shipped:
4.5m, `nearStation`). Facilities are base builds that *host* station IDs.

| Station (id) | Where (world) | Facility host (base) | Unlocks |
|---|---|---|---|
| **Field** (no id) | Sat Phone, anywhere | — | FIELD_RECIPES (bandage, torch, fire starter, flare, cooked meat) + r_produce_meal (produce×2 + raw_meat×1 → cooked_meat×2, heal 45) |
| `workbench` **Weapons Bench** | jonah_camp + town (shipped) | Workbench facility T1 (shipped recipe set); Workshop T2 adds weapon crafting + armor crafting + mod attach; Machine Shop facility T3 adds fabrication + turret craft | Station recipes (§1): reload 9mm/shells, bat, combat knife, revolver, suppressor, ext mag, reflex, choke, grip, flashlight, spear, shin guards, repair recipes |
| `chemistry` **Chemistry Station** | relay_station (shipped) | Infirmary T2+ hosts chemistry recipes (§0.2 #1 — this is how the medkit-at-workbench contradiction resolves: base med production is chemistry, not bench) | r_medkit, r_fuel_can, r_molotov (chemicals×1 + cloth×1), r_smoke_grenade (chemicals×2 + scrap×1), r_smoke… all Chemistry-line |
| `industrial` **Machine Shop** | marina/boatyard warehouse (NEW — closes GAP §C #4: the shipped `industrial` recipes are currently unreachable) | Machine Shop facility T3 (fabricate gun_parts/engine_part, manufacture) | r_tire, r_engine_part, r_car_battery (shipped) + r_circuit_board (wire×3 + chemicals×1) + fabrication list (§3.3) + turret (with Garage forge) |
| `garage` **Garage Bay** | — (base only) | Garage Bay facility (§3.4 BASE_DESIGN + POIS §4.1 upgrades) | Vehicle repair, upgrade ladder A1/A2/ENG/CRG/RAM/lift installs, vehicle manufacture (T3), turret craft (with Machine Shop T3) |

Field craft stays instant. **Station craft gains timers + skill gates**
(v2 — the current instant model is the v1 cut): `timeSec` on recipes
(30s field … 4h fabrication), interruptible by combat, `skillReq`
(§6.1). Timers run on game-time; sleeping through a 6h craft is allowed
and intended (start a build, sleep, wake to progress — the SoD2 feel).

### 4.2 Recipe additions (the depth pass — target ~30 total)

Current: 5 field + 9 station = 14. Additions by station:

- **Field:** r_produce_meal (above), r_rock_lure (scrap×0 → 3 rocks? rocks are free — r_rock_lure gives 5 rock_lure, instant), r_bandage_tourniquet? (skip).
- **Weapons Bench:** r_revolver, r_suppressor, r_ext_mag, r_reflex, r_choke, r_grip, r_flashlight, r_spear, r_shin_guards, r_repair_ranged (gun_parts×1 → +40 condition), r_repair_melee (scrap×1 → +40), r_maintain (tool_kit + scrap×1 → condition 100, no parts — the "oil and clean" path).
- **Chemistry:** r_molotov, r_smoke_grenade, r_fuel_can (shipped), r_medkit (shipped), r_sterilize? (skip).
- **Machine Shop:** r_circuit_board, fabrication (gun_parts, engine_part at T3 facility), r_turret (gun_parts×6 + circuit_board×2 + engine_part×1 + bp_turret).
- **Skill gates** (examples; full table in §6.1): craft carbine needs
  `mechanics 3`; craft suppressor `mechanics 2`; medkit `medicine 1`;
  turret `mechanics 5` + blueprint.

**Ammo components** (GAP §D calls for them): `gunpowder`, `brass`,
`lead`. Reload recipes gain T2 variants:
`r_reload_9mm_t2`: gunpowder×1 + brass×1 + lead×1 → ammo_9mm×12
(better yield than the T1 scrap/wire recipe — the crafting-depth ladder).
brass drops from fired combat? No — brass loots (military, armory);
gunpowder crafts at Chemistry (chemicals×2 → gunpowder×2); lead loots
(garage, warehouse).

### 4.3 Turret (sodgame's homeless blueprint craft — homed)

```ts
interface TurretDef {
  facilityReq: 'garage_t3' | 'machine_shop_t3';  // either host
  blueprint: 'bp_turret';                         // T4/T5 loot (military armory, convoy cargo)
  cost: [{ itemId: 'gun_parts', qty: 6 }, { itemId: 'circuit_board', qty: 2 }, { itemId: 'engine_part', qty: 1 }];
  buildHours: 10;                                 // Mechanic-staffed
  stats: { damage: 20; range: 30; rpm: 120; ammo: 'ammo_9mm'; power: 0.8; mag: 100 };
}
```

Deploys as a prefab ghost (BASE_DESIGN prefab model) inside the claim
radius; consumes stockpile 9mm during sieges; power 0.8 kW (Once Human
steal — the budget matters). **This is the only blueprint-gated craft in
the game**, exactly like sodgame. Blueprints drop as items, category
`'blueprint'`, stack 1.

### 4.4 Alarm behavior (GAP §A — never designed, now decided)

POI flags `alarm: 'silent' | 'active'` (POIS §1 tabulates them: strip mall,
military checkpoint, faction outposts = active). **Active alarm** =
tripwire on the POI's is_major container or door zone:

```ts
interface AlarmEvent {
  poiId: string;
  trigger: 'container_trip' | 'forced_entry';
  effect: {
    noise: { radius: 60 };        // husks within 60m investigate
    spawn: 'scout_pair';          // 2 husks from the POI's zone spawn at the edge
    factionRep?: { faction: string; delta: -5 }; // at faction POIs: they notice
    toast: 'You hear an alarm winding up.';
  };
}
```

Disarm = `tool_kit` + mechanics 2 check at the alarm box prop (new
interactable on active-alarm POIs), 30s timer. Crowbar forced entry on a
tripped POI always trips the alarm (45m noise + alarm — the loud path).
This ships *with* the Wave 6 POIs (GAP §D), not after.

### 4.5 Biome → loot weighting (GAP §A — absent as a system)

NOMAD's `biomeAt` gains a loot role:

```ts
type BiomeId = 'beach' | 'dune' | 'forest' | 'town' | 'marsh' | 'water';
const BIOME_LOOT_WEIGHT: Record<BiomeId, { material: number; food: number; military: number; medical: number }> = {
  beach:  { material: 1.2, food: 0.8, military: 0.3, medical: 0.5 },
  dune:   { material: 0.8, food: 0.6, military: 0.5, medical: 0.5 },
  forest: { material: 1.0, food: 1.4, military: 0.2, medical: 0.8 },
  town:   { material: 1.1, food: 1.0, military: 0.6, medical: 1.2 },
  marsh:  { material: 0.7, food: 1.1, military: 0.3, medical: 0.7 },
  water:  { material: 0.5, food: 0.6, military: 0.2, medical: 0.3 },
};
```

Containers tagged with their biome multiply per-entry `chance` by the
weight for that entry's loot class (entry gains `lootClass?: 'material' |
'food' | 'military' | 'medical'` — default 'material'). Husk zone loot
gets the same treatment (relay husks: military-weighted already by hand —
the table formalizes it).

---

## 5. Survivor generation

### 5.1 Generation algorithm

```ts
interface SurvivorDef {
  id: string;                 // 'surv_<seed>'
  name: string;               // from §5.2 pools
  age: number;                // 19–58, skews 25–40
  background: string;         // flavor + skill seed, e.g. 'ex-firefighter'
  skills: Record<SkillId, number>; // 0–10, §6.1; sum 12–20, 1–2 spikes ≥6
  traits: string[];           // 2–3 from §5.3
  morale: number;             // 0–100, starts 50
  hp: number;                 // 100
  status: 'healthy' | 'injured' | 'sick';
  job: SurvivorJob | null;    // Builder, Mechanic, Medic, Farmer, Scavenger, Guard, Operator, Idle
  homeBaseId: string | null;
}
```

Generation: roll background (weights a skill spike), 2–3 traits (some
mutually exclusive: optimist/pessimist, cowardly/brave, night_owl/
early_bird), skill points distributed 12–20 with the background spike.
Recruits generate at the encounter site; the school-dormitory pipeline
(§5.6) generates them in batches of 2–4 with a Union-friendly bias
(medicine/scavenging spikes).

### 5.2 Name pools (Outer Banks flavor)

```ts
const FIRST_M = ['Jonah','Elias','Marcus','Tommy','Ray','Deacon','Wade','Silas','Cole','Beau','Grady','Hank','Miles','Jasper','Theo','Nate','Otis','Rufus','Cal','Dane','Ellis','Ford','Gus','Harlan','Ike','Judd','Knox','Levi','Mack','Nolan','Pierce','Quinn','Reed','Seth','Tate','Virgil','Wesley','Zeke','Abel','Boone'];
const FIRST_F = ['Elena','Lina','Mara','June','Wren','Sadie','Nora','Iris','Hazel','Ruby','Pearl','Opal','Della','Cora','Maeve','Tilly','Rosa','Ada','Bea','Clara','Dora','Effie','Flora','Greta','Hattie','Ida','Josie','Kit','Lena','Mabel','Nell','Olive','Penny','Ruth','Sylvie','Tess','Una','Vera','Winnie','Yara'];
const LAST = ['Meeks','Banks','Drift','Salter','Wanchese','Manteo','Hatteras','Kinnakeet','Rodanthe','Avon','Buxton','Frisco','Ocracoke','Nags','Kitty','Duck','Corolla','Colington','Stumpy','Alligator','Wanchese','Scarborough','Etheridge','Midgett','O\'Neal','Tillett','Daniels','Gray','Forbes','Perry','Hooper','Mann','Hayman','Creef','Basnight','Twiford','Meekins','Austin','Parker','Dowdy'];
const CALLSIGNS = ['Static','Relay','Tide','Anchor','Gull','Drift','Marsh','Dune','Beacon','Wreck','Fog','Keel'];
```

Recruits get first + last; veterans (quest/rare) get a callsign suffix
(`"Mara Drift 'Keel'"`).

### 5.3 Traits (sodgame's 10 ported + NOMAD's)

```ts
interface TraitDef {
  id: string;
  name: string;
  desc: string;
  effects: {
    productionMult?: Partial<Record<SurvivorJob, number>>; // per-job
    moraleDrift?: number;        // per day, additive
    noiseMult?: number;          // on stealth actions
    combatDmgMult?: number;      // when fighting beside the player (sieges)
    foodUseMult?: number;        // upkeep
    healRateMult?: number;
  };
  exclusiveWith?: string[];
}
```

| id | name | Effects |
|---|---|---|
| `optimist` | Optimist | moraleDrift +1/day |
| `pessimist` | Pessimist | moraleDrift −1/day |
| `cowardly` | Cowardly | combatDmgMult 0.7, flees sieges early (no injury roll) |
| `brave` | Brave | combatDmgMult 1.3, +morale +2 on siege win |
| `night_owl` | Night owl | productionMult ×1.2 on night shifts, ×0.8 day |
| `early_bird` | Early bird | inverse |
| `ex_military` | Ex-military | combatDmgMult 1.4, Guard production (defense) ×1.3 |
| `strong_back` | Strong back | Scavenger yield ×1.25, foodUseMult 1.2 |
| `quick_hands` | Quick hands | Mechanic production ×1.25, repair time ×0.8 |
| `green_thumb` | Green thumb | Farmer production ×1.3 |
| `iron_stomach` | Iron stomach | foodUseMult 0.75, sick chance −50% |
| `clumsy` | Clumsy | noiseMult 1.5 — the loud one (Ghost players will bench them) |
| `quiet` | Quiet | noiseMult 0.7 |
| `loner` | Loner | moraleDrift +1 when ≤3 survivors at base, −1 when ≥6 |
| `social` | Social | inverse of loner |
| `sickly` | Sickly | sick chance ×2, healRateMult 0.7 |
| `tough` | Tough | hp 130, injured recovery ×1.5 |

Exclusives: optimist/pessimist, cowardly/brave, night_owl/early_bird,
loner/social. Trait count: 2–3 per survivor, no conflicting pairs.

### 5.4 Morale model

`morale` 0–100, starts 50. Daily tick (at 06:00 game time) + event ticks:

| Driver | Δ |
|---|---|
| Fed + watered (stockpile covered) | +2 |
| Hungry (stockpile missed a meal) | −4 |
| Comfort ≥2 (BASE_DESIGN) | +1 |
| Siege survived | +3 (win) / −6 (lost) |
| Survivor died | −10 (all at base) |
| New recruit joined | +2 |
| Idle (no job) for 3+ days | −1/day |
| Trait drift | per §5.3 |

Bands: ≥75 **Content** (production ×1.1, won't leave); 40–74 neutral;
20–39 **Unhappy** (production ×0.75, may refuse jobs — shows in UI);
<20 **Breaking** (3 days at Breaking → leaves, BASE_DESIGN's softened
rule — re-recruitable once, bitter: morale starts 30).

### 5.5 Survivor stats in combat

Survivors fight beside the player on jobs (Scavenger escort runs,
Guards always). Combat power = `40 + combat*6` damage with a pipe-tier
weapon the base must stock (Guards consume stockpile 9mm during sieges —
BASE_DESIGN §3.5 kept). Injury: 15% per siege engagement → `injured`
(7 days, Med line halves). Death: only per the telegraphed rule —
outside shelter during a lost siege at heat ≥90 (BASE_DESIGN decision 3).

### 5.6 Recruitment hooks (designed encounters, not random NPCs)

1. **Distress-call rescue** (Event Catalog #4): radio/phone ping, map
   marker, timed (2 in-game hours). Rescue → offers to join. 1–2
   survivors, random gen, grateful (morale starts 60).
2. **School dormitory pipeline** (Union, town): at Union rep ≥25, the
   dormitory generates a recruit batch every 7 days (2–4, Union-friendly
   skills). The Union's "we grow people" identity made mechanical.
3. **Broken-down stranger** (Event #5): roadside encounter; the raider
   fake-out variant teaches trust. Success → recruit; failure → ambush.
4. **Designed recruits (sodgame's roster, homed — GAP §A):**
   - **Elena** (medic spike 7, trait `iron_stomach`): found at the
     lighthouse clinic room — the story-adjacent recruit, teaches the
     Med line.
   - **Mateo** (mechanic 7 / driver 6, `quick_hands`): broken-down
     pickup on the town–relay road (Event #5's honest variant).
   - **Lina** (stealth 7, `quiet`): dune_cache — the Ghost player's
     first friend, teaches the noise system.
5. **Jonah and Kowalski are NOT recruits** (GAP §C #10) — story NPCs,
   fixed. Wave 8 will be tempted; the answer is no.

Survivor cap: Command Post tier gates it (T1: 4, T2: 7, T3: 10) —
staffing math (BASE_DESIGN) needs a headcount ceiling.

---

## 6. Skills & archetypes

### 6.1 The substrate: XP-by-use skills (GAP §A reconciled)

```ts
type SkillId = 'combat' | 'mechanics' | 'medicine' | 'stealth' | 'driver' | 'scavenging' | 'leadership';

interface SkillState {
  level: number;    // 0–10
  xp: number;       // progress to next
}
// xpToNext(level) = 80 + 40 * level  (L0→1 = 80, L9→10 = 440)
```

XP events (the feed rules — survivors use the same table at 0.5×):

| Action | Skill | XP |
|---|---|---|
| Husk kill, melee | combat | 10 |
| Husk kill, ranged | combat | 8 (+2 headshot) |
| Special-husk kill | combat | 25 |
| Craft at station (per recipe) | mechanics | 6 (+4 if skillReq ≥3) |
| Successful repair | mechanics | 8 |
| Mod attach | mechanics | 5 |
| Heal with bandage/medkit | medicine | 4 |
| Survivor recovered from injury | medicine | 12 |
| Container searched undetected | stealth | 5 |
| Husk lost (broke line of sight) | stealth | 6 |
| 100m driven without damage | driver | 5 |
| Vehicle repaired to 100 | driver | 8 |
| Container looted | scavenging | 4 |
| Safe/locker picked | scavenging | 10 |
| Node harvested | scavenging | 3 |
| Survivor recruited | leadership | 15 |
| Siege survived (present) | leadership | 12 |
| Order given (job assign, v1) | leadership | 2 |

Recipe `skillReq` reads these levels (examples — full table lives with
the recipes): `r_suppressor` mechanics 2; `r_carbine` mechanics 3;
`r_medkit` medicine 1; `r_turret` mechanics 5 + blueprint; `r_smoke_grenade`
chemistry→ mechanics 1. **Rule:** T1 recipes have no gate; T2+ always has
one. This is the "crafting is necessary" engine — the carbine isn't
bought, it's *earned*.

Survivors carry the same 7 skills (§5.1); facility staffing reads their
levels (Mechanic job wants mechanics ≥4 for T3 fabrication, etc.).

### 6.2 Archetypes: perk trees on top

Perk points: **1 point per skill level gained** (any skill, player or…
no — player only; survivors spend nothing, they *are* stats). Points are
spendable in any tree. Capstones are mutually exclusive: **one capstone
per run** — the archetype choice is the character's identity.

```ts
interface PerkDef {
  id: string;
  tree: 'scavenger' | 'brawler' | 'mechanic' | 'ghost';
  tier: 1 | 2 | 3 | 4;            // 4 = capstone
  name: string;
  desc: string;                   // player-facing
  requires?: string[];            // perk ids
  effect: Record<string, number | boolean>;  // implementer-applied
}
```

Tree shape: 3 tier-1 → 3 tier-2 → 2–3 tier-3 → 1 capstone. 9 perks/tree.

**SCAVENGER** (the economy tree):

| id | tier | name | Effect |
|---|---|---|---|
| `sc_keen` | 1 | Keen Eye | loot chance +10% on searched containers |
| `sc_pockets` | 1 | Deep Pockets | +4 pack slots |
| `sc_fingers` | 1 | Light Fingers | hold-to-search −25% time, −25% noise |
| `sc_salvager` | 2 | Salvager | disassembly yields +1 item (first material) |
| `sc_locksmith` | 2 | Locksmith | lockpick never consumed on success; forced entry −50% noise |
| `sc_appraiser` | 2 | Appraiser | barter values +20% (buy and sell) |
| `sc_nightharvest` | 3 | Night Harvest | night loot chance +15%, night stealth +10% |
| `sc_packmule` | 3 | Pack Mule | carry +8kg, heavy-tier slowdown starts 10kg later |
| `sc_remembers` | 4 | **The Island Remembers** (capstone) | POI respawn clocks −25%; T4+ loot chance +10% everywhere |

**BRAWLER** (the melee tree):

| id | tier | name | Effect |
|---|---|---|---|
| `br_heavy` | 1 | Heavy Swings | melee damage +15% |
| `br_blocker` | 1 | Blocker | block cost −40%, blockPct +0.1 |
| `br_adrenaline` | 1 | Adrenaline | kill → +20% swing speed 5s |
| `br_cleaver` | 2 | Cleaver | cleave +1 on all melee |
| `br_executioner` | 2 | Executioner | +50% damage to staggered/stunned husks |
| `br_thickskin` | 2 | Thick Skin | armor mitigation +0.05 (stacks with worn) |
| `br_secondwind` | 3 | Second Wind | once per day: lethal hit leaves you at 1hp |
| `br_unstoppable` | 3 | Unstoppable | knockback taken −50%, can't be interrupted mid-swing |
| `br_juggernaut` | 4 | **Juggernaut** (capstone) | brute hits don't break your block; +30% melee damage below 50% hp |

**MECHANIC** (the crafting/vehicle tree):

| id | tier | name | Effect |
|---|---|---|---|
| `me_tinkerer` | 1 | Tinkerer | craft speed +25% |
| `me_grease` | 1 | Grease Monkey | vehicle repair: parts cost −1 (min 1) |
| `me_efficient` | 1 | Efficient Hands | 20% chance to refund one component on craft |
| `me_gunsmith` | 2 | Gunsmith | mod attach cost −50%, detach returns cost too (double dip) |
| `me_juryrig` | 2 | Jury-Rig | field repair cap 60% → 80% |
| `me_demolition` | 2 | Demolitionist | grenade damage +25%, aoe +1m |
| `me_fabricator` | 3 | Fabricator | Machine Shop fabrication time −40% |
| `me_scrounger` | 3 | Scrounger | gun_parts from disassembly +1 |
| `me_masterfab` | 4 | **Master Fabricator** (capstone) | craft `gun_parts` at any Weapons Bench (no T3 facility needed); turret needs no blueprint |

**GHOST** (the stealth tree):

| id | tier | name | Effect |
|---|---|---|---|
| `gh_soft` | 1 | Soft Steps | noise radius −25% all actions |
| `gh_shadow` | 1 | Shadow | crouched visibility −30% (§6.3 visibility hook) |
| `gh_patient` | 1 | Patient | hold-to-search makes no noise |
| `gh_backstab` | 2 | Backstab | melee ×3 damage from behind / vs unaware husks |
| `gh_vanish` | 2 | Vanish | flashbang blind radius +4m; breaking line of sight is 2× faster |
| `gh_nightowl` | 2 | Night Owl | night stealth +20%, night vision slight (ambient lift) |
| `gh_lootghost` | 3 | Loot Ghost | containers never make search noise; alarms −50% trip chance |
| `gh_coldblood` | 3 | Cold Blood | screamer screams don't mark you (horde-call misses) |
| `gh_unseen` | 4 | **Unseen** (capstone) | crouched + still + in shadow = invisible to husks at >3m |

### 6.3 Visibility system (GAP §A — absent until now, Ghost needs it)

Stealth was noise-only. The Ghost tree and the flashlight mod need light:

```ts
interface VisibilityState {
  exposure: number;  // 0..1 — computed per frame from: light level at player,
                     // crouch (×0.5), moving (×1.3), flashlight on (×2.0 in cone),
                     // smoke cloud (×0), night (ambient floor 0.3)
}
```

Husk perception = sight range × exposure × (1 − stealth skill × 0.03).
The HUD LightIndicator (sodgame's `LightIndicator.ts`, ported): a small
eye icon that fills — the Ghost player's favorite UI element. This is
scoped *small*: one computed number, one icon, multipliers. No raycast
shadow mapping.

---

## 7. Base management screens

Surfaces: Sat Phone → **Base tab** (new `PhoneTab 'base'` — §0.2 #3).
World entry: claim post at claimable POIs (hold F).

### 7.1 Base tab — Overview

```ts
interface BaseSummary {
  baseId: string; name: string;        // POI id, player-renamable
  slots: { large: number; small: number; used: FacilityInstance[] };
  stockpileKg: number; stockpileCap: number;
  heat: number; heatTier: 'calm' | 'scout' | 'warning' | 'siege';  // 0/30/60/90
  comfort: number;                    // 0–3
  power: { used: number; capacity: number };
  population: number; popCap: number;  // Command Post tier
  alerts: string[];                   // "Siege tomorrow night", "Stockpile: no water", "Guard post unstaffed"
}
```

Reads: heat gauge with tier labels + the honest Phase-2 note ("sieges
arrive Phase 3" — BASE_DESIGN's consequence honesty); defense score
breakdown; tonight's forecast (scout activity at heat ≥30).

### 7.2 Claim screen (world, at the claim post)

```
CLAIM: SHORE CAMP
✓ Area clear (0 husks within 40m)      — live check
✓ Cost: FREE (tutorial claim)
✓ Command Post T1 will be built
[ HOLD F — CLAIM ]
```

Other POIs show their real checklists (jonah_camp: 15 scrap; town: 40
scrap + 3 survivors + Union rep ≥25 OR War — the §0.2 #7 resolution,
shown as two explicit paths). On claim: Sat Phone gains the Base tab,
site joins fast travel, Command Post T1 ghost auto-places (player labor,
×1.5 time — the tutorial build).

### 7.3 Facility build menu (per base)

Slot grid: large slots (6 at town, 4 at jonah, 3 at shore) + small slots.
Each empty slot → facility cards, each card showing:

```ts
interface FacilityCard {
  facilityId: string;                 // 'workbench' | 'storage' | 'garden' | ...
  name: string; tier: 1 | 2 | 3;      // what tier this build is
  cost: { itemId: string; qty: number }[];
  buildHours: number;                 // ×1.5 solo (player-only rule)
  powerDraw: number;                  // kW, 0 if none
  gate: 'solo' | 'builder' | 'builder_specialist_blueprint';
  gateText: string;                   // "Needs a Builder", "Needs Builder + Medic + blueprint"
  effectText: string;                  // "bandage 0.5/hr"
}
```

Gate states are the UI's honesty: greyed cards name the missing piece
("Recruit a Builder" / "Find the blueprint"). One active construction
per base; ghosts queue.

### 7.4 Facility detail (tap a built facility)

Current tier, tier effect + rate, staffed-by (survivor card link),
upgrade button (cost, hours, gate), power draw, production log (last 24h:
"bandage ×6, wire ×0 — Medic was injured"). Pause/resume production
(injured staff, siege prep).

### 7.5 Stockpile / storage screen

```ts
interface StockpileView {
  cap: number; used: number;
  categories: { id: string; items: { itemId: string; qty: number; heatValue: number }[] }[];
  totalHeatValue: number;              // feeds heat ×1.2 (§3.7 BASE_DESIGN)
  deposit: (uid) => void; withdraw: (itemId, qty) => void;
}
```

Deposit = move from player inventory; withdraw = take (encumbrance
checked). Heat value per item shown on long-press (teaches the
stockpile-heat tension). T2+: "deposit anywhere, withdraw at home"
(BASE_DESIGN §3.3).

### 7.6 Survivors screen

Roster list (cap from Command Post tier): each row = name, job, morale
bar, status icon. Tap → survivor card: §5.1 stat block, traits with
tooltips, skills bars, morale drivers (last 3 events), needs
(2 food + 1 water/day — shown as the daily burn), job dropdown
(§5.1 job list + Idle), "send home"/"dismiss" (the bitter re-recruit
rule noted). Unassigned highlight: "3 survivors idle — assign jobs."

### 7.7 Jobs / garrison board

```ts
interface JobBoard {
  assignments: { job: SurvivorJob; survivorId: string | null; facilityId?: string; postId?: string }[];
  guardPosts: { postId: string; staffed: boolean; ammoStock: number }[];  // ammo logistics tail
  siegeReadiness: { defense: number; guards: number; ammo: number; verdict: 'ready' | 'thin' | 'exposed' };
}
```

Watchtower/gate posts are staffable positions; guards consume stockpile
9mm during sieges (shown as the projected burn: "this siege costs ~40
rounds"). The readiness verdict is the screen's one number.

### 7.8 Garage screen (per base with a Garage Bay)

Bays (1/2/3 by tier; T3 = heavy). Each bay: empty / vehicle card.

```ts
interface VehicleCard {
  vehicleId: string; kind: string;    // POIS §4 roster id
  condition: number; fuelL: number; fuelCap: number;
  stored: boolean;                    // in-bay = protected (POIS §4 shared rules)
  upgrades: string[];                 // A1/A2/ENG/CRG/RAM/lift
  trailerId?: string | null;
  bikeSlots: (string | null)[];       // POIS §4.2 counts
  actions: ['repair' | 'upgrade' | 'refuel' | 'manufacture'];
}
```

Repair action shows the parts bill (gun_parts? no — vehicle parts:
tire/engine_part/scrap per POIS §4) and the field-cap rule (field repair
caps 60%). Refuel consumes fuel_can (+20L). **Vehicle trunk**: each
vehicle card expands to a slot-count container (200–2500kg per POIS
roster; sedan 300kg) — deposit/withdraw like §7.5, persists with the
vehicle (DayZ's lesson, slot-count not grid — §0.1). Manufacture list
(ATV/sedan/skiff, POIS §4.1 costs) appears at Garage T3 + Machine Shop
T2 + Mechanic present.

### 7.9 Relocation dialog

"Claim a new home?" → shows: salvage refund 70% (materials, itemized),
"stockpile does NOT teleport" warning with the current stockpile weight
("you own 412kg here — box trucks exist for a reason"), outposts persist
note. Confirm → old base becomes neutral (claim post returns), new
claim proceeds. This is the D.C.-road mechanic made UI.

---

## 8. Progression (what unlocks when)

Canon: Island = chapter one; lighthouse ending = "leave the island" gate.
OBX → Norfolk/Virginia Beach → D.C. at ~1/10th real scale. The cure flips
the game to hardmode (government + new factions; Mercenaries 2 / Terraria
pattern). Side quests pinned until the event director exists (GAP §D).

### 8.1 Island — early (prologue → holdout → first claim)

| Beat | Unlocks |
|---|---|
| Prologue (Tern Rock) | Melee basics, first-person/TP toggle, difficulty rules |
| Find the Sat Phone (wreck) | Phone: Loadout + World tabs; field crafting |
| Shore camp claim | Base tab (§7.1), Command Post T1, prefab kit v1 |
| First 30 min (POIS §2 arc) | Hold-to-search, noise meter, lockpick basics |
| Weapons Bench (jonah/town) | Ammo reload, T2 melee craft, armor craft (shin guards) |

### 8.2 Island — mid (relay, town, first vehicles)

| Beat | Unlocks |
|---|---|
| Relay station reached | Chemistry Station (medkit, fuel_can, molotov, smoke) |
| Distress rescue / Mateo / Lina | First recruits; skills substrate live (§6.1); survivor jobs |
| Town claimable (rep or war) | 6-slot home, Garage Bay T1, storage economy |
| Vehicles sub-wave ① live | Driving, fuel/condition loop, road network, driver skill |
| Heat ≥60 warning | Siege forecast UI (Phase 3: real siege nights) |
| Weapons Bench facility T2 | Weapon crafting (revolver), mod attach, repair economy |
| Union rep ≥25 | School dormitory recruit pipeline (§5.6), medic trader |
| Remnant rep grind (from −50) | Listening-post access, intel economy begins |

### 8.3 Island — late (east cape, endgame toys)

| Beat | Unlocks |
|---|---|
| Military base POI (Wave 6) | T3 weapons (carbine, DMR, baton), plate_carrier, armory loot |
| Military base cleared | Compound claim (8 slots + heavy bay), compound siege tier |
| Machine Shop (marina world instance / T3 facility) | Fabrication (gun_parts, engine_part), circuit boards, turret (bp_turret) |
| Remnant rep ≥75 | Quartermaster trader; APC earned (quest or buy) — POIS decision 3 |
| Husks: runner formalized, specials live | Screamer/brute/crawler/bloater with abilities |
| Event director live | 12-event catalog (convoys, roadblocks, supply drops, surges) |
| Lighthouse ending | Light/dark choice → "leave the island" gate (chapter close) |

### 8.4 Regions — OBX → Norfolk / Virginia Beach

| Region | Unlocks |
|---|---|
| **OBX** (mainland strip) | Outpost chain mechanic (claim → stock → move home — §7.9 at scale), convoy interdiction on real roads, ring-scaler difficulty, faction outposts dynamic-lite |
| **Norfolk / Va Beach** | Urban POI set (apartment towers, port, naval yard), Enclave first contact (neutral brokers — the "possible 7th" from Ian's merge, resolved: they exist, as brokers), T3 stations standard, government patrols *foreshadowed* (drones, broadcasts — not yet hostile), hardmode-preview gear (better armor/weapons trickle in) |

### 8.5 D.C. → the cure → hardmode

| Beat | Unlocks |
|---|---|
| D.C. approach | Checkpoint gauntlet, Remnant endgame (their home turf), cure questline |
| **The cure** | The flip: Static ends. Husks stop spawning. The world breathes — for one in-game day. |
| **Hardmode** | Government occupation (new enemy faction: professional, armored, radios), new factions enter (Enclave goes active; a government "Restoration Authority" replaces the husk pressure), **new tech tree**: hardmode weapons (govt-issue carbine variants, breaching gear), better armor (plate+), new vehicles (govt trucks, the APC's peers), survivor upgrades (veteran jobs, capstone-tier perks for survivors), new events (sweeps, checkpoints, supply requisitions — the government taxes your stockpile the way heat did), evolved overworld prep |
| Stage 2 | New Dawn-style evolved world: dynamic faction flipping (POIS decision 5), bases contested, Stage 2 content |

Progression rule across all of it: **nothing hardmode is buyable with
island money alone** — the cure is the gear reset's door, Terraria-style,
so island stockpiles matter for survival, not for skipping the new tree.

---

## 9. Implementation order (waves)

Aligned to EASYMODE's order of operations and GAP §D, with this spec's
systems slotted by dependency. Each line is shippable on its own.

1. **Preexisting fixes** (EASYMODE §1): rep re-band to sodgame tiers
   (§0.1), gunshot noise 80m + per-weapon `noiseRadius`, AppBoy→Sat
   Phone doc sweep, stale item lists marked shipped.
2. **Items & instance data** (§1): new categories (`armor`, `mod`,
   `blueprint`), `ItemDef` extensions, `InvItem` condition/mods/
   loadedAmmo, `Equipped` armor slots; new item IDs landed (`crowbar`,
   components `gunpowder`/`brass`/`lead`, `circuit_board`, `smoke_grenade`,
   `rock_lure`, `decoy_boombox`, armor re-categorization).
3. **Search & stealth** (GAP §D #6): noise-class table + HUD meter,
   hold-to-search, lockpick + crowbar forced entry, stealth tools,
   visibility state + light indicator (§6.3), alarm behavior (§4.4).
4. **Buildings wave** (Ian priority #1): houses v2 (garages, rich tier,
   safes, keeper's house), variant-list reconciliation, **vehicle pad
   registry** (spawn contract for wave 6).
5. **Weapon roster completion** (§2): remaining melee/ranged/throwables
   as items + meshes + guaranteed spawns; reload/mag system; condition/
   wear + repair actions; disassembly (§3.4).
6. **Item + vehicle models + road network** (Ian priority #2): roster
   meshes sub-wave ①, static placement on pads/roads; island roads
   (gate for everything vehicular).
7. **Skills substrate** (§6.1): 7 skills, XP events, recipe `skillReq`
   wiring. **Before** crafting-depth content (GAP §D's gate) — trees
   (§6.2) ship later, substrate ships now.
8. **Crafting depth** (§4): timers, ammo components + T2 reload recipes,
   chemistry line completion, Machine Shop world instance at marina,
   weapon/armor crafting, mod items + attach/detach (§3) with mesh
   changes. (Weapon mods after the noise table — suppressor must be
   real, not cosmetic.)
9. **Vehicles + physics** (GAP §D #4): drive model, fuel/condition,
   repair (field cap 60%), persistence + map beacon, trailers + hitch,
   bike snap-in, upgrade ladder at Garage Bay.
10. **POI creation** (ROADMAP Wave 6): strip mall, marina/boatyard, gas
    station, barn/farm, warehouse, school, military base shell, raider
    fort — loot scenes, respawn clocks, alarm flags, density per POIS §1.
11. **Mobs**: runner formalized, military husks at the military base,
    horde controller, zone loot extended (gun_parts on military husks).
12. **Special mobs**: screamer, brute, crawler, bloater + abilities
    (needs horde controller + noise system from 3/11).
13. **Survivors** (§5): generation, traits, morale, recruiting hooks
    (distress rescue needs the event director's radio hook — stub:
    phone ping + marker), jobs. Elena/Mateo/Lina placed.
14. **Base building v1** (§7): claim flow, Base tab screens, facility
    slots + ghosts (player labor), stockpile + heat readout. Then labor
    economy (jobs/staffing gates) with 13, T2/T3 + town claim path.
15. **Archetype trees UI** (§6.2): perk points, four trees, capstone
    choice. (Substrate from 7 is earning points already.)
16. **Factions as systems**: rep-gated traders (barter table from
    `barterValue`), physical convoys, roadblocks, takeover-branding kit,
    the three main bases built out (POIS §3).
17. **Event director + 12-event catalog**: last island system; consumes
    convoys, factions, bases, skills.
18. **Visuals wave** (can float earlier as a breather): DoF, clouds,
    tighter TP fog, light shafts.
19. **Regions + hardmode** (§8.4–8.5): OBX → Norfolk → D.C., cure,
    hardmode pivot, Stage 2.

---

*Spec ends. Implementers: when this doc and a companion doc disagree,
§0.1/§0.2 of this doc wins until Ian says otherwise — and say so in the
PR, so the losing doc gets its one-line fix.*
