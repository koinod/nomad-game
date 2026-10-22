// ─── GROUND-GRAPHICS PROOF RENDERS (2026-10-22 lane proof) ────────────────
//
// Software-rasterized eye-level views of the REAL Beta grid at the
// three standard spots, BEFORE vs AFTER this lane:
//   BEFORE — per-vertex zone colors, smooth grid normals, uniform
//            roughness, the old sun peak (2.65) + exposure (1.06).
//   AFTER  — the lane's actual data: the generated detail/macro
//            pixel fields sampled with the shader's own math (grain,
//            blotch, tint drift, micro-normal tilt, shoreline damp
//            band), the scatter clusters as real geometry, the new
//            sun peak (3.25) / warmer bounce / fog / exposure (1.10).
// Not the game renderer — a proof instrument over the same data the
// game ships (grid + generated maps + placements). ABSOLUTE scale
// is calibrated once (PROOF_LIGHT_SCALE) so the BEFORE frame
// exposes like the shipped game at midday — the game's own
// operating point includes its PostFX grade, which this tool does
// not model. The constant is identical for both passes: every
// before/after DELTA below is the shipped delta, unscaled.
//
// Run: ./node_modules/.bin/vite-node tools/render_ground_proof.ts
// Out: design-refs/proof-ground/{lighthouse_midday,marsh_golden,airbase_apron}_{before,after}.png

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BETA_WORLD, buildBetaGrid, betaHeightAt, betaZoneAt, BETA_ZONE_COLORS,
} from '../src/game/betaTerrain';
import {
  DETAIL_TEX_SIZE, MACRO_TEX_SIZE, DETAIL_TILE_M, MACRO_TILE_M, MACRO_ROT,
  generateDetailPixels, generateMacroPixels,
} from '../src/game/groundDetail';
import { buildScatterGeometry, computeGroundScatter } from '../src/game/groundScatter';

const W = 880;
const H = 495;
const PROOF_LIGHT_SCALE = 0.45;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const srgb = (c: number): number => {
  const v = clamp01(c);
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
};
const aces = (x: number): number => clamp01((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));

// ── generated maps (the same bytes the game uploads) ────────────────────────
const det = generateDetailPixels();
const mac = generateMacroPixels();
const sample = (px: Uint8Array, size: number, u: number, v: number, ch: number): number => {
  const x = ((Math.floor(u * size) % size) + size) % size;
  const y = ((Math.floor(v * size) % size) + size) % size;
  return px[(y * size + x) * 4 + ch] / 255;
};

// ── scene data ───────────────────────────────────────────────────────────────
const grid = buildBetaGrid();
const STRIDE = 1121;
const hv = (i: number, j: number): number => grid[j * STRIDE + i];
const nodeNrm = (i: number, j: number): [number, number, number] => {
  const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, 1120);
  const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, 512);
  const dx = (hv(i1, j) - hv(i0, j)) / ((i1 - i0) * 1.25);
  const dz = (hv(i, j1) - hv(i, j0)) / ((j1 - j0) * 1.25);
  const inv = 1 / Math.hypot(dx, 1, dz);
  return [-dx * inv, inv, -dz * inv];
};

interface V { x: number; y: number; z: number; nx: number; ny: number; nz: number; r: number; g: number; b: number }
const terrainVerts = (step: number): V[][] => {
  const rows: V[][] = [];
  for (let j = 0; j <= 512; j += step) {
    const row: V[] = [];
    for (let i = 0; i <= 1120; i += step) {
      const x = BETA_WORLD.xMin + i * 1.25;
      const z = BETA_WORLD.zMin + j * 1.25;
      const [nx, ny, nz] = nodeNrm(i, j);
      const c = BETA_ZONE_COLORS[betaZoneAt(x, z)];
      row.push({ x, y: hv(i, j), z, nx, ny, nz, r: c[0], g: c[1], b: c[2] });
    }
    rows.push(row);
  }
  return rows;
};

