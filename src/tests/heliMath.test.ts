import { describe, expect, it } from 'vitest';
import {
  approach, climbRates, heliImpactDamageMult, heliTopSpeedFactor, hoverDamping,
  landingSeverity, liftAuthority, spoolSeconds, tiltForVelocity,
} from '../game/heliMath';

describe('liftAuthority', () => {
  it('is zero with a stopped rotor and full at flight rpm', () => {
    expect(liftAuthority(0)).toBe(0);
    expect(liftAuthority(1)).toBe(1);
  });
  it('spools quadratically — half rotor, quarter lift', () => {
    expect(liftAuthority(0.5)).toBeCloseTo(0.25);
    expect(liftAuthority(0.25)).toBeCloseTo(0.0625);
  });
  it('clamps outside 0..1', () => {
    expect(liftAuthority(-2)).toBe(0);
    expect(liftAuthority(3)).toBe(1);
  });
});

describe('landingSeverity', () => {
  it('a gentle touchdown costs nothing', () => {
    expect(landingSeverity(-1.5)).toEqual({ grade: 'soft', damage: 0 });
    expect(landingSeverity(0)).toEqual({ grade: 'soft', damage: 0 });
  });
  it('escalates through firm and hard', () => {
    expect(landingSeverity(-3.5).grade).toBe('firm');
    expect(landingSeverity(-6).grade).toBe('hard');
    expect(landingSeverity(-6).damage).toBeGreaterThan(landingSeverity(-3.5).damage);
  });
  it('a plummet is a crash that nearly writes the airframe off', () => {
    const s = landingSeverity(-14);
    expect(s.grade).toBe('crash');
    expect(s.damage).toBeGreaterThan(0.8);
  });
});

describe('tiltForVelocity', () => {
  it('forward speed pitches the nose down, capped', () => {
    expect(tiltForVelocity(20, 0).pitch).toBeGreaterThan(0.2);
    expect(tiltForVelocity(200, 0).pitch).toBeLessThanOrEqual(0.36);
  });
  it('leftward drift banks left (negative roll)', () => {
    expect(tiltForVelocity(0, 15).roll).toBeLessThan(0);
    expect(tiltForVelocity(0, -15).roll).toBeGreaterThan(0);
  });
  it('hover is level', () => {
    expect(tiltForVelocity(0, 0)).toEqual({ pitch: 0, roll: 0 });
  });
});

describe('approach + hoverDamping', () => {
  it('approach never overshoots', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
  });
  it('hover damping bleeds drift but never reverses it', () => {
    expect(hoverDamping(0.1)).toBeCloseTo(0.84);
    expect(hoverDamping(10)).toBe(0);
  });
});

describe('heli upgrades (wave 4)', () => {
  it('the aviation tune spools the rotor a third faster', () => {
    expect(spoolSeconds([])).toBeCloseTo(2.2);
    expect(spoolSeconds(['heli_engine'])).toBeLessThan(spoolSeconds([]) * 0.75);
  });
  it('the tune climbs harder and flies faster', () => {
    const stock = climbRates([]);
    const tuned = climbRates(['heli_engine']);
    expect(tuned.up).toBeGreaterThan(stock.up);
    expect(tuned.down).toBeGreaterThan(stock.down);
    expect(heliTopSpeedFactor([])).toBe(1);
    expect(heliTopSpeedFactor(['heli_engine'])).toBeCloseTo(1.12);
  });
  it('airframe armor halves felt impact damage, and only that', () => {
    expect(heliImpactDamageMult([])).toBe(1);
    expect(heliImpactDamageMult(['heli_armor'])).toBeCloseTo(0.45);
    expect(heliImpactDamageMult(['heli_engine'])).toBe(1);
  });
});
