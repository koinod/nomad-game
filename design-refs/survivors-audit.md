# ORDER #6 — PHASE A AUDIT: survivors, survivor AI, zombie presentation, movement animation

Lane: `lane/survivors-ai` from main `17bdea5`. Audit date: 2026-10-21.
Method: source read of `src/data/survivors.ts`, `src/data/dispatch.ts`,
`src/systems/{morale,baseClaims,skills}.ts`, `src/store/{gameStore,types}.ts`,
`src/game/{Game,Husks,Player,Interact,figureKit,moveMath}.ts`,
`src/ui/{Phone,DispatchPanel}.tsx`, GLB header inspection of every file in
`public/figures/`, and the figures-lane tooling in `tools/figures/`.

## VERDICT: FINISHABLE — not greenfield. Proceed to Phase B.

The survivor system is two half-systems that never met:

- **The spreadsheet half is built and deep.** Roster generation, designed
  recruits, traits, morale, daily upkeep (food/water from base stockpile,
  pack fallback), jobs, facility production/staffing, siege heat, and a
  complete abstract dispatch sim (vehicle-instance planning, fuel, territory
  risk, journal reports) all exist, are store-owned, save-persisted, and
  test-pinned (`survivors.test.ts`, `dispatch*.test.ts`, `baseSystems.test.ts`).
- **The in-world half is absent.** No recruited survivor has ever existed as
  a world entity. Recruits and story NPCs are frozen statues at their POIs;
  recruiting one adds a store record and leaves the statue standing there
  forever. There is no follow, no formation, no guard, no companion combat,
  no survivor in a vehicle seat, anywhere in the game layer (grep-verified:
  no follow/companion/passenger code exists in `src/game/`).

Animation is the mirror image: the **player** has the best locomotion in
the game (distance-clocked, state-aware), **husks** have a partial
procedural kit (real flinch/stagger/death, fixed-clock limb swing, one
class — the crawler — with frozen limbs), and **in-world humans have zero
animation** (they are never updated per-frame at all).

Phase B therefore builds the missing middle layer (a world-side companion
system on the existing store + figureKit rigs) and finishes the animation
kit, instead of rebuilding data systems that already work.

---

## 1. SURVIVORS — figures, rigs, recruitment, base, Team state

### 1.1 The GLBs in `public/figures/` are proof exports, not rigs

`survivor_{dez,elena,lina,mateo,priya}.glb`, `npc_{jonah,kowalski}.glb` and
`player_avatar.glb` are **single combined meshes** (GLB node list: the
figure root + a ground `Plane` from the render scene). They carry **no**
named pivots (`torso/head/armL/legL/…`), so `figureKit.bindFigureGLB`
cannot pose them and nothing in `src/` references them (grep-verified).

That is by construction, not neglect: `tools/figures/export_figures.ts`
builds every figure with the **real figureKit builders**, bakes world
transforms, and exports OBJ→GLB purely so the figures lane's Blender
contact sheets could gate the designs. The in-game figure and the GLB are
the same figure; the game just runs the live, posable version.

Contrast — husks: `husk_*_authored.glb` carry the full pivot hierarchy
(`legL legR armL armR head jaw torso` + joint-cap meshes from the joint
pass) and ARE loaded at runtime (`Husks.ts` `AUTHORED_GLB_BY_KIND`,
swapped in via `bindFigureGLB`, procedural kit figure as fallback).

**Consequence for Phase B item 4:** "authored figures everywhere
survivors appear" is already true in substance — every human in the world
(recruits, NPCs, the player) is built by `figureKit.buildHumanFigure`
with its designed look (`SURVIVOR_LOOKS` / `NPC_LOOKS` in
`src/data/survivors.ts`; `personMesh` in `Interact.ts` delegates to it).
There are no interim/capsule humans left (grep: no `CapsuleGeometry`
people anywhere). The remaining figure debt is not mesh tier — it is that
the figures **never move** (§3) and that recruited survivors **have no
figure at all** (§1.3).

