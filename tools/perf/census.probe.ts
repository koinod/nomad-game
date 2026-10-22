// ─── PERF CENSUS PROBE (lane/perf) ──────────────────────────────────────────
//
// No GPU exists on this VM, so renderer.info is unavailable. This probe
// builds the REAL world scene in Node (the buildings.test harness
// pattern) and replicates the two culling decisions the renderer makes
// every frame:
//
//   main pass   — THREE.Frustum from a probe PerspectiveCamera vs each
//                 mesh's world bounding sphere (exactly what
//                 WebGLRenderer's projectObject tests), instanced
//                 meshes counting geometry-tris × instance count.
//   shadow pass — the sun's orthographic shadow camera (±75 m box,
//                 near 10 / far 700, seated 220 m along the sun dir
//                 from the snapped target, per World.updateSky) vs
//                 castShadow meshes.
//
// Scenes: (A) airbase fleet view, (B) stronghold interior (Refuge),
// (C) open island vista from the NW ridge. Vehicle + vegetation GLBs
// never load in Node, so their cost is computed from the shipped files
// directly (GLB header parse: mesh/primitive/tri/image counts) and
// from the pure placement function — labelled as such in the output.
//
// Run: npx vitest run --config tools/perf/vitest.probe.config.ts
import { describe, it } from 'vitest';
import * as THREE from 'three';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { World, heightAt } from '../../src/game/World';
import { mulberry32 } from '../../src/game/rng';
import {
  computeVegPlacements, VEG_CLASS_DEFS, vegDef, type VegPlacement,
} from '../../src/game/Vegetation';
import { betaSector } from '../../src/data/betaLayout';

// ─── canvas stub (same shape as src/tests/buildings.test.ts) ────────────────
function stubCanvas(): void {
  if (typeof document !== 'undefined') return;
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set: () => true,
  });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => ctx }
      : {}),
  };
}

// ─── GLB header parse ────────────────────────────────────────────────────────
interface GlbStats {
  meshes: number; prims: number; tris: number; images: number; imageBytes: number;
  namedTris: Map<string, number>; namedRadius: Map<string, number>;
}
function parseGlb(file: string): GlbStats {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const out: GlbStats = {
    meshes: 0, prims: 0, tris: 0, images: 0, imageBytes: 0,
    namedTris: new Map(), namedRadius: new Map(),
  };
  const meshTris: number[] = [];
  const meshRadius: number[] = [];
  for (const mesh of gltf.meshes ?? []) {
    out.meshes++;
    let mt = 0; let mr = 0;
    for (const prim of mesh.primitives ?? []) {
      out.prims++;
      const idx = prim.indices !== undefined
        ? gltf.accessors[prim.indices].count
        : gltf.accessors[prim.attributes.POSITION].count;
      mt += Math.floor(idx / 3);
      const pos = gltf.accessors[prim.attributes.POSITION];
      if (pos?.min && pos?.max) {
        const dx = pos.max[0] - pos.min[0], dy = pos.max[1] - pos.min[1], dz = pos.max[2] - pos.min[2];
        mr = Math.max(mr, Math.hypot(dx, dy, dz) / 2);
      }
    }
    meshTris.push(mt); meshRadius.push(mr);
    out.tris += mt;
  }
  for (const node of gltf.nodes ?? []) {
    if (node.mesh !== undefined && node.name) {
      out.namedTris.set(node.name, (out.namedTris.get(node.name) ?? 0) + meshTris[node.mesh]);
      out.namedRadius.set(node.name, Math.max(out.namedRadius.get(node.name) ?? 0, meshRadius[node.mesh]));
      // instanced-by-node vehicles repeat wheel meshes across nodes; the
      // per-node sum above already counts each node's draw of the mesh.
    }
  }
  for (const img of gltf.images ?? []) {
    out.images++;
    if (img.bufferView !== undefined) out.imageBytes += gltf.bufferViews[img.bufferView].byteLength;
  }
  return out;
}

