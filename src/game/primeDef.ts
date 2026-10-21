/**
 * primeDef — the Western Star 5700 XE "Nomad Prime" heavy semi tractor
 * as pure data (fleet integration, 2026-10-21).
 *
 * Ian dropped the full spec (design-refs/fleet-specs/nomad-prime-semi.md,
 * the canon) and approved the model AS-IS ("send me as is but continue
 * polishing" — polish rounds continue on the asset lane; integration
 * does not wait for them). Same registration pattern as the GT500: a
 * VehicleDef here, a CarParams here, CarPhysics selects by def id.
 *
 * Spec figures (Ian's sheet): 8,950 kg empty, Detroit diesel 600 hp
 * class with ~2,370 Nm, 950 L in dual saddle tanks, top speed 145 km/h,
 * 32 storage slots (sleeper lockers + diamond-plate tool compartments),
 * 50,000-lb fifth-wheel turntable (48,000 kg max tow), noise radius
 * 105 m. The model is public/models/nomad-prime.glb
 * (tools/nomad_prime/build_nomad_prime.py): real Class-8 dimensions
 * (~8.6 m long, 2.55 m wide, wheel radius 0.525 — 22.5" rubber), TEN
 * wheel pivots (steer pair + tandem duals), driver_seat /
 * headlight_*_projector / trailer_hitch_fifth_wheel markers.
 *
 * The upgrade tree's carSpec deltas are Stallion-build tuning and do
 * not transfer (same ruling as the GT500): paramsForDef returns this
 * fixed spec + cargo mass.
 */
import type { CarParams } from './carSpec';
import { DRIVER_KG } from './carSpec';
import type { GlbWheelSpec, SpawnDef, VehicleDef } from './Vehicles';

export const PRIME_GLB_PATH = '/models/nomad-prime.glb';

export const PRIME_DEF: VehicleDef = {
  id: 'nomad_prime',
  name: 'Nomad Prime',
  kind: 'car',
  length: 8.55,
  width: 2.55,
  fuelMax: 950,
  burnClass: 1.6, // a loaded Class-8 diesel drinks like one
  noiseDrive: 105, // spec noise_radius_m — the loudest thing on the island
  color: 0x1b2a38, // gunmetal slate / dark cobalt (spec paint codes)
  storageKg: 400, // 32 slots: sleeper lockers + chassis tool compartments
  hitch: 'fifth_wheel',
  maxTowKg: 48000,
};

/**
 * Wheel rig in CarPhysics suspension order [FR, FL, RR, RL]. The
 * physics rig stays 4-corner (steer axle + tandem centroid); ALL TEN
 * visual wheels spin, the steer pair steers, and each tandem dual
 * follows its side's rear corner suspension travel.
 */
export const PRIME_WHEEL_RIG: GlbWheelSpec[] = [
  { name: 'Wheel_Steer_Right', wheelIdx: 0, steer: true },
  { name: 'Wheel_Steer_Left', wheelIdx: 1, steer: true },
  { name: 'Wheel_Drive_Axle1_Right_Outer', wheelIdx: 2 },
  { name: 'Wheel_Drive_Axle1_Right_Inner', wheelIdx: 2 },
  { name: 'Wheel_Drive_Axle2_Right_Outer', wheelIdx: 2 },
  { name: 'Wheel_Drive_Axle2_Right_Inner', wheelIdx: 2 },
  { name: 'Wheel_Drive_Axle1_Left_Outer', wheelIdx: 3 },
  { name: 'Wheel_Drive_Axle1_Left_Inner', wheelIdx: 3 },
  { name: 'Wheel_Drive_Axle2_Left_Outer', wheelIdx: 3 },
  { name: 'Wheel_Drive_Axle2_Left_Inner', wheelIdx: 3 },
];

export const PRIME_BASE_MASS_KG = 8950; // spec weight_empty_kg
export const PRIME_FUEL_KG = 808; // 950 L diesel at 0.85 kg/L

/** Detroit DD-class torque: peak 2,370 Nm low, power still climbing
 *  to the 2,100 rpm governor — 600 hp class at the top of the band. */
export const PRIME_TORQUE: [number, number][] = [
  [600, 1050], [800, 1750], [1000, 2250], [1100, 2370], [1300, 2370],
  [1500, 2320], [1700, 2260], [1900, 2200], [2100, 2050],
];

export const PRIME_PARAMS: CarParams = {
  massKg: PRIME_BASE_MASS_KG + DRIVER_KG + PRIME_FUEL_KG,
  torqueCurve: PRIME_TORQUE,
  idleRpm: 600,
  redlineRpm: 2100,
  // 10-speed automated box; with the 2.87 axle the top gear runs out
  // of revs at ~145 km/h — the spec's top speed is a gearing fact.
  gears: [11.0, 8.2, 6.1, 4.6, 3.5, 2.7, 2.1, 1.65, 1.3, 1.0],
  finalDrive: 2.87,
  tireMu: 0.85, // commercial drive rubber, not a sport compound
  rearLoadFrac: 0.6, // bobtail tractor: the tandem carries most of it
  wheelRadiusM: 0.525,
  dragK: 5.2, // lumped term for a barn-door cab (Ian's sanctioned
  // model) — sized so the drag balance lands on the spec's 145 km/h
  rollingCoef: 0.012,
  drivetrainEff: 0.85,
  lifted: false,
};

/**
 * Spawn: the airbase apron/logistics row, east of the Seahawk pad
 * (462,-118) on the same graded line — (516,-120) sits on the 2.7
 * plateau grade, clear of the hangar footprint and the Seahawk.
 * Nose east, parked parallel to the apron.
 */
export const PRIME_SPAWN: SpawnDef = {
  id: 'nomad_prime',
  poi: 'airbase',
  dx: 36,
  dz: -12,
  heading: Math.PI / 2,
};
