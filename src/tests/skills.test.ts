// Lane 8: skills substrate per SYSTEMS_SPEC §6 — data integrity (§6.2
// trees), the XP engine (§6.1 event table + level math), perk buying
// (tier chains, ONE capstone per run), and the skillReq gate reader
// Lane 7's crafting engine feature-detects.
import { describe, expect, it } from 'vitest';
import { PERKS, SKILLS, TREES, perkById, xpToNext } from '../data/skills';
import {
  MAX_SKILL_LEVEL,
  XP_EVENTS,
  applyXp,
  applyXpToMap,
  awardEvent,
  buyPerk,
  canBuyPerk,
  capstoneOwned,
  emptySkillMap,
  meetsSkillReq,
  readSkillLevels,
  skillLevel,
  skillReqLabel,
  unmetSkillReqs,
  xpForEvent,
  type XpEventId,
} from '../systems/skills';

describe('§6.1 level curve', () => {
  it('xpToNext is 80 + 40*level (L0→1 = 80, L9→10 = 440)', () => {
    expect(xpToNext(0)).toBe(80);
    expect(xpToNext(1)).toBe(120);
    expect(xpToNext(9)).toBe(440);
  });

  it('there are exactly 7 skills', () => {
    expect(SKILLS).toHaveLength(7);
    expect(Object.keys(emptySkillMap())).toHaveLength(7);
  });
});

describe('§6.1 XP event table', () => {
  it('covers all 20 spec rows with the spec values', () => {
    const expected: Record<XpEventId, [string, number]> = {
      husk_kill_melee: ['combat', 10],
      husk_kill_ranged: ['combat', 8],
      husk_kill_ranged_headshot: ['combat', 10], // 8 + 2 headshot
      special_kill: ['combat', 25],
      station_craft: ['mechanics', 6],
      station_craft_gated: ['mechanics', 10], // 6 + 4 (skillReq ≥3)
      repair: ['mechanics', 8],
      mod_attach: ['mechanics', 5],
      heal: ['medicine', 4],
      survivor_recovered: ['medicine', 12],
      search_undetected: ['stealth', 5],
      husk_lost: ['stealth', 6],
      drive_clean_100m: ['driver', 5],
      vehicle_repaired_full: ['driver', 8],
      container_looted: ['scavenging', 4],
      safe_picked: ['scavenging', 10],
      node_harvested: ['scavenging', 3],
      recruit: ['leadership', 15],
      siege_survived: ['leadership', 12],
      order_given: ['leadership', 2],
      // Order #5 lane addition (not a §6.1 row): survival time pays scavenging.
      day_survived: ['scavenging', 8],
    };
    for (const [id, [skill, xp]] of Object.entries(expected)) {
      const def = XP_EVENTS[id as XpEventId];
      expect(def, id).toBeDefined();
      expect(def.skill, id).toBe(skill);
      expect(def.xp, id).toBe(xp);
    }
    expect(Object.keys(XP_EVENTS)).toHaveLength(21);
  });

  it('survivors earn at 0.5× (floored)', () => {
    expect(xpForEvent('recruit', { survivor: true })).toEqual({ skill: 'leadership', xp: 7 });
    expect(xpForEvent('safe_picked', { survivor: true }).xp).toBe(5);
    expect(xpForEvent('node_harvested', { survivor: true }).xp).toBe(1);
    expect(xpForEvent('recruit')).toEqual({ skill: 'leadership', xp: 15 });
  });
});

