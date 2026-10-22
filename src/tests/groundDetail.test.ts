import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DETAIL_TEX_SIZE, MACRO_TEX_SIZE, applyGroundDetail, generateDetailPixels,
  generateMacroPixels, groundDetailTextures, tileableFbm,
} from '../game/groundDetail';
import {
  SCATTER_CLUSTER_TRIS, SCATTER_MIN_Y, SCATTER_ROAD_CLEARANCE, SCATTER_MAX_SLOPE,
  buildScatterGeometry, computeGroundScatter,
} from '../game/groundScatter';
import { betaHeightAt, betaRoadDistance, betaSlopeAt } from '../game/betaTerrain';
import { isSurveyedGround } from '../game/Vegetation';
import { mulberry32 } from '../game/rng';

/**
 * Ground detail + micro-scatter (2026-10-22 lane). The contract:
 * the maps are deterministic procedural data (same bytes every
 * run), perfectly tileable, and the scatter obeys its placement
 * rules on the REAL ground data — while not one terrain height
 * anywhere changes (the height-identity suite pins that side).
 */

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const channelMean = (px: Uint8Array, ch: number): number => {
  let s = 0;
  const n = px.length / 4;
  for (let i = 0; i < n; i++) s += px[i * 4 + ch];
  return s / n;
};

describe('ground detail maps — procedural, deterministic, tileable', () => {
  it('detail pixels are byte-identical across runs and well-formed', () => {
    const a = generateDetailPixels();
    const b = generateDetailPixels();
    expect(a.length).toBe(DETAIL_TEX_SIZE * DETAIL_TEX_SIZE * 4);
    expect(bytesEqual(a, b)).toBe(true);
    // alpha is opaque everywhere; channel means sit mid-field (the
    // shader decodes them as multipliers around 1.0)
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
    for (const ch of [0, 1, 2]) {
      const m = channelMean(a, ch);
      expect(m, `channel ${ch}`).toBeGreaterThan(95);
      expect(m, `channel ${ch}`).toBeLessThan(165);
    }
  });

  it('the micro tile wraps seamlessly (seam steps are no worse than interior steps)', () => {
    const px = generateDetailPixels();
    const S = DETAIL_TEX_SIZE;
    let seam = 0;
    let inner = 0;
    let rows = 0;
    for (let y = 0; y < S; y += 7) {
      seam += Math.abs(px[(y * S) * 4] - px[(y * S + S - 1) * 4]);
      inner += Math.abs(px[(y * S + 100) * 4] - px[(y * S + 101) * 4]);
      rows++;
    }
    expect(seam / rows).toBeLessThanOrEqual((inner / rows) * 1.5 + 1);
  });

  it('macro pixels are deterministic with a centered blotch field', () => {
    const a = generateMacroPixels();
    const b = generateMacroPixels();
    expect(a.length).toBe(MACRO_TEX_SIZE * MACRO_TEX_SIZE * 4);
    expect(bytesEqual(a, b)).toBe(true);
    const m = channelMean(a, 0);
    expect(m).toBeGreaterThan(100);
    expect(m).toBeLessThan(150);
  });

  it('tileableFbm stays in [0, 1] and differs per seed', () => {
    const f1 = tileableFbm(mulberry32(7), 32, 4, 3);
    const f2 = tileableFbm(mulberry32(8), 32, 4, 3);
    let same = 0;
    for (let i = 0; i < f1.length; i++) {
      expect(f1[i]).toBeGreaterThanOrEqual(0);
      expect(f1[i]).toBeLessThanOrEqual(1);
      if (f1[i] === f2[i]) same++;
    }
    expect(same).toBeLessThan(f1.length * 0.05);
  });

  it('textures are DataTextures at the pinned sizes with repeat wrap', () => {
    const tex = groundDetailTextures();
    expect(tex.detail.image.width).toBe(DETAIL_TEX_SIZE);
    expect(tex.macro.image.width).toBe(MACRO_TEX_SIZE);
    expect(tex.detail.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.detail.wrapT).toBe(THREE.RepeatWrapping);
    expect(groundDetailTextures()).toBe(tex); // cached, generated once
  });
});