### 1.2 Recruitment today

- Five designed recruits (`DESIGNED_RECRUITS`): Elena (lighthouse),
  Mateo (relay), Lina (dunes) — walk-up recruits; Dez (marina, needs a
  bandage consumed from the pack) and Priya (wreck, needs the
  `relay_online` flag) — encounter-gated. Plus procedural generation
  (`generateSurvivor`) for non-designed crew.
- Recruiting calls `store.recruitSurvivor(def)`: roster append + a +2
  morale bump for the existing crew. Jobs assignable immediately
  (`assignJob`), morale events/daily tick/upkeep all live.
- Story NPCs: Jonah + Kowalski hand-placed, plus Lane 9's
  `NPC_PLACEMENTS` (Boudreaux, Okonkwo, Quartermaster, Wraith, Vesper,
  relay guard, the Accountant) — all dialogue interactables.

### 1.3 The statue problem (the audit's ugliest finding)

`Interact.ts` places every recruit/NPC mesh **once, statically**, in its
constructor. Nothing ever moves, animates, or removes them:

- A recruited Elena stands at the lighthouse **forever** — walk up to her
  statue again and the interactable just toasts "already with your crew".
- Recruited survivors never appear at the claimed base, never work
  visibly, never ride along. Base life (production, upkeep, siege heat,
  the Builder visibly working a build ghost that `baseGhosts.ts` promises
  in its header) is computed in the store with **no world representation**.

### 1.4 Base / Team-app state today

- Store: `survivors: SurvivorDef[]` (skills Record<SkillId,0..10>,
  traits, morale 0..100, hp, status, job) + `moraleRuntime` counters
  riding alongside (types.ts §504 — SurvivorDef deliberately carries no
  runtime counters; Phase B follows the same pattern for orders/needs).
- Base systems consume the roster abstractly: upkeep feeding order,
  facility production per hour + staff assignment, claim gates
  (survivorGate/builder gates), siege heat from crew count.
- Team app (`Phone.tsx` TeamTab) = `CrewSection` + `DispatchPanel`:
  roster cards with name/background/age, traits, HP, status, morale bar,
  job buttons, top-3 skills, and an "Out — task to POI · back ETA" banner
  for dispatched crew. Character tab adds per-survivor Treat buttons.
  **Missing:** orders (follow/hold), equipment of any kind (SurvivorDef
  has no equipment field and nothing renders a survivor holding anything),
  needs beyond HP/morale (no hunger/fatigue meters exist — hunger is a
  day-rollover stockpile event, not a state), full skill readout, and any
  survivor XP accrual (§4).

## 2. SURVIVOR AI — existing vs canon

