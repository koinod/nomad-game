import * as THREE from 'three';
import { mulberry32 } from './rng';
import { betaHeightAt, betaRoadDistance, betaSlopeAt, betaZoneAt, type BetaZone } from './betaTerrain';
import { isSurveyedGround } from './Vegetation';
import { BETA_POI_PLACEMENTS, BETA_SECTORS } from '../data/betaLayout';

/**
 * GROUND MICRO-SCATTER (2026-10-22, ground-graphics lane): the
 * foot-level litter the detail texture can't do — real geometry the
 * eye catches against the light: pebbles, shell fragments, stone
 * chips and grass tufts, as ONE InstancedMesh clustered around the
 * sector grounds where feet actually go (spawn, strongholds, the
 * airbase). Zone-keyed density, zero gameplay footprint: no
 * colliders, not loot, no interaction — pure dressing, and cheap:
 * ~22 tris per cluster, ~1,300 clusters island-wide (≈29k tris in
 * the whole mesh, only a fraction in any one view).
 *
 * Placement is pure + deterministic (computeGroundScatter) so tests
 * pin the rules: never in water, never on a road or a surveyed pad,
 * never on a steep face. Heights come from the same betaHeightAt
 * sampler as everything else — the scatter stands on the ground the
 * physics knows, by construction.
 */

export interface GroundScatterPlacement {
  x: number;
  y: number; // betaHeightAt at (x, z), sunk 2 cm
  z: number;
  scale: number;
  rotY: number;
  zone: BetaZone;
  /** Per-instance color multiplier (zone tint × jitter), 0..1 rgb. */
  tint: [number, number, number];
}

/** Zones that take litter. Seabed is underwater, road/granite get
 *  none (roads are their own ribbon surface; granite faces are
 *  cliff, and the slope veto would take most of it anyway). */
const SCATTER_ZONES: BetaZone[] = ['sand', 'marsh', 'grass', 'forest'];

/** Per-zone density weight: beaches and marsh edges are littered,
 *  forest floor is comparatively clean under canopy. */
const ZONE_WEIGHT: Partial<Record<BetaZone, number>> = {
  sand: 1, marsh: 0.85, grass: 0.7, forest: 0.45,
};

/** Per-zone instance tint (multiplies the geometry's baked colors):
 *  pale shell-wash on sand, olive in the marsh, deeper green inland. */
const ZONE_TINT: Partial<Record<BetaZone, [number, number, number]>> = {
  sand: [1, 0.97, 0.88],
  marsh: [0.92, 0.95, 0.78],
  grass: [0.9, 1, 0.85],
  forest: [0.82, 0.92, 0.8],
};

export const SCATTER_PER_SECTOR_ATTEMPTS = 950;
export const SCATTER_RADIUS_M = 80;
/** POI sites (camps, caches, the wreck shore, the barn fields) get
 *  a tighter, lighter disc than the sector grounds. */
export const SCATTER_PER_POI_ATTEMPTS = 300;
export const SCATTER_POI_RADIUS_M = 46;
export const SCATTER_MAX_SLOPE = 0.55;
export const SCATTER_ROAD_CLEARANCE = 2.2;
export const SCATTER_MIN_Y = 0.25;

/**
 * All scatter placements for a fresh world. Deterministic in the
 * seed. Sectors are the anchors: a rejection-sampled disc around
 * each, density falling with radius so the dressing thins into the
 * wild instead of ending at a visible ring.
 */
export function computeGroundScatter(seed: number): GroundScatterPlacement[] {
  const rng = mulberry32(seed ^ 0x5ca77e3);
  const out: GroundScatterPlacement[] = [];
  // Anchors: the seven sector grounds (wide discs) + every distinct
  // POI site (tight discs) — litter where feet actually go, which
  // is also how the waist marsh (wreck shore, barn fields) gets its
  // share despite hosting no sector.
  const anchors: { x: number; z: number; attempts: number; radius: number }[] = [
    ...BETA_SECTORS.map((s) => ({ x: s.x, z: s.z, attempts: SCATTER_PER_SECTOR_ATTEMPTS, radius: SCATTER_RADIUS_M })),
  ];
  const seenPoi = new Set<string>();
  for (const poi of BETA_POI_PLACEMENTS) {
    const key = `${Math.round(poi.x)},${Math.round(poi.z)}`;
    if (seenPoi.has(key)) continue;
    seenPoi.add(key);
    anchors.push({ x: poi.x, z: poi.z, attempts: SCATTER_PER_POI_ATTEMPTS, radius: SCATTER_POI_RADIUS_M });
  }
  for (const anchor of anchors) {
    for (let n = 0; n < anchor.attempts; n++) {
      // uniform-in-disc sampling, then a radial falloff coin:
      // density is full at the grounds and thins to ~0.35 at the
      // rim — a fade, never a visible ring edge. (The sector cores
      // themselves are surveyed pads and veto out below; the litter
      // lives on the ground AROUND the settlements.)
      const r = anchor.radius * Math.sqrt(rng());
      if (rng() > 1 - 0.65 * (r / anchor.radius)) continue;
      const a = rng() * Math.PI * 2;
      const x = anchor.x + Math.cos(a) * r;
      const z = anchor.z + Math.sin(a) * r;
      const zone = betaZoneAt(x, z);
      if (!SCATTER_ZONES.includes(zone)) continue;
      if (rng() > (ZONE_WEIGHT[zone] ?? 0)) continue;
      const y = betaHeightAt(x, z);
      if (y < SCATTER_MIN_Y) continue; // water / wet seabed
      if (betaSlopeAt(x, z) > SCATTER_MAX_SLOPE) continue;
      if (betaRoadDistance(x, z) < SCATTER_ROAD_CLEARANCE) continue;
      if (isSurveyedGround(x, z)) continue; // pads are swept concrete
      const jitter = 0.85 + rng() * 0.3;
      const zt = ZONE_TINT[zone] ?? [1, 1, 1];
      out.push({
        x,
        y: y - 0.02,
        z,
        scale: 0.7 + rng() * 0.9,
        rotY: rng() * Math.PI * 2,
        zone,
        tint: [
          Math.min(1, zt[0] * jitter),
          Math.min(1, zt[1] * jitter),
          Math.min(1, zt[2] * jitter),
        ],
      });
    }
  }
  return out;
}

