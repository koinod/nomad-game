// ─── WAIST-CHANNEL EYE-LEVEL PROOF RENDERS (2026-10-22 lane proof) ────────
//
// Software-rasterized perspective views of the REAL world data: the
// authored Beta grid (mesh == physics == sampler), the water plane,
// and the actual buildSectors geometry (kits + ground works, incl.
// the two crossing decks). Zone palette + a NW sun, same read as the
// overhead tool. Not the game renderer — a proof instrument: what
// stands in the data is what stands in the frame.
//
// Run: ./node_modules/.bin/vite-node tools/render_waist_eyelevel.ts
// Out: design-refs/proof-waist-channel/eye_*.png

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  buildBetaGrid, betaHeightAt, betaZoneAt, BETA_ZONE_COLORS, BETA_WORLD,
} from '../src/game/betaTerrain';
import { buildSectors } from '../src/game/Sectors';

const W = 880;
const H = 495;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const srgb = (c: number): number => {
  const v = clamp01(c);
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
};
const SUN = (() => {
  const v = new THREE.Vector3(-0.5, 0.8, -0.5);
  return v.normalize();
})();

interface Tri {
  p: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  c: [number, number, number];
  n: THREE.Vector3;
}

function buildTris(): Tri[] {
  const tris: Tri[] = [];
  const g = buildBetaGrid();
  const STRIDE = 1121;
  const step = 2; // 2.5 m tessellation — proof grade
  const hv = (i: number, j: number): number => g[j * STRIDE + i];
  const nodePos = (i: number, j: number): THREE.Vector3 =>
    new THREE.Vector3(BETA_WORLD.xMin + i * 1.25, hv(i, j), BETA_WORLD.zMin + j * 1.25);
  const nodeCol = (i: number, j: number): [number, number, number] => {
    const x = BETA_WORLD.xMin + i * 1.25;
    const z = BETA_WORLD.zMin + j * 1.25;
    return BETA_ZONE_COLORS[betaZoneAt(x, z)];
  };
  const nodeNrm = (i: number, j: number): THREE.Vector3 => {
    const dx = (hv(Math.min(i + 1, 1120), j) - hv(Math.max(i - 1, 0), j)) / ((Math.min(i + 1, 1120) - Math.max(i - 1, 0)) * 1.25);
    const dz = (hv(i, Math.min(j + 1, 512)) - hv(i, Math.max(j - 1, 0))) / ((Math.min(j + 1, 512) - Math.max(j - 1, 0)) * 1.25);
    return new THREE.Vector3(-dx, 1, -dz).normalize();
  };
  for (let j = 0; j + step <= 512; j += step) {
    for (let i = 0; i + step <= 1120; i += step) {
      const a = nodePos(i, j);
      const b = nodePos(i + step, j);
      const c = nodePos(i, j + step);
      const d = nodePos(i + step, j + step);
      const ca = nodeCol(i, j);
      const cb = nodeCol(i + step, j);
      const cc = nodeCol(i, j + step);
      const cd = nodeCol(i + step, j + step);
      const avg = (u: [number, number, number], v: [number, number, number], w: [number, number, number]): [number, number, number] =>
        [(u[0] + v[0] + w[0]) / 3, (u[1] + v[1] + w[1]) / 3, (u[2] + v[2] + w[2]) / 3];
      const na = nodeNrm(i + (i % 2), j);
      void na;
      const n1 = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(b, a)).normalize();
      const n2 = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(d, b)).normalize();
      if (n1.y < 0) n1.negate();
      if (n2.y < 0) n2.negate();
      tris.push({ p: [a, c, b], c: avg(ca, cc, cb), n: n1 });
      tris.push({ p: [b, c, d], c: avg(cb, cc, cd), n: n2 });
    }
  }
  // Water plane at the waterline.
  const wc: [number, number, number] = [0.1, 0.34, 0.36];
  const wv = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0.02, z);
  const up = new THREE.Vector3(0, 1, 0);
  tris.push({ p: [wv(-700, -320), wv(-700, 320), wv(700, -320)], c: wc, n: up });
  tris.push({ p: [wv(700, -320), wv(-700, 320), wv(700, 320)], c: wc, n: up });
  // Built geometry (kits + ground works incl. the crossing decks).
  const built = buildSectors((x, z) => betaHeightAt(x, z));
  const groups: THREE.Object3D[] = [built.groundGroup, ...built.kits.map((k) => k.group)];
  for (const grp of groups) {
    grp.updateMatrixWorld(true);
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const posA = geo.getAttribute('position');
      if (!posA) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const col = mat && mat.color ? mat.color : new THREE.Color(0x888888);
      const c: [number, number, number] = [col.r, col.g, col.b];
      const idx = geo.getIndex();
      const vOf = (vi: number): THREE.Vector3 =>
        new THREE.Vector3().fromBufferAttribute(posA, vi).applyMatrix4(mesh.matrixWorld);
      const push = (ia: number, ib: number, ic: number): void => {
        const p0 = vOf(ia);
        const p1 = vOf(ib);
        const p2 = vOf(ic);
        const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
        tris.push({ p: [p0, p1, p2], c, n });
      };
      if (idx) {
        for (let f = 0; f + 2 < idx.count; f += 3) push(idx.getX(f), idx.getX(f + 1), idx.getX(f + 2));
      } else {
        for (let f = 0; f + 2 < posA.count; f += 3) push(f, f + 1, f + 2);
      }
    });
  }
  return tris;
}

