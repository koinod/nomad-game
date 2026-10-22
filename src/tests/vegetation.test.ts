// Modeled vegetation (BETA_SCATTER) — the contract pins.
//
// Four families:
//  1. The shipped GLBs obey the build law: exactly LOD0/LOD1 nodes,
//     one primitive each, vertex colors present, triangle counts under
//     the VEG_TRI_BUDGET ceilings, authored height matching the sway
//     height the engine patches with.
//  2. Placement: every instance stands in its class's declared zone
//     (BETA_SCATTER), off surveyed ground, outside its road
//     clearance, inside its height band / slope cap, at a scale
//     inside its band — and counts land on target.
//  3. Determinism: same seed stream, same world.
//  4. Wind: every class material carries the Clouds sway patch, and
//     the sway field at each class's authored height behaves (zero at
//     the ground, bounded by the class strength at the top).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VEG_CLASS_DEFS, VEG_TRI_BUDGET, computeVegPlacements, vegDef, vegMaterialFor,
  isSurveyedGround, type VegClassId,
} from '../game/Vegetation';
import { betaHeightAt, betaSlopeAt, betaZoneAt, betaRoadDistance } from '../game/betaTerrain';
import { swayDisplacementAt } from '../game/Clouds';
import { mulberry32 } from '../game/rng';
import { BETA_SCATTER } from '../data/betaLayout';
import { buildWorld } from './buildings.test';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(HERE, '..', '..', 'public', 'models');

// ─── GLB reading (header + JSON chunk only; no renderer needed) ─────────────

interface GlbJson {
  nodes: { name?: string; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { count: number; min?: number[]; max?: number[] }[];
}

function readGlb(file: string): GlbJson {
  const buf = readFileSync(join(MODELS_DIR, file));
  expect(buf.readUInt32LE(0), file).toBe(0x46546c67); // 'glTF'
  const jsonLen = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16), file).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as GlbJson;
}

function lodMesh(glb: GlbJson, lod: string) {
  const node = glb.nodes.find((n) => n.name === lod);
  if (!node || node.mesh === undefined) return null;
  return glb.meshes[node.mesh];
}

function meshTris(glb: GlbJson, mesh: NonNullable<ReturnType<typeof lodMesh>>): number {
  let tris = 0;
  for (const prim of mesh.primitives) {
    const counted = prim.indices !== undefined
      ? glb.accessors[prim.indices].count
      : glb.accessors[prim.attributes.POSITION].count;
    tris += counted / 3;
  }
  return tris;
}

function meshHeight(glb: GlbJson, mesh: NonNullable<ReturnType<typeof lodMesh>>): number {
  const acc = glb.accessors[mesh.primitives[0].attributes.POSITION];
  return (acc.max![1] - acc.min![1]);
}

const GLB_FILES = [...new Set(VEG_CLASS_DEFS.map((d) => d.glb.split('/').pop()!))];

