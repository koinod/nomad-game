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

// ---- Item 1 (camera spaz / running feel, 2026-10-21 playtest) ----

/**
 * Sprint stamina hysteresis. The old gate was `stamina > 1` with drain
 * 9/s and moving regen 4.5/s: near empty, sprint re-engaged the frame
 * after it cut out, so the speed target (and the sprint FOV kick)
 * oscillated 5.6 <-> 10.4 — a visible camera pulse while running.
 * The latch engages when stamina bottoms out (<= 1) and only releases
 * once a real reserve is back (>= 25): sprint state can no longer
 * toggle faster than whole seconds of drain/regen.
 */
export const SPRINT_EMPTY = 1;
export const SPRINT_RECOVER = 25;
export function sprintLatch(exhausted: boolean, stamina: number): boolean {
  if (exhausted) return stamina < SPRINT_RECOVER;
  return stamina <= SPRINT_EMPTY;
}

/**
 * Grounded contact: while grounded, terrain within a step DOWN keeps
 * contact and the caller snaps to it. The old rule broke contact on
 * any drop > 0.02 m, so running downhill was a sawtooth of
 * airborne -> fall -> land (each landing dipping the camera and
 * clacking a step) — the running "spaz". A drop past the allowance
 * is a real ledge: return null and the caller starts a fall.
 */
export const GROUND_STEP_DOWN = 0.45;
export function groundContactY(posY: number, groundY: number): number | null {
  return posY - groundY <= GROUND_STEP_DOWN ? groundY : null;
}

/**
 * Head-bob / gait phase from DISTANCE traveled, never from time or
 * raw velocity: one full cycle is two footsteps, and footsteps fire
 * every 2.4 m (the controller's step distance), so the cycle is
 * 4.8 m. Phase keyed to gait rates (9/13 rad/s) slid against the
 * actual speed whenever velocity ramped, waded or was encumbered.
 */
export const BOB_CYCLE_M = 4.8;
export function bobPhaseDelta(distanceM: number): number {
  return (distanceM * Math.PI * 2) / BOB_CYCLE_M;
}
