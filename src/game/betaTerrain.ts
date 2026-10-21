import * as THREE from 'three';
import {
  BETA_SECTORS, BETA_EXTRA_PADS, BETA_ROADS, BETA_SOUND_CHANNEL,
  BETA_CHANNEL_DEPTH, BETA_CHANNEL_HALFWIDTH, type BetaRoad,
} from '../data/betaLayout';

// ─── BETA TERRAIN (map restart, Phase 1 — Ian's order 2026-10-21) ──────────
//
// "Delete the way topos works... just restart the map" — from the Beta
// Island spec + aerial (design-refs/world-specs/), which are the ONLY
// blueprint. DERIVATION, stated plainly:
//   * The coastline is a signed-distance composition (ellipses +
//     capsules, smooth-min union) fitted to the aerial's silhouette at
//     the layout's stated scale mapping: the NE spit capsule, the east
//     lobes, the central mass, the west block, the Citadel point, and
//     the northern causeway land bridge are separate primitives you can
//     point at in the render.
//   * Elevation masses follow spec §1.1: an east foredune band inside
//     the Atlantic shore, marsh flats pulled to tidal heights in the
//     west/interior, a forest-plateau lift on the spine, and the NW
//     granite massif rising to the scaled +180 m class (×0.35 ≈ 63 m).
//   * Everything surveyed — sector pads, the road network (§2 diagram +
//     §3.3), and the dredged sound channel (§3.3) — comes from
//     data/betaLayout.ts and is graded INTO the grid below.
//
// FOUNDATION LAW (unchanged, and why this restart exists): one authored
// grid is the only terrain truth. The mesh's vertices are the grid
// nodes; the Rapier heightfield is fed the grid nodes; betaHeightAt()
// interpolates the same two triangles per cell that the mesh renders
// and Rapier collides. Vehicles floated because three surfaces
// disagreed between samples; here there is only one surface, and the
// authored field is SMOOTH at driving scale (broad fbm swells, no
// cusped ridge noise), so a wheel crossing a cell meets a surface.
// betaTerrain.test.ts proves the identity against a real Rapier world.
//
// HIGH-POLY LAW (Ian, 2026-10-21): the map is designed high-poly — no
// squares-and-rectangles terrain. This grid IS the mesh tessellation:
// 1.25 m cells over the full rect ≈ 575k vertices / ~1.15M triangles
// in 32 chunks, smooth-shaded from shared nodes, so dunes, bluff
// faces, marsh banks, and the dredged channel read as carved,
// continuous landforms — never faceted ramps or stepped terraces.
// The density is the visual standard AND the driving standard in one.

// ── Grid geometry ────────────────────────────────────────────────────────────

export const BETA_WORLD = { xMin: -700, xMax: 700, zMin: -320, zMax: 320 };
/** 1.25 m cells: a wheel contact patch (~0.2 m) crosses a cell in
 *  ~45 ms at 100 km/h, and on this smooth field the triangle surface
 *  stays within ~1–2 cm of any smooth read between nodes (test-bounded).
 *  The old island ran 2 m cells under cusped noise and its three
 *  surfaces disagreed by up to 1.17 m. */
export const BETA_CELL_M = 1.25;
export const BETA_COLS = Math.round((BETA_WORLD.xMax - BETA_WORLD.xMin) / BETA_CELL_M); // 1120
export const BETA_ROWS = Math.round((BETA_WORLD.zMax - BETA_WORLD.zMin) / BETA_CELL_M); // 512
const STRIDE = BETA_COLS + 1;

export function betaNodeX(i: number): number {
  return BETA_WORLD.xMin + (i / BETA_COLS) * (BETA_WORLD.xMax - BETA_WORLD.xMin);
}
export function betaNodeZ(j: number): number {
  return BETA_WORLD.zMin + (j / BETA_ROWS) * (BETA_WORLD.zMax - BETA_WORLD.zMin);
}

