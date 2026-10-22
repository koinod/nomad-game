// Order #5 Phase B: per-perk effect pins. Every perk in the tree has a
// measured derivation in systems/perkEffects.ts (or, for the visibility
// family, game/visibility.ts) — each test below changes the owned list
// by exactly one perk and asserts the quantity that perk promises.
import { describe, expect, it } from 'vitest';
import {
  BLOCK_HIT_STAMINA,
  HUSK_HIT_SHOVE_M,
  LOSE_SIGHT_SEC,
  SEARCH_NOISE_M,
  alarmTripMult,
  blockHitStaminaCost,
  blockThroughFactor,
  carryBonusKg,
  cleaveBonus,
  craftTimeMult,
  disassemblyYields,
  fieldRepairCap,
  flashRadiusBonus,
  forcedEntryNoiseRadius,
  heavyShiftKg,
  knockbackTakenMult,
  lootChanceMult,
  loseSightSec,
  meleeDamageMult,
  modPartCost,
  rareLootMult,
  respawnClockMult,
  searchDurationMult,
  searchNoiseRadius,
  swingDurationMult,
  vehicleRepairCost,
} from '../systems/perkEffects';
import { perkRowState } from '../systems/skills';

const calm = { hpFrac: 1, targetStunned: false, behindOrUnaware: false };

describe('brawler derivations', () => {
  it('br_heavy: melee damage ×1.15, and only with the perk', () => {
    expect(meleeDamageMult([], calm)).toBe(1);
    expect(meleeDamageMult(['br_heavy'], calm)).toBeCloseTo(1.15);
  });

  it('br_cleaver: +1 cleave target', () => {
    expect(cleaveBonus([])).toBe(0);
    expect(cleaveBonus(['br_cleaver'])).toBe(1);
  });

  it('br_executioner: ×1.5 only against stunned targets', () => {
    expect(meleeDamageMult(['br_executioner'], calm)).toBe(1);
    expect(meleeDamageMult(['br_executioner'], { ...calm, targetStunned: true })).toBeCloseTo(1.5);
  });

  it('br_juggernaut: ×1.3 only below 50% hp', () => {
    expect(meleeDamageMult(['br_juggernaut'], { ...calm, hpFrac: 0.49 })).toBeCloseTo(1.3);
    expect(meleeDamageMult(['br_juggernaut'], { ...calm, hpFrac: 0.5 })).toBe(1);
  });

  it('br_blocker: block lets 0.15 through instead of 0.25, and a blocked hit costs 6 stamina instead of 10', () => {
    expect(blockThroughFactor([])).toBe(0.25);
    expect(blockThroughFactor(['br_blocker'])).toBeCloseTo(0.15);
    expect(blockHitStaminaCost([])).toBe(BLOCK_HIT_STAMINA);
    expect(blockHitStaminaCost(['br_blocker'])).toBe(6);
  });

  it('br_adrenaline: an active kill-streak scales swing duration by 1/1.2', () => {
    expect(swingDurationMult(['br_adrenaline'], false)).toBe(1);
    expect(swingDurationMult([], true)).toBe(1);
    expect(swingDurationMult(['br_adrenaline'], true)).toBeCloseTo(1 / 1.2);
  });

  it('br_unstoppable: knockback taken is halved', () => {
    expect(knockbackTakenMult([])).toBe(1);
    expect(knockbackTakenMult(['br_unstoppable'])).toBe(0.5);
    expect(HUSK_HIT_SHOVE_M * knockbackTakenMult(['br_unstoppable'])).toBeCloseTo(0.225);
  });
});

