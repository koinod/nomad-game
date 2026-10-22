import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { carParams, torqueAt, type CarParams } from './carSpec';
import { GT500_PARAMS } from './gt500Def';
import { PRIME_PARAMS } from './primeDef';
import { SPRINTER_PARAMS } from './sprinterDef';
import { darkHorseParams } from './darkhorseDef';
import { BETA_COLS, BETA_ROWS, buildBetaRapierHeightfield } from './betaTerrain';
import type { Vehicle } from './Vehicles';

export type RapierHeightfield = ReturnType<typeof buildBetaRapierHeightfield>;

/** The Rapier heightfield for the ground, built by sampling a ground
 *  function at the Beta grid's nodes (map integration, 2026-10-21:
 *  the grid is 1120x512 at 1.25 m — betaTerrain.ts is the terrain
 *  truth; the LIVE world never uses this sampler path, it passes
 *  buildBetaRapierHeightfield()'s verbatim grid into create()).
 *  This generic builder remains for tests that probe Rapier's layout
 *  against synthetic grounds. One source of truth — the physics
 *  surface and the rendered terrain mesh are the same field.
 *
 *  LAYOUT WARNING (probed twice, 2026-10-21): Rapier's heightfield
 *  swaps its subdivision arguments relative to the world axes — the
 *  node count along X is governed by the SECOND subdivision argument,
 *  and node (ix, iz) lives at flat index ix*(rows+1)+iz. The pre-fix
 *  construction silently gave the physics a transposed, wrong-density
 *  projection of the island: every flat-ground test passed on it (a
 *  constant field is transpose-invariant), and it is a root cause of
 *  the playtest's falls-through-floor / floats-on-thin-air. The
 *  groundTruth tests raycast-probe this layout so it cannot regress
 *  silently again. */
export function buildRapierHeightfield(
  groundY: (x: number, z: number) => number,
  cols: number = BETA_COLS,
  rows: number = BETA_ROWS,
  xMin = -700,
  xMax = 700,
  zMin = -320,
  zMax = 320,
): RapierHeightfield {
  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let ix = 0; ix <= cols; ix++) {
    for (let iz = 0; iz <= rows; iz++) {
      const x = xMin + (ix / cols) * (xMax - xMin);
      const z = zMin + (iz / rows) * (zMax - zMin);
      heights[ix * (rows + 1) + iz] = groundY(x, z);
    }
  }
  // Rapier: nsubdivx counts the Z nodes, nsubdivz counts the X nodes
  return {
    heights, nsubdivx: rows, nsubdivz: cols,
    scale: { x: xMax - xMin, y: 1, z: zMax - zMin },
  };
}

/**
 * CarPhysics — rigid-body driving (Piece 3). One live body, bound to
 * the vehicle being driven (spawnCar rebinds it); parameters and
 * chassis geometry are per-def — carSpec builds the Stallion's from
 * its upgrade state, gt500Def carries the Shelby's period spec.
 *
 * Rapier DynamicRayCastVehicleController: raycast suspension per wheel,
 * engine force from the carSpec torque curve through real gearing,
 * traction capped by tire mu at the driven (rear) axle, weight transfer
 * emergent from the rigid body. Resistance is Ian's sanctioned simple
 * term only — lumped quadratic drag + rolling resistance, applied as a
 * force; there is no aero model.
 *
 * If the Rapier WASM ever fails to initialize, a kinematic fallback
 * integrates the SAME carSpec longitudinal math over the terrain
 * heightfield — the car still drives honestly, just without a rigid
 * body. (Fallback exists so a WASM failure can never brick the game;
 * it is not the old arcade model.)
 */

export interface DriveInput {
  throttle: number; // -1..1 (S..W)
  steer: number; // -1..1 (A..D; +1 = right)
  handbrake: boolean;
  hasFuel: boolean;
}

/**
 * VEHICLE COLLISION — DELETED (Ian's order, 2026-10-21: "delete
 * collision logic for now, it's not working properly, COMPLETE
 * DELETION"). This module used to take a CarPhysicsEvents.onImpact
 * callback (velocity-spike crash detection) and a set of building
 * colliders the chassis smashed into; Game answered impacts with
 * condition loss, blown tires, crash noise and hitstop. All of it is
 * gone: vehicles drive on the terrain heightfield + the raycast
 * suspension model only, and nothing in the game damages a vehicle
 * for hitting the world. The chassis body remains — the vehicle
 * controller needs a rigid body — but the world holds no building/
 * prop colliders for it to hit. Player-vs-world collision lives in
 * Game/Colliders and is untouched; husk rams are proximity combat in
 * Game.updateDriving, never physics collision, and are untouched.
 */

