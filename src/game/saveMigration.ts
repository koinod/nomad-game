import type { VehicleSave } from '../store/types';
import { ITEMS } from '../data/items';
import type { Vehicle } from './Vehicles';

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

// ─── Fleet persistence (2026-10-21, generalized) ────────────────────────
//
// EVERY live vehicle persists and restores its full state — position,
// heading, fuel, condition, storage, upgrades, flat tires, variant —
// keyed by def id (uids are def ids: one instance per def). The
// capture/apply pair used to live inline in Game (getVehicleStates +
// the init restore loop), where the WebGL-bound engine made the round
// trip untestable headless; it lives here now so the fleet round trip
// is pinned by tests (vehicle-persistence.test.ts). Game calls these —
// same semantics as the inline code, plus one fix: `variant` was
// captured into the save but never restored; it round-trips now.

/** A live vehicle's full persisted state (the save-side snapshot). */
export function captureVehicleSave(v: Vehicle): VehicleSave {
  return {
    defId: v.def.id,
    x: v.group.position.x,
    y: v.group.position.y,
    z: v.group.position.z,
    heading: v.heading,
    fuel: v.fuel,
    condition: v.condition,
    storage: v.storage.map((it) => ({ ...it })),
    upgrades: [...v.upgrades],
    tiresFlat: v.tiresFlat,
    variant: v.variant,
  };
}

/** Stamp one vehicle's saved state back onto it. Storage entries whose
 *  items were deleted from the data tables are dropped, never fatal. */
export function applyVehicleSave(v: Vehicle, vs: VehicleSave): void {
  v.group.position.set(vs.x, vs.y, vs.z);
  v.group.rotation.y = vs.heading;
  v.heading = vs.heading;
  v.fuel = vs.fuel;
  v.condition = vs.condition;
  v.speed = 0;
  v.storage = (vs.storage ?? []).filter((it) => ITEMS[it.itemId]);
  v.upgrades = vs.upgrades ?? [];
  v.tiresFlat = vs.tiresFlat ?? 0;
  v.variant = vs.variant;
}

/**
 * Restore a whole save's vehicle list onto the live fleet: each live
 * vehicle takes ONLY its own def-id save (restorableVehicleSave —
 * deleted defs strip, deleted upgrade ids filter). Records for defs
 * with no live vehicle (deleted content, future defs like a Dark Horse
 * placeholder) are skipped, never fatal; a live vehicle with no record
 * keeps its fresh spawn state. Returns the def ids that were restored,
 * in live-fleet order.
 */
export function restoreVehicleFleet(
  vehicles: readonly Vehicle[],
  saves: VehicleSave[] | undefined | null,
): string[] {
  const restored: string[] = [];
  for (const v of vehicles) {
    const vs = restorableVehicleSave(saves, v.def.id);
    if (!vs) continue;
    applyVehicleSave(v, vs);
    restored.push(v.def.id);
  }
  return restored;
}