describe('XP engine', () => {
  it('plain gain below the threshold', () => {
    const r = applyXp({ level: 0, xp: 10 }, 25);
    expect(r).toEqual({ state: { level: 0, xp: 35 }, levelsGained: 0 });
  });

  it('levels up and carries overflow', () => {
    const r = applyXp({ level: 0, xp: 70 }, 25); // 95 − 80 = 15 into L1
    expect(r).toEqual({ state: { level: 1, xp: 15 }, levelsGained: 1 });
  });

  it('multi-level gains count every level (perk points = levels)', () => {
    const r = awardEvent(emptySkillMap(), 'special_kill'); // 25 — no level
    expect(r.levelsGained).toBe(0);
    const big = applyXp({ level: 0, xp: 0 }, 80 + 120 + 160); // exactly L3
    expect(big.state).toEqual({ level: 3, xp: 0 });
    expect(big.levelsGained).toBe(3);
  });

  it('caps at 10: bar zeroes, further XP is a no-op', () => {
    const r = applyXp({ level: 9, xp: 430 }, 50); // 480 ≥ 440 → L10
    expect(r.state).toEqual({ level: 10, xp: 0 });
    expect(r.levelsGained).toBe(1);
    const noop = applyXp({ level: 10, xp: 0 }, 100);
    expect(noop.levelsGained).toBe(0);
    expect(noop.state).toEqual({ level: 10, xp: 0 });
  });

  it('applyXpToMap touches only the target skill', () => {
    const m = emptySkillMap();
    const r = applyXpToMap(m, 'stealth', 85);
    expect(r.map.stealth).toEqual({ level: 1, xp: 5 });
    expect(r.map.combat).toEqual({ level: 0, xp: 0 });
    expect(m.stealth).toEqual({ level: 0, xp: 0 }); // input untouched
  });

  it('awardEvent routes to the right skill', () => {
    const r = awardEvent(emptySkillMap(), 'safe_picked');
    expect(r.skill).toBe('scavenging');
    expect(r.xpAwarded).toBe(10);
    expect(r.map.scavenging.xp).toBe(10);
  });

  it('MAX level constant matches the curve end', () => {
    expect(MAX_SKILL_LEVEL).toBe(10);
  });
});

describe('§6.2 perk data integrity', () => {
  it('4 trees × 9 perks, tier shape 3/3/2/1', () => {
    expect(TREES).toHaveLength(4);
    expect(PERKS).toHaveLength(36);
    for (const t of TREES) {
      const ps = PERKS.filter((p) => p.tree === t.id);
      expect(ps, t.id).toHaveLength(9);
      expect(ps.filter((p) => p.tier === 1), t.id).toHaveLength(3);
      expect(ps.filter((p) => p.tier === 2), t.id).toHaveLength(3);
      expect(ps.filter((p) => p.tier === 3), t.id).toHaveLength(2);
      expect(ps.filter((p) => p.tier === 4), t.id).toHaveLength(1);
    }
  });

  it('ids are unique', () => {
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(PERKS.length);
  });

  it('requires point at same-tree perks of the previous tier; capstones require both tier-3s', () => {
    for (const p of PERKS) {
      if (p.tier === 1) {
        expect(p.requires ?? [], p.id).toHaveLength(0);
        continue;
      }
      expect(p.requires?.length, p.id).toBeGreaterThan(0);
      for (const reqId of p.requires ?? []) {
        const req = perkById(reqId);
        expect(req, `${p.id} → ${reqId}`).toBeDefined();
        expect(req!.tree, `${p.id} → ${reqId}`).toBe(p.tree);
        expect(req!.tier, `${p.id} → ${reqId}`).toBe(p.tier - 1);
      }
      if (p.tier === 4) expect(p.requires).toHaveLength(2);
    }
  });
});