describe('vegetation GLBs — build law', () => {
  it('every class file ships exactly the LOD0/LOD1 node contract', () => {
    for (const file of GLB_FILES) {
      const glb = readGlb(file);
      const names = glb.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
      expect(names, file).toEqual(expect.arrayContaining(['LOD0', 'LOD1']));
      expect(names, file).toHaveLength(2);
      for (const lod of ['LOD0', 'LOD1']) {
        const mesh = lodMesh(glb, lod)!;
        expect(mesh, `${file} ${lod}`).not.toBeNull();
        // one primitive: the engine instances it with a single material
        expect(mesh.primitives, `${file} ${lod}`).toHaveLength(1);
        // vertex colors carry the palette
        expect(mesh.primitives[0].attributes.COLOR_0, `${file} ${lod}`).toBeDefined();
      }
    }
  });

  it('triangle counts stay under the budget ceilings', () => {
    for (const file of GLB_FILES) {
      const base = file.replace('.glb', '');
      const budget = VEG_TRI_BUDGET[base];
      expect(budget, base).toBeDefined();
      const glb = readGlb(file);
      const t0 = meshTris(glb, lodMesh(glb, 'LOD0')!);
      const t1 = meshTris(glb, lodMesh(glb, 'LOD1')!);
      expect(t0, `${base} LOD0`).toBeGreaterThan(0);
      expect(t1, `${base} LOD1`).toBeGreaterThan(0);
      expect(t0, `${base} LOD0 ${t0} > ${budget.lod0}`).toBeLessThanOrEqual(budget.lod0);
      expect(t1, `${base} LOD1 ${t1} > ${budget.lod1}`).toBeLessThanOrEqual(budget.lod1);
      // the far LOD must actually be cheaper — that is its whole job
      expect(t1, `${base} LOD1 not cheaper`).toBeLessThan(t0);
    }
  });

  it('authored GLB height matches the sway height the engine patches', () => {
    // one primary def per file (defs sharing a file share its height)
    const primaries: Partial<Record<string, VegClassId>> = {
      'veg-live-oak.glb': 'live_oak',
      'veg-loblolly.glb': 'loblolly',
      'veg-wax-myrtle.glb': 'wax_myrtle',
      'veg-needle-rush.glb': 'needle_rush',
      'veg-spartina.glb': 'spartina',
      'veg-dune-grass.glb': 'dune_grass',
    };
    for (const [file, id] of Object.entries(primaries)) {
      const glb = readGlb(file);
      const h = meshHeight(glb, lodMesh(glb, 'LOD0')!);
      expect(Math.abs(h - vegDef(id!).sway.height), `${file}: ${h}`).toBeLessThanOrEqual(0.35);
    }
  });
});

// ─── placement ───────────────────────────────────────────────────────────────

const placements = computeVegPlacements(mulberry32(0x5eed));
const byDef = (id: VegClassId) => placements.filter((p) => p.def === id);

