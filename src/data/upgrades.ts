// Vehicle upgrades — pure data + effect math. No three.js imports.
// Upgrades are installed per-vehicle; effects are computed from the
// vehicle's owned upgrade ids.

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: { itemId: string; qty: number }[];
  kinds: string[]; // vehicle kinds allowed ('car' | 'atv' | 'bike' | 'moto' | 'skiff')
  excludeIds?: string[]; // vehicle def ids that can't take it
  onlyIds?: string[]; // if set, ONLY these vehicle def ids can take it
  group?: string; // mutually exclusive group: owning one blocks the others
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'armor', name: 'Armor Plating', desc: 'Welded plate over the vitals. Collision and wear damage cut hard.', cost: [{ itemId: 'armor_plate', qty: 2 }, { itemId: 'scrap', qty: 4 }], kinds: ['car'], excludeIds: ['tank'] },
  { id: 'engine_tune', name: 'Engine Tune', desc: 'Timing, injectors, a freer exhaust. +12% top speed, stronger pull.', cost: [{ itemId: 'gun_parts', qty: 4 }, { itemId: 'engine_part', qty: 1 }], kinds: ['car', 'atv'] },
  { id: 'cargo_racks', name: 'Cargo Racks', desc: 'Roof rack, bed rails, tie-downs. Storage capacity +60%.', cost: [{ itemId: 'scrap', qty: 4 }, { itemId: 'wood', qty: 2 }], kinds: ['car', 'atv'] },
  { id: 'bullbar', name: 'Bullbar', desc: 'A welded push bar. Ramming hurts them a lot more than it hurts you.', cost: [{ itemId: 'scrap', qty: 5 }], kinds: ['car'], excludeIds: ['mustang', 'tank'] },
  { id: 'lift_kit', name: 'Lift Kit', desc: 'Raised suspension and clearance. Sand barely slows you; body sits higher.', cost: [{ itemId: 'scrap', qty: 4 }, { itemId: 'engine_part', qty: 1 }], kinds: ['car', 'atv'], excludeIds: ['mustang', 'tank'] },
  { id: 'run_flats', name: 'Run-Flat Tires', desc: 'Reinforced sidewalls. A blown tire stops being a thing that happens to you.', cost: [{ itemId: 'tire', qty: 2 }], kinds: ['car', 'atv'], excludeIds: ['tank'] },
  // Goliath 6x6 weapon mounts (mutually exclusive — one ring, one weapon)
  { id: 'mg_mount', name: 'MG Mount', desc: 'A ring-mounted machine gun on the Goliath. Fire it from the driver\u2019s seat.', cost: [{ itemId: 'gun_parts', qty: 6 }, { itemId: 'scrap', qty: 3 }], kinds: ['car'], onlyIds: ['goliath'], group: 'mount' },
  { id: 'cannon_40', name: '40mm Cannon', desc: 'A turreted 40mm cannon for the Goliath. Slow, deafening, decisive.', cost: [{ itemId: 'gun_parts', qty: 10 }, { itemId: 'engine_part', qty: 1 }, { itemId: 'scrap', qty: 4 }], kinds: ['car'], onlyIds: ['goliath'], group: 'mount' },
  // Tank tiers (its main cannon is integral; these extend it)
  { id: 'tank_coax', name: 'Coax Machine Gun', desc: 'A coaxial MG beside the tank\u2019s main gun. For the small problems.', cost: [{ itemId: 'gun_parts', qty: 5 }, { itemId: 'scrap', qty: 2 }], kinds: ['car'], onlyIds: ['tank'] },
  { id: 'tank_reactive', name: 'Reactive Armor + Ram Plow', desc: 'ERA blocks and a heavier plow for the tank. Ramming goes up a class.', cost: [{ itemId: 'armor_plate', qty: 3 }, { itemId: 'scrap', qty: 3 }], kinds: ['car'], onlyIds: ['tank'] },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function upgradeDef(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export function canInstallUpgrade(
  vehicle: { kind: string; id: string },
  upgradeId: string,
  owned: readonly string[],
): boolean {
  const def = upgradeDef(upgradeId);
  if (!def) return false;
  if (owned.includes(upgradeId)) return false;
  if (!def.kinds.includes(vehicle.kind)) return false;
  if (def.excludeIds?.includes(vehicle.id)) return false;
  if (def.onlyIds && !def.onlyIds.includes(vehicle.id)) return false;
  if (def.group) {
    // one weapon on the ring: an owned sibling in the group blocks install
    for (const id of owned) {
      if (id !== upgradeId && upgradeDef(id)?.group === def.group) return false;
    }
  }
  return true;
}

export function topSpeedFactor(owned: readonly string[], towedKg: number, flats: number): number {
  const engine = owned.includes('engine_tune') ? 1.12 : 1;
  const load = clamp(1 - towedKg / 12000, 0.55, 1);
  const flatPenalty = 1 - 0.15 * Math.max(0, flats);
  return engine * load * flatPenalty;
}

export function accelFactor(owned: readonly string[], towedKg: number): number {
  const engine = owned.includes('engine_tune') ? 1.15 : 1;
  const load = clamp(1 - towedKg / 9000, 0.5, 1);
  return engine * load;
}

export function sandFactor(owned: readonly string[]): number {
  return owned.includes('lift_kit') ? 0.92 : 0.78;
}

export function storageCapKg(baseKg: number, owned: readonly string[]): number {
  return Math.round(baseKg * (owned.includes('cargo_racks') ? 1.6 : 1));
}

export function collisionLossFactor(owned: readonly string[]): number {
  let v = 1;
  if (owned.includes('armor')) v *= 0.4;
  if (owned.includes('bullbar')) v *= 0.6;
  return Math.max(0.25, v);
}

export function ramDamageFactor(owned: readonly string[]): number {
  if (owned.includes('tank_reactive')) return 2.2;
  return owned.includes('bullbar') ? 1.8 : 1;
}

export function wearFactor(owned: readonly string[]): number {
  return owned.includes('armor') ? 0.7 : 1;
}
