import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SKY_PALETTES, skyPhase, skyPaletteAt, sunMoonBlend, rainOpacity, terrainWetnessLook } from '../game/World';

/**
 * Lighting baseline (Ian, 2026-10-20): a real sun + sky IBL + hemisphere
 * bounce. The standard: enclosed interiors at midday are SHADED, never
 * pitch black — the hemisphere fill is the guarantee, and it must never
 * drop to zero in any phase.
 */
describe('skyPhase', () => {
  it('maps sun elevation to day / golden / night', () => {
    expect(skyPhase(1)).toBe('day');
    expect(skyPhase(0.26)).toBe('day');
    expect(skyPhase(0.25)).toBe('golden');
    expect(skyPhase(0)).toBe('golden');
    expect(skyPhase(-0.05)).toBe('golden');
    expect(skyPhase(-0.07)).toBe('night');
    expect(skyPhase(-1)).toBe('night');
  });
});

describe('SKY_PALETTES — the interior standard', () => {
  it('every phase carries real fill: hemi and env never near zero by day', () => {
    for (const phase of ['day', 'golden', 'night'] as const) {
      expect(SKY_PALETTES[phase].hemiIntensity, phase).toBeGreaterThanOrEqual(0.2);
      expect(SKY_PALETTES[phase].envIntensity, phase).toBeGreaterThan(0);
    }
    // midday interior guarantee: strong bounce fill
    expect(SKY_PALETTES.day.hemiIntensity).toBeGreaterThanOrEqual(0.5);
    expect(SKY_PALETTES.day.envIntensity).toBeGreaterThanOrEqual(0.4);
  });

  it('light falls off monotonically toward night', () => {
    expect(SKY_PALETTES.day.envIntensity).toBeGreaterThan(SKY_PALETTES.golden.envIntensity);
    expect(SKY_PALETTES.golden.envIntensity).toBeGreaterThan(SKY_PALETTES.night.envIntensity);
    expect(SKY_PALETTES.day.hemiIntensity).toBeGreaterThan(SKY_PALETTES.night.hemiIntensity);
  });

  it('day sky is a real sky: blue zenith, bright horizon, warm sun', () => {
    const d = SKY_PALETTES.day;
    expect(d.zenith).toBe(0x2f62a8);
    expect(d.sun).toBe(0xfff2dd);
    expect(d.horizon).not.toBe(d.zenith);
  });
});

describe('skyPaletteAt — the visible sky, continuous in elevation (Item 7)', () => {
  const lum = (hex: number) => {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };

  it('endpoints ARE the phase palettes (noon = day, midnight = night, horizon = golden)', () => {
    expect(skyPaletteAt(1).zenith).toBe(SKY_PALETTES.day.zenith);
    expect(skyPaletteAt(0.25).sun).toBe(SKY_PALETTES.day.sun);
    expect(skyPaletteAt(0).zenith).toBe(SKY_PALETTES.golden.zenith);
    expect(skyPaletteAt(0).horizon).toBe(SKY_PALETTES.golden.horizon);
    expect(skyPaletteAt(-0.06).zenith).toBe(SKY_PALETTES.night.zenith);
    expect(skyPaletteAt(-1).sun).toBe(SKY_PALETTES.night.sun);
  });

  it('blends between stops (no color steps through dawn/dusk)', () => {
    const mid = skyPaletteAt(0.125); // halfway golden -> day
    expect(mid.zenith).not.toBe(SKY_PALETTES.golden.zenith);
    expect(mid.zenith).not.toBe(SKY_PALETTES.day.zenith);
    const dusk = skyPaletteAt(-0.03); // halfway night -> golden
    expect(dusk.zenith).not.toBe(SKY_PALETTES.night.zenith);
    expect(dusk.zenith).not.toBe(SKY_PALETTES.golden.zenith);
  });

  it('the sky brightens monotonically with the sun (between the stops)', () => {
    const elevs = [-0.06, -0.03, 0, 0.125, 0.25];
    const lums = elevs.map((e) => lum(skyPaletteAt(e).horizon));
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeGreaterThan(lums[i - 1]);
    }
  });
});

