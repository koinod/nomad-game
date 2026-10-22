// airbaseSite.ts — THE FLEET HOME, as ONE data definition.
//
// Ian's order (2026-10-21): "respawn all vehicles at a revamped airbase
// properly made." The same day he restarted the map (Beta Island spec):
// the topos system is deleted and a new single-grid terrain is coming.
// So this module is the ONLY place that says WHERE the airbase sits and
// where every vehicle lives on it:
//
//   - AIRBASE_SITE: the site's origin + quarter-turn heading. The map
//     wave relocates the whole airbase by editing THIS — buildings,
//     pads, ground works and vehicle spawns all derive from it.
//   - AIRBASE_BUILDINGS: the structure layout in site-local meters.
//   - AIRBASE_PADS: the marked pads. Vehicle spawn defs derive their
//     dx/dz/heading from their pad via padSpawn(), so a pad move moves
//     the spawn with it — no second copy to drift.
//
// The demonstration siting below puts the site on the old map's airbase
// plateau: origin == the 'airbase' POI == World.AIRBASE_CENTER (a test
// pins the equality so the two can never silently diverge). Everything
// is site-local; siteToWorld() is the single transform, using the same
// quarter-turn convention as the building kit (kit.ts pt()).

export interface AirbaseSite {
  /** World [x, z] of the site origin — today the 'airbase' POI. */
  origin: [number, number];
  /** Quarter turns the whole site is rotated by (0 = local == world axes). */
  rotQ: 0 | 1 | 2 | 3;
}

/** Demonstration placement: the current plateau. The Beta Island map
 *  wave re-sites this (and World.AIRBASE_CENTER with it) in one move. */
export const AIRBASE_SITE: AirbaseSite = { origin: [480, -108], rotQ: 0 };

/** The POI every fleet spawn anchors to. SpawnDef dx/dz are POI-relative,
 *  so the POI position must stay the site origin. */
export const FLEET_HOME_POI = 'airbase';

/** Site-local -> world, quarter turns only (mirrors kit.ts pt()). */
export function siteToWorld(site: AirbaseSite, lx: number, lz: number): [number, number] {
  const cos = [1, 0, -1, 0][site.rotQ];
  const sin = [0, 1, 0, -1][site.rotQ];
  return [site.origin[0] + lx * cos + lz * sin, site.origin[1] - lx * sin + lz * cos];
}

// ---------------------------------------------------------------------------
// Structures (site-local plan positions; rot adds to the site's rotQ)

export interface AirbaseBuildingSpot {
  /** Kit building id the builder produces. */
  id: string;
  lx: number;
  lz: number;
  rot: 0 | 1 | 2 | 3;
}

export const AIRBASE_BUILDINGS: AirbaseBuildingSpot[] = [
  { id: 'airfield_hangar', lx: -18, lz: -34, rot: 0 },
  { id: 'airfield_depot', lx: -34, lz: 26, rot: 0 },
  { id: 'airfield_tower', lx: 52, lz: 18, rot: 0 },
  { id: 'airbase_fuel', lx: -46, lz: 6, rot: 0 },
];

// ---------------------------------------------------------------------------
// Pads — painted, sized per vehicle, on the apron south of the hangar.
// hx/hz are plan half-extents of the painted box; heading is the parked
// vehicle's world heading (nose direction (sin h, cos h)).

export interface AirbasePad {
  id: string;
  /** Painted designator on the apron. */
  label: string;
  lx: number;
  lz: number;
  hx: number;
  hz: number;
  heading: number;
  /** The vehicle that respawns here; absent = static/reserved pad. */
  vehicleId?: string;
}

export const AIRBASE_PADS: AirbasePad[] = [
  // The Seahawk's pad — position is contract (seahawkPlacement.test):
  // site + (-18, -10) == (462, -118), nose west.
  { id: 'pad_seahawk', label: 'H', lx: -18, lz: -10, hx: 9.5, hz: 9.5, heading: -Math.PI / 2 },
  // Reserved for the Dark Horse when it lands — marked, honestly empty.
  { id: 'pad_dark_horse', label: 'DH', lx: -4, lz: -9, hx: 4.5, hz: 3.2, heading: Math.PI / 2 },
  { id: 'pad_gt500', label: 'GT500', lx: 7, lz: -9, hx: 4.5, hz: 3.2, heading: Math.PI / 2, vehicleId: 'gt500' },
  { id: 'pad_sprinter', label: 'V-04', lx: 19, lz: -9, hx: 5.25, hz: 3.2, heading: Math.PI / 2, vehicleId: 'sprinter_van' },
  // The Prime is 8.55 long / 2.55 wide: a 13 x 6.8 pad gives swing room.
  { id: 'pad_prime', label: 'PRIME', lx: 36, lz: -12, hx: 6.5, hz: 3.4, heading: Math.PI / 2, vehicleId: 'nomad_prime' },
];

export function padById(padId: string): AirbasePad {
  const pad = AIRBASE_PADS.find((p) => p.id === padId);
  if (!pad) throw new Error(`unknown airbase pad: ${padId}`);
  return pad;
}

/** World plan position of a pad center under the current siting. */
export function padWorld(padId: string, site: AirbaseSite = AIRBASE_SITE): { x: number; z: number; heading: number } {
  const pad = padById(padId);
  const [x, z] = siteToWorld(site, pad.lx, pad.lz);
  return { x, z, heading: pad.heading };
}

/**
 * SpawnDef fields for a pad: dx/dz are POI-relative, and the fleet-home
 * POI sits at the site origin, so the spawn offset is the pad's world
 * position minus the origin (rotation applied). A fresh start / reset
 * puts the vehicle exactly on its pad.
 */
export function padSpawn(padId: string, site: AirbaseSite = AIRBASE_SITE): { dx: number; dz: number; heading: number } {
  const pad = padById(padId);
  const [x, z] = siteToWorld(site, pad.lx, pad.lz);
  return { dx: x - site.origin[0], dz: z - site.origin[1], heading: pad.heading };
}
