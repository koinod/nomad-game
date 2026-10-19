// Pure unit tests for inventory math (no DOM).
import { describe, expect, it } from 'vitest';
import {
  carryLimitKg,
  encumbranceTier,
  usedSlots,
} from '../store/inventoryUtils';
import { BASE_CARRY_KG } from '../data/items';
import type { Equipped, InvItem } from '../store/types';

const noPack: Equipped = { melee: null, ranged: null, pack: null };

describe('encumbranceTier boundaries', () => {
  const limit = 20;
  it.each([
    [0.99, 'ok'],
    [1.0, 'ok'], // exactly 100% is still ok
    [1.01, 'heavy'], // >100%: no sprint
    [1.3, 'heavy'], // exactly 130% stays heavy
    [1.31, 'overloaded'], // >130%: no dodge
    [1.6, 'overloaded'], // exactly 160% stays overloaded
    [1.61, 'immobile'], // >160%: cannot pick up
    [2.5, 'immobile'],
  ])('ratio %s -> %s', (ratio, tier) => {
    expect(encumbranceTier(limit * ratio, limit)).toBe(tier);
  });
});

describe('carryLimitKg', () => {
  it('applies the story difficulty +20% bonus', () => {
    // BASE 20 * 1.2
    expect(carryLimitKg(noPack, [], 'story')).toBeCloseTo(BASE_CARRY_KG * 1.2, 6);
  });

  it('has no bonus on survivor without a pack', () => {
    expect(carryLimitKg(noPack, [], 'survivor')).toBeCloseTo(BASE_CARRY_KG, 6);
  });

  it('adds pack carryBonus on top of the difficulty bonus', () => {
    const inv: InvItem[] = [{ uid: 'p1', itemId: 'pack_t1', qty: 1 }]; // carryBonus 8
    const equipped: Equipped = { melee: null, ranged: null, pack: 'p1' };
    expect(carryLimitKg(equipped, inv, 'story')).toBeCloseTo(BASE_CARRY_KG * 1.2 + 8, 6);
  });

  it('rigger pack adds 15kg on survivor', () => {
    const inv: InvItem[] = [{ uid: 'p2', itemId: 'pack_t2', qty: 1 }];
    const equipped: Equipped = { melee: null, ranged: null, pack: 'p2' };
    expect(carryLimitKg(equipped, inv, 'survivor')).toBeCloseTo(BASE_CARRY_KG + 15, 6);
  });

  it('ignores a pack uid that is not in the inventory', () => {
    const equipped: Equipped = { melee: null, ranged: null, pack: 'missing' };
    expect(carryLimitKg(equipped, [], 'survivor')).toBeCloseTo(BASE_CARRY_KG, 6);
  });
});

describe('usedSlots (stack math)', () => {
  it('counts partial stacks as one slot', () => {
    // ammo_9mm: slots 1, stack 60
    const inv: InvItem[] = [{ uid: 'a', itemId: 'ammo_9mm', qty: 30 }];
    expect(usedSlots(inv)).toBe(1);
  });

  it('spills into a second slot past the stack size', () => {
    const inv: InvItem[] = [{ uid: 'a', itemId: 'ammo_9mm', qty: 61 }];
    expect(usedSlots(inv)).toBe(2);
  });

  it('a full stack is exactly one slot', () => {
    // bandage: slots 1, stack 8
    const inv: InvItem[] = [{ uid: 'b', itemId: 'bandage', qty: 8 }];
    expect(usedSlots(inv)).toBe(1);
  });

  it('sums slots across mixed stacks', () => {
    const inv: InvItem[] = [
      { uid: 'a', itemId: 'ammo_9mm', qty: 61 }, // 2 slots
      { uid: 'b', itemId: 'bandage', qty: 9 }, // stack 8 -> 2 slots
      { uid: 'c', itemId: 'scrap', qty: 40 }, // stack 20 -> 2 slots
    ];
    expect(usedSlots(inv)).toBe(6);
  });

  it('unknown items contribute nothing', () => {
    const inv: InvItem[] = [{ uid: 'x', itemId: 'does_not_exist', qty: 99 }];
    expect(usedSlots(inv)).toBe(0);
  });
});
