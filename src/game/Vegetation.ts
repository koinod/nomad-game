// ─── MODELED VEGETATION (world dressing, BETA_SCATTER — 2026-10-22) ────────
//
// The modeled replacement for the retired cone/blob scatter. Every
// class BETA_SCATTER declares for the forest / marsh / sand / grass /
// granite zones is a real Blender-built model (tools/vegetation/
// build_vegetation.py): branching tube spines, noise-displaced canopy
// masses, leaf cards, blade strips — two LODs per GLB (LOD0 near:
// full structure + cards; LOD1 far: trunk + canopy masses of the same
// model), one vertex-colored mesh per LOD, instanced per class/LOD.
//
// Placement is pure and seeded (computeVegPlacements) so tests pin
// the whole contract without a renderer: zone membership per the
// BETA_SCATTER table, the surveyed-ground/road veto, the marsh
// waterline and foredune height bands, instance counts, the LOD
// near/far split, and the triangle budgets the GLBs are built under
// (VEG_TRI_BUDGET — mirrored in tools/vegetation/verify_glb.py).
//
// Wind: every class material is a plain vertexColors standard
// material patched by Clouds.applyWindSway, so vegetation rides the
// SAME world-position sway field as the clouds/grass it replaced —
// displacement is a pure function of world position, so no seam can
// tear and no instance can shake. Sway strength compensates the
// field's 1/scale falloff (see Clouds.ts): strength is authored so
// the WORLD-space tip amplitude lands near each def's target at its
// mid scale.

import * as THREE from 'three';
import {
  betaHeightAt, betaSlopeAt, betaZoneAt, betaRoadDistance, type BetaZone,
} from './betaTerrain';
import { BETA_SECTORS, BETA_EXTRA_PADS, BETA_POI_PLACEMENTS } from '../data/betaLayout';
import { applyWindSway } from './Clouds';

export type VegClassId =
  | 'live_oak' | 'loblolly' | 'loblolly_sapling' | 'loblolly_scrub'
  | 'wax_myrtle' | 'needle_rush' | 'spartina' | 'dune_grass';

export interface VegClassDef {
  id: VegClassId;
  /** GLB under public/ — defs may share a file (sapling/scrub are the
   *  loblolly model at other scales, per BETA_SCATTER's grass/granite
   *  rows naming pine saplings and scrub pines). */
  glb: string;
  /** Declared zones (BETA_SCATTER rows). */
  zones: BetaZone[];
  /** Instance target (rejection sampler; see floors in the tests). */
  target: number;
  /** Uniform instance scale range. */
  scale: [number, number];
  /** Road-clearance (m from centerline) for the scatter veto. */
  clearance: number;
  /** betaHeightAt band (m) the sampler enforces, if any. */
  heightBand?: [number, number];
  /** betaSlopeAt ceiling (rise/run), if any. */
  maxSlope?: number;
  /** applyWindSway params: strength is world tip amplitude × mid
   *  scale (the field divides by instance scale); height is the
   *  GLB's authored height (object-space, scale-invariant). */
  sway: { strength: number; height: number };
  /** Distance (m) to the road/POI network under which LOD0 is used. */
  lodNearDist: number;
  castShadow: boolean;
}

