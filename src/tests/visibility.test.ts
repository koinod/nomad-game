// Lane 8: §6.3 visibility — exposure factors, the husk perception
// formula, the gh_unseen capstone rule, and the LightIndicator model.
import { describe, expect, it } from 'vitest';
import {
  canHuskSee,
  computeExposure,
  computeVisibility,
  huskSightRange,
  lightIndicator,
} from '../game/visibility';

describe('exposure factors (§6.3)', () => {
  it('full daylight, standing, still = 1', () => {
    expect(computeExposure({ lightLevel: 1 })).toBe(1);
  });

  it('crouch halves it; gh_shadow takes another 30% off', () => {
    expect(computeExposure({ lightLevel: 1, crouched: true })).toBeCloseTo(0.5);
    expect(computeExposure({ lightLevel: 1, crouched: true }, ['gh_shadow'])).toBeCloseTo(0.35);
  });

  it('moving multiplies 1.3 (clamped at 1)', () => {
    expect(computeExposure({ lightLevel: 0.5, moving: true })).toBeCloseTo(0.65);
    expect(computeExposure({ lightLevel: 1, moving: true })).toBe(1);
  });

  it('flashlight doubles exposure', () => {
    expect(computeExposure({ lightLevel: 0.3, flashlightOn: true })).toBeCloseTo(0.6);
  });

  it('night applies the 0.3 ambient floor — darkness alone never zeroes', () => {
    expect(computeExposure({ lightLevel: 0, isNight: true })).toBeCloseTo(0.3);
    expect(computeExposure({ lightLevel: 0, isNight: false })).toBe(0);
    // brighter than the floor wins
    expect(computeExposure({ lightLevel: 0.8, isNight: true })).toBeCloseTo(0.8);
  });

  it('night-stealth perks stack at night only', () => {
    const base = { lightLevel: 0.6, isNight: true };
    expect(computeExposure(base, ['gh_nightowl'])).toBeCloseTo(0.48);
    expect(computeExposure(base, ['gh_nightowl', 'sc_nightharvest'])).toBeCloseTo(0.432);
    expect(computeExposure({ lightLevel: 0.6 }, ['gh_nightowl'])).toBeCloseTo(0.6); // day: inert
  });

  it('smoke is a hard zero', () => {
    expect(computeExposure({ lightLevel: 1, moving: true, flashlightOn: true, inSmoke: true })).toBe(0);
  });

  it('the classic ghost: night + crouched + gh_shadow ≈ 0.105', () => {
    const v = computeVisibility({ lightLevel: 0, isNight: true, crouched: true }, ['gh_shadow', 'gh_nightowl']);
    expect(v.exposure).toBeCloseTo(0.3 * 0.5 * 0.7 * 0.8);
    expect(v.effectiveLight).toBeCloseTo(0.3);
  });
});

describe('husk perception (§6.3)', () => {
  it('sight = base × exposure × (1 − stealth × 0.03)', () => {
    expect(huskSightRange(25, 1, 0)).toBe(25);
    expect(huskSightRange(25, 0.5, 0)).toBeCloseTo(12.5);
    expect(huskSightRange(25, 1, 10)).toBeCloseTo(17.5);
    expect(huskSightRange(25, 0, 5)).toBe(0);
  });

  it('canHuskSee compares distance to the scaled range', () => {
    const vis = computeVisibility({ lightLevel: 0.4 });
    expect(canHuskSee({ baseRange: 25, distance: 9, visibility: vis, stealthLevel: 0 })).toBe(true);
    expect(canHuskSee({ baseRange: 25, distance: 11, visibility: vis, stealthLevel: 0 })).toBe(false);
  });

  it('gh_unseen: crouched + still + shadowed is invisible beyond 3m…', () => {
    const vis = computeVisibility(
      { lightLevel: 0.9, crouched: true, moving: false, inShadow: true },
      ['gh_unseen'],
    );
    expect(vis.unseenPosture).toBe(true);
    expect(canHuskSee({ baseRange: 25, distance: 10, visibility: vis, stealthLevel: 0 })).toBe(false);
    // …but point-blank still finds you (range at exposure .45 ≈ 11m > 2m)
    expect(canHuskSee({ baseRange: 25, distance: 2, visibility: vis, stealthLevel: 0 })).toBe(true);
  });

  it('unseen posture breaks when moving or standing', () => {
    expect(
      computeVisibility({ lightLevel: 0.2, crouched: true, moving: true, inShadow: true }, ['gh_unseen'])
        .unseenPosture,
    ).toBe(false);
    expect(
      computeVisibility({ lightLevel: 0.2, crouched: false, inShadow: true }, ['gh_unseen']).unseenPosture,
    ).toBe(false);
    // no perk, no posture
    expect(
      computeVisibility({ lightLevel: 0.2, crouched: true, inShadow: true }, []).unseenPosture,
    ).toBe(false);
  });
});

describe('LightIndicator model (§6.3)', () => {
  it('bands climb with exposure', () => {
    expect(lightIndicator(0).band).toBe('hidden');
    expect(lightIndicator(0.24).band).toBe('hidden');
    expect(lightIndicator(0.25).band).toBe('dim');
    expect(lightIndicator(0.5).band).toBe('watched');
    expect(lightIndicator(0.75).band).toBe('spotted');
    expect(lightIndicator(1).band).toBe('spotted');
  });

  it('fill mirrors clamped exposure and every band has a label', () => {
    expect(lightIndicator(1.4).fill).toBe(1);
    expect(lightIndicator(-1).fill).toBe(0);
    for (const e of [0, 0.3, 0.6, 0.9]) expect(lightIndicator(e).label.length).toBeGreaterThan(0);
  });
});
