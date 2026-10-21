/**
 * gt500Def — the 2007 Shelby GT500 (S197) as pure data (Lane 1).
 *
 * The car returns as a drivable classic on the same physics stack as
 * the Stallion: Vehicles.ts gets a VehicleDef (identity/tank/storage),
 * CarPhysics gets a CarParams (the sim's real inputs) — both live here
 * so the integration is two registrations, not a fork of the systems.
 *
 * Period spec (2007 GT500 coupe, Ford SVT published figures):
 *   5.4 L supercharged V8 — 500 hp (373 kW) @ 6000 rpm,
 *   480 lb-ft (651 Nm) @ 4500 rpm, redline 6250 rpm
 *   Tremec TR-6060 6-speed manual: 2.97 / 1.78 / 1.30 / 1.00 / 0.80 / 0.63
 *   Final drive 3.31. Curb mass 3,920 lb (1,778 kg), weight dist 57/43.
 *   Tires 255/45ZR18 front, 285/40ZR18 rear (rolling radius ~0.343 m).
 *   Tank 16.1 gal (~61 L). Top speed was electronically limited to
 *   155 mph (250 km/h) in period.
 *
 * The model is public/gt500.glb (tools/gt500/build_gt500.py): real
 * S197 dimensions (4.79 m, 2.71 m wheelbase), wheels as separate
 * WheelFL/FR/RL/RR objects with axle-centre origins — the same rig
 * contract attachMustangGlb consumes.
 */
import type { CarParams } from './carSpec';
import { DRIVER_KG, FUEL_KG } from './carSpec';
import type { SpawnDef, VehicleDef } from './Vehicles';

export const GT500_GLB_PATH = '/gt500.glb';

export const GT500_DEF: VehicleDef = {
  id: 'gt500',
  name: 'Shelby GT500',
  kind: 'car',
  length: 4.77,
  width: 1.88,
  fuelMax: 61,
  burnClass: 1.15, // supercharged V8 drinks harder than the Coyote
  noiseDrive: 58,
  color: 0x9c0d0d, // Torch Red — matches the GLB paint material
  storageKg: 35, // coupe trunk
};

/** Wheel rig lookup in CarPhysics suspension order [FR, FL, RR, RL]. */
export const GT500_WHEEL_RIG: [string, number][] = [
  ['WheelFR', 0],
  ['WheelFL', 1],
  ['WheelRR', 2],
  ['WheelRL', 3],
];

export const GT500_BASE_MASS_KG = 1778; // published curb weight, fluids in

/** Supercharged 5.4 torque: fat and flat, peaking 651 Nm at 4500. */
export const GT500_TORQUE: [number, number][] = [
  [1000, 430], [1500, 505], [2000, 565], [2500, 605], [3000, 630],
  [3500, 645], [4000, 651], [4500, 651], [5000, 640], [5500, 615],
  [6000, 594], [6250, 565],
];

export const GT500_PARAMS: CarParams = {
  massKg: GT500_BASE_MASS_KG + DRIVER_KG + FUEL_KG,
  torqueCurve: GT500_TORQUE,
  idleRpm: 850,
  redlineRpm: 6250,
  gears: [2.97, 1.78, 1.30, 1.0, 0.8, 0.63], // TR-6060
  finalDrive: 3.31,
  tireMu: 1.05, // Goodyear Eagle F1 Supercar class (period fitment)
  rearLoadFrac: 0.43, // 57/43 front-biased, the S197's known trait
  wheelRadiusM: 0.343,
  dragK: 1.05, // Ian's sanctioned lumped term, same class as the Stallion
  rollingCoef: 0.011,
  drivetrainEff: 0.85,
  lifted: false,
};

/**
 * Spawn proposal for the integration step: a second car on the
 * lighthouse grounds, clear of the Stallion's spot (dx -14, dz 16) —
 * the island's first two-car moment, and the fleet>=2 unlock for
 * dispatch. Not live until VEHICLE_SPAWNS gains this entry.
 */
export const GT500_SPAWN: SpawnDef = {
  id: 'gt500',
  poi: 'lighthouse_base',
  dx: 12,
  dz: 20,
  heading: Math.PI * 0.3,
};
