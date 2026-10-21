// export_airfield.ts — gate-evidence tooling (not game code).
// Runs the REAL kit build for the airfield and dumps it as OBJ+MTL plus a
// camera manifest, so the buildings can be contact-sheet rendered in
// Blender before anyone wires them into World.build.
// Run: npx vite-node tools/export_airfield.ts
import * as fs from 'node:fs';
import * as THREE from 'three';
import { buildAirfield } from '../src/game/Airfield';
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

const af = buildAirfield((x, z) => heightAt(x, z));

interface MeshRec { color: string; verts: number[]; norms: number[]; idx: number[] }
const byColor = new Map<string, MeshRec>();
let vOff = 0;

function colorOf(mat: THREE.Material | THREE.Material[]): string {
  const m = Array.isArray(mat) ? mat[0] : mat;
  const c = (m as THREE.MeshStandardMaterial).color;
  return c ? '#' + c.getHexString() : '#888888';
}

function eat(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
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
  });
}

for (const r of af.results) eat(r.group);
eat(af.groundGroup);

const mtlNames = new Map<string, string>();
let mi = 0;
for (const key of byColor.keys()) mtlNames.set(key, 'c' + (mi++));

let obj = 'mtllib airfield.mtl\n';
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

const manifest = af.results.map((r) => {
  const box = new THREE.Box3().setFromObject(r.group);
  return {
    id: r.building.id,
    center: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2],
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
});
const all = new THREE.Box3();
for (const r of af.results) all.union(new THREE.Box3().setFromObject(r.group));
all.union(new THREE.Box3().setFromObject(af.groundGroup));

fs.writeFileSync('/tmp/airfield.obj', obj);
fs.writeFileSync('/tmp/airfield.mtl', mtl);
fs.writeFileSync('/tmp/airfield_manifest.json', JSON.stringify({
  buildings: manifest,
  scene: { min: [all.min.x, all.min.y, all.min.z], max: [all.max.x, all.max.y, all.max.z] },
}, null, 2));
console.log('EXPORTED', manifest.map((m) => m.id).join(', '),
  'verts', vOff, 'colors', byColor.size);
