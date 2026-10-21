import { describe, expect, it } from 'vitest';
import { estimatePerformance, torqueAt } from '../game/carSpec';
import {
  GT500_BASE_MASS_KG,
  GT500_DEF,
  GT500_PARAMS,
  GT500_TORQUE,
  GT500_WHEEL_RIG,
} from '../game/gt500Def';

/**
 * Lane 1 — the GT500's numbers are period Shelby numbers, fed through
 * the same estimatePerformance math the rigid-body controller uses.
 * Two honesty notes: (1) peak power is measured up to the car's own
 * redline — carSpec.peakPowerKw scans to 7600 rpm, past this engine's
 * 6250 redline, and would overstate it; (2) the sim has no clutch-dump
 * launch, so its 0-100 runs a few tenths behind the 4.5 s magazine
 * times that used one. The spec is the spec either way.
 */
const perf = estimatePerformance(GT500_PARAMS);

/** Peak power capped at this engine's redline (see header note). */
let peakKwRedline = 0;
for (let rpm = 850; rpm <= 6250; rpm += 50) {
  peakKwRedline = Math.max(peakKwRedline, (torqueAt(GT500_TORQUE, rpm) * rpm * Math.PI) / 30000);
}

describe('gt500Def period spec', () => {
  it('peaks at 500 hp class power (at its own redline)', () => {
    expect(peakKwRedline).toBeGreaterThan(355);
    expect(peakKwRedline).toBeLessThan(390);
  });

  it('peaks at 480 lb-ft class torque (651 Nm)', () => {
    const tq = Math.max(...GT500_TORQUE.map(([, nm]) => nm));
    expect(tq).toBeGreaterThanOrEqual(630);
    expect(tq).toBeLessThanOrEqual(670);
  });

  it('carries real S197 mass, gearing and tank', () => {
    expect(GT500_BASE_MASS_KG).toBe(1778);
    expect(GT500_PARAMS.massKg).toBe(1778 + 75 + 45);
    expect(GT500_PARAMS.gears).toEqual([2.97, 1.78, 1.3, 1.0, 0.8, 0.63]);
    expect(GT500_PARAMS.finalDrive).toBe(3.31);
    expect(GT500_PARAMS.redlineRpm).toBe(6250);
    expect(GT500_DEF.fuelMax).toBe(61);
    expect(GT500_DEF.length).toBeGreaterThan(4.6);
    expect(GT500_DEF.length).toBeLessThan(4.9);
  });

  it('wheel rig names match the GLB contract in suspension order', () => {
    expect(GT500_WHEEL_RIG).toEqual([
      ['WheelFR', 0],
      ['WheelFL', 1],
      ['WheelRR', 2],
      ['WheelRL', 3],
    ]);
  });
});

describe('gt500Def simulated performance', () => {
  it('0-100 in the high-4s to high-5s band (no clutch-dump in the sim)', () => {
    expect(perf.zeroToHundredSec).toBeGreaterThan(4.9);
    expect(perf.zeroToHundredSec).toBeLessThan(5.9);
  });

  it('top speed in the period class (car was limited to 250 km/h)', () => {
    expect(perf.topSpeedKmh).toBeGreaterThan(225);
    expect(perf.topSpeedKmh).toBeLessThan(255);
  });

  it('power-to-weight sits in the period class (~197 kW/t)', () => {
    const p2w = peakKwRedline / (GT500_PARAMS.massKg / 1000);
    expect(p2w).toBeGreaterThan(180);
    expect(p2w).toBeLessThan(215);
  });
});
