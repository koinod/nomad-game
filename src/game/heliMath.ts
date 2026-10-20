// Pure helicopter flight helpers — the arcade flight model's math, kept
// side-effect free so it is unit-testable without a renderer.

/** Rotor lift authority: lift spools with the SQUARE of rotor speed, so
 *  a half-spun rotor gives only a quarter of the lift — you cannot cheat
 *  a takeoff on a cold rotor. */
export function liftAuthority(rotor01: number): number {
  const r = Math.max(0, Math.min(1, rotor01));
  return r * r;
}

/** Move `cur` toward `target` by at most `maxDelta` (frame-rate safe
 *  approach used for velocities and spool). */
export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(target, cur + maxDelta);
  if (cur > target) return Math.max(target, cur - maxDelta);
  return cur;
}

export type LandingGrade = 'soft' | 'firm' | 'hard' | 'crash';

/** Grade a touchdown by vertical speed (m/s, negative = descending) and
 *  return the condition damage fraction it costs. A crash can write the
 *  airframe off (condition floored by the caller). */
export function landingSeverity(vy: number): { grade: LandingGrade; damage: number } {
  const d = -vy;
  if (d <= 2.2) return { grade: 'soft', damage: 0 };
  if (d <= 4.2) return { grade: 'firm', damage: 0.02 };
  if (d <= 7.5) return { grade: 'hard', damage: 0.16 };
  if (d <= 11) return { grade: 'crash', damage: 0.45 };
  return { grade: 'crash', damage: 0.85 };
}

/** Visual bank/pitch for a velocity: the airframe leans INTO motion.
 *  vf = forward speed, vs = leftward speed (m/s). Returns radians for
 *  rotation.x (pitch, + = nose down) and rotation.z (roll, + = left
 *  side up), capped so the tilt reads aggressive but never absurd. */
export function tiltForVelocity(vf: number, vs: number): { pitch: number; roll: number } {
  const cap = (x: number, c: number) => Math.max(-c, Math.min(c, x));
  const z = (n: number) => (n === 0 ? 0 : n); // normalize -0
  return {
    pitch: z(cap(vf * 0.011, 0.36)),
    roll: z(cap(-vs * 0.011, 0.32)),
  };
}

/** Hover stability: with no cyclic input the drift bleeds off — the
 *  factor to multiply horizontal velocity by per second of hover. */
export function hoverDamping(dt: number): number {
  return Math.max(0, 1 - 1.6 * dt);
}

// ------------------------------------------------------- heli upgrades ---
// Wave 4: the upgrade line the ground fleet always had, for the airframes.
// Installed ids arrive from data/upgrades (kinds: ['heli']).

/** Seconds for the rotor to spool 0→1. The aviation engine tune spins up
 *  a third faster — cold-and-dark getaways stop being a death sentence. */
export function spoolSeconds(owned: readonly string[]): number {
  return owned.includes('heli_engine') ? 1.5 : 2.2;
}

/** Vertical authority (m/s) the collective can command, up and down. */
export function climbRates(owned: readonly string[]): { up: number; down: number } {
  return owned.includes('heli_engine') ? { up: 6.9, down: 5.2 } : { up: 5.4, down: 4.4 };
}

/** Top-speed factor from the aviation engine tune. */
export function heliTopSpeedFactor(owned: readonly string[]): number {
  return owned.includes('heli_engine') ? 1.12 : 1;
}

/**
 * How much of an impact the airframe actually feels. Rotor & airframe
 * armor spreads landing and collision damage across the plate — a hard
 * touchdown in a plated Hawk is a firm one in a stock one.
 */
export function heliImpactDamageMult(owned: readonly string[]): number {
  return owned.includes('heli_armor') ? 0.45 : 1;
}
