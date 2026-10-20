// moveMath.ts — pure on-foot locomotion helpers for the CRAFT WAVE
// movement pass. Frame-rate-independent smoothing (exp damp instead of
// dt-linear lerps), distinct accel/decel/reversal rates, the sprint
// FOV kick, and wade drag. Unit-tested in src/tests/moveMath.test.ts.

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Smoothing factor for a damp rate over dt — same feel at any fps. */
export function expDamp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * Math.max(dt, 0));
}

/**
 * Velocity-chase rate for the on-foot controller: launching is eager,
 * stopping is firmer than launching, reversing direction is firmest
 * (that's what makes strafing feel responsive instead of skating).
 * Air control stays drifty on purpose.
 */
export function accelRate(grounded: boolean, hasInput: boolean, opposing: boolean): number {
  if (!grounded) return 3.2;
  if (!hasInput) return 13;
  return opposing ? 16 : 10.5;
}

/** Extra FOV (degrees) at full sprint — the speed kick. */
export function sprintFovKick(speedNorm: number): number {
  return 6 * clamp(speedNorm, 0, 1);
}

/**
 * Wade drag: the island's shallows are ground below y=0. Knee-deep
 * costs a little speed, waist-deep costs a lot and kills sprinting
 * and jumping (you're pushing water, not running).
 */
export function wadeFactor(groundY: number): number {
  const depth = -groundY;
  if (depth <= 0.1) return 1;
  return clamp(1 - (depth - 0.1) * 0.75, 0.35, 1);
}

export function wadeBlocksSprint(groundY: number): boolean {
  return -groundY > 0.45;
}

export function wadeBlocksJump(groundY: number): boolean {
  return -groundY > 0.3;
}
