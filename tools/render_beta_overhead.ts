// ─── BETA OVERHEAD RENDER (map restart, Phase 1.5 deliverable) ─────────────
//
// Renders the authored Beta grid from directly overhead: per-pixel
// material zone (betaZoneAt, spec §1.1 palette) + hillshade from the
// grid's own finite differences, water flat with a depth tint (no
// hillshade — open water must read as water, not as shaded land).
// 1 px = 1 m over the full world rect (1400×640).
//
// 8-bit discipline: palette values are LINEAR (they are three.js
// vertex colors). Each channel is shade-multiplied in linear space,
// sRGB-encoded, clamped, and rounded — never a raw float or an
// unclamped *255 written into a byte.
//
// Run: ./node_modules/.bin/vite-node tools/render_beta_overhead.ts
// Out: design-refs/proof-beta-terrain/beta_overhead.png

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BETA_WORLD, buildBetaGrid, betaHeightAt, betaZoneAt, BETA_ZONE_COLORS,
} from '../src/game/betaTerrain';

const W = BETA_WORLD.xMax - BETA_WORLD.xMin; // 1400
const H = BETA_WORLD.zMax - BETA_WORLD.zMin; // 640

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const srgb = (c: number): number => {
  const v = clamp01(c);
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
};
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Sun from the NW (plan: −x west, −z north), ~53° up.
const L = (() => {
  const v = [-0.5, 0.8, -0.5];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();

const SHALLOW: [number, number, number] = [0.1, 0.34, 0.36]; // turquoise shoal
const DEEP: [number, number, number] = [0.015, 0.08, 0.22]; // Atlantic / bay deep

function render(): Uint8Array {
  buildBetaGrid();
  const px = new Uint8Array(W * H * 3);
  for (let row = 0; row < H; row++) {
    const z = BETA_WORLD.zMin + row; // north (zMin) at the top of the image
    for (let col = 0; col < W; col++) {
      const x = BETA_WORLD.xMin + col;
      const h = betaHeightAt(x, z);
      const o = (row * W + col) * 3;
      if (h < 0) {
        const t = smoothstep(0, -12, h);
        px[o] = srgb(SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t);
        px[o + 1] = srgb(SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t);
        px[o + 2] = srgb(SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t);
        continue;
      }
      const c = BETA_ZONE_COLORS[betaZoneAt(x, z)];
      const dhx = (betaHeightAt(x + 2, z) - betaHeightAt(x - 2, z)) / 4;
      const dhz = (betaHeightAt(x, z + 2) - betaHeightAt(x, z - 2)) / 4;
      const inv = 1 / Math.hypot(dhx, 1, dhz);
      const shade = Math.max(0, (-dhx * L[0] + L[1] - dhz * L[2]) * inv);
      const m = 0.42 + 0.72 * shade;
      px[o] = srgb(c[0] * m);
      px[o + 1] = srgb(c[1] * m);
      px[o + 2] = srgb(c[2] * m);
    }
  }
  return px;
}

// ── Minimal PNG writer (8-bit RGB, zlib via node) ────────────────────────────

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
    raw[r * (w * 3 + 1)] = 0; // filter: none
    raw.set(rgb.subarray(r * w * 3, (r + 1) * w * 3), r * (w * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const t0 = Date.now();
const png = encodePng(render(), W, H);
const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'design-refs', 'proof-beta-terrain', 'beta_overhead.png');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${Date.now() - t0} ms)`);
