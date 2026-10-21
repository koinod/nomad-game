import { describe, it, expect } from 'vitest';
import {
  cloudVisibleFraction,
  cloudOpacity,
  cloudTint,
  cloudDrift,
  wrapDelta,
  windGust,
  swayDisplacementAt,
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

// Item 2 (2026-10-21): the sway field that replaced the gl_VertexID
// shader. The old code phased each vertex by its own ID, so seam
// duplicates tore apart (splitting) and every vertex buzzed on its
// own phase (shaking). The field's contract, pinned here: it is a
// pure continuous function of WORLD position — same world pos, same
// displacement; small moves, small changes; amplitude bounded and
// calm; motion smooth in time.
describe('swayDisplacementAt — the world-position sway field', () => {
  const D = (x: number, z: number, h = 1, t = 3.1, ws = 0.8, dx = 0.8, dz = 0.6, amp = 0.35) =>
    swayDisplacementAt(x, z, h, t, ws, dx, dz, amp);

  it('seam safety: identical world position => identical displacement', () => {
    // duplicated seam vertices share a world position; whatever else
    // differs about them (index, normal, uv), the field cannot tell
    const a = D(37.5, -112.25);
    const b = D(37.5, -112.25);
    expect(a).toEqual(b);
  });

  it('continuity: a 1 cm step in world position moves the displacement by < 2 mm', () => {
    for (let i = 0; i < 40; i++) {
      const x = -200 + i * 9.7;
      const z = 150 - i * 6.3;
      const a = D(x, z, 1, i * 0.61, 1); // full height, full wind: worst case
      const b = D(x + 0.01, z + 0.007, 1, i * 0.61, 1);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.002);
    }
  });

  it('amplitude is bounded by maxAmp and zero at the trunk base', () => {
    for (let i = 0; i < 60; i++) {
      const d = D(i * 13.7 - 300, i * 7.9 - 200, 1, i * 0.43, 1);
      expect(Math.hypot(d.x, d.z)).toBeLessThanOrEqual(0.35 + 1e-9);
    }
    const base = D(10, 10, 0);
    expect(Math.abs(base.x)).toBe(0);
    expect(Math.abs(base.z)).toBe(0);
    const clamped = D(10, 10, -2); // negative height clamps to the base
    expect(Math.abs(clamped.x)).toBe(0);
    expect(Math.abs(clamped.z)).toBe(0);
  });

  it('bend grows with the square of height (trunks hold, tips move)', () => {
    const tip = D(23, -41, 1, 2.2, 0.9);
    const mid = D(23, -41, 0.5, 2.2, 0.9);
    expect(Math.hypot(tip.x, tip.z)).toBeGreaterThan(0.01); // wave is live at this sample
    expect(Math.hypot(tip.x, tip.z) / Math.hypot(mid.x, mid.z)).toBeCloseTo(4, 5);
  });

  it('displacement runs along the wind, never across it', () => {
    for (let i = 0; i < 20; i++) {
      const d = D(i * 17.3, -i * 11.1, 1, i * 0.9, 0.7, 0.8, 0.6);
      // cross(dir, D) == 0 for a parallel vector
      expect(Math.abs(0.8 * d.z - 0.6 * d.x)).toBeLessThan(1e-9);
    }
  });

  it('motion is smooth in time: one frame (16 ms) changes displacement by < 2 cm', () => {
    for (let i = 0; i < 40; i++) {
      const a = D(i * 7.1, -i * 5.3, 1, i * 1.37, 1); // full wind: fastest phase
      const b = D(i * 7.1, -i * 5.3, 1, i * 1.37 + 0.016, 1);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.02);
    }
  });

  it('a gust travels: the whole wave pattern translates downwind at the phase speed', () => {
    // both wave components key off ONE phase variable, so the pattern
    // is a rigid shape sliding along the wind at omega/k m/s — a
    // point the gust reaches later sees exactly what an upwind point
    // sees now. (A pure space-only recurrence does NOT hold: the
    // 0.53 subharmonic has a different wavelength by design.)
    const ws = 0.5;
    const phaseSpeed = (0.9 + 1.1 * ws) / 0.26;
    for (const dt of [0.7, 2.3]) {
      const a = D(11, -7, 1, 1.3, ws, 1, 0);
      const b = D(11 + phaseSpeed * dt, -7, 1, 1.3 + dt, ws, 1, 0);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
    }
  });
});
