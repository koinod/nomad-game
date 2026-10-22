// territory.ts — FACTIONS_CANON §6 (Beta Island: who owns what) as data.
// Pure data + lookups: NO world geometry, NO World.ts edits. The main
// agent's world-wiring pass consumes TERRITORY / MAP_MARKERS to place
// markers and presence; Lane 10 (base claims) reads claimable/neverClaim.

export type TerritoryOwner =
  | 'lighthouse' | 'remnants' | 'union' | 'skulls' | 'tollkeepers' | 'drowned'
  | 'enclave' | 'neutral' | 'contested' | 'player';

export interface TerritoryDef {
  /** Canonical site key (canon §6 wording). */
  site: string;
  /** Engine POI id when the site exists in BETA_POI_PLACEMENTS. */
  poiId?: string;
  owner: TerritoryOwner;
  /** What a player sees / who is standing there. */
  presence: string;
  notes: string;
  /** Base-claim status per canon + BASE_DESIGN (Lane 10 consumes). */
  claim: 'never' | 'gated' | 'open' | 'n/a';
}

export const TERRITORY: TerritoryDef[] = [
  { site: 'shore_camp', poiId: 'shore_camp', owner: 'player', presence: 'Player holdout', notes: 'Collective-friendly; their relay tech visits.', claim: 'n/a' },
  { site: 'marina / boatyard', poiId: 'marina', owner: 'drowned', presence: 'The Drowned — salvage + ferries', notes: 'Player’s Salvage Rig runs under their sufferance (rep flavor). Union harbor quarter (Boudreaux) works the same docks under the fold.', claim: 'n/a' },
  { site: 'jonah_camp', poiId: 'jonah_camp', owner: 'neutral', presence: 'Jonah’s fire', notes: 'Union recruiters visit (Wave 8 hook).', claim: 'open' },
  { site: 'barn / farm', poiId: 'barn', owner: 'union', presence: 'Union claim-stake', notes: 'T1 stores + locked T3 locker.', claim: 'gated' },
  { site: 'wreck', poiId: 'wreck', owner: 'contested', presence: 'Convoy-wreck re-theme', notes: 'Remnant salvage crews work it in Phase 3; Priya camps here until the relay lives.', claim: 'n/a' },
  { site: 'town', poiId: 'town', owner: 'union', presence: 'Survivors Union — town-hall compound', notes: 'Claim = rep-gated Union privilege (canon Decision 3, recommended, pending Ian’s ruling): a compound plot via rep ≥25, or the War path. Never an open claim.', claim: 'gated' },
  { site: 'strip mall', poiId: 'strip_mall', owner: 'neutral', presence: 'Contested ground', notes: 'Takeover-kit target.', claim: 'open' },
  { site: 'gas_station', poiId: 'gas_station', owner: 'neutral', presence: 'Unheld', notes: 'Takeover-kit target; fuel economy anchor.', claim: 'open' },
  { site: 'warehouse', poiId: 'warehouse', owner: 'skulls', presence: 'Skulls forward cache (Phase 3)', notes: 'T3 industrial loot, locked locker.', claim: 'n/a' },
  { site: 'school', owner: 'union', presence: 'Union dormitory', notes: 'The recruit pipeline. Part of the town holding — no separate POI.', claim: 'never' },
  { site: 'forest_cache', poiId: 'forest_cache', owner: 'neutral', presence: 'Hunting stash', notes: 'Fast-travel node; Kowalski’s capacitor caches draw from here.', claim: 'n/a' },
  { site: 'relay_station', poiId: 'relay_station', owner: 'remnants', presence: 'Remnant listening post (Phase 3)', notes: 'The Collective wants it back — built-in quest tension. The player restores it in q3_clear_relay; ownership on paper is the Long Chain’s.', claim: 'never' },
  { site: 'dune_cache', poiId: 'dune_cache', owner: 'neutral', presence: 'D.C.-road staging', notes: 'Lina watches the road from here.', claim: 'n/a' },
  { site: 'raider fort', poiId: 'raider_fort', owner: 'skulls', presence: 'Rust Skulls main base (~x 500 dunes)', notes: 'Spike walls, skull poles, the fighting pit.', claim: 'never' },
  { site: 'lighthouse', poiId: 'lighthouse_base', owner: 'lighthouse', presence: 'Lighthouse Collective — story anchor', notes: 'Not claimable, ever.', claim: 'never' },
  { site: 'military base / Coast Guard', poiId: 'airbase', owner: 'remnants', presence: 'Military Remnants main base, NE coast', notes: 'HESCO perimeter, motor pool, the armory. (POI id is the shipped “airbase”.)', claim: 'never' },
  { site: 'eastern tollgate', poiId: 'tollgate', owner: 'tollkeepers', presence: 'The Tollkeepers — the island’s exit gate', notes: 'The bridge proper is the OBX leg. (Site key predates the Beta map: the gate itself stands on the northern causeway at the Citadel — map integration, 2026-10-21.)', claim: 'never' },
  { site: 'enclave caches', owner: 'enclave', presence: 'Dead-drop sites (rumor)', notes: 'Locked lockers, odd tech, one radio burst. Placement data in worldWiring.ENCLAVE_CACHES.', claim: 'never' },
];

export function territoryAt(poiId: string): TerritoryDef | undefined {
  return TERRITORY.find((t) => t.poiId === poiId);
}

export function sitesOwnedBy(owner: TerritoryOwner): TerritoryDef[] {
  return TERRITORY.filter((t) => t.owner === owner);
}

// ─── Map markers (data only — the wiring pass renders them) ─────────────────

export interface MapMarker {
  id: string;
  label: string;
  poiId?: string;
  owner: TerritoryOwner;
  kind: 'base' | 'trader' | 'gate' | 'cache' | 'story';
}

export const MAP_MARKERS: MapMarker[] = [
  { id: 'mk_lighthouse', label: 'Bodie Light — Lighthouse Collective', poiId: 'lighthouse_base', owner: 'lighthouse', kind: 'story' },
  { id: 'mk_airbase', label: 'Coast Guard Station — the Long Chain', poiId: 'airbase', owner: 'remnants', kind: 'base' },
  { id: 'mk_relay', label: 'Relay Station — Remnant listening post', poiId: 'relay_station', owner: 'remnants', kind: 'base' },
  { id: 'mk_town', label: 'Town — Survivors Union', poiId: 'town', owner: 'union', kind: 'base' },
  { id: 'mk_marina', label: 'Marina — the Drowned / Union harbor', poiId: 'marina', owner: 'drowned', kind: 'trader' },
  { id: 'mk_fort', label: 'Dune Fort — Rust Skulls', poiId: 'raider_fort', owner: 'skulls', kind: 'base' },
  { id: 'mk_tollgate', label: 'The Tollgate — the Tollkeepers', poiId: 'tollgate', owner: 'tollkeepers', kind: 'gate' },
  { id: 'mk_wreck', label: 'The Wreck — contested', poiId: 'wreck', owner: 'contested', kind: 'cache' },
];
