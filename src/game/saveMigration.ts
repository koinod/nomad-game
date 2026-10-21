import type { VehicleSave } from '../store/types';

/**
 * VEHICLE RESET + TOTAL PURGE save migration (2026-10-20), updated
 * 2026-10-21 (Ian: "the FX teal version — delete that").
 *
 * Pre-reset saves carry a whole fleet, an inventory of deleted upgrade
 * ids, and possibly a base claimed at a POI whose buildings no longer
 * exist. Loading must never crash and never resurrect deleted content:
 *  - a vehicle save restores ONLY onto the live vehicle with the
 *    same def id — matched by id, never by list position;
 *  - the Stallion FX ('mustang') is deleted content since 2026-10-21:
 *    its save strips like the pre-reset fleet's did, and it must
 *    never be stamped onto the GT500 (which is vehicles[0] now);
 *  - upgrade ids whose defs were deleted are stripped on restore;
 *  - a base survives only at the lighthouse grounds — every other
 *    claim site was demolished, so the claim clears safely to null.
 *
 * The GT500's own save (written by getVehicleStates for every live
 * vehicle since stage 2b) restores onto the GT500 through the same
 * path — fuel, condition, position, storage — which also closes the
 * old "GT500 state does not persist" residual as a side effect of
 * matching by def id instead of assuming the Mustang is vehicles[0].
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

/** Vehicle defs deleted from the game: their saves never restore. */
export const DELETED_VEHICLE_IDS = ['mustang'] as const;

export const SURVIVING_BASE_POI = 'lighthouse_base';

/** The saved state for the live vehicle `defId`, or null — the save
 *  is matched BY DEF ID, deleted defs strip to null, and deleted
 *  upgrade ids are filtered out of the fitted list. */
export function restorableVehicleSave(
  vehicles: VehicleSave[] | undefined | null,
  defId: string,
): VehicleSave | null {
  if (!vehicles) return null;
  if ((DELETED_VEHICLE_IDS as readonly string[]).includes(defId)) return null;
  const vs = vehicles.find((v) => v.defId === defId);
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
