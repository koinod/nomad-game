import { describe, it, expect } from 'vitest';
import {
  cloudVisibleFraction,
  cloudOpacity,
  cloudTint,
  cloudDrift,
  wrapDelta,
  windGust,
} from '../game/Clouds';

// Lane 12: the cloud deck is a pure function of the weather snapshot
// and the sun — pin the math so the wiring can trust it.
describe('cloudVisibleFraction', () => {
  it('clear weather still rates a few wisps', () => {
    const f = cloudVisibleFraction(0.15);
    expect(f).toBeGreaterThan(0.05);
    expect(f).toBeLessThan(0.25);
  });

  it('full cover shows the whole deck, zero cover almost none', () => {
    expect(cloudVisibleFraction(1)).toBeCloseTo(1, 5);
    expect(cloudVisibleFraction(0)).toBeCloseTo(0.05, 5);
  });

  it('monotonic in cover, inputs clamp', () => {
    expect(cloudVisibleFraction(0.75)).toBeGreaterThan(cloudVisibleFraction(0.4));
    expect(cloudVisibleFraction(7)).toBeCloseTo(1, 5);
    expect(cloudVisibleFraction(-2)).toBeCloseTo(0.05, 5);
  });
});

describe('cloudOpacity', () => {
  it('denser under cloud and rain, always bounded', () => {
    expect(cloudOpacity(0.9, 1)).toBeGreaterThan(cloudOpacity(0.2, 0));
    expect(cloudOpacity(1, 1)).toBeLessThanOrEqual(0.92);
    expect(cloudOpacity(0, 0)).toBeGreaterThan(0);
  });
});

describe('cloudTint', () => {
  it('midday clouds are bright, night clouds are dark', () => {
    const day = cloudTint(0.8, 0.2, 0);
    const night = cloudTint(-0.2, 0.2, 0);
    expect(day.lit.r).toBeGreaterThan(0.9);
    expect(night.lit.r).toBeLessThan(0.25);
    expect(day.lit.getHex()).not.toBe(night.lit.getHex());
  });

  it('golden hour warms the lit side', () => {
    const golden = cloudTint(0.02, 0.2, 0);
    expect(golden.lit.r).toBeGreaterThan(golden.lit.b);
  });

  it('a storm darkens and greys the deck', () => {
    const fair = cloudTint(0.8, 0.9, 0);
    const storm = cloudTint(0.8, 0.9, 1);
    expect(storm.lit.r).toBeLessThan(fair.lit.r * 0.7);
    // greyed: channels converge toward each other
    const spread = (c: { r: number; g: number; b: number }) =>
      Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(spread(storm.shade)).toBeLessThan(spread(fair.shade));
  });
});

describe('cloudDrift', () => {
  it('follows the game wind convention (cos → x, sin → z)', () => {
    const east = cloudDrift(0.5, 0);
    expect(east.x).toBeGreaterThan(0);
    expect(Math.abs(east.z)).toBeLessThan(1e-9);
    const south = cloudDrift(0.5, Math.PI / 2);
    expect(south.z).toBeGreaterThan(0);
    expect(Math.abs(south.x)).toBeLessThan(1e-6);
  });

  it('calm air still drifts; storm wind is several times faster', () => {
    const calm = cloudDrift(0, 0.7);
    expect(Math.hypot(calm.x, calm.z)).toBeCloseTo(3, 5);
    const storm = cloudDrift(1, 0.7);
    expect(Math.hypot(storm.x, storm.z)).toBeCloseTo(20, 5);
  });
});

describe('wrapDelta', () => {
  it('identity inside the box, wraps outside it', () => {
    expect(wrapDelta(100, 1700)).toBeCloseTo(100, 5);
    expect(wrapDelta(900, 1700)).toBeCloseTo(-800, 5);
    expect(wrapDelta(-900, 1700)).toBeCloseTo(800, 5);
    expect(wrapDelta(1700 + 42, 1700)).toBeCloseTo(42, 5);
  });
});

describe('windGust', () => {
  it('stays within ±~35% of the mean and never negative', () => {
    for (let t = 0; t < 120; t += 0.37) {
      const g = windGust(t, 0.8);
      expect(g).toBeGreaterThan(0.45);
      expect(g).toBeLessThanOrEqual(0.8 + 1e-9);
    }
    expect(windGust(3, 0)).toBe(0);
  });
});
