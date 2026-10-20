// Pure unit tests for the wave-4 special-husk math (no DOM, no three.js).
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_SPECIALS,
  BRUTE_CHARGE,
  burstDamageAt,
  crawlerSwerve,
  pickAmbientSpecial,
  shriekAlertRadius,
  shriekNoiseLevel,
  specialChance,
  shouldBruteCharge,
  spitFlightTime,
  spitVelocity,
  SPIT_GRAVITY,
} from '../game/huskMath';

describe('specialChance', () => {
  it('starts low and grows with days survived', () => {
    expect(specialChance(0)).toBeCloseTo(0.04);
    expect(specialChance(10)).toBeGreaterThan(specialChance(0));
  });
  it('caps so specials never become the default population', () => {
    expect(specialChance(100)).toBe(0.22);
    expect(specialChance(-3)).toBeCloseTo(0.04);
  });
});

describe('pickAmbientSpecial', () => {
  it('maps the roll across the whole pool', () => {
    expect(pickAmbientSpecial(() => 0.1)).toBe('crawler');
    expect(pickAmbientSpecial(() => 0.4)).toBe('screamer');
    expect(pickAmbientSpecial(() => 0.65)).toBe('spitter');
    expect(pickAmbientSpecial(() => 0.85)).toBe('bloater');
    expect(pickAmbientSpecial(() => 0.99)).toBe('brute');
  });
  it('only ever returns pool members, brutes rarest', () => {
    let brutes = 0;
    let n = 0;
    // deterministic sweep across the unit interval
    for (let r = 0; r < 1; r += 0.005) {
      const k = pickAmbientSpecial(() => r);
      expect(AMBIENT_SPECIALS).toContain(k);
      if (k === 'brute') brutes++;
      n++;
    }
    expect(brutes / n).toBeLessThan(0.1);
  });
});

describe('shriek', () => {
  it('carries further at night', () => {
    expect(shriekAlertRadius(true)).toBeGreaterThan(shriekAlertRadius(false));
  });
  it('noise meter pegs up close and fades to nothing at range', () => {
    expect(shriekNoiseLevel(5)).toBe(100);
    expect(shriekNoiseLevel(28)).toBeGreaterThan(0);
    expect(shriekNoiseLevel(28)).toBeLessThan(100);
    expect(shriekNoiseLevel(60)).toBe(0);
  });
});

describe('burstDamageAt', () => {
  it('is near-full at the core and zero at the rim', () => {
    expect(burstDamageAt(40, 0, 4)).toBe(40);
    expect(burstDamageAt(40, 4, 4)).toBe(0);
    expect(burstDamageAt(40, 2, 4)).toBeGreaterThan(0);
    expect(burstDamageAt(40, 2, 4)).toBeLessThan(40);
  });
});

describe('spit ballistics', () => {
  it('flight time scales with distance inside the band', () => {
    expect(spitFlightTime(4)).toBe(0.55);
    expect(spitFlightTime(16)).toBeCloseTo(1);
    expect(spitFlightTime(60)).toBe(1.25);
  });
  it('the lobbed velocity actually lands on the target', () => {
    const from = { x: 0, y: 2, z: 0 };
    const to = { x: 10, y: 1, z: 6 };
    const T = 1;
    const v = spitVelocity(from, to, T)!;
    // integrate the arc: x/z linear, y under gravity
    const x = from.x + v.vx * T;
    const z = from.z + v.vz * T;
    const y = from.y + v.vy * T - 0.5 * SPIT_GRAVITY * T * T;
    expect(x).toBeCloseTo(to.x);
    expect(z).toBeCloseTo(to.z);
    expect(y).toBeCloseTo(to.y);
  });
  it('rejects a degenerate flight time', () => {
    expect(spitVelocity({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, 0)).toBeNull();
  });
});

describe('brute charge', () => {
  it('only charges inside the distance window, off cooldown, not mid-charge', () => {
    expect(shouldBruteCharge(10, true, false)).toBe(true);
    expect(shouldBruteCharge(3, true, false)).toBe(false);
    expect(shouldBruteCharge(20, true, false)).toBe(false);
    expect(shouldBruteCharge(10, false, false)).toBe(false);
    expect(shouldBruteCharge(10, true, true)).toBe(false);
    expect(BRUTE_CHARGE.minDist).toBeLessThan(BRUTE_CHARGE.maxDist);
  });
});

describe('crawlerSwerve', () => {
  it('stays bounded and averages near zero over a cycle', () => {
    let sum = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const v = crawlerSwerve(i * 0.05, 1.7);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.001);
      sum += v;
    }
    expect(Math.abs(sum / N)).toBeLessThan(0.15);
  });
});
