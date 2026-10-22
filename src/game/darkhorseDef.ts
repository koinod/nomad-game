/**
 * darkhorseDef — the S650 Stallion Dark Horse as pure data (Dark
 * Horse integration, 2026-10-21). Ian's word on the build: "if it
 * works, fine" — the Stallion lane's GLB (public/darkhorse.glb, tools/
 * stallion/build_stallion.py) integrates NOW as the playable hero car;
 * a surface pass improves the same file later in its own lane, so
 * everything here keys off the ANCHOR CONTRACT, not the pixels:
 * node names (WheelFL/FR/RL/RR, MOD_* stage meshes, MOD_WheelMT*),
 * the measured wheel stations, and the CAR_SEATS interior numbers
 * the shell was built to.
 *
 * Stage data reconciled from the build report's PRD §2 table (the
 * game's performance law wins where they differ):
 *   Stage 0  Factory           1,795 kg · 567 Nm peak · 135 mm
 *   Stage 1  Highway Interceptor +385 kg · 610 Nm peak · 145 mm
 *   Stage 2  Apex Dust           +595 kg · 840 Nm peak · 240 mm
 * Gearing is the PRD Tremec 6-speed [3.25/2.23/1.61/1.24/1.00/0.63]
 * on a 3.73 final drive at every stage. The stages are UPGRADE TIERS
 * in data/upgrades.ts (dh_stage1 / dh_stage2, Dark-Horse-only): the
 * sim params move because mass, torque, wheel radius, and grip move —
 * no stat multipliers. The generic Stallion upgrade tree's carSpec
 * deltas do NOT restamp this car (same fleet ruling as the GT500 /
 * Prime / Sprinter); cargo is real mass on top.
 */
import type { CarParams } from './carSpec';
import { DRIVER_KG, FUEL_KG } from './carSpec';
import type { GlbWheelSpec, SpawnDef, VehicleDef } from './Vehicles';
import { FLEET_HOME_POI, padSpawn } from './airbaseSite';

export const DARKHORSE_GLB_PATH = '/darkhorse.glb';

export const DARKHORSE_DEF: VehicleDef = {
  id: 'dark_horse',
  name: 'Stallion Dark Horse',
  kind: 'car',
  length: 4.82, // PRD: 4,819 mm
  width: 1.92, // PRD: 1,917 mm
  fuelMax: 61, // S650 tank, same as the FX / GT500
  burnClass: 1.1, // Coyote 5.0 — thirstier than the FX tune, kinder than the blown Shelby
  noiseDrive: 57,
  color: 0x2456a6, // the GLB's blue (Ian's factory-baseline car)
  storageKg: 45, // coupe trunk, same class as the FX
  // The PRD socket list carries the hitch point (0, −2.420, 0.380);
  // the Class IV receiver itself is a Stage 1 mesh (MOD_Receiver).
  // Recorded data only — trailers are not built yet.
  hitch: 'bumper_ball',
  maxTowKg: 1600,
};

/**
 * Wheel rig in CarPhysics suspension order [FR, FL, RR, RL]. The GLB
 * carries TWO full sets: the stock split-5s (WheelFR/FL/RR/RL at the
 * Stage 0 stations ±1.359, r 0.345) and the Stage 2 beadlock MT set
 * (MOD_WheelMT*, Stage-2 stations ±1.372, r 0.419). All eight rig onto
 * the 4 physics corners like the Prime's duals; which set RENDERS is
 * the stage toggle (applyDarkHorseStageMods in Vehicles.ts).
 */
export const DARKHORSE_WHEEL_RIG: GlbWheelSpec[] = [
  { name: 'WheelFR', wheelIdx: 0, steer: true },
  { name: 'WheelFL', wheelIdx: 1, steer: true },
  { name: 'WheelRR', wheelIdx: 2 },
  { name: 'WheelRL', wheelIdx: 3 },
  { name: 'MOD_WheelMTFR', wheelIdx: 0, steer: true },
  { name: 'MOD_WheelMTFL', wheelIdx: 1, steer: true },
  { name: 'MOD_WheelMTRR', wheelIdx: 2 },
  { name: 'MOD_WheelMTRL', wheelIdx: 3 },
];

/** Car mass per stage (PRD §2 — the car, fluids in; driver + fuel
 *  ride on top in the params, the GT500 pattern). */
export const DARKHORSE_STAGE_MASS_KG = [1795, 2180, 2390] as const;

/** Peak torque per stage (PRD §2). Stage 1 is induction/exhaust
 *  work; Stage 2 is the supercharger — the params scale the whole
 *  curve by peak ratio, the carSpec-sanctioned engine change. */
export const DARKHORSE_STAGE_TORQUE_NM = [567, 610, 840] as const;

/**
 * Coyote Dark Horse torque: 567 Nm plateau through the midrange,
 * power still healthy at the 7,500 redline (~370 kW ≈ 500 hp peak —
 * peakPowerKw reads it in the tests).
 */
