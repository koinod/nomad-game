// Vehicles.ts — the 13-vehicle roster, procedural meshes, arcade driving
// physics (arcade, honest fuel + wear from the spec), enter/exit, ramming.
// Wave 1: driving core. Trailers ship next wave.

import * as THREE from 'three';
import { clamp } from './rng';
import { resolveCollisions, type Collider } from './Colliders';

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'bike' | 'moto' | 'atv' | 'skiff' | 'car';
  length: number;
  width: number;
  fuelMax: number; // L
  burnClass: number;
  topSpeed: number; // m/s
  noiseDrive: number; // meters at speed
  color: number;
  water?: boolean;
}

export const VEHICLE_DEFS: VehicleDef[] = [
  { id: 'sportbike', name: 'Sport Bike', kind: 'bike', length: 2.1, width: 0.7, fuelMax: 12, burnClass: 0.5, topSpeed: 22, noiseDrive: 40, color: 0xc23b2e },
  { id: 'motocross', name: 'Dirt Bike', kind: 'moto', length: 2.2, width: 0.8, fuelMax: 10, burnClass: 0.5, topSpeed: 20, noiseDrive: 45, color: 0x3a6ea5 },
  { id: 'atv', name: 'ATV', kind: 'atv', length: 2.1, width: 1.1, fuelMax: 15, burnClass: 0.6, topSpeed: 16, noiseDrive: 42, color: 0x4a5230 },
  { id: 'skiff', name: 'Skiff', kind: 'skiff', length: 5.5, width: 2.0, fuelMax: 24, burnClass: 0.9, topSpeed: 13, noiseDrive: 38, color: 0xd8d8d0, water: true },
  { id: 'sedan', name: 'Sedan', kind: 'car', length: 4.7, width: 1.8, fuelMax: 40, burnClass: 1.0, topSpeed: 12, noiseDrive: 45, color: 0x5a6a7a },
  { id: 'mustang', name: 'Mustang', kind: 'car', length: 4.8, width: 1.9, fuelMax: 45, burnClass: 1.1, topSpeed: 24, noiseDrive: 55, color: 0x8a1e1e },
  { id: 'van', name: 'Utility Van', kind: 'car', length: 5.2, width: 2.0, fuelMax: 55, burnClass: 1.3, topSpeed: 14, noiseDrive: 50, color: 0xb8b8b0 },
  { id: 'bronco', name: 'Bronco 4x4', kind: 'car', length: 4.6, width: 1.9, fuelMax: 55, burnClass: 1.3, topSpeed: 15, noiseDrive: 55, color: 0x4a5a3a },
  { id: 'pickup', name: 'Pickup', kind: 'car', length: 5.3, width: 1.9, fuelMax: 60, burnClass: 1.3, topSpeed: 14, noiseDrive: 55, color: 0x3a4a5a },
  { id: 'f250', name: 'F-250', kind: 'car', length: 5.9, width: 2.0, fuelMax: 70, burnClass: 1.4, topSpeed: 15, noiseDrive: 55, color: 0x2e2e32 },
  { id: 'boxtruck', name: 'Box Truck', kind: 'car', length: 7.5, width: 2.5, fuelMax: 90, burnClass: 1.8, topSpeed: 11, noiseDrive: 58, color: 0xd8d4c8 },
  { id: 'semi', name: 'Semi Tractor', kind: 'car', length: 6.5, width: 2.5, fuelMax: 200, burnClass: 2.5, topSpeed: 10, noiseDrive: 60, color: 0x8a2020 },
  { id: 'apc', name: '6x6 APC', kind: 'car', length: 6.8, width: 2.6, fuelMax: 150, burnClass: 3.0, topSpeed: 9, noiseDrive: 65, color: 0x4a5230 },
];

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
}

export interface DriveEnv {
  groundY: (x: number, z: number) => number;
  colliders: Collider[];
  ram: (x: number, z: number, radius: number, dmg: number) => void;
  noise: (x: number, z: number, r: number) => void;
  time: number;
}

