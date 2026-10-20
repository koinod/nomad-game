// huskMath.ts — pure math for the WAVE 4 special husks: spawn weighting,
// the screamer's shriek, bloater bursts, acid pools, spitter ballistics,
// brute charges, crawler swerve. No THREE, no store — unit-tested
// (tests/huskMath.test.ts).

// ------------------------------------------------------------- spawning ---

/** Special kinds that can bleed into ambient spawns (zone seeding lists
 *  its own kinds explicitly; this pool is for the day-scaled trickle). */
export const AMBIENT_SPECIALS = ['crawler', 'screamer', 'spitter', 'bloater', 'brute'] as const;

/**
 * Chance that an ambient shambler spawn is replaced by a special.
 * Day 0 the island is mostly shamblers; by day 20 nearly a quarter of
 * the background population is something worse. Capped — specials stay
 * special.
 */
export function specialChance(daysElapsed: number): number {
  const d = Math.max(0, daysElapsed);
  return Math.min(0.22, 0.04 + d * 0.011);
}

/** Weighted pick from the ambient special pool. Brutes are the rarest —
 *  a wandering brute should feel like an event, not a commute. */
export function pickAmbientSpecial(rng: () => number): string {
  const roll = rng();
  if (roll < 0.30) return 'crawler';
  if (roll < 0.55) return 'screamer';
  if (roll < 0.78) return 'spitter';
  if (roll < 0.93) return 'bloater';
  return 'brute';
}

// ------------------------------------------------------------- screamer ---

/** Seconds of wind-up before the shriek lands — the window the player
 *  has to interrupt it (heavy hit, headshot, melee stagger). */
export const SHRIEK_WINDUP_SEC = 1.6;

/** Stagger power at or above this breaks a shriek wind-up (matches the
 *  wave-2 windup-break threshold in Husk.damage). */
export const SHRIEK_INTERRUPT_STAGGER = 0.6;

/** The shriek carries: every husk inside this radius investigates the
 *  screamer's target, and the player's noise meter pegs if they're close. */
export function shriekAlertRadius(isNight: boolean): number {
  return isNight ? 48 : 40;
}

/** How far the shriek's noise spike reads on the player's meter. */
export function shriekNoiseLevel(distToPlayer: number): number {
  if (distToPlayer <= 12) return 100;
  if (distToPlayer >= 45) return 0;
  return Math.round(100 * (1 - (distToPlayer - 12) / 33));
}

// ------------------------------------------------------------- bloater ----

/** The burst when a bloater dies: a real explosion for anything close. */
export const BLOATER_BURST = { radius: 3.4, playerDmg: 34, huskDmg: 55 } as const;

/** Damage at a distance from a burst center — full at the core, zero at the rim. */
export function burstDamageAt(base: number, dist: number, radius: number): number {
  if (dist >= radius) return 0;
  return Math.round(base * (1 - (dist / radius) * 0.75));
}

/** Acid pools: left by bloater bursts (big) and spitter globs (small). */
export const ACID_POOL = {
  burstRadius: 2.3,
  spitRadius: 1.6,
  lifeSec: 7,
  playerDps: 7,
  huskDps: 11,
} as const;

// -------------------------------------------------------------- spitter ---

/** Gravity the spit arc flies under (a heavy glob, not a laser). */
export const SPIT_GRAVITY = 12;
/** Preferred time-of-flight band for a spit lob, seconds. */
export const SPIT_FLIGHT = { min: 0.55, max: 1.25 } as const;
/** Direct-hit damage when the glob catches the player mid-flight. */
export const SPIT_HIT_DMG = 14;
/** The range band the spitter tries to hold: too far it closes, too close it backs off. */
export const SPIT_BAND = { near: 8, far: 16 } as const;

/**
 * Launch velocity for a lobbed glob from `from` to `to` in `flightTime`
 * seconds under SPIT_GRAVITY. Returns null for a degenerate shot.
 */
export function spitVelocity(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  flightTime: number,
): { vx: number; vy: number; vz: number } | null {
  if (flightTime <= 0.05) return null;
  const vx = (to.x - from.x) / flightTime;
  const vz = (to.z - from.z) / flightTime;
  const vy = (to.y - from.y) / flightTime + 0.5 * SPIT_GRAVITY * flightTime;
  return { vx, vy, vz };
}

/** Flight time for a spit at a given distance: ~distance/16s, clamped. */
export function spitFlightTime(dist: number): number {
  return Math.min(SPIT_FLIGHT.max, Math.max(SPIT_FLIGHT.min, dist / 16));
}

// ---------------------------------------------------------------- brute ---

/** A brute charges when the player is in this window and its cooldown is up. */
export const BRUTE_CHARGE = { minDist: 5.5, maxDist: 15, sec: 0.95, speedMult: 3.1, cdSec: 5 } as const;

export function shouldBruteCharge(dist: number, cdReady: boolean, charging: boolean): boolean {
  return cdReady && !charging && dist >= BRUTE_CHARGE.minDist && dist <= BRUTE_CHARGE.maxDist;
}

/** Explosives are the brute's counter: area damage lands half again as hard. */
export const BRUTE_EXPLOSION_MULT = 1.6;

// -------------------------------------------------------------- crawler ---

/**
 * The crawler's erratic hunt: a lateral swerve that oscillates fast
 * enough to spoil a long-range shot but averages to zero, so it still
 * arrives. Returns a -1..1 factor; the caller scales by speed.
 */
export function crawlerSwerve(t: number, phase: number): number {
  return Math.sin(t * 5.1 + phase) * 0.7 + Math.sin(t * 9.7 + phase * 2.3) * 0.3;
}
