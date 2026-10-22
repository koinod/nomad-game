// ─── BETA ISLAND LAYOUT (map restart, Phase 1 — Ian's order 2026-10-21) ────
//
// Placement canon for the restarted map, derived ONLY from Ian's Beta
// Island spec (design-refs/world-specs/beta-island-spec.md) and the
// aerial (beta-island-aerial.png), which is the shape truth.
//
// SCALE MAPPING (stated once, applied everywhere): the spec's UE world
// is 4 km × 4 km with bluffs to +180 m. The shipped game world is
// 1400 m × 640 m and stays that size (systems are tuned to it), so the
// geography is re-proportioned into that rect with compass topology and
// relative positions preserved: x maps 4 km → 1400 m (×0.35), z maps
// 4 km → 640 m (×0.16, the rect's own aspect), elevations map ×0.35
// (the +180 m foothills become a +63 m-class massif). World axes:
// x+ = east, z− = north, water level = 0.
//
// This file is DATA ONLY. src/game/betaTerrain.ts consumes the sector
// pads, extra pads, road network, and sound channel to author the
// height grid; Phase 2 (World.ts integration, sequenced by Ty) consumes
// the POI placements, daymarkers, and fleet-home candidates. Content
// stays in World.POI_DEFS / data — this file places, never redefines.

// ─── Sectors (spec §2) ──────────────────────────────────────────────────────

export interface BetaSector {
  id: string;
  name: string;
  /** Canon holder per spec §2 / faction canon. */
  holder: string;
  x: number;
  z: number;
  /** Surveyed pad height (m, water = 0): the grid is exactly this flat
   *  across the pad footprint, feathered ring outside it. */
  padY: number;
  /** Pad half-extents [x, z] in meters. */
  padHalf: [number, number];
  note: string;
}

export const BETA_SECTORS: BetaSector[] = [
  {
    id: 'lighthouse', name: 'The Lighthouse Collective (Bodie Island Signal Station)', holder: 'lighthouse',
    x: 618, z: -218, padY: 3.2, padHalf: [46, 34],
    note: 'NE coastal dune spit (§2): brick lighthouse, radar arrays, container labs. Player spawn on its grounds; story anchor, never claimable.',
  },
  {
    id: 'citadel', name: 'The Convoy Citadel (Oregon Inlet Toll Fortress)', holder: 'tollkeepers',
    x: 268, z: -252, padY: 2.6, padHalf: [58, 36],
    note: 'Northern bridge causeway (§2): container fortress at the bay mouth; the causeway runs north off the map (Act 2 mainland leg), the Northern Span runs east to the Lighthouse. Heavy truck lifts + diesel refinery in its yard.',
  },
  {
    id: 'ridge', name: 'The Ridge Protocol Redoubt', holder: 'remnants',
    x: -520, z: -185, padY: 60, padHalf: [56, 42],
    note: 'Inland NW granite bluffs (§2): bunker portal, comms watchtower, tactical helipad (extra pad below), heavy 6x6 vehicle operations. Plateau at the scaled +180 m class (×0.35 ≈ 63 m massif).',
  },
  {
    id: 'refuge', name: 'The Refuge (Pea Island Sanctuary)', holder: 'neutral',
    x: -30, z: -10, padY: 4.4, padHalf: [62, 46],
    note: 'Central island dunes (§2): chapel infirmary, hydroponic greenhouses, palisades, filtration. Neutral safe zone; the NC-12 corridor passes its east side.',
  },
  {
    id: 'pier_hq', name: 'The Pier HQ (Hatteras Harbor Settlement)', holder: 'drowned',
    x: -478, z: 222, padY: 2.2, padHalf: [40, 28],
    note: 'SW sound shoreline (§2): heavy-timber marina — the shipped marina POI in its Beta form (Drowned salvage + Union harbor quarter). Maritime fleet hub; docks reach SW into the shallows.',
  },
  {
    id: 'tern_rock', name: 'Tern Rock Coastal Town', holder: 'union',
    x: 392, z: 168, padY: 2.9, padHalf: [66, 44],
    note: 'SE beachfront (§2): stilted cottages, general store, marine garage, fuel dock — the shipped town holding (Cedar Shoal) in Beta form. Early-game scavenging, starter base, civilian vehicle recovery.',
  },
  {
    id: 'airbase', name: 'Airbase / Coast Guard Station (NE coast)', holder: 'remnants',
    x: 468, z: -128, padY: 2.7, padHalf: [84, 52],
    note: 'The shipped game\'s airbase complex on the NE-central coast near the lighthouse (grade 2.7 = the shipped grade): motor pool, quartermaster, the fleet\'s current home. Retained as a fleet-home candidate (below) until Phase 2 rules.',
  },
];

