// gunMath.ts — pure weapon-handling math: recoil, bloom, sway, jam,
// condition wear, damage falloff, and the armor-penetration model.
// No THREE, no store — everything here is unit-tested (tests/gunMath.test.ts).

// ---------------------------------------------------------------- recoil ---

/** Fraction of a shot's kick the shooter's arms eventually pull back down. */
export const RECOIL_RECOVERABLE = 0.65;

/**
 * Per-shot camera kick for a weapon. ADS and a crouch brace the gun;
 * a foregrip's recoilMult arrives via `modMult`.
 */
export function kickFor(
  recoil: number,
  drift: number,
  adsBlend: number, // 0 hip .. 1 full sights
  crouching: boolean,
  modMult: number,
  rng: () => number,
): { pitch: number; yaw: number } {
  const brace = (1 - adsBlend * 0.3) * (crouching ? 0.85 : 1) * modMult;
  return {
    pitch: recoil * brace,
    yaw: (rng() * 2 - 1) * drift * brace,
  };
}

/**
 * One frame of recoil recovery: how much of the outstanding debt to repay.
 * Exponential approach — most of the kick settles fast, the tail lingers.
 */
export function recoveryStep(debt: number, dt: number, rate = 5.5): number {
  if (debt === 0 || dt <= 0) return 0;
  const amt = debt * (1 - Math.exp(-rate * dt));
  return Math.abs(amt) > Math.abs(debt) ? debt : amt;
}

// ----------------------------------------------------------------- bloom ---

/** Bloom added by one shot, clamped to the 0..1 scale. */
export function bloomAdd(bloom: number, perShot: number): number {
  return Math.min(1, Math.max(0, bloom) + Math.max(0, perShot));
}

/** Bloom bleeds off between shots (~1.5s from full to calm). */
export function bloomDecay(bloom: number, dt: number, rate = 2.4): number {
  return Math.max(0, bloom * Math.exp(-rate * Math.max(0, dt)));
}

/** Extra spread (radians) the current bloom buys you. */
export function bloomSpread(bloom: number, bloomMax: number): number {
  return Math.min(1, Math.max(0, bloom)) * Math.max(0, bloomMax);
}

/** Extra spread from firing on the move — worst from the hip. */
export function moveSpread(speedNorm: number, aimLevel: number): number {
  const s = Math.min(1, Math.max(0, speedNorm));
  const stance = aimLevel === 2 ? 0.004 : aimLevel === 1 ? 0.012 : 0.03;
  return s * stance;
}

// ------------------------------------------------------------------ sway ---

/**
 * ADS sway: a slow Lissajous drift of the aim point. Amplitude comes from
 * the weapon's sway class, scaled by stamina (a winded shooter wanders)
 * and stance (crouch braces, shoulder aim halves the sights figure).
 * Returns radians to add on the right/up axes.
 */
export function swayOffset(
  t: number,
  swayClass: number,
  stamina: number, // 0..100
  crouching: boolean,
  aimLevel: number, // 1 shoulder, 2 sights (0 = no sway applied)
): { x: number; y: number } {
  if (aimLevel === 0 || swayClass <= 0) return { x: 0, y: 0 };
  const tired = stamina < 35 ? 1 + (35 - stamina) / 35 : 1; // up to 2x when gassed
  const amp = 0.0062 * swayClass * tired * (crouching ? 0.55 : 1) * (aimLevel === 1 ? 0.6 : 1);
  return {
    x: amp * (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 1.73 + 1.3) * 0.4),
    y: amp * (Math.cos(t * 1.27 + 0.4) * 0.6 + Math.sin(t * 2.21) * 0.4),
  };
}

// ---------------------------------------------------------- convergence ---

/** Plain-vector shape (gunMath stays THREE-free). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Item 6 (2026-10-21 playtest: "gun should be properly pointed at the
 * crosshair") — crosshair convergence. The crosshair sits on the
 * CAMERA ray; the gun fires from the EYE, which is offset from the
 * camera (third person, lean, crouch). Firing parallel to the camera
 * ray from the eye means shots land beside the crosshair at every
 * range. The honest fix: aim the shot from the eye THROUGH the point
 * the crosshair is actually on — the camera-ray point at the
 * convergence distance (nearest husk / ground hit along the camera
 * ray, else weapon range). At that distance the shot crosses the
 * crosshair exactly; nearer/farther the error is the small residual
 * of a real offset barrel, shrinking with distance.
 */