// scatter clusters as flat triangles (AFTER only), world-space
interface FlatTri { p: [number[], number[], number[]]; r: number; g: number; b: number }
const scatterTris = (camX: number, camZ: number): FlatTri[] => {
  const geo = buildScatterGeometry();
  const pos = geo.getAttribute('position');
  const colAttr = geo.getAttribute('color');
  const out: FlatTri[] = [];
  for (const pl of computeGroundScatter(1234)) {
    const dx = pl.x - camX, dz = pl.z - camZ;
    if (dx * dx + dz * dz > 70 * 70) continue;
    const cos = Math.cos(pl.rotY), sin = Math.sin(pl.rotY);
    const xf = (lx: number, ly: number, lz: number): number[] => [
      pl.x + (lx * cos + lz * sin) * pl.scale,
      pl.y + ly * pl.scale,
      pl.z + (-lx * sin + lz * cos) * pl.scale,
    ];
    for (let t = 0; t < pos.count; t += 3) {
      const pts: number[][] = [];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 3; k++) {
        pts.push(xf(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k)));
        r += colAttr.getX(t + k) * pl.tint[0];
        g += colAttr.getY(t + k) * pl.tint[1];
        b += colAttr.getZ(t + k) * pl.tint[2];
      }
      out.push({ p: pts as FlatTri['p'], r: r / 3, g: g / 3, b: b / 3 });
    }
  }
  return out;
};

// ── lighting rigs (mirrors World.updateSky's math) ──────────────────────────
interface Rig {
  sunDir: [number, number, number]; sunCol: [number, number, number]; sunI: number;
  hemiSky: [number, number, number]; hemiGround: [number, number, number]; hemiI: number;
  fog: [number, number, number]; exposure: number;
  zenith: [number, number, number]; horizon: [number, number, number];
}
const hex = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const sunFor = (minutes: number): { dir: [number, number, number]; elev: number } => {
  const t01 = minutes / 1440;
  const ang = (t01 - 0.25) * Math.PI * 2;
  const elev = Math.sin(ang);
  const p: [number, number, number] = [Math.cos(ang) * 600, Math.max(elev, -0.2) * 600, 220];
  const inv = 1 / Math.hypot(...p);
  return { dir: [p[0] * inv, p[1] * inv, p[2] * inv], elev };
};
const rigFor = (minutes: number, after: boolean): Rig => {
  const { dir, elev } = sunFor(minutes);
  const dayness = clamp01(elev * 2.2);
  const warm = hex(after ? 0xff9040 : 0xff9a4e);
  const base = hex(0xfff2dd);
  const sunCol: [number, number, number] = [
    base[0] + (warm[0] - base[0]) * (1 - dayness),
    base[1] + (warm[1] - base[1]) * (1 - dayness),
    base[2] + (warm[2] - base[2]) * (1 - dayness),
  ];
  const golden = elev < 0.25;
  return {
    sunDir: dir,
    sunCol,
    sunI: (after ? 0.3 + dayness * 2.95 : 0.25 + dayness * 2.4),
    hemiSky: hex(after ? 0xc7dcee : 0xbdd3e6),
    hemiGround: hex(after ? 0x59503c : 0x3a4a35),
    hemiI: golden ? 0.45 : 0.55,
    fog: hex(after ? 0xa9c3d4 : 0x9db8c8),
    exposure: after ? 1.1 : 1.06,
    zenith: hex(golden ? 0x39598c : 0x2f62a8),
    horizon: hex(golden ? 0xe9b47c : 0xc3d7e8),
  };
};

