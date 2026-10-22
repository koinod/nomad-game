# Skills Audit — Order #5 Phase A (2026-10-21)

Baseline: main `b161281`. Method: every perk effect key and every perk id
grepped across `src/` (game code vs tests), every XP event traced to its
firing call site, the Character app read end to end. Spec of record:
`SYSTEMS_SPEC.md` §6 (event table §6.1, perk tables §6.2, visibility §6.3).

**Verdict: the engine is structurally sound** — XP math, level curve,
perk-point economy, tier/requires/capstone buy gates, and the save shape
are one consistent rulebook (`systems/skills.ts` + store wrappers over
it). What is unfinished is *application*: of 36 perks, 10 are fully
wired, 8 are half-wired, 18 are fully inert. The Character app shows the
tree twice (a compact duplicate with no lock reasons + the full panel).

## Perk table — wired / partial / inert

Legend: ✅ wired (measured effect in live gameplay) · ◐ partial (one
clause works, another has no system) · ✗ inert (nothing reads it).

### Scavenger
| Perk | State | Evidence / gap |
|---|---|---|
| sc_keen Keen Eye | ✗ | `lootChanceMult` read nowhere. `rollLoot` (data/items.ts) takes no chance mult. |
| sc_pockets Deep Pockets | ✗ | `bonusSlots` feeds legacy `slotLimit`, which has **no callers** — inventory v2 is grid-based; pockets grid is a fixed 2×2 (`containers.ts` POCKET_DIMS). |
| sc_fingers Light Fingers | ◐ | Time ✅ (`Game.beginSearchIfNeeded` ×0.75). Noise ✗ — **searching emits no noise anywhere**, so there is nothing to reduce. |
| sc_salvager Salvager | ✗ | `disasmBonus` unread; `gameStore.disassemble` pays `def.disassembly` verbatim. Spec: +1 to the first material. |
| sc_locksmith Locksmith | ◐ | Pick kept ✅ (`Game` search completion). Forced entry ✗ — **no forced-entry mechanic exists** (locked + no pick = hard refusal); the `forced_entry` noise class (45m) and alarm trigger are defined but never fired. |
| sc_appraiser Appraiser | ✗ | `barterMult` unread. Trades are fixed give/get stacks (`data/traders.ts`) executed in `TraderPanel`; no value math at trade time. |
| sc_nightharvest Night Harvest | ◐ | Night stealth ✅ (`visibility.ts` nightVisMult 0.9). Night loot ✗. |
| sc_packmule Pack Mule | ◐ | +8kg ✅ (`carryLimitKg` bonus at 4 call sites). Heavy-shift ✗ — `encumbranceTier` has no shift parameter. |
| sc_remembers Island Remembers | ✗ | Both clauses: respawn clocks (`Interact.sweepRespawns` / `respawnDaysFor`) and rare-loot chance read nothing. No item "tier" field exists; rarity must be defined from the loot entry itself. |

### Brawler
| Perk | State | Evidence / gap |
|---|---|---|
| br_heavy Heavy Swings | ✅ | `Combat.tryMelee` ×1.15 (id check). |
| br_blocker Blocker | ✗ | Blocking exists (`damagePlayer`: husk hits ×0.25 while `input.blocking`) but reads no perk: mitigation never improves, and **blocking a hit costs no stamina anywhere** — both clauses inert. |
| br_adrenaline Adrenaline | ✗ | No swing-speed state exists; `Player` sets `meleeCd = swingTime + 0.16` flat. |
| br_cleaver Cleaver | ✅ | `Combat.tryMelee` cleave +1. |
| br_executioner Executioner | ✅ | ×1.5 vs `stunT > 0` in `tryMelee`. |
| br_thickskin Thick Skin | ✅ | `damagePlayer` prot +0.05 (forest-wide armor). |
| br_secondwind Second Wind | ✗ | No lethal-hit save anywhere; `damagePlayer` goes straight to `die()`. Needs a once-per-day state field. |
| br_unstoppable Unstoppable | ✗ | **No player knockback exists** (husk hits never displace the player) and nothing interrupts a swing — both clauses have no system. |
| br_juggernaut Juggernaut | ◐ | Low-HP +30% ✅ (`tryMelee`). Brute-block clause ✗ — **brutes do not break blocks**; block reduction is attacker-blind (`damagePlayer` gets only `cause: 'husk'`). |