const MODELS = '/models';
export const VEG_CLASS_DEFS: VegClassDef[] = [
  {
    id: 'live_oak', glb: `${MODELS}/veg-live-oak.glb`, zones: ['forest'],
    target: 140, scale: [0.85, 1.5], clearance: 7,
    sway: { strength: 0.35, height: 6.5 }, lodNearDist: 65, castShadow: true,
  },
  {
    id: 'loblolly', glb: `${MODELS}/veg-loblolly.glb`, zones: ['forest'],
    target: 240, scale: [0.85, 1.5], clearance: 7,
    sway: { strength: 0.4, height: 12.5 }, lodNearDist: 42, castShadow: true,
  },
  {
    id: 'wax_myrtle', glb: `${MODELS}/veg-wax-myrtle.glb`, zones: ['forest', 'grass'],
    target: 210, scale: [0.8, 1.5], clearance: 6,
    sway: { strength: 0.23, height: 2.6 }, lodNearDist: 45, castShadow: true,
  },
  {
    // lodNearDist 0: a 2–4 m sapling never earns the near model — it
    // always draws the far LOD of the shared loblolly geometry.
    id: 'loblolly_sapling', glb: `${MODELS}/veg-loblolly.glb`, zones: ['grass'],
    target: 60, scale: [0.16, 0.3], clearance: 6,
    sway: { strength: 0.02, height: 12.5 }, lodNearDist: 0, castShadow: true,
  },
  {
    // lodNearDist 0: ledge pines are seen across slopes, never at
    // touch distance — far LOD only, like the saplings.
    id: 'loblolly_scrub', glb: `${MODELS}/veg-loblolly.glb`, zones: ['granite'],
    target: 42, scale: [0.38, 0.58], clearance: 6, maxSlope: 1.05,
    sway: { strength: 0.07, height: 12.5 }, lodNearDist: 0, castShadow: true,
  },
  {
    // Marsh waterline band: needle rush roots in the shallows at the
    // marsh's low edge (marsh zone heights run 0.05–1.15 by zone law).
    id: 'needle_rush', glb: `${MODELS}/veg-needle-rush.glb`, zones: ['marsh'],
    target: 850, scale: [0.8, 1.3], clearance: 5.5, heightBand: [0.02, 0.55],
    sway: { strength: 0.15, height: 1.4 }, lodNearDist: 26, castShadow: false,
  },
  {
    id: 'spartina', glb: `${MODELS}/veg-spartina.glb`, zones: ['marsh'],
    target: 1150, scale: [0.85, 1.35], clearance: 5.5, heightBand: [0.12, 1.12],
    sway: { strength: 0.15, height: 1.4 }, lodNearDist: 26, castShadow: false,
  },
  {
    // Foredune band: sand zone tops out at 2.3 m by zone law; the
    // grass holds the ridge above the swash, not the wet beach face.
    id: 'dune_grass', glb: `${MODELS}/veg-dune-grass.glb`, zones: ['sand'],
    target: 1050, scale: [0.8, 1.3], clearance: 5.5, heightBand: [0.7, 2.3],
    sway: { strength: 0.17, height: 1.3 }, lodNearDist: 26, castShadow: false,
  },
];

export function vegDef(id: VegClassId): VegClassDef {
  const d = VEG_CLASS_DEFS.find((v) => v.id === id);
  if (!d) throw new Error(`unknown veg class: ${id}`);
  return d;
}

/** Triangle ceilings per GLB file (basename), enforced against the
 *  shipped files by vegetation.test.ts and, in Blender, by
 *  tools/vegetation/verify_glb.py. Keeping a class under its ceiling
 *  is a build-time law, not a hope. */
export const VEG_TRI_BUDGET: Record<string, { lod0: number; lod1: number }> = {
  'veg-live-oak': { lod0: 1150, lod1: 330 },
  'veg-loblolly': { lod0: 1560, lod1: 190 },
  'veg-wax-myrtle': { lod0: 720, lod1: 220 },
  'veg-needle-rush': { lod0: 80, lod1: 30 },
  'veg-spartina': { lod0: 85, lod1: 30 },
  'veg-dune-grass': { lod0: 125, lod1: 26 },
};

// ─── scatter veto (shared: World delegates here) ─────────────────────────────

/** True when (x, z) stands on surveyed ground (a sector or extra pad,
 *  plus margin) — the flats are built ground; scatter keeps off. */
export function isSurveyedGround(x: number, z: number): boolean {
  for (const s of BETA_SECTORS) {
    if (Math.abs(x - s.x) < s.padHalf[0] + 3 && Math.abs(z - s.z) < s.padHalf[1] + 3) return true;
  }
  for (const p of BETA_EXTRA_PADS) {
    if (Math.abs(x - p.x) < p.half[0] + 3 && Math.abs(z - p.z) < p.half[1] + 3) return true;
  }
  return false;
}

/** The scatter veto: surveyed ground, or inside the road clearance. */
export function vegScatterVeto(x: number, z: number, roadClearance: number): boolean {
  return isSurveyedGround(x, z) || betaRoadDistance(x, z) < roadClearance;
}

// ─── placement ───────────────────────────────────────────────────────────────

export interface VegPlacement {
  def: VegClassId;
  x: number;
  z: number;
  /** Ground height the instance stands on (betaHeightAt). */
  y: number;
  scale: number;
  rotY: number;
  /** 0 = near (full model), 1 = far (trunk + canopy masses). */
  lod: 0 | 1;
}

/** Distance to the "watched ground" network: the road centerlines and
 *  every surveyed POI point. Instances near it get the full model —
 *  that is where eyes actually go; deep-forest instances get the far
 *  LOD of the same model (never a billboard). */
function watchedDistance(x: number, z: number): number {
  let d = betaRoadDistance(x, z);
  for (const p of BETA_POI_PLACEMENTS) {
    const dd = Math.hypot(x - p.x, z - p.z);
    if (dd < d) d = dd;
  }
  return d;
}

const SAMPLE_RECT = { x0: -690, x1: 690, z0: -310, z1: 310 };

/** All vegetation placements for a fresh world with this rng stream.
 *  Pure and deterministic: same stream in, same placements out. */