export const DARKHORSE_TORQUE: [number, number][] = [
  [1000, 320], [1500, 395], [2200, 465], [3000, 515], [4000, 552],
  [4800, 567], [5500, 567], [6200, 548], [7000, 505], [7500, 470],
];

/** The stage a build state has reached: Stage 2's mesh set includes
 *  Stage 1's, so ownership of dh_stage2 alone still reads stage 2. */
export function darkHorseStage(upgrades: readonly string[]): 0 | 1 | 2 {
  if (upgrades.includes('dh_stage2')) return 2;
  if (upgrades.includes('dh_stage1')) return 1;
  return 0;
}

/**
 * Full sim params for a build state. Stage deltas are real: +385 /
 * +595 kg of hardware, the torque curve scaled to the stage peak,
 * Stage 2's 33″ MTs (r 0.419, taller effective gearing, less pavement
 * grip, more rolling resistance) and its lift (params.lifted — the
 * longer, softer suspension). The lumped drag constant grows with
 * the stages' frontal hardware (ram, then lift + turret).
 */
export function darkHorseParams(upgrades: readonly string[], cargoKg = 0): CarParams {
  const stage = darkHorseStage(upgrades);
  const scale = DARKHORSE_STAGE_TORQUE_NM[stage] / DARKHORSE_STAGE_TORQUE_NM[0];
  const curve = DARKHORSE_TORQUE.map(([rpm, nm]) => [rpm, nm * scale] as [number, number]);
  return {
    massKg: DARKHORSE_STAGE_MASS_KG[stage] + DRIVER_KG + FUEL_KG + Math.max(0, cargoKg),
    torqueCurve: curve,
    idleRpm: 900,
    redlineRpm: 7500,
    gears: [3.25, 2.23, 1.61, 1.24, 1.0, 0.63], // PRD Tremec, all stages
    finalDrive: 3.73, // PRD Torsen axle, all stages
    tireMu: stage === 2 ? 0.98 : 1.06, // MT knobs vs the track-pack compound
    rearLoadFrac: 0.47, // S650 balance, same as the FX
    wheelRadiusM: stage === 2 ? 0.419 : 0.345, // the MT set is real rubber in the sim
    dragK: [0.8, 0.88, 1.05][stage],
    rollingCoef: stage === 2 ? 0.014 : 0.011,
    drivetrainEff: 0.87,
    lifted: stage === 2,
  };
}

// ------------------------------------------------------------ MOD meshes
//
// The GLB's Stage 1/2 hardware ships as MOD_* nodes (flat scene
// roots). The token after MOD_ names the part family; the stage map
// below is the integration contract — the surface-pass lane keeps
// these names stable, so classification survives the file swap.

/** Stage 1 — Highway Interceptor: ram + winch, louvers, bolted
 *  plates, rear crash bar + receiver, skidplate, hub spikes. */
export const DARKHORSE_STAGE1_MOD_TOKENS = [
  'Ram', 'Winch', 'Fairlead', 'HubSpike', 'Louver',
  'DoorPlate', 'DoorBolt', 'QuarterPlate', 'QuarterSlot',
  'RearBar', 'DRing', 'Receiver', 'Skidplate',
] as const;

/** Stage 2 — Apex Dust: turret + gun, cage, coilovers, snorkel,
 *  supercharger cowl, beadlock MT wheels. */
export const DARKHORSE_STAGE2_MOD_TOKENS = [
  'Turret', 'Pintle', 'MG', 'AmmoCan', 'FeedChute',
  'Coilover', 'Reservoir', 'Snorkel', 'SuperCowl', 'Cage', 'WheelMT',
] as const;

/**
 * Which stage a GLB node belongs to: 0 = Stage 0 body (always
 * visible), 1 / 2 = that stage's hardware. Unclassified MOD_* nodes
 * default to Stage 2 — an unknown mod hides until the top tier
 * rather than leaking into the factory car.
 */
export function darkHorseModStage(nodeName: string): 0 | 1 | 2 {
  if (!nodeName.startsWith('MOD_')) return 0;
  const token = nodeName.slice(4);
  if (DARKHORSE_STAGE2_MOD_TOKENS.some((t) => token.startsWith(t))) return 2;
  if (DARKHORSE_STAGE1_MOD_TOKENS.some((t) => token.startsWith(t))) return 1;
  return 2;
}

/**
 * Spawn: the Dark Horse pad on the airbase apron — painted and
 * reserved for this car since the site was built ("Reserved for the
 * Dark Horse when it lands"). The pad now carries vehicleId
 * 'dark_horse'; the spawn derives from it, so the car respawns
 * exactly on its mark.
 */
export const DARKHORSE_SPAWN: SpawnDef = {
  id: 'dark_horse',
  poi: FLEET_HOME_POI,
  ...padSpawn('pad_dark_horse'),
};
