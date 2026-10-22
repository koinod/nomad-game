/**
 * primeDef — the "Nomad Prime" heavy semi tractor as pure data.
 *
 * CLEAN-SHEET INTEGRATION (2026-10-22): the model is the Prime
 * build lane's PRD v3.0 truck (design-refs/nomad-prime-prd.md,
 * tools/prime/build_prime.py) — public/models/nomad-prime.glb,
 * 6,032,016 B / 151,870 tris. It replaces the 2026-10-21 fleet-
 * sheet model (tools/nomad_prime/, retired with its proof set) at
 * the same loader path. Every number below is re-anchored to the
 * finished model per the build report's anchor table
 * (design-refs/proof-prime/BUILD_REPORT.md — measured FROM the
 * GLB, not from build constants):
 *
 *   overall 8,941 x 2,621 (3,140 over mirrors) x 4,120 (stack tips)
 *   wheelbase 6,320: steer +3,800, drives -1,860 / -3,180
 *   wheel pivots r 0.538 (315/80R22.5): steer +-1.100,
 *     drive duals +-1.100 outer / +-0.765 inner
 *   driver_seat (+1.300, +0.580, hip 1.550), passenger alongside
 *   kingpin socket (-2,350, top 1,280)
 *
 * AXES: the build's house axes are Blender (X nose+, Y left+,
 * Z up). The glTF export maps them to (X nose+, Y up, Z = -Y), so
 * house-left surfaces at glTF -Z — the anchor table below is in
 * glTF space, the space the loader and tests read. The game's
 * wrapper yaw (-90 deg about Y, Vehicles.ts) then puts the nose on
 * +Z in vehicle-group space, exactly as for the Dark Horse.
 *
 * MASS: the PRD's armored datum — kerb 8,950 kg + 2,300 kg of
 * armor / winch / tanks = 11,250 kg as built (the ram, winch and
 * plate are IN this model, not a mod stage). Driver + fuel ride
 * on top in the params, the fleet pattern.
 *
 * POWERTRAIN: the PRD's tuned DD16 — 600 hp / 2,780 Nm — and its
 * 18-speed box [14.40 ... 0.73] on a 4.10 final drive at the PRD's
 * 92% driveline efficiency. No upgrade tree restamps this spec
 * (the fleet ruling); cargo is real mass on top.
 */
import type { CarParams } from './carSpec';
import { DRIVER_KG } from './carSpec';
import type { GlbWheelSpec, SpawnDef, VehicleDef } from './Vehicles';
import { FLEET_HOME_POI, padSpawn } from './airbaseSite';

export const PRIME_GLB_PATH = '/models/nomad-prime.glb';

export const PRIME_DEF: VehicleDef = {
  id: 'nomad_prime',
  name: 'Nomad Prime',
  kind: 'car',
  length: 8.94, // build report: 8,941 mm (ram-wing corner to light bar)
  width: 2.62, // build report: 2,621 mm body (3,140 over the mirrors)
  fuelMax: 950, // PRD: 2 x 475 L saddle tanks
  burnClass: 1.6, // a loaded Class-8 diesel drinks like one
  noiseDrive: 105, // the loudest thing on the island
  color: 0x1b2a38, // PRD paint: gunmetal slate / dark cobalt
  storageKg: 400, // sleeper lockers + diamond-plate tool compartments
  hitch: 'fifth_wheel',
  maxTowKg: 48000,
};

/**
 * Wheel rig in CarPhysics suspension order [FR, FL, RR, RL]. The
 * physics rig stays 4-corner (steer axle + tandem centroid); ALL
 * TEN visual wheels spin, the steer pair steers, and each tandem
 * dual follows its side's rear corner suspension travel. Node
 * names are the GLB's own (verified against the shipped file by
 * primeIntegration.test.ts — the clean-sheet build kept the
 * fleet's node contract, so no loader mapping was needed).
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

/**
 * Measured anchors from the finished model, in glTF space
 * (x = length nose+, y = up, z = -house-left). The kingpin is the
 * trailer socket the P4 trailer work keys off; the gladhands and
 * 7-pin are the umbilical points on the cab's rear bulkhead; the
 * saddle tanks flank the rails at (-0.200, +-0.940, centre height
 * 0.620). Interaction/storage gameplay still resolves by def radii
 * today — these are the model's own points, pinned against the
 * GLB by the integration tests so consumers can adopt them
 * without re-measuring.
 */