export function betaSector(id: string): BetaSector {
  const s = BETA_SECTORS.find((v) => v.id === id);
  if (!s) throw new Error(`unknown beta sector: ${id}`);
  return s;
}

// ─── Extra surveyed flats ────────────────────────────────────────────────────

export interface BetaPad {
  id: string;
  x: number;
  z: number;
  y: number;
  half: [number, number];
  note: string;
}

export const BETA_EXTRA_PADS: BetaPad[] = [
  {
    id: 'helipad', x: -430, z: -168, y: 59, half: [17, 17],
    note: 'The Ridge\'s tactical helipad (§2), benched into the bluff shoulder NE of the redoubt pad, clear of the spur\'s switchbacks — the Seahawk\'s Beta home.',
  },
  {
    id: 'relay_knoll', x: -230, z: -190, y: 8, half: [22, 15],
    note: 'Relay Station knoll on the forested NW headland — the Collective\'s west relay watching the bay mouth and the causeway. Elevated on purpose (a listening post wants sky).',
  },
  {
    id: 'citadel_yard', x: 272, z: -196, y: 2.4, half: [52, 18],
    note: 'The Citadel\'s graded freight yard south of the fortress point — heavy truck lifts and the refinery need surveyed ground (§2).',
  },
];

// ─── Roads (spec §2 diagram + §3.3; graded INTO the grid by betaTerrain) ────
//
// Centerline polylines. The terrain builder samples the pre-road field
// along each line, smooths the longitudinal profile under the road's
// grade clamp, and stamps the corridor (full grade inside the
// halfwidth, feathered shoulder outside it).

export interface BetaRoad {
  id: string;
  /** Max longitudinal grade the profile may keep (rise/run). */
  maxGrade: number;
  halfWidth: number;
  points: [number, number][];
}

