// systems/skills.ts — the §6 skills ENGINE (Lane 8).
//
// Pure, store-agnostic implementation of SYSTEMS_SPEC §6:
//   §6.1  XP-by-use: the full event table + level math (xpToNext =
//         80 + 40*level, cap 10, 1 perk point per level gained).
//   §6.2  Perk application: tier chains (PerkDef.requires), capstone
//         rules (>=4 perks in the tree, ONE capstone per run).
//   §6.1  Recipe skillReq gates: a feature-detect reader Lane 7's
//         crafting engine imports — it accepts the live store shape,
//         a plain SkillMap, or nothing at all (levels read as 0), so
//         gates are simply inert until skill state is wired in.
//
// The zustand store (gameStore.ts, Lane 5's surface) still carries an
// inline copy of the level math + buy gate; INTEGRATION STEP (Lane 5):
// re-implement addSkillXp/buyPerk as thin wrappers over applyXp /
// canBuyPerk / buyPerk here so there is exactly one rulebook.

import {
  PERKS,
  SKILLS,
  perkById,
  xpToNext,
  type PerkDef,
  type SkillId,
} from '../data/skills';

export { xpToNext };
export type { PerkDef, SkillId };

export const MAX_SKILL_LEVEL = 10;
export const SKILL_IDS: readonly SkillId[] = SKILLS.map((s) => s.id);

// ---------------------------------------------------------------- §6.1 XP --

export interface SkillState {
  level: number; // 0–10
  xp: number; // progress toward next level
}

export type SkillMap = Record<SkillId, SkillState>;

export function emptySkillState(): SkillState {
  return { level: 0, xp: 0 };
}

export function emptySkillMap(): SkillMap {
  return Object.fromEntries(SKILL_IDS.map((id) => [id, emptySkillState()])) as SkillMap;
}

/** The §6.1 feed rules, verbatim. `station_craft_gated` is the station
 *  craft row with its "+4 if skillReq ≥3" bonus folded in (10 = 6 + 4);
 *  `husk_kill_ranged_headshot` folds the "+2 headshot" bonus (10 = 8 + 2).
 *  Special-husk kill REPLACES the base kill award (25, not 25 + 8). */
export type XpEventId =
  | 'husk_kill_melee'
  | 'husk_kill_ranged'
  | 'husk_kill_ranged_headshot'
  | 'special_kill'
  | 'station_craft'
  | 'station_craft_gated'
  | 'repair'
  | 'mod_attach'
  | 'heal'
  | 'survivor_recovered'
  | 'search_undetected'
  | 'husk_lost'
  | 'drive_clean_100m'
  | 'vehicle_repaired_full'
  | 'container_looted'
  | 'safe_picked'
  | 'node_harvested'
  | 'recruit'
  | 'siege_survived'
  | 'order_given';

export interface XpEventDef {
  skill: SkillId;
  xp: number;
  label: string;
}

export const XP_EVENTS: Record<XpEventId, XpEventDef> = {
  husk_kill_melee: { skill: 'combat', xp: 10, label: 'Husk kill, melee' },
  husk_kill_ranged: { skill: 'combat', xp: 8, label: 'Husk kill, ranged' },
  husk_kill_ranged_headshot: { skill: 'combat', xp: 10, label: 'Husk kill, ranged headshot (8 + 2)' },
  special_kill: { skill: 'combat', xp: 25, label: 'Special-husk kill' },
  station_craft: { skill: 'mechanics', xp: 6, label: 'Craft at station (per recipe)' },
  station_craft_gated: { skill: 'mechanics', xp: 10, label: 'Craft at station, skillReq ≥3 recipe (6 + 4)' },
  repair: { skill: 'mechanics', xp: 8, label: 'Successful repair' },
  mod_attach: { skill: 'mechanics', xp: 5, label: 'Mod attach' },
  heal: { skill: 'medicine', xp: 4, label: 'Heal with bandage/medkit' },
  survivor_recovered: { skill: 'medicine', xp: 12, label: 'Survivor recovered from injury' },
  search_undetected: { skill: 'stealth', xp: 5, label: 'Container searched undetected' },
  husk_lost: { skill: 'stealth', xp: 6, label: 'Husk lost (broke line of sight)' },
  drive_clean_100m: { skill: 'driver', xp: 5, label: '100m driven without damage' },
  vehicle_repaired_full: { skill: 'driver', xp: 8, label: 'Vehicle repaired to 100' },
  container_looted: { skill: 'scavenging', xp: 4, label: 'Container looted' },
  safe_picked: { skill: 'scavenging', xp: 10, label: 'Safe/locker picked' },
  node_harvested: { skill: 'scavenging', xp: 3, label: 'Node harvested' },
  recruit: { skill: 'leadership', xp: 15, label: 'Survivor recruited' },
  siege_survived: { skill: 'leadership', xp: 12, label: 'Siege survived (present)' },
  order_given: { skill: 'leadership', xp: 2, label: 'Order given (job assign)' },
};