describe('vegetation placement — zones, veto, bands', () => {
  it('every instance stands in a zone its class declares', () => {
    for (const p of placements) {
      const def = vegDef(p.def);
      expect(def.zones, `${p.def} at ${p.x},${p.z}`).toContain(betaZoneAt(p.x, p.z));
    }
  });

  it('nothing sprouts on surveyed ground or inside road clearance', () => {
    for (const p of placements) {
      expect(isSurveyedGround(p.x, p.z), `${p.def} at ${p.x},${p.z}`).toBe(false);
      const def = vegDef(p.def);
      expect(betaRoadDistance(p.x, p.z), `${p.def} at ${p.x},${p.z}`)
        .toBeGreaterThanOrEqual(def.clearance - 1e-6);
    }
  });

  it('marsh + dune classes sit in their height bands, on the ground', () => {
    for (const p of placements) {
      const def = vegDef(p.def);
      // the instance stands on the one terrain truth
      expect(p.y).toBeCloseTo(betaHeightAt(p.x, p.z), 6);
      if (def.heightBand) {
        expect(p.y, `${p.def} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(def.heightBand[0] - 1e-6);
        expect(p.y, `${p.def} at ${p.x},${p.z}`).toBeLessThanOrEqual(def.heightBand[1] + 1e-6);
      }
    }
    // the waterline claim, stated plainly: rush roots below spartina's
    // band ceiling, and every rush clump is in the tidal band
    for (const p of byDef('needle_rush')) {
      expect(betaZoneAt(p.x, p.z)).toBe('marsh');
      expect(p.y).toBeLessThanOrEqual(0.55);
    }
    for (const p of byDef('dune_grass')) {
      expect(betaZoneAt(p.x, p.z)).toBe('sand');
      expect(p.y).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('scrub pines respect their ledge slope cap', () => {
    for (const p of byDef('loblolly_scrub')) {
      expect(betaSlopeAt(p.x, p.z)).toBeLessThanOrEqual(vegDef('loblolly_scrub').maxSlope! + 1e-6);
    }
  });

  it('counts land on target and scales stay in band', () => {
    for (const def of VEG_CLASS_DEFS) {
      const arr = byDef(def.id);
      expect(arr.length, def.id).toBeGreaterThanOrEqual(Math.floor(def.target * 0.97));
      expect(arr.length, def.id).toBeLessThanOrEqual(def.target);
      for (const p of arr) {
        expect(p.scale, def.id).toBeGreaterThanOrEqual(def.scale[0]);
        expect(p.scale, def.id).toBeLessThanOrEqual(def.scale[1]);
      }
    }
  });

  it('saplings and scrub pines always draw the far LOD', () => {
    for (const p of [...byDef('loblolly_sapling'), ...byDef('loblolly_scrub')]) {
      expect(p.lod).toBe(1);
    }
    // while the canopy classes use both LODs
    for (const id of ['live_oak', 'loblolly', 'needle_rush'] as VegClassId[]) {
      const lods = new Set(byDef(id).map((p) => p.lod));
      expect(lods, id).toEqual(new Set([0, 1]));
    }
  });

  it('is deterministic for a fixed seed stream', () => {
    const again = computeVegPlacements(mulberry32(0x5eed));
    expect(again).toEqual(placements);
  });
});

// ─── BETA_SCATTER table ↔ engine mapping ─────────────────────────────────────

describe('BETA_SCATTER declarations are all served by a class def', () => {
  // [substring in the scatter table's asset names, def id]
  const SERVED: [string, VegClassId][] = [
    ['live oak', 'live_oak'],
    ['loblolly pine', 'loblolly'],
    ['wax myrtle understory', 'wax_myrtle'],
    ['wax myrtle shrubs', 'wax_myrtle'],
    ['pine saplings', 'loblolly_sapling'],
    ['scrub pines', 'loblolly_scrub'],
    ['needle rush', 'needle_rush'],
    ['spartina', 'spartina'],
    ['dune grass', 'dune_grass'],
  ];
  it('each declared vegetation asset maps to a def in the same zone', () => {
    for (const [needle, id] of SERVED) {
      const row = BETA_SCATTER.find((s) => s.assets.some((a) => a.includes(needle)));
      expect(row, needle).toBeDefined();
      expect(vegDef(id).zones, `${needle} -> ${id}`).toContain(row!.zone);
    }
  });
});

// ─── wind ────────────────────────────────────────────────────────────────────

describe('vegetation wind sway', () => {
  it('every class material carries the shared sway patch', () => {
    for (const def of VEG_CLASS_DEFS) {
      const mat = vegMaterialFor(def);
      // applyWindSway stamps this cache key; an unpatched material
      // falling out of the factory would break the pin loudly.
      expect(mat.customProgramCacheKey(), def.id).toBe('nomad-wind-sway-v2');
      expect(mat.vertexColors, def.id).toBe(true);
    }
  });

  it('the field is zero at ground level and bounded by class strength at the top', () => {
    for (const def of VEG_CLASS_DEFS) {
      const base = swayDisplacementAt(120, -40, 0, 3.3, 0.8, 0.6, 0.8, def.sway.strength);
      // exactly zero displacement (the field may return -0; magnitude is the law)
      expect(Math.abs(base.x), def.id).toBe(0);
      expect(Math.abs(base.z), def.id).toBe(0);
      for (const t of [0, 1.7, 4.2, 9.9]) {
        const top = swayDisplacementAt(120, -40, 1, t, 1, 0.6, 0.8, def.sway.strength);
        // |D| <= maxAmp always (the field's own law, Clouds.ts)
        expect(Math.hypot(top.x, top.z), `${def.id} t=${t}`)
          .toBeLessThanOrEqual(def.sway.strength + 1e-9);
      }
    }
  });

  it('two vertices at the same world position displace identically (no tearing)', () => {
    const a = swayDisplacementAt(-255, -45, 0.7, 2.2, 0.5, 1, 0, 0.35);
    const b = swayDisplacementAt(-255, -45, 0.7, 2.2, 0.5, 1, 0, 0.35);
    expect(a).toEqual(b);
  });
});

// ─── world wiring ────────────────────────────────────────────────────────────

describe('world wiring', () => {
  it('World.build constructs the vegetation layer on the scene', () => {
    const world = buildWorld();
    expect(world.vegetation).not.toBeNull();
    expect(world.vegetation!.group.name).toBe('vegetation');
    expect(world.scene.children).toContain(world.vegetation!.group);
    // light shafts still anchor in the forest (now on modeled trees)
    expect(world.lightShafts).not.toBeNull();
  });
});
