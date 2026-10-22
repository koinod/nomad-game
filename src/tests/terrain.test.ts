import { describe, it, expect } from 'vitest';
import { heightAt, slopeAt } from '../game/World';
import { AIRBASE_SITE } from '../game/airbaseSite';
import { betaSector, BETA_CHANNEL_DEPTH } from '../data/betaLayout';

// Beta Island terrain facts (map integration, 2026-10-21 — this file
// pinned the OLD analytic island's topography; the deliberate changes
// are the terrain itself: surveyed ground is now the layout's sector
// pads read off the one authored grid, and open ground is the grid's
// smooth authored landform, not seeded noise).
describe('beta terrain topography', () => {
  it('the airbase sector pad stays at grade in its core', () => {
    const [cx, cz] = AIRBASE_SITE.origin;
    expect(Math.abs(heightAt(cx, cz) - betaSector('airbase').padY)).toBeLessThan(0.05);
    expect(slopeAt(cx, cz)).toBeLessThan(0.02);
  });

  it('open dune country has real relief at driving scale', () => {
    // a line through the SE dune field (raider_fort country): the
    // authored landform rolls — over a meter of range across 90 m,
    // with meter-scale steps a suspension can feel
    const hs: number[] = [];
    for (let x = 470; x <= 560; x += 2) hs.push(heightAt(x, 105));
    const range = Math.max(...hs) - Math.min(...hs);
    expect(range).toBeGreaterThan(0.8);
    const diffs = hs.slice(1).map((h, i) => Math.abs(h - hs[i]));
    const jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    expect(jitter).toBeGreaterThan(0.01);
  });

  it('the shorelines still meet the water (heights fall off)', () => {
    // Atlantic side, NORTH of the waist channel's mouth: dry sand at
    // x 600, deep water by x 660. This transect used to run at z 40;
    // the waist-channel revision (aerial v2 canon) cut the channel's
    // Atlantic mouth through that line — BETA_WAIST_CHANNEL exits the
    // east shore along (700, 55) → (640, 45) → (520, 25), so (600, 40)
    // now sits ~2 m off the centerline, inside the dredge cut. z −60
    // is the same Atlantic shore ~98 m north of the mouth line, far
    // outside the carve's full influence (15 m halfwidth + 18 m
    // feather); its heights are byte-identical pre/post channel
    // (2.42 dry / −13.50 deep, probed against the pre-lane tree).
    expect(heightAt(600, -60)).toBeGreaterThan(0.5);
    expect(heightAt(660, -60)).toBeLessThan(-5);
    // The mouth itself, asserted as the NEW canon: the old z-40
    // transect crosses the dredged cut at full depth where the dry
    // sand used to be, and still reaches the deep Atlantic past it.
    expect(heightAt(600, 40)).toBeCloseTo(BETA_CHANNEL_DEPTH, 1);
    expect(heightAt(660, 40)).toBeLessThan(-5);
    // the south sound: marsh edge at z 240, open water by z 300
    expect(heightAt(0, 240)).toBeGreaterThan(0);
    expect(heightAt(0, 300)).toBeLessThan(-1);
  });

  it('slope reads ~0 on flat pads and > 0 on the massif faces', () => {
    let maxSlope = 0;
    for (let x = -500; x < 500; x += 25) {
      for (let z = -260; z < 260; z += 26) {
        maxSlope = Math.max(maxSlope, slopeAt(x, z));
      }
    }
    expect(maxSlope).toBeGreaterThan(0.25); // somewhere is genuinely steep
  });
});
