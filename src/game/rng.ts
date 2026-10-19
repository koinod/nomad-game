// Seeded RNG (mulberry32) + deterministic value noise for terrain.
// All world generation must go through these so the island is identical per seed.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash -> [0,1). Deterministic, no Math.sin precision traps.
function hash2(ix: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iz, 668265263) ^
    Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Value noise in [-1, 1]. */
export function makeNoise2D(seed: number): (x: number, z: number) => number {
  const s = seed | 0;
  return (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = hash2(ix, iz, s);
    const b = hash2(ix + 1, iz, s);
    const c = hash2(ix, iz + 1, s);
    const d = hash2(ix + 1, iz + 1, s);
    const ux = smootherstep(fx);
    const uz = smootherstep(fz);
    const v = a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
    return v * 2 - 1;
  };
}

/** Fractal Brownian motion, `octaves` octaves of value noise, in [-1, 1]. */
export function makeFbm(
  seed: number,
  octaves = 4,
): (x: number, z: number) => number {
  const n = makeNoise2D(seed);
  return (x: number, z: number) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** smoothstep with arbitrary edge order (works when edge0 > edge1 too). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