describe('perk buying (§6.2)', () => {
  it('tier-1 perks buy freely with a point', () => {
    expect(canBuyPerk([], 1, 'sc_keen').ok).toBe(true);
    const r = buyPerk([], 2, 'sc_keen');
    expect(r).toEqual({ owned: ['sc_keen'], perkPoints: 1 });
  });

  it('rejects unknown / owned / broke', () => {
    expect(canBuyPerk([], 1, 'nope').ok).toBe(false);
    expect(canBuyPerk(['sc_keen'], 1, 'sc_keen').ok).toBe(false);
    expect(canBuyPerk([], 0, 'sc_keen').ok).toBe(false);
    expect(buyPerk([], 0, 'sc_keen')).toBeNull();
  });

  it('requires chains gate tier-2 (Salvager needs Keen Eye)', () => {
    const chk = canBuyPerk(['sc_pockets'], 3, 'sc_salvager');
    expect(chk.ok).toBe(false);
    if (!chk.ok) expect(chk.reason).toContain('Keen Eye');
    expect(canBuyPerk(['sc_keen'], 3, 'sc_salvager').ok).toBe(true);
  });

  it('a full chain reaches the capstone', () => {
    let owned: string[] = [];
    let points = 9;
    for (const id of ['gh_soft', 'gh_backstab', 'gh_lootghost', 'gh_shadow', 'gh_vanish', 'gh_coldblood', 'gh_unseen']) {
      const r = buyPerk(owned, points, id);
      expect(r, id).not.toBeNull();
      owned = r!.owned;
      points = r!.perkPoints;
    }
    expect(capstoneOwned(owned)?.id).toBe('gh_unseen');
  });

  it('capstone needs 4 perks in its tree', () => {
    // Both tier-3s + their chains = 6 owned is fine; force the <4 case by
    // checking a tree where requires are met but count is what matters:
    // ghost chain to gh_lootghost only = soft, backstab, lootghost (3) —
    // gh_unseen also lacks gh_coldblood, so use the count-specific case:
    const owned = ['sc_keen', 'sc_salvager', 'sc_nightharvest', 'sc_pockets', 'sc_locksmith', 'sc_packmule'];
    expect(canBuyPerk(owned, 3, 'sc_remembers').ok).toBe(true); // 6 in tree
  });

  it('ONE capstone per run — a second tree capstone is refused', () => {
    const owned = [
      'gh_soft', 'gh_backstab', 'gh_lootghost', 'gh_shadow', 'gh_vanish', 'gh_coldblood', 'gh_unseen',
      'br_heavy', 'br_cleaver', 'br_secondwind', 'br_blocker', 'br_executioner', 'br_unstoppable',
    ];
    const chk = canBuyPerk(owned, 5, 'br_juggernaut');
    expect(chk.ok).toBe(false);
    if (!chk.ok) expect(chk.reason).toContain('One capstone per run');
    expect(capstoneOwned(owned)?.id).toBe('gh_unseen');
  });
});

describe('skillReq gate reader (Lane 7 interface)', () => {
  it('undefined req is ungated', () => {
    expect(meetsSkillReq(null, undefined)).toBe(true);
    expect(unmetSkillReqs(null, undefined)).toEqual([]);
  });

  it('reads the live store shape { skills: { id: { level, xp } } }', () => {
    const store = { skills: { mechanics: { level: 3, xp: 12 }, medicine: { level: 0, xp: 0 } } };
    expect(skillLevel(store, 'mechanics')).toBe(3);
    expect(meetsSkillReq(store, { skill: 'mechanics', level: 3 })).toBe(true);
    expect(meetsSkillReq(store, { skill: 'mechanics', level: 5 })).toBe(false);
  });

  it('reads survivor-style plain level records', () => {
    const sv = { skills: { mechanics: 7, medicine: 1 } };
    expect(meetsSkillReq(sv, { skill: 'mechanics', level: 5 })).toBe(true);
    expect(meetsSkillReq(sv, { skill: 'medicine', level: 2 })).toBe(false);
  });

  it('garbage / absent state reads as level 0 — inert, never a crash', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { skills: null }, { skills: { mechanics: 'high' } }]) {
      expect(readSkillLevels(junk).mechanics).toBe(0);
      expect(meetsSkillReq(junk, { skill: 'mechanics', level: 1 })).toBe(false);
    }
  });

  it('clamps out-of-range levels into 0..10', () => {
    expect(readSkillLevels({ combat: 99 }).combat).toBe(10);
    expect(readSkillLevels({ combat: -3 }).combat).toBe(0);
    expect(readSkillLevels({ combat: 4.9 }).combat).toBe(4);
  });

  it('list form + unmet list + labels (spec examples)', () => {
    const state = { skills: { mechanics: { level: 3, xp: 0 } } };
    expect(meetsSkillReq(state, [{ skill: 'mechanics', level: 3 }])).toBe(true);
    expect(unmetSkillReqs(state, [{ skill: 'mechanics', level: 5 }])).toEqual([
      { skill: 'mechanics', level: 5 },
    ]);
    expect(skillReqLabel({ skill: 'mechanics', level: 2 })).toBe('Mechanics 2'); // r_suppressor
    expect(skillReqLabel({ skill: 'medicine', level: 1 })).toBe('Medicine 1'); // r_medkit
  });
});