// ─── scene census ────────────────────────────────────────────────────────────
interface SceneStats {
  drawCalls: number; tris: number; shadowCalls: number; shadowTris: number;
  byTop: Map<string, { calls: number; tris: number; shadowTris: number }>;
}
const _s = new THREE.Sphere();
function geoTris(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  return Math.floor((idx ? idx.count : pos ? pos.count : 0) / 3);
}
function census(root: THREE.Object3D, camFrustum: THREE.Frustum, sunFrustum: THREE.Frustum): SceneStats {
  const st: SceneStats = { drawCalls: 0, tris: 0, shadowCalls: 0, shadowTris: 0, byTop: new Map() };
  root.updateMatrixWorld(true);
  const tops = new Map<THREE.Object3D, string>();
  for (const child of root.children) tops.set(child, child.name || `${child.type}#${root.children.indexOf(child)}`);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let top = o;
    while (top.parent && top.parent !== root) top = top.parent;
    const label = tops.get(top) ?? '(detached)';
    let rec = st.byTop.get(label);
    if (!rec) { rec = { calls: 0, tris: 0, shadowTris: 0 }; st.byTop.set(label, rec); }
    if (!mesh.geometry) return;
    let tris = geoTris(mesh.geometry);
    let sphere: THREE.Sphere | null = null;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh;
      tris *= im.count;
      im.computeBoundingSphere();
      sphere = im.boundingSphere ? _s.copy(im.boundingSphere).applyMatrix4(mesh.matrixWorld) : null;
    } else {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      sphere = mesh.geometry.boundingSphere
        ? _s.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld) : null;
    }
    const visible = !mesh.frustumCulled || !sphere || camFrustum.intersectsSphere(sphere);
    if (visible) {
      const calls = Array.isArray(mesh.material) ? mesh.material.length : 1;
      st.drawCalls += calls; st.tris += tris;
      rec.calls += calls; rec.tris += tris;
    }
    if (mesh.castShadow && sphere && sunFrustum.intersectsSphere(sphere)) {
      st.shadowCalls += 1; st.shadowTris += tris;
      rec.shadowTris += tris;
    }
  });
  return st;
}

function frustumFor(pos: THREE.Vector3, look: THREE.Vector3): THREE.Frustum {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 3200);
  cam.position.copy(pos);
  cam.lookAt(look);
  cam.updateMatrixWorld(true);
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return new THREE.Frustum().setFromProjectionMatrix(m);
}
function sunFrustumFor(focus: THREE.Vector3): THREE.Frustum {
  // midday-ish sun dir, World.updateSky geometry: target at focus (y 0),
  // light seated at focus + dir * 220, ortho box ±75, near 10 far 700.
  const dir = new THREE.Vector3(0.45, 0.82, 0.35).normalize();
  const cam = new THREE.OrthographicCamera(-75, 75, 75, -75, 10, 700);
  cam.position.copy(focus).addScaledVector(dir, 220);
  cam.lookAt(focus.x, 0, focus.z);
  cam.updateMatrixWorld(true);
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return new THREE.Frustum().setFromProjectionMatrix(m);
}