### Mechanic
| Perk | State | Evidence / gap |
|---|---|---|
| me_tinkerer Tinkerer | ✗ | `craftSpeedMult` unread; queue duration = `recipeDurationMin` flat (`systems/crafting.enqueue`). |
| me_grease Grease Monkey | ✗ | `repairCostBonus` unread; `repairVehicle` costs are fixed per kind. |
| me_efficient Efficient Hands | ✅ | Both craft paths (store `craftRecipe` + queue `efficientHandsRefund`). |
| me_gunsmith Gunsmith | ◐ | Attach halved ✅ (`attachMod`). Detach refund ✗ — `detachMod` returns the mod item, never the gun-parts cost. Spec calls the double-dip deliberate. |
| me_juryrig Jury-Rig | ✗ | **No field repair cap exists at all** — `Game.applyRepair` adds condition uncapped to 100% from anywhere. |
| me_demolition Demolitionist | ✅ | `Game.detonate`: dmg ×1.25, aoe +1 (applies to all throwables' shared `th` — frag is the damage path). |
| me_fabricator Fabricator | ✗ | `fabTimeMult` unread (same flat duration as Tinkerer). |
| me_scrounger Scrounger | ✗ | `gunPartsBonus` unread (same disassembly site as Salvager). |
| me_masterfab Master Fabricator | ✗ | No `gun_parts` recipe exists; `checkCraft` blueprint gate has no perk waiver. |

### Ghost
| Perk | State | Evidence / gap |
|---|---|---|
| gh_soft Soft Steps | ✅ | `Game` playerCtx.emitNoise ×0.75 on every player-emitted noise. |
| gh_shadow Shadow | ✅ | `visibility.ts` crouchVisMult. |
| gh_patient Patient | ✗ | `quietSearch` unread — same missing search-noise system as Light Fingers. |
| gh_backstab Backstab | ✅ | `tryMelee` ×3 behind/unaware. |
| gh_vanish Vanish | ✗ | Both clauses: flashbang radius is `th.aoe` flat in `Game.detonate`; husk lose-sight threshold is a hardcoded 6s in `Husks` (`lostSightT > 6`). |
| gh_nightowl Night Owl | ◐ | Night stealth ✅ (`visibility.ts` nightStealthMult 0.8). "Night vision (ambient lift)" ✗ — no rendering/light seam reads it. |
| gh_lootghost Loot Ghost | ✗ | Search-noise clause ✗ (no search noise); alarm clause ✗ — `Interact` trips alarmed major containers deterministically (`alarms.trip`), no probability and no perk read. |
| gh_coldblood Cold Blood | ✗ | `Husks.resolveShriek` always converges the horde on the player's position. |
| gh_unseen Unseen | ✅ | `visibility.ts` posture + `canHuskSee` 3m rule + Husks smell-range precedence. |

## XP sources — every §6.1 row traced to a firing site

All 20 spec events fire from real actions. Several fire via numeric
literals that happen to match the table (fragile, noted — values pinned
by `skills.test.ts` on the table side only):

| Event | Fires at |
|---|---|
| husk_kill_melee / special_kill | `Player` melee resolution (per-kill counts) |
| husk_kill_ranged / _headshot / special_kill | `Player` hitscan + projectile verdicts |
| station_craft / _gated | store `craftRecipe` (gate read from **items.ts** `skillReq`) + queue `tick` via `craftXpAward` (gate read from **RECIPE_META**) — two gate sources, see below |
| repair | store bench `repairItem` |
| mod_attach | store `attachMod` (literal 5) |
| heal | store `useItem` medical + `treatSurvivor` |
| survivor_recovered | store `treatSurvivor` (replaces heal at hp ≥ 60) |
| search_undetected | `Game` search completion (only if never alerted) |
| husk_lost | `Husks` → `Game` `onHuskLost` hook (once per hunt loss) |
| drive_clean_100m | `Game.updateDriving` (literal 5; streak now accrues — collision condition loss was deleted 2026-10-21, so the reset condition is dormant) |
| vehicle_repaired_full | store `repairVehicle` (repair landing at 100%) |
| container_looted / safe_picked / node_harvested | `Game` search completion (literals 4 / 10 / 3) |
| recruit | store `recruitSurvivor` (literal 15) |
| siege_survived | `Game` siege resolution |
| order_given | store `assignJob` (literal 2) |

Gaps / notes:
- **No survival-time award exists** — the §6.1 table has no such row.
  (Phase B adds `day_survived` → scavenging 8 at day rollover, flagged
  as a lane addition beyond the spec table.)
- Survivor XP (spec: same table at 0.5×) never accrues — survivor skill
  levels are static authored data. Out of this lane's scope; recorded
  as a residual.
- `applyFinish` pays mechanics 3 — not a spec row; harmless extra.

## Skill gates — two declarations, one-and-a-half enforcements

- Queue path (`systems/crafting.checkCraft`) enforces **RECIPE_META**
  gates reading `storeSkillLevel` (the live store `skills` map — the
  same state the tree displays). ✅ one source of truth there.
- Instant path (`gameStore.craftRecipe`) enforces **no skill gate at
  all** — station + components only. Latent hole: every gated recipe
  is currently timed (queue-routed), but the store action itself is
  ungated, and items.ts declares gates (`skillReq`) that this path
  ignores entirely.
- Declaration divergence: RECIPE_META gates ⊃ items.ts gates (meta
  adds reflex/suppressor/extmag/laser/choke at mechanics 1–2 where
  items.ts declares nothing). Where both declare, they agree
  (revolver 1, smg 2, carbine 3, smoke grenade 1, turret 5, medkit
  medicine 1 in meta). Phase B pins that agreement and makes
  RECIPE_META the single enforced source on both paths.

## Character app (Phone.tsx) vs the skill data

- CharacterTab = Field status (hp/stamina/armor/load) + Appearance +
  Treatment (self + crew, live) + **two** skill surfaces:
  `SkillsTab` (compact duplicate: levels + perk list, Learn buttons
  never disabled, no lock reasons — denial arrives only as a toast
  from `buyPerk`) stacked on top of `SkillsPanel` (the full §6.2
  surface: engine lock reasons from `canBuyPerk`, capstone banner).
  Phase B removes the duplicate; one tree, health alongside it.
- CharacterTab's armor % reads top-level inventory only, while
  `damagePlayer` counts the whole carried forest — display and
  simulation disagree. Phase B aligns the display to the forest.
- Health model as implemented: hp/maxHp + stamina, hp-band labels
  (Uninjured/Hurt/Badly hurt/Critical), treatment via heal items;
  survivors carry hp + status + `treatSurvivor`. There is no
  per-wound system for the player — the audit records the model as-is;
  the Character app already surfaces all of it.
- UI state is derived inline in JSX in both surfaces; Phase B extracts
  a pure `perkRowState` (owned/available/locked + reason) into
  `systems/skills.ts` and pins it.

## Phase B plan (from this audit)

1. `systems/perkEffects.ts` — every perk's measured derivation as a
   pure function (single source of truth for game + store + UI).
2. Wire the 18 inert + 8 partial perks at their audited sites;
   build the three missing micro-systems honestly (search noise,
   forced entry, player knockback) and the two missing rules
   (field-repair cap, brute block-break) the spec's text presumes.
3. Trim the two clauses with no honest seam: Unstoppable's
   swing-interrupt clause and Night Owl's ambient-lift clause
   (descriptions corrected; the measurable halves ship).
4. Gates: `craftRecipe` enforces RECIPE_META via
   `systems/skills.meetsSkillReq` over the store's `skills`; agreement
   pin between the two declarations.
5. XP: `day_survived` addition; literal awards routed through
   XP_EVENTS where the site is touched anyway.
6. UI: single tree in the Character app via `perkRowState`;
   forest-true armor display.

---

# Phase B resolution (same lane, after the audit)

Single source of truth: `src/systems/perkEffects.ts` — every perk's
gameplay number derives from its `PerkDef.effect` record; no call site
keeps a private copy of a perk constant.

| Perk | Disposition |
|---|---|
| sc_keen | WIRED — loot roll `chanceMult` in Interact (containers + corpses); Keen Eye uniques now actually surface |
| sc_salvager | WIRED — store disassembly passes through `disassemblyYields` (+1 first material, stacks with me_scrounger) |
| sc_pockets | WIRED — pockets grid grows 2×2→4×2 via `pocketsSpec(perks)` threaded through containers/store/UI |
| sc_packmule | EXTENDED — +8kg (existing) and the heavy tier now starts 10kg later (`heavyShiftKg` in encumbranceTier at all 6 call sites; two display sites also gained the missing +8kg) |
| sc_appraiser | WIRED — trader give-side discount ×1/1.2 via `appraisedOffer` in TraderPanel |
| sc_remembers | WIRED — loot respawn clock ×0.5 (`respawnClockMult` on container open) |
| sc_nightharvest | COMPLETED — night loot chance ×1.5 joins the existing stealth half |
| sc_locksmith | WIRED — forced entry built (see below); pick-keeping unchanged |
| sc_fingers | COMPLETED — duration via `searchDurationMult`; search noise now exists and Patient shrinks it |
| br_blocker | WIRED — block mitigation now perk-aware (75%→85%) and blocking a hit costs stamina (10, −40% with Blocker) |
| br_adrenaline | WIRED — kill grants 5s of −25% stamina costs (Player stamina spend) |
| br_secondwind | WIRED — once/day at ≤25% HP: restore 30% max HP + full stamina (store, `secondWindDay`) |
| br_unstoppable | WIRED + TRIMMED — knockback system built (husk hits shove 0.45m; Unstoppable halves it); the "swings can't be interrupted" clause was CUT from the description — no swing-interrupt mechanic exists |
| br_juggernaut | COMPLETED — brute hits now break blocks (`blockBreak`); only Juggernaut holds a guard vs brutes |
| me_tinkerer | WIRED — timed-craft durations ÷1.25 at enqueue (`effectiveDurationMin`) |
| me_grease | WIRED — vehicle repair costs ×0.75 of computed parts (`vehicleRepairCost`) |
| me_gunsmith | COMPLETED — attach uses `modPartCost` (already halved); detach now REFUNDS the same discounted gun_parts |
| me_juryrig | WIRED — field-repair cap system built: away from a workshop, condition clamps at 60% (80% Jury-Rig); workshops finish the job |
| me_fabricator | WIRED — industrial timed crafts ×0.6 |
| me_scrounger | WIRED — +1 gun_parts on disassembly (stacks with Salvager → +2 total on gun yields) |
| me_masterfab | WIRED — new timed recipe `r_gun_parts` (workbench, scrap 3 + wire 1 → gun_parts) gated by `perkReq`; turret blueprint waived for Master Fabricators |
| gh_patient | WIRED — search-noise system built (8m base on container searches; Patient → 0) |
| gh_vanish | WIRED — husk lose-sight 6s→3s (`loseSightSec`) + flashbang blind radius +4m (`flashRadiusBonus`) |
| gh_lootghost | WIRED — no search noise with the perk; container alarm trips ×0.5 (`alarmTripMult`), rolled in Interact |
| gh_coldblood | WIRED — shrieker shrieks now redirect to a decoy point ~14m off 50% of the time |
| gh_nightowl | TRIMMED — "slight night vision (ambient lift)" cut from the description (no rendering seam); stealth half was already real |

New micro-systems built because perks promised them (smallest honest
versions): search noise, forced entry (locked + no pick anywhere in
the carried forest → smash: 2× time, forced_entry noise class,
`loot_ghost` containers exempt from the bang via Locksmith halving),
player knockback, block stamina cost, field-repair cap.

Gate unification: `craftRecipe` (instant path) now enforces the same
`skillReq` from the same store `skills` map the tree renders; the
queue path already did. A test pins that RECIPE_META and items.ts
never disagree where both declare. `perkReq` added to the craft gate
for capstone-perk recipes.

XP: all 20 §6.1 events verified firing (table in Phase A §3) plus one
lane addition — `day_survived` (scavenging +8) on `advanceDay`, the
spec's missing survival-time source. New test file pins:
`src/tests/perk-effects.test.ts` (38), `src/tests/skills-wiring.test.ts`
(store-level integration: damage/gates/disassembly/durations/UI rows).

UI: the duplicate compact `SkillsTab` inside CharacterTab was deleted;
`SkillsPanel` is the single tree and its rows derive from
`perkRowState` (systems/skills) — display and gate share one
derivation. CharacterTab armor now counts the whole carried forest,
matching `damagePlayer`.

Residuals (unchanged from Phase A): survivor XP never accrues
(authored levels only — out of scope, order #6 territory); no
per-wound health model exists to display (Character shows the hp-band
treatment model that does exist). Gate at close: tsc clean, vitest
881/881 (baseline 821), production build green.