export const PRIME_ANCHORS = {
  kingpin: [-2.35, 1.28, 0],
  fifthWheelPlateTop: 1.28,
  driverSeat: [1.3, 1.55, -0.58],
  passengerSeat: [1.3, 1.55, 0.58],
  driverEye: [1.38, 2.32, -0.58],
  gladhandService: [-0.92, 1.48, 0.1],
  gladhandEmergency: [-0.92, 1.48, 0.22],
  electrical7Pin: [-0.92, 1.48, -0.12],
  headlightLeft: [4.33, 0.98, -0.88],
  headlightRight: [4.33, 0.98, 0.88],
  winchFairlead: [4.44, 0.58, 0],
  sleeperBunk: [-0.42, 1.7, 0],
} as const;

/** The kingpin in vehicle-group space (nose +Z): the P4 socket. */
export const PRIME_KINGPIN_GROUP = { lx: 0, lz: -2.35, y: 1.28 } as const;

export const PRIME_BASE_MASS_KG = 11250; // PRD armored datum (kerb 8,950 + 2,300)
export const PRIME_FUEL_KG = 808; // 950 L diesel at 0.85 kg/L

/** Tuned DD16 torque (PRD): the 2,780 Nm plateau across the
 *  working band, and 2,373 Nm at 1,800 rpm — 447 kW, the 600 hp
 *  mark — with the governor at 2,100. */
export const PRIME_TORQUE: [number, number][] = [
  [650, 1350], [800, 2050], [975, 2560], [1100, 2780], [1300, 2780],
  [1500, 2690], [1700, 2480], [1800, 2373], [1900, 2240], [2000, 2130],
  [2100, 1980],
];

export const PRIME_PARAMS: CarParams = {
  massKg: PRIME_BASE_MASS_KG + DRIVER_KG + PRIME_FUEL_KG,
  torqueCurve: PRIME_TORQUE,
  idleRpm: 650,
  redlineRpm: 2100,
  // The PRD's 18-speed box, geometric between its published end
  // ratios [14.40 ... 0.73]; with the 4.10 axle the top gear runs
  // out of revs at ~142 km/h — a Class-8 top speed is a gearing
  // fact, and this one is stately by construction.
  gears: [
    14.4, 12.08, 10.14, 8.51, 7.14, 5.99, 5.03, 4.22, 3.54, 2.97,
    2.49, 2.09, 1.75, 1.47, 1.24, 1.04, 0.87, 0.73,
  ],
  finalDrive: 4.1,
  tireMu: 0.85, // commercial drive rubber, not a sport compound
  rearLoadFrac: 0.6, // bobtail tractor: the tandem carries most of it
  wheelRadiusM: 0.538, // 315/80R22.5 carcass radius (build anchor table)
  dragK: 5.2, // lumped term for a barn-door cab (Ian's sanctioned
  // model) — under the gearing cap, so the cap sets the top speed
  rollingCoef: 0.012,
  drivetrainEff: 0.92, // PRD driveline efficiency
  lifted: false,
};

/**
 * Spawn: the Prime's marked pad on the airbase apron, east of the
 * Seahawk pad on the same graded line. The pad (airbaseSite.ts,
 * 13 x 6.8 m) swallows the clean-sheet truck's 8.94 x 2.62 m
 * footprint (3.14 over mirrors) with swing room to spare, and its
 * neighbours are unchanged — the spawn does not move.
 */
export const PRIME_SPAWN: SpawnDef = {
  id: 'nomad_prime',
  poi: FLEET_HOME_POI,
  ...padSpawn('pad_prime'),
};
