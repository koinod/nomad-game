import { ITEMS, BASE_CARRY_KG, BASE_SLOTS } from '../data/items';
import { DIFFICULTIES } from './types';
import type { DifficultyId, Equipped, InvItem } from './types';

export function totalWeightKg(inv: InvItem[]): number {
  let w = 0;
  for (const it of inv) {
    const def = ITEMS[it.itemId];
    if (def) w += def.weight * it.qty;
  }
  return w;
}

export function usedSlots(inv: InvItem[]): number {
  let s = 0;
  for (const it of inv) {
    const def = ITEMS[it.itemId];
    if (def) s += def.slots * Math.ceil(it.qty / def.stack);
  }
  return s;
}

export function carryLimitKg(equipped: Equipped, inv: InvItem[], difficulty: DifficultyId): number {
  let limit = BASE_CARRY_KG * (1 + DIFFICULTIES[difficulty].carryBonus);
  if (equipped.pack) {
    const pack = inv.find((i) => i.uid === equipped.pack);
    const def = pack ? ITEMS[pack.itemId] : undefined;
    if (def?.carryBonus) limit += def.carryBonus;
  }
  return limit;
}

export function slotLimit(equipped: Equipped, inv: InvItem[]): number {
  let limit = BASE_SLOTS;
  if (equipped.pack) {
    const pack = inv.find((i) => i.uid === equipped.pack);
    const def = pack ? ITEMS[pack.itemId] : undefined;
    if (def?.packSlots) limit += def.packSlots;
  }
  return limit;
}

// Encumbrance tiers per spec: >100% no sprint, >130% no dodge, >160% cannot pick up.
export type Encumbrance = 'ok' | 'heavy' | 'overloaded' | 'immobile';

export function encumbranceTier(weightKg: number, limitKg: number): Encumbrance {
  const r = limitKg <= 0 ? 99 : weightKg / limitKg;
  if (r > 1.6) return 'immobile';
  if (r > 1.3) return 'overloaded';
  if (r > 1.0) return 'heavy';
  return 'ok';
}

export function canSprint(t: Encumbrance): boolean {
  return t === 'ok';
}
