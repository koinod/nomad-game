// CRAFT WAVE movement pass — pure locomotion helpers.
import { describe, expect, it } from 'vitest';
import {
  accelRate, bobPhaseDelta, expDamp, groundContactY, sprintFovKick, sprintLatch,
  wadeBlocksJump, wadeBlocksSprint, wadeFactor,
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

// Item 1 (2026-10-21 playtest: "camera spazzes while running") —
// the three root causes, pinned at the math level: sprint stamina
// flicker, the downhill ground-contact sawtooth, and time-keyed bob.
describe('sprintLatch (Item 1)', () => {
  it('engages only at empty and holds until a real reserve is back', () => {
    expect(sprintLatch(false, 100)).toBe(false);
    expect(sprintLatch(false, 2)).toBe(false);
    expect(sprintLatch(false, 1)).toBe(true); // bottomed out
    expect(sprintLatch(false, 0)).toBe(true);
    expect(sprintLatch(true, 10)).toBe(true); // still latched mid-regen
    expect(sprintLatch(true, 24.9)).toBe(true);
    expect(sprintLatch(true, 25)).toBe(false); // reserve restored
    expect(sprintLatch(true, 100)).toBe(false);
  });
  it('cannot oscillate: between 1 and 25 the state is sticky both ways', () => {
    for (const s of [2, 5, 12, 20, 24]) {
      expect(sprintLatch(false, s)).toBe(false);
      expect(sprintLatch(true, s)).toBe(true);
    }
  });
});

describe('groundContactY (Item 1)', () => {
  it('snaps to terrain for rises and step-scale drops (downhill stays grounded)', () => {
    expect(groundContactY(1, 1.2)).toBe(1.2); // terrain rose underfoot
    expect(groundContactY(1, 1)).toBe(1); // flat
    expect(groundContactY(1, 0.98)).toBe(0.98); // the old 0.02 break-contact case
    expect(groundContactY(1, 0.6)).toBe(0.6); // 0.4 m step down: still contact
  });
  it('releases only past the step allowance (a real ledge)', () => {
    expect(groundContactY(1, 0.55)).toBe(0.55); // exactly at the allowance
    expect(groundContactY(1, 0.5)).toBeNull(); // 0.5 m drop: airborne
    expect(groundContactY(3, 0)).toBeNull(); // cliff edge
  });
});

describe('bobPhaseDelta (Item 1)', () => {
  it('one full cycle per two footsteps (2 x 2.4 m)', () => {
    expect(bobPhaseDelta(2.4)).toBeCloseTo(Math.PI, 10); // one step = half cycle
    expect(bobPhaseDelta(4.8)).toBeCloseTo(Math.PI * 2, 10);
  });
  it('is distance-proportional: no distance, no phase (no velocity-noise bob)', () => {
    expect(bobPhaseDelta(0)).toBe(0);
    expect(bobPhaseDelta(1.2)).toBeCloseTo(bobPhaseDelta(0.6) * 2, 10);
    // split steps compose: phase over 1 m in two halves equals the whole
    expect(bobPhaseDelta(0.5) + bobPhaseDelta(0.5)).toBeCloseTo(bobPhaseDelta(1), 10);
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