/** Survivors earn from the same table at half rate (§6.1). */
export const SURVIVOR_XP_MULT = 0.5;

export function xpForEvent(
  id: XpEventId,
  opts?: { survivor?: boolean },
): { skill: SkillId; xp: number } {
  const def = XP_EVENTS[id];
  const xp = opts?.survivor ? Math.floor(def.xp * SURVIVOR_XP_MULT) : def.xp;
  return { skill: def.skill, xp };
}

/** Add XP to one skill. Mirrors the store's live semantics exactly:
 *  no-op at level cap; overflow carries; hitting 10 zeroes the bar. */
export function applyXp(
  state: SkillState,
  amt: number,
): { state: SkillState; levelsGained: number } {
  if (amt <= 0 || state.level >= MAX_SKILL_LEVEL) return { state, levelsGained: 0 };
  let { level, xp } = state;
  xp += amt;
  let gained = 0;
  while (level < MAX_SKILL_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    gained++;
  }
  if (level >= MAX_SKILL_LEVEL) xp = 0;
  return { state: { level, xp }, levelsGained: gained };
}

export function applyXpToMap(
  map: SkillMap,
  skill: SkillId,
  amt: number,
): { map: SkillMap; levelsGained: number } {
  const cur = map[skill] ?? emptySkillState();
  const r = applyXp(cur, amt);
  if (r.levelsGained === 0 && r.state === cur) return { map, levelsGained: 0 };
  return { map: { ...map, [skill]: r.state }, levelsGained: r.levelsGained };
}

/** Award a §6.1 event to a skill map. `perkPointsEarned` === levelsGained
 *  (1 point per level, player only — survivor maps just level). */
export function awardEvent(
  map: SkillMap,
  id: XpEventId,
  opts?: { survivor?: boolean },
): { map: SkillMap; skill: SkillId; xpAwarded: number; levelsGained: number } {
  const { skill, xp } = xpForEvent(id, opts);
  const r = applyXpToMap(map, skill, xp);
  return { map: r.map, skill, xpAwarded: xp, levelsGained: r.levelsGained };
}

// ------------------------------------------------------- §6.2 perk buying --

export type BuyCheck = { ok: true } | { ok: false; reason: string };

/** The capstone (tier 4) the player already holds, if any — at most one
 *  can ever exist in `owned` if buying went through canBuyPerk. */
export function capstoneOwned(owned: readonly string[]): PerkDef | undefined {
  return PERKS.find((p) => p.tier === 4 && owned.includes(p.id));
}

export function perksInTree(owned: readonly string[], tree: PerkDef['tree']): PerkDef[] {
  return PERKS.filter((p) => p.tree === tree && owned.includes(p.id));
}

/** Single rulebook for learning a perk. Mirrors the store's live gate
 *  (tier chain + capstone needs 4 in-tree + one capstone per run) and
 *  adds the §6.2 `requires` chains from the data table. */
