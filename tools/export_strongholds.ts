// export_strongholds.ts — gate-evidence tooling (not game code).
// Runs the REAL sector build and dumps each stronghold as OBJ+MTL plus
// a camera manifest, so every sector can be contact-sheet rendered in
// Blender (eye level + overhead) as proof of the §3.2 kit build-out.
// Also emits per-sector piece/triangle counts for the proof REPORT.
// Run: npx vite-node tools/export_strongholds.ts
import * as fs from 'node:fs';
import * as THREE from 'three';
import { buildSectors } from '../src/game/Sectors';
import { SECTOR_BUILDINGS, resolveSpotWorld, spotSectorId } from '../src/game/sectorSites';
import { heightAt } from '../src/game/World';

// headless canvas stub (same pattern as tests/buildings.test.ts)
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
    ? { width: 0, height: 0, getContext: () => ctx, toDataURL: () => '' }
    : {}),
};

const built = buildSectors((x, z) => heightAt(x, z));

interface MeshRec { color: string; verts: number[]; norms: number[]; idx: number[] }

function colorOf(mat: THREE.Material | THREE.Material[]): string {
  const m = Array.isArray(mat) ? mat[0] : mat;
  const c = (m as THREE.MeshStandardMaterial).color;
  return c ? '#' + c.getHexString() : '#888888';
}

function trisOf(obj: THREE.Object3D): number {
  let tris = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    tris += Math.floor(((g.index ? g.index.count : g.getAttribute('position').count)) / 3);
  });
  return tris;
}

function exportScene(objs: THREE.Object3D[], base: string, label: string): { verts: number; tris: number } {
  const byColor = new Map<string, MeshRec>();
  let vOff = 0;
  let tris = 0;
  for (const root of objs) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const key = colorOf(mesh.material);
      if (!byColor.has(key)) byColor.set(key, { color: key, verts: [], norms: [], idx: [] });
      const rec = byColor.get(key)!;
      for (let i = 0; i < pos.count; i++) {
        rec.verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        rec.norms.push(nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0);
        rec.idx.push(vOff + i + 1);
      }
      vOff += pos.count;
      tris += Math.floor(pos.count / 3);
    });
  }
  const mtlNames = new Map<string, string>();
  let mi = 0;
  for (const key of byColor.keys()) mtlNames.set(key, 'c' + (mi++));
  let obj = `mtllib ${label}.mtl\n`;
  for (const rec of byColor.values()) {
    obj += `usemtl ${mtlNames.get(rec.color)}\n`;
    for (let i = 0; i < rec.verts.length; i += 3) {
      obj += `v ${rec.verts[i].toFixed(4)} ${rec.verts[i + 1].toFixed(4)} ${rec.verts[i + 2].toFixed(4)}\n`;
    }
    for (let i = 0; i < rec.norms.length; i += 3) {
      obj += `vn ${rec.norms[i].toFixed(4)} ${rec.norms[i + 1].toFixed(4)} ${rec.norms[i + 2].toFixed(4)}\n`;
    }
    for (let i = 0; i < rec.idx.length; i += 3) {
      const a = rec.idx[i], b = rec.idx[i + 1], c = rec.idx[i + 2];
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
  }
  let mtl = '';
  for (const [hex, name] of mtlNames) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    mtl += `newmtl ${name}\nKd ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}\nKa 0 0 0\nKs 0.1 0.1 0.1\nNs 24\n`;
  }
  fs.writeFileSync(`${base}.obj`, obj);
  fs.writeFileSync(`${base}.mtl`, mtl);
  return { verts: vOff, tris };
}

// ---- per-sector export: sector kits + the whole ground group clipped
// by nothing (the ground group is exported once, whole-scene, below;
// per-sector scenes carry the kits plus a ground PLANE in the render).
const sectors: Record<string, string[]> = {};
for (const spot of SECTOR_BUILDINGS) {
  const s = spotSectorId(spot);
  (sectors[s] ??= []).push(spot.id);
}

const counts: Record<string, { pieces: number; tris: number; kits: string[] }> = {};
const manifest: Record<string, unknown> = {};

for (const [sector, ids] of Object.entries(sectors)) {
  const kits = built.kits.filter((r) => ids.includes(r.building.id));
  const { tris } = exportScene(kits.map((r) => r.group), `/tmp/strong_${sector}`, sector);
  const pieces = kits.reduce((n, r) => n + r.building.pieces.length, 0);
  counts[sector] = { pieces, tris, kits: ids };
  const box = new THREE.Box3();
  for (const r of kits) box.union(new THREE.Box3().setFromObject(r.group));
  manifest[sector] = {
    buildings: kits.map((r) => {
      const b = new THREE.Box3().setFromObject(r.group);
      const spot = SECTOR_BUILDINGS.find((s) => s.id === r.building.id)!;
      const [wx, wz] = resolveSpotWorld(spot);
      return {
        id: r.building.id, center: [wx, heightAt(wx, wz), wz],
        min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z],
      };
    }),
    scene: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] },
  };
}

// ground works, whole-scene (fortress, palisades, refinery, slips…)
const ground = exportScene([built.groundGroup], '/tmp/strong_ground', 'ground');
counts._ground = { pieces: built.features.length, tris: ground.tris, kits: built.features.map((f) => f.id) };
const gbox = new THREE.Box3().setFromObject(built.groundGroup);
manifest._ground = { scene: { min: [gbox.min.x, gbox.min.y, gbox.min.z], max: [gbox.max.x, gbox.max.y, gbox.max.z] } };

fs.writeFileSync('/tmp/strong_manifest.json', JSON.stringify(manifest, null, 2));
fs.writeFileSync('/tmp/strong_counts.json', JSON.stringify(counts, null, 2));
console.log('EXPORTED sectors:', Object.keys(sectors).join(', '),
  '| ground tris:', ground.tris,
  '| per-sector:', Object.entries(counts).map(([k, v]) => `${k}=${v.pieces}p/${v.tris}t`).join(' '));