export function computeVegPlacements(rng: () => number): VegPlacement[] {
  const out: VegPlacement[] = [];
  for (const def of VEG_CLASS_DEFS) {
    let placed = 0;
    let guard = 0;
    const guardMax = def.target * 260;
    while (placed < def.target && guard++ < guardMax) {
      const x = SAMPLE_RECT.x0 + rng() * (SAMPLE_RECT.x1 - SAMPLE_RECT.x0);
      const z = SAMPLE_RECT.z0 + rng() * (SAMPLE_RECT.z1 - SAMPLE_RECT.z0);
      if (!def.zones.includes(betaZoneAt(x, z))) continue;
      if (vegScatterVeto(x, z, def.clearance)) continue;
      const y = betaHeightAt(x, z);
      if (def.heightBand && (y < def.heightBand[0] || y > def.heightBand[1])) continue;
      if (def.maxSlope !== undefined && betaSlopeAt(x, z) > def.maxSlope) continue;
      const scale = def.scale[0] + rng() * (def.scale[1] - def.scale[0]);
      const rotY = rng() * Math.PI * 2;
      const lod = watchedDistance(x, z) <= def.lodNearDist ? 0 : 1;
      out.push({ def: def.id, x, z, y, scale, rotY, lod });
      placed++;
    }
  }
  return out;
}

/** Tree placements only — the light-shaft anchor source (World). */
export function vegTreeAnchors(placements: VegPlacement[]): { x: number; y: number; z: number }[] {
  return placements
    .filter((p) => p.def === 'live_oak' || p.def === 'loblolly')
    .filter((_, i) => i % 15 === 0)
    .slice(0, 26)
    .map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

// ─── materials ───────────────────────────────────────────────────────────────

/** The one material recipe for vegetation: vertex colors carry the
 *  palette baked in Blender; the shared wind sway patch makes it ride
 *  the world-position field (Clouds.applyWindSway). DoubleSide
 *  because leaf cards and blades are single-sided geometry. */
export function vegMaterialFor(def: VegClassDef): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  applyWindSway(mat, { strength: def.sway.strength, height: def.sway.height });
  return mat;
}

// ─── the instanced layer ─────────────────────────────────────────────────────

interface VegGeos { lod0: THREE.BufferGeometry; lod1: THREE.BufferGeometry }
const geoCache = new Map<string, Promise<VegGeos | null>>();

function loadVegGeos(glb: string): Promise<VegGeos | null> {
  let p = geoCache.get(glb);
  if (!p) {
    p = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(glb))
      .then((gltf) => {
        const lod0 = gltf.scene.getObjectByName('LOD0') as THREE.Mesh | undefined;
        const lod1 = gltf.scene.getObjectByName('LOD1') as THREE.Mesh | undefined;
        if (!lod0 || !lod1) return null;
        return { lod0: lod0.geometry, lod1: lod1.geometry };
      })
      .catch(() => null);
    geoCache.set(glb, p);
  }
  return p;
}

/**
 * Builds one InstancedMesh per (class, LOD) from the placements.
 * GLBs load async (the Husks/Vehicles pattern): the layer populates
 * as each file arrives; a failed load leaves that class absent and
 * the game untouched. In node (tests) nothing loads — placements are
 * the contract there.
 */
export class VegetationLayer {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];

  constructor() {
    this.group.name = 'vegetation';
  }

  build(scene: THREE.Scene, placements: VegPlacement[]): void {
    scene.add(this.group);
    if (typeof window === 'undefined') return;
    // bucket placements by class + lod
    const buckets = new Map<string, VegPlacement[]>();
    for (const p of placements) {
      const key = `${p.def}:${p.lod}`;
      const arr = buckets.get(key);
      if (arr) arr.push(p);
      else buckets.set(key, [p]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const [key, arr] of buckets) {
      const [defId, lodStr] = key.split(':') as [VegClassId, string];
      const def = vegDef(defId);
      const lod = Number(lodStr) as 0 | 1;
      void loadVegGeos(def.glb).then((geos) => {
        if (!geos) {
          console.warn(`[Vegetation] ${def.glb} failed to load; class ${def.id} absent`);
          return;
        }
        const geo = lod === 0 ? geos.lod0 : geos.lod1;
        const im = new THREE.InstancedMesh(geo, vegMaterialFor(def), arr.length);
        arr.forEach((p, i) => {
          e.set(0, p.rotY, 0);
          q.setFromEuler(e);
          m.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.scale, p.scale, p.scale));
          im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        // Only the near LOD casts: the shadow camera is local to the
        // player, and an InstancedMesh draws whole into the shadow
        // pass — far-LOD shadows would cost the full set for nothing.
        im.castShadow = def.castShadow && lod === 0;
        im.receiveShadow = true;
        im.name = `veg:${def.id}:lod${lod}`;
        im.computeBoundingSphere();
        this.meshes.push(im);
        this.group.add(im);
      });
    }
  }
}