export function canBuyPerk(
  owned: readonly string[],
  perkPoints: number,
  perkId: string,
): BuyCheck {
  const def = perkById(perkId);
  if (!def) return { ok: false, reason: 'Unknown perk.' };
  if (owned.includes(perkId)) return { ok: false, reason: 'Already learned.' };
  if (perkPoints < 1) return { ok: false, reason: 'No perk points — earn skill levels first.' };
  for (const reqId of def.requires ?? []) {
    if (!owned.includes(reqId)) {
      const req = perkById(reqId);
      return { ok: false, reason: `Learn ${req ? req.name : reqId} first.` };
    }
  }
  if (def.tier === 4) {
    if (perksInTree(owned, def.tree).length < 4) {
      return { ok: false, reason: 'A capstone needs 4 perks in its tree first.' };
    }
    const held = capstoneOwned(owned);
    if (held && held.id !== def.id) {
      return { ok: false, reason: 'One capstone per run — this is who you are now.' };
    }
  } else if (def.tier > 1) {
    const hasPrevTier = PERKS.some(
      (p) => p.tree === def.tree && p.tier === def.tier - 1 && owned.includes(p.id),
    );
    if (!hasPrevTier) {
      return { ok: false, reason: `Learn a tier ${def.tier - 1} perk in this tree first.` };
    }
  }
  return { ok: true };
}

/** Pure buy: returns the new owned list + remaining points, or null when
 *  canBuyPerk rejects. */
export function buyPerk(
  owned: readonly string[],
  perkPoints: number,
  perkId: string,
): { owned: string[]; perkPoints: number } | null {
  if (!canBuyPerk(owned, perkPoints, perkId).ok) return null;
  return { owned: [...owned, perkId], perkPoints: perkPoints - 1 };
}

// ------------------------------------------------- §6.1 recipe skillReq --

/** A crafting gate, as declared on recipes (data/items.ts, Lane 6):
 *    skillReq?: { skill: SkillId; level: number }
 *  Spec examples: r_suppressor → mechanics 2 · r_carbine → mechanics 3 ·
 *  r_medkit → medicine 1 · r_turret → mechanics 5 (+ a blueprint flag,
 *  which is NOT a skill gate and stays with the recipe). Rule (§6.1):
 *  T1 recipes have no gate; T2+ always has one. */
export interface SkillReq {
  skill: SkillId;
  level: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

/** Feature-detect skill levels out of ANY plausible state source:
 *   - the live store / a SkillMap: { skills: { combat: { level, xp } } }
 *   - a survivor-style record:      { skills: { combat: 7 } }
 *   - a bare level record:          { combat: 7 }
 *   - null/undefined/garbage → all zeros (gates read as unmet, systems
 *     that feature-detect stay inert — never a crash). */
export function readSkillLevels(source: unknown): Record<SkillId, number> {
  const out = Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
  if (!isRecord(source)) return out;
  const bag: unknown = isRecord(source.skills) ? source.skills : source;
  if (!isRecord(bag)) return out;
  for (const id of SKILL_IDS) {
    const v = bag[id];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[id] = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.floor(v)));
    } else if (isRecord(v) && typeof v.level === 'number' && Number.isFinite(v.level)) {
      out[id] = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.floor(v.level)));
    }
  }
  return out;
}

export function skillLevel(source: unknown, skill: SkillId): number {
  return readSkillLevels(source)[skill];
}

function reqList(req: SkillReq | readonly SkillReq[]): SkillReq[] {
  return Array.isArray(req) ? [...(req as readonly SkillReq[])] : [req as SkillReq];
}

/** The Lane 7 activation interface: pass the recipe's skillReq (single,
 *  list, or undefined) and any state source. Undefined req = ungated =
 *  always craftable (the T1 rule). */
export function meetsSkillReq(
  source: unknown,
  req: SkillReq | readonly SkillReq[] | undefined,
): boolean {
  if (!req) return true;
  const levels = readSkillLevels(source);
  return reqList(req).every((r) => (levels[r.skill] ?? 0) >= r.level);
}

/** Every unmet gate, for UI denial text ("Needs Mechanics 3"). */
export function unmetSkillReqs(
  source: unknown,
  req: SkillReq | readonly SkillReq[] | undefined,
): SkillReq[] {
  if (!req) return [];
  const levels = readSkillLevels(source);
  return reqList(req).filter((r) => (levels[r.skill] ?? 0) < r.level);
}

export function skillReqLabel(req: SkillReq): string {
  const name = SKILLS.find((s) => s.id === req.skill)?.name ?? req.skill;
  return `${name} ${req.level}`;
}
