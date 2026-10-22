// Facility presence — ORDER #4 C5: the base-presence signal the Craft
// UI was missing.
//
// Before this module, CraftContext.facilities was fed from the legacy
// flat base list — globally, wherever the player stood — and
// facilityStation was never set by anyone. Worse, the ids the crafting
// layer speaks ('workshop', 'machine_shop', 'garage_t3') are produced
// by NEITHER base model: the legacy flat table has no bench line at
// all, and the tiered claims model folds Workbench → Workshop →
// Machine Shop into ONE facility ('workbench', tiers 1–3). Facility-
// hosted crafting was therefore unreachable and the turret's facility
// gate could never pass from real game state.
//
// This module is the bridge, pure over plain data:
//  - hostedStations translates a base's tiered FacilityInstance list
//    into the station-host vocabulary of data/stations.ts.
//  - facilityPresenceAt answers "which of the player's claimed bases
//    is the player standing in, and what does it host?" using the
//    claims system's own geometry — the site anchor (poiPositions,
//    with the military_base → airbase fallback Turrets.ts and Game's
//    atHome stamp already use) and claimSite().prefabRadiusM (40m home
//    / 20m outpost). No second radius is invented here.
//  - presenceContext shapes a presence into the facility fields of a
//    CraftContext for one station — the seam the Craft UI and the
//    queue's execution-time enforcement both consume.
//
// Ownership is structural: presence only ever reads the player's
// ClaimsState (allBases). Ground inside an unclaimed site's ring —
// or anyone else's base — is not presence.

import { claimSite, type ClaimSiteDef } from '../data/base';
import type { CraftStationId } from '../data/stations';
import {
  allBases,
  type BaseInstance,
  type ClaimsState,
  type FacilityInstance,
} from './baseClaims';

export interface HostedStations {
  /** Best hosted tier per station id (absent key = not hosted). */
  stationTiers: Partial<Record<CraftStationId, number>>;
  /** The same hosts in FACILITY_STATION_HOSTS id space — feeds the
   *  crafting layer's existing helpers (stationTierFromFacilities,
   *  hasTurretHost) unchanged. */
  facilityIds: string[];
  /** T3 Machine Shop (workbench T3) or T3 Garage on site (§4.3). */
  turretHost: boolean;
}

/**
 * Tiered facility → station host translation (§4.1):
 *  - workbench T1 hosts the Weapons Bench at tier 1; T2 (Workshop)
 *    raises it to tier 2; T3 (Machine Shop) hosts Fabrication
 *    (industrial) at tier 3 and is a turret host.
 *  - infirmary hosts Chemistry at tier 2 from T2 up (data/stations:
 *    "Infirmary T2+ hosts chemistry at bases" — the T1 Med Cot does
 *    not host).
 *  - garage hosts the Garage Bay from T1; T3 is the heavy garage —
 *    the second turret host.
 */
export function hostedStations(facilities: readonly FacilityInstance[]): HostedStations {
  const stationTiers: Partial<Record<CraftStationId, number>> = {};
  const facilityIds: string[] = [];
  let turretHost = false;
  const raise = (station: CraftStationId, tier: number) => {
    stationTiers[station] = Math.max(stationTiers[station] ?? 0, tier);
  };
  for (const f of facilities) {
    if (f.defId === 'workbench') {
      if (f.tier >= 1) { facilityIds.push('workbench'); raise('workbench', 1); }
      if (f.tier >= 2) { facilityIds.push('workshop'); raise('workbench', 2); }
      if (f.tier >= 3) { facilityIds.push('machine_shop'); raise('industrial', 3); turretHost = true; }
    } else if (f.defId === 'infirmary') {
      if (f.tier >= 2) { facilityIds.push('infirmary'); raise('chemistry', 2); }
    } else if (f.defId === 'garage') {
      if (f.tier >= 1) { facilityIds.push('garage_bay'); raise('garage', 1); }
      if (f.tier >= 3) { facilityIds.push('garage_t3'); turretHost = true; }
    }
  }
  return { stationTiers, facilityIds, turretHost };
}

export interface FacilityPresence extends HostedStations {
  /** The claimed base the player is standing in. */
  base: BaseInstance;
  siteId: string;
  siteName: string;
  /** The claim ring the player is inside (the site's prefabRadiusM). */
  radiusM: number;
}

/** Site anchor in world XZ — the poiPositions lookup every claim
 *  consumer shares, military_base riding the airbase anchor. */
export function claimAnchor(
  siteId: string,
  poiPositions: Readonly<Record<string, [number, number]>>,
): [number, number] | undefined {
  return poiPositions[siteId] ?? (siteId === 'military_base' ? poiPositions['airbase'] : undefined);
}

/**
 * The presence query: the player's claimed base whose claim ring
 * contains (x, z), with the stations that base hosts — or null when
 * the player is at no claimed base. Home wins ties (allBases order);
 * sites with no anchor or a zero ring (story ground) never match.
 */
export function facilityPresenceAt(
  claims: ClaimsState,
  poiPositions: Readonly<Record<string, [number, number]>>,
  x: number,
  z: number,
): FacilityPresence | null {
  for (const base of allBases(claims)) {
    const site: ClaimSiteDef | undefined = claimSite(base.siteId);
    if (!site || site.prefabRadiusM <= 0) continue;
    const anchor = claimAnchor(base.siteId, poiPositions);
    if (!anchor) continue;
    const dx = x - anchor[0];
    const dz = z - anchor[1];
    if (dx * dx + dz * dz > site.prefabRadiusM * site.prefabRadiusM) continue;
    return {
      base,
      siteId: base.siteId,
      siteName: site.name,
      radiusM: site.prefabRadiusM,
      ...hostedStations(base.facilities),
    };
  }
  return null;
}

/** Change signature for the store mirror's guarded setter — the
 *  mirror only writes when the player crosses a ring or the base's
 *  hosted set changes (a facility lands mid-presence). */
export function presenceSignature(p: FacilityPresence | null): string {
  if (!p) return '';
  const tiers = (Object.entries(p.stationTiers) as [CraftStationId, number][])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}${v}`)
    .join(',');
  return `${p.siteId}|${tiers}|${p.turretHost ? 'T' : ''}`;
}

/**
 * The CraftContext facility fields for one recipe station, from a
 * presence (or its absence). facilityStation is the recipe's station
 * when the base under the player's feet hosts it — checkCraft ORs it
 * with the world-station mirror, world first.
 */
export function presenceContext(
  presence: FacilityPresence | null,
  station: CraftStationId | null,
): { facilityStation: CraftStationId | null; facilityIds: string[]; stationTier: number } {
  if (!presence) return { facilityStation: null, facilityIds: [], stationTier: 0 };
  const tier = station ? (presence.stationTiers[station] ?? 0) : 0;
  return {
    facilityStation: station && tier > 0 ? station : null,
    facilityIds: presence.facilityIds,
    stationTier: tier,
  };
}