describe('scavenger derivations', () => {
  it('sc_keen: loot chance ×1.1', () => {
    expect(lootChanceMult([], false)).toBe(1);
    expect(lootChanceMult(['sc_keen'], false)).toBeCloseTo(1.1);
  });

  it('sc_nightharvest: night loot ×1.15 more, day unchanged', () => {
    expect(lootChanceMult(['sc_nightharvest'], false)).toBe(1);
    expect(lootChanceMult(['sc_nightharvest'], true)).toBeCloseTo(1.15);
    expect(lootChanceMult(['sc_keen', 'sc_nightharvest'], true)).toBeCloseTo(1.1 * 1.15);
  });

  it('sc_remembers: rare entries (chance ≤ 0.35) gain ×1.1; common entries do not', () => {
    expect(rareLootMult([], 0.2)).toBe(1);
    expect(rareLootMult(['sc_remembers'], 0.2)).toBeCloseTo(1.1);
    expect(rareLootMult(['sc_remembers'], 0.35)).toBeCloseTo(1.1);
    expect(rareLootMult(['sc_remembers'], 0.8)).toBe(1);
  });

  it('sc_remembers: respawn clocks run at 0.75×', () => {
    expect(respawnClockMult([])).toBe(1);
    expect(respawnClockMult(['sc_remembers'])).toBe(0.75);
  });

  it('sc_packmule: +8kg carry and the heavy tier starts 10kg later', () => {
    expect(carryBonusKg([])).toBe(0);
    expect(carryBonusKg(['sc_packmule'])).toBe(8);
    expect(heavyShiftKg([])).toBe(0);
    expect(heavyShiftKg(['sc_packmule'])).toBe(10);
  });

  it('sc_fingers: search takes 0.75× the time and makes 0.75× the noise', () => {
    expect(searchDurationMult([])).toBe(1);
    expect(searchDurationMult(['sc_fingers'])).toBe(0.75);
    expect(searchNoiseRadius([], true)).toBe(SEARCH_NOISE_M);
    expect(searchNoiseRadius(['sc_fingers'], true)).toBe(SEARCH_NOISE_M * 0.75);
  });

  it('sc_locksmith: forced entry makes half the class noise', () => {
    expect(forcedEntryNoiseRadius([], 45)).toBe(45);
    expect(forcedEntryNoiseRadius(['sc_locksmith'], 45)).toBe(22.5);
  });

  it('sc_salvager: disassembly pays +1 of the first material', () => {
    const base = [
      { itemId: 'scrap', qty: 2 },
      { itemId: 'gun_parts', qty: 1 },
    ];
    expect(disassemblyYields(base, [])).toEqual(base);
    expect(disassemblyYields(base, ['sc_salvager'])).toEqual([
      { itemId: 'scrap', qty: 3 },
      { itemId: 'gun_parts', qty: 1 },
    ]);
    // input is not mutated
    expect(base[0].qty).toBe(2);
  });
});

