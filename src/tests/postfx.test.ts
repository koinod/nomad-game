import { describe, it, expect } from 'vitest';
import {
  POSTFX_TIERS,
  classifyDevicePostFx,
  stepQuality,
  PostFxGovernor,
  GOVERNOR,
  dofFor,
  gradeFor,
  FOG_TUNING,
  tightenFog,
  shaftIntensity,
} from '../game/PostFX';

// Lane 12: post-processing decisions are pure and pinned — device
// classification, the adaptive governor, DoF params, grade, fog
// tuning and shaft gating — so the GL shell can stay thin.
describe('classifyDevicePostFx', () => {
  it('strong desktops start high, weak ones do not', () => {
    expect(classifyDevicePostFx({ isTouch: false, cores: 16, deviceMemoryGb: 16 })).toBe('high');
    expect(classifyDevicePostFx({ isTouch: false, cores: 8, deviceMemoryGb: 8 })).toBe('high');
    expect(classifyDevicePostFx({ isTouch: false, cores: 4, deviceMemoryGb: 8 })).toBe('medium');
    expect(classifyDevicePostFx({ isTouch: false, cores: 2, deviceMemoryGb: 8 })).toBe('low');
  });

  it('mobile starts conservative: medium at best, low when weak', () => {
    expect(classifyDevicePostFx({ isTouch: true, cores: 8, deviceMemoryGb: 8 })).toBe('medium');
    expect(classifyDevicePostFx({ isTouch: true, cores: 8, deviceMemoryGb: null })).toBe('medium');
    expect(classifyDevicePostFx({ isTouch: true, cores: 4, deviceMemoryGb: 4 })).toBe('low');
    expect(classifyDevicePostFx({ isTouch: true, cores: 8, deviceMemoryGb: 2 })).toBe('low');
  });

  it('unknown signals still produce a sane start', () => {
    expect(classifyDevicePostFx({ isTouch: false, cores: 0, deviceMemoryGb: null })).toBe('low');
  });
});

describe('stepQuality + tiers', () => {
  it('walks the full ladder and clamps at both ends', () => {
    expect(stepQuality('high', -1)).toBe('medium');
    expect(stepQuality('medium', -1)).toBe('low');
    expect(stepQuality('low', -1)).toBe('off');
    expect(stepQuality('off', -1)).toBe('off');
    expect(stepQuality('low', 1)).toBe('medium');
    expect(stepQuality('high', 1)).toBe('high');
  });

  it('the grade is the last effect surrendered; off carries none', () => {
    expect(POSTFX_TIERS.low.grade).toBe(true);
    expect(POSTFX_TIERS.low.dof).toBe(false);
    expect(POSTFX_TIERS.off.grade).toBe(false);
    expect(POSTFX_TIERS.high.renderScale).toBe(1);
    expect(POSTFX_TIERS.low.renderScale).toBeLessThan(1);
  });
});

describe('PostFxGovernor', () => {
  const feed = (g: PostFxGovernor, ms: number, frames: number) => {
    for (let i = 0; i < frames; i++) g.sample(ms, 3.6);
  };

  it('steps down under sustained long frames', () => {
    const g = new PostFxGovernor('high');
    feed(g, 40, GOVERNOR.evalFrames);
    expect(g.quality).toBe('medium');
  });

  it('never steps above the device cap', () => {
    const g = new PostFxGovernor('low');
    feed(g, 5, GOVERNOR.evalFrames * (GOVERNOR.upStreakNeeded + 2));
    expect(g.quality).toBe('low');
  });

  it('steps back up only after a sustained streak of cheap frames', () => {
    const g = new PostFxGovernor('high');
    feed(g, 40, GOVERNOR.evalFrames); // → medium
    expect(g.quality).toBe('medium');
    // cooldown (3.5s) is consumed by the feed's dt; then cheap frames
    feed(g, 8, GOVERNOR.evalFrames * GOVERNOR.upStreakNeeded);
    expect(g.quality).toBe('high');
  });

  it('hovers: mid-range frames change nothing', () => {
    const g = new PostFxGovernor('medium');
    feed(g, 16.7, GOVERNOR.evalFrames * 4);
    expect(g.quality).toBe('medium');
  });

  it('bottom fallback is off (plain rendering), never below', () => {
    const g = new PostFxGovernor('low');
    feed(g, 90, GOVERNOR.evalFrames);
    expect(g.quality).toBe('off');
    feed(g, 90, GOVERNOR.evalFrames * 2);
    expect(g.quality).toBe('off');
  });
});