export function convergedDir(
  eye: Vec3Like,
  camOrigin: Vec3Like,
  camDir: Vec3Like,
  dist: number,
): Vec3Like {
  const tx = camOrigin.x + camDir.x * dist - eye.x;
  const ty = camOrigin.y + camDir.y * dist - eye.y;
  const tz = camOrigin.z + camDir.z * dist - eye.z;
  const len = Math.hypot(tx, ty, tz);
  if (len < 1e-6) return { x: camDir.x, y: camDir.y, z: camDir.z };
  return { x: tx / len, y: ty / len, z: tz / len };
}

/**
 * Distance along a ray to the first ground contact, stepped the same
 * way Combat walks miss tracers (2 m steps, 0.05 skin). Null when the
 * ray stays above terrain out to maxDist (sky shots).
 */
export function rayGroundDistance(
  o: Vec3Like,
  d: Vec3Like,
  groundY: (x: number, z: number) => number,
  maxDist: number,
): number | null {
  for (let dist = 2; dist <= maxDist; dist += 2) {
    const x = o.x + d.x * dist;
    const y = o.y + d.y * dist;
    const z = o.z + d.z * dist;
    if (y <= groundY(x, z) + 0.05) return dist;
  }
  return null;
}

// ---------------------------------------------------------------- sights ---

/**
 * Sight types (Ian 2026-10-22: "sights (iron vs scopes or dot sights)").
 * Every firearm resolves to exactly one sight picture:
 *  - iron:  the gun's own posts — no zoom beyond the shipped ADS picture.
 *  - dot:   a reflex/red-dot — ~1.25x tighter than iron, snaps up fast,
 *           clean single-dot reticle.
 *  - scope: magnified glass — zoom per weapon (def.sightZoom, default 4x),
 *           slow to raise, tightest cone, and the sway you barely feel
 *           on irons is honestly magnified.
 * A mounted reflex_sight mod (the optic-slot attachment that already
 * exists) overrides the gun's fixed sight — the mounted optic IS the
 * sight picture. Zoom is real optics math: FOV from the tangent ratio,
 * so the magnification figure is the true one, not a vibes number.
 */
export type SightType = 'iron' | 'dot' | 'scope';

export interface SightProfile {
  type: SightType;
  /** Magnification vs the hip FOV — before any per-weapon scope zoom. */
  zoom: number;
  /** Hip -> sights time scale (dot snaps up, glass takes its time). */
  adsTimeMult: number;
  /** Spread scale at full sights (glass steadies the picture). */
  adsSpreadMult: number;
  /** Sway amplitude scale at full sights (magnification magnifies). */
  swayMult: number;
}

export const SIGHT_PROFILES: Record<SightType, SightProfile> = {
  // zoom 1.677 reproduces the shipped sights FOV (38° off a 60° base):
  // irons gain nothing and lose nothing in this pass.
  iron: { type: 'iron', zoom: 1.677, adsTimeMult: 1.0, adsSpreadMult: 1.0, swayMult: 1.0 },
  // 2.10 / 1.677 = 1.25x over the iron picture, per the directive.
  dot: { type: 'dot', zoom: 2.1, adsTimeMult: 0.72, adsSpreadMult: 0.9, swayMult: 0.9 },
  scope: { type: 'scope', zoom: 4.0, adsTimeMult: 1.35, adsSpreadMult: 0.55, swayMult: 1.6 },
};

/** The hip-fire base FOV the zoom figures are measured against. */
export const HIP_FOV = 60;

/** Vertical FOV (degrees) at the given magnification off a base FOV. */
export function fovForZoom(baseFovDeg: number, zoom: number): number {
  const half = (baseFovDeg * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) / Math.max(1, zoom)) * 180) / Math.PI;
}

