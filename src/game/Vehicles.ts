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
    const tall = def.id === 'f250' ? 0.18 : 0;
    box(g, W, 0.55 + tall, L * 0.42, body, 0, 0.62 + tall / 2, L * 0.2);
    box(g, W, 0.5, L * 0.4, mat(0x2e3238, 0.9, 0), 0, 0.62 + tall / 2, -L * 0.24); // bed
    box(g, W, 0.5, 0.1, body, 0, 0.95 + tall / 2, -L * 0.44); // tailgate
    box(g, W * 0.92, 0.45, 0.08, glass(), 0, 0.78 + tall / 2, L * 0.405);
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
  drive(dt: number, v: Vehicle, throttle: number, steer: number, env: DriveEnv): void {
    const def = v.def;
    const pos = v.group.position;
    const h = env.groundY(pos.x, pos.z);
    const inWater = h < -0.4;
    let th = clamp(throttle, -1, 1);
    if (def.water) {
      if (h > 0.4) th = 0; // beached — drag it in or push it off
      else th *= 1; // water only
    } else if (inWater) {
      th *= 0.15; // land vehicles bog in the drink
    }
    const condF = 0.45 + 0.55 * v.condition;
    const topF = def.topSpeed * condF;
    const topR = def.topSpeed * 0.32;
    const hasFuel = v.fuel > 0.05;
    const engine = hasFuel ? th : 0;
    const target = engine >= 0 ? engine * topF : engine * topR;
    const accelRate = topF / 3.2;
    const brakeRate = topF / 1.4;
    const d = target - v.speed;
    v.speed += clamp(d, -brakeRate * dt, accelRate * dt);
    // drag when coasting
    if (Math.abs(engine) < 0.05) v.speed *= Math.max(0, 1 - 0.8 * dt);
    // steering: bite scales with speed
    const speedRatio = clamp(Math.abs(v.speed) / Math.max(def.topSpeed, 1), 0, 1);
    const steerRate = 2.0 * clamp(speedRatio * 2.2, 0, 1);
    v.heading += steer * steerRate * dt * (v.speed < -0.2 ? -1 : 1);
    v.steerVis = v.steerVis + (steer * 0.45 - v.steerVis) * Math.min(1, dt * 8);
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    pos.x += fx * v.speed * dt;
    pos.z += fz * v.speed * dt;
    // body vs. buildings
    const radius = Math.max(def.length, def.width) / 2 * 0.75;
    const p3 = { x: pos.x, z: pos.z };
    const before = { x: pos.x, z: pos.z };
    resolveCollisions(p3, radius, env.colliders);
    if (Math.hypot(p3.x - before.x, p3.z - before.z) > 0.001 && Math.abs(v.speed) > 5) {
      // clipped something solid at speed: damage, slow down
      v.condition = Math.max(0, v.condition - 0.02);
      env.noise(pos.x, pos.z, 18);
    }
    pos.x = p3.x;
    pos.z = p3.z;
    if (Math.hypot(p3.x - before.x, p3.z - before.z) > 0.001) {
      v.speed *= 0.35;
    }
    // terrain follow
    if (def.water) {
      pos.y = 0.12 + Math.sin(env.time * 1.6 + v.bobT) * 0.06;
      v.group.rotation.x = Math.sin(env.time * 1.3 + v.bobT) * 0.02;
      v.group.rotation.z = Math.cos(env.time * 1.1 + v.bobT) * 0.025;
    } else {
      const gy = Math.max(env.groundY(pos.x, pos.z), -0.6);
      pos.y = gy + (def.kind === 'atv' || def.kind === 'bike' || def.kind === 'moto' ? 0.05 : 0.02);
      const ahead = env.groundY(pos.x + fx * 1.5, pos.z + fz * 1.5);
      const behind = env.groundY(pos.x - fx * 1.5, pos.z - fz * 1.5);
      const side = env.groundY(pos.x + fz * 1.2, pos.z - fx * 1.2);
      v.group.rotation.x = clamp(Math.atan2(behind - ahead, 3) * 0.7, -0.3, 0.3);
      v.group.rotation.z = clamp(Math.atan2(gy - side, 2.4) * 0.7, -0.3, 0.3);
    }
    v.group.rotation.y = v.heading;
    // wheels
    const wr = 0.35;
    for (const w of v.wheelSpin) w.rotation.x += (v.speed / wr) * dt;
    for (const p of v.wheelPivots) p.rotation.y = v.steerVis;
    // fuel + wear
    if (Math.abs(engine) > 0.05 && hasFuel) {
      v.fuel = Math.max(0, v.fuel - 0.18 * def.burnClass * speedRatio * dt);
    }
    v.condition = Math.max(0, v.condition - (0.02 / 60) * (0.3 + speedRatio) * dt);
    // ramming: husks in front of a fast vehicle take damage
    if (Math.abs(v.speed) > 4) {
      env.ram(pos.x + fx * (def.length / 2), pos.z + fz * (def.length / 2), 1.2 + def.width / 2, Math.abs(v.speed) * 2.2);
    }
    // driving noise
    (v as { noiseT?: number }).noiseT = ((v as { noiseT?: number }).noiseT ?? 0) + dt;
    if ((v as { noiseT?: number }).noiseT! > 0.3) {
      (v as { noiseT?: number }).noiseT = 0;
      env.noise(pos.x, pos.z, Math.abs(v.speed) > 0.5 ? def.noiseDrive : def.noiseDrive * 0.55);
    }
  }
}
