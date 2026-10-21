import { describe, it, expect } from 'vitest';
import * as PostFxModule from '../game/PostFX';
import {
  POSTFX_TIERS,
  classifyDevicePostFx,
  stepQuality,
  PostFxGovernor,
  GOVERNOR,
  gradeFor,
  FOG_TUNING,
  tightenFog,
  shaftIntensity,
} from '../game/PostFX';

// Lane 12: post-processing decisions are pure and pinned — device
// classification, the adaptive governor, grade, fog tuning and shaft
// gating — so the GL shell can stay thin.
//
// CAMERA BLUR REMOVED on Ian's order (2026-10-21: "remove camera
// blur") — the dofFor describe block that used to live here was
// deleted DELIBERATELY with the feature: the BokehPass step, the
// tier dof flags, dofFor/DofParams, and Game's focus feed are all
// gone. The describe below pins the removal so the blur cannot
// quietly grow back.
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
    expect(POSTFX_TIERS.off.grade).toBe(false);
    expect(POSTFX_TIERS.high.renderScale).toBe(1);
    expect(POSTFX_TIERS.low.renderScale).toBeLessThan(1);
  });
});

describe('camera blur removal (Ian order, 2026-10-21)', () => {
  it('no tier carries a DoF flag and the module exports no DoF machinery', () => {
    for (const tier of Object.values(POSTFX_TIERS)) {
      expect('dof' in tier).toBe(false);
    }
    expect('dofFor' in PostFxModule).toBe(false);
    expect('BokehPass' in PostFxModule).toBe(false);
  });

  it('the grade survives untouched: day vivid, night closed-in, storm greyed', () => {
    // (the full grade pins live in the gradeFor describe below — this
    // is the removal's regression sentinel)
    expect(gradeFor(0.8, 0).saturation).toBeGreaterThan(gradeFor(-0.2, 0).saturation);
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