export const BETA_ROADS: BetaRoad[] = [
  {
    // The causeway: Citadel → north off the map edge (Act 2 mainland
    // leg). A graded land bridge across the bay mouth (§2 span).
    id: 'causeway', maxGrade: 0.05, halfWidth: 5,
    points: [[268, -322], [268, -284], [268, -252]],
  },
  {
    // The Northern Span (§2 diagram's top bar): Citadel → east along
    // the north coast, past the airbase's north fence → the Lighthouse.
    id: 'northern_span', maxGrade: 0.08, halfWidth: 4.6,
    points: [
      [268, -252], [330, -238], [398, -214], [462, -182], [528, -192],
      [578, -204], [606, -212],
    ],
  },
  {
    // NC Route 12 (§2 corridor + §3.3): the span's south leg from the
    // Citadel → Refuge → the SE run to Tern Rock.
    id: 'nc12_corridor', maxGrade: 0.08, halfWidth: 4.6,
    points: [
      [268, -252], [296, -176], [262, -102], [168, -48], [70, -14],
      [62, 34], [138, 74], [226, 106], [316, 138], [392, 162],
    ],
  },
  {
    // NC-12 west fork (§2 diagram's SW arm): Refuge → Pier HQ, running
    // the marsh shore down to the harbor. It crosses the WAIST channel
    // on the founded pier_crossing deck (BETA_WAIST_CROSSINGS, below)
    // and ends on the Pier pad, east of the sound channel's estuary
    // reach. (The Phase 1.5 "no road touches water" law is superseded
    // by the waist-channel revision: decks at the two named crossings
    // are the only wet roadbeds on the map — see BETA_WAIST_CROSSINGS.)
    id: 'nc12_west_fork', maxGrade: 0.08, halfWidth: 4.2,
    points: [[-92, 2], [-160, 34], [-224, 74], [-272, 108], [-318, 142], [-366, 166], [-402, 186], [-446, 210]],
  },
  {
    // Inland Highway Spur (§2 diagram): the Ridge climb. Re-routed by
    // the waist-channel revision: the original south-face traverse left
    // the Refuge and crossed the ground the waist channel now cuts, so
    // the spur runs the NORTH side instead — out of the Citadel west
    // along the north coast, around the north-bay inlet on its south
    // shore, a call at the relay knoll pad, the climb up the massif's
    // EAST face to the forest top, then the long plateau traverse
    // west (south of the helipad and the redoubt) and into the Ridge
    // pad from its west edge — arriving over ground already at
    // height, the way the old south arrival did (a grade-clamped
    // profile cannot climb a pad's feather ring at the edge; it has
    // to arrive across the top, with the arc to already be at
    // height). 14% mountain grade (steep alpine switchbacks run
    // 12–15%); the face legs bench at the clamp.
    id: 'inland_spur', maxGrade: 0.14, halfWidth: 4.2,
    points: [
      [268, -252], [190, -244], [120, -213], [60, -200], [-20, -194],
      [-90, -182], [-160, -172], [-205, -176], [-230, -190],
      [-262, -178], [-294, -170], [-318, -160], [-338, -146],
      [-360, -139], [-420, -137], [-480, -137], [-540, -139],
      [-580, -139], [-615, -138], [-640, -148], [-630, -166],
      [-595, -172], [-560, -168], [-520, -178],
    ],
  },
  {
    // Airbase link: the complex's gate road off the Northern Span.
    id: 'airbase_link', maxGrade: 0.08, halfWidth: 4.2,
    points: [[462, -182], [464, -146], [468, -128]],
  },
];

// ─── The dredged sound channel (spec §3.3) ───────────────────────────────────
//
// The navigable water road of the WESTERN SOUND (§1.1/§3.3): the
// maintained cut runs from the south sound entrance, across the shoal
// bar, up the sound to the Pier HQ harbor mouth, then turns into the
// marsh as the dredged estuary approach, ending at the estuary head
// NE of the wreck. This channel never crosses the island; the cut
// that DOES cross the waist is the separate waist channel below
// (BETA_WAIST_CHANNEL — aerial v2 canon), and the north bay is
// reached by open water around the coasts. (Phase 1.5 shape pass,
// Ty's gate: the original sound line ran from the north bay diagonally
// through the island's waist and read from the air as a strait
// severing the Ridge from the main island — and the spur AND the west
// fork both graded down into it. That route is deleted, not patched;
// the waist channel that replaced it in the 2026-10-22 revision runs
// Atlantic → south sound on the v2 line, crossed only at the two
// founded decks.)
// Dredged to −4.2 m against the −1 m-class shoals so the Salt Skiff
// and the Heavy Logistics Carrier can move. betaTerrain carves it
// into the height data; daymarkers (below) line it.

export const BETA_SOUND_CHANNEL: [number, number][] = [
  [-640, 318], [-566, 256], [-556, 203], [-530, 176], [-505, 148],
  [-405, 138],
];
export const BETA_CHANNEL_DEPTH = -4.2;
/** Full-depth halfwidth of the dredge cut (m); banks feather beyond it. */
export const BETA_CHANNEL_HALFWIDTH = 17;