const mat = (c: number, rough = 0.75, metal = 0.15) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
const glass = () =>
  new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.15, metalness: 0.5 });

function box(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function wheel(g: THREE.Group, r: number, w: number, x: number, y: number, z: number, spin: THREE.Object3D[], pivots?: THREE.Object3D[]): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), mat(0x1e1e22, 1, 0));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 8), mat(0x8a929a, 0.4, 0.6));
  hub.rotation.z = Math.PI / 2;
  pivot.add(tire, hub);
  g.add(pivot);
  spin.push(tire, hub);
  if (pivots) pivots.push(pivot);
  return pivot;
}

function buildCarBody(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const { length: L, width: W, color } = def;
  const body = mat(color, 0.55, 0.35);
  if (def.id === 'van' || def.id === 'boxtruck') {
    // tall box body
    box(g, W, 1.5, L * 0.62, body, 0, 1.05, -L * 0.16);
    box(g, W * 0.98, 0.75, L * 0.3, body, 0, 0.68, L * 0.32);
    box(g, W * 0.92, 0.5, 0.08, glass(), 0, 0.72, L * 0.47);
  } else if (def.id === 'semi') {
    box(g, W, 1.5, 1.6, body, 0, 1.25, L * 0.28);
    box(g, W * 0.9, 0.5, 0.08, glass(), 0, 1.35, L * 0.28 + 0.8);
    box(g, W, 0.35, 2.6, mat(0x2e3238), 0, 0.85, -L * 0.05); // fifth-wheel plate
  } else if (def.id === 'apc') {
    box(g, W, 1.6, L * 0.9, mat(color, 0.9, 0.1), 0, 1.15, 0);
    const nose = box(g, W * 0.96, 0.9, 1.0, mat(color, 0.9, 0.1), 0, 0.95, L * 0.48);
    nose.rotation.x = -0.35;
    box(g, 0.9, 0.18, 0.9, mat(0x2e3238), 0, 2.05, 0.4); // roof hatch
  } else if (def.id === 'pickup' || def.id === 'f250') {
    // a real pickup silhouette: hood line LOW, cab RAISED with glass + roof,
    // and an OPEN bed (floor + walls), not a solid slab — the old flat boxes
    // read as a bench from every angle.
    const tall = def.id === 'f250' ? 0.18 : 0;
    const dark = mat(0x2e3238, 0.9, 0);
    box(g, W, 0.42, L, body, 0, 0.52, 0); // frame/lower body
    box(g, W * 0.96, 0.34, L * 0.26, body, 0, 0.88 + tall * 0.3, L * 0.36); // hood
    box(g, W * 0.98, 0.52, L * 0.31, body, 0, 0.86 + tall * 0.3, L * 0.1); // cab lower
    box(g, W * 0.93, 0.44, L * 0.28, glass(), 0, 1.3 + tall * 0.6, L * 0.1); // glass band
    box(g, W * 0.97, 0.09, L * 0.32, body, 0, 1.56 + tall * 0.6, L * 0.1); // roof
    // open bed: floor + two side walls + front wall + tailgate
    box(g, W * 0.94, 0.07, L * 0.4, dark, 0, 0.76, -L * 0.27);
    box(g, 0.09, 0.55, L * 0.42, body, -(W / 2 - 0.045), 1.02 + tall * 0.3, -L * 0.27);
    box(g, 0.09, 0.55, L * 0.42, body, W / 2 - 0.045, 1.02 + tall * 0.3, -L * 0.27);
    box(g, W, 0.55, 0.08, body, 0, 1.02 + tall * 0.3, -L * 0.065); // bed front wall
    box(g, W, 0.55, 0.07, body, 0, 1.02 + tall * 0.3, -L * 0.475); // tailgate
    // bumpers, lights, mirrors
    box(g, W, 0.22, 0.14, dark, 0, 0.42, L * 0.52);
    box(g, W, 0.22, 0.14, dark, 0, 0.42, -L * 0.52);
    const lamp = mat(0xd8dcc8, 0.3, 0.1);
    box(g, 0.34, 0.13, 0.05, lamp, -W * 0.32, 0.86 + tall * 0.3, L * 0.5);
    box(g, 0.34, 0.13, 0.05, lamp, W * 0.32, 0.86 + tall * 0.3, L * 0.5);
    box(g, 0.07, 0.13, 0.1, dark, -(W / 2 + 0.05), 1.32 + tall * 0.6, L * 0.22);
    box(g, 0.07, 0.13, 0.1, dark, W / 2 + 0.05, 1.32 + tall * 0.6, L * 0.22);
  } else if (def.id === 'bronco') {
    box(g, W, 0.6, L, body, 0, 0.62, 0);
    box(g, W * 0.96, 0.62, L * 0.55, body, 0, 1.2, -L * 0.12);
    box(g, W * 0.9, 0.4, L * 0.5, glass(), 0, 1.2, -L * 0.1);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12), mat(0x1e1e22, 1, 0));
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 0.95, -L / 2 - 0.12);
    g.add(spare);
  } else if (def.id === 'mustang') {
    box(g, W, 0.5, L * 0.55, body, 0, 0.55, L * 0.2); // long hood
    box(g, W * 0.94, 0.5, L * 0.4, body, 0, 0.82, -L * 0.2); // fastback cabin
    box(g, W * 0.86, 0.36, L * 0.34, glass(), 0, 0.85, -L * 0.18);
    box(g, W * 0.7, 0.08, 0.3, mat(0x1e1e22), 0, 0.95, -L * 0.46); // spoiler
  } else {
    // sedan
    box(g, W, 0.55, L, body, 0, 0.58, 0);
    box(g, W * 0.94, 0.52, L * 0.48, body, 0, 1.1, -L * 0.05);
    box(g, W * 0.88, 0.4, L * 0.44, glass(), 0, 1.12, -L * 0.04);
  }
  // wheels
  const wr = def.id === 'f250' ? 0.44 : def.id === 'semi' || def.id === 'boxtruck' || def.id === 'apc' ? 0.42 : 0.34;
  v.wheelR = wr;
  const ww = def.id === 'apc' ? 0.3 : 0.24;
  const nAxle = def.id === 'semi' || def.id === 'apc' || def.id === 'boxtruck' ? 3 : 2;
  const axleZs = nAxle === 3 ? [L * 0.32, -L * 0.1, -L * 0.32] : [L * 0.32, -L * 0.32];
  axleZs.forEach((az, i) => {
    for (const sx of [-1, 1]) {
      wheel(g, wr, ww, (sx * (W / 2 - 0.05)), wr, az, v.wheelSpin, i === 0 ? v.wheelPivots : undefined);
    }
  });
}

