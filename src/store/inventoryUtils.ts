import { ITEMS, BASE_CARRY_KG, BASE_SLOTS } from '../data/items';
import { DIFFICULTIES } from './types';
import type { DifficultyId, Equipped, InvItem } from './types';
import { weightCarried } from './containers';

/** Total carried weight — inventory v2: RECURSIVE. What a container
 *  holds weighs on the carrier, so the forest is weighed whole. */
export function totalWeightKg(inv: InvItem[]): number {
  return weightCarried(inv);
}

export function usedSlots(inv: InvItem[]): number {
  let s = 0;
  for (const it of inv) {
    const def = ITEMS[it.itemId];
    if (def) s += def.slots * Math.ceil(it.qty / def.stack);
  }
  return s;
}

export function carryLimitKg(equipped: Equipped, inv: InvItem[], difficulty: DifficultyId, bonusKg = 0): number {
  let limit = BASE_CARRY_KG * (1 + DIFFICULTIES[difficulty].carryBonus);
  if (equipped.backpack) {
    const pack = inv.find((i) => i.uid === equipped.backpack);
    const def = pack ? ITEMS[pack.itemId] : undefined;
    if (def?.carryBonus) limit += def.carryBonus;
  }
  return limit + bonusKg;
}

/** Legacy slot budget (pre-v2 HUD math). Pickups are gated by grid fit
 *  now (containers.ts); this stays for displays that still read it. */
export function slotLimit(equipped: Equipped, inv: InvItem[], bonusSlots = 0): number {
  let limit = BASE_SLOTS;
  if (equipped.backpack) {
    const pack = inv.find((i) => i.uid === equipped.backpack);
    const def = pack ? ITEMS[pack.itemId] : undefined;
    if (def?.packSlots) limit += def.packSlots;
  }
  return limit + bonusSlots;
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