const WHEEL_X = 0.8; // half track
const WHEEL_Z = 1.359; // half wheelbase (S650: 2718 mm)
const REST_LEN = 0.32;
const MAX_STEER = 0.55; // rad at standstill, tapering with speed

/** Sea level — mirrors WORLD.waterY. */
export const WATER_Y = 0;

export interface WaterState {
  /** Water depth over the seabed (0 on dry land). */
  depth: number;
  /** 0..1 — how much of the body is under the waterline. */
  submerged: number;
  /** Deep enough to float in (wheels off the bottom at the float line). */
  floats: boolean;
  /** Group-origin y the car settles at when floating. */
  floatGroupY: number;
  /** Water over the intake line — the engine is dead. */
  stalled: boolean;
}

/** Water as a physical medium, computed honestly from the seabed (the
 *  ground field — the same value the wheels stand on) and the car's
 *  ground-plane origin. Pure: the steppers apply it, tests pin it.
 *  The float line puts the water at the door sills (group y −0.43 for
 *  these cars) with the keel ~0.38 under — a car floats low and
 *  heavy, it does not bob like a boat. */
export function waterStateAt(seabedY: number, groupY: number): WaterState {
  const depth = Math.max(0, WATER_Y - seabedY);
  const keelY = groupY + 0.05; // sill line above the ground-plane origin
  const submerged = THREE.MathUtils.clamp((WATER_Y - keelY) / 0.75, 0, 1);
  const floats = depth > 0.85;
  return {
    depth,
    submerged,
    floats,
    floatGroupY: floats ? WATER_Y - 0.43 : seabedY,
    stalled: submerged > 0.75,
  };
}

/** Chassis geometry per def: collider half extents + wheel connection
 *  points (chassis space). The Mustang's values are the originals —
 *  its measured behavior does not move. Unknown defs use them too. */
interface ChassisGeom {
  half: [number, number, number];
  wheelX: number;
  wheelZ: number;
}
const CHASSIS_GEOM: Record<string, ChassisGeom> = {
  mustang: { half: [0.82, 0.3, 2.22], wheelX: WHEEL_X, wheelZ: WHEEL_Z },
  // S197: 1.88 m wide, 4.77 m long, 2.71 m wheelbase, ~1.58 m track
  gt500: { half: [0.94, 0.32, 2.39], wheelX: 0.79, wheelZ: 1.355 },
  // Class-8 tractor (clean-sheet, 2026-10-22): 2.62 m wide, 8.94 m
  // long, 6.32 m wheelbase. Physics stays 4-corner: steer axle at
  // +3.80 and the tandem centroid at -2.52 in model space ->
  // symmetric half-wheelbase 3.16 about the group origin. The one
  // physics track averages the steer's 1.100 half-track and the
  // dual pair's centroid (1.100 + 0.765) / 2 = 0.93 -> 1.02, the
  // Dark Horse averaging pattern.
  nomad_prime: { half: [1.31, 0.45, 4.47], wheelX: 1.02, wheelZ: 3.16 },
  // Sprinter 170": 2.02 m wide, 6.97 m long, 4.32 m wheelbase
  sprinter_van: { half: [1.01, 0.35, 3.49], wheelX: 0.86, wheelZ: 2.16 },
  // S650 Dark Horse: 1.92 m wide, 4.82 m long, 2.718 m wheelbase
  // (GLB stations ±1.359); track averages the front/rear stations
  // (0.791 / 0.828 half) — one physics track, like the S197.
  dark_horse: { half: [0.96, 0.32, 2.41], wheelX: 0.81, wheelZ: 1.359 },
};
export function geomFor(defId: string): ChassisGeom {
  return CHASSIS_GEOM[defId] ?? CHASSIS_GEOM.mustang;
}

/**
 * Ackermann steering (Item 4, 2026-10-21): the front wheels do NOT turn
 * by the same angle. For a steer angle δ at the front-axle center, the
 * turn center sits on the REAR AXLE line at radius R = L / tan δ; the
 * inner wheel (closer to the center) must steer MORE, the outer less,
 * so both front tires roll around the same center instead of scrubbing
 * in parallel. Returns [wheel0, wheel1] in chassis order — wheel0 sits
 * at x = -wheelX (the car's right side, facing +Z), wheel1 at +wheelX.
 * Pure — geometry tests pin it.
 */
export function ackermannSteer(steer: number, wheelX: number, wheelZ: number): [number, number] {
  if (Math.abs(steer) < 1e-4) return [steer, steer];
  const L = wheelZ * 2;
  const T = wheelX * 2;
  const R = L / Math.tan(Math.abs(steer));
  const inner = Math.atan(L / Math.max(0.6, R - T / 2));
  const outer = Math.atan(L / (R + T / 2));
  const s = Math.sign(steer);
  // steer < 0 = right turn: the inner wheel is the -X side (wheel 0)
  // steer > 0 = left turn: the inner wheel is the +X side (wheel 1)
  return s < 0 ? [s * inner, s * outer] : [s * outer, s * inner];
}