// ─── The waist channel (aerial v2 canon) ─────────────────────────────────────
//
// Ian's canonical world reference (beta-island-aerial-v2.png, spec §2)
// draws OPEN WATER cutting the island's waist: a turquoise channel
// from the Atlantic shore south across the island into the southern
// sound, separating the northern sectors (Ridge / Convoy Citadel /
// Lighthouse) from the southern (Refuge / Pier HQ / Tern Rock). The
// Phase 1.5 island shipped a dry marsh waist instead; the 2026-10-22
// waist-channel revision (Ian: finish the development path to canon)
// re-carves the waist to the v2 line. Same dredge standard as the
// sound channel — BETA_CHANNEL_DEPTH, navigable by the Salt Skiff and
// the Heavy Logistics Carrier per §3.3 — but a tighter bank feather
// (+18 m beyond the full-depth halfwidth in betaTerrain) so the marsh
// shelves stay narrow and the surveyed POIs near the line (Jonah's
// camp, the beached wreck, the shore camp) stay dry.
//
// The line threads the surveyed ground: east reach along the central
// mass's south shore (south of the airbase pad and the shore camp),
// the E–W waist reach through the old marsh, then the south bend down
// the west block's east shore to the sound, passing EAST of the Pier
// pad. No POI or pad footprint is crossed — the carve's full influence
// radius (halfwidth + feather = 33 m) clears every one.
//
// Roads cross the water at exactly TWO founded decks, pinned as data
// in BETA_WAIST_CROSSINGS below; the terrain law (betaTerrain.test)
// is: no road in water EXCEPT on a founded deck at a named crossing.
// Note on the Citadel's north side: the SDF land bridge under the
// causeway road (Citadel → off-map north) is NOT part of this channel
// — the aerial's northern water is the bay, and the kit's gate towers
// and gantry guard that causeway corridor. The corridor's crossing of
// THIS channel is its south leg: the citadel_causeway deck below,
// where NC-12 leaves the fortress for the Refuge.

/** Centerline, Atlantic mouth (east edge) → south sound exit. */
export const BETA_WAIST_CHANNEL: [number, number][] = [
  [700, 55], [640, 45], [520, 25], [420, 0], [330, -25], [250, -58],
  [170, -72], [90, -88], [0, -105], [-100, -110], [-200, -102],
  [-290, -88], [-355, -62], [-418, -14], [-438, 62], [-430, 125],
  [-420, 178], [-420, 230], [-445, 285], [-478, 320],
];
/** Full-depth halfwidth of the waist cut (m); banks feather +18 m. */
export const BETA_WAIST_HALFWIDTH = 15;

export interface BetaWaistCrossing {
  id: string;
  /** The BETA_ROADS id whose centerline crosses on this deck. */
  road: string;
  /** Deck bed height (m above the waterline) stamped into the grid
   *  before the road grades over it — the founded bed the deck kit
   *  geometry (Sectors.ts) dresses. */
  deckY: number;
  /** Deck span endpoints, ON the road centerline, spanning the
   *  carve's full influence so the roadbed never leaves the deck
   *  while the water is under it. */
  a: [number, number];
  b: [number, number];
}

/** The ONLY two places a road may stand in the water: founded decks
 *  over the waist channel. Any other wet roadbed fails the gate. */
export const BETA_WAIST_CROSSINGS: BetaWaistCrossing[] = [
  {
    // NC-12 south out of the Citadel, over the channel's E–W reach.
    id: 'citadel_causeway', road: 'nc12_corridor', deckY: 1.8,
    a: [231, -84], b: [170, -49],
  },
  {
    // The west fork's final approach to the Pier pad, over the
    // channel's south bend — road deck, distinct from the Pier HQ
    // boardwalk kit, which fronts the SOUND channel off the pad's
    // west edge. Deck height sits just under the pad's surveyed
    // 2.2 m so the road profile ramps the last metres onto the pad
    // instead of stepping at its edge.
    id: 'pier_crossing', road: 'nc12_west_fork', deckY: 2.0,
    a: [-396, 183], b: [-443, 208],
  },
];

export interface BetaDaymarker {
  id: string;
  x: number;
  z: number;
  /** Which bank, looking downstream (southbound): port = west side. */
  side: 'port' | 'starboard';
}

/** Daymarkers along the channel, alternating banks every ~34 m of
 *  arc — harbor-approach density for a short, narrow maintained cut —
 *  offset just outside the dredge cut. Generated from the channel line
 *  so the markers and the water can never disagree. Marking stops
 *  ~50 m short of the estuary head, where the maintained cut gives
 *  way to unmarked marsh creeks. */