describe('dofFor', () => {
  it('null when the tier has no DoF or focus is unknown (first person)', () => {
    expect(dofFor(6, 'low')).toBeNull();
    expect(dofFor(6, 'off')).toBeNull();
    expect(dofFor(null, 'high')).toBeNull();
  });

  it('focus clamps to sane distances; player distance stays sharp', () => {
    const near = dofFor(1, 'high');
    expect(near?.focus).toBe(2);
    const far = dofFor(5000, 'high');
    expect(far?.focus).toBe(600);
    const tp = dofFor(6, 'high');
    expect(tp?.focus).toBe(6);
    // a background 100m behind focus reaches at least the maxblur cap
    expect((100 - 6) * (tp?.aperture ?? 0)).toBeGreaterThanOrEqual(tp?.maxblur ?? 0);
    expect(tp?.maxblur).toBeLessThanOrEqual(0.01);
  });

  it('medium is gentler than high', () => {
    expect(dofFor(8, 'medium')?.aperture).toBeLessThan(dofFor(8, 'high')?.aperture ?? 1);
    expect(dofFor(8, 'medium')?.maxblur).toBeLessThan(dofFor(8, 'high')?.maxblur ?? 1);
  });
});

describe('gradeFor', () => {
  it('day is vivid and open; night closes in', () => {
    const day = gradeFor(0.8, 0);
    const night = gradeFor(-0.2, 0);
    expect(day.saturation).toBeGreaterThan(night.saturation);
    expect(night.vignette).toBeGreaterThan(day.vignette);
  });

  it('precipitation greys and moodens', () => {
    const fair = gradeFor(0.8, 0);
    const storm = gradeFor(0.8, 1);
    expect(storm.saturation).toBeLessThan(fair.saturation);
    expect(storm.vignette).toBeGreaterThan(fair.vignette);
  });
});

describe('tightenFog', () => {
  it('clear weather tightens to the tuned range', () => {
    const f = tightenFog(120, 900, 0);
    expect(f.fogNear).toBe(FOG_TUNING.clearNear);
    expect(f.fogFar).toBe(FOG_TUNING.clearFar);
  });

  it('dense fog keeps World’s collapse — tightening never loosens', () => {
    const f = tightenFog(6, 55, 1);
    expect(f.fogNear).toBe(6);
    expect(f.fogFar).toBe(55);
  });

  it('mid fog blends toward the tuned range, never past the input', () => {
    const f = tightenFog(120, 900, 0.5);
    expect(f.fogFar).toBeCloseTo(760, 5);
    expect(f.fogNear).toBeCloseTo(107.5, 5);
    // when World is already tighter than the blend, World wins
    const tighter = tightenFog(60, 400, 0.5);
    expect(tighter.fogFar).toBe(400);
    expect(tighter.fogNear).toBe(60);
    expect(tightenFog(120, 900, 9).fogFar).toBe(900);
  });
});

describe('shaftIntensity', () => {
  it('peaks at low sun under a clear sky', () => {
    expect(shaftIntensity(0.12, 0.1, 0)).toBeGreaterThan(0.8);
  });

  it('zero at night, at midday, and under storm', () => {
    expect(shaftIntensity(-0.1, 0.1, 0)).toBe(0);
    expect(shaftIntensity(0.8, 0.1, 0)).toBe(0);
    expect(shaftIntensity(0.12, 0.95, 0.8)).toBeLessThan(0.05);
    expect(shaftIntensity(0.12, 0.2, 1)).toBe(0);
  });
});
