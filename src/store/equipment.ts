// equipment.ts — the inventory-v2 equipment model (pure functions).
//
// ONE equipment model (Ian 2026-10-21, Unturned × Tarkov hybrid):
//  - WEAPON SLOTS primary / secondary / tertiary. A slotted weapon
//    leaves every grid and lives in its slot. Keys 1/2/3 select the
//    slot; the held weapon is the selected slot (activeWeapon).
//  - WORN GARMENTS head / jacket / vest / pants / backpack. Armor IS
//    the garment class: a vest is torso armor with pouches, pants are
//    leg armor. A worn garment's grid is its instance `contents`.
// `melee` / `ranged` on Equipped are PROJECTIONS of the weapon slots,
// re-derived here after every mutation — the engine (Player/Combat)
// reads them exactly as it read the old two-slot fields.

import { ITEMS } from '../data/items';
import type {
  Equipped, GarmentSlotId, InvItem, ItemDef, LegacyEquipped, WeaponSlotId,
} from './types';

export const WEAPON_SLOTS: WeaponSlotId[] = ['primary', 'secondary', 'tertiary'];
export const GARMENT_SLOTS: GarmentSlotId[] = ['head', 'jacket', 'vest', 'pants', 'backpack'];
export const ALL_SLOTS: (WeaponSlotId | GarmentSlotId)[] = [...WEAPON_SLOTS, ...GARMENT_SLOTS];

export function emptyEquipped(): Equipped {
  return {
    primary: null, secondary: null, tertiary: null, activeWeapon: 'primary',
    head: null, jacket: null, vest: null, pants: null, backpack: null,
    melee: null, ranged: null,
  };
}

export function isWeaponSlot(slot: string): slot is WeaponSlotId {
  return (WEAPON_SLOTS as string[]).includes(slot);
}

export function isGarmentSlot(slot: string): slot is GarmentSlotId {
  return (GARMENT_SLOTS as string[]).includes(slot);
}

/** Which weapon slot a weapon def equips into.
 *  Long guns (footprint width ≥ 3: rifles, shotgun, SMG, crossbow) →
 *  primary; sidearms (width ≤ 2: pistol, revolver, flare gun) →
 *  secondary; melee → tertiary. */
export function weaponSlotForDef(def: ItemDef): WeaponSlotId | null {
  if (def.category === 'weapon-melee') return 'tertiary';
  if (def.category === 'weapon-ranged') return (def.w ?? 1) >= 3 ? 'primary' : 'secondary';
  return null;
}

/** Which garment slot an item def equips into (explicit garmentSlot
 *  wins; packs → backpack; armor routes by body slot: torso → vest,
 *  legs → pants, head → head). */
export function garmentSlotForDef(def: ItemDef): GarmentSlotId | null {
  if (def.garmentSlot) return def.garmentSlot;
  if (def.category === 'pack') return 'backpack';
  if (def.category === 'armor') {
    if (def.armorSlot === 'head') return 'head';
    if (def.armorSlot === 'torso') return 'vest';
    if (def.armorSlot === 'legs') return 'pants';
  }
  return null;
}

/** The slot an item def equips into, if any. */
export function equipSlotForDef(def: ItemDef): WeaponSlotId | GarmentSlotId | null {
  return weaponSlotForDef(def) ?? garmentSlotForDef(def);
}

/** Which slot (weapon or garment) currently holds this uid, if any. */
export function slotOfUid(
  eq: Equipped,
  uid: string | null | undefined,
): WeaponSlotId | GarmentSlotId | null {
  if (!uid) return null;
  for (const s of ALL_SLOTS) if (eq[s] === uid) return s;
  return null;
}

/** Every uid referenced by a slot (weapons + garments). */
export function slottedUids(eq: Equipped): Set<string> {
  const out = new Set<string>();
  for (const s of ALL_SLOTS) {
    const u = eq[s];
    if (u) out.add(u);
  }
  return out;
}

/** The held weapon: the instance in the selected weapon slot. */
export function heldWeaponUid(eq: Equipped): string | null {
  return eq[eq.activeWeapon] ?? null;
}

function categoryOf(inv: readonly InvItem[], uid: string | null): string | null {
  if (!uid) return null;
  const it = inv.find((i) => i.uid === uid);
  return it ? (ITEMS[it.itemId]?.category ?? null) : null;
}

/** Re-derive the engine projections (melee / ranged) from the weapon
 *  slots. melee = the slotted melee weapon (tertiary first — that is
 *  where melee routes — then any slot); ranged = the slotted ranged
 *  weapon (primary first, then secondary). Returns a new Equipped. */
export function syncWeaponProjections(eq: Equipped, inv: readonly InvItem[]): Equipped {
  let melee: string | null = null;
  for (const s of ['tertiary', 'secondary', 'primary'] as WeaponSlotId[]) {
    if (categoryOf(inv, eq[s]) === 'weapon-melee') { melee = eq[s]; break; }
  }
  let ranged: string | null = null;
  for (const s of ['primary', 'secondary', 'tertiary'] as WeaponSlotId[]) {
    if (categoryOf(inv, eq[s]) === 'weapon-ranged') { ranged = eq[s]; break; }
  }
  if (eq.melee === melee && eq.ranged === ranged) return eq;
  return { ...eq, melee, ranged };
}

/**
 * Migrate a pre-v2 equipped record (or a partial/absent one) onto the
 * unified model. Legacy mapping: the old ranged slot's weapon routes
 * by size (long gun → primary, sidearm → secondary); the old melee →
 * tertiary; the old pack → backpack; armorHead/Torso/Legs → head /
 * vest / pants garments. Uids that don't resolve to an inventory item
 * are dropped. An already-v2 record passes through (projections
 * re-synced). Pure: items are only read.
 */
export function migrateEquipped(
  raw: (Partial<Equipped> & LegacyEquipped) | null | undefined,
  inv: readonly InvItem[],
): Equipped {
  const eq = emptyEquipped();
  if (!raw) return eq;
  const has = (uid: string | null | undefined): uid is string =>
    !!uid && inv.some((i) => i.uid === uid);
  const looksV2 = 'primary' in raw || 'backpack' in raw || 'activeWeapon' in raw;
  if (looksV2) {
    for (const s of ALL_SLOTS) if (has(raw[s])) eq[s] = raw[s]!;
    if (raw.activeWeapon && (WEAPON_SLOTS as string[]).includes(raw.activeWeapon)) {
      eq.activeWeapon = raw.activeWeapon;
    }
  } else {
    // legacy two-weapon model
    if (has(raw.ranged)) {
      const it = inv.find((i) => i.uid === raw.ranged)!;
      const slot = weaponSlotForDef(ITEMS[it.itemId]) ?? 'primary';
      eq[slot] = raw.ranged!;
      eq.activeWeapon = slot;
    }
    if (has(raw.melee)) {
      eq.tertiary = raw.melee!;
      if (!has(raw.ranged)) eq.activeWeapon = 'tertiary';
    }
    if (has(raw.pack)) eq.backpack = raw.pack!;
    if (has(raw.armorHead)) eq.head = raw.armorHead!;
    if (has(raw.armorTorso)) eq.vest = raw.armorTorso!;
    if (has(raw.armorLegs)) eq.pants = raw.armorLegs!;
  }
  return syncWeaponProjections(eq, inv);
}
