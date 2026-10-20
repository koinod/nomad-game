// CRAFT WAVE movement pass — pure locomotion helpers.
import { describe, expect, it } from 'vitest';
import {
  accelRate, expDamp, sprintFovKick, wadeBlocksJump, wadeBlocksSprint, wadeFactor,
} from '../game/moveMath';

describe('expDamp', () => {
  it('is frame-rate independent: two half-steps equal one full step', () => {
    const one = expDamp(10, 1 / 30);
    const half = expDamp(10, 1 / 60);
    const composed = 1 - (1 - half) * (1 - half);
    expect(composed).toBeCloseTo(one, 6);
  });
  it('never overshoots', () => {
    expect(expDamp(10, 5)).toBeLessThanOrEqual(1);
    expect(expDamp(10, 0)).toBe(0);
  });
});

describe('accelRate', () => {
  it('reversal > launch, decel firmer than launch, air is drifty', () => {
    expect(accelRate(true, true, true)).toBeGreaterThan(accelRate(true, true, false));
    expect(accelRate(true, false, false)).toBeGreaterThan(accelRate(true, true, false));
    expect(accelRate(false, true, false)).toBeLessThan(accelRate(true, true, false));
  });
});

describe('sprintFovKick', () => {
  it('ramps 0 -> 6 degrees with speed', () => {
    expect(sprintFovKick(0)).toBe(0);
    expect(sprintFovKick(1)).toBe(6);
    expect(sprintFovKick(2)).toBe(6);
  });
});

describe('wading', () => {
  it('dry land and ankle water are free', () => {
    expect(wadeFactor(0.5)).toBe(1);
    expect(wadeFactor(-0.05)).toBe(1);
  });
  it('waist-deep costs most of your speed and blocks sprint + jump', () => {
    expect(wadeFactor(-0.9)).toBeCloseTo(0.4, 5);
    expect(wadeBlocksSprint(-0.5)).toBe(true);
    expect(wadeBlocksSprint(-0.3)).toBe(false);
    expect(wadeBlocksJump(-0.4)).toBe(true);
    expect(wadeBlocksJump(-0.2)).toBe(false);
  });
  it('never fully stops you', () => {
    expect(wadeFactor(-3)).toBe(0.35);
  });
});