describe('applyGroundDetail — the shader patch', () => {
  const fakeShader = () => ({
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
    fragmentShader: [
      '#include <common>',
      'void main() {',
      '#include <color_fragment>',
      '#include <roughnessmap_fragment>',
      '#include <normal_fragment_maps>',
      '}',
    ].join('\n'),
  });

  it('injects into every chunk it depends on and binds both maps', () => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    applyGroundDetail(mat);
    const shader = fakeShader();
    mat.onBeforeCompile(shader as never, null as never);
    expect(shader.uniforms.uGDetail?.value).toBeInstanceOf(THREE.DataTexture);
    expect(shader.uniforms.uGMacro?.value).toBeInstanceOf(THREE.DataTexture);
    expect(shader.vertexShader).toContain('vGPos = position;');
    expect(shader.fragmentShader).toContain('gDampBand');
    expect(shader.fragmentShader).toContain('gGrain');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp(roughnessFactor * gRough');
    // chunk includes survive (the patch appends, never replaces)
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>');
  });

  it('program cache keys differ per option set (no cross-material program bleed)', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    applyGroundDetail(a);
    applyGroundDetail(b, { strength: 0.7, normalStrength: 0.35, dampBand: false });
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});

describe('ground micro-scatter — placement rules on the real ground', () => {
  const placements = computeGroundScatter(42);

  it('is deterministic and lands in the density band the budget allows', () => {
    const again = computeGroundScatter(42);
    expect(again.length).toBe(placements.length);
    expect(again[10]).toEqual(placements[10]);
    expect(placements.length).toBeGreaterThan(900);
    expect(placements.length).toBeLessThan(1900);
    // total mesh budget ~31k tris; any single anchor's view is a
    // small fraction of that (see the layer report)
    expect(placements.length * SCATTER_CLUSTER_TRIS).toBeLessThan(42000);
  });

  it('every placement stands on the sampler ground, dry, off roads and pads, on a gentle slope', () => {
    for (const p of placements) {
      expect(['sand', 'marsh', 'grass', 'forest']).toContain(p.zone);
      expect(p.y).toBeCloseTo(betaHeightAt(p.x, p.z) - 0.02, 5);
      expect(p.y).toBeGreaterThanOrEqual(SCATTER_MIN_Y - 0.02 - 1e-9);
      expect(betaRoadDistance(p.x, p.z)).toBeGreaterThanOrEqual(SCATTER_ROAD_CLEARANCE - 1e-9);
      expect(betaSlopeAt(p.x, p.z)).toBeLessThanOrEqual(SCATTER_MAX_SLOPE + 1e-9);
      expect(isSurveyedGround(p.x, p.z)).toBe(false);
      expect(p.scale).toBeGreaterThanOrEqual(0.7);
      expect(p.scale).toBeLessThanOrEqual(1.6);
    }
  });

  it('covers the marsh and the beaches, not just the inland grass', () => {
    const byZone = new Map<string, number>();
    for (const p of placements) byZone.set(p.zone, (byZone.get(p.zone) ?? 0) + 1);
    expect(byZone.get('marsh') ?? 0).toBeGreaterThan(40);
    expect(byZone.get('sand') ?? 0).toBeGreaterThan(20);
    expect(byZone.get('forest') ?? 0).toBeGreaterThan(100);
  });

  it('cluster geometry matches the pinned triangle budget and carries colors', () => {
    const geo = buildScatterGeometry();
    const posAttr = geo.getAttribute('position');
    expect(posAttr.count).toBe(SCATTER_CLUSTER_TRIS * 3);
    expect(geo.getAttribute('color')).toBeDefined();
    geo.computeBoundingSphere();
    expect(geo.boundingSphere?.radius ?? 99).toBeLessThan(0.35);
  });
});
