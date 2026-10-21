import { describe, it, expect } from 'vitest';
import { weatherSkyAdjust } from '../game/World';

// Environment wave: weather bends the lighting baseline through one
// pure function — pin its shape so the wiring can trust it.
describe('weatherSkyAdjust', () => {
  it('no weather = the untouched baseline', () => {
    const a = weatherSkyAdjust(undefined);
    expect(a.sunScale).toBe(1);
    expect(a.hemiScale).toBe(1);
    expect(a.envScale).toBe(1);
    expect(a.fogFar).toBe(900);
    expect(a.fogNear).toBe(120);
  });

  it('full cloud cover eats most of the sun, some bounce and IBL', () => {
    const a = weatherSkyAdjust({ cloudCover: 1, fog: 0, precipitation: 0 });
    expect(a.sunScale).toBeCloseTo(0.18, 5);
    expect(a.hemiScale).toBeCloseTo(0.75, 5);
    expect(a.envScale).toBeCloseTo(0.4, 5);
  });

  it('dense fog collapses view distance to tens of meters', () => {
    const a = weatherSkyAdjust({ cloudCover: 0, fog: 1, precipitation: 0 });
    expect(a.fogFar).toBeCloseTo(55, 5);
    expect(a.fogNear).toBeCloseTo(6, 5);
  });

  it('rain alone pulls the fog in part-way', () => {
    const a = weatherSkyAdjust({ cloudCover: 0.2, fog: 0, precipitation: 1 });
    expect(a.fogFar).toBeLessThan(900);
    expect(a.fogFar).toBeGreaterThan(55);
  });

  it('inputs clamp — garbage in, sane sky out', () => {
    const a = weatherSkyAdjust({ cloudCover: 7, fog: -2, precipitation: 3 });
    expect(a.sunScale).toBeGreaterThanOrEqual(0.18 - 1e-9);
    expect(a.fogFar).toBeGreaterThanOrEqual(55);
    expect(a.fogFar).toBeLessThanOrEqual(900);
  });
});