function buildBike(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const body = mat(def.color, 0.5, 0.4);
  if (def.kind === 'atv') {
    v.wheelR = 0.32;
    box(g, 1.0, 0.25, 1.9, body, 0, 0.62, 0);
    box(g, 0.5, 0.3, 0.6, mat(0x1e1e22), 0, 0.85, 0.1); // seat
    box(g, 1.05, 0.06, 0.4, mat(0x2e3238), 0, 0.78, 0.85); // front rack
    box(g, 1.05, 0.06, 0.4, mat(0x2e3238), 0, 0.78, -0.85); // rear rack
    for (const [sx, sz] of [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]] as [number, number][]) {
      wheel(g, 0.32, 0.22, sx * 0.52, 0.32, sz, v.wheelSpin, sz > 0 ? v.wheelPivots : undefined);
    }
    return;
  }
  // two-wheelers
  const wr = def.kind === 'moto' ? 0.36 : 0.32;
  v.wheelR = wr;
  box(g, 0.3, 0.25, 1.2, body, 0, 0.72, 0.05); // tank/frame
  box(g, 0.42, 0.12, 0.5, mat(0x1e1e22), 0, 0.92, -0.35); // seat
  if (def.kind === 'moto') {
    box(g, 0.5, 0.06, 0.35, mat(0xc23b2e), 0, 0.95, 0.85); // high fender
  } else {
    box(g, 0.44, 0.18, 0.7, body, 0, 0.85, 0.25); // fairing
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), mat(0x8a929a, 0.4, 0.6));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.05, 0.75);
  g.add(bar);
  wheel(g, wr, 0.12, 0, wr, 0.8, v.wheelSpin, v.wheelPivots);
  wheel(g, wr, 0.14, 0, wr, -0.8, v.wheelSpin);
}

