// sectorSites.ts — THE SIX STRONGHOLDS, as ONE data definition.
//
// Spec §3.2 (design-refs/world-specs/beta-island-spec-v1.md): "Bespoke
// Modular Kits — generate high-fidelity, multi-part 3D modular kits for
// each of the six strongholds... interior wall panels, support columns,
// catwalk segments, and unique landmark props... so the greeble passes
// have real geometry to work with."
//
// This module is the sector sibling of airbaseSite.ts: the ONLY place
// that says WHERE each stronghold structure sits. Spots are relative
// to the sector pad center in data/betaLayout.ts BETA_SECTORS (the
// surveyed flats the terrain grid is authored from), so a pad move in
// betaLayout moves the stronghold with it. The builders live in
// Sectors.ts; ground works (container fortress, palisades, boardwalk
// slips, refinery) are placed there too and reported back as tagged
// SectorFeature records the gate pins.
//
// Siting discipline (asserted in strongholds.test.ts):
// - every kit footprint inside its sector's surveyed pad
// - road clearance from BETA_ROADS centerlines (the two Citadel gate
//   towers are the designed exception — they FLANK the causeway)
// - clear of the world crafting stations (data/stations.ts anchors:
//   the Citadel shop/bench sit in the truck hall's yard, the Refuge
//   chem/bench inside the palisade, the town bench, the marina shop)

import { BETA_EXTRA_PADS, betaSector } from '../data/betaLayout';

export interface SectorBuildingSpot {
  /** Kit building id the builder produces. */
  id: string;
  /** BETA_SECTORS id this structure belongs to. */
  sector: string;
  /** Offset from the sector pad center (m). */
  dx: number;
  dz: number;
  rot: 0 | 1 | 2 | 3;
}

/** World [x, z] of a spot: sector pad center + offset (spots are
 *  axis-aligned with the pads — rotations live on the building). */
export function sectorSpotWorld(spot: SectorBuildingSpot): [number, number] {
  const s = betaSector(spot.sector);
  return [s.x + spot.dx, s.z + spot.dz];
}

export const SECTOR_BUILDINGS: SectorBuildingSpot[] = [
  // ── The Ridge Protocol Redoubt (NW bluffs, pad y 60) ──────────────
  // Bunker headhouse NW, watchtower NE, ops canopy E — the spur's
  // final leg terminates at the pad's south-center, kept clear.
  { id: 'ridge_bunker', sector: 'ridge', dx: -28, dz: -24, rot: 0 },
  { id: 'ridge_tower', sector: 'ridge', dx: 30, dz: -22, rot: 0 },
  { id: 'ridge_ops', sector: 'ridge', dx: 26, dz: 16, rot: 0 },

  // ── The Convoy Citadel (northern causeway + freight yard) ─────────
  // Gate towers flank the causeway at the pad's north edge (the
  // tollgate POI sits on the span between them); the container rooms
  // annex the fortress's south face; the truck hall works the yard
  // around the warehouse POI's stations.
  { id: 'citadel_gate_w', sector: 'citadel', dx: -10, dz: -32, rot: 0 },
  { id: 'citadel_gate_e', sector: 'citadel', dx: 10, dz: -32, rot: 0 },
  { id: 'citadel_container_office', sector: 'citadel', dx: -34, dz: 14, rot: 0 },
  { id: 'citadel_container_store', sector: 'citadel', dx: -34, dz: 22, rot: 0 },
  { id: 'citadel_truck_hall', sector: 'citadel_yard_anchor', dx: -22, dz: -4, rot: 0 },

  // ── The Lighthouse Collective (NE spit) ───────────────────────────
  // The lighthouse itself is protected (Lighthouse.ts) — the radar
  // tower watches from the pad's west, the container labs line its
  // east, a pier shed works the north shore. Player spawn SW stays
  // clear.
  { id: 'lighthouse_radar', sector: 'lighthouse', dx: -26, dz: -16, rot: 0 },
  { id: 'lighthouse_lab_a', sector: 'lighthouse', dx: 26, dz: 12, rot: 0 },
  { id: 'lighthouse_lab_b', sector: 'lighthouse', dx: 26, dz: 21, rot: 0 },
  { id: 'lighthouse_shed', sector: 'lighthouse', dx: -18, dz: -28, rot: 0 },

  // ── The Refuge (central sanctuary) ────────────────────────────────
  // Chapel north-center, greenhouses on the west meadow, filtration
  // inside the palisade's NE corner (ground works). The chem/bench
  // stations sit between chapel and greenhouses, kept clear.
  { id: 'refuge_chapel', sector: 'refuge', dx: 0, dz: -22, rot: 0 },
  { id: 'refuge_greenhouse_a', sector: 'refuge', dx: -22, dz: 22, rot: 0 },
  { id: 'refuge_greenhouse_b', sector: 'refuge', dx: -22, dz: 34, rot: 0 },

  // ── The Pier HQ (Hatteras Harbor, SW sound shore) ─────────────────
  // Icehouse + gear shed on the pad; the boardwalk is a kit too (its
  // floor is real — players walk it) reaching west over the shallows
  // from the pad's west edge. The marina Machine Shop stays clear.
  { id: 'pier_icehouse', sector: 'pier_hq', dx: -14, dz: -14, rot: 0 },
  { id: 'pier_shed', sector: 'pier_hq', dx: -14, dz: 16, rot: 0 },
  { id: 'pier_boardwalk', sector: 'pier_hq', dx: -49, dz: 0, rot: 0 },

  // ── Tern Rock Coastal Town (SE beachfront) ────────────────────────
  // NC-12 terminates at the town POI (pad center); the store and
  // garage work its south-west flank, the stilt cottages stand clear
  // of the corridor, and the fuel dock walks east into the sound.
  { id: 'tern_cottage_a', sector: 'tern_rock', dx: 32, dz: 28, rot: 0 },
  { id: 'tern_cottage_b', sector: 'tern_rock', dx: -40, dz: 28, rot: 0 },
  { id: 'tern_cottage_c', sector: 'tern_rock', dx: 56, dz: -18, rot: 2 },
  { id: 'tern_store', sector: 'tern_rock', dx: -32, dz: 15, rot: 0 },
  { id: 'tern_garage', sector: 'tern_rock', dx: -58, dz: 12, rot: 0 },
  { id: 'tern_fuel_dock', sector: 'tern_rock', dx: 130, dz: 40, rot: 0 },
];

/** The Citadel's truck hall anchors to the freight-yard pad
 *  (BETA_EXTRA_PADS 'citadel_yard'), not the fortress pad — its spot
 *  above uses a pseudo-sector resolved here. */
export function resolveSpotWorld(spot: SectorBuildingSpot): [number, number] {
  if (spot.sector === 'citadel_yard_anchor') {
    const yard = BETA_EXTRA_PADS.find((p) => p.id === 'citadel_yard');
    if (!yard) throw new Error('citadel_yard pad missing from BETA_EXTRA_PADS');
    return [yard.x + spot.dx, yard.z + spot.dz];
  }
  return sectorSpotWorld(spot);
}

/** The sector a spot belongs to for bounds purposes (the truck hall
 *  is Citadel content standing on the yard pad). */
export function spotSectorId(spot: SectorBuildingSpot): string {
  return spot.sector === 'citadel_yard_anchor' ? 'citadel' : spot.sector;
}