// ── Small math (self-contained; deterministic — no Math.random anywhere) ────

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Polynomial smooth-min (shape blending for the landmass union). */
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}
/** Deterministic 2D value noise, smooth-interpolated. */
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (a: number, b: number): number => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return lerp(
    lerp(h(xi, zi), h(xi + 1, zi), u),
    lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u),
    v,
  ) * 2 - 1;
}
function fbm(x: number, z: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s; // ≈ [−1, 1]
}

// ── Landmass SDF (the aerial's silhouette as fitted primitives) ─────────────

interface Ellipse { cx: number; cz: number; rx: number; rz: number }
/** Approximate signed distance to an ellipse (negative inside). */
function ellipseSd(e: Ellipse, x: number, z: number): number {
  const dx = (x - e.cx) / e.rx;
  const dz = (z - e.cz) / e.rz;
  const q = Math.sqrt(dx * dx + dz * dz);
  return (q - 1) * Math.min(e.rx, e.rz);
}
function capsuleSd(ax: number, az: number, bx: number, bz: number, r: number, x: number, z: number): number {
  const px = x - ax;
  const pz = z - az;
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp((px * dx + pz * dz) / (dx * dx + dz * dz), 0, 1);
  const ex = px - dx * t;
  const ez = pz - dz * t;
  return Math.hypot(ex, ez) - r;
}

const MASS_PARTS: Ellipse[] = [
  { cx: -430, cz: -40, rx: 300, rz: 250 },  // west block (forest + bluffs)
  { cx: 60, cz: 10, rx: 330, rz: 235 },     // central mass (the Refuge island)
  { cx: 430, cz: -150, rx: 230, rz: 130 },  // NE lobe (airbase coast)
  { cx: 470, cz: 20, rx: 170, rz: 190 },    // east-coast bridge lobe
  { cx: 330, cz: 160, rx: 220, rz: 120 },   // SE lobe (Tern Rock)
  { cx: -180, cz: 190, rx: 260, rz: 110 },  // south marsh lobe
  { cx: 268, cz: -248, rx: 115, rz: 58 },   // Citadel point at the bay mouth
];
const SPIT: [number, number, number, number, number] = [505, -160, 648, -238, 50]; // NE lighthouse spit
const CAUSEWAY: [number, number, number, number, number] = [268, -330, 268, -240, 26]; // northern land bridge

function islandSd(x: number, z: number): number {
  // Seed with the first part: smin(Infinity, …) would lerp through
  // Infinity·0 = NaN.
  let d = ellipseSd(MASS_PARTS[0], x, z);
  for (let n = 1; n < MASS_PARTS.length; n++) d = smin(d, ellipseSd(MASS_PARTS[n], x, z), 55);
  d = smin(d, capsuleSd(SPIT[0], SPIT[1], SPIT[2], SPIT[3], SPIT[4], x, z), 40);
  d = smin(d, capsuleSd(CAUSEWAY[0], CAUSEWAY[1], CAUSEWAY[2], CAUSEWAY[3], CAUSEWAY[4], x, z), 30);
  return d;
}

// ── Region masks (authored; shared by the landform and the zone read) ───────

const BLUFF: Ellipse = { cx: -505, cz: -165, rx: 185, rz: 140 };
const MARSH_A: Ellipse = { cx: -300, cz: 150, rx: 300, rz: 170 };
const MARSH_B: Ellipse = { cx: -120, cz: 215, rx: 280, rz: 110 };
const FOREST_PARTS: Ellipse[] = [
  { cx: -260, cz: -30, rx: 240, rz: 190 },
  { cx: -470, cz: -120, rx: 260, rz: 190 },
  { cx: 120, cz: 30, rx: 240, rz: 170 },
];
const qMask = (e: Ellipse, x: number, z: number): number => {
  const dx = (x - e.cx) / e.rx;
  const dz = (z - e.cz) / e.rz;
  return smoothstep(1.05, 0.55, dx * dx + dz * dz);
};
export function betaMarshMask(x: number, z: number): number {
  return Math.max(qMask(MARSH_A, x, z), qMask(MARSH_B, x, z));
}
export function betaForestMask(x: number, z: number): number {
  let m = 0;
  for (const e of FOREST_PARTS) m = Math.max(m, qMask(e, x, z));
  return m;
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function polylineDist(pts: readonly (readonly [number, number])[], x: number, z: number): number {
  let d = Infinity;
  for (let s = 0; s + 1 < pts.length; s++) {
    d = Math.min(d, segDist(x, z, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]));
  }
  return d;
}

