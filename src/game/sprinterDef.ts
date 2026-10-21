/**
 * sprinterDef — the V-04 Nomad Sprinter expedition live-in van as pure
 * data (fleet integration, 2026-10-21).
 *
 * Ian dropped the full spec (design-refs/fleet-specs/v04-sprinter.md,
 * the canon) and approved the model AS-IS ("send me as is but continue
 * polishing" — polish rounds continue on the asset lane). Same
 * registration pattern as the GT500: a VehicleDef here, a CarParams
 * here, CarPhysics selects by def id.
 *
 * Spec figures (Ian's sheet): 3,400 kg empty, diesel, 110 L tank,
 * top speed 125 km/h, 36 storage slots (cabinetry, under-bed garage,
 * roof cases), 4,500 kg bumper-ball towing, noise radius 55 m. The
 * model is public/models/sprinter.glb (tools/sprinter/
 * build_sprinter.py): a 170" extended high-roof body (6.97 m long,
 * 2.02 m wide, 4.32 m wheelbase), four Wheel_FL/FR/RL/RR beadlock
 * pivots, driver_seat + interior markers (the living space is real
 * geometry — bed, cabinets, galley — for the day the doors open).
 *
 * The upgrade tree's carSpec deltas are Stallion-build tuning and do
 * not transfer (same ruling as the GT500): paramsForDef returns this
 * fixed spec + cargo mass.
 */
import type { CarParams } from './carSpec';
import { DRIVER_KG } from './carSpec';
import type { GlbWheelSpec, SpawnDef, VehicleDef } from './Vehicles';
import { FLEET_HOME_POI, padSpawn } from './airbaseSite';

export const SPRINTER_GLB_PATH = '/models/sprinter.glb';

export const SPRINTER_DEF: VehicleDef = {
  id: 'sprinter_van',
  name: 'V-04 Nomad Sprinter',
  kind: 'car',
  length: 6.97,
  width: 2.02,
  fuelMax: 110,
  burnClass: 1.05,
  noiseDrive: 55, // spec noise_radius_m
  color: 0x59614a, // tactical olive (the GLB's two-tone olive/slate)
  storageKg: 500, // 36 slots: cabinetry + under-bed garage + roof cases
  hitch: 'bumper_ball',
  maxTowKg: 4500,
};

/** Wheel rig in CarPhysics suspension order [FR, FL, RR, RL]. */
export const SPRINTER_WHEEL_RIG: GlbWheelSpec[] = [
  { name: 'Wheel_FR', wheelIdx: 0, steer: true },
  { name: 'Wheel_FL', wheelIdx: 1, steer: true },
  { name: 'Wheel_RR', wheelIdx: 2 },
  { name: 'Wheel_RL', wheelIdx: 3 },
];

export const SPRINTER_BASE_MASS_KG = 3400; // spec weight_empty_kg
export const SPRINTER_FUEL_KG = 94; // 110 L diesel at 0.85 kg/L

/** 3.0 diesel (OM642 class): 440 Nm plateau from 1,600, ~190 hp. */
export const SPRINTER_TORQUE: [number, number][] = [
  [800, 200], [1000, 300], [1400, 400], [1600, 440], [2000, 440],
  [2400, 440], [2800, 420], [3200, 395], [3600, 365], [4000, 330],
  [4200, 310],
];

export const SPRINTER_PARAMS: CarParams = {
  massKg: SPRINTER_BASE_MASS_KG + DRIVER_KG + SPRINTER_FUEL_KG,
  torqueCurve: SPRINTER_TORQUE,
  idleRpm: 750,
  redlineRpm: 4200,
  gears: [4.38, 2.86, 1.92, 1.37, 1.0, 0.82, 0.7], // 7-speed auto class
  finalDrive: 3.92,
  tireMu: 0.95, // all-terrain beadlock fitment
  rearLoadFrac: 0.55,
  wheelRadiusM: 0.44, // polished GLB (c9071da): 0.44R tires, pivots sit at 0.44
  dragK: 2.3, // a tall van punches a bigger hole than the cars —
  // sized so the drag balance lands on the spec's 125 km/h
  rollingCoef: 0.012,
  drivetrainEff: 0.85,
  // the +3" lift is in the model's stance and this def's suspension
  // tune (CarPhysics SUSP_TUNES) — not the Stallion's lift-kit params
  lifted: false,
};

/**
 * Spawn: the Sprinter's marked pad on the airbase apron — FLEET
 * RESPAWN (Ian, 2026-10-21). The van camped at the marina through the
 * integration wave and Ian never found it there; it homes with the
 * rest of the fleet now, nose east on the pads row. Position derives
 * from the pad (airbaseSite.ts AIRBASE_PADS).
 */
export const SPRINTER_SPAWN: SpawnDef = {
  id: 'sprinter_van',
  poi: FLEET_HOME_POI,
  ...padSpawn('pad_sprinter'),
};
