import * as THREE from 'three';
import { mulberry32 } from './rng';

/**
 * GROUND DETAIL (2026-10-22, Ian: "better graphics of the ground /
 * more detail or better lighting"). The Beta terrain was per-vertex
 * zone colors on a 1.25 m grid with a uniform roughness — at foot
 * level it read as a flat wash: no grain, no micro-normal, nothing
 * for the sun to model. This module adds the missing octaves WITHOUT
 * touching a single height: the sampler, the Rapier heightfield and
 * the mesh stay byte-identical (the mesh==physics==sampler identity
 * is law); everything here is material-side.
 *
 * Two procedural octaves, generated in code from a fixed seed (no
 * texture assets — the maps are data, regenerated identically every
 * run and unit-testable):
 *
 *  - MICRO (512², one tile = DETAIL_TILE_M of ground): fine grain —
 *    sand speckle, dirt clods, grass-thatch flecks, asphalt grit.
 *    R = albedo multiplier field, G = micro height (drives a normal
 *    tilt in the shader), B = roughness multiplier field.
 *  - MACRO (256², one tile = MACRO_TILE_M, sampled rotated): broad
 *    blotches so the micro tile never visibly repeats across a
 *    vista, plus a warm/cool tint drift. R = albedo multiplier,
 *    B = tint field.
 *
 * Both maps are PERFECTLY TILEABLE (wrapped lattice noise + wrapped
 * speckle), so the repeat is structural, not visible.
 *
 * The shader patch (applyGroundDetail) samples both maps from the
 * WORLD XZ of each fragment — the terrain chunks carry no UVs and
 * need none; positions are world-space verbatim. It multiplies the
 * grain over the baked vertex-color zones (zones stay the macro
 * read; detail is within-zone variation), modulates roughness with
 * the same fields, tilts the shading normal by the micro height
 * gradient (faded by distance and by slope), and darkens/smooths a
 * shoreline damp band off the fragment's own height — the wet-sand
 * ring the waterline always wanted. The weather wetness system
 * (terrainWetnessLook, World.updateSky) still drives the material's
 * base roughness/color on top: its multipliers compose with these.
 */

export const DETAIL_TILE_M = 1.6; // world metres per micro tile
export const MACRO_TILE_M = 64; // world metres per macro tile
export const DETAIL_TEX_SIZE = 512;
export const MACRO_TEX_SIZE = 256;
export const GROUND_DETAIL_SEED = 0x6d2b79f5;

/** World-space rotation (radians) applied to the macro sample so its
 *  grid axes never align with the micro grid or the world axes. */
export const MACRO_ROT = 0.41;

// ─── tileable noise ──────────────────────────────────────────────────────────

/** A periodic value-noise field: lattice randoms on a wrapped grid,
 *  smoothstep-interpolated. u,v are in tile units; the field repeats
 *  every `cells` lattice steps in both axes, forever. */
function tileableLattice(rng: () => number, cells: number): Float32Array {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return g;
}

