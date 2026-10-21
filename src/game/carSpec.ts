/**
 * carSpec — the Mustang's physics parameters and the math that turns
 * them into performance (Ian's doctrine, 2026-10-20: "physics is math
 * that we can do and that upgrades can show — weight and accel are
 * math; we just aren't worrying about aero").
 *
 * ONE source of truth: the Rapier vehicle controller (CarPhysics.ts)
 * drives from these parameters, and the phone's build sheet displays
 * estimates computed from the SAME parameters by the 1-D longitudinal
 * integration below. No stat multipliers anywhere: upgrades change
 * mass, the torque curve, gearing, or tire grip — and the numbers move
 * because the math moves.
 *
 * The only resistance model is Ian's sanctioned simple term: a lumped
 * quadratic drag (one constant covering shape + drivetrain loss growth
 * at speed) plus rolling resistance. No aero surfaces, no downforce.
 */

export interface CarParams {
  /** Total mass: car + driver + fuel + fitted upgrade mass + cargo. */
  massKg: number;
  /** Engine torque curve: [rpm, Nm] breakpoints, linear between. */
  torqueCurve: [number, number][];
  idleRpm: number;
  redlineRpm: number;
  /** Gear ratios, 1st..6th. */
  gears: number[];
  finalDrive: number;
  /** Tire-road friction coefficient (longitudinal peak). */
  tireMu: number;
  /** Driven-axle static load fraction (RWD rear). */
  rearLoadFrac: number;
  wheelRadiusM: number;
  /** Lumped quadratic drag constant: F = dragK * v^2 (N, v in m/s). */
  dragK: number;
  rollingCoef: number;
  drivetrainEff: number;
}

/** Stock Stallion FX (S650 GT-class): 460 hp Coyote-class V8. */
export const STOCK_TORQUE: [number, number][] = [
  [1000, 300], [1500, 380], [2200, 450], [3000, 505], [4000, 545],
  [4600, 562], [5500, 545], [6500, 505], [7200, 450], [7500, 415],
];

export const BASE_MASS_KG = 1700; // the car, fluids in
export const DRIVER_KG = 75;
export const FUEL_KG = 45; // a full 61 L tank, counted in every build state

/** Mass each fitted upgrade adds (kg). Weight reduction is negative.
 *  Cargo rides on top via cargoKg — it is real mass in the sim. */
export const UPGRADE_MASS_KG: Record<string, number> = {
  armor: 70,
  bullbar: 25,
  cargo_racks: 18,
  run_flats: 8,
  engine_tune: 5,
  supercharger: 55,
  final_drive: 0,
  grip_tires: 0,
  weight_reduction: -95,
};

/** Torque-curve scale per engine upgrade (multiplies the whole curve —
 *  a real change to the engine's output, applied before gearing). */
export const UPGRADE_TORQUE_SCALE: Record<string, number> = {
  engine_tune: 1.09,
  supercharger: 1.38,
};

export function torqueAt(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [x0, y0] = curve[i - 1];
      const [x1, y1] = curve[i];
      return y0 + ((y1 - y0) * (rpm - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

export function peakPowerKw(curve: [number, number][]): number {
  let peak = 0;
  for (let rpm = 1000; rpm <= 7600; rpm += 100) {
    peak = Math.max(peak, (torqueAt(curve, rpm) * rpm * Math.PI) / 30000);
  }
  return peak;
}

/** Derive the full parameter set for a build state. */
export function carParams(upgrades: readonly string[], cargoKg = 0): CarParams {
  let mass = BASE_MASS_KG + DRIVER_KG + FUEL_KG + Math.max(0, cargoKg);
  let torqueScale = 1;
  for (const u of upgrades) {
    mass += UPGRADE_MASS_KG[u] ?? 0;
    torqueScale *= UPGRADE_TORQUE_SCALE[u] ?? 1;
  }
  const curve = STOCK_TORQUE.map(([rpm, nm]) => [rpm, nm * torqueScale] as [number, number]);
  const gears = [3.24, 2.10, 1.42, 1.06, 0.81, 0.62];
  return {
    massKg: mass,
    torqueCurve: curve,
    idleRpm: 900,
    redlineRpm: 7400,
    gears,
    // shorter final drive = quicker gears everywhere (a real gearing change)
    finalDrive: upgrades.includes('final_drive') ? 3.85 : 3.55,
    tireMu: upgrades.includes('grip_tires') ? 1.18 : 1.02,
    rearLoadFrac: 0.47,
    wheelRadiusM: 0.345,
    dragK: 1.05,
    rollingCoef: 0.011,
    drivetrainEff: 0.87,
  };
}

export interface PerfEstimate {
  zeroToHundredSec: number;
  topSpeedKmh: number;
  powerKw: number;
  powerToWeightKwPerTonne: number;
  massKg: number;
}

const G = 9.81;

/**
 * 1-D full-throttle run on flat ground: launch against the tire's
 * traction limit (with longitudinal weight transfer), shift at redline,
 * fight the lumped drag + rolling terms. This is the same math the
 * rigid-body controller is fed; the displayed estimates and the test
 * assertions both come from here.
 */
export function estimatePerformance(p: CarParams): PerfEstimate {
  const circ = 2 * Math.PI * p.wheelRadiusM;
  let v = 0;
  let t = 0;
  let gear = 0;
  const dt = 0.005;
  let t100 = Infinity;
  let vMax = 0;
  let shiftT = 0; // a shift is a real event: 0.25 s with no drive force
  while (t < 90) {
    const wheelRps = (v / circ) * (p.gears[gear] * p.finalDrive);
    let rpm = wheelRps * 60;
    if (rpm < p.idleRpm) rpm = p.idleRpm;
    if (rpm >= p.redlineRpm && gear < p.gears.length - 1) {
      gear++;
      shiftT = 0.25;
      continue;
    }
    const engineTq = torqueAt(p.torqueCurve, Math.min(rpm, p.redlineRpm));
    const wheelTq = engineTq * p.gears[gear] * p.finalDrive * p.drivetrainEff;
    let force = shiftT > 0 ? 0 : wheelTq / p.wheelRadiusM;
    shiftT = Math.max(0, shiftT - dt);
    // traction limit at the driven axle, with weight transfer under accel
    const aGuess = force / p.massKg;
    const transfer = (p.massKg * aGuess * 0.52) / 2.718; // CG height / wheelbase
    const rearLoad = p.massKg * G * p.rearLoadFrac + transfer;
    const tractionMax = p.tireMu * rearLoad;
    force = Math.min(force, tractionMax);
    const resist = p.dragK * v * v + p.rollingCoef * p.massKg * G;
    const a = (force - resist) / p.massKg;
    if (force > 0 && a <= 0.01 && v > 5) break; // top speed: force applied, accel gone
    v += a * dt;
    t += dt;
    if (v > vMax) vMax = v;
    if (t100 === Infinity && v >= 100 / 3.6) t100 = t;
    if (v >= 27.78 && t100 === Infinity) t100 = t; // safety, unreachable
  }
  return {
    zeroToHundredSec: t100,
    topSpeedKmh: vMax * 3.6,
    powerKw: peakPowerKw(p.torqueCurve),
    powerToWeightKwPerTonne: peakPowerKw(p.torqueCurve) / (p.massKg / 1000),
    massKg: p.massKg,
  };
}