function render(tris: Tri[], eye: THREE.Vector3, look: THREE.Vector3, outName: string): void {
  const fwd = new THREE.Vector3().subVectors(look, eye).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const fovY = (55 * Math.PI) / 180;
  const tanY = Math.tan(fovY / 2);
  const tanX = tanY * (W / H);
  const px = new Uint8Array(W * H * 3);
  const zb = new Float32Array(W * H).fill(Infinity);
  // Sky gradient.
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = 0.25 + (0.62 - 0.25) * Math.pow(t, 1.4);
    const gg = 0.45 + (0.72 - 0.45) * Math.pow(t, 1.4);
    const b = 0.65 + (0.78 - 0.65) * Math.pow(t, 1.4);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      px[o] = srgb(r);
      px[o + 1] = srgb(gg);
      px[o + 2] = srgb(b);
    }
  }
  const cam = (p: THREE.Vector3): THREE.Vector3 => {
    const d = new THREE.Vector3().subVectors(p, eye);
    return new THREE.Vector3(d.dot(right), d.dot(up), d.dot(fwd));
  };
  for (const tri of tris) {
    const cs = tri.p.map(cam);
    if (cs.some((v) => v.z < 0.6)) continue;
    // Backface cull in camera space (normal from winding).
    const shade = 0.34 + 0.66 * Math.max(0, tri.n.dot(SUN));
    const xs = cs.map((v) => (0.5 + (v.x / (v.z * tanX)) * 0.5) * W);
    const ys = cs.map((v) => (0.5 - (v.y / (v.z * tanY)) * 0.5) * H);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    if (x1 < x0 || y1 < y0) continue;
    const [ax, ay] = [xs[0], ys[0]];
    const [bx, by] = [xs[1], ys[1]];
    const [cx, cy] = [xs[2], ys[2]];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
        const w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * cs[0].z + w1 * cs[1].z + w2 * cs[2].z;
        const o = y * W + x;
        if (z >= zb[o]) continue;
        // Cheap fog toward the horizon for depth read.
        const fog = Math.min(0.55, Math.max(0, (z - 260) / 900));
        const li = shade * (1 - fog) + 0.75 * fog;
        zb[o] = z;
        px[o * 3] = srgb(tri.c[0] * li);
        px[o * 3 + 1] = srgb(tri.c[1] * li);
        px[o * 3 + 2] = srgb(tri.c[2] * li);
      }
    }
  }
  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'design-refs', 'proof-waist-channel', outName);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(px, W, H));
  console.log(`wrote ${outPath}`);
}

// ── Minimal PNG writer (same discipline as the overhead tool) ──────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePng(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let r = 0; r < h; r++) {
    raw[r * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(r * w * 3, (r + 1) * w * 3), r * (w * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Headless canvas stub (same as the test suites): kit builders paint
// decal textures; nothing here ever uploads them.
{
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
}

const t0 = Date.now();
const tris = buildTris();
console.log(`scene: ${tris.length} tris (${Date.now() - t0} ms)`);
const eyeAt = (x: number, z: number, dy = 1.7): THREE.Vector3 =>
  new THREE.Vector3(x, betaHeightAt(x, z) + dy, z);
// Citadel causeway: standing on NC-12 at the deck's north end, looking S.
render(tris, eyeAt(238, -94), new THREE.Vector3(185, 1.2, -52), 'eye_citadel_causeway.png');
// Pier crossing: on the west fork east of the deck, looking WNW at it.
render(tris, eyeAt(-384, 177), new THREE.Vector3(-432, 1.4, 204), 'eye_pier_crossing.png');
// The channel from the marsh: on the south bank of the west reach
// (forest-cache shore), looking WNW across the water to the north
// bank — the Ridge shoulder beyond.
render(tris, eyeAt(-250, -48), new THREE.Vector3(-298, 0.5, -92), 'eye_channel_marsh.png');
console.log(`done (${Date.now() - t0} ms total)`);
