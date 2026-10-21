import { describe, expect, it } from 'vitest';
import { carParams, estimatePerformance, peakPowerKw, torqueAt, STOCK_TORQUE } from '../game/carSpec';

/**
 * Piece 3 performance law (Ian): the stock FX genuinely reaches
 * >= 220 km/h; the max-speed build (Dark Horse spec, lightest config)
 * runs ~260 km/h class; weight measurably costs speed. All figures
 * come from the same parameters the Rapier controller is fed.
 */
const stock = estimatePerformance(carParams([]));
const maxBuild = estimatePerformance(
  carParams(['engine_tune', 'supercharger', 'weight_reduction', 'grip_tires', 'final_drive']),
);
const heavy = estimatePerformance(carParams(['armor', 'bullbar', 'cargo_racks'], 45));

describe('carSpec stock FX', () => {
  it('peaks at GT-class power (~460 hp)', () => {
    const kw = peakPowerKw(STOCK_TORQUE);
    expect(kw).toBeGreaterThan(320);
    expect(kw).toBeLessThan(365);
  });

  it('top speed clears the 220 km/h floor with margin, under 245', () => {
    expect(stock.topSpeedKmh).toBeGreaterThanOrEqual(225);
    expect(stock.topSpeedKmh).toBeLessThan(245);
  });

  it('0-100 in a believable RWD launch band', () => {
    expect(stock.zeroToHundredSec).toBeGreaterThan(4.0);
    expect(stock.zeroToHundredSec).toBeLessThan(5.6);
  });
});

describe('carSpec max-speed build (Dark Horse spec, lightest)', () => {
  it('runs ~260 km/h class', () => {
    expect(maxBuild.topSpeedKmh).toBeGreaterThanOrEqual(255);
    expect(maxBuild.topSpeedKmh).toBeLessThanOrEqual(275);
  });

  it('0-100 at or under the 3.9s class line (with tolerance)', () => {
    expect(maxBuild.zeroToHundredSec).toBeLessThanOrEqual(4.2);
  });

  it('is lighter AND stronger than stock', () => {
    expect(maxBuild.massKg).toBeLessThan(stock.massKg);
    expect(maxBuild.powerToWeightKwPerTonne).toBeGreaterThan(stock.powerToWeightKwPerTonne);
  });
});

describe('weight is the tradeoff axis', () => {
  it('armor + racks + 45 kg of cargo slow the launch measurably', () => {
    expect(heavy.zeroToHundredSec).toBeGreaterThan(stock.zeroToHundredSec + 0.15);
    expect(heavy.massKg).toBeGreaterThan(stock.massKg + 130);
  });

  it('added mass also costs top speed (rolling term), never gains it', () => {
    expect(heavy.topSpeedKmh).toBeLessThan(stock.topSpeedKmh);
  });

  it('torque curve scales are real: tune + blower stack multiplicatively', () => {
    const t = carParams(['engine_tune', 'supercharger']);
    expect(torqueAt(t.torqueCurve, 4600)).toBeCloseTo(562 * 1.09 * 1.38, 0);
  });
});
