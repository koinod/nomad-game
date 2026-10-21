// worldWiring.ts — PLACEMENT DATA for the main agent's single world-wiring
// pass. Lane 9 never edits World.ts/Game.ts/Interact.ts; everything the
// world needs from factions+story lives here as data + the enumerated
// steps in WORLD_WIRING_STEPS.
//
// Coordinates are approximations anchored to World.POI_DEFS (x, zGuess);
// the wiring pass resolves real terrain z via findLandZ like every POI.

export interface NpcPlacement {
  key: string;
  name: string;
  faction: string;
  /** Existing POI anchor. */
  poiId?: string;
  /** Offset from the POI anchor (matches Interact's dx/dz convention). */
  dx: number;
  dz: number;
  /** Free-standing anchor when no POI exists yet (approx x, zGuess). */
  approx?: [number, number];
  role: string;
  /** Trader key (data/traders.ts) this NPC fronts, if any. */
  traderId?: string;
  note?: string;
}

export const NPC_PLACEMENTS: NpcPlacement[] = [
  // — folded crews: the people stay, the tags go (FACTIONS_CANON §5) —
  {
    key: 'boudreaux', name: 'Cpt. Idris Boudreaux', faction: 'union',
    poiId: 'marina', dx: 10, dz: 6, role: 'Union harbormaster (folded: The Pier)',
    note: 'Honest trade at the docks = Union dock market. Stands near the Drowned salvage crews — the fold made neighbors, not strangers.',
  },
  {
    key: 'okonkwo', name: 'Sister Mariah Okonkwo', faction: 'union',
    poiId: 'town', dx: -8, dz: 10, role: 'Union clinic wing (folded: The Refuge)',
    traderId: 'union_medic',
    note: 'Fronts the Union medic trader. The church infirmary is a building visual (parked); the trader works from the town POI now.',
  },
  {
    key: 'the_accountant', name: 'The Accountant', faction: 'skulls',
    approx: [520, 210], dx: 0, dz: 0, role: 'Ocracoke fence (folded: Hollow Market)',
    note: 'Off the island’s south dunes toward Ocracoke. Event-traded fence, NOT a shop UI — the Skulls deny he exists.',
  },
  // — canonical faction presences —
  {
    key: 'quartermaster', name: 'Remnant Quartermaster', faction: 'remnants',
    poiId: 'airbase', dx: 12, dz: -6, role: 'The armory counter',
    traderId: 'quartermaster',
    note: 'Behind the HESCO line. Will not trade below rep 75 (Allied-deep). Patrol NPCs around the airbase read Remnant.',
  },
  {
    key: 'relay_post_guard', name: 'Remnant Listener', faction: 'remnants',
    poiId: 'relay_station', dx: 6, dz: -8, role: 'Listening-post guard (Phase 3 presence)',
    note: 'The paper owner’s man at the relay. Non-hostile while rep > Hostile band edge; flavor for the Collective’s claim.',
  },
  {
    key: 'wraith', name: 'Wraith', faction: 'tollkeepers',
    approx: [672, 60], dx: 0, dz: 0, role: 'Tollgate booth keeper',
    traderId: 'toll_exchange',
    note: 'Island’s eastern edge, causeway out. Needs the tollgate POI (wiring step).',
  },
  {
    key: 'vesper', name: 'Cpt. Selene Vesper', faction: 'drowned',
    poiId: 'marina', dx: -12, dz: -8, role: 'Flotilla commander — fronts the chandlery',
    traderId: 'chandlery',
    note: 'Her ferry Vesper’s Wake anchors off the west shore; she trades from the marina foot.',
  },
];

// ─── The road network (POI graph as data — canon §2.5/§2.6: two doors) ─────

export interface RoadEdge {
  from: string; // POI id or placement key
  to: string;
  mode: 'road' | 'bridge' | 'ferry';
  /** Who prices this crossing, if anyone. */
  pricedBy?: 'tollkeepers' | 'drowned';
  note?: string;
}

/** Spline-ready node/edge table: the wiring pass draws roads from edges. */
export const ROAD_GRAPH: { nodes: string[]; edges: RoadEdge[] } = {
  nodes: [
    'shore_camp', 'marina', 'jonah_camp', 'wreck', 'town', 'forest_cache',
    'relay_station', 'dune_cache', 'lighthouse_base', 'airbase', 'tollgate',
  ],
  edges: [
    { from: 'shore_camp', to: 'marina', mode: 'road' },
    { from: 'shore_camp', to: 'jonah_camp', mode: 'road' },
    { from: 'jonah_camp', to: 'wreck', mode: 'road' },
    { from: 'wreck', to: 'town', mode: 'road' },
    { from: 'marina', to: 'town', mode: 'road', note: 'Harbor road — Union quarter to town.' },
    { from: 'town', to: 'forest_cache', mode: 'road' },
    { from: 'forest_cache', to: 'relay_station', mode: 'road' },
    { from: 'relay_station', to: 'dune_cache', mode: 'road', note: 'Skulls toll crews work this stretch (event hook).' },
    { from: 'dune_cache', to: 'lighthouse_base', mode: 'road' },
    { from: 'relay_station', to: 'airbase', mode: 'road', note: 'Remnant cordon road.' },
    { from: 'airbase', to: 'tollgate', mode: 'road' },
    { from: 'tollgate', to: 'lighthouse_base', mode: 'road', note: 'Causeway shoulder.' },
    // THE TWO DOORS off the island (region transition, OBX leg):
    { from: 'tollgate', to: 'obx_bridge', mode: 'bridge', pricedBy: 'tollkeepers', note: 'The priced door #1: Wraith’s toll schedule. OBX node lands with the region.' },
    { from: 'marina', to: 'obx_ferry', mode: 'ferry', pricedBy: 'drowned', note: 'The priced door #2: Vesper’s ferry — different price, different risk. OBX node lands with the region.' },
  ],
};