// ── The landform (pre-pad, pre-road) ─────────────────────────────────────────

function seabedAt(x: number, z: number): number {
  // §1.1: deep Atlantic east; shallow sound shoals west with sandbars;
  // the north bay and south sound between.
  const east = smoothstep(150, 520, x);
  const west = smoothstep(-150, -450, x);
  const bay = qMask({ cx: 150, cz: -345, rx: 330, rz: 130 }, x, z);
  const sound = qMask({ cx: -250, cz: 345, rx: 430, rz: 140 }, x, z);
  let h = -6;
  h = lerp(h, -13.5, east);
  h = lerp(h, -1.15 + fbm(x * 0.008 + 3.1, z * 0.008, 3) * 0.5, west);
  h = lerp(h, -3.6, bay * 0.85);
  h = lerp(h, -2.3, sound * 0.8);
  return h;
}

function landformAt(x: number, z: number): number {
  const sd = islandSd(x, z);
  // Inland base: broad smooth swells only — nothing a wheel can catch on.
  let land = 2.7 + fbm(x * 0.004 + 7.3, z * 0.004 - 3.1) * 2.1 + fbm(x * 0.02, z * 0.02, 3) * 0.32;
  land += betaForestMask(x, z) * 0.9;                       // forest spine lift (§1.1)
  land = lerp(land, 0.55 + fbm(x * 0.011 + 1.7, z * 0.011, 3) * 0.4, betaMarshMask(x, z)); // tidal flats
  // East foredunes (§1.1): a low smooth ridge band inside the Atlantic shore.
  const coastIn = -sd;
  if (x > 240 && coastIn > 8 && coastIn < 60) {
    const band = smoothstep(8, 26, coastIn) * smoothstep(60, 34, coastIn);
    land += band * (1.15 + fbm(x * 0.013 - 5.2, z * 0.013, 3) * 0.55);
  }
  // NW granite foothills (§1.1): +180 m at UE scale → the ×0.35 mapping's
  // ≈63 m massif — a real plateau with steep faces and a rolling top.
  const bluffSd = ellipseSd(BLUFF, x, z);
  const bluffCore = smoothstep(55, -45, bluffSd);
  land = lerp(land, 63 + fbm(x * 0.006 - 2.2, z * 0.006 + 4.4, 3) * 3, bluffCore);
  // Coast blend: landform → seabed across the waterline.
  const sea = seabedAt(x, z);
  let h = lerp(sea, land, smoothstep(16, -12, sd));
  // The dredged sound channel (§3.3): carved to navigable depth,
  // downward only — it cuts land and deepens shoals alike.
  const cd = polylineDist(BETA_SOUND_CHANNEL, x, z);
  if (h > BETA_CHANNEL_DEPTH) {
    const w = 1 - smoothstep(BETA_CHANNEL_HALFWIDTH, BETA_CHANNEL_HALFWIDTH + 27, cd);
    h = lerp(h, BETA_CHANNEL_DEPTH, w);
  }
  return h;
}

// ── Grid build ───────────────────────────────────────────────────────────────

let grid: Float32Array | null = null;

interface PadSpec { cx: number; cz: number; hw: number; hd: number; y: number }

const BETA_PADS: PadSpec[] = [
  ...BETA_SECTORS.map((s) => ({ cx: s.x, cz: s.z, hw: s.padHalf[0], hd: s.padHalf[1], y: s.padY })),
  ...BETA_EXTRA_PADS.map((p) => ({ cx: p.x, cz: p.z, hw: p.half[0], hd: p.half[1], y: p.y })),
];

