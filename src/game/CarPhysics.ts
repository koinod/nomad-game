import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { carParams, torqueAt, type CarParams } from './carSpec';
import type { Vehicle } from './Vehicles';
import type { Collider } from './Colliders';

/**
 * CarPhysics — rigid-body driving for the one Mustang (Piece 3).
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

export interface CarPhysicsEvents {
  /** impactSpeed in m/s whenever the chassis takes a hard contact. */
  onImpact: (impactSpeed: number) => void;
}

const WHEEL_X = 0.8; // half track
const WHEEL_Z = 1.359; // half wheelbase (S650: 2718 mm)
const REST_LEN = 0.32;
const MAX_STEER = 0.55; // rad at standstill, tapering with speed

export class CarPhysics {
  private rapier: typeof RAPIER | null = null;
  private world: RAPIER.World | null = null;
  private body: RAPIER.RigidBody | null = null;
  private chassisCollider: RAPIER.Collider | null = null;
  private controller: RAPIER.DynamicRayCastVehicleController | null = null;
  private events: RAPIER.EventQueue | null = null;
  private params: CarParams = carParams([]);
  private fallback = false;

  // shared state (both modes)
  speed = 0; // signed m/s along the car's forward
  steerAngle = 0;
  private spin = 0;
  private prevVel = new THREE.Vector3();
  private impactCooldown = 0;
  // kinematic fallback state
  private kinGear = 0;
  private shiftT = 0;

  private constructor(private ev: CarPhysicsEvents) {}

