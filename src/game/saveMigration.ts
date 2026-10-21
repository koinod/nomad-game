import type { VehicleSave } from '../store/types';

/**
 * VEHICLE RESET + TOTAL PURGE save migration (2026-10-20).
 *
 * Pre-reset saves carry a whole fleet, an inventory of deleted upgrade
 * ids, and possibly a base claimed at a POI whose buildings no longer
 * exist. Loading must never crash and never resurrect deleted content:
 *  - the fleet strips to the ONE surviving vehicle (the Mustang);
 *  - upgrade ids whose defs were deleted are stripped from it;
 *  - a base survives only at the lighthouse grounds — every other claim
 *    site was demolished, so the claim clears safely to null.
 */

export const DELETED_UPGRADE_IDS = [
  'mg_mount',
  'cannon_40',
  'tank_coax',
  'tank_reactive',
  'heli_armor',
  'heli_engine',
  'heli_racks',
  'heli_light',
] as const;

export const SURVIVING_VEHICLE_ID = 'mustang';
export const SURVIVING_BASE_POI = 'lighthouse_base';

/** The one vehicle save that survives the reset, or null. Deleted
 *  upgrade ids are filtered out of its fitted list. */
export function survivingVehicleSave(
  vehicles: VehicleSave[] | undefined | null,
): VehicleSave | null {
  if (!vehicles) return null;
  const vs = vehicles.find((v) => v.defId === SURVIVING_VEHICLE_ID);
  if (!vs) return null;
  return {
    ...vs,
    upgrades: (vs.upgrades ?? []).filter(
      (u) => !(DELETED_UPGRADE_IDS as readonly string[]).includes(u),
    ),
  };
}

/** A claimed base survives only where a building still stands. */
export function sanitizeBase<B extends { poiId: string }>(base: B | null | undefined): B | null {
  if (!base) return null;
  return base.poiId === SURVIVING_BASE_POI ? base : null;
}