// ─── geometry ────────────────────────────────────────────────────────────────

/**
 * One litter cluster, hand-built non-indexed triangles with baked
 * vertex colors (the instanced material multiplies instance tint ×
 * vertex color):
 *   - a squashed octahedron pebble (8 tris), warm gray stone
 *   - two 4-tri stone chips, cooler gray
 *   - three bent grass blades (2 tris each), dry green
 * 22 tris total. Blades lean outward so a cluster reads from any
 * heading; the whole cluster spans ~0.35 m at scale 1.
 */
export function buildScatterGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (
    a: [number, number, number], b: [number, number, number], c: [number, number, number],
    color: [number, number, number],
  ) => {
    pos.push(...a, ...b, ...c);
    col.push(...color, ...color, ...color);
  };
  const stone: [number, number, number] = [0.62, 0.58, 0.52];
  const stoneCool: [number, number, number] = [0.55, 0.56, 0.58];
  const shell: [number, number, number] = [0.85, 0.8, 0.7];
  const blade: [number, number, number] = [0.36, 0.48, 0.22];
  const bladeDry: [number, number, number] = [0.55, 0.55, 0.3];

  // pebble: octahedron, squashed flat, offset from cluster center
  {
    const cx = 0.07, cz = 0.03, r = 0.085, ry = 0.05;
    const top: [number, number, number] = [cx, ry, cz];
    const bot: [number, number, number] = [cx, -0.015, cz];
    const ring: [number, number, number][] = [
      [cx + r, 0.012, cz], [cx, 0.012, cz + r * 0.8],
      [cx - r, 0.012, cz], [cx, 0.012, cz - r * 0.8],
    ];
    for (let i = 0; i < 4; i++) {
      const n = ring[(i + 1) % 4];
      tri(top, ring[i], n, stone);
      tri(bot, n, ring[i], stone);
    }
  }
  // two chips: squat pyramids (open base — the ground closes them)
  const chip = (cx: number, cz: number, r: number, h: number, color: [number, number, number]) => {
    const apex: [number, number, number] = [cx, h, cz];
    const corners: [number, number, number][] = [
      [cx + r, 0, cz + r * 0.6], [cx + r * 0.6, 0, cz - r],
      [cx - r, 0, cz - r * 0.5], [cx - r * 0.5, 0, cz + r],
    ];
    for (let i = 0; i < 4; i++) tri(apex, corners[i], corners[(i + 1) % 4], color);
  };
  chip(-0.09, 0.08, 0.05, 0.035, stoneCool);
  chip(-0.03, -0.1, 0.035, 0.05, shell);
  // three blades: narrow quads leaning out, tips bent by taper
  const bladeQuad = (bx: number, bz: number, ang: number, h: number, wdt: number, color: [number, number, number]) => {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const px = -dz, pz = dx; // perpendicular (blade width direction)
    const lean = 0.35;
    const base: [number, number, number] = [bx, 0, bz];
    const base2: [number, number, number] = [bx + px * wdt, 0, bz + pz * wdt];
    const tip: [number, number, number] = [bx + dx * lean * h + px * wdt * 0.3, h, bz + dz * lean * h + pz * wdt * 0.3];
    const tip2: [number, number, number] = [bx + dx * lean * h + px * wdt * 0.7, h, bz + dz * lean * h + pz * wdt * 0.7];
    tri(base, base2, tip2, color);
    tri(base, tip2, tip, color);
  };
  bladeQuad(-0.05, -0.04, 0.7, 0.24, 0.035, blade);
  bladeQuad(0.02, 0.09, 2.6, 0.19, 0.03, bladeDry);
  bladeQuad(0.1, -0.06, 4.4, 0.28, 0.032, blade);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Triangles in one cluster — the budget number the tests pin. */
export const SCATTER_CLUSTER_TRIS = 22;

/** The layer: one InstancedMesh, no shadows cast (perf), receives
 *  shadow, invisible to every gameplay system. */
export class GroundScatterLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;

  constructor(placements: GroundScatterPlacement[]) {
    const geo = buildScatterGeometry();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide, // blades are single-quad
    });
    this.count = placements.length;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(placements.length, 1));
    this.mesh.name = 'ground-scatter';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    placements.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rotY);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, sc.set(p.scale, p.scale, p.scale));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, col.setRGB(p.tint[0], p.tint[1], p.tint[2]));
    });
    this.mesh.count = placements.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }
}