// Item 3 (2026-10-21): the transition pops. Intensities used to be
// read from the stepped phase palettes, and the sun/moon/background/
// fog switched on a hard elev > 0.02 branch — dawn and dusk snapped.
// Everything updateSky applies is now a continuous function of
// elevation; these tests pin that continuity at the old fault lines.
describe('Item 3 — no lighting pops at dawn/dusk', () => {
  it('palette intensities are continuous across the phase thresholds', () => {
    // continuity = bounded slope, not small total change: the golden
    // band is narrow, so intensities legitimately move fast there —
    // but a STEP (the old behavior) would jump the whole segment
    // delta (0.25+) inside any window, however small. Over a 0.002
    // window the steepest true slope (env across night->golden,
    // 5.3/unit) moves ~0.011.
    for (const e of [0.25, -0.06]) {
      const a = skyPaletteAt(e - 0.001);
      const b = skyPaletteAt(e + 0.001);
      expect(Math.abs(b.hemiIntensity - a.hemiIntensity)).toBeLessThan(0.015);
      expect(Math.abs(b.envIntensity - a.envIntensity)).toBeLessThan(0.015);
    }
    // and the endpoints still ARE the palette constants
    expect(skyPaletteAt(1).hemiIntensity).toBe(SKY_PALETTES.day.hemiIntensity);
    expect(skyPaletteAt(1).envIntensity).toBe(SKY_PALETTES.day.envIntensity);
    expect(skyPaletteAt(-1).hemiIntensity).toBe(SKY_PALETTES.night.hemiIntensity);
    expect(skyPaletteAt(0).envIntensity).toBe(SKY_PALETTES.golden.envIntensity);
  });

  it('sun/moon blend is continuous and complementary across the old 0.02 branch line', () => {
    let prev = sunMoonBlend(-0.2);
    for (let e = -0.198; e <= 0.3; e += 0.002) {
      const b = sunMoonBlend(e);
      // smoothstep's steepest slope is 18.75/unit elev -> ~0.038 over
      // this window; the old hard branch jumped 1.0 at the line
      expect(Math.abs(b.sun - prev.sun)).toBeLessThan(0.045);
      expect(b.sun + b.moon).toBeCloseTo(1, 9);
      prev = b;
    }
    // crossing the exact old fault line moves almost nothing
    expect(Math.abs(sunMoonBlend(0.021).sun - sunMoonBlend(0.019).sun)).toBeLessThan(0.04);
    // full day / full night saturation
    expect(sunMoonBlend(0.3).sun).toBe(1);
    expect(sunMoonBlend(0.3).moon).toBe(0);
    expect(sunMoonBlend(-0.3).sun).toBe(0);
    expect(sunMoonBlend(-0.3).moon).toBe(1);
    // at the old branch line itself both sources are partially live —
    // the definition of a crossfade, not a switch
    const atLine = sunMoonBlend(0.02);
    expect(atLine.sun).toBeGreaterThan(0.3);
    expect(atLine.moon).toBeGreaterThan(0.1);
  });

  it('rain opacity ramps from zero — no visible-threshold pop', () => {
    expect(rainOpacity(0)).toBe(0);
    expect(rainOpacity(0.02)).toBeLessThan(0.02); // the old rule showed ~0.17 here
    expect(rainOpacity(1)).toBeCloseTo(0.66, 9); // same ceiling as before
    let prev = 0;
    for (let p = 0; p <= 1.001; p += 0.05) {
      expect(rainOpacity(p)).toBeGreaterThanOrEqual(prev);
      prev = rainOpacity(p);
    }
  });

  it('wet ground looks wet: darker and smoother, dry ground untouched', () => {
    expect(terrainWetnessLook(0)).toEqual({ roughness: 0.95, darken: 1 });
    const soaked = terrainWetnessLook(1);
    expect(soaked.roughness).toBeCloseTo(0.475, 6);
    expect(soaked.darken).toBeCloseTo(0.72, 6);
    const mid = terrainWetnessLook(0.5);
    expect(mid.roughness).toBeLessThan(0.95);
    expect(mid.darken).toBeLessThan(1);
    expect(terrainWetnessLook(7).darken).toBeCloseTo(0.72, 6); // clamps
  });
});