/** Side-friction stiffness, front and rear (Item 4, 2026-10-21).
 *  Swept hard while hunting the yaw pivot (carSteering.test.ts):
 *  a stiffer rear made the powered pivot WORSE, a softer rear held
 *  the powered pivot but walked the gentle-speed pivot forward of
 *  the axle and shrank every radius (compliance oversteer), and
 *  friction-capacity biases and load-split drive torque moved
 *  nothing at all. The pivot is held on the rear axle line by the
 *  Ackermann geometry itself in the constant-speed regime (within
 *  ~0.02 m at 7/15/24 m/s), so the split ships NEUTRAL — both axles
 *  at the pre-wave shared value. Under sustained half-throttle at
 *  25 m/s the pivot still falls ~0.7 m behind the axle (power
 *  saturation in the raycast tire model) — bounded, documented in
 *  the steering tests, and never near the body center. */
export const SIDE_FRICTION_FRONT = 0.9;
export const SIDE_FRICTION_REAR = 0.9;

/** Per-def suspension tune (Item 3, 2026-10-21). Until this wave
 *  every car ran one hardcoded stiffness (32), NO damping was ever
 *  set, and travel was a shared 0.28 — the GT500 (heavier, lower,
 *  period geometry) bottomed out through its whole travel on a 3 m
 *  drop and its wheels visually rose past the fender arches.
 *
 *  archTravelM is the body's own datum: how far a wheel may rise
 *  (suspension length below rest) before its top passes the arch
 *  lip; archTopM is the arch lip's height over the ground plane.
 *  The visual clamp and the geometry test both read these numbers.
 *  Mustang damping stays UNSET (Rapier defaults) — its measured
 *  behavior was Ian-approved and does not move; the GT500 gets a
 *  full explicit tune for its mass and geometry. */
export interface SuspTune {
  stiffness: number;
  compression?: number;
  relaxation?: number;
  travel: number;
  archTravelM: number;
  archTopM: number;
  /** Rapier's per-wheel max suspension force. The engine DEFAULT
   *  silently caps at ~car mass per wheel (measured: a 2,200 kg
   *  vehicle settles, a 2,600 kg one collapses to its travel floor
   *  at ANY stiffness) — the cars never reach it, so they keep the
   *  default and their tuned behavior is untouched. Heavy defs set
   *  it explicitly: ~3x the static corner load, so landings can
   *  still spike and bottom like the cars do. */
  maxForceN?: number;
}
export const SUSP_TUNES: Record<string, SuspTune> = {
  mustang: { stiffness: 32, travel: 0.28, archTravelM: 0.18, archTopM: 0.87 },
  gt500: { stiffness: 46, compression: 4.5, relaxation: 6.5, travel: 0.24, archTravelM: 0.17, archTopM: 0.86 },
  // Class-8 air-ride class tune, scaled to the clean-sheet truck's
  // 12.1 t crewed mass (stiffness and force cap x 12,133/9,833 off
  // the retired 9.8 t tune, so the laden stance does not move).
  // Travel long, but the arch clamp stays tight — the steer arch
  // lip (ArchLip nodes, measured from the new GLB) tops at 1.17 m
  // and a 1.076 m wheel may rise only 0.09 m before its top would
  // pass it.
  nomad_prime: { stiffness: 136, compression: 7, relaxation: 9, travel: 0.3, archTravelM: 0.09, archTopM: 1.17, maxForceN: 88000 },
  // Lifted 4x4 van: softer, longer travel; flare lip re-measured at
  // 1.020 m on the polished GLB (c9071da) over a 0.88 m wheel
  // (0.44R tires) -> 0.14 m of visual tuck.
  sprinter_van: { stiffness: 60, compression: 5, relaxation: 7, travel: 0.26, archTravelM: 0.14, archTopM: 1.02, maxForceN: 26000 },
  // Dark Horse: Track-Pack-class tune on the GT500's pattern — stiff
  // springs for a 1,915 kg (Stage 0, crewed) sports coupe. The arch
  // invariant holds for the STOCK rolling set (2×0.345 + 0.17 =
  // 0.86 ≤ 0.87); the Stage 2 MT set overlapping the stock arches
  // is a documented build residual (lift is game-side), not pinned.
  dark_horse: { stiffness: 48, compression: 4.5, relaxation: 6.5, travel: 0.24, archTravelM: 0.17, archTopM: 0.87 },
};
export function suspTuneFor(defId: string): SuspTune {
  return SUSP_TUNES[defId] ?? SUSP_TUNES.mustang;
}