/** Stamp the surveyed pads into a grid array by COMPOSITION: each node
 *  takes the strongest pad influence acting on it (weight 1 inside a
 *  rect, feathering to 0 over the 24 m ring outside it; ties go to the
 *  smaller, more specific pad). A node's own pad interior therefore
 *  reads exactly its surveyed height no matter whose feather ring
 *  reaches it — sequential stamping cannot promise that.
 *  With `roadAwareRing`, ring nodes (weight < 1) inside a road corridor
 *  are left to the road stamp: a road descending from a pad keeps its
 *  own graded surface through the pad's feather instead of being
 *  dragged sideways toward the pad height. Interiors always stamp. */
function stampBetaPads(g: Float32Array, roadAwareRing = false): void {
  const wBest = new Float32Array(g.length);
  const yBest = new Float32Array(g.length);
  const aBest = new Float32Array(g.length).fill(Infinity);
  for (const p of BETA_PADS) {
    const area = p.hw * p.hd;
    const i0 = Math.max(0, Math.floor(((p.cx - p.hw - 30 - BETA_WORLD.xMin) / BETA_CELL_M)));
    const i1 = Math.min(BETA_COLS, Math.ceil(((p.cx + p.hw + 30 - BETA_WORLD.xMin) / BETA_CELL_M)));
    const j0 = Math.max(0, Math.floor(((p.cz - p.hd - 30 - BETA_WORLD.zMin) / BETA_CELL_M)));
    const j1 = Math.min(BETA_ROWS, Math.ceil(((p.cz + p.hd + 30 - BETA_WORLD.zMin) / BETA_CELL_M)));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = betaNodeX(i);
        const z = betaNodeZ(j);
        const m = Math.max(Math.abs(x - p.cx) - p.hw, Math.abs(z - p.cz) - p.hd);
        if (m >= 25.5) continue;
        const w = 1 - smoothstep(1.5, 25.5, m);
        const idx = j * STRIDE + i;
        if (w > wBest[idx] || (w === wBest[idx] && area < aBest[idx])) {
          wBest[idx] = w;
          yBest[idx] = p.y;
          aBest[idx] = area;
        }
      }
    }
  }
  for (let idx = 0; idx < g.length; idx++) {
    if (wBest[idx] <= 0) continue;
    if (roadAwareRing && wBest[idx] < 1) {
      const i = idx % STRIDE;
      const j = Math.floor(idx / STRIDE);
      if (betaRoadDistance(betaNodeX(i), betaNodeZ(j)) < 8) continue;
    }
    g[idx] = lerp(g[idx], yBest[idx], wBest[idx]);
  }
}

/** Generate the authored grid (idempotent; ~575k nodes, deterministic).
 *  Order matters: landform → pads → roads → pads. Road profiles read
 *  the surveyed flats, so a road ramps INTO a pad's height instead of
 *  fighting it; the second pad pass then re-asserts every interior
 *  exactly, so a road crossing a pad (the Citadel gate) can never dent
 *  the flat it serves. */
export function buildBetaGrid(): Float32Array {
  if (grid) return grid;
  const g = new Float32Array(STRIDE * (BETA_ROWS + 1));
  for (let j = 0; j <= BETA_ROWS; j++) {
    for (let i = 0; i <= BETA_COLS; i++) {
      g[j * STRIDE + i] = landformAt(betaNodeX(i), betaNodeZ(j));
    }
  }
  stampBetaPads(g);
  gradeBetaRoads(g);
  stampBetaPads(g, true);
  grid = g;
  return g;
}

/** Triangle-split sample of a grid array — the SAME two triangles the
 *  mesh builds and Rapier's heightfield renders (diagonal h10–h01,
 *  probed in the shipped system). Mesh == physics == sampler. */
function sampleGrid(g: Float32Array, x: number, z: number): number {
  const fx = clamp(((x - BETA_WORLD.xMin) / (BETA_WORLD.xMax - BETA_WORLD.xMin)) * BETA_COLS, 0, BETA_COLS - 1e-4);
  const fz = clamp(((z - BETA_WORLD.zMin) / (BETA_WORLD.zMax - BETA_WORLD.zMin)) * BETA_ROWS, 0, BETA_ROWS - 1e-4);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const h00 = g[j * STRIDE + i];
  const h10 = g[j * STRIDE + i + 1];
  const h01 = g[(j + 1) * STRIDE + i];
  const h11 = g[(j + 1) * STRIDE + i + 1];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return (h10 + h01 - h11) + (h11 - h01) * tx + (h11 - h10) * tz;
}