// ─── vegetation simulation (current whole-island buckets vs chunked) ────────
interface VegSim { calls: number; tris: number; shadowTris: number }
function simVeg(
  placements: VegPlacement[], lodTris: Map<string, { l0: number; l1: number; r0: number; r1: number }>,
  camFrustum: THREE.Frustum, sunFrustum: THREE.Frustum, cell: number | null,
): VegSim {
  // group placements into draw units: (def,lod) today, (def,lod,cell) if cell
  const units = new Map<string, { def: string; lod: 0 | 1; pts: VegPlacement[] }>();
  for (const p of placements) {
    const key = cell === null
      ? `${p.def}:${p.lod}`
      : `${p.def}:${p.lod}:${Math.floor(p.x / cell)}:${Math.floor(p.z / cell)}`;
    let u = units.get(key);
    if (!u) { u = { def: p.def, lod: p.lod, pts: [] }; units.set(key, u); }
    u.pts.push(p);
  }
  const out: VegSim = { calls: 0, tris: 0, shadowTris: 0 };
  const sph = new THREE.Sphere();
  for (const u of units.values()) {
    const lt = lodTris.get(u.def)!;
    const trisPer = u.lod === 0 ? lt.l0 : lt.l1;
    const radius = (u.lod === 0 ? lt.r0 : lt.r1);
    // unit bounding sphere: centroid + max reach + model radius × max scale
    let cx = 0, cy = 0, cz = 0, maxScale = 0;
    for (const p of u.pts) { cx += p.x; cy += p.y; cz += p.z; maxScale = Math.max(maxScale, p.scale); }
    cx /= u.pts.length; cy /= u.pts.length; cz /= u.pts.length;
    let reach = 0;
    for (const p of u.pts) reach = Math.max(reach, Math.hypot(p.x - cx, p.y - cy, p.z - cz));
    sph.center.set(cx, cy, cz);
    sph.radius = reach + radius * maxScale;
    const total = trisPer * u.pts.length;
    if (camFrustum.intersectsSphere(sph)) { out.calls++; out.tris += total; }
    const def = vegDef(u.def as never);
    if (def.castShadow && u.lod === 0 && sunFrustum.intersectsSphere(sph)) out.shadowTris += total;
  }
  return out;
}

