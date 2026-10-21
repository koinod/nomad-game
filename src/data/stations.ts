// Station tiers & facility hosts — SYSTEMS_SPEC §4.1 (Lane 7, crafting).
//
// Two ways to reach a station:
//  - WORLD stations: physical props placed by World.buildStations(). Their
//    placements are mirrored here as data so systems/UI/tests share one
//    source of truth (World.ts still owns the meshes).
//  - FACILITY hosts: base facilities (src/data/base.ts) that host a station
//    at a tier. Workbench/Workshop/Machine Shop facilities are forward-
//    declared for Lane 10's base pass; Infirmary + Garage Bay already ship.
//
// Tier rule (§4.1): Workbench facility T1 → Workshop T2 adds weapon/armor/
// mod work → Machine Shop facility T3 adds fabrication + turret craft.
// Infirmary T2+ hosts chemistry at bases (med production is chemistry,
// not bench — §0.2 #1). The marina world Machine Shop is a full shop
// (worldTier 3), which is what makes the shipped `industrial` recipes
// reachable outside a base.

import type { StationId } from './items';

/** Crafting stations: the three world stations + the base-only Garage Bay. */
export type CraftStationId = StationId | 'garage';

export interface StationDef {
  id: CraftStationId;
  label: string;
  blurb: string;
  /** Tier a standalone world instance of this station provides (0 = none). */
  worldTier: number;
}

export const STATION_DEFS: Record<CraftStationId, StationDef> = {
  workbench: {
    id: 'workbench',
    label: 'Weapons Bench',
    blurb: 'Reloads, melee, and weapon work. Workshop-tier benches add mods and armor.',
    worldTier: 1,
  },
  chemistry: {
    id: 'chemistry',
    label: 'Chemistry Station',
    blurb: 'Medkits, fuel, and chemical work. An Infirmary hosts these recipes at a base.',
    worldTier: 1,
  },
  industrial: {
    id: 'industrial',
    label: 'Machine Shop',
    blurb: 'Vehicle parts and fabrication. A full shop — world or T3 facility — fabricates.',
    worldTier: 3,
  },
  garage: {
    id: 'garage',
    label: 'Garage Bay',
    blurb: 'Vehicle repair and the upgrade ladder. Base-only — hosted by the Garage Bay facility.',
    worldTier: 0,
  },
};

/** Proximity radius (m) at which a world station is usable — matches Game.ts. */
export const STATION_RADIUS_M = 4.5;

/** Mirror of World.buildStations() placements (poi anchor + offset). */
export interface WorldStationPlacement {
  station: StationId;
  poiId: string;
  dx: number;
  dz: number;
  kind: 'bench' | 'chem' | 'shop';
}

export const WORLD_STATION_PLACEMENTS: WorldStationPlacement[] = [
  { station: 'workbench', poiId: 'jonah_camp', dx: 4, dz: 3, kind: 'bench' },
  { station: 'workbench', poiId: 'town', dx: -15, dz: 2, kind: 'bench' },
  { station: 'chemistry', poiId: 'relay_station', dx: 5, dz: 6, kind: 'chem' },
  // The Machine Shop re-home: a standalone shop prop at the marina/boatyard
  // (closes GAP §C #4 — the shipped `industrial` recipes were unreachable
  // before this placement landed in World.buildStations()).
  { station: 'industrial', poiId: 'marina', dx: 8, dz: -4, kind: 'shop' },
];

/** A base facility that hosts a station at a tier (§4.1 facility column). */
export interface FacilityStationHost {
  facilityId: string;
  station: CraftStationId;
  tier: number;
}

export const FACILITY_STATION_HOSTS: FacilityStationHost[] = [
  { facilityId: 'workbench', station: 'workbench', tier: 1 },
  { facilityId: 'workshop', station: 'workbench', tier: 2 },
  { facilityId: 'machine_shop', station: 'industrial', tier: 3 },
  { facilityId: 'infirmary', station: 'chemistry', tier: 2 },
  { facilityId: 'garage_bay', station: 'garage', tier: 1 },
];

/** Highest hosted tier for `station` given a base's built facility ids (0 = not hosted). */
export function stationTierFromFacilities(
  facilities: readonly string[],
  station: CraftStationId,
): number {
  let tier = 0;
  for (const host of FACILITY_STATION_HOSTS) {
    if (host.station === station && facilities.includes(host.facilityId)) {
      tier = Math.max(tier, host.tier);
    }
  }
  return tier;
}

/** Best tier the player can reach for a station: world instance or base facility. */
export function reachableStationTier(
  station: CraftStationId,
  opts: { atWorldStation: boolean; facilities: readonly string[] },
): number {
  const world = opts.atWorldStation ? STATION_DEFS[station].worldTier : 0;
  return Math.max(world, stationTierFromFacilities(opts.facilities, station));
}

/**
 * Turret host check (§4.3): the turret crafts at a T3 host — either a
 * Machine Shop facility (T3) or a T3 Garage. Base facilities carry no tier
 * field yet, so the T3 garage is recognised by its forward-declared id
 * `garage_t3` (Lane 10) as well as the machine_shop pairing.
 */
export function hasTurretHost(facilities: readonly string[]): boolean {
  return facilities.includes('machine_shop') || facilities.includes('garage_t3');
}

/** Deploy validation for a turret ghost: inside at least one claim radius. */
export interface ClaimCircle {
  x: number;
  z: number;
  radius: number;
}

export function insideAnyClaim(x: number, z: number, claims: readonly ClaimCircle[]): boolean {
  return claims.some((c) => {
    const dx = x - c.x;
    const dz = z - c.z;
    return dx * dx + dz * dz <= c.radius * c.radius;
  });
}
