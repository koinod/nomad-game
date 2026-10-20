// World terrain facts the AIRBASE wave depends on: the plateau is truly
// flat across the complex, and the carrier anchorage is open water so its
// POI resolves to the exact surveyed spot (findLandZ fallback).
import { describe, expect, it } from 'vitest';
import { AIRBASE_CENTER, AIRBASE_GRADE, findLandZ, heightAt, initTerrainField } from '../game/World';

initTerrainField(1337);

describe('airbase plateau', () => {
  it('is flat at grade across the whole complex core', () => {
    const [cx, cz] = AIRBASE_CENTER;
    for (const dx of [-120, -60, 0, 60, 120]) {
      for (const dz of [-70, -35, 0, 35, 70]) {
        expect(Math.abs(heightAt(cx + dx, cz + dz) - AIRBASE_GRADE)).toBeLessThan(0.02);
      }
    }
  });

  it('resolves the airbase POI at its nominal position', () => {
    expect(findLandZ(AIRBASE_CENTER[0], AIRBASE_CENTER[1])).toBe(AIRBASE_CENTER[1]);
  });

  it('does not disturb the town pad (mask does not bleed west)', () => {
    // town center keeps its historic height band: 2.4 pad + broad swell
    const h = heightAt(40, 0);
    expect(h).toBeGreaterThan(1.2);
    expect(h).toBeLessThan(4.8);
  });
});

describe('carrier anchorage', () => {
  it('is open water at the surveyed spot', () => {
    expect(heightAt(-688, 48)).toBeLessThan(0);
    // no land in the probe band: findLandZ returns the guess untouched
    expect(findLandZ(-688, 48)).toBe(48);
  });
});