function sampleLattice(g: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const a = w(x0, y0);
  const b = w(x0 + 1, y0);
  const c = w(x0, y0 + 1);
  const d = w(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable fBm: octaves of the wrapped lattice at doubling cell
 *  counts (powers of two keep every octave — and the sum — exactly
 *  periodic over the tile). */
export function tileableFbm(rng: () => number, size: number, baseCells: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const g = tileableLattice(rng, cells);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        out[y * size + x] += amp * sampleLattice(g, cells, x / size, y / size);
      }
    }
    total += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Wrapped speckle: n soft dots (pebble glints, shell flecks, dark
 *  clods) splatted with full wrap so the tile stays seamless. Adds
 *  into `field` at (x,y) and its 8 wrapped neighbours when near an
 *  edge — done by splatting each dot at all offsets unconditionally
 *  for dots within radius of a border (cheap enough at gen time). */
function splatSpeckle(
  field: Float32Array, size: number, rng: () => number,
  count: number, radiusPx: number, strength: number,
): void {
  for (let n = 0; n < count; n++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const amp = (rng() * 0.7 + 0.3) * strength * (rng() < 0.5 ? -1 : 1);
    const r = radiusPx * (0.6 + rng() * 0.8);
    const x0 = Math.floor(cx - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const fall = 1 - Math.sqrt(d2) / r;
        const wx = ((x % size) + size) % size;
        const wy = ((y % size) + size) % size;
        field[wy * size + wx] += amp * fall * fall;
      }
    }
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ─── the maps ────────────────────────────────────────────────────────────────

/**
 * Micro detail pixels (RGBA bytes). Channel contract, decoded in
 * the shader:
 *   R → albedo multiplier  0.80 + 0.38·r   (grain)
 *   G → micro height       (normal tilt source)
 *   B → roughness mult     0.72 + 0.55·b
 * Pure + deterministic: same bytes every run (tests pin this).
 */
export function generateDetailPixels(size: number = DETAIL_TEX_SIZE, seed: number = GROUND_DETAIL_SEED): Uint8Array {
  const rng = mulberry32(seed);
  const height = tileableFbm(rng, size, 8, 4); // broad clumps of grain
  const fine = tileableFbm(rng, size, 32, 3); // grass-thatch / grit flecks
  const rough = tileableFbm(rng, size, 16, 3);
  // speckle rides the height (glints sit ON pebbles) and the albedo
  splatSpeckle(height, size, rng, Math.round(size * 2.2), 1.6, 0.35);
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const h = height[i];
    const g = clamp01(0.25 + 0.55 * h + 0.45 * (fine[i] - 0.5));
    out[i * 4] = Math.round(clamp01(g) * 255);
    out[i * 4 + 1] = Math.round(clamp01(0.15 + 0.8 * h) * 255);
    out[i * 4 + 2] = Math.round(clamp01(rough[i]) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Macro variation pixels (RGBA bytes):
 *   R → albedo multiplier  0.90 + 0.20·r   (broad blotches)
 *   B → warm/cool tint field (shader: ±5% red/blue drift)
 * G unused (255). Pure + deterministic.
 */
export function generateMacroPixels(size: number = MACRO_TEX_SIZE, seed: number = GROUND_DETAIL_SEED ^ 0x51ab): Uint8Array {
  const rng = mulberry32(seed);
  const blotch = tileableFbm(rng, size, 4, 3);
  const tint = tileableFbm(rng, size, 6, 2);
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // push the blotch field toward the middle so the vista-scale
    // multiplier stays gentle (0.90–1.10, never a visible patch edge)
    out[i * 4] = Math.round(clamp01(0.5 + (blotch[i] - 0.5) * 1.4) * 255);
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = Math.round(clamp01(tint[i]) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

function toDataTexture(pixels: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export interface GroundDetailTextures {
  detail: THREE.DataTexture;
  macro: THREE.DataTexture;
}

let cached: GroundDetailTextures | null = null;

/** The two shared maps — generated once per process (~0.3 MB of
 *  texture memory at 512² + 256² RGBA with mips). */
export function groundDetailTextures(): GroundDetailTextures {
  if (!cached) {
    cached = {
      detail: toDataTexture(generateDetailPixels(), DETAIL_TEX_SIZE),
      macro: toDataTexture(generateMacroPixels(), MACRO_TEX_SIZE),
    };
  }
  return cached;
}

// ─── the material patch ──────────────────────────────────────────────────────

export interface GroundDetailOpts {
  /** Overall grain strength 0..1 (roads wear a lighter touch). */
  strength?: number;
  /** Micro normal tilt strength (world-space slope → radians-ish). */
  normalStrength?: number;
  /** Shoreline damp band on/off (terrain yes, road ribbons no —
   *  they ride 7 cm proud and are their own surface). */
  dampBand?: boolean;
}

const DETAIL_GLSL = /* glsl */ `
  uniform sampler2D uGDetail;
  uniform sampler2D uGMacro;
  uniform float uGStrength;
  uniform float uGNormalStrength;
  uniform float uGDampBand;
  varying vec3 vGPos;
  varying vec3 vGNormW;
  float gDampBand = 0.0;

  vec2 gMacroUv(vec2 xz) {
    float c = cos(${MACRO_ROT.toFixed(4)});
    float s = sin(${MACRO_ROT.toFixed(4)});
    return (mat2(c, -s, s, c) * xz) / ${MACRO_TILE_M.toFixed(1)};
  }
`;

/**
 * Patch a MeshStandardMaterial with the ground-detail octaves.
 * World-space sampling: correct for any mesh whose object transform
 * is identity (the terrain chunks and road ribbons both are).
 * Composes with the material's own color/roughness — including the
 * weather wetness driver, which keeps working untouched.
 */
export function applyGroundDetail(mat: THREE.MeshStandardMaterial, opts: GroundDetailOpts = {}): void {
  const strength = opts.strength ?? 1;
  const normalStrength = opts.normalStrength ?? 0.55;
  const dampBand = opts.dampBand ?? true;
  const tex = groundDetailTextures();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGDetail = { value: tex.detail };
    shader.uniforms.uGMacro = { value: tex.macro };
    shader.uniforms.uGStrength = { value: strength };
    shader.uniforms.uGNormalStrength = { value: normalStrength };
    shader.uniforms.uGDampBand = { value: dampBand ? 1 : 0 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGPos;
        varying vec3 vGNormW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vGPos = position;
        vGNormW = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DETAIL_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 gMicroUv = vGPos.xz / ${DETAIL_TILE_M.toFixed(2)};
          vec3 gDet = texture2D(uGDetail, gMicroUv).rgb;
          vec3 gMac = texture2D(uGMacro, gMacroUv(vGPos.xz)).rgb;
          float gGrain = mix(1.0, 0.80 + 0.38 * gDet.r, uGStrength);
          float gBlotch = mix(1.0, 0.90 + 0.20 * gMac.r, uGStrength);
          diffuseColor.rgb *= gGrain * gBlotch;
          // warm/cool drift at vista scale — kills the last of the
          // flat-wash read across a long beach or marsh pan
          float gTint = (gMac.b - 0.5) * uGStrength;
          diffuseColor.rgb *= vec3(1.0 + gTint * 0.10, 1.0 + gTint * 0.02, 1.0 - gTint * 0.08);
          // shoreline damp band: ground just above the waterline is
          // wet whether or not it has rained — darker + (below)
          // smoother. vGPos.y IS the terrain height here.
          gDampBand = uGDampBand * (1.0 - smoothstep(0.12, 0.9, vGPos.y)) * smoothstep(-1.6, 0.05, vGPos.y);
          diffuseColor.rgb *= 1.0 - 0.10 * gDampBand;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          vec3 gDetR = texture2D(uGDetail, vGPos.xz / ${DETAIL_TILE_M.toFixed(2)}).rgb;
          float gRough = mix(1.0, 0.72 + 0.55 * gDetR.b, uGStrength);
          roughnessFactor = clamp(roughnessFactor * gRough, 0.06, 1.0);
          // damp band sheen: wet sand/mud reflects — composes with
          // the weather wetness multiplier already in roughnessFactor
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, gDampBand * 0.75);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // micro-normal tilt from the height field's world-space
          // gradient. Faded by slope (planar sampling lies on steep
          // faces) and by distance (mip shimmer guard).
          float gFade = clamp(vGNormW.y, 0.0, 1.0);
          float gDist = length(cameraPosition - vGPos);
          gFade *= 1.0 - smoothstep(45.0, 95.0, gDist);
          if (gFade > 0.003 && uGNormalStrength > 0.0) {
            float gTexel = ${(DETAIL_TILE_M / DETAIL_TEX_SIZE).toFixed(5)};
            vec2 gUvC = vGPos.xz / ${DETAIL_TILE_M.toFixed(2)};
            float gHl = texture2D(uGDetail, gUvC - vec2(gTexel / ${DETAIL_TILE_M.toFixed(2)}, 0.0)).g;
            float gHr = texture2D(uGDetail, gUvC + vec2(gTexel / ${DETAIL_TILE_M.toFixed(2)}, 0.0)).g;
            float gHd = texture2D(uGDetail, gUvC - vec2(0.0, gTexel / ${DETAIL_TILE_M.toFixed(2)})).g;
            float gHu = texture2D(uGDetail, gUvC + vec2(0.0, gTexel / ${DETAIL_TILE_M.toFixed(2)})).g;
            vec2 gSlope = vec2(gHr - gHl, gHu - gHd) / (2.0 * gTexel);
            vec3 gN = normalize(vec3(
              vGNormW.x - gSlope.x * uGNormalStrength * 0.02 * gFade,
              vGNormW.y,
              vGNormW.z - gSlope.y * uGNormalStrength * 0.02 * gFade));
            normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);
          }
        }`);
  };
  // keep this program distinct from every unpatched standard material
  mat.customProgramCacheKey = () => `ground-detail:${strength}:${normalStrength}:${dampBand ? 1 : 0}`;
  mat.needsUpdate = true;
}
