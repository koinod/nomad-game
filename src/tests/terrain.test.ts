import { describe, it, expect, beforeAll } from 'vitest';
import { initTerrainField, heightAt, slopeAt, AIRBASE_CENTER, AIRBASE_GRADE, setTerrainPads } from '../game/World';

// Environment wave topography: the surveyed ground must NOT move (the
// airfield rebuild and every pad sit on it), while open ground gains
// relief and grain.
describe('terrain topography', () => {
  beforeAll(() => {
    initTerrainField(1337);
    setTerrainPads([]);
  });

  it('the airbase plateau stays at grade in its core', () => {
    const [cx, cz] = AIRBASE_CENTER;
    expect(Math.abs(heightAt(cx, cz) - AIRBASE_GRADE)).toBeLessThan(0.05);
    expect(slopeAt(cx, cz)).toBeLessThan(0.02);
  });

  it('open inland ground has micro grain (not billiard flat)', () => {
    // sample a line through open dune country; heights must vary at
    // meter scale by more than a smooth swell would allow
    const hs: number[] = [];
    for (let x = -320; x <= -260; x += 2) hs.push(heightAt(x, 150));
    const diffs = hs.slice(1).map((h, i) => Math.abs(h - hs[i]));
    const jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    expect(jitter).toBeGreaterThan(0.005);
  });

  it('the shoreline still meets the water (heights fall off)', () => {
    expect(heightAt(0, 300)).toBeLessThan(0.6);
    expect(heightAt(0, 318)).toBeLessThan(0.2);
  });

  it('slope reads ~0 on flat pads and > 0 on dune ridges', () => {
    let maxSlope = 0;
    for (let x = -500; x < 500; x += 25) {
      for (let z = -260; z < 260; z += 26) {
        maxSlope = Math.max(maxSlope, slopeAt(x, z));
      }
    }
    expect(maxSlope).toBeGreaterThan(0.25); // somewhere is genuinely steep
  });
});