function buildSkiff(g: THREE.Group, def: VehicleDef): void {
  const hull = mat(def.color, 0.8, 0.1);
  box(g, 2.0, 0.55, 4.6, hull, 0, 0.35, -0.3);
  const bow = box(g, 2.0, 0.55, 1.2, hull, 0, 0.35, 2.35);
  bow.rotation.y = 0;
  bow.scale.x = 0.45; // tapered bow
  box(g, 0.4, 0.9, 0.3, mat(0x2e3238), 0, 0.7, -2.9); // outboard motor
  box(g, 1.7, 0.08, 0.4, mat(0x6b4a2f), 0, 0.62, 0.4); // bench
  box(g, 1.7, 0.08, 0.4, mat(0x6b4a2f), 0, 0.62, -1.2);
}

function makeVehicle(def: VehicleDef, x: number, z: number, heading: number, groundY: (x: number, z: number) => number): Vehicle {
  const g = new THREE.Group();
  const v: Vehicle = {
    uid: def.id,
    def,
    group: g,
    heading,
    speed: 0,
    fuel: def.fuelMax * (0.2 + Math.random() * 0.4), // found 20–60% fuel
    condition: 0.2 + Math.random() * 0.4, // found 20–60% condition, never free
    wheelSpin: [],
    wheelPivots: [],
    steerVis: 0,
    bobT: Math.random() * 10,
    steerAngle: 0,
    wheelR: 0.35,
    bodyPitch: 0,
    bodyRoll: 0,
  };
  if (def.kind === 'skiff') buildSkiff(g, def);
  else if (def.kind === 'bike' || def.kind === 'moto' || def.kind === 'atv') buildBike(g, def, v);
  else buildCarBody(g, def, v);
  g.position.set(x, Math.max(groundY(x, z), def.water ? 0.05 : 0), z);
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
}

const SPAWNS: SpawnDef[] = [
  { id: 'pickup', poi: 'shore_camp', dx: 8, dz: 4, heading: Math.PI / 2 },
  { id: 'atv', poi: 'jonah_camp', dx: 10, dz: -4, heading: 0 },
  { id: 'sedan', poi: 'town', dx: 18, dz: 10, heading: Math.PI / 2 },
  { id: 'mustang', poi: 'town', dx: -14, dz: -16, heading: -Math.PI / 2 },
  { id: 'sportbike', poi: 'town', dx: 70, dz: 20, heading: 0 },
  { id: 'van', poi: 'town', dx: 98, dz: 46, heading: Math.PI },
  { id: 'boxtruck', poi: 'town', dx: 48, dz: -24, heading: Math.PI / 2 },
  { id: 'bronco', poi: 'forest_cache', dx: 6, dz: 4, heading: Math.PI / 2 },
  { id: 'f250', poi: 'wreck', dx: 5, dz: 3, heading: 0 },
  { id: 'motocross', poi: 'dune_cache', dx: 4, dz: 4, heading: Math.PI / 2 },
  { id: 'semi', poi: 'dune_cache', dx: 55, dz: -18, heading: Math.PI / 2 },
  { id: 'apc', poi: 'lighthouse_base', dx: 12, dz: -8, heading: -Math.PI / 2 },
  { id: 'skiff', poi: 'marina', dx: -64, dz: 8, heading: Math.PI / 2 },
];

export class VehicleManager {
  vehicles: Vehicle[] = [];

