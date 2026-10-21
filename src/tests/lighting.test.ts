import { describe, expect, it } from 'vitest';
import { SKY_PALETTES, skyPhase } from '../game/World';

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