export const BETA_DAYMARKERS: BetaDaymarker[] = (() => {
  const out: BetaDaymarker[] = [];
  const pts = BETA_SOUND_CHANNEL;
  let totalArc = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    totalArc += Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1]);
  }
  let arc = 0;
  let next = 34;
  let n = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    while (next < arc + len && next < totalArc - 50) {
      const t = (next - arc) / len;
      const cx = ax + dx * len * t;
      const cz = az + dz * len * t;
      const side = n % 2 === 0 ? 'port' : 'starboard';
      // Travel along the line runs from the sound entrance to the
      // estuary head (inland, roughly northbound). Port is the LEFT
      // bank on that heading, offset along the left normal
      // (dz, −dx) of the direction of travel; starboard mirrors it.
      const lx = dz;   // left normal of (dx, dz) in x/z plane (z south)
      const lz = -dx;
      const sgn = side === 'port' ? 1 : -1;
      out.push({
        id: `dm_${String(n + 1).padStart(2, '0')}`,
        x: Math.round((cx + lx * sgn * (BETA_CHANNEL_HALFWIDTH + 7)) * 10) / 10,
        z: Math.round((cz + lz * sgn * (BETA_CHANNEL_HALFWIDTH + 7)) * 10) / 10,
        side,
      });
      n++;
      next += 34;
    }
    arc += len;
  }
  return out;
})();

// ─── Fleet-home candidates (spec §2 logic; Phase 2 rules the final) ────────

export interface BetaVehiclePad {
  id: string;
  /** Vehicle def id, or 'reserved' for a pad held for a future vehicle. */
  vehicle: string;
  x: number;
  z: number;
  heading: number;
  /** Pad size [width, depth] in meters. */
  size: [number, number];
}

export interface BetaFleetHome {
  id: string;
  sector: string;
  role: string;
  note: string;
  pads: BetaVehiclePad[];
}

export const BETA_FLEET_HOMES: BetaFleetHome[] = [
  {
    id: 'citadel_yard', sector: 'citadel', role: 'road fleet',
    note: 'Spec §2: heavy truck lifts + diesel refinery at the Citadel — the road fleet\'s natural yard, on the NC-12 root with the causeway behind it.',
    pads: [
      { id: 'cy_prime', vehicle: 'semi_prime', x: 238, z: -204, heading: Math.PI, size: [13, 20] },
      { id: 'cy_sprinter', vehicle: 'sprinter_van', x: 266, z: -198, heading: Math.PI * 0.95, size: [8, 13] },
      { id: 'cy_gt500', vehicle: 'gt500', x: 292, z: -204, heading: Math.PI, size: [7, 12] },
      { id: 'cy_darkhorse', vehicle: 'reserved', x: 314, z: -198, heading: Math.PI * 0.95, size: [7, 12] },
    ],
  },
  {
    id: 'ridge_ops', sector: 'ridge', role: 'air + heavy ops',
    note: 'Spec §2: tactical helipad + heavy 6x6 vehicle operations at the Ridge — the Seahawk\'s home and the heavy reserve\'s.',
    pads: [
      { id: 'ro_seahawk', vehicle: 'seahawk', x: -430, z: -168, heading: -Math.PI / 2, size: [19, 19] },
      { id: 'ro_heavy', vehicle: 'reserved', x: -486, z: -158, heading: Math.PI * 0.7, size: [12, 16] },
    ],
  },
  {
    id: 'airbase_ne', sector: 'airbase', role: 'current fleet home (shipped siting)',
    note: 'The shipped game\'s fleet home (all vehicles respawn here per Ian\'s 2026-10-21 airbase order). Retained verbatim as a candidate; Phase 2 reconciles it against the two spec-logic sites above.',
    pads: [
      { id: 'ab_gt500', vehicle: 'gt500', x: 436, z: -104, heading: Math.PI * 0.3, size: [7, 12] },
      { id: 'ab_darkhorse', vehicle: 'reserved', x: 452, z: -92, heading: Math.PI * 0.3, size: [7, 12] },
      { id: 'ab_prime', vehicle: 'semi_prime', x: 500, z: -152, heading: -Math.PI / 2, size: [13, 20] },
      { id: 'ab_sprinter', vehicle: 'sprinter_van', x: 424, z: -146, heading: Math.PI * 0.85, size: [8, 13] },
      { id: 'ab_seahawk', vehicle: 'seahawk', x: 516, z: -104, heading: -Math.PI / 2, size: [19, 19] },
    ],
  },
];