// ─── the probe ───────────────────────────────────────────────────────────────
describe('perf census', () => {
  it('prints the baseline', () => {
    stubCanvas();
    const root = process.cwd();
    const w = (s: string) => process.stdout.write(s + '\n');

    // — GLB fleet/veg file stats —
    const glbFiles = [
      'darkhorse.glb', 'gt500.glb', 'seahawk.glb',
      'models/nomad-prime.glb', 'models/sprinter.glb',
      'models/veg-live-oak.glb', 'models/veg-loblolly.glb', 'models/veg-wax-myrtle.glb',
      'models/veg-needle-rush.glb', 'models/veg-spartina.glb', 'models/veg-dune-grass.glb',
    ];
    const glbs = new Map<string, GlbStats>();
    w('── GLB files (parsed) ───────────────────────────────────────────');
    for (const f of glbFiles) {
      const p = path.join(root, 'public', f);
      if (!fs.existsSync(p)) { w(`${f}: MISSING`); continue; }
      const g = parseGlb(p);
      glbs.set(f, g);
      w(`${f}: meshes=${g.meshes} prims=${g.prims} tris=${g.tris} images=${g.images} imageBytes=${g.imageBytes}`);
    }
    // node-instanced tri totals for the vehicles (wheels repeat per node)
    const vehNodeTris = (f: string) => {
      const g = glbs.get(f)!;
      let t = 0;
      for (const v of g.namedTris.values()) t += v;
      return t || g.tris;
    };

    // — build the real world —
    const scene = new THREE.Scene();
    const world = new World(scene, 20261020);
    world.build();
    let meshCount = 0, geoSet = new Set<THREE.BufferGeometry>(), matSet = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { meshCount++; if (m.geometry) geoSet.add(m.geometry); const mm = m.material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => matSet.add(x)); }
    });
    w('── world scene graph ────────────────────────────────────────────');
    w(`meshes=${meshCount} uniqueGeometries=${geoSet.size} uniqueMaterials=${matSet.size}`);

    // — vegetation placements + LOD tri table from the real GLBs —
    const placements = computeVegPlacements(mulberry32(0xc0ffee));
    const lodTris = new Map<string, { l0: number; l1: number; r0: number; r1: number }>();
    for (const def of VEG_CLASS_DEFS) {
      const g = glbs.get(def.glb.replace('/models/', 'models/'))!;
      lodTris.set(def.id, {
        l0: g.namedTris.get('LOD0') ?? 0, l1: g.namedTris.get('LOD1') ?? 0,
        r0: g.namedRadius.get('LOD0') ?? 0, r1: g.namedRadius.get('LOD1') ?? 0,
      });
    }
    w(`veg placements=${placements.length} (lod0=${placements.filter((p) => p.lod === 0).length} lod1=${placements.filter((p) => p.lod === 1).length})`);

    // — probe scenes —
    const air = betaSector('airbase');
    const scenes: { name: string; pos: THREE.Vector3; look: THREE.Vector3; fleet: boolean }[] = [
      {
        name: 'A airbase fleet view',
        pos: new THREE.Vector3(air.x - 30, heightAt(air.x - 30, air.z + 25) + 3, air.z + 25),
        look: new THREE.Vector3(air.x + 20, heightAt(air.x, air.z) + 2, air.z - 10),
        fleet: true,
      },
      {
        name: 'B stronghold interior',
        pos: new THREE.Vector3(0, 0, 0), look: new THREE.Vector3(1, 0, 0), fleet: false,
      },
      {
        name: 'C island vista (NW ridge)',
        pos: new THREE.Vector3(-430, heightAt(-430, -190) + 26, -190),
        look: new THREE.Vector3(150, 4, 60),
        fleet: false,
      },
    ];
    // interior: inside the first Refuge sector kit building
    const refugeKit = world.sectorKits.find((k) => k.building.stories >= 1) ?? world.sectorKits[0];
    if (refugeKit) {
      const b = refugeKit.building;
      scenes[1].pos.set(b.cx - b.w / 4, b.baseY + 1.7, b.cz);
      scenes[1].look.set(b.cx + b.w / 2, b.baseY + 1.5, b.cz + b.d / 4);
    }

    for (const sc of scenes) {
      const cf = frustumFor(sc.pos, sc.look);
      const sf = sunFrustumFor(sc.pos);
      const st = census(scene, cf, sf);
      const vegNow = simVeg(placements, lodTris, cf, sf, null);
      const vegChunk = simVeg(placements, lodTris, cf, sf, 170);
      w(`── ${sc.name} ───────────────────────────────────────────`);
      w(`camera=(${sc.pos.x.toFixed(0)},${sc.pos.y.toFixed(0)},${sc.pos.z.toFixed(0)}) look=(${sc.look.x.toFixed(0)},${sc.look.y.toFixed(0)},${sc.look.z.toFixed(0)})`);
      w(`world meshes: calls=${st.drawCalls} tris=${st.tris} shadowCalls=${st.shadowCalls} shadowTris=${st.shadowTris}`);
      const top = [...st.byTop.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 8);
      for (const [label, r] of top) w(`   ${label}: calls=${r.calls} tris=${r.tris} shadowTris=${r.shadowTris}`);
      w(`vegetation sim (current whole-island buckets): calls=${vegNow.calls} tris=${vegNow.tris} shadowTris=${vegNow.shadowTris}`);
      w(`vegetation sim (170 m cells):                   calls=${vegChunk.calls} tris=${vegChunk.tris} shadowTris=${vegChunk.shadowTris}`);
      for (const cell of [120, 240, 320]) {
        const vc = simVeg(placements, lodTris, cf, sf, cell);
        w(`vegetation sim (${cell} m cells):                   calls=${vc.calls} tris=${vc.tris} shadowTris=${vc.shadowTris}`);
      }
      if (sc.fleet) {
        const fleet: [string, string][] = [
          ['gt500', 'gt500.glb'], ['dark_horse', 'darkhorse.glb'], ['nomad_prime', 'models/nomad-prime.glb'], ['sprinter', 'models/sprinter.glb'],
        ];
        let fm = 0, ft = 0;
        for (const [id, f] of fleet) { const g = glbs.get(f)!; fm += g.meshes; ft += vehNodeTris(f); w(`   fleet ${id}: nodes/meshes=${g.meshes} tris(node-summed)=${vehNodeTris(f)}`); }
        w(`   fleet total (all in frustum at the pads): meshes=${fm} tris=${ft} — each also re-drawn into the shadow pass while inside the sun box`);
        const sea = glbs.get('seahawk.glb')!;
        w(`   seahawk (static landmark): meshes=${sea.meshes} tris(node-summed)=${vehNodeTris('seahawk.glb')}`);
      }
    }
  }, 120000);
});