// ── the detail shading (the shader's math, in TS) ────────────────────────────
const shadeGround = (
  after: boolean, rig: Rig,
  wx: number, wy: number, wz: number,
  nx: number, ny: number, nz: number,
  vr: number, vg: number, vb: number,
  camX: number, camY: number, camZ: number,
): [number, number, number] => {
  let r = vr, g = vg, b = vb;
  let snx = nx, sny = ny, snz = nz;
  let rough = 0.95;
  if (after) {
    const mu = wx / DETAIL_TILE_M, mv = wz / DETAIL_TILE_M;
    const dr = sample(det, DETAIL_TEX_SIZE, mu, mv, 0);
    const db = sample(det, DETAIL_TEX_SIZE, mu, mv, 2);
    const cu = Math.cos(MACRO_ROT), su = Math.sin(MACRO_ROT);
    const au = (cu * wx - su * wz) / MACRO_TILE_M;
    const av = (su * wx + cu * wz) / MACRO_TILE_M;
    const mr = sample(mac, MACRO_TEX_SIZE, au, av, 0);
    const mb = sample(mac, MACRO_TEX_SIZE, au, av, 2);
    const grain = 0.80 + 0.38 * dr;
    const blotch = 0.90 + 0.20 * mr;
    r *= grain * blotch; g *= grain * blotch; b *= grain * blotch;
    const tint = mb - 0.5;
    r *= 1 + tint * 0.10; g *= 1 + tint * 0.02; b *= 1 - tint * 0.08;
    const damp = (1 - clamp01((wy - 0.12) / (0.9 - 0.12))) * clamp01((wy + 1.6) / 1.65);
    r *= 1 - 0.10 * damp; g *= 1 - 0.10 * damp; b *= 1 - 0.10 * damp;
    rough = Math.min(1, Math.max(0.06, 0.95 * (0.72 + 0.55 * db)));
    rough = rough * (1 - damp * 0.75) + rough * 0.45 * damp * 0.75;
    // micro-normal tilt (distance/slope faded, like the shader)
    const distC = Math.hypot(camX - wx, camY - wy, camZ - wz);
    const fade = clamp01(ny) * (1 - clamp01((distC - 45) / 50));
    if (fade > 0.003) {
      const texel = DETAIL_TILE_M / DETAIL_TEX_SIZE;
      const hl = sample(det, DETAIL_TEX_SIZE, (wx - texel) / DETAIL_TILE_M, mv, 1);
      const hr = sample(det, DETAIL_TEX_SIZE, (wx + texel) / DETAIL_TILE_M, mv, 1);
      const hd = sample(det, DETAIL_TEX_SIZE, mu, (wz - texel) / DETAIL_TILE_M, 1);
      const hu = sample(det, DETAIL_TEX_SIZE, mu, (wz + texel) / DETAIL_TILE_M, 1);
      const gx = (hr - hl) / (2 * texel);
      const gz = (hu - hd) / (2 * texel);
      snx = nx - gx * 0.55 * 0.02 * fade;
      snz = nz - gz * 0.55 * 0.02 * fade;
      const inv = 1 / Math.hypot(snx, sny, snz);
      snx *= inv; sny *= inv; snz *= inv;
    }
  }
  const ndl = Math.max(0, snx * rig.sunDir[0] + sny * rig.sunDir[1] + snz * rig.sunDir[2]);
  const hemiMix = sny * 0.5 + 0.5;
  // cheap specular sheen from roughness (the damp band glints)
  const hx = rig.sunDir[0], hy = rig.sunDir[1] + 1, hz = rig.sunDir[2];
  const hinv = 1 / Math.hypot(hx, hy, hz);
  const ndh = Math.max(0, snx * hx * hinv + sny * hy * hinv + snz * hz * hinv);
  const spec = Math.pow(ndh, 24) * (1 - rough) * 0.35;
  const out: [number, number, number] = [0, 0, 0];
  const alb = [r, g, b];
  for (let c = 0; c < 3; c++) {
    const direct = rig.sunCol[c] * rig.sunI * ndl;
    const fill = (rig.hemiSky[c] * hemiMix + rig.hemiGround[c] * (1 - hemiMix)) * rig.hemiI;
    out[c] = (alb[c] * (direct + fill) + spec * rig.sunCol[c]) * PROOF_LIGHT_SCALE;
  }
  return out;
};