/** Player spawn: the lighthouse grounds (canon — spawn stays at the light). */
export const BETA_PLAYER_SPAWN = { x: 596, z: -192, heading: Math.PI * 0.85 };

// ─── POI placements ─────────────────────────────────────────────────────────
//
// Every id in World.POI_DEFS appears exactly once, plus the CLAIM_SITES
// id 'military_base' (territory canon: the military compound IS the
// airbase POI under its Phase-3 name). Sites the Beta spec names map to
// their sectors; the rest are placed by biome logic and say so.

export interface BetaPoiPlacement {
  poiId: string;
  x: number;
  z: number;
  sector: string;
  note: string;
}

export const BETA_POI_PLACEMENTS: BetaPoiPlacement[] = [
  { poiId: 'lighthouse_base', x: 618, z: -218, sector: 'lighthouse', note: 'Spec sector: the tower grounds on the NE spit pad.' },
  { poiId: 'lighthouse_top', x: 618, z: -218, sector: 'lighthouse', note: 'Same ground as lighthouse_base (the lamp room is vertical, not a second site).' },
  { poiId: 'airbase', x: 468, z: -128, sector: 'airbase', note: 'The shipped complex center on the NE-coast pad.' },
  { poiId: 'military_base', x: 468, z: -128, sector: 'airbase', note: 'CLAIM_SITES id only (no POI_DEFS entry): territory canon identifies the Military Compound with the airbase POI.' },
  { poiId: 'tollgate', x: 268, z: -288, sector: 'citadel', note: 'The Tollkeepers work the Citadel\'s causeway gate (§2: Oregon Inlet Toll Fortress) — the island\'s exit moved from the old map\'s east side to the northern span, per the spec diagram.' },
  { poiId: 'warehouse', x: 236, z: -208, sector: 'citadel', note: 'Skulls forward cache in the Citadel freight yard — industrial ground under the fortress (biome/sector logic: the spec\'s freight point).' },
  { poiId: 'relay_station', x: -230, z: -190, sector: 'north_coast', note: 'On the relay knoll pad (y 8) on the forested NW headland — the Collective\'s west relay watching the bay mouth (§2: high-gain relay).' },
  { poiId: 'relay_switch', x: -222, z: -184, sector: 'north_coast', note: 'Keeps its shipped +8/+6 offset from the relay station.' },
  { poiId: 'shore_camp', x: 415, z: -52, sector: 'airbase', note: 'The tutorial claim on the NE beach south of the airbase — shore salvage + fish traps a short drive from spawn, as its shipped note promises (biome logic: starter shore).' },
  { poiId: 'town', x: 392, z: 168, sector: 'tern_rock', note: 'Spec sector: Cedar Shoal (the town holding) IS Tern Rock — houses, garages, the Union compound. The school (territory: part of the town holding, no separate POI) folds in here.' },
  { poiId: 'strip_mall', x: 348, z: 200, sector: 'tern_rock', note: 'Contested commercial strip on the Tern Rock beach road, south end of town (biome logic: town-adjacent).' },
  { poiId: 'gas_station', x: 252, z: 112, sector: 'tern_rock', note: 'Roadside ON the NC-12 corridor\'s southern reach — the fuel-economy anchor sits on the highway it serves (biome logic: corridor site).' },
  { poiId: 'raider_fort', x: 508, z: 84, sector: 'eastern_dunes', note: 'Rust Skulls main base in the SE dune field inland from Tern Rock (biome logic: open dunes, spike-wall ground).' },
  { poiId: 'dune_cache', x: 505, z: 128, sector: 'eastern_dunes', note: 'D.C.-road staging in the same dune field, SE of the fort (biome logic).' },
  { poiId: 'barn', x: -118, z: 38, sector: 'refuge', note: 'Union farm in the Refuge\'s agricultural orbit (§2: agrarian production) — fields west of the sanctuary, on the west fork.' },
  { poiId: 'forest_cache', x: -255, z: -45, sector: 'forest_spine', note: 'Hunting stash in the maritime forest spine (§1.1 biome placement), west-center.' },
  { poiId: 'jonah_camp', x: -368, z: -6, sector: 'forest_spine', note: 'The inland claim alternative: forest cover, deer, worse water — its shipped note, in the west forest below the spur (§1.1 biome placement).' },
  { poiId: 'wreck', x: -470, z: 96, sector: 'west_sound', note: 'The beached wreck on the marsh shore at the dredged channel\'s estuary reach — shore salvage on the sound littoral (§1.1 biome placement).' },
  { poiId: 'marina', x: -478, z: 222, sector: 'pier_hq', note: 'Spec sector: the marina IS the Pier HQ (same docks, same holders).' },
  { poiId: 'carrier', x: -548, z: 199, sector: 'west_sound', note: 'The beached Heavy Logistics Carrier in the dredged channel off the Pier\'s west shore (§3.3 names it a channel user) — anchored in −4 m water by design.' },
];