/** The wheel-visual clamp (Item 3b): a wheel may tuck INTO its arch
 *  at full compression but must never render above it. Suspension
 *  length below rest by more than the arch allows is clamped for
 *  the visual; droop is clamped at full travel. Pure — tests pin it. */
export function clampSuspensionVisual(len: number, rest: number, tune: SuspTune): number {
  return THREE.MathUtils.clamp(len, rest - tune.archTravelM, rest + tune.travel);
}

/** Physics parameters per def. The Stallion derives from its upgrade
 *  build state (carSpec). The GT500 runs its fixed period spec —
 *  cargo is real mass on top; the upgrade tree's carSpec deltas are
 *  Coyote-build tuning and do not transfer to the Shelby. */
export function paramsForDef(defId: string, upgrades: readonly string[], cargoKg: number): CarParams {
  if (defId === 'gt500') {
    return { ...GT500_PARAMS, massKg: GT500_PARAMS.massKg + Math.max(0, cargoKg) };
  }
  // The fleet diesels run their fixed spec sheets (primeDef /
  // sprinterDef) — the Stallion upgrade tree's carSpec deltas do not
  // transfer; cargo is real mass on top, same as the Shelby.
  if (defId === 'nomad_prime') {
    return { ...PRIME_PARAMS, massKg: PRIME_PARAMS.massKg + Math.max(0, cargoKg) };
  }
  if (defId === 'sprinter_van') {
    return { ...SPRINTER_PARAMS, massKg: SPRINTER_PARAMS.massKg + Math.max(0, cargoKg) };
  }
  // The Dark Horse derives from its STAGE tiers (darkhorseDef):
  // dh_stage1 / dh_stage2 move mass, torque, radius, grip for real;
  // the FX upgrade tree does not restamp it (fleet ruling).
  if (defId === 'dark_horse') {
    return darkHorseParams(upgrades, cargoKg);
  }
  return carParams(upgrades, cargoKg);
}

export class CarPhysics {
  private rapier: typeof RAPIER | null = null;
  private world: RAPIER.World | null = null;
  private body: RAPIER.RigidBody | null = null;
  private chassisCollider: RAPIER.Collider | null = null;
  private controller: RAPIER.DynamicRayCastVehicleController | null = null;
  private defId = 'mustang'; // def the live body is bound to
  private geom: ChassisGeom = CHASSIS_GEOM.mustang;
  private params: CarParams = carParams([]);
  private fallback = false;

  // shared state (both modes)
  speed = 0; // signed m/s along the car's forward
  steerAngle = 0;
  /** Powertrain state, refreshed every step in BOTH modes — the
   *  audio engine's engine voice reads these (rpm/gear were computed
   *  inside gearAndForce/stepKinematic and thrown away before the
   *  audio pass asked for them). */
  rpm = 0;
  gear = 0;
  throttleLoad = 0; // 0..1, |throttle| after fuel/stall gating
  get idleRpm(): number { return this.params.idleRpm; }
  get redlineRpm(): number { return this.params.redlineRpm; }
  /** Per-wheel front steer angles after Ackermann (visuals + tests). */
  steerWheels: [number, number] = [0, 0];
  /** Water interaction state, refreshed every step (Item 2). */
  submerged = 0;
  stalled = false;
  /** Unclamped suspension lengths (m) from the controller — physics
   *  truth for tests/diagnostics; Vehicle.suspension is the clamped
   *  visual value. */
  rawSuspension: [number, number, number, number] = [0.32, 0.32, 0.32, 0.32];
  private spin = 0;
  // kinematic fallback state
  private kinGear = 0;
  private shiftT = 0;

  private constructor() {}