/** Grade every road of the network into a grid array (mutates it). */
function gradeBetaRoads(g: Float32Array): void {
  for (const road of BETA_ROADS) gradeRoad(g, road);
}

/** The longitudinal profile is the pre-road field along the centerline,
 *  grade-clamped by iterated forward/backward walks (one pair makes
 *  every consecutive step legal; iterating pulls the result back
 *  toward the field between constraints). NO kernel smoothing: a
 *  centered kernel is one-sided at the endpoints and drags a pad's
 *  surveyed height toward the road's average — the field is smooth
 *  by design, so the raw read needs no smoothing. The corridor then
 *  stamps the profile across its halfwidth with a feathered shoulder. */
function gradeRoad(g: Float32Array, road: BetaRoad): void {
  const pts = road.points;
  const samples: { x: number; z: number; arc: number; h: number }[] = [];
  let arc = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(len / 2.5));
    for (let k = s === 0 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      samples.push({ x, z, arc: arc + len * t, h: 0 });
    }
    arc += len;
  }
  for (const sm of samples) sm.h = sampleGrid(g, sm.x, sm.z);
  const prof = samples.map((sm) => sm.h);
  const step = samples.length > 1 ? samples[1].arc - samples[0].arc : 2.5;
  const maxDelta = road.maxGrade * step;
  for (let iter = 0; iter < 2; iter++) {
    for (let n = 1; n < prof.length; n++) prof[n] = clamp(prof[n], prof[n - 1] - maxDelta, prof[n - 1] + maxDelta);
    for (let n = prof.length - 2; n >= 0; n--) prof[n] = clamp(prof[n], prof[n + 1] - maxDelta, prof[n + 1] + maxDelta);
  }
  // Interpolate the profile on the samples' TRUE arc positions —
  // assuming uniform spacing warps the stamp wherever a segment's
  // sample spacing differs from the first segment's.
  const profAt = (a: number): number => {
    if (a <= 0) return prof[0];
    if (a >= samples[samples.length - 1].arc) return prof[prof.length - 1];
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].arc <= a) lo = mid;
      else hi = mid;
    }
    const span = samples[hi].arc - samples[lo].arc;
    return lerp(prof[lo], prof[hi], span > 0 ? (a - samples[lo].arc) / span : 0);
  };
  // Stamp by WHOLE-POLYLINE projection: each node takes the profile
  // at its nearest centerline arc, weighted by its distance to the
  // line. (Per-segment stamping with a clamped t paints a disk of the
  // vertex's height around every bend — where the profile climbs at
  // its legal max, the next segment's backward reach drags the
  // previous segment's end nodes and doubles the local grade.)
  const reach = road.halfWidth + 9;
  const segLens: number[] = [];
  let ux0 = Infinity;
  let ux1 = -Infinity;
  let uz0 = Infinity;
  let uz1 = -Infinity;
  for (let s = 0; s + 1 < pts.length; s++) {
    segLens.push(Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1]));
  }
  for (const [px, pz] of pts) {
    ux0 = Math.min(ux0, px);
    ux1 = Math.max(ux1, px);
    uz0 = Math.min(uz0, pz);
    uz1 = Math.max(uz1, pz);
  }
  const i0 = Math.max(0, Math.floor((ux0 - reach - BETA_WORLD.xMin) / BETA_CELL_M));
  const i1 = Math.min(BETA_COLS, Math.ceil((ux1 + reach - BETA_WORLD.xMin) / BETA_CELL_M));
  const j0 = Math.max(0, Math.floor((uz0 - reach - BETA_WORLD.zMin) / BETA_CELL_M));
  const j1 = Math.min(BETA_ROWS, Math.ceil((uz1 + reach - BETA_WORLD.zMin) / BETA_CELL_M));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = betaNodeX(i);
      const z = betaNodeZ(j);
      let bestD = Infinity;
      let bestArc = 0;
      let secondD = Infinity;
      let secondArc = 0;
      let a0 = 0;
      for (let s = 0; s + 1 < pts.length; s++) {
        const ax = pts[s][0];
        const az = pts[s][1];
        const dx = pts[s + 1][0] - ax;
        const dz = pts[s + 1][1] - az;
        const segLen = segLens[s];
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (segLen * segLen), 0, 1);
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d < bestD) {
          secondD = bestD;
          secondArc = bestArc;
          bestD = d;
          bestArc = a0 + segLen * t;
        } else if (d < secondD) {
          secondD = d;
          secondArc = a0 + segLen * t;
        }
        a0 += segLen;
      }
      if (bestD > reach) continue;
      // Blend the two nearest segments' profile reads with
      // inverse-square weights — but ONLY in the true bisector zone
      // (distances nearly equal): at a switchback vertex the legs run
      // inside each other's reach, and a hard nearest-wins flip
      // between arcs far apart in profile carves a crease across the
      // bench. Away from a bisector the nearest segment owns the node
      // outright — a climbing leg's shoulder must never be dragged
      // toward the contour leg running below it in plan.
      const k1 = 1 / (0.35 + bestD) ** 2;
      const k2 = secondD <= reach && secondD - bestD < 1.5 && Math.abs(secondArc - bestArc) < 6
        ? 1 / (0.35 + secondD) ** 2
        : 0;
      const target = k2 > 0
        ? (profAt(bestArc) * k1 + profAt(secondArc) * k2) / (k1 + k2)
        : profAt(bestArc);
      const w = 1 - smoothstep(road.halfWidth, reach, bestD);
      const idx = j * STRIDE + i;
      g[idx] = lerp(g[idx], target, w);
    }
  }
}

