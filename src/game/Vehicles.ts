// Vehicles.ts — the 13-vehicle roster, procedural meshes, arcade driving
// physics (arcade, honest fuel + wear from the spec), enter/exit, ramming.
// VEHICLE RESET (Ian, 2026-10-20): fleet deleted, one Stallion FX remains.

import * as THREE from 'three';
import { clamp } from './rng';
import { resolveCollisions, type Collider } from './Colliders';
import { ITEMS } from '../data/items';
import type { InvItem } from '../store/types';
import {
  accelFactor, collisionLossFactor, ramDamageFactor, sandFactor, topSpeedFactor, wearFactor,
} from '../data/upgrades';
import { buildStallion, applyStallionUpgrades } from './carModels';
import {
  cgHeightM, cornerRoll, effectiveSteerAngle, impactBounce, impactDamage,
  understeerK, vehicleMassKg, weightTransferPitch,
} from './drivePhysics';

export { glassTint } from './modelKit';

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'car';
  length: number;
  width: number;
  fuelMax: number; // L
  burnClass: number;
  topSpeed: number; // m/s
  noiseDrive: number; // meters at speed
  color: number;
  storageKg: number; // trunk / bed / cargo capacity
  /** Collision/wear damage multiplier (default 1; >1 = fragile). */
  armorMul?: number;
}

/** An animated door/ramp on a vehicle or trailer, driven by t 0→1. */
export interface DoorAnim {
  obj: THREE.Object3D;
  kind: 'swing-l' | 'swing-r' | 'slide-up' | 'ramp';
  base: number; // closed rotation.y (swing) / position.y (slide) / rotation.x (ramp)
  t: number;
  target: number;
  travel?: number; // signed open delta (default: swing ±1.85, slide +1.5, ramp +1.15)
}

/** Total weight of a stored item list (engine-side helper). */
export function itemsWeightKg(items: readonly InvItem[]): number {
  let w = 0;
  for (const it of items) w += (ITEMS[it.itemId]?.weight ?? 0) * it.qty;
  return Math.round(w * 10) / 10;
}

/** Animate a list of doors toward their targets (shared by vehicles/trailers). */
export function stepDoors(doors: DoorAnim[], dt: number): void {
  for (const d of doors) {
    if (Math.abs(d.t - d.target) < 0.001) { d.t = d.target; }
    else d.t += Math.sign(d.target - d.t) * Math.min(Math.abs(d.target - d.t), dt * 1.6);
    if (d.kind === 'swing-l') d.obj.rotation.y = d.base - d.t * (d.travel ?? 1.85);
    else if (d.kind === 'swing-r') d.obj.rotation.y = d.base + d.t * (d.travel ?? 1.85);
    else if (d.kind === 'slide-up') d.obj.position.y = d.base + d.t * (d.travel ?? 1.5);
    else d.obj.rotation.x = d.base + d.t * (d.travel ?? 1.15); // ramp folds down
  }
}

export const VEHICLE_DEFS: VehicleDef[] = [
  // THE car. FX Package spec (design-refs/stallion): Adriatic teal, white
  // rally wheels, glass roof. Real S650 figures land with the rigid-body
  // build (1769 kg, ~500 hp, 267 km/h); topSpeed is the interim cap.
  { id: 'mustang', name: 'Stallion FX', kind: 'car', length: 4.79, width: 1.92, fuelMax: 61, burnClass: 1.1, topSpeed: 42, noiseDrive: 55, color: 0x0d9488, storageKg: 45 },
];