describe('mechanic derivations', () => {
  it('me_grease: vehicle repair costs 1 fewer part, min 1', () => {
    expect(vehicleRepairCost(2, [])).toBe(2);
    expect(vehicleRepairCost(2, ['me_grease'])).toBe(1);
    expect(vehicleRepairCost(1, ['me_grease'])).toBe(1);
  });

  it('me_juryrig: field repair cap 0.6 → 0.8', () => {
    expect(fieldRepairCap([])).toBe(0.6);
    expect(fieldRepairCap(['me_juryrig'])).toBe(0.8);
  });

  it('me_gunsmith: attach cost halves (min 1) and detach refunds the same formula', () => {
    expect(modPartCost(4, [])).toBe(4);
    expect(modPartCost(4, ['me_gunsmith'])).toBe(2);
    expect(modPartCost(3, ['me_gunsmith'])).toBe(2); // ceil(1.5)
    expect(modPartCost(1, ['me_gunsmith'])).toBe(1);
  });

  it('me_tinkerer: timed crafts take 1/1.25 the time, any station', () => {
    expect(craftTimeMult([], 'workbench')).toBe(1);
    expect(craftTimeMult(['me_tinkerer'], 'workbench')).toBeCloseTo(0.8);
    expect(craftTimeMult(['me_tinkerer'], null)).toBeCloseTo(0.8);
  });

  it('me_fabricator: Machine Shop (industrial) fabrication takes a further ×0.6; other stations do not', () => {
    expect(craftTimeMult(['me_fabricator'], 'industrial')).toBeCloseTo(0.6);
    expect(craftTimeMult(['me_fabricator'], 'workbench')).toBe(1);
    expect(craftTimeMult(['me_tinkerer', 'me_fabricator'], 'industrial')).toBeCloseTo(0.48);
  });

  it('me_scrounger: disassembly pays +1 gun_parts (merged or added)', () => {
    expect(disassemblyYields([{ itemId: 'scrap', qty: 2 }], ['me_scrounger'])).toEqual([
      { itemId: 'scrap', qty: 2 },
      { itemId: 'gun_parts', qty: 1 },
    ]);
    expect(
      disassemblyYields([{ itemId: 'gun_parts', qty: 1 }], ['me_scrounger']),
    ).toEqual([{ itemId: 'gun_parts', qty: 2 }]);
  });

  it('salvager + scrounger stack on the same strip', () => {
    expect(
      disassemblyYields([{ itemId: 'scrap', qty: 1 }], ['sc_salvager', 'me_scrounger']),
    ).toEqual([
      { itemId: 'scrap', qty: 2 },
      { itemId: 'gun_parts', qty: 1 },
    ]);
  });
});

describe('ghost derivations', () => {
  it('gh_patient: searching makes no noise at all', () => {
    expect(searchNoiseRadius(['gh_patient'], true)).toBe(0);
    expect(searchNoiseRadius(['gh_patient'], false)).toBe(0);
  });

  it('gh_lootghost: container searches are silent, corpse searches still rustle; alarms trip at half probability', () => {
    expect(searchNoiseRadius(['gh_lootghost'], true)).toBe(0);
    expect(searchNoiseRadius(['gh_lootghost'], false)).toBe(SEARCH_NOISE_M);
    expect(alarmTripMult([])).toBe(1);
    expect(alarmTripMult(['gh_lootghost'])).toBe(0.5);
  });

  it('gh_vanish: line-of-sight breaks in half the time; flashbangs blind +4m wider', () => {
    expect(loseSightSec([])).toBe(LOSE_SIGHT_SEC);
    expect(loseSightSec(['gh_vanish'])).toBe(3);
    expect(flashRadiusBonus([])).toBe(0);
    expect(flashRadiusBonus(['gh_vanish'])).toBe(4);
  });

  it('gh_backstab: ×3 from behind / unaware (via the shared melee derivation)', () => {
    expect(meleeDamageMult(['gh_backstab'], { ...calm, behindOrUnaware: true })).toBe(3);
    expect(meleeDamageMult(['gh_backstab'], calm)).toBe(1);
  });
});

describe('UI derivation (perkRowState)', () => {
  it('owned wins over every other state', () => {
    expect(perkRowState(['sc_keen'], 0, 'sc_keen')).toEqual({ state: 'owned' });
  });

  it('available when the engine gate passes', () => {
    expect(perkRowState([], 1, 'sc_keen')).toEqual({ state: 'available' });
  });

  it('locked carries the engine reason (no points)', () => {
    const r = perkRowState([], 0, 'sc_keen');
    expect(r.state).toBe('locked');
    if (r.state === 'locked') expect(r.reason).toMatch(/perk point/i);
  });

  it('locked carries the engine reason (missing prerequisite)', () => {
    const r = perkRowState([], 1, 'sc_salvager'); // requires sc_keen
    expect(r.state).toBe('locked');
    if (r.state === 'locked') expect(r.reason).toMatch(/Keen Eye/);
  });

  it('capstone lock reasons surface through the same derivation', () => {
    const r = perkRowState(['sc_keen', 'sc_pockets'], 1, 'sc_remembers');
    expect(r.state).toBe('locked');
  });
});