export interface BetaReservedSite {
  id: string;
  name: string;
  x: number;
  z: number;
  sector: string;
  note: string;
}

/** Beta-canon sites with surveyed ground but no current POI/content. */
export const BETA_RESERVED_SITES: BetaReservedSite[] = [
  { id: 'citadel', name: 'The Convoy Citadel', x: 268, z: -252, sector: 'citadel', note: 'Fortress point + causeway gate (the tollgate POI sits on its span). Container-kit content is a later phase.' },
  { id: 'refuge', name: 'The Refuge', x: -30, z: -10, sector: 'refuge', note: 'Sanctuary compound flat. Chapel/greenhouse content is a later phase.' },
  { id: 'ridge', name: 'The Ridge Protocol Redoubt', x: -520, z: -185, sector: 'ridge', note: 'Bluff redoubt + helipad (BETA_EXTRA_PADS). Bunker content is a later phase.' },
  { id: 'pier_hq', name: 'The Pier HQ', x: -478, z: 222, sector: 'pier_hq', note: 'Sector anchor; its live content is the marina POI at the same ground.' },
];

// ─── STRUCTURE STANDARD (Ian, 2026-10-21 — the high-poly law) ───────────────
//
// "This new map will be designed high poly — no more bullshit where
// y'all are using squares and rectangles." Binding on Phase 2/3
// structure work, recorded here so the layout carries its own law:
//
// Every sector structure set below is MODELED GEOMETRY under the same
// discipline as the vehicle protocol: subdivision-modeled forms,
// beveled edges (nothing terminates in a raw 90° primitive face),
// real PBR materials, modeled detail at touch distance, interiors
// where the player enters. Box-assembly kits are RETIRED as a visual
// standard. The airbase kit that landed 2026-10-21 is construction-
// correct (grid, connectivity, true cutouts) but VISUALLY PROVISIONAL
// under this law — it gets a modeled pass before it is final.
// Structures sit on this file's surveyed pads; a structure's collision
// is its modeled bounds (the terrain law's sibling: what you see is
// what you hit). Vegetation and props follow the same law — modeled
// assets placed by BETA_SCATTER, never billboards or textured boxes.

export interface BetaStructureSet {
  sector: string;
  /** Modeled structure groups to build for the sector (spec §2). */
  structures: string[];
  note: string;
}