/** Semi tractor paint rotation — the Stitch charcoal leads, fleets vary. */
export interface Vehicle {
  uid: string;
  def: VehicleDef;
  group: THREE.Group;
  heading: number;
  speed: number;
  fuel: number; // L
  condition: number; // 0..1
  wheelSpin: THREE.Object3D[];
  wheelPivots: THREE.Object3D[];
  steerVis: number;
  bobT: number;
  steerAngle: number; // current front-wheel angle (rad), the bicycle model's input
  wheelR: number; // rolling radius for wheel spin
  bodyPitch: number; // smoothed weight-transfer pitch (accel/brake)
  bodyRoll: number; // smoothed lateral lean (cornering)
  suspV: number; // suspension spring velocity (4-corner terrain follow)
  // --- vehicle & trailer wave state ---
  storage: InvItem[]; // what's riding in the trunk / bed / cargo bay
  upgrades: string[]; // installed upgrade ids (data/upgrades)
  tiresFlat: number; // blown tires: drag + pull until replaced
  flatSide: 1 | -1; // which way a flat pulls
  blewTire: boolean; // set by drive() on a blowout, consumed by Game (toast)
  wasClipped: boolean; // collision edge detection for impact damage
  doors: DoorAnim[];
 // the roof mesh — always renders (roofs never hide, Ian's law)
  upgradeGroup?: THREE.Group; // armor / racks / bullbar meshes
  /** Steering wheel spinner (modelKit.buildInterior) — drive() turns it. */
  steerWheel?: THREE.Object3D;
  /** Model variant of one def (the Stallion's 'fx' hero build). */
  variant?: string;
}

export interface DriveEnv {
  groundY: (x: number, z: number) => number;
  colliders: Collider[];
  ram: (x: number, z: number, radius: number, dmg: number) => void;
  noise: (x: number, z: number, r: number) => void;
  time: number;
}

function buildCarBody(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  buildStallion(g, def, v); // the one car — procedural stand-in until the GLB lands
}

function makeVehicle(def: VehicleDef, x: number, z: number, heading: number, groundY: (x: number, z: number) => number, variant?: string): Vehicle {
  const g = new THREE.Group();
  const v: Vehicle = {
    uid: def.id, def, group: g, heading, speed: 0,
    fuel: def.fuelMax * (0.2 + Math.random() * 0.4),
    condition: 0.2 + Math.random() * 0.4,
    wheelSpin: [], wheelPivots: [], steerVis: 0, bobT: Math.random() * 10,
    steerAngle: 0, wheelR: 0.35, bodyPitch: 0, bodyRoll: 0, suspV: 0,
    storage: [], upgrades: [], tiresFlat: 0, flatSide: 1, blewTire: false,
    wasClipped: false, doors: [], variant,
  };
  buildCarBody(g, def, v);
  g.position.set(x, Math.max(groundY(x, z), 0), z);
  g.rotation.order = 'YXZ';
  g.rotation.y = heading;
  return v;
}

export interface SpawnDef {
  id: string;
  poi: string;
  dx: number;
  dz: number;
  heading: number;
  /** Absolute deck height for vehicles parked aboard a structure (the
   *  carrier) — terrain height does not apply there. */
  y?: number;
  /** Model variant (the Stallion FX hero car). */
  variant?: string;
}

// AIRBASE wave: the fleet consolidates at the depot motor pool — two
// apron rows south of the MAINT-BAY, heavies behind. The carrier keeps a
// pickup + bronco aboard as deck spawns; boats stay at the marina.
export const VEHICLE_SPAWNS: SpawnDef[] = [
  // VEHICLE RESET: the one Mustang on open ground beside the lighthouse.
  { id: 'mustang', poi: 'lighthouse', dx: -14, dz: 16, heading: Math.PI * 0.75, variant: 'fx' },
];

export class VehicleManager {
  vehicles: Vehicle[] = [];

  spawn(scene: THREE.Scene, pois: Record<string, [number, number]>, groundY: (x: number, z: number) => number): void {
    for (const s of VEHICLE_SPAWNS) {
      const def = VEHICLE_DEFS.find((d) => d.id === s.id);
      if (!def) continue;
      const p = pois[s.poi] ?? [0, 0];
      const v = makeVehicle(def, p[0] + s.dx, p[1] + s.dz, s.heading, groundY, s.variant);
      this.vehicles.push(v);
      scene.add(v.group);
    }
  }

