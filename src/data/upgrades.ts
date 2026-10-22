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
  requiresId?: string; // prerequisite upgrade that must be owned first (stage tiers)
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'armor', name: 'Armor Plating', desc: 'Welded plate over the vitals. Collision and wear damage cut hard.', cost: [{ itemId: 'armor_plate', qty: 2 }, { itemId: 'scrap', qty: 4 }], kinds: ['car'], excludeIds: ['tank'] },
  { id: 'engine_tune', name: 'Engine Tune', desc: 'Timing, injectors, a freer exhaust. +12% top speed, stronger pull.', cost: [{ itemId: 'gun_parts', qty: 4 }, { itemId: 'engine_part', qty: 1 }], kinds: ['car'], excludeIds: ['dark_horse'] },
  { id: 'cargo_racks', name: 'Cargo Racks', desc: 'Roof rack, bed rails, tie-downs. Storage capacity +60%.', cost: [{ itemId: 'scrap', qty: 4 }, { itemId: 'wood', qty: 2 }], kinds: ['car'] },
  { id: 'bullbar', name: 'Bullbar', desc: 'A welded push bar. Ramming hurts them a lot more than it hurts you.', cost: [{ itemId: 'scrap', qty: 5 }], kinds: ['car'], excludeIds: ['tank'] },
  { id: 'lift_kit', name: 'Lift Kit', desc: 'Raised suspension and clearance. Sand barely slows you; body sits higher.', cost: [{ itemId: 'scrap', qty: 4 }, { itemId: 'engine_part', qty: 1 }], kinds: ['car'], excludeIds: ['mustang', 'tank', 'dark_horse'] },
  // Physics-native line (Piece 3): every one of these changes a real
  // simulation parameter in game/carSpec.ts — torque curve, gearing,
  // tire grip, or kilograms on the rigid body. The phone's build sheet
  // shows the computed effect before you buy.
  { id: 'supercharger', name: 'Supercharger', desc: 'A blower on the V8: +38% torque across the curve, +55 kg of iron up front. The Dark Horse ceiling build starts here.', cost: [{ itemId: 'engine_part', qty: 2 }, { itemId: 'gun_parts', qty: 6 }, { itemId: 'scrap', qty: 4 }], kinds: ['car'], excludeIds: ['dark_horse'] },
  { id: 'grip_tires', name: 'Track Compound Tires', desc: 'Soft-compound rubber: longitudinal grip 1.02 -> 1.18. Launches bite instead of spinning.', cost: [{ itemId: 'tire', qty: 4 }], kinds: ['car'], excludeIds: ['dark_horse'] },
  { id: 'weight_reduction', name: 'Weight Reduction', desc: 'Rear seat, sound deadening and trim out; carbon panels on. -95 kg on the body — the cheapest speed there is.', cost: [{ itemId: 'scrap', qty: 3 }, { itemId: 'cloth', qty: 2 }], kinds: ['car'], excludeIds: ['dark_horse'] },
  { id: 'final_drive', name: 'Shorter Final Drive', desc: '3.55 -> 3.85 final drive: every gear pulls harder. Acceleration is bought with revs, not magic.', cost: [{ itemId: 'engine_part', qty: 1 }, { itemId: 'scrap', qty: 3 }], kinds: ['car'], excludeIds: ['dark_horse'] },
  // Dark Horse stage tiers (integration, 2026-10-21): the PRD mod
  // ladder as upgrades, Dark-Horse-only. These are the tiers the
  // car's physics derive from (darkhorseDef.darkHorseParams) — mass,
  // torque, wheel radius, grip all move for real. The FX carSpec
  // line above is excluded for this def: its stages supersede it.
  { id: 'dh_stage1', name: 'Stage 1 — Highway Interceptor', desc: 'AR500 ram + winch, windshield louvers, bolted door + quarter plates, rear crash bar + Class IV receiver, skidplate. +385 kg of hardware; induction work lifts the Coyote to 610 Nm.', cost: [{ itemId: 'armor_plate', qty: 2 }, { itemId: 'scrap', qty: 6 }, { itemId: 'engine_part', qty: 1 }], kinds: ['car'], onlyIds: ['dark_horse'] },
  { id: 'dh_stage2', name: 'Stage 2 — Apex Dust', desc: 'Supercharger (840 Nm), roof turret ring + M240B, DOM cage, coilover lift to 240 mm, 33″ beadlock MTs, snorkel. +595 kg over factory. The full Apex build — requires Stage 1.', cost: [{ itemId: 'engine_part', qty: 2 }, { itemId: 'gun_parts', qty: 6 }, { itemId: 'scrap', qty: 6 }, { itemId: 'tire', qty: 4 }], kinds: ['car'], onlyIds: ['dark_horse'], requiresId: 'dh_stage1' },
  { id: 'run_flats', name: 'Run-Flat Tires', desc: 'Reinforced sidewalls. A blown tire stops being a thing that happens to you.', cost: [{ itemId: 'tire', qty: 2 }], kinds: ['car'], excludeIds: ['tank'] },
  // Goliath 6x6 weapon mounts (mutually exclusive — one ring, one weapon)
  // VEHICLE RESET: the weapon mounts, tank tiers and helicopter line are
  // deleted with their vehicles. What remains fits the one Mustang;
  // Piece 3 re-bases these on real physics parameters (mass, power, grip).
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
  // stage tiers build in order: the prerequisite must already be fitted
  if (def.requiresId && !owned.includes(def.requiresId)) return false;
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
  const racked = owned.includes('cargo_racks');
  return Math.round(baseKg * (racked ? 1.6 : 1));
}

export function collisionLossFactor(owned: readonly string[]): number {
  let v = 1;
  if (owned.includes('armor')) v *= 0.4;
  if (owned.includes('bullbar')) v *= 0.6;
  return Math.max(0.25, v);
}

export function ramDamageFactor(owned: readonly string[]): number {
  return owned.includes('bullbar') ? 1.8 : 1;
}

export function wearFactor(owned: readonly string[]): number {
  return owned.includes('armor') ? 0.7 : 1;
}