/** Resolve a weapon's sight: a mounted reflex mod wins; otherwise the
 *  def's fixed sight; otherwise honest irons. Scopes carry their
 *  per-weapon zoom (sightZoom, default 4x). */
export function sightFor(
  def: { sight?: SightType; sightZoom?: number },
  mods: readonly string[],
): SightProfile {
  if (mods.includes('reflex_sight')) return SIGHT_PROFILES.dot;
  const base = SIGHT_PROFILES[def.sight ?? 'iron'];
  if (base.type === 'scope' && def.sightZoom != null) return { ...base, zoom: def.sightZoom };
  return base;
}

/** Sights FOV for an equipped weapon at full ADS. */
export function sightFov(def: { sight?: SightType; sightZoom?: number }, mods: readonly string[]): number {
  return fovForZoom(HIP_FOV, sightFor(def, mods).zoom);
}

/** 0 at the shoulder point of the ADS blend, 1 at full sights — the
 *  progression sight spread/sway effects ease in over. */
export function adsProgression(adsBlend: number): number {
  return Math.min(1, Math.max(0, (adsBlend - 0.55) / 0.45));
}

/** Spread scale from the sight at a given ADS blend: 1 from the hip,
 *  easing to the profile's sights figure as the gun settles. */
export function sightSpreadMult(sight: SightProfile, adsBlend: number): number {
  return 1 + (sight.adsSpreadMult - 1) * adsProgression(adsBlend);
}

/** Sway-amplitude scale from the sight at a given ADS blend. */
export function sightSwayMult(sight: SightProfile, adsBlend: number): number {
  return 1 + (sight.swayMult - 1) * adsProgression(adsBlend);
}

// -------------------------------------------------------------- condition ---

/** Wear: spec §1.3 — 1 condition per 25 shots / per 20 landed swings. */
export const WEAR_PER_SHOT = 1 / 25;
export const WEAR_PER_SWING = 1 / 20;

export function applyWear(condition: number, amount: number): number {
  return Math.min(100, Math.max(0, condition - Math.max(0, amount)));
}

/** A shot-out barrel throws weak rounds: below 30 condition, damage sags. */
export function conditionDamageMult(condition: number): number {
  return condition < 30 ? 0.85 : 1;
}

/**
 * Jam chance per shot (spec §2.3): only a worn gun jams — 2%/shot under
 * 30 condition, doubling when it's truly shot out; a suppressor's cleaner
 * gas cycle halves it.
 */
export function jamChance(condition: number, suppressed: boolean): number {
  if (condition >= 30) return 0;
  const base = condition < 15 ? 0.04 : 0.02;
  return suppressed ? base * 0.5 : base;
}

export function rollJam(condition: number, suppressed: boolean, rng: () => number): boolean {
  const c = jamChance(condition, suppressed);
  return c > 0 && rng() < c;
}

// ---------------------------------------------------------------- damage ---

/** The shipped falloff curve, single-sourced for hitscan + projectiles. */
export function rangeFalloff(damage: number, dist: number): number {
  if (dist <= 25) return damage;
  return damage * Math.max(0.5, 1 - (dist - 25) / 50);
}

/**
 * Armor model. Husk armor classes: 0 = flesh (shambler/stalker),
 * 2 = plated (armored kind). Penetration classes come from the ammo:
 * 0 = 9mm/shells/flare, 1 = 5.56/bolts-light, 2 = rifle/bolts.
 * Plated husks shrug off pen-0 fire (30%), pen-1 gets most of it through,
 * pen-2 ignores the plate.
 */
export function armorMult(pen: number, armorClass: number): number {
  if (armorClass <= 0) return 1;
  if (pen >= 2) return 1;
  if (pen === 1) return 0.65;
  return 0.3;
}

/**
 * Stagger power of a connecting hit, 0..1 — drives husk flinch size and
 * whether an attack windup breaks. Headshots always rock the husk.
 */
export function staggerPower(damage: number, head: boolean): number {
  if (head) return 1;
  if (damage >= 50) return 0.85;
  if (damage >= 30) return 0.6;
  if (damage >= 18) return 0.35;
  return 0.15;
}
