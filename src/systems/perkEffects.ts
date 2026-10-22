// systems/perkEffects.ts — Order #5: every perk's measured effect as a
// pure derivation over the owned-perk list.
//
// Before this module, the perks that worked at all were wired as
// scattered `perks.includes('x') ? …` literals inside Combat / Game /
// the store, and 18 of 36 perks were read nowhere (see
// design-refs/skills-audit.md). Now each perk's number lives HERE, the
// game systems call these functions, and tests pin each derivation —
// so the tree the phone displays and the effects the game applies can
// never drift apart.
//
// The values come from data/skills.ts PerkDef.effect records (the
// contract) via perkNum; the derivations (how a number becomes a
// gameplay quantity) live here.

import { perkNum } from '../data/skills';

export const has = (perks: readonly string[], id: string): boolean => perks.includes(id);

// ---------------------------------------------------------------- combat --

/** Melee damage multiplier for one hit. Combines Heavy Swings,
 *  Juggernaut's low-HP bonus, Executioner (staggered/stunned target)
 *  and Backstab (behind or unaware target). `hpFrac` is the PLAYER's
 *  current hp fraction. */
export function meleeDamageMult(
  perks: readonly string[],
  args: { hpFrac: number; targetStunned: boolean; behindOrUnaware: boolean },
): number {
  let m = 1;
  m *= perkNum(perks, 'meleeDmgMult', 1);
  if (has(perks, 'br_juggernaut') && args.hpFrac < 0.5) {
    m *= perkNum(perks, 'lowHpDmgMult', 1);
  }
  if (args.targetStunned) m *= perkNum(perks, 'executeMult', 1);
  if (args.behindOrUnaware) m *= perkNum(perks, 'backstabMult', 1);
  return m;
}

/** Extra husks one swing can cleave (Cleaver). */
export function cleaveBonus(perks: readonly string[]): number {
  return has(perks, 'br_cleaver') ? perkNum(perks, 'cleaveBonus', 0) : 0;
}

/** Swing-duration scale while Adrenaline runs (a kill in the last 5s
 *  with br_adrenaline owned): swings take 1/1.2 the time. */
export function swingDurationMult(perks: readonly string[], adrenalineActive: boolean): number {
  if (!adrenalineActive || !has(perks, 'br_adrenaline')) return 1;
  return 1 / perkNum(perks, 'killSwingMult', 1);
}

/** Fraction of a husk hit that gets through a raised block. Base block
 *  stops 75% (×0.25 through); Blocker's +0.10 blockPct takes it to
 *  85% stopped (×0.15 through). */
export function blockThroughFactor(perks: readonly string[]): number {
  return Math.max(0, 0.25 - perkNum(perks, 'blockPctBonus', 0));
}

/** Stamina the player pays for blocking one husk hit. Base 10;
 *  Blocker's blockCostMult 0.6 → 6. */
export const BLOCK_HIT_STAMINA = 10;
export function blockHitStaminaCost(perks: readonly string[]): number {
  return BLOCK_HIT_STAMINA * perkNum(perks, 'blockCostMult', 1);
}

/** How far a husk hit shoves the player, as a multiplier on the base
 *  shove. Unstoppable halves what you take. */
export function knockbackTakenMult(perks: readonly string[]): number {
  return perkNum(perks, 'knockbackMult', 1);
}

/** Base shove distance (m) an unblocked husk melee hit applies. */
export const HUSK_HIT_SHOVE_M = 0.45;

// ----------------------------------------------------------------- carry --

/** Carry-limit bonus in kg (Pack Mule). */
export function carryBonusKg(perks: readonly string[]): number {
  return has(perks, 'sc_packmule') ? perkNum(perks, 'bonusCarryKg', 0) : 0;
}

/** How much later (kg past the limit) the heavy tier starts (Pack Mule). */
export function heavyShiftKg(perks: readonly string[]): number {
  return has(perks, 'sc_packmule') ? perkNum(perks, 'heavySlowShiftKg', 0) : 0;
}

// ------------------------------------------------------------------ loot --

/** Multiplier on every loot-entry chance in a searched container
 *  (Keen Eye; Night Harvest adds its own at night). */
export function lootChanceMult(perks: readonly string[], isNight: boolean): number {
  let m = perkNum(perks, 'lootChanceMult', 1);
  if (isNight) m *= perkNum(perks, 'nightLootMult', 1);
  return m;
}

/** "T4+ loot" (The Island Remembers): there is no item-tier field, so
 *  rarity is read off the loot entry itself — an entry whose base
 *  chance is ≤ 0.35 is one of a table's rare drops. The capstone pays
 *  +10% on those, everywhere (containers and corpses). */
export const RARE_ENTRY_MAX_CHANCE = 0.35;
export function rareLootMult(perks: readonly string[], entryChance: number): number {
  if (!has(perks, 'sc_remembers')) return 1;
  return entryChance <= RARE_ENTRY_MAX_CHANCE ? perkNum(perks, 'rareLootMult', 1) : 1;
}

/** POI/container respawn clocks run this fraction of their base time
 *  (The Island Remembers: −25%). */
