/**
 * Weather — the island's weather system: a seeded state machine over
 * five states (clear / cloudy / rain / storm / fog) that exposes only
 * CONTINUOUS factors to the rest of the game. Rendering reads cloud /
 * fog / precipitation to draw the sky; car physics reads gripFactor()
 * so wet roads cost real grip through the existing tire math
 * (mu * gripFactor — no special-cased "rain mode" anywhere).
 *
 * Two design rules, same spirit as carSpec:
 *  - No pops. The discrete state flips instantly, but every factor
 *    eases toward its state's target at a finite rate, so rain fades
 *    in over ~a minute instead of switching on.
 *  - Wetness is an integrator, not a state flag. It rises while it
 *    rains and dries over minutes after the rain stops — the road
 *    stays slippery after the sky clears, which is the whole point.
 *
 * Pure TS, no three.js: the coordinator wires snapshot() into World /
 * Game; this module only simulates. Deterministic per seed via
 * mulberry32 (rng.ts) so tests and replays agree.
 */

import { clamp, mulberry32 } from './rng';

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export interface WeatherSnapshot {
  state: WeatherState;
  /** Rain intensity 0..1 (0 in dry states). */
  precipitation: number;
  /** Sky coverage 0..1 — drives cloud rendering / light dimming. */
  cloudCover: number;
  /** Fog density factor 0..1 (snapshot name is `fog` per the API). */
  fog: number;
  /** Wind strength 0..1. */
  windSpeed: number;
  /** Wind direction, radians, normalized to [0, 2π). Drifts slowly. */
  windDirRad: number;
  /** Ground wetness 0..1 — the integrator; see header. */
  wetness: number;
}

/** Continuous factor targets per state. Factors ease toward these. */
export const STATE_TARGETS: Record<
  WeatherState,
  { precipitation: number; cloudCover: number; fogDensity: number; windSpeed: number }
> = {
  clear: { precipitation: 0, cloudCover: 0.15, fogDensity: 0.02, windSpeed: 0.25 },
  cloudy: { precipitation: 0, cloudCover: 0.75, fogDensity: 0.05, windSpeed: 0.4 },
  rain: { precipitation: 0.6, cloudCover: 0.9, fogDensity: 0.1, windSpeed: 0.55 },
  storm: { precipitation: 1, cloudCover: 1, fogDensity: 0.15, windSpeed: 1 },
  fog: { precipitation: 0, cloudCover: 0.5, fogDensity: 1, windSpeed: 0.15 },
};

/** How long a state lasts once entered, seconds of game time [min, max).
 *  Rolled uniformly per entry from the seeded RNG. */
export const STATE_DURATIONS: Record<WeatherState, [number, number]> = {
  clear: [240, 600],
  cloudy: [180, 480],
  rain: [120, 360],
  storm: [60, 240],
  fog: [120, 300],
};

/**
 * Base transition weights: from each state, [next, weight] pairs.
 * The chain runs clear ↔ cloudy ↔ rain ↔ storm (weather builds and
 * dies through the middle — clear never jumps straight to storm),
 * and fog hangs off the two calm states. Fog's weight is NOT final:
 * transitionWeights() scales it by time of day (dawn fog bias).
 */
export const TRANSITION_WEIGHTS: Record<WeatherState, [WeatherState, number][]> = {
  clear: [
    ['cloudy', 6],
    ['clear', 2],
    ['fog', 1],
  ],
  cloudy: [
    ['clear', 4],
    ['rain', 4],
    ['fog', 1.5],
    ['cloudy', 1],
  ],
  rain: [
    ['cloudy', 4],
    ['storm', 3],
    ['rain', 1],
  ],
  storm: [
    ['rain', 5],
    ['cloudy', 2],
  ],
  fog: [
    ['clear', 4],
    ['cloudy', 3],
    ['fog', 1],
  ],
};

/**
 * Fog is a morning phenomenon: radiation fog forms overnight and
 * burns off by midday. Multiplier on fog's transition weight by
 * hour of day — 4× in the 05:00–09:00 window, nearly shut at midday.
 */
export function fogWeightMultiplier(hourOfDay: number): number {
  const h = ((hourOfDay % 24) + 24) % 24;
  if (h >= 5 && h < 9) return 4;
  if (h >= 9 && h < 11) return 1.5;
  if (h >= 11 && h <= 16) return 0.25;
  return 1;
}

/** Transition weights from `from` at `hourOfDay`, fog bias applied. */
export function transitionWeights(
  from: WeatherState,
  hourOfDay: number,
): [WeatherState, number][] {
  const fogMul = fogWeightMultiplier(hourOfDay);
  return TRANSITION_WEIGHTS[from].map(
    ([next, w]) => [next, next === 'fog' ? w * fogMul : w] as [WeatherState, number],
  );
}

/** Wetness integrator rates (per second, at factor = 1). At full
 *  storm precipitation the ground soaks in ~2.5 min; a clear sky
 *  dries it in ~8 min (slower under cloud / fog — see update()). */
export const WET_RATE_PER_SEC = 1 / 150;
export const DRY_RATE_PER_SEC = 1 / 480;

/** Fraction of tire mu lost on a fully soaked road. gripFactor()
 *  runs 1 (dry) → 0.65 (soaked); CarPhysics multiplies tireMu by it. */