  nearest(x: number, z: number, maxD: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = maxD;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Advance every vehicle's door animations (called once per frame). */
  updateDoors(dt: number): void {
    for (const v of this.vehicles) if (v.doors.length) stepDoors(v.doors, dt);
  }

  byId(uid: string): Vehicle | null {
    return this.vehicles.find((v) => v.uid === uid) ?? null;
  }

  /** Arcade drive step for one vehicle. Returns the driven vehicle. */
  /**
   * Bicycle-model drive: the front wheels carry a real steer angle, the car
   * rotates about its REAR AXLE (the true pivot), and speed comes from a
   * power curve + drag instead of a lerp to target. Steering direction:
   * heading θ maps +Z→(sinθ, cosθ), so increasing θ turns LEFT — a right
   * steer (input +1) must decrease θ.
   */
  drive(dt: number, v: Vehicle, throttle: number, steer: number, env: DriveEnv): void {
    const def = v.def;
    const pos = v.group.position;
    const groundHere = env.groundY(pos.x, pos.z);
    const speedRatio = clamp(Math.abs(v.speed) / Math.max(def.topSpeed, 1), 0, 1);
    const hasFuel = v.fuel > 0.05;
    const condF = 0.6 + 0.4 * v.condition;

    // ---------- land: bicycle model ----------
    const inWater = groundHere < -0.4;
    const onSand = groundHere < 0.9; // beach band — soft surface, real drag
    const wb = def.length * 0.567; // S650 wheelbase 2.718 m on a 4.79 m car
    // steer angle: ramps toward the input, max angle shrinks with speed
    const maxSteerBase = 0.58; // ~33°
    const maxSteer = maxSteerBase / (1 + speedRatio * 2.4);
    const steerTarget = clamp(steer, -1, 1) * maxSteer;
    const steerRate = steerTarget === 0 || Math.sign(steerTarget) !== Math.sign(v.steerAngle) ? 3.4 : 2.6;
    v.steerAngle += clamp(steerTarget - v.steerAngle, -steerRate * dt, steerRate * dt);
    v.steerVis = v.steerAngle;
    // grip saturation: the tires can't deliver full lock at speed
    // (the wheel + steering wheel still show the commanded angle)
    const effSteer = effectiveSteerAngle(v.steerAngle, speedRatio, understeerK(def));
    const massKg = vehicleMassKg(def) + itemsWeightKg(v.storage);

    // longitudinal: power curve launch, real brakes, aero + rolling drag.
    // Load matters: a hitched trailer's mass (towedMassKg, set by the
    // trailer manager) and blown tires cut the top end and the pull;
    // an engine tune buys some of it back (data/upgrades math).
    const surfaceTop = onSand ? sandFactor(v.upgrades) : 1;
    const topF = def.topSpeed * condF * surfaceTop * (inWater ? 0.3 : 1)
      * topSpeedFactor(v.upgrades, 0, v.tiresFlat);
    const accelF = accelFactor(v.upgrades, 0);
    const topR = def.topSpeed * 0.32 * condF;
    const th = hasFuel ? clamp(throttle, -1, 1) : 0;
    const accelBefore = v.speed;
    if (th > 0.02) {
      const power = clamp(1 - v.speed / Math.max(topF, 1), 0.22, 1); // strong launch, tapering top end
      v.speed += th * (topF / 2.9) * power * (onSand ? 0.8 : 1) * accelF * dt;
    } else if (th < -0.02) {
      if (v.speed > 0.4) {
        v.speed -= (topF / 1.05) * dt; // brakes
      } else {
        const power = clamp(1 + v.speed / Math.max(topR, 1), 0.3, 1);
        v.speed += th * (topR / 1.6) * power * dt; // reverse
      }
    }
    if (v.speed > topF) v.speed = Math.max(topF, v.speed - topF * 0.8 * dt);
    if (v.speed < -topR) v.speed = -topR;
    // drag: aero (proportional) + rolling resistance (constant pull to 0)
    v.speed -= v.speed * (inWater ? 1.4 : 0.32) * dt;
    if (Math.abs(th) < 0.02) {
      const roll = (onSand ? 1.1 : 0.55) * dt;
      v.speed = Math.abs(v.speed) <= roll ? 0 : v.speed - Math.sign(v.speed) * roll;
      v.speed -= v.speed * 0.25 * dt; // engine braking
    }
    const accel = dt > 0 ? (v.speed - accelBefore) / dt : 0;

    // yaw from the bicycle model; position integrates from the REAR AXLE,
    // so the nose swings wide and the tail stays planted — the real pivot.
    const yawRate = wb > 0 ? (v.speed / wb) * Math.tan(effSteer) : 0;
    const fx0 = Math.sin(v.heading);
    const fz0 = Math.cos(v.heading);
    const rearX = pos.x - fx0 * (wb / 2);
    const rearZ = pos.z - fz0 * (wb / 2);
    v.heading -= yawRate * dt; // minus: right steer decreases θ (see header)
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const newRearX = rearX + fx * v.speed * dt;
    const newRearZ = rearZ + fz * v.speed * dt;
    pos.x = newRearX + fx * (wb / 2);
    pos.z = newRearZ + fz * (wb / 2);
    // a flat tire drags the nose toward its side, worse with speed
    if (v.tiresFlat > 0) {
      v.heading += v.flatSide * 0.05 * v.tiresFlat * (v.speed / Math.max(def.topSpeed, 1)) * dt;
    }

    // body vs. buildings (center-circle, as before)
    const radius = Math.max(def.length, def.width) / 2 * 0.75;
    const p3 = { x: pos.x, z: pos.z };
    const before = { x: pos.x, z: pos.z };
    resolveCollisions(p3, radius, env.colliders, pos.y);
    const clipped = Math.hypot(p3.x - before.x, p3.z - before.z) > 0.001;
    // IMPACT physics: damage lands once, on the impact edge, scaled by
    // kinetic energy (speed², mass class) — scraping a wall bleeds
    // speed but doesn't keep re-charging the repair bill. A hard hit
    // bounces: light hulls ricochet, heavy hulls just stop.
    const impactSpeed = Math.abs(v.speed);
    let bounced = false;
    if (false) {
      env.noise(pos.x, pos.z, 26); // the building loses; the tank doesn't notice
    }
    if (clipped && !v.wasClipped && impactSpeed > 5) {
      const dmg = impactDamage(impactSpeed, massKg, def.armorMul ?? 1, collisionLossFactor(v.upgrades));
      v.condition = Math.max(0, v.condition - dmg);
      env.noise(pos.x, pos.z, 18);
      // a hard hit on a worn vehicle can blow a tire (run-flats prevent it)
      if (dmg > 0.07 && v.condition < 0.45 && v.tiresFlat < 2 && !v.upgrades.includes('run_flats')
        && Math.random() < Math.min(0.7, dmg * 1.8)) {
        v.tiresFlat += 1;
        v.flatSide = Math.random() < 0.5 ? 1 : -1;
        v.blewTire = true;
        env.noise(pos.x, pos.z, 30);
      }
      if (impactSpeed >= 7) {
        v.speed = -v.speed * impactBounce(massKg);
        bounced = true;
      }
    }
    v.wasClipped = clipped;
    pos.x = p3.x;
    pos.z = p3.z;
    if (clipped && !bounced) v.speed *= 0.35;

    // SUSPENSION: sample the ground at all four wheel contact patches.
    // Body height, pitch, AND roll all come from the four corners — a
    // vehicle straddling a slope now leans sideways into it (the old
    // 3-sample follow only really solved front-to-back), and the height
    // rides on an underdamped spring so the body travels and settles
    // instead of being glued to the terrain.
    const track = def.width * 0.82;
    const rx = fz; // right vector (world) for heading (fx, fz)
    const rz = -fx;
    const hAt = (ox: number, oz: number) => Math.max(env.groundY(pos.x + ox, pos.z + oz), -0.6);
    const hFL = hAt(fx * (wb / 2) - rx * (track / 2), fz * (wb / 2) - rz * (track / 2));
    const hFR = hAt(fx * (wb / 2) + rx * (track / 2), fz * (wb / 2) + rz * (track / 2));
    const hRL = hAt(-fx * (wb / 2) - rx * (track / 2), -fz * (wb / 2) - rz * (track / 2));
    const hRR = hAt(-fx * (wb / 2) + rx * (track / 2), -fz * (wb / 2) + rz * (track / 2));
    const avgH = (hFL + hFR + hRL + hRR) / 4;
    const rideH = 0.02 + (v.upgrades.includes('lift_kit') ? 0.1 : 0);
    // spring: stiffness 90, damping 12 (underdamped — visible travel)
    v.suspV += ((avgH + rideH - pos.y) * 90 - v.suspV * 12) * dt;
    pos.y += v.suspV * dt;
    if (pos.y < avgH + rideH - 0.35) { pos.y = avgH + rideH - 0.35; v.suspV = 0; }
    const frontAvg = (hFL + hFR) / 2;
    const rearAvg = (hRL + hRR) / 2;
    const leftAvg = (hFL + hRL) / 2;
    const rightAvg = (hFR + hRR) / 2;
    const terrainPitch = clamp(Math.atan2(rearAvg - frontAvg, wb) * 0.9, -0.38, 0.38);
    const terrainRoll = clamp(Math.atan2(leftAvg - rightAvg, track) * 0.9, -0.38, 0.38);
    const cgH = cgHeightM(def);
    const pitchTarget = terrainPitch + weightTransferPitch(accel, cgH, wb); // weight transfer: dive on brake, squat on launch
    const rollTarget = terrainRoll + cornerRoll(yawRate, v.speed, cgH, track); // roll OUT with lateral load
    const smooth = Math.min(1, dt * 7);
    v.bodyPitch += (pitchTarget - v.bodyPitch) * smooth;
    v.bodyRoll += (rollTarget - v.bodyRoll) * smooth;
    v.group.rotation.x = v.bodyPitch;
    v.group.rotation.z = v.bodyRoll;
    v.group.rotation.y = v.heading;

    // wheels: spin by true rolling radius; front pivots show the real angle
    for (const w of v.wheelSpin) w.rotation.x += (v.speed / v.wheelR) * dt;
    for (const p of v.wheelPivots) p.rotation.y = -v.steerAngle;
    if (v.steerWheel) v.steerWheel.rotation.z = -v.steerAngle * 2.3;

    this.finishDriveStep(dt, v, env, th, speedRatio);
  }

  /** Shared tail of a drive step: fuel, wear, ramming, engine noise. */
  private finishDriveStep(dt: number, v: Vehicle, env: DriveEnv, engine: number, speedRatio: number): void {
    const def = v.def;
    const pos = v.group.position;
    if (Math.abs(engine) > 0.05 && v.fuel > 0) {
      v.fuel = Math.max(0, v.fuel - 0.18 * def.burnClass * Math.max(speedRatio, 0.15) * dt);
    }
    {
      v.condition = Math.max(0, v.condition - (0.02 / 60) * (0.3 + speedRatio) * dt * wearFactor(v.upgrades));
    }
    if (Math.abs(v.speed) > 4) {
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      const crush = false;
      env.ram(
        pos.x + fx * (def.length / 2), pos.z + fz * (def.length / 2),
        crush ? 3.0 : 1.2 + def.width / 2,
        Math.abs(v.speed) * (crush ? 5 : 2.2) * ramDamageFactor(v.upgrades),
      );
    }
    (v as { noiseT?: number }).noiseT = ((v as { noiseT?: number }).noiseT ?? 0) + dt;
    if ((v as { noiseT?: number }).noiseT! > 0.3) {
      (v as { noiseT?: number }).noiseT = 0;
      env.noise(pos.x, pos.z, Math.abs(v.speed) > 0.5 ? def.noiseDrive : def.noiseDrive * 0.55);
    }
  }
}

// ---------------------------------------------------------------------------
// Upgrade + cargo visuals: installed upgrades and loaded crates are real
// meshes on the vehicle, rebuilt whenever the state changes.
// ---------------------------------------------------------------------------

/** Rebuild the visible upgrade hardware (the Stallion's upgrade morphs). */
export function applyUpgradeVisuals(v: Vehicle): void {
  if (v.upgradeGroup) {
    v.group.remove(v.upgradeGroup);
    v.upgradeGroup = undefined;
  }
  if (v.upgrades.length === 0) return;
  const g = new THREE.Group();
  // Convoy Combat Edition: the upgrade tree made visible (carModels.ts)
  applyStallionUpgrades(v, g);
  v.group.add(g);
  v.upgradeGroup = g;
}