  static async create(
    groundY: (x: number, z: number) => number,
    heightfield?: RapierHeightfield,
  ): Promise<CarPhysics> {
    const cp = new CarPhysics();
    try {
      await RAPIER.init();
      cp.rapier = RAPIER;
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = 1 / 120;
      cp.world = world;
      // terrain heightfield: the Beta grid's nodes, verbatim — the
      // same surface the mesh renders and heightAt samples. The live
      // game passes buildBetaRapierHeightfield() explicitly; tests
      // with synthetic grounds fall back to sampling groundY at the
      // grid's nodes via the generic builder.
      const hf = heightfield ?? buildRapierHeightfield(groundY);
      const ground = RAPIER.ColliderDesc.heightfield(
        hf.nsubdivx, hf.nsubdivz, hf.heights,
        new RAPIER.Vector3(hf.scale?.x ?? 1400, hf.scale?.y ?? 1, hf.scale?.z ?? 640),
      );
      ground.setFriction(0.15);
      world.createCollider(ground);
      // seabed safety slab: the heightfield ends at the island rect,
      // but the sea (and a car in it) does not — a floor under the
      // field's own minimum spans the whole water plane so nothing
      // can fall out of the world past the map edge. Its depth is
      // DERIVED from the field it guards (map integration, 2026-10-21:
      // the Beta seabed runs to -13.5 m off the east shore and the
      // dredged channel cuts to -4.2 — the old hard-coded -1.88 slab
      // would have floored both). Slab top sits 0.2 below the deepest
      // node, so it never touches on-field physics.
      let fieldMin = Infinity;
      for (const h of hf.heights) if (h < fieldMin) fieldMin = h;
      const seabed = RAPIER.ColliderDesc.cuboid(2100, 0.1, 1200)
        .setTranslation(0, fieldMin - 0.3, 0)
        .setFriction(0.3);
      world.createCollider(seabed);
      // NO building/prop colliders are created — vehicle collision is
      // deleted (see the note at CarPhysicsEvents' grave above)
    } catch (err) {
      console.warn('[CarPhysics] Rapier unavailable, kinematic fallback:', err);
      cp.fallback = true;
      cp.world = null;
    }
    return cp;
  }

  get isRigidBody(): boolean {
    return !this.fallback && !!this.body;
  }

  /** Def the live body is currently bound to (spawnCar rebinds it). */
  get boundDefId(): string {
    return this.defId;
  }

