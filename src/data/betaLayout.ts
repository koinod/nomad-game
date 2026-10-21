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
    // the sound channel's east bank.
    id: 'nc12_west_fork', maxGrade: 0.08, halfWidth: 4.2,
    points: [[-92, 2], [-160, 34], [-224, 74], [-272, 108], [-318, 142], [-366, 166], [-402, 186], [-446, 210]],
  },
  {
    // Inland Highway Spur (§2 diagram): the Ridge climb — a ~900 m
    // contour traverse of the massif's south face: an approach from
    // the Refuge's south gate, long legs along the face's contour
    // bands (holding elevation while they run E–W), and short climbs
    // between bands, so the graded profile tracks the field and
    // arrives at the pad already at pad height. 4 m → 60 m at a 14%
    // mountain grade (steep alpine switchbacks run 12–15%).
    id: 'inland_spur', maxGrade: 0.14, halfWidth: 4.2,
    points: [
      [-70, -44], [-140, -34], [-230, -24], [-320, -30], [-420, -38],
      [-540, -24], [-520, -70], [-600, -80], [-520, -178],
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
// The navigable water road: north bay → down the west sound past the
// Pier HQ, dredged to −4.2 m against the −1 m-class shoals so the Salt
// Skiff and the Heavy Logistics Carrier can move. betaTerrain carves it
// into the height data; daymarkers (below) line it.

export const BETA_SOUND_CHANNEL: [number, number][] = [
  [120, -300], [30, -215], [-70, -140], [-185, -60], [-262, 32],
  [-322, 112], [-398, 150], [-540, 158], [-556, 240], [-540, 300],
];
export const BETA_CHANNEL_DEPTH = -4.2;
/** Full-depth halfwidth of the dredge cut (m); banks feather beyond it. */
export const BETA_CHANNEL_HALFWIDTH = 17;

export interface BetaDaymarker {
  id: string;
  x: number;
  z: number;
  /** Which bank, looking downstream (southbound): port = west side. */
  side: 'port' | 'starboard';
}

/** Daymarkers along the channel, alternating banks every ~85 m of arc,
 *  offset just outside the dredge cut. Generated from the channel line
 *  so the markers and the water can never disagree. Marking stops
 *  ~140 m short of the harbor end — the Pier's own basin takes over. */
export const BETA_DAYMARKERS: BetaDaymarker[] = (() => {
  const out: BetaDaymarker[] = [];
  const pts = BETA_SOUND_CHANNEL;
  let totalArc = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    totalArc += Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1]);
  }
  let arc = 0;
  let next = 40;
  let n = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    while (next < arc + len && next < totalArc - 140) {
      const t = (next - arc) / len;
      const cx = ax + dx * len * t;
      const cz = az + dz * len * t;
      const side = n % 2 === 0 ? 'port' : 'starboard';
      // Downstream direction is southbound; port (west) = left of
      // travel = perpendicular (−dz, dx) rotated — for a southbound
      // heading (+z), port is +x?? No: facing +z (south), left hand is
      // EAST. Port = left = east on this heading convention; the
      // west bank is starboard. Keep the geometry honest: offset along
      // the left normal for port, right normal for starboard.
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
      next += 85;
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
  { poiId: 'wreck', x: -470, z: 96, sector: 'west_sound', note: 'The beached wreck on the marsh shore west of the dredged channel — shore salvage (§1.1 biome placement: sound littoral).' },
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