export const GRIP_WET_PENALTY = 0.35;

/** Ease time constants (seconds) per factor — how fast each factor
 *  closes on its target. Wind is laziest, precipitation quickest. */
const TAU = { precipitation: 20, cloudCover: 45, fogDensity: 30, windSpeed: 60 };

export interface WeatherOptions {
  /** Seed for the state machine's RNG. Same seed + same update
   *  sequence = same weather, every run. */
  seed?: number;
  /** Starting state (default 'clear'). Factors start AT that state's
   *  targets — a fresh system is already settled, not easing in. */
  initialState?: WeatherState;
  /** Starting ground wetness 0..1 (default 0). */
  initialWetness?: number;
}

export class WeatherSystem {
  private readonly rng: () => number;
  private state: WeatherState;
  private stateTimeLeft: number;
  private precipitation: number;
  private cloudCover: number;
  private fogDensity: number;
  private windSpeed: number;
  private windDirRad: number;
  private windDriftRadPerSec: number;
  private wetness: number;

  constructor(options: WeatherOptions = {}) {
    this.rng = mulberry32(options.seed ?? 1337);
    this.state = options.initialState ?? 'clear';
    const t = STATE_TARGETS[this.state];
    this.precipitation = t.precipitation;
    this.cloudCover = t.cloudCover;
    this.fogDensity = t.fogDensity;
    this.windSpeed = t.windSpeed;
    this.wetness = clamp(options.initialWetness ?? 0, 0, 1);
    this.windDirRad = this.rng() * Math.PI * 2;
    this.windDriftRadPerSec = 0;
    this.stateTimeLeft = this.rollDuration(this.state);
    this.rollWindDrift();
  }

  /**
   * Advance the simulation by dtSeconds of game time. hourOfDay
   * (0..24, fractional ok) is treated as constant across the call —
   * it only steers transition weights (the dawn fog bias), so pass
   * the hour at the start of the step. Large dt is fine: state
   * expiries inside the step are processed in order.
   */
  update(dtSeconds: number, hourOfDay: number): void {
    let remaining = Math.max(0, dtSeconds);
    while (remaining > 0) {
      const chunk = Math.min(remaining, this.stateTimeLeft);
      this.advanceFactors(chunk);
      this.stateTimeLeft -= chunk;
      remaining -= chunk;
      if (this.stateTimeLeft <= 0) {
        this.transition(hourOfDay);
      }
    }
  }

  snapshot(): WeatherSnapshot {
    return {
      state: this.state,
      precipitation: this.precipitation,
      cloudCover: this.cloudCover,
      fog: this.fogDensity,
      windSpeed: this.windSpeed,
      windDirRad: this.windDirRad,
      wetness: this.wetness,
    };
  }

  /** Tire-grip multiplier from ground wetness: 1 dry → 0.65 soaked. */
  gripFactor(): number {
    return 1 - GRIP_WET_PENALTY * this.wetness;
  }

  private advanceFactors(dt: number): void {
    const t = STATE_TARGETS[this.state];
    // Exponential approach: frame-rate independent, asymptotic (never
    // overshoots), and the rate is honest — after one tau the factor
    // has closed ~63% of the gap.
    const ease = (cur: number, target: number, tau: number) =>
      cur + (target - cur) * (1 - Math.exp(-dt / tau));
    this.precipitation = ease(this.precipitation, t.precipitation, TAU.precipitation);
    this.cloudCover = ease(this.cloudCover, t.cloudCover, TAU.cloudCover);
    this.fogDensity = ease(this.fogDensity, t.fogDensity, TAU.fogDensity);
    this.windSpeed = ease(this.windSpeed, t.windSpeed, TAU.windSpeed);

    // Wind direction drifts at a slow rate re-rolled per state.
    const twoPi = Math.PI * 2;
    this.windDirRad = (((this.windDirRad + this.windDriftRadPerSec * dt) % twoPi) + twoPi) % twoPi;

    // Wetness integrator: rain soaks proportionally to precipitation;
    // otherwise the ground dries, slower when the sky stays covered
    // or fog sits on it (no sun, no evaporation).
    if (this.precipitation > 0.05) {
      this.wetness += this.precipitation * WET_RATE_PER_SEC * dt;
    } else {
      const dryFactor = clamp(1 - 0.7 * this.cloudCover - 0.5 * this.fogDensity, 0.15, 1);
      this.wetness -= DRY_RATE_PER_SEC * dryFactor * dt;
    }
    this.wetness = clamp(this.wetness, 0, 1);
  }

  private transition(hourOfDay: number): void {
    const weights = transitionWeights(this.state, hourOfDay);
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let roll = this.rng() * total;
    let next: WeatherState = weights[weights.length - 1][0];
    for (const [candidate, w] of weights) {
      roll -= w;
      if (roll <= 0) {
        next = candidate;
        break;
      }
    }
    this.state = next;
    this.stateTimeLeft = this.rollDuration(next);
    this.rollWindDrift();
  }

  private rollDuration(state: WeatherState): number {
    const [min, max] = STATE_DURATIONS[state];
    return min + this.rng() * (max - min);
  }

  private rollWindDrift(): void {
    // ±~1.1°/s at most: a full swing of direction takes minutes.
    this.windDriftRadPerSec = (this.rng() - 0.5) * 0.04;
  }
}