export function respawnClockMult(perks: readonly string[]): number {
  return perkNum(perks, 'respawnMult', 1);
}

// ---------------------------------------------------------------- search --

/** Hold-to-search duration scale (Light Fingers). */
export function searchDurationMult(perks: readonly string[]): number {
  return perkNum(perks, 'searchTimeMult', 1);
}

/** Rummaging noise a completed search makes, in meters, BEFORE the
 *  player's general noise perks (gh_soft applies at the emit site).
 *  Base rummage is 8m. Patient: a search makes no extra noise at all.
 *  Loot Ghost: container searches are silent (corpses still rustle). */
export const SEARCH_NOISE_M = 8;
export function searchNoiseRadius(perks: readonly string[], isContainer: boolean): number {
  if (has(perks, 'gh_patient')) return 0;
  if (isContainer && has(perks, 'gh_lootghost')) return 0;
  return SEARCH_NOISE_M * perkNum(perks, 'searchNoiseMult', 1);
}

/** Forced-entry noise (smashing a locked container open): the
 *  forced_entry class radius, scaled by Locksmith. */
export function forcedEntryNoiseRadius(perks: readonly string[], classRadius: number): number {
  return classRadius * perkNum(perks, 'forcedEntryNoiseMult', 1);
}

// -------------------------------------------------------------- mechanics --

/** Vehicle repair parts cost after Grease Monkey (−1, min 1). */
export function vehicleRepairCost(baseQty: number, perks: readonly string[]): number {
  if (!has(perks, 'me_grease')) return baseQty;
  return Math.max(1, baseQty + perkNum(perks, 'repairCostBonus', 0));
}

/** Field-repair condition cap (fraction of 1): repairs done away from
 *  a workshop/garage stop here. Jury-Rig raises 60% → 80%. */
export function fieldRepairCap(perks: readonly string[]): number {
  return has(perks, 'me_juryrig') ? perkNum(perks, 'fieldRepairCap', 0.6) : 0.6;
}

/** Gun-parts cost to attach (or refund on detach) a mod. Gunsmith
 *  halves it, min 1 — attach and detach use the SAME formula, which
 *  is what makes the spec's "detach returns the cost" true. */
export function modPartCost(baseCost: number, perks: readonly string[]): number {
  if (!has(perks, 'me_gunsmith')) return baseCost;
  return Math.max(1, Math.ceil(baseCost * perkNum(perks, 'modCostMult', 1)));
}

/** Timed-craft duration scale. Tinkerer: craftSpeedMult 1.25 → jobs
 *  take 1/1.25 the time. Fabricator: Machine Shop ('industrial')
 *  fabrication takes a further ×0.6. */
export function craftTimeMult(perks: readonly string[], station: string | null | undefined): number {
  let m = 1;
  if (has(perks, 'me_tinkerer')) m /= perkNum(perks, 'craftSpeedMult', 1);
  if (station === 'industrial' && has(perks, 'me_fabricator')) {
    m *= perkNum(perks, 'fabTimeMult', 1);
  }
  return m;
}

/** Disassembly yields after Salvager (+1 to the FIRST material, per
 *  spec §6.2) and Scrounger (+1 gun_parts — merged into an existing
 *  gun_parts yield when there is one, else added). Pure: the input
 *  array and its entries are not mutated. */
export function disassemblyYields(
  base: readonly { itemId: string; qty: number }[],
  perks: readonly string[],
): { itemId: string; qty: number }[] {
  const out = base.map((y) => ({ ...y }));
  if (out.length === 0) return out;
  if (has(perks, 'sc_salvager')) {
    out[0] = { ...out[0], qty: out[0].qty + perkNum(perks, 'disasmBonus', 0) };
  }
  if (has(perks, 'me_scrounger')) {
    const bonus = perkNum(perks, 'gunPartsBonus', 0);
    const gp = out.find((y) => y.itemId === 'gun_parts');
    if (gp) gp.qty += bonus;
    else if (bonus > 0) out.push({ itemId: 'gun_parts', qty: bonus });
  }
  return out;
}

// ----------------------------------------------------------------- ghost --

/** Seconds a husk must go without seeing the player before it drops
 *  from hunt/attack to investigate. Vanish: breaking line of sight
 *  works 2× faster (6s → 3s). */
export const LOSE_SIGHT_SEC = 6;
export function loseSightSec(perks: readonly string[]): number {
  return LOSE_SIGHT_SEC / perkNum(perks, 'losBreakMult', 1);
}

/** Extra flashbang blind radius (Vanish). */
export function flashRadiusBonus(perks: readonly string[]): number {
  return has(perks, 'gh_vanish') ? perkNum(perks, 'flashRadiusBonus', 0) : 0;
}

/** Alarm-trip probability (Loot Ghost: alarms trip half as often
 *  against you). At the trip site the alarm fires only when
 *  rng() < this value; 1 = always trips (the pre-perk behavior). */
export function alarmTripMult(perks: readonly string[]): number {
  return perkNum(perks, 'alarmMult', 1);
}
