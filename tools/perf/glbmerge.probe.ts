// ─── GLB MERGE VERIFICATION (lane/perf) ─────────────────────────────────────
// Runs mergeVehicleStatics against the REAL shipped GLBs (parsed from
// disk — the image-free files parse fully in Node) and asserts the
// merge is lossless + surgical: identical drawn-triangle total, every
// MOD_* / Wheel* / anchor node still present, mesh count collapsed.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVehicleStatics } from '../../src/game/Vehicles';

function triTotal(root: THREE.Object3D): { meshes: number; tris: number } {
  let meshes = 0, tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    tris += Math.floor((g.getIndex() ? g.getIndex()!.count : g.getAttribute('position')?.count ?? 0) / 3);
  });
  return { meshes, tris };
}
function nameCount(root: THREE.Object3D, pred: (n: string) => boolean): number {
  let n = 0;
  root.traverse((o) => { if (pred(o.name)) n++; });
  return n;
}

async function load(file: string): Promise<THREE.Group> {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  return gltf.scene;
}

describe('mergeVehicleStatics on the shipped GLBs', () => {
  it('darkhorse: lossless, MOD + wheels intact', async () => {
    const scene = await load('darkhorse.glb');
    const before = triTotal(scene);
    const modsBefore = nameCount(scene, (n) => n.startsWith('MOD_'));
    const wheelsBefore = nameCount(scene, (n) => n.startsWith('Wheel'));
    mergeVehicleStatics(scene);
    const after = triTotal(scene);
    process.stdout.write(`darkhorse: meshes ${before.meshes} -> ${after.meshes}, tris ${before.tris} -> ${after.tris}, MOD ${modsBefore}, wheels ${wheelsBefore}\n`);
    expect(after.tris).toBe(before.tris);
    expect(nameCount(scene, (n) => n.startsWith('MOD_'))).toBe(modsBefore);
    expect(nameCount(scene, (n) => n.startsWith('Wheel'))).toBe(wheelsBefore);
    // The floor is set by the untouchables: 4×88 MT-wheel parts +
    // 4×25 stock-wheel parts + MOD sets are never absorbed, so the
    // win is the ~230 static body meshes folding to ~30 outputs.
    expect(after.meshes).toBeLessThan(before.meshes * 0.8);
    expect(nameCount(scene, (n) => n === 'glb-merged')).toBeGreaterThan(5);
  }, 60000);

  it('prime: lossless, wheels + kingpin + seat anchors intact', async () => {
    const scene = await load('models/nomad-prime.glb');
    const before = triTotal(scene);
    mergeVehicleStatics(scene);
    const after = triTotal(scene);
    process.stdout.write(`prime: meshes ${before.meshes} -> ${after.meshes}, tris ${before.tris} -> ${after.tris}\n`);
    expect(after.tris).toBe(before.tris);
    expect(scene.getObjectByName('driver_seat')).toBeTruthy();
    expect(scene.getObjectByName('fifth_wheel_kingpin')).toBeTruthy();
    expect(nameCount(scene, (n) => n.startsWith('Wheel'))).toBeGreaterThan(0);
    expect(after.meshes).toBeLessThan(before.meshes * 0.6);
  }, 60000);

  it('sprinter: lossless, wheels + seat intact', async () => {
    const scene = await load('models/sprinter.glb');
    const before = triTotal(scene);
    mergeVehicleStatics(scene);
    const after = triTotal(scene);
    process.stdout.write(`sprinter: meshes ${before.meshes} -> ${after.meshes}, tris ${before.tris} -> ${after.tris}\n`);
    expect(after.tris).toBe(before.tris);
    expect(nameCount(scene, (n) => n.startsWith('Wheel'))).toBeGreaterThan(0);
    expect(after.meshes).toBeLessThan(before.meshes * 0.6);
  }, 60000);
});
