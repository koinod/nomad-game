// drivePhysics.ts — pure vehicle-dynamics helpers for the CRAFT WAVE
// physics pass. No three.js, no state: everything here is unit-tested
// (src/tests/drivePhysics.test.ts) and wired into VehicleManager.drive.
//
// What changed vs. the flat model it replaces:
//  - collisions cost condition by IMPACT (speed² × mass class), once
//    per impact edge — not a flat 0.02 shaved per clipped frame;
//  - hard impacts BOUNCE (restitution falls with mass: a bike ricochets,
//    a semi shrugs and stops);
//  - steering saturates at speed (understeer) per class — the wheel
//    still shows full lock, the tires just can't use it all;
//  - pitch/roll come from actual longitudinal/lateral acceleration and
//    each class's center-of-gravity height, not fixed-angle proxies.

export interface MassDef {
  id: string;
  kind: string;
}

/** Curb mass (kg) per hull, with kind fallbacks. Ordering honors the
 *  tow canon: semi > dually (F-250) > regular pickup. */
const MASS_BY_ID: Record<string, number> = {
  sportbike: 190, motocross: 130, atv: 320, marsh_buggy: 780,
  sedan: 1380, mustang: 1660, van: 2150, sprinter: 2350, v03_hauler: 2950,
  bronco: 2150, pickup: 2350, f250: 3300, boxtruck: 4300,
  semi_day: 6900, semi: 7600, goliath: 9200, tank: 39000,
  skiff: 450, tug: 24000,
  seahawk: 3200, cargo_bob: 5800, little_bird: 900,
};
const MASS_BY_KIND: Record<string, number> = {
  bike: 170, moto: 150, atv: 320, car: 1600, skiff: 450, heli: 2500,
};

export function vehicleMassKg(def: MassDef): number {
  return MASS_BY_ID[def.id] ?? MASS_BY_KIND[def.kind] ?? 1600;
}

/** Center-of-gravity height (m) per hull class — drives pitch/roll. */
const CG_BY_ID: Record<string, number> = {
  mustang: 0.48, sedan: 0.55, sportbike: 0.55, motocross: 0.6, atv: 0.55,
  marsh_buggy: 0.6, bronco: 0.78, pickup: 0.82, f250: 0.88, van: 0.85,
  sprinter: 0.9, v03_hauler: 0.95, boxtruck: 1.05, semi_day: 1.0, semi: 1.0,
  goliath: 1.1, tank: 1.0, skiff: 0.5, tug: 1.6,
};

export function cgHeightM(def: MassDef): number {
  return CG_BY_ID[def.id] ?? 0.7;
}

/** Understeer coefficient: how hard the front tires saturate with
 *  speed. Sports rubber holds on; tall trucks wash out early. */
const UNDERSTEER_BY_ID: Record<string, number> = {
  mustang: 0.55, sedan: 0.8, sportbike: 0.7, motocross: 0.7, atv: 0.9,
  marsh_buggy: 0.85, bronco: 1.1, pickup: 1.15, f250: 1.25, van: 1.2,
  sprinter: 1.2, v03_hauler: 1.3, boxtruck: 1.35, semi_day: 1.3, semi: 1.3,
  goliath: 1.4, tank: 1.4,
};

export function understeerK(def: MassDef): number {
  return UNDERSTEER_BY_ID[def.id] ?? 1.0;
}

/**
 * The steer angle the tires can actually deliver at speed. The
 * commanded angle (wheel visual, steering wheel) is untouched — grip
 * saturation is what makes a fast truck plow wide instead of darting.
 */
export function effectiveSteerAngle(steerAngle: number, speedRatio: number, k: number): number {
  const sr = Math.min(1, Math.max(0, speedRatio));
  return steerAngle / (1 + k * sr * sr);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Condition lost in ONE impact (0..1 scale, applied on the impact
 * edge). Grows with speed²; heavier hulls spread the same hit over
 * more structure, light hulls crumple. armorMul / lossFactor are the
 * upgrade system's multipliers, applied by the caller.
 */
export function impactDamage(speed: number, massKg: number, armorMul: number, lossFactor: number): number {
  const s = Math.abs(speed);
  const massSpread = Math.pow(1500 / Math.max(massKg, 300), 0.35);
  return clamp(0.0013 * s * s * massSpread, 0, 0.35) * armorMul * lossFactor;
}

/**
 * Restitution after a hard impact: the fraction of impact speed the
 * vehicle rebounds with (sign applied by the caller). Light = bouncy,
 * heavy = planted.
 */
export function impactBounce(massKg: number): number {
  return clamp(0.32 * Math.pow(1500 / Math.max(massKg, 300), 0.2), 0.1, 0.5);
}

/** Dynamic pitch from longitudinal acceleration (weight transfer). */
export function weightTransferPitch(accel: number, cgH: number, wheelbase: number): number {
  // braking (accel < 0) dives the nose (+pitch in the game's convention)
  return clamp((-accel * cgH) / (9.81 * Math.max(wheelbase, 1)) * 0.55, -0.05, 0.065);
}

/**
 * Dynamic roll from lateral acceleration (yawRate × speed). Sign
 * matches the game's convention: a right turn (positive steer, positive
 * yawRate in the bicycle integration) rolls the body negative (out).
 */
export function cornerRoll(yawRate: number, speed: number, cgH: number, track: number): number {
  const latA = yawRate * speed;
  const cgFactor = (cgH / 0.55) * (1.6 / Math.max(track, 0.8));
  return clamp(-latA * 0.0014 * cgFactor, -0.085, 0.085);
}