  /** (Re)build the chassis for the vehicle at its current transform. */
  spawnCar(v: Vehicle, upgrades: readonly string[], cargoKg: number): void {
    this.defId = v.def.id;
    this.params = paramsForDef(v.def.id, upgrades, cargoKg);
    if (this.fallback || !this.world || !this.rapier) return;
    const R = this.rapier;
    if (this.body) {
      this.world.removeRigidBody(this.body);
      this.body = null;
      this.controller = null;
    }
    const pos = v.group.position;
    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y + 0.55, pos.z)
      .setRotation(new R.Quaternion(0, Math.sin(v.heading / 2), 0, Math.cos(v.heading / 2)))
      .setLinearDamping(0.0)
      .setAngularDamping(0.9)
      .setCcdEnabled(true)
      .setCanSleep(true);
    this.body = this.world.createRigidBody(bodyDesc);
    const geom = geomFor(v.def.id);
    this.geom = geom;
    const colDesc = R.ColliderDesc.cuboid(geom.half[0], geom.half[1], geom.half[2])
      .setTranslation(0, 0, 0)
      .setMass(this.params.massKg)
      .setFriction(0.3)
      .setRestitution(0.05);
    this.chassisCollider = this.world.createCollider(colDesc, this.body);
    const ctrl = this.world.createVehicleController(this.body);
    // wheels: FL, FR, RL, RR — connection points in chassis space
    const pts: [number, number, number][] = [
      [-geom.wheelX, 0.02, geom.wheelZ], [geom.wheelX, 0.02, geom.wheelZ],
      [-geom.wheelX, 0.02, -geom.wheelZ], [geom.wheelX, 0.02, -geom.wheelZ],
    ];
    for (const [x, y, z] of pts) {
      ctrl.addWheel(
        new R.Vector3(x, y, z),
        new R.Vector3(0, -1, 0),
        new R.Vector3(-1, 0, 0),
        REST_LEN,
        this.params.wheelRadiusM,
      );
    }
    const tune = suspTuneFor(this.defId);
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelSuspensionStiffness(i, tune.stiffness);
      if (tune.compression !== undefined) ctrl.setWheelSuspensionCompression(i, tune.compression);
      if (tune.relaxation !== undefined) ctrl.setWheelSuspensionRelaxation(i, tune.relaxation);
      if (tune.maxForceN !== undefined) ctrl.setWheelMaxSuspensionForce(i, tune.maxForceN);
      ctrl.setWheelMaxSuspensionTravel(i, tune.travel);
      ctrl.setWheelFrictionSlip(i, this.params.tireMu * this.gripScale * 4.0);
      ctrl.setWheelSideFrictionStiffness(i, i >= 2 ? SIDE_FRICTION_REAR : SIDE_FRICTION_FRONT);
    }
    this.controller = ctrl;
  }

  /** Upgrade/cargo changes re-derive mass + tire grip on the live body.
   *  When defId is given, the call applies only if the live body is
   *  bound to that def (a parked car's build change must not restamp
   *  the car being driven). */
  setBuild(upgrades: readonly string[], cargoKg: number, defId?: string): void {
    if (defId !== undefined && defId !== this.defId) return;
    this.params = paramsForDef(this.defId, upgrades, cargoKg);
    if (this.chassisCollider) this.chassisCollider.setMass(this.params.massKg);
    if (this.controller) {
      for (let i = 0; i < 4; i++) {
        this.controller.setWheelFrictionSlip(i, this.params.tireMu * this.gripScale * 4.0);
        // the lift kit is geometry, not a stat: longer rest length,
        // softer springs — clearance you can see, roll you can feel
        this.controller.setWheelSuspensionRestLength(i, this.restLen());
        this.controller.setWheelSuspensionStiffness(i, this.params.lifted ? 26 : suspTuneFor(this.defId).stiffness);
      }
    }
  }

  private gripScale = 1;

  /** Weather's grip vote: 1 = dry, ~0.65 = soaked (WeatherSystem's
   *  gripFactor). Multiplies the tire compound's mu everywhere the
   *  sim uses it — rigid body and kinematic fallback alike. */
  setGripScale(scale: number): void {
    this.gripScale = Math.max(0.3, Math.min(1, scale));
    if (this.controller) {
      for (let i = 0; i < 4; i++) {
        this.controller.setWheelFrictionSlip(i, this.params.tireMu * this.gripScale * 4.0);
      }
    }
  }

  private restLen(): number {
    return this.params.lifted ? 0.44 : REST_LEN;
  }

  teleport(v: Vehicle): void {
    if (!this.body) return;
    this.body.setTranslation({ x: v.group.position.x, y: v.group.position.y + 0.55, z: v.group.position.z }, true);
    this.body.setRotation(new (this.rapier!).Quaternion(0, Math.sin(v.heading / 2), 0, Math.cos(v.heading / 2)), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.speed = 0;
  }

  wake(): void {
    this.body?.wakeUp();
  }

  /** Move the car to (x, z) keeping its forward speed — runway wraps in
   *  tests and stuck-recovery in game. */
  repositionKeepVelocity(v: Vehicle, x: number, z: number): void {
    if (!this.body) {
      v.group.position.x = x;
      v.group.position.z = z;
      return;
    }
    const t = this.body.translation();
    this.body.setTranslation({ x, y: t.y, z }, true);
    const rot = this.body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    this.body.setLinvel({ x: fwd.x * this.speed, y: 0, z: fwd.z * this.speed }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.group.position.x = x;
    v.group.position.z = z;
  }

  /** Engine force (N at the contact patch) for the driven rear wheels,
   *  from the torque curve at the current wheel speed + selected gear. */
  private gearState = 0;

  private gearAndForce(throttle: number): { force: number; rpm: number; gear: number } {
    const p = this.params;
    const circ = 2 * Math.PI * p.wheelRadiusM;
    const v = Math.abs(this.speed);
    // persistent gear with hysteresis — a fresh scan each frame hunts at
    // shift boundaries and would re-trigger the shift cut forever
    let gear = this.gearState;
    const rpmIn = (g: number) => ((v / circ) * p.gears[g] * p.finalDrive) * 60;
    while (gear < p.gears.length - 1 && rpmIn(gear) > p.redlineRpm) gear++;
    while (gear > 0 && rpmIn(gear) < 1500) gear--;
    if (this.speed < -0.1) gear = 0; // reverse uses 1st
    // a shift is a real event: drive force cuts for 0.25 s (same in the
    // estimator — the displayed numbers and the body agree)
    if (gear > this.gearState && throttle > 0.1 && this.speed > 2 && this.shiftT <= 0) {
      this.shiftT = 0.25;
    }
    this.gearState = gear;
    let rpm = ((v / circ) * p.gears[gear] * p.finalDrive) * 60;
    rpm = Math.max(p.idleRpm, Math.min(rpm, p.redlineRpm + 400));
    const tq = torqueAt(p.torqueCurve, rpm);
    const wheelTq = tq * p.gears[gear] * p.finalDrive * p.drivetrainEff;
    const cut = this.shiftT > 0 ? 0 : 1;
    return { force: (wheelTq / p.wheelRadiusM) * throttle * cut, rpm, gear };
  }

  step(dt: number, input: DriveInput, v: Vehicle, groundY: (x: number, z: number) => number): void {
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.fallback || !this.world || !this.body || !this.controller) {
      this.stepKinematic(dt, input, v, groundY);
      return;
    }
    const ctrl = this.controller;
    const body = this.body;
    const p = this.params;

    // current forward speed from the body itself
    const lv = body.linvel();
    const rot = body.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    this.speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;

    // steering: angle tapers with speed; input +1 (right) = negative steer
    const speedTaper = 1 / (1 + Math.abs(this.speed) * 0.055);
    const steerTarget = -input.steer * MAX_STEER * speedTaper;
    const rate = 2.8 * dt;
    this.steerAngle += THREE.MathUtils.clamp(steerTarget - this.steerAngle, -rate, rate);
    // true Ackermann: inner front wheel steers more than the outer
    const [steer0, steer1] = ackermannSteer(this.steerAngle, this.geom.wheelX, this.geom.wheelZ);
    ctrl.setWheelSteering(0, steer0);
    ctrl.setWheelSteering(1, steer1);
    this.steerWheels = [steer0, steer1];

    // water state for this step: the seabed under the car is the
    // ground field itself; a drowned engine makes no force
    const tNow = body.translation();
    const wsNow = waterStateAt(groundY(tNow.x, tNow.z), tNow.y - 0.55);
    this.submerged = wsNow.submerged;
    this.stalled = wsNow.stalled;
    body.setAngularDamping(wsNow.submerged > 0.25 ? 2.2 : 0.9);

    const th = input.hasFuel && !this.stalled ? input.throttle : 0;
    const { force, rpm, gear } = this.gearAndForce(th);
    this.rpm = rpm;
    this.gear = gear;
    this.throttleLoad = Math.abs(th);
    const braking = (th < 0 && this.speed >= 0.5) || (th > 0 && this.speed < -0.5);
    for (let i = 0; i < 4; i++) {
      const driven = i >= 2;
      ctrl.setWheelEngineForce(i, driven ? (braking ? 0 : force / 2) : 0);
      let brake = 0;
      if (braking) brake = 26000;
      if (input.handbrake && i >= 2) brake = 30000;
      ctrl.setWheelBrake(i, brake);
    }

    // resistance: the simple sanctioned terms, as a central force
    const dragF = p.dragK * this.speed * Math.abs(this.speed);
    const rollF = p.rollingCoef * p.massKg * 9.81 * Math.tanh(this.speed * 2);
    body.resetForces(true);
    body.addForce({ x: -fwd.x * (dragF + rollF), y: 0, z: -fwd.z * (dragF + rollF) }, true);

    // WATER (Item 2): hydrodynamic drag on any submerged motion, and
    // buoyancy-lite where the water is deep enough to float in — a PD
    // spring on the keel's submergence that settles at the float line
    // instead of the car sinking to the seabed like a stone.
    if (wsNow.submerged > 0) {
      const dampK = 2.2 * wsNow.submerged; // 1/s viscous coefficient
      body.addForce({ x: -lv.x * p.massKg * dampK, y: 0, z: -lv.z * p.massKg * dampK }, true);
      if (wsNow.floats) {
        const keelDepth = Math.max(0, WATER_Y - (tNow.y - 0.55 + 0.05));
        const buoyAccel = THREE.MathUtils.clamp(keelDepth * 26 - lv.y * 3.0, 0, 16);
        body.addForce({ x: 0, y: buoyAccel * p.massKg, z: 0 }, true);
      }
    }

    // DIRECTIONAL STABILITY (Item 4b, 2026-10-21): the raycast
    // controller models no caster, so it has NO self-aligning torque:
    // on real terrain every crest and facet adds a small random
    // heading increment that never decays, and the car random-walks
    // off its line with the wheel untouched (measured on the island
    // field at cruise: +10 deg of heading and 5.3 m of lateral drift
    // over ~130 m). A real car's tires self-center through trail and
    // caster — the aligning moment pulls the nose toward the
    // velocity vector. Emulate that moment, NOT a driver: only when
    // the driver is not steering, apply a yaw torque proportional to
    // the sideslip angle. It cannot fight an input (it switches off
    // the moment steer is applied) and it does not touch the cornering
    // geometry measured in carSteering.test.ts.
    if (Math.abs(input.steer) < 0.05 && Math.abs(this.steerAngle) < 0.03 && this.speed > 3) {
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const latV = lv.x * right.x + lv.z * right.z;
      const fwdV = lv.x * fwd.x + lv.z * fwd.z;
      if (fwdV > 3) {
        const beta = Math.atan2(latV, fwdV); // sideslip: velocity vs nose
        const tq = THREE.MathUtils.clamp(
          -beta * p.massKg * 4.0 * Math.min(1, fwdV / 12),
          -p.massKg * 3, p.massKg * 3,
        );
        body.addTorque({ x: 0, y: tq, z: 0 }, true);
      }
    }

    // two physics substeps per frame step
    const sub = 2;
    for (let s = 0; s < sub; s++) {
      ctrl.updateVehicle(dt / sub);
      this.world.step();
    }

    this.syncVisual(dt, v);
  }

  /** Parked: hold the car still (handbrake) without a driver. */
  parkBrake(): void {
    if (!this.controller || !this.world) return;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelEngineForce(i, 0);
      this.controller.setWheelBrake(i, 30000);
    }
    this.controller.updateVehicle(1 / 60);
    this.world.step();
  }

  private syncVisual(dt: number, v: Vehicle): void {
    if (!this.body || !this.controller) return;
    const t = this.body.translation();
    const r = this.body.rotation();
    // body origin rides 0.55 above the group origin (ground plane)
    v.group.position.set(t.x, t.y - 0.55, t.z);
    v.group.quaternion.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.group.quaternion);
    v.heading = Math.atan2(fwd.x, fwd.z);
    const lv = this.body.linvel();
    this.speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;
    v.speed = this.speed;
    this.spin += (this.speed / this.params.wheelRadiusM) * dt;
    v.steerVis = this.steerAngle;
    v.steerVisWheels = this.steerWheels;
    v.wheelSpinAngle = this.spin;
    const tune = suspTuneFor(this.defId);
    for (let i = 0; i < 4; i++) {
      const len = this.controller.wheelSuspensionLength(i) ?? this.restLen();
      this.rawSuspension[i] = len;
      // the VISUAL length is clamped to the arch (Item 3b): the body
      // may bottom out in physics, but the rendered wheel tucks into
      // the well and never pokes through the fender
      v.suspension[i] = clampSuspensionVisual(len, this.restLen(), tune);
    }
    v.suspRest = this.restLen();
  }

  // ------------------------------------------------------------ fallback
  private stepKinematic(dt: number, input: DriveInput, v: Vehicle, groundY: (x: number, z: number) => number): void {
    const p = this.params;
    const th = input.hasFuel && !this.stalled ? input.throttle : 0;
    // reuse the 1-D longitudinal math (same as estimatePerformance)
    const circ = 2 * Math.PI * p.wheelRadiusM;
    const spd = Math.abs(this.speed);
    let gear = this.kinGear;
    let rpm = ((spd / circ) * p.gears[gear] * p.finalDrive) * 60;
    if (rpm > p.redlineRpm && gear < p.gears.length - 1 && th > 0) gear++;
    if (rpm < 1400 && gear > 0) gear--;
    this.kinGear = gear;
    rpm = Math.max(p.idleRpm, ((spd / circ) * p.gears[gear] * p.finalDrive) * 60);
    this.rpm = rpm;
    this.gear = gear;
    this.throttleLoad = Math.abs(th);
    const tq = torqueAt(p.torqueCurve, Math.min(rpm, p.redlineRpm));
    let force = ((tq * p.gears[gear] * p.finalDrive * p.drivetrainEff) / p.wheelRadiusM) * th;
    const transfer = (p.massKg * Math.abs(force) / p.massKg * 0.52) / 2.718;
    const tractionMax = p.tireMu * this.gripScale * (p.massKg * 9.81 * p.rearLoadFrac + transfer);
    force = THREE.MathUtils.clamp(force, -tractionMax, tractionMax);
    if (th < 0 && this.speed > 0.5) force = -22000 / Math.max(1, 1); // braking
    const resist = p.dragK * this.speed * Math.abs(this.speed)
      + p.rollingCoef * p.massKg * 9.81 * Math.tanh(this.speed * 2);
    const a = (force - resist) / p.massKg;
    this.speed += a * dt;
    // water drag, same medium as the rigid path
    if (this.submerged > 0) this.speed -= this.speed * Math.min(1, 2.0 * this.submerged * dt);
    if (th === 0 && Math.abs(this.speed) < 0.2) this.speed = 0;
    this.speed = Math.max(-13, this.speed);
    // bicycle yaw
    const steerTarget = -input.steer * MAX_STEER * (1 / (1 + Math.abs(this.speed) * 0.055));
    this.steerAngle += THREE.MathUtils.clamp(steerTarget - this.steerAngle, -2.8 * dt, 2.8 * dt);
    const yawRate = (this.speed / 2.718) * Math.tan(-this.steerAngle);
    v.heading += yawRate * dt;
    const pos = v.group.position;
    pos.x += Math.sin(v.heading) * this.speed * dt;
    pos.z += Math.cos(v.heading) * this.speed * dt;
    // the seabed is the floor in shallow water; in deep water the
    // hull floats at the sill line instead of resting on the bottom
    const seabed = groundY(pos.x, pos.z);
    const ws = waterStateAt(seabed, pos.y);
    this.submerged = ws.submerged;
    this.stalled = ws.stalled;
    pos.y = ws.floats ? Math.max(seabed, ws.floatGroupY) : seabed;
    v.group.rotation.set(0, v.heading, 0);
    v.speed = this.speed;
    this.spin += (this.speed / p.wheelRadiusM) * dt;
    v.wheelSpinAngle = this.spin;
    v.steerVis = this.steerAngle;
    v.steerVisWheels = ackermannSteer(this.steerAngle, this.geom.wheelX, this.geom.wheelZ);
  }
}