export const BETA_STRUCTURE_SETS: BetaStructureSet[] = [
  {
    sector: 'citadel',
    structures: ['stacked 40ft container fortress (3 tiers, corrugated modeled containers)', 'hydraulic gate on the causeway', 'heavy truck lifts', 'diesel refinery (tanks, pipework, cracking tower)'],
    note: 'The Toll Fortress reads industrial and heavy — modeled steel, not colored boxes.',
  },
  {
    sector: 'lighthouse',
    structures: ['historic brick lighthouse with steel seismic bracing', 'parabolic radar arrays', 'container labs'],
    note: 'The tower is the island\'s landmark — full modeled masonry + ironwork, lamp room interior.',
  },
  {
    sector: 'refuge',
    structures: ['stone chapel infirmary', 'multi-span hydroponic greenhouses (modeled frames, real glazing)', 'timber palisades', 'water filtration plant'],
    note: 'The safe zone reads hand-built and kept: stone, timber, glass — no kit walls.',
  },
  {
    sector: 'pier_hq',
    structures: ['heavy-timber pilings + dockworks reaching SW into the shallows', 'marine icehouses', 'net crane hoists', 'workboat slips', 'perimeter palisade'],
    note: 'Timber and rope-and-pulley maritime detail; the harbor is a working place, modeled as one.',
  },
  {
    sector: 'ridge',
    structures: ['subterranean blast portal set in the granite face', 'comms watchtower', 'tactical helipad (BETA_EXTRA_PADS)', 'pine-canopy redoubt structures'],
    note: 'Federal concrete-and-steel in raw granite; the portal is a modeled cut into the bluff, not a door texture.',
  },
  {
    sector: 'tern_rock',
    structures: ['stilted beach cottages (modeled stilts, stairs, porches)', 'general store', 'marine garage', 'fuel dock'],
    note: 'Weathered coastal vernacular — every cottage a modeled house, none a box with a roof prism.',
  },
  {
    sector: 'airbase',
    structures: ['hangars', 'motor pool', 'quartermaster depot', 'control tower'],
    note: 'VISUALLY PROVISIONAL: the 2026-10-21 kit build is construction-correct and stays as the siting/blocking base until its modeled pass under this standard.',
  },
];

// ─── Vegetation & prop scatter (modeled assets only) ────────────────────────
//
// Phase-2 placement input: per material zone (betaTerrain's BetaZone),
// the modeled asset classes to scatter and their density class.
// Placement reads the one grid (height/slope/zone) — scatter can never
// float a tree or sink a prop, because it samples the same surface
// everything else does.

export interface BetaScatter {
  zone: 'sand' | 'marsh' | 'grass' | 'forest' | 'granite' | 'road' | 'seabed';
  assets: string[];
  density: 'none' | 'sparse' | 'medium' | 'high';
  note: string;
}

export const BETA_SCATTER: BetaScatter[] = [
  { zone: 'forest', assets: ['maritime live oak (modeled, Spanish moss)', 'loblolly pine (modeled)', 'wax myrtle understory'], density: 'high', note: 'The spine\'s occlusion canopy (§1.1) — full modeled trees; wind sway is a rig property, not a vertex hack.' },
  { zone: 'marsh', assets: ['black needle rush clumps (modeled)', 'spartina cordgrass tufts (modeled)'], density: 'medium', note: 'Tidal marsh reads from thousands of small modeled clumps at the waterline band.' },
  { zone: 'sand', assets: ['sea-oat dune grass tufts (modeled)', 'driftwood pieces'], density: 'sparse', note: 'Dune grass holds the foredune band; keep the beach itself clean.' },
  { zone: 'grass', assets: ['wax myrtle shrubs', 'pine saplings', 'wildflower patches'], density: 'medium', note: 'Meadow/field scatter around the Refuge and the interior.' },
  { zone: 'granite', assets: ['scrub pines on ledges', 'lichen boulder clusters (modeled rock)'], density: 'sparse', note: 'The bluffs stay mostly bare granite — scatter hugs the ledges and the plateau edge.' },
  { zone: 'road', assets: ['sand drifts against the corridor edge', 'debris and wreck props (modeled)'], density: 'sparse', note: 'Roads read traveled and weather-beaten; drifts sit on the shoulder, never the grade.' },
  { zone: 'seabed', assets: ['(none — the channel is marked by BETA_DAYMARKERS)'], density: 'none', note: 'Underwater scatter is a later phase if it ever earns its cost.' },
];