// ─── Enclave rumor beats (canon §2.7) ────────────────────────────────────────

export interface EnclaveCache {
  id: string;
  poiId?: string;
  approx?: [number, number];
  dx: number;
  dz: number;
  /** Item id the cache is built around (must exist in data/items.ts). */
  signatureItem: string;
  flavor: string;
}

export const ENCLAVE_CACHES: EnclaveCache[] = [
  {
    id: 'enclave_cache_forest', poiId: 'forest_cache', dx: 7, dz: -6,
    signatureItem: 'beacon_cell',
    flavor: 'A locker with a government stencil sanded almost off. Inside: a power cell in foam, charged, warm. Nothing on this island charges cells like that.',
  },
  {
    id: 'enclave_cache_wreck', poiId: 'wreck', dx: -9, dz: 11,
    signatureItem: 'gun_parts',
    flavor: 'Machined parts in a sealed case — tolerances too fine for any shop on this island — packed like they were expected to be found by someone specific. The case has a combination lock. The lock is open.',
  },
  {
    id: 'enclave_cache_dune', poiId: 'dune_cache', dx: -6, dz: 9,
    signatureItem: 'relay_part',
    flavor: 'A relay capacitor in a waterproof tube, buried shallow, marked with a cairn of white shells. Placed recently. Placed carefully.',
  },
];

/** The one dead-frequency burst — fired by the wiring pass after the relay
 *  comes online (flag 'relay_online'), consumed by quest q_enclave_burst. */
export const ENCLAVE_RADIO_BURST = {
  flag: 'enclave_burst_heard',
  requiresFlag: 'relay_online',
  speaker: 'Unknown frequency',
  lines: [
    '…say again, tower, your beacon is painting on a military band…',
    '…negative, we are not tasked to this island. Repeat, not tasked…',
    '…then who lit— [carrier dies]',
  ],
} as const;

// ─── The wiring steps (the main agent applies these in ONE pass) ────────────

export const WORLD_WIRING_STEPS: string[] = [
  'W1. POI additions in World.POI_DEFS: tollgate (≈x 672, zGuess 60), raider_fort (≈x 500, zGuess 150 — near dune_cache), barn (≈x -40, zGuess 120), warehouse (≈x 140, zGuess -90), gas_station (≈x -160, zGuess -30), strip_mall (≈x -60, zGuess -120) — approx per territory.ts sites lacking poiId; resolve z via findLandZ.',
  'W2. NPC placements from worldWiring.NPC_PLACEMENTS: register Interact NPC entries (key/name/faction) at poiId+dx/dz (or approx anchors for wraith/the_accountant). Boudreaux (marina), Okonkwo (town, fronts union_medic), Quartermaster (airbase, fronts quartermaster), Vesper (marina, fronts chandlery), Relay Listener (relay_station, flavor), Accountant (dune approx, event-only, no shop).',
  'W3. Trader hooks: talking to an NPC with a traderId opens TraderPanel with that trader (see data/traders.ts + ui/TraderPanel.tsx — panel self-registers from its mount point; the talk action is the only engine touch).',
  'W4. Territory markers: render territory.MAP_MARKERS in the phone World/map tab (label + owner color); no geometry.',
  'W5. Road network: draw ROAD_GRAPH edges as the road splines (road mode = dirt/asphalt strip; bridge/ferry edges render only when the OBX nodes exist). Skulls toll-crew event hook on relay_station→dune_cache.',
  'W6. Enclave caches: place ENCLAVE_CACHES as locked container interactables (lockpick-gated) at their anchors with signatureItem + generic tech loot; flavor text on open; each registers interact id cache:<cacheId> and fires questEvent(\'interact\', \'cache:<cacheId>\') on open so q_enclave_burst steps complete.',
  'W7. Radio burst: after flag relay_online first set, play ENCLAVE_RADIO_BURST via the dialogue/journal surface and set enclave_burst_heard — q_enclave_burst starts on that flag (startsWhen {flag} already supported) and completes on the three cache interacts (W6).',
  'W8. Relay mast visual: the relay_station interactable the purge left standing (Priya gate) — confirm its interact id stays poi:relay_switch so q3_clear_relay step s2 keeps completing.',
];