Canon (phone deck P5 + order #6): equip survivors, seat them in vehicles,
dispatch them on tasks, teaming up (follow/formation/hold), survival
(needs, eating, resting, healing), combat assist.

| Capability | State today |
|---|---|
| Follow / formation / hold position | **Absent.** No world entity to attach behavior to. |
| Survivor in a vehicle seat | **Absent.** Only the player's avatar gets a seated pose (`Player.ts`, `seatPose.test.ts`). No passenger system. |
| Needs (hunger/health/fatigue) | **Partial, abstract.** Health = hp + status + treat/infirmary. Hunger = daily upkeep against base stockpile/pack (morale consequences, "Breaking" streak → survivor leaves after 3 days). Fatigue = does not exist. None of it ticks in-world or is visible on a person. |
| Eat / rest / heal | **Abstract only.** Upkeep at day rollover; infirmary heals crew daily; Treat button spends pack meds. No in-world act, no carried-supplies consumption by a companion. |
| Combat assist | **Absent in-world.** Survivors contribute to siege/base math (heat, guard traits in data) but no survivor has ever swung or shot at a husk. Siege resolution is numeric. |
| Dispatch | **Built — as a numbers sim.** `data/dispatch.ts` (660 lines, pure, rng-injected): tasks scavenge/scout/escort, POI census, vehicle-instance + trailer planning, fuel burn, territory risk, loot rolls; store owns state (`Dispatch` records with depart/ETA in absolute game minutes, status 'out'); `DispatchPanel` plans by vehicle instance; journal writes the report. The dispatched survivor + vehicle simply **vanish from the world** for the duration — there is no departure drive-off, no crew figure, no arrival. |
| Jobs at base | **Built, abstract.** assignJob → production/upkeep/facility effects. No visible worker. |

**Phase B scope call (per the brief's dispatch clause):** the dispatch
*assignment* hooks already exist end-to-end (Team app → store → sim →
journal). Full world-sim of dispatched crews (driving the island, fighting
en route) is **out of scope**; Phase B adds the groundwork layer the canon
actually lacks — in-world companions for crew who are *here* (following,
holding, riding, fighting beside the player), with orders managed from
the Team app, and dispatched crew simply absent from the companion roster
while out (their existing banner/ETA already says why).

## 3. ANIMATION — what actually plays today

All figures share one rig contract (`figureKit.FigureRig`): root group at
the feet, `torso` pivot at the hip line, `head` at the neck, `jaw`,
`armL/armR` at the shoulders, `legL/legR` at the hips, plus procedural-rig
`elbowL/elbowR` + `armSeg` for the two-bone IK (authored GLB rigs leave
elbows undefined and degrade to shoulder-aim). Builders record static
base poses in `rig.pose`; animation writes **around** those bases.
Joint-continuity law: husk authored GLBs carry telescoped segments +
joint-cap masses (figures joint pass, `tools/figures/joint_check.py`);
the procedural kit lofts overlap at every pivot by construction.

### 3.1 Player — the reference implementation

`Player.ts` is the pattern Phase B extends:

- **Locomotion: distance-clocked.** `walkPhase += bobPhaseDelta(vel·dt)`
  (`moveMath.ts`: one cycle per `BOB_CYCLE_M = 4.8` m travelled) — foot
  speed and body speed cannot disagree; footsteps fire off the same phase.
  Leg swing ±, arm counter-swing, rig bob, sprint lean, strafe roll,
  crouch drop (0.42 m, rig rides low, swing amp cut), all speed/state
  driven. Idle: limb settle (multiplicative decay) + breathing sway.
- **Combat:** melee raise→chop arm arc, block pose, ranged recoil kick,
  and a real two-hand grip: `solveArmIK` puts the support hand on the
  forend (Feel wave's convergence work). Seated pose in vehicles.
- **Gaps:** no hit-reaction on the avatar (damage is camera/HUD feedback
  only) and no death pose (death is the DeathOverlay). Minor vs §3.2/3.3.

### 3.2 Husks ("zombie sprites") — partial kit, fixed clock

Eight authored classes (shambler, crawler, spitter, screamer, bloater,
stalker, armored, brute), all on authored GLB rigs with per-kind pose
bases (slump variants, spitter head-back, bloater hunch, crawler
quadruped re-pose). What plays, from `Husks.ts update()`:

- **Walk:** group-level limp — vertical bob + roll + yaw wobble on the
  root, plus limb swing around the pose bases. BUT the swing clock
  (`limpT`) advances at a **fixed rate** (7.5 hunt / 5 otherwise), not
  from distance travelled. Speed also varies (night ×1.4, day ×0.7,
  stalker burst ×1.3) — so stride frequency and ground speed disagree
  within a state: **the glide the brief forbids, in mild form.**
- **Crawler: limbs never move.** The limb-swing block explicitly exempts
  it ("its pivots ARE the scuttle pose") — the crawler translates with
  only the root bob/roll: a statue on a conveyor.
- **Attack:** no arm motion for melee kinds. Damage lands on a timer and
  the only visual is a whole-body knock/lunge offset. (Spitter has a
  real telegraph — sac swell + jaw; screamer/bloater have their effect
  beats; stalker has pose + burst speed but no distinct prowl gait.)
- **Hit:** real — flinch (head snap + torso rock on a jolt curve, plate
  shrug for armored), stagger rock-back, stun freeze (head down).
- **Death:** ragdoll-lite tip-over (0.45 s) and the corpse stays,
  searchable; crawler rolls onto its side instead.
- **Idle:** limbs relax back to pose bases (fixed 0.12 lerp); no idle
  sway/breathing equivalent beyond that.

Per-class gait identity today = pose base + brute's reduced swing amp.
No crawler scuttle, no stalker prowl cycle, no brute lumber (heavier,
slower, wider) beyond amp scaling.

### 3.3 Survivors / NPCs — nothing

`Interact.update()` ticks respawn clocks only. No person mesh is ever
posed after placement: no idle breathing, no look-at, no locomotion
(there is nothing to locomote — §1.3). This is the single biggest
presentation gap in the order: the living humans are the only figures in
the game with **zero** animation, standing next to animated husks.

## 4. SURVIVOR SKILLS / XP

`systems/skills.ts` (order #5) already carries the survivor hooks:
`xpForEvent(event, { survivor: true })` pays a survivor-rate table
(`SURVIVOR_XP_MULT`) and the level logic accepts a survivor-style record
("survivor maps just level"). **Nothing in gameplay calls it with a
survivor** (grep: only tests do). Survivor `skills` are therefore exactly
as static as order #5 left them: set at generation/recruitment, read by
production/dispatch math, never improved. Wiring accrual is cheap **if**
events exist to hang it on — Phase B's companion combat/work creates the
first real ones (companion lands a hit/kill → combat XP; companion
treated → medicine is the *player's* event; dispatch return already
resolves outcomes in the store, a natural accrual point).

## 5. PHASE B PLAN (priority order per the brief)

1. **Movement animations.** A shared procedural locomotion driver
   (distance-clocked phase like the player's, per-figure gait params)
   in a new `src/game/figureAnim.ts`, consumed by husks + companions:
   - Husks: replace the fixed-rate `limpT` swing with distance-clocked
     stride per kind (shambler uneven limp, brute slow heavy lumber,
     stalker low prowl, armored stiff, bloater sway, screamer jitter),
     **crawler gets a real quadruped scuttle** (diagonal limb pairs),
     melee attack gains a wind-up→strike arm arc, idle gains sway.
     Flinch/stagger/death stay (they're good) and compose over the gait.
   - Companions/NPCs: idle breathing + the same locomotion driver
     (walk/run gaits), so no human stands frozen again.
   - Player: unchanged except a small avatar hit-flinch if it composes
     cleanly (optional, cut first if it fights the IK grip).
2. **Survivor AI (world companions).** New `src/game/Companions.ts`
   (HuskManager-shaped): one figure per recruited, non-dispatched
   survivor, spawned at the player/base; orders per survivor —
   **follow** (formation offsets, distance-clocked locomotion,
   teleport-catch-up beyond a far radius), **hold** (stay, idle,
   guard-scan), **ride** (claim a seat in the player's current vehicle —
   seated pose like the player's; dismount on exit). Needs meters
   (hunger/fatigue alongside hp) tick in-world; companions eat from
   carried supplies/base stockpile, rest at base (and when the player
   sleeps), get treated via existing treatSurvivor; low needs feed
   morale through the existing events. **Combat assist:** engage husks
   inside a radius with their equipped weapon (melee/ranged by item),
   damage through the same husk damage path the turrets use; cowardly/
   brave traits scale engagement, per their data descriptions.
   Equipment: one weapon slot per survivor (Team app assigns from the
   player's pack; the item leaves the pack — conservation-tested).
   Recruit statues despawn when their survivor joins (figures move to
   the companion system); unrecruited recruits/NPCs get idle life.
3. **Team UI finish.** Roster cards gain: order controls
   (Follow/Hold/Ride/Stay-at-base), needs bars (hunger/fatigue beside
   morale/HP), equipment slot (assign/return weapon), full skill list.
   Survivor XP: accrue on companion combat + dispatch returns via the
   existing `{survivor:true}` table; display level progress.
4. **Authored figures everywhere.** Verified already true via figureKit
   (§1.1) — Phase B's work here is the statue fix in (2): after it,
   every survivor who appears in the world is a live figureKit figure
   with their designed look, animated; the flat proof GLBs stay what
   they always were (gate artifacts in `public/figures/`).

### Cut / deferred, with reasons

- **Full world-sim of dispatched crews** — out per the brief; the sim +
  UI already exist, companions cover the "crew is real" gap on foot.
- **Re-rigging survivor GLBs with pivots** — pointless: the GLBs are
  bakes of the live kit figures (§1.1); the live figures are the rigs.
- **Survivor pathfinding** — companions use husk-style steering
  (moveToward + collision resolve, the proven in-game pattern), not a
  navmesh; the island has none and husks already ship without one.

---

## PHASE B OUTCOME (same lane, after the audit above)

**B1 — movement animations** (`figureAnim.ts`, commit 8adebb6). Shared
distance-clocked gait driver (phase = ∫ metres; per-kind tables). Husks:
fixed-rate limp swing deleted; crawler scuttles in diagonal pairs;
melee is a wind-up→chop arc with damage at the crossing (dodgeable,
stagger-cancellable); flinch composes over the gait. Placed people
(recruits/NPCs) breathe and look around via the idle driver, and a
recruited survivor's statue retires itself.

**B2 — survivor AI** (`Companions.ts` + `companionMath.ts`, commit
9a503f6). Store: `SurvivorRuntime` (order / hunger / fatigue / weapon
instance) + `survivorSkills` on the v3 snapshot; weapon handover is
multiset-conserving; eating from pack or stockpile; `awardSurvivorEvent`
feeds §6.1 at half rate and writes levels back into `SurvivorDef.skills`.
World: one figure per recruited, non-dispatched survivor — formation
follow (walk/run/snap catch-up), passenger seats via the player's own
`carSeatPose` solve, hold/base anchors, guard leashes, trait-scaled
combat through `Husk.damage`, kills paying survivor XP. Dispatch-return
XP landed in B3 (task → skill: scavenge→container_looted, scout→
search_undetected, escort→husk_kill_ranged).

**B3 — Team UI** (Phone.tsx CrewSection). Roster cards now carry:
order controls (Follow/Hold/Base, distinct from base-economy Jobs),
Food/Rest meters beside Morale with flagging states, the carried
weapon with Arm-with…/Take-back (only free pack instances are offered),
and the full 7-skill readout with per-skill XP progress bars.

**B4 — authored figures everywhere.** Verified by sweep: every human
in the world is a figureKit figure (player / Interact placements /
companions) and every one animates. No interim human meshes exist.

**Known limits (honest residuals).**
- Husks hunt the player only — companions fight but are not yet
  targets; retargeting is a Husk FSM change, flagged for a future lane.
- Companion gunfire does not consume player ammo; their weapon's
  condition/mods ride along visually but wear is not simulated.
- Companion needs tick in-world; the day-scale upkeep abstraction
  still also runs at rollover (both feed from real stocks; the in-world
  meters are the field truth, upkeep is the base truth).
- Player avatar hit-flinch: CUT. No damage-signal channel exists from
  the store to the avatar, and a new one risks the IK grip composition
  for a third-person cosmetic. Player death stays the DeathOverlay.
- 'Hold' anchors are captured by the companion entity when the order
  lands; they are session state (a reload re-anchors at spawn), by
  design — SurvivorDef/runtime carry no world positions anywhere.