  spawn(scene: THREE.Scene, pois: Record<string, [number, number]>, groundY: (x: number, z: number) => number): void {
    for (const s of SPAWNS) {
      const def = VEHICLE_DEFS.find((d) => d.id === s.id);
      if (!def) continue;
      const p = pois[s.poi] ?? [0, 0];
      let x = p[0] + s.dx;
      let z = p[1] + s.dz;
      if (def.water) {
        // nudge seaward until the hull floats
        for (let i = 0; i < 12 && groundY(x, z) > -0.3; i++) x -= 8;
      }
      const v = makeVehicle(def, x, z, s.heading, groundY);
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
    const condF = 0.45 + 0.55 * v.condition;

    // ---------- water: rudder model (boats pivot midships, steer = rudder) ----------
    if (def.water) {
      let th = clamp(throttle, -1, 1);
      if (groundHere > 0.4) th = 0; // beached
      const engine = hasFuel ? th : 0;
      const topF = def.topSpeed * condF;
      const target = engine >= 0 ? engine * topF : engine * topF * 0.4;
      v.speed += clamp(target - v.speed, -topF * 0.5 * dt, topF * 0.35 * dt);
      if (Math.abs(engine) < 0.05) v.speed *= Math.max(0, 1 - 0.5 * dt);
      const steerTarget = clamp(steer, -1, 1) * 0.5;
      v.steerAngle += clamp(steerTarget - v.steerAngle, -1.8 * dt, 1.8 * dt);
      v.heading -= v.steerAngle * clamp(v.speed / 6, -1, 1) * dt * 1.4;
      pos.x += Math.sin(v.heading) * v.speed * dt;
      pos.z += Math.cos(v.heading) * v.speed * dt;
      pos.y = 0.12 + Math.sin(env.time * 1.6 + v.bobT) * 0.06;
      v.group.rotation.set(
        Math.sin(env.time * 1.3 + v.bobT) * 0.02,
        v.heading,
        Math.cos(env.time * 1.1 + v.bobT) * 0.025,
      );
      this.finishDriveStep(dt, v, env, engine, speedRatio);
      return;
    }

    // ---------- land: bicycle model ----------
    const inWater = groundHere < -0.4;
    const onSand = groundHere < 0.9; // beach band — soft surface, real drag
    const wb = def.kind === 'car' ? def.length * 0.64 : 1.4; // wheelbase (axles ±L·0.32 / ±0.7)

    // steer angle: ramps toward the input, max angle shrinks with speed
    const maxSteerBase = def.kind === 'car' ? 0.58 : 0.72; // ~33° cars, ~41° bikes/atv
    const maxSteer = maxSteerBase / (1 + speedRatio * 2.4);
    const steerTarget = clamp(steer, -1, 1) * maxSteer;
    const steerRate = steerTarget === 0 || Math.sign(steerTarget) !== Math.sign(v.steerAngle) ? 3.4 : 2.6;
    v.steerAngle += clamp(steerTarget - v.steerAngle, -steerRate * dt, steerRate * dt);
    v.steerVis = v.steerAngle;

    // longitudinal: power curve launch, real brakes, aero + rolling drag
    const surfaceTop = onSand ? 0.78 : 1;
    const topF = def.topSpeed * condF * surfaceTop * (inWater ? 0.3 : 1);
    const topR = def.topSpeed * 0.32 * condF;
    const th = hasFuel ? clamp(throttle, -1, 1) : 0;
    const accelBefore = v.speed;
    if (th > 0.02) {
      const power = clamp(1 - v.speed / Math.max(topF, 1), 0.22, 1); // strong launch, tapering top end
      v.speed += th * (topF / 2.4) * power * (onSand ? 0.8 : 1) * dt;
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
    const yawRate = wb > 0 ? (v.speed / wb) * Math.tan(v.steerAngle) : 0;
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

    // body vs. buildings (center-circle, as before)
    const radius = Math.max(def.length, def.width) / 2 * 0.75;
    const p3 = { x: pos.x, z: pos.z };
    const before = { x: pos.x, z: pos.z };
    resolveCollisions(p3, radius, env.colliders);
    const clipped = Math.hypot(p3.x - before.x, p3.z - before.z) > 0.001;
    if (clipped && Math.abs(v.speed) > 5) {
      v.condition = Math.max(0, v.condition - 0.02);
      env.noise(pos.x, pos.z, 18);
    }
    pos.x = p3.x;
    pos.z = p3.z;
    if (clipped) v.speed *= 0.35;

    // terrain follow + weight transfer (pitch under accel/brake, lean in turns)
    const gy = Math.max(env.groundY(pos.x, pos.z), -0.6);
    pos.y = gy + (def.kind === 'atv' || def.kind === 'bike' || def.kind === 'moto' ? 0.05 : 0.02);
    const ahead = env.groundY(pos.x + fx * 1.5, pos.z + fz * 1.5);
    const behind = env.groundY(pos.x - fx * 1.5, pos.z - fz * 1.5);
    const side = env.groundY(pos.x + fz * 1.2, pos.z - fx * 1.2);
    const terrainPitch = clamp(Math.atan2(behind - ahead, 3) * 0.7, -0.3, 0.3);
    const terrainRoll = clamp(Math.atan2(gy - side, 2.4) * 0.7, -0.3, 0.3);
    const pitchTarget = terrainPitch + clamp(-accel * 0.006, -0.05, 0.07); // nose dives on brake, lifts on launch
    const isBike = def.kind === 'bike' || def.kind === 'moto' || def.kind === 'atv';
    const rollTarget = terrainRoll + (isBike
      ? v.steerAngle * clamp(Math.abs(v.speed) / 8, 0, 1) * 0.5 * Math.sign(v.speed || 1) // bikes lean IN
      : -v.steerAngle * speedRatio * 0.055); // cars roll OUT, a little
    const smooth = Math.min(1, dt * 7);
    v.bodyPitch += (pitchTarget - v.bodyPitch) * smooth;
    v.bodyRoll += (rollTarget - v.bodyRoll) * smooth;
    v.group.rotation.x = v.bodyPitch;
    v.group.rotation.z = v.bodyRoll;
    v.group.rotation.y = v.heading;

    // wheels: spin by true rolling radius; front pivots show the real angle
    for (const w of v.wheelSpin) w.rotation.x += (v.speed / v.wheelR) * dt;
    for (const p of v.wheelPivots) p.rotation.y = -v.steerAngle;

    this.finishDriveStep(dt, v, env, th, speedRatio);
  }

  /** Shared tail of a drive step: fuel, wear, ramming, engine noise. */
  private finishDriveStep(dt: number, v: Vehicle, env: DriveEnv, engine: number, speedRatio: number): void {
    const def = v.def;
    const pos = v.group.position;
    if (Math.abs(engine) > 0.05 && v.fuel > 0) {
      v.fuel = Math.max(0, v.fuel - 0.18 * def.burnClass * Math.max(speedRatio, 0.15) * dt);
    }
    if (!def.water) {
      v.condition = Math.max(0, v.condition - (0.02 / 60) * (0.3 + speedRatio) * dt);
    }
    if (Math.abs(v.speed) > 4) {
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      env.ram(pos.x + fx * (def.length / 2), pos.z + fz * (def.length / 2), 1.2 + def.width / 2, Math.abs(v.speed) * 2.2);
    }
    (v as { noiseT?: number }).noiseT = ((v as { noiseT?: number }).noiseT ?? 0) + dt;
    if ((v as { noiseT?: number }).noiseT! > 0.3) {
      (v as { noiseT?: number }).noiseT = 0;
      env.noise(pos.x, pos.z, Math.abs(v.speed) > 0.5 ? def.noiseDrive : def.noiseDrive * 0.55);
    }
    if (def.water) {
      for (const w of v.wheelSpin) w.rotation.x += (v.speed / v.wheelR) * dt;
    }
  }
}
