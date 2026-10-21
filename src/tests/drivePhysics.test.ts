// CRAFT WAVE physics pass — the pure helpers behind VehicleManager.drive.
import { describe, expect, it } from 'vitest';
import {
  cgHeightM, cornerRoll, effectiveSteerAngle, impactBounce, impactDamage,
  understeerK, vehicleMassKg, weightTransferPitch,
} from '../game/drivePhysics';

const car = (id: string) => ({ id, kind: 'car' });

describe('vehicleMassKg', () => {
  it('honors the tow canon: semi > dually > pickup', () => {
    expect(vehicleMassKg(car('semi'))).toBeGreaterThan(vehicleMassKg(car('f250')));
    expect(vehicleMassKg(car('f250'))).toBeGreaterThan(vehicleMassKg(car('pickup')));
  });
  it('tank outweighs everything; bikes are lightest', () => {
    expect(vehicleMassKg(car('tank'))).toBeGreaterThan(vehicleMassKg(car('goliath')));
    expect(vehicleMassKg({ id: 'sportbike', kind: 'bike' })).toBeLessThan(400);
  });
  it('falls back by kind for unknown ids', () => {
    expect(vehicleMassKg({ id: 'mystery', kind: 'car' })).toBe(1600);
  });
});

describe('impactDamage', () => {
  it('grows with the square of speed', () => {
    const slow = impactDamage(6, 1600, 1, 1);
    const fast = impactDamage(12, 1600, 1, 1);
    expect(fast).toBeCloseTo(slow * 4, 5);
  });
  it('heavier hulls spread the same hit thinner', () => {
    expect(impactDamage(12, 7600, 1, 1)).toBeLessThan(impactDamage(12, 1300, 1, 1));
  });
  it('armor multipliers still apply, and damage is capped', () => {
    expect(impactDamage(12, 1600, 0.3, 1)).toBeCloseTo(impactDamage(12, 1600, 1, 1) * 0.3, 6);
    expect(impactDamage(60, 1300, 1, 1)).toBeLessThanOrEqual(0.35);
  });
  it('a parking-lot tap costs a few percent, a highway hit is a wreck', () => {
    expect(impactDamage(6, 1380, 1, 1)).toBeGreaterThan(0.02);
    expect(impactDamage(6, 1380, 1, 1)).toBeLessThan(0.08);
    expect(impactDamage(20, 1380, 1, 1)).toBeGreaterThan(0.3);
  });
});

describe('impactBounce', () => {
  it('light bounces more than heavy, always within (0, 0.5]', () => {
    expect(impactBounce(200)).toBeGreaterThan(impactBounce(8000));
    expect(impactBounce(200)).toBeLessThanOrEqual(0.5);
    expect(impactBounce(39000)).toBeGreaterThanOrEqual(0.1);
  });
});

describe('effectiveSteerAngle (understeer)', () => {
  it('full lock at a standstill, saturated at speed', () => {
    expect(effectiveSteerAngle(0.5, 0, 1)).toBeCloseTo(0.5, 6);
    expect(effectiveSteerAngle(0.5, 1, 1)).toBeCloseTo(0.25, 6);
  });
  it('the Mustang holds its line longer than the box truck', () => {
    const mustang = effectiveSteerAngle(0.5, 0.8, understeerK(car('mustang')));
    const boxtruck = effectiveSteerAngle(0.5, 0.8, understeerK(car('boxtruck')));
    expect(mustang).toBeGreaterThan(boxtruck);
  });
});

describe('weight transfer', () => {
  it('braking dives (+), launching squats (-), capped both ways', () => {
    expect(weightTransferPitch(-6, 0.55, 3)).toBeGreaterThan(0);
    expect(weightTransferPitch(6, 0.55, 3)).toBeLessThan(0);
    expect(Math.abs(weightTransferPitch(-40, 1, 3))).toBeLessThanOrEqual(0.065);
  });
  it('a tall CG transfers more than a low one', () => {
    expect(Math.abs(weightTransferPitch(-5, 1.05, 3))).toBeGreaterThan(Math.abs(weightTransferPitch(-5, 0.48, 3)));
  });
  it('corner roll: right turn rolls the body out (negative), capped', () => {
    expect(cornerRoll(0.4, 15, 0.8, 1.6)).toBeLessThan(0);
    expect(cornerRoll(-0.4, 15, 0.8, 1.6)).toBeGreaterThan(0);
    expect(Math.abs(cornerRoll(3, 40, 1.1, 1.6))).toBeLessThanOrEqual(0.085);
    expect(cgHeightM(car('semi'))).toBeGreaterThan(cgHeightM(car('mustang')));
  });
});