// ── The sampler (the heightAt of the restarted map) ──────────────────────────

/** Ground height at (x, z) on the Beta grid — triangle-split read of
 *  the one authored field. Pure, deterministic; clamps to the rect. */
export function betaHeightAt(x: number, z: number): number {
  return sampleGrid(buildBetaGrid(), x, z);
}

/** Slope magnitude (rise/run) at a point, finite difference of the sampler. */
export function betaSlopeAt(x: number, z: number): number {
  const e = 1.5;
  const dx = betaHeightAt(x + e, z) - betaHeightAt(x - e, z);
  const dz = betaHeightAt(x, z + e) - betaHeightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** Distance to the nearest road centerline (any network road). */
export function betaRoadDistance(x: number, z: number): number {
  let d = Infinity;
  for (const r of BETA_ROADS) d = Math.min(d, polylineDist(r.points, x, z));
  return d;
}

/** Distance to the dredged channel centerline. */
export function betaChannelDistance(x: number, z: number): number {
  return polylineDist(BETA_SOUND_CHANNEL, x, z);
}

// ── Material zones (spec §1.1 palette) ───────────────────────────────────────

export type BetaZone = 'sand' | 'marsh' | 'grass' | 'forest' | 'granite' | 'road' | 'seabed';

export const BETA_ZONE_COLORS: Record<BetaZone, [number, number, number]> = {
  sand: [0.8, 0.72, 0.52],
  marsh: [0.32, 0.44, 0.28],
  grass: [0.42, 0.52, 0.3],
  forest: [0.2, 0.34, 0.18],
  granite: [0.45, 0.44, 0.46],
  road: [0.36, 0.35, 0.34],
  seabed: [0.16, 0.3, 0.33],
};

/** The §1.1 biome at a point, from the grid's own height/slope plus the
 *  authored marsh/forest masks and the road network. */
export function betaZoneAt(x: number, z: number): BetaZone {
  const h = betaHeightAt(x, z);
  if (h < 0.05) return 'seabed';
  if (betaRoadDistance(x, z) <= 4.4 && h > 0.4) return 'road';
  const slope = betaSlopeAt(x, z);
  if (slope > 0.52) return 'granite';
  if (h < 1.15 && betaMarshMask(x, z) > 0.35) return 'marsh';
  const sd = islandSd(x, z);
  if (h < 2.3 && sd > -34) return 'sand';
  if (betaForestMask(x, z) > 0.5) return 'forest';
  return 'grass';
}

// ── Mesh builder (chunked; vertices ARE the grid nodes) ──────────────────────

/** Build the terrain meshes: chunked BufferGeometries whose vertex
 *  heights are the grid nodes verbatim, triangulated on the sampler's
 *  diagonal, per-vertex zone colors. Positions are world-space so a
 *  vertex anywhere reads (x, grid, z). */
export function buildBetaTerrainChunks(opts: { chunks?: [number, number] } = {}): THREE.BufferGeometry[] {
  const g = buildBetaGrid();
  const [chunksX, chunksZ] = opts.chunks ?? [8, 4];
  const cellsPerChunkX = Math.ceil(BETA_COLS / chunksX);
  const cellsPerChunkZ = Math.ceil(BETA_ROWS / chunksZ);
  const out: THREE.BufferGeometry[] = [];
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const i0 = cx * cellsPerChunkX;
      const i1 = Math.min(BETA_COLS, i0 + cellsPerChunkX);
      const j0 = cz * cellsPerChunkZ;
      const j1 = Math.min(BETA_ROWS, j0 + cellsPerChunkZ);
      if (i1 <= i0 || j1 <= j0) continue;
      const nx = i1 - i0 + 1;
      const nz = j1 - j0 + 1;
      const pos = new Float32Array(nx * nz * 3);
      const col = new Float32Array(nx * nz * 3);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const vi = (j - j0) * nx + (i - i0);
          const x = betaNodeX(i);
          const z = betaNodeZ(j);
          pos[vi * 3] = x;
          pos[vi * 3 + 1] = g[j * STRIDE + i];
          pos[vi * 3 + 2] = z;
          const c = BETA_ZONE_COLORS[betaZoneAt(x, z)];
          const grain = 1 + vnoise(i * 0.9 + 31.7, j * 0.9 - 8.4) * 0.05;
          col[vi * 3] = c[0] * grain;
          col[vi * 3 + 1] = c[1] * grain;
          col[vi * 3 + 2] = c[2] * grain;
        }
      }
      const idx: number[] = [];
      for (let j = 0; j + 1 < nz; j++) {
        for (let i = 0; i + 1 < nx; i++) {
          const a = j * nx + i;       // h00
          const b = a + 1;            // h10
          const c = a + nx;           // h01
          const d = c + 1;            // h11
          // The sampler's two triangles {00,10,01} / {10,11,01},
          // wound (00,01,10) / (10,01,11) so normals face up (+Y).
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      out.push(geo);
    }
  }
  return out;
}

// ── Rapier heightfield builder ───────────────────────────────────────────────

/** The physics field for the restarted map, in the layout CarPhysics
 *  probed for the shipped system: heights[ix * (rows+1) + iz], Rapier's
 *  swapped subdivision args (nsubdivx counts the Z nodes). Heights are
 *  the grid nodes verbatim — no sampler round-trip. */
export function buildBetaRapierHeightfield(): {
  heights: Float32Array;
  nsubdivx: number;
  nsubdivz: number;
  scale: { x: number; y: number; z: number };
} {
  const g = buildBetaGrid();
  const heights = new Float32Array(STRIDE * (BETA_ROWS + 1));
  for (let ix = 0; ix <= BETA_COLS; ix++) {
    for (let iz = 0; iz <= BETA_ROWS; iz++) {
      heights[ix * (BETA_ROWS + 1) + iz] = g[iz * STRIDE + ix];
    }
  }
  return {
    heights,
    nsubdivx: BETA_ROWS,
    nsubdivz: BETA_COLS,
    scale: { x: BETA_WORLD.xMax - BETA_WORLD.xMin, y: 1, z: BETA_WORLD.zMax - BETA_WORLD.zMin },
  };
}