  static async create(
    ev: CarPhysicsEvents,
    groundY: (x: number, z: number) => number,
    buildingColliders: Collider[],
  ): Promise<CarPhysics> {
    const cp = new CarPhysics(ev);
    try {
      await RAPIER.init();
      cp.rapier = RAPIER;
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.timestep = 1 / 120;
      cp.world = world;
      cp.events = new RAPIER.EventQueue(true);
      // terrain heightfield, sampled from the same heightAt the mesh uses
      const NX = 280;
      const NZ = 128;
      const heights = new Float32Array((NX + 1) * (NZ + 1));
      for (let i = 0; i <= NX; i++) {
        for (let j = 0; j <= NZ; j++) {
          const x = -700 + (i / NX) * 1400;
          const z = -320 + (j / NZ) * 640;
          heights[j * (NX + 1) + i] = groundY(x, z);
        }
      }
      const ground = RAPIER.ColliderDesc.heightfield(
        NX, NZ, heights, new RAPIER.Vector3(1400, 1, 640),
      );
      ground.setFriction(0.15);
      world.createCollider(ground);
      // buildings: fixed cuboids from the kit AABBs
      for (const c of buildingColliders) {
        const cx = (c.x0 + c.x1) / 2;
        const cz = (c.z0 + c.z1) / 2;
        const hw = Math.max(0.1, (c.x1 - c.x0) / 2);
        const hd = Math.max(0.1, (c.z1 - c.z0) / 2);
        const gy = groundY(cx, cz);
        const desc = RAPIER.ColliderDesc.cuboid(hw, 2.2, hd)
          .setTranslation(cx, gy + 2.2, cz)
          .setFriction(0.4);
        world.createCollider(desc);
      }
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

  /** (Re)build the chassis for the vehicle at its current transform. */
  spawnCar(v: Vehicle, upgrades: readonly string[], cargoKg: number): void {
    this.params = carParams(upgrades, cargoKg);
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
    const colDesc = R.ColliderDesc.cuboid(0.82, 0.30, 2.22)
      .setTranslation(0, 0, 0)
      .setMass(this.params.massKg)
      .setFriction(0.3)
      .setRestitution(0.05);
    colDesc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    this.chassisCollider = this.world.createCollider(colDesc, this.body);
    const ctrl = this.world.createVehicleController(this.body);
    // wheels: FL, FR, RL, RR — connection points in chassis space
    const pts: [number, number, number][] = [
      [-WHEEL_X, 0.02, WHEEL_Z], [WHEEL_X, 0.02, WHEEL_Z],
      [-WHEEL_X, 0.02, -WHEEL_Z], [WHEEL_X, 0.02, -WHEEL_Z],
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
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelSuspensionStiffness(i, 32);
      ctrl.setWheelMaxSuspensionTravel(i, 0.28);
      ctrl.setWheelFrictionSlip(i, this.params.tireMu * this.gripScale * 4.0);
      ctrl.setWheelSideFrictionStiffness(i, 0.9);
    }
    this.controller = ctrl;
    this.prevVel.set(0, 0, 0);
  }

  /** Upgrade/cargo changes re-derive mass + tire grip on the live body. */
  setBuild(upgrades: readonly string[], cargoKg: number): void {
    this.params = carParams(upgrades, cargoKg);
    if (this.chassisCollider) this.chassisCollider.setMass(this.params.massKg);
    if (this.controller) {
      for (let i = 0; i < 4; i++) {
        this.controller.setWheelFrictionSlip(i, this.params.tireMu * this.gripScale * 4.0);
        // the lift kit is geometry, not a stat: longer rest length,
        // softer springs — clearance you can see, roll you can feel
        this.controller.setWheelSuspensionRestLength(i, this.restLen());
        this.controller.setWheelSuspensionStiffness(i, this.params.lifted ? 26 : 32);
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
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
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
    ctrl.setWheelSteering(0, this.steerAngle);
    ctrl.setWheelSteering(1, this.steerAngle);

    const th = input.hasFuel ? input.throttle : 0;
    const { force } = this.gearAndForce(th);
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

    // two physics substeps per frame step
    const sub = 2;
    for (let s = 0; s < sub; s++) {
      ctrl.updateVehicle(dt / sub);
      this.world.step(this.events!);
    }

    // impacts: chassis velocity spikes across the step
    const lv2 = body.linvel();
    const dv = Math.hypot(lv2.x - this.prevVel.x, lv2.y - this.prevVel.y, lv2.z - this.prevVel.z);
    this.prevVel.set(lv2.x, lv2.y, lv2.z);
    if (dv > 2.2 && this.impactCooldown <= 0) {
      this.impactCooldown = 0.35;
      this.ev.onImpact(dv);
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
    this.world.step(this.events!);
    if (this.body) {
      const lv = this.body.linvel();
      this.prevVel.set(lv.x, lv.y, lv.z);
    }
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
    v.wheelSpinAngle = this.spin;
    for (let i = 0; i < 4; i++) {
      const len = this.controller.wheelSuspensionLength(i);
      v.suspension[i] = len ?? this.restLen();
    }
    v.suspRest = this.restLen();
  }

  // ------------------------------------------------------------ fallback
  private stepKinematic(dt: number, input: DriveInput, v: Vehicle, groundY: (x: number, z: number) => number): void {
    const p = this.params;
    const th = input.hasFuel ? input.throttle : 0;
    // reuse the 1-D longitudinal math (same as estimatePerformance)
    const circ = 2 * Math.PI * p.wheelRadiusM;
    const spd = Math.abs(this.speed);
    let gear = this.kinGear;
    let rpm = ((spd / circ) * p.gears[gear] * p.finalDrive) * 60;
    if (rpm > p.redlineRpm && gear < p.gears.length - 1 && th > 0) gear++;
    if (rpm < 1400 && gear > 0) gear--;
    this.kinGear = gear;
    rpm = Math.max(p.idleRpm, ((spd / circ) * p.gears[gear] * p.finalDrive) * 60);
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
    pos.y = groundY(pos.x, pos.z);
    v.group.rotation.set(0, v.heading, 0);
    v.speed = this.speed;
    this.spin += (this.speed / p.wheelRadiusM) * dt;
    v.wheelSpinAngle = this.spin;
    v.steerVis = this.steerAngle;
  }
}
