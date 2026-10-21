import { describe, expect, it } from 'vitest';
import {
  WeatherSystem,
  fogWeightMultiplier,
  transitionWeights,
  type WeatherState,
} from '../game/Weather';

/**
 * Weather system: seeded state machine, continuous factors, and the
 * wetness integrator that feeds gripFactor() into car physics.
 * All runs are seeded (mulberry32) so nothing here is flaky.
 */

/** Step a system in fixed increments, calling fn after each step. */
function run(
  w: WeatherSystem,
  totalSec: number,
  dt: number,
  hour: number | ((elapsed: number) => number),
  fn?: (elapsed: number) => void,
): void {
  const hourAt = typeof hour === 'function' ? hour : () => hour;
  for (let t = 0; t < totalSec; t += dt) {
    w.update(dt, hourAt(t));
    fn?.(t + dt);
  }
}

describe('state machine', () => {
  it('transitions occur over time and visit multiple states', () => {
    const w = new WeatherSystem({ seed: 42 });
    const visited = new Set<WeatherState>();
    let changes = 0;
    let prev = w.snapshot().state;
    run(w, 6 * 3600, 10, 12, () => {
      const s = w.snapshot().state;
      visited.add(s);
      if (s !== prev) changes++;
      prev = s;
    });
    // Max state duration is 600 s, so 6 h guarantees many expiries;
    // the weighted table (self-weights are the minority everywhere)
    // makes several real changes a certainty for this seed.
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(visited.size).toBeGreaterThanOrEqual(2);
  });

  it('never jumps clear -> storm/rain directly (chain goes through the middle)', () => {
    for (const from of ['clear', 'storm', 'fog'] as WeatherState[]) {
      const nexts = transitionWeights(from, 12).map(([s]) => s);
      if (from === 'clear') {
        expect(nexts).not.toContain('rain');
        expect(nexts).not.toContain('storm');
      }
      if (from === 'storm') {
        expect(nexts).not.toContain('clear');
        expect(nexts).not.toContain('fog');
      }
    }
  });

  it('is deterministic: same seed + same updates = same weather', () => {
    const a = new WeatherSystem({ seed: 7 });
    const b = new WeatherSystem({ seed: 7 });
    run(a, 7200, 30, (t) => (t / 240) % 24);
    run(b, 7200, 30, (t) => (t / 240) % 24);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe('continuous factors', () => {
  it('stay in [0,1] (and wind dir in [0, 2π)) over a long varied run', () => {
    const w = new WeatherSystem({ seed: 99 });
    run(w, 24 * 3600, 30, (t) => (t / 300) % 24, () => {
      const s = w.snapshot();
      for (const v of [s.precipitation, s.cloudCover, s.fog, s.windSpeed, s.wetness]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(s.windDirRad).toBeGreaterThanOrEqual(0);
      expect(s.windDirRad).toBeLessThan(Math.PI * 2);
    });
  });

  it('ease, never pop: per-second factor change stays small even across transitions', () => {
    const w = new WeatherSystem({ seed: 5 });
    let prev = w.snapshot();
    run(w, 3 * 3600, 1, 10, () => {
      const s = w.snapshot();
      expect(Math.abs(s.precipitation - prev.precipitation)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(s.cloudCover - prev.cloudCover)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(s.fog - prev.fog)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(s.wetness - prev.wetness)).toBeLessThanOrEqual(0.06);
      prev = s;
    });
  });
});

describe('wetness integrator', () => {
  it('rises while it rains', () => {
    const w = new WeatherSystem({ seed: 1, initialState: 'rain' });
    expect(w.snapshot().wetness).toBe(0);
    w.update(60, 12); // rain lasts >= 120 s, so this is all in-state
    expect(w.snapshot().wetness).toBeGreaterThan(0.15);
  });

  it('rises faster in a storm than in rain', () => {
    const rain = new WeatherSystem({ seed: 1, initialState: 'rain' });
    const storm = new WeatherSystem({ seed: 1, initialState: 'storm' });
    rain.update(60, 12);
    storm.update(60, 12);
    expect(storm.snapshot().wetness).toBeGreaterThan(rain.snapshot().wetness);
  });

  it('dries out under a clear sky after the rain stops', () => {
    const w = new WeatherSystem({ seed: 1, initialState: 'clear', initialWetness: 1 });
    w.update(120, 12); // clear lasts >= 240 s, still in-state
    const wet = w.snapshot().wetness;
    expect(wet).toBeLessThan(0.85);
    expect(wet).toBeGreaterThan(0.4); // drying takes minutes, not seconds
  });

  it('saturates at 1 under sustained storm and bottoms out at 0', () => {
    const soaked = new WeatherSystem({ seed: 3, initialState: 'storm' });
    soaked.update(230, 12); // storm lasts <= 240 s; ~soaked either way
    expect(soaked.snapshot().wetness).toBeGreaterThan(0.9);
    const dry = new WeatherSystem({ seed: 3, initialState: 'clear', initialWetness: 0.2 });
    run(dry, 3600, 30, 12);
    expect(dry.snapshot().wetness).toBeGreaterThanOrEqual(0);
  });
});

describe('gripFactor', () => {
  it('is 1 on a dry road and 0.65 fully soaked', () => {
    expect(new WeatherSystem({ seed: 1 }).gripFactor()).toBeCloseTo(1, 10);
    expect(new WeatherSystem({ seed: 1, initialWetness: 1 }).gripFactor()).toBeCloseTo(0.65, 10);
  });

  it('stays within [0.65, 1] over a long run', () => {
    const w = new WeatherSystem({ seed: 1234 });
    run(w, 12 * 3600, 30, (t) => (t / 300) % 24, () => {
      expect(w.gripFactor()).toBeGreaterThanOrEqual(0.65);
      expect(w.gripFactor()).toBeLessThanOrEqual(1);
    });
  });

  it('drops as rain soaks the ground and recovers as it dries', () => {
    const w = new WeatherSystem({ seed: 1, initialState: 'rain' });
    w.update(120, 12); // rain lasts >= 120 s
    expect(w.gripFactor()).toBeLessThan(0.9);
  });
});

describe('dawn fog bias', () => {
  it('fog weight is boosted at dawn and suppressed at midday (direct weights)', () => {
    const fogAt = (hour: number) =>
      transitionWeights('cloudy', hour).find(([s]) => s === 'fog')?.[1] ?? 0;
    expect(fogWeightMultiplier(6.5)).toBeGreaterThan(fogWeightMultiplier(13));
    expect(fogAt(6.5)).toBeGreaterThan(fogAt(13) * 4);
  });

  it('fog actually follows cloudy far more often at dawn than midday (seeded stats)', () => {
    // From 'cloudy', run until the first transition and record where
    // it landed. Deterministic per seed; 200 seeds each is more than
    // enough to separate a ~40% dawn rate from a ~4% midday rate.
    const firstExit = (seed: number, hour: number): WeatherState => {
      const w = new WeatherSystem({ seed, initialState: 'cloudy' });
      for (let t = 0; t < 6000; t += 10) {
        w.update(10, hour);
        const s = w.snapshot().state;
        if (s !== 'cloudy') return s;
      }
      throw new Error('never left cloudy');
    };
    const fractionFog = (hour: number) => {
      let fogs = 0;
      for (let seed = 0; seed < 200; seed++) {
        if (firstExit(seed, hour) === 'fog') fogs++;
      }
      return fogs / 200;
    };
    const dawn = fractionFog(6.5);
    const midday = fractionFog(13);
    expect(dawn).toBeGreaterThan(0.2);
    expect(midday).toBeLessThan(0.15);
    expect(dawn).toBeGreaterThan(midday + 0.15);
  });
});
