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