// ── rasterizer ───────────────────────────────────────────────────────────────
interface Spot { name: string; cam: [number, number, number]; look: [number, number, number]; minutes: number }
const render = (spot: Spot, after: boolean): Uint8Array => {
  const rig = rigFor(spot.minutes, after);
  const [cx, cy, cz] = spot.cam;
  const fwd = ((): [number, number, number] => {
    const d = [spot.look[0] - cx, spot.look[1] - cy, spot.look[2] - cz];
    const inv = 1 / Math.hypot(...d);
    return [d[0] * inv, d[1] * inv, d[2] * inv];
  })();
  const right: [number, number, number] = [fwd[2], 0, -fwd[0]];
  const rl = Math.hypot(...right) || 1;
  right[0] /= rl; right[2] /= rl;
  const up: [number, number, number] = [
    fwd[1] * right[2] - fwd[2] * right[1],
    fwd[2] * right[0] - fwd[0] * right[2],
    fwd[0] * right[1] - fwd[1] * right[0],
  ];
  const fov = 1 / Math.tan((62 * Math.PI / 180) / 2);
  const aspect = W / H;
  const img = new Uint8Array(W * H * 3);
  const zbuf = new Float32Array(W * H).fill(Infinity);
  // sky background by row (ray elevation)
  for (let y = 0; y < H; y++) {
    const ny = 1 - (y / H) * 2;
    const t = clamp01(ny * 1.6 + 0.25);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        img[i + c] = srgb(aces((rig.horizon[c] * (1 - t) + rig.zenith[c] * t) * rig.exposure * 0.9));
      }
    }
  }
  const project = (vx: number, vy: number, vz: number): [number, number, number] | null => {
    const dx = vx - cx, dy = vy - cy, dz = vz - cz;
    const depth = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
    if (depth < 0.5) return null;
    const px = (dx * right[0] + dy * right[1] + dz * right[2]) / depth;
    const py = (dx * up[0] + dy * up[1] + dz * up[2]) / depth;
    return [((px * fov / aspect) * 0.5 + 0.5) * W, (0.5 - py * fov * 0.5) * H, depth];
  };
  const fogMix = (depth: number): number => clamp01((depth - 95) / (620 - 95));
  const finish = (col: [number, number, number], depth: number): [number, number, number] => {
    const f = fogMix(depth);
    return [
      srgb(aces((col[0] * (1 - f) + rig.fog[0] * f) * rig.exposure)),
      srgb(aces((col[1] * (1 - f) + rig.fog[1] * f) * rig.exposure)),
      srgb(aces((col[2] * (1 - f) + rig.fog[2] * f) * rig.exposure)),
    ];
  };
  const rows = terrainVerts(3);
  const cols = rows[0].length;
  const drawTri = (a: V, b: V, c: V) => {
    const pa = project(a.x, a.y, a.z), pb = project(b.x, b.y, b.z), pc = project(c.x, c.y, c.z);
    if (!pa || !pb || !pc) return;
    const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
    const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
    if (maxX < minX || maxY < minY) return;
    const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((pb[0] - x) * (pc[1] - y) - (pb[1] - y) * (pc[0] - x)) / area;
        const w1 = ((pc[0] - x) * (pa[1] - y) - (pc[1] - y) * (pa[0] - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = 1 / (w0 / pa[2] + w1 / pb[2] + w2 / pc[2]);
        const idx = y * W + x;
        if (depth >= zbuf[idx]) continue;
        const iw0 = (w0 / pa[2]) * depth, iw1 = (w1 / pb[2]) * depth, iw2 = (w2 / pc[2]) * depth;
        const wx = a.x * iw0 + b.x * iw1 + c.x * iw2;
        const wy = a.y * iw0 + b.y * iw1 + c.y * iw2;
        const wz = a.z * iw0 + b.z * iw1 + c.z * iw2;
        let nx = a.nx * iw0 + b.nx * iw1 + c.nx * iw2;
        let ny = a.ny * iw0 + b.ny * iw1 + c.ny * iw2;
        let nz = a.nz * iw0 + b.nz * iw1 + c.nz * iw2;
        const ninv = 1 / (Math.hypot(nx, ny, nz) || 1);
        nx *= ninv; ny *= ninv; nz *= ninv;
        const vr = a.r * iw0 + b.r * iw1 + c.r * iw2;
        const vg = a.g * iw0 + b.g * iw1 + c.g * iw2;
        const vb = a.b * iw0 + b.b * iw1 + c.b * iw2;
        let col: [number, number, number];
        if (wy < 0.02) {
          // water: flat marine color, same in both passes
          col = [0.055, 0.19, 0.28];
        } else {
          col = shadeGround(after, rig, wx, wy, wz, nx, ny, nz, vr, vg, vb, cx, cy, cz);
        }
        zbuf[idx] = depth;
        const out = finish(col, depth);
        img[idx * 3] = out[0]; img[idx * 3 + 1] = out[1]; img[idx * 3 + 2] = out[2];
      }
    }
  };
  for (let j = 0; j + 1 < rows.length; j++) {
    for (let i = 0; i + 1 < cols; i++) {
      const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], d = rows[j + 1][i + 1];
      // cheap view cull: skip quads far behind the camera
      const mx = (a.x + d.x) / 2 - cx, mz = (a.z + d.z) / 2 - cz;
      if (mx * fwd[0] + mz * fwd[2] < -20) continue;
      drawTri(a, c, b);
      drawTri(b, c, d);
    }
  }
  if (after) {
    for (const t of scatterTris(cx, cz)) {
      const [p0, p1, p2] = t.p;
      // flat-shade the cluster tri with its centroid normal ≈ up-biased
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= inv; ny *= inv; nz *= inv;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ndl = Math.max(0, nx * rig.sunDir[0] + ny * rig.sunDir[1] + nz * rig.sunDir[2]);
      const lit: [number, number, number] = [
        t.r * (rig.sunCol[0] * rig.sunI * ndl + 0.32) * PROOF_LIGHT_SCALE,
        t.g * (rig.sunCol[1] * rig.sunI * ndl + 0.32) * PROOF_LIGHT_SCALE,
        t.b * (rig.sunCol[2] * rig.sunI * ndl + 0.32) * PROOF_LIGHT_SCALE,
      ];
      const mk = (p: number[]): V => ({ x: p[0], y: p[1], z: p[2], nx, ny, nz, r: lit[0], g: lit[1], b: lit[2] });
      // clusters are pre-lit flat color — fill them with the flat path
      drawFlat(mk(p0), mk(p1), mk(p2));
    }
  }
  function drawFlat(a: V, b: V, c: V) {
    const pa = project(a.x, a.y, a.z), pb = project(b.x, b.y, b.z), pc = project(c.x, c.y, c.z);
    if (!pa || !pb || !pc) return;
    const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
    const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
    const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if (Math.abs(area) < 1e-9) return;
    const out = finish([a.r, a.g, a.b], pa[2]);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((pb[0] - x) * (pc[1] - y) - (pb[1] - y) * (pc[0] - x)) / area;
        const w1 = ((pc[0] - x) * (pa[1] - y) - (pc[1] - y) * (pa[0] - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = 1 / (w0 / pa[2] + w1 / pb[2] + w2 / pc[2]);
        const idx = y * W + x;
        if (depth >= zbuf[idx]) continue;
        zbuf[idx] = depth;
        img[idx * 3] = out[0]; img[idx * 3 + 1] = out[1]; img[idx * 3 + 2] = out[2];
      }
    }
  }
  return img;
};

// ── PNG out (same minimal encoder as the other proof tools) ─────────────────
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const writePng = (path: string, img: Uint8Array): void => {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
};

// ── spots: lighthouse grounds midday, waist marsh golden, airbase apron ────
// camera = sampler ground + 1.7 m eye; look target near its ground.
const eye = (x: number, z: number): number => betaHeightAt(x, z) + 1.7;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'design-refs', 'proof-ground');
const spots: Spot[] = [
  { name: 'lighthouse_midday', cam: [548, eye(548, -146), -146], look: [600, betaHeightAt(600, -196) + 0.4, -196], minutes: 12 * 60 },
  { name: 'marsh_golden', cam: [-128, eye(-128, 52), 52], look: [-168, betaHeightAt(-168, 32) + 0.4, 32], minutes: 17 * 60 + 40 },
  { name: 'airbase_apron', cam: [424, eye(424, -96), -96], look: [453, betaHeightAt(453, -119) + 0.3, -119], minutes: 10 * 60 + 30 },
];
for (const spot of spots) {
  for (const after of [false, true]) {
    const img = render(spot, after);
    const path = join(outDir, `${spot.name}_${after ? 'after' : 'before'}.png`);
    writePng(path, img);
    console.log('wrote', path);
  }
}
