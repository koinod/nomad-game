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
  { id: 'sportbike', name: 'Sport Bike', kind: 'bike', length: 2.1, width: 0.7, fuelMax: 12, burnClass: 0.5, topSpeed: 30, noiseDrive: 40, color: 0xc23b2e },
  { id: 'motocross', name: 'Dirt Bike', kind: 'moto', length: 2.2, width: 0.8, fuelMax: 10, burnClass: 0.5, topSpeed: 26, noiseDrive: 45, color: 0x3a6ea5 },
  { id: 'atv', name: 'ATV', kind: 'atv', length: 2.1, width: 1.1, fuelMax: 15, burnClass: 0.6, topSpeed: 19, noiseDrive: 42, color: 0x4a5230 },
  { id: 'skiff', name: 'Skiff', kind: 'skiff', length: 5.5, width: 2.0, fuelMax: 24, burnClass: 0.9, topSpeed: 14, noiseDrive: 38, color: 0xd8d8d0, water: true },
  { id: 'sedan', name: 'Sedan', kind: 'car', length: 4.7, width: 1.8, fuelMax: 40, burnClass: 1.0, topSpeed: 21, noiseDrive: 45, color: 0x5a6a7a },
  { id: 'mustang', name: 'Mustang Dark Horse', kind: 'car', length: 4.8, width: 1.9, fuelMax: 45, burnClass: 1.1, topSpeed: 42, noiseDrive: 55, color: 0x2f4d7d },
  { id: 'van', name: 'Utility Van', kind: 'car', length: 5.2, width: 2.0, fuelMax: 55, burnClass: 1.3, topSpeed: 19, noiseDrive: 50, color: 0xb8b8b0 },
  { id: 'bronco', name: 'Bronco 4x4', kind: 'car', length: 4.6, width: 1.9, fuelMax: 55, burnClass: 1.3, topSpeed: 21, noiseDrive: 55, color: 0x4a5a3a },
  { id: 'pickup', name: 'Pickup', kind: 'car', length: 5.3, width: 1.9, fuelMax: 60, burnClass: 1.3, topSpeed: 20, noiseDrive: 55, color: 0x5f7285 },
  { id: 'f250', name: 'F-250', kind: 'car', length: 5.9, width: 2.0, fuelMax: 70, burnClass: 1.4, topSpeed: 20, noiseDrive: 55, color: 0x2e2e32 },
  { id: 'boxtruck', name: 'Box Truck', kind: 'car', length: 7.5, width: 2.5, fuelMax: 90, burnClass: 1.8, topSpeed: 16, noiseDrive: 58, color: 0xd8d4c8 },
  { id: 'semi', name: 'Semi Tractor', kind: 'car', length: 6.5, width: 2.5, fuelMax: 200, burnClass: 2.5, topSpeed: 15, noiseDrive: 60, color: 0x8a2020 },
  { id: 'apc', name: '6x6 APC', kind: 'car', length: 6.8, width: 2.6, fuelMax: 150, burnClass: 3.0, topSpeed: 13, noiseDrive: 65, color: 0x4a5230 },
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
  suspV: number; // suspension spring velocity (4-corner terrain follow)
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

// ---------------------------------------------------------------------------
// Vehicle models, rebuilt 2026-10-20 (Ian: "delete all existing vehicle
// models, they will be completely redone"). Every vehicle is modeled from
// its own reference sheet at the Dark Horse standard: real proportions,
// glass bands, lights, mirrors, and the details that sell the silhouette.
// +Z is the nose. The Mustang branch stays as built from its sheet.
// ---------------------------------------------------------------------------

const darkTrim = () => mat(0x23272c, 0.9, 0.05);
const chrome = () => mat(0x9aa2ac, 0.3, 0.8);
const lampMat = () => mat(0xe8ecdf, 0.25, 0.1);
const tailMat = () => mat(0x9e1622, 0.35, 0.1);

function mirrors(g: THREE.Group, W: number, y: number, z: number, spread = 0.06): void {
  for (const sgn of [1, -1]) box(g, 0.08, 0.14, 0.12, darkTrim(), sgn * (W / 2 + spread), y, z);
}

function buildCarBody(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const { length: L, width: W, color } = def;
  const body = mat(color, 0.55, 0.35);
  const dark = darkTrim();
  if (def.id === 'van') {
    // panel van: tall cargo box, short snub nose, raked windshield
    box(g, W, 1.55, L * 0.64, body, 0, 1.32, -L * 0.16); // cargo box
    box(g, W * 0.99, 0.07, L * 0.66, body, 0, 2.13, -L * 0.16); // cargo roof
    box(g, W * 0.98, 1.06, L * 0.3, body, 0, 0.85, L * 0.33); // cab
    const shield = box(g, W * 0.9, 0.62, 0.07, glass(), 0, 1.32, L * 0.47);
    shield.rotation.x = -0.12; // raked windshield
    box(g, W * 0.96, 0.42, L * 0.14, body, 0, 0.55, L * 0.44); // snub hood
    box(g, W * 0.7, 0.22, 0.06, dark, 0, 0.52, L * 0.51); // grille
    for (const sgn of [1, -1]) {
      box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.34, 0.78, L * 0.51); // headlights
      box(g, 0.07, 0.34, 0.05, tailMat(), sgn * W * 0.44, 1.05, -L * 0.51); // tail strips
    }
    // sliding door panel (right side) + rear door seams
    box(g, 0.03, 1.25, 1.15, mat(0x9a9a92, 0.6, 0.2), W / 2 + 0.01, 1.25, -L * 0.05);
    box(g, 0.04, 1.5, 0.05, dark, 0, 1.3, -L * 0.505);
    mirrors(g, W, 1.35, L * 0.42);
    box(g, W, 0.24, 0.12, dark, 0, 0.32, L * 0.52); // bumper
  } else if (def.id === 'boxtruck') {
    // cab-over style box truck: white cargo cube, slatted roll door
    box(g, W, 2.2, L * 0.66, body, 0, 1.58, -L * 0.15); // cargo cube
    box(g, W * 0.8, 1.9, 0.05, mat(0xbdbab0, 0.7, 0.1), 0, 1.5, -L * 0.485); // roll door
    for (let i = 0; i < 4; i++) box(g, W * 0.8, 0.04, 0.02, dark, 0, 0.85 + i * 0.45, -L * 0.515);
    box(g, W * 0.96, 1.32, L * 0.2, body, 0, 0.98, L * 0.38); // cab
    box(g, W * 0.9, 0.48, 0.07, glass(), 0, 1.38, L * 0.475); // windshield
    box(g, W * 0.94, 0.3, L * 0.08, body, 0, 0.5, L * 0.46); // snub nose
    box(g, W * 0.6, 0.18, 0.05, dark, 0, 0.48, L * 0.51); // grille
    for (const sgn of [1, -1]) {
      box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.33, 0.72, L * 0.51);
      box(g, 0.07, 0.3, 0.05, tailMat(), sgn * W * 0.44, 0.95, -L * 0.51);
      box(g, 0.12, 0.05, 0.05, mat(0xd88f2a, 0.4, 0), sgn * W * 0.42, 2.62, -L * 0.2); // box markers
    }
    mirrors(g, W, 1.42, L * 0.44, 0.1);
    box(g, W, 0.26, 0.12, dark, 0, 0.3, L * 0.52);
  } else if (def.id === 'semi') {
    // long-hood tractor: cab + sleeper, chrome grille/stacks/tanks
    box(g, W * 0.96, 1.72, 3.0, body, 0, 1.36, L * 0.2); // cab + sleeper
    box(g, W * 0.98, 0.07, 3.05, body, 0, 2.25, L * 0.2); // cab roof
    box(g, W * 0.88, 0.52, 0.07, glass(), 0, 1.62, L * 0.2 + 1.5); // windshield
    box(g, W * 0.7, 0.85, 0.1, chrome(), 0, 0.95, L * 0.2 + 1.53); // grille
    box(g, W * 0.9, 0.5, L * 0.14, body, 0, 0.62, L * 0.42); // hood snub
    box(g, W, 0.3, 0.14, chrome(), 0, 0.32, L * 0.52); // bumper
    for (const sgn of [1, -1]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), chrome());
      stack.position.set(sgn * (W / 2 - 0.12), 1.6, L * 0.2 - 1.62);
      stack.castShadow = true;
      g.add(stack);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.3, 10), mat(0x6a7076, 0.35, 0.7));
      tank.rotation.x = Math.PI / 2;
      tank.position.set(sgn * (W / 2 - 0.05), 0.55, L * 0.28);
      g.add(tank);
      box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.32, 0.78, L * 0.51);
    }
    mirrors(g, W, 1.7, L * 0.2 + 1.45, 0.12);
    box(g, W * 0.8, 0.3, 2.4, mat(0x2e3238), 0, 0.92, -L * 0.18); // fifth-wheel deck
  } else if (def.id === 'apc') {
    // armored hull: sloped glacis, tapered upper hull, hatch + turret ring
    const armor = mat(color, 0.9, 0.1);
    box(g, W, 1.0, L * 0.94, armor, 0, 0.95, 0); // lower hull
    box(g, W * 0.88, 0.7, L * 0.8, armor, 0, 1.72, -L * 0.03); // upper hull
    const glacis = box(g, W * 0.94, 1.0, 0.14, armor, 0, 1.05, L * 0.47);
    glacis.rotation.x = -0.5; // sloped nose plate
    for (const sgn of [1, -1]) {
      box(g, 0.28, 0.07, 0.05, lampMat(), sgn * W * 0.3, 1.28, L * 0.53); // light slits
      const skirt = box(g, 0.06, 0.55, L * 0.7, armor, sgn * (W / 2 + 0.03), 0.62, 0);
      skirt.rotation.z = sgn * 0.12; // side skirts
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 12), mat(0x2e3238, 0.8, 0.2));
    ring.position.set(0, 2.12, 0.3);
    ring.castShadow = true;
    g.add(ring);
    box(g, 0.85, 0.1, 0.85, mat(0x2e3238), 0, 2.22, 0.3); // hatch
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.7, 5), mat(0x1c1f24, 0.8, 0));
    antenna.position.set(-W * 0.36, 2.8, -L * 0.32);
    antenna.rotation.z = 0.08;
    g.add(antenna);
  } else if (def.id === 'pickup' || def.id === 'f250') {
    // Built from the 2026 crew-cab reference sheet: tall flat hood with a
    // power bulge, hexagonal grille with C-bracket LED DRLs, black fender
    // flares, crew cab + roof rack, open short bed, chunky off-road tires.
    const tall = def.id === 'f250' ? 0.14 : 0;
    const slate = mat(0x3a4148, 0.7, 0.2);
    box(g, W, 0.5, L, body, 0, 0.62, 0); // frame/lower body — high stance
    // hood + power bulge
    box(g, W * 0.97, 0.34, L * 0.27, body, 0, 1.12 + tall * 0.3, L * 0.35);
    box(g, W * 0.5, 0.09, L * 0.19, body, 0, 1.33 + tall * 0.3, L * 0.35);
    // grille surround + honeycomb inset
    box(g, W * 0.78, 0.52, 0.1, slate, 0, 0.92 + tall * 0.2, L * 0.5);
    box(g, W * 0.6, 0.34, 0.06, mat(0x14161a, 0.9, 0), 0, 0.92 + tall * 0.2, L * 0.53);
    // C-bracket DRLs: horizontal strip + outer vertical drop
    for (const sgn of [1, -1]) {
      box(g, 0.36, 0.08, 0.05, lampMat(), sgn * W * 0.35, 1.08 + tall * 0.2, L * 0.515);
      box(g, 0.08, 0.28, 0.05, lampMat(), sgn * W * 0.5, 0.95 + tall * 0.2, L * 0.515);
      box(g, 0.16, 0.1, 0.05, mat(0x2b2f36, 0.5, 0.2), sgn * W * 0.35, 0.9 + tall * 0.2, L * 0.52); // lamp pod
    }
    // steel bumper + tow hooks + fogs
    box(g, W, 0.34, 0.22, dark, 0, 0.48, L * 0.52);
    for (const sgn of [1, -1]) {
      box(g, 0.09, 0.14, 0.06, mat(0x14161a, 0.8, 0.2), sgn * W * 0.2, 0.3, L * 0.56);
      box(g, 0.14, 0.09, 0.04, lampMat(), sgn * W * 0.38, 0.52, L * 0.6);
    }
    // crew cab: lower + glass band + roof
    box(g, W * 0.99, 0.62, L * 0.36, body, 0, 0.95 + tall * 0.3, L * 0.08);
    box(g, W * 0.94, 0.52, L * 0.34, glass(), 0, 1.5 + tall * 0.6, L * 0.08);
    for (const sgn of [1, -1]) box(g, 0.05, 0.52, 0.07, body, sgn * (W / 2 - 0.02), 1.5 + tall * 0.6, L * 0.08); // B-pillars
    box(g, W * 0.97, 0.08, L * 0.37, body, 0, 1.8 + tall * 0.6, L * 0.08); // roof
    if (def.id === 'pickup') {
      // roof rack from the sheet: rails + crossbars
      for (const sgn of [1, -1]) box(g, 0.06, 0.05, L * 0.3, dark, sgn * W * 0.3, 1.88, L * 0.08);
      for (let i = 0; i < 3; i++) box(g, W * 0.64, 0.04, 0.08, dark, 0, 1.89, L * 0.08 + (i - 1) * L * 0.11);
    }
    mirrors(g, W, 1.52 + tall * 0.6, L * 0.24, 0.07);
    // door handles + side steps
    for (const sgn of [1, -1]) {
      box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 1.22 + tall * 0.3, L * 0.16);
      box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 1.22 + tall * 0.3, -L * 0.01);
      box(g, 0.18, 0.06, L * 0.34, dark, sgn * (W / 2 + 0.04), 0.46, L * 0.07);
    }
    // fender flares over all four wheels
    for (const sgn of [1, -1]) for (const az of [L * 0.32, -L * 0.32]) {
      box(g, 0.1, 0.36, 1.0, dark, sgn * (W / 2 - 0.01), 0.82, az);
      box(g, 0.12, 0.09, 1.05, dark, sgn * (W / 2 - 0.01), 1.02, az);
    }
    // open bed: dark floor + body-color walls + tailgate
    box(g, W * 0.94, 0.07, L * 0.36, mat(0x22262b, 0.95, 0), 0, 0.84, -L * 0.3);
    box(g, 0.09, 0.5, L * 0.38, body, -(W / 2 - 0.045), 1.08 + tall * 0.3, -L * 0.3);
    box(g, 0.09, 0.5, L * 0.38, body, W / 2 - 0.045, 1.08 + tall * 0.3, -L * 0.3);
    box(g, W, 0.5, 0.08, body, 0, 1.08 + tall * 0.3, -L * 0.115); // bed front wall
    box(g, W, 0.5, 0.07, body, 0, 1.08 + tall * 0.3, -L * 0.485); // tailgate
    // rear: vertical tail lamps + bumper + exhaust
    for (const sgn of [1, -1]) box(g, 0.1, 0.32, 0.05, tailMat(), sgn * W * 0.42, 1.02 + tall * 0.3, -L * 0.51);
    box(g, W, 0.26, 0.14, dark, 0, 0.46, -L * 0.52);
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), chrome());
    exh.rotation.x = Math.PI / 2;
    exh.position.set(W * 0.32, 0.3, -L * 0.53);
    g.add(exh);
  } else if (def.id === 'bronco') {
    // boxy 4x4 SUV: upright full-length cabin, bullbar, roof rack, spare
    box(g, W, 0.62, L, body, 0, 0.66, 0); // lower body
    box(g, W * 0.97, 0.3, L * 0.3, body, 0, 1.1, L * 0.33); // hood
    box(g, W * 0.97, 0.74, L * 0.56, body, 0, 1.33, -L * 0.14); // cabin
    box(g, W * 0.93, 0.4, L * 0.52, glass(), 0, 1.44, -L * 0.13); // glass band
    box(g, W * 0.99, 0.08, L * 0.58, body, 0, 1.74, -L * 0.14); // roof
    for (const sgn of [1, -1]) box(g, 0.06, 0.05, L * 0.5, dark, sgn * W * 0.32, 1.82, -L * 0.14); // rack rails
    for (let i = 0; i < 3; i++) box(g, W * 0.68, 0.04, 0.08, dark, 0, 1.83, -L * 0.14 + (i - 1) * L * 0.18);
    // bullbar
    box(g, W * 0.7, 0.12, 0.08, dark, 0, 0.62, L * 0.56);
    box(g, W * 0.7, 0.12, 0.08, dark, 0, 0.95, L * 0.54);
    for (const sgn of [1, -1]) box(g, 0.09, 0.5, 0.08, dark, sgn * W * 0.3, 0.78, L * 0.55);
    box(g, W * 0.66, 0.2, 0.06, dark, 0, 0.82, L * 0.505); // grille
    for (const sgn of [1, -1]) {
      box(g, 0.26, 0.11, 0.05, lampMat(), sgn * W * 0.33, 1.02, L * 0.51);
      box(g, 0.09, 0.24, 0.05, tailMat(), sgn * W * 0.42, 0.95, -L * 0.51);
      box(g, 0.1, 0.34, 0.95, dark, sgn * (W / 2 - 0.01), 0.8, L * 0.32); // flares
      box(g, 0.1, 0.34, 0.95, dark, sgn * (W / 2 - 0.01), 0.8, -L * 0.32);
    }
    mirrors(g, W, 1.5, L * 0.18);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14), mat(0x1e1e22, 1, 0));
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.05, -L / 2 - 0.13);
    spare.castShadow = true;
    g.add(spare);
    box(g, W, 0.24, 0.12, dark, 0, 0.4, -L * 0.53); // rear bumper
  } else if (def.id === 'mustang') {
    // 2026 Mustang Dark Horse, built from Ian's model sheet: Blue Ember,
    // long vented hood, slim DRL headlights over a wide honeycomb grille,
    // fastback roofline with a sloped rear glass, muscular rear haunches,
    // tri-bar taillights, GT wing, quad exhausts.
    const mDark = mat(0x0c0d10, 0.85, 0.1);
    const trim = mat(0x16181c, 0.7, 0.2);
    box(g, W, 0.52, L, body, 0, 0.52, 0); // base body
    box(g, W * 0.97, 0.3, L * 0.44, body, 0, 0.88, L * 0.26); // long hood
    // hood vent + slats
    box(g, W * 0.42, 0.05, L * 0.2, mDark, 0, 1.04, L * 0.3);
    box(g, W * 0.42, 0.02, 0.05, trim, 0, 1.06, L * 0.24);
    box(g, W * 0.42, 0.02, 0.05, trim, 0, 1.06, L * 0.36);
    // face: wide grille, pony badge, lower intake, splitter
    box(g, W * 0.74, 0.34, 0.08, mDark, 0, 0.64, L * 0.5);
    box(g, 0.18, 0.11, 0.03, mat(0xb9c0c8, 0.35, 0.7), 0, 0.64, L * 0.545); // pony
    box(g, W * 0.62, 0.2, 0.06, mDark, 0, 0.31, L * 0.5);
    box(g, W * 1.0, 0.07, 0.3, trim, 0, 0.15, L * 0.46); // splitter
    // slim headlights + amber DRL strips
    for (const sgn of [1, -1]) {
      box(g, 0.44, 0.09, 0.06, mDark, sgn * W * 0.33, 0.84, L * 0.49);
      box(g, 0.4, 0.03, 0.02, mat(0xd88f2a, 0.4, 0), sgn * W * 0.33, 0.87, L * 0.525);
    }
    // fastback cabin: set well back, glass band, sloped rear glass to deck
    box(g, W * 0.9, 0.46, L * 0.42, body, 0, 1.0, -L * 0.13);
    box(g, W * 0.84, 0.32, L * 0.38, glass(), 0, 1.08, -L * 0.12);
    box(g, W * 0.8, 0.06, L * 0.26, body, 0, 1.27, -L * 0.18); // roof panel
    const rearGlass = box(g, W * 0.78, 0.04, L * 0.3, glass(), 0, 1.08, -L * 0.33);
    rearGlass.rotation.x = -0.62; // the fastback slope
    // rear haunches + rocker skirts + mirrors
    box(g, W * 1.03, 0.36, L * 0.3, body, 0, 0.74, -L * 0.33);
    for (const sgn of [1, -1]) {
      box(g, 0.06, 0.15, L * 0.42, trim, sgn * (W / 2 + 0.01), 0.27, -L * 0.02);
      box(g, 0.07, 0.1, 0.12, trim, sgn * (W / 2 + 0.05), 1.14, L * 0.06);
    }
    // tail: black decklid panel, tri-bar lights, diffuser, quad exhausts
    box(g, W * 0.82, 0.27, 0.05, mDark, 0, 0.8, -L * 0.5);
    for (const sgn of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        box(g, 0.06, 0.2, 0.03, tailMat(), sgn * (W * 0.2 + i * 0.1), 0.8, -L * 0.53);
      }
      box(g, 0.09, 0.07, 0.07, chrome(), sgn * W * 0.3, 0.27, -L * 0.51);
      box(g, 0.09, 0.07, 0.07, chrome(), sgn * W * 0.19, 0.27, -L * 0.51);
    }
    box(g, W * 0.72, 0.15, 0.08, mDark, 0, 0.22, -L * 0.5); // diffuser
    // GT wing on uprights
    for (const sgn of [1, -1]) box(g, 0.06, 0.24, 0.1, trim, sgn * W * 0.3, 1.05, -L * 0.45);
    box(g, W * 0.88, 0.05, 0.34, trim, 0, 1.19, -L * 0.46);
  } else {
    // sedan: clean four-door — sloped hood, glass cabin, trunk lip
    box(g, W, 0.5, L, body, 0, 0.55, 0); // lower body
    const hood = box(g, W * 0.96, 0.2, L * 0.3, body, 0, 0.86, L * 0.32);
    hood.rotation.x = 0.05; // gentle hood slope
    box(g, W * 0.92, 0.5, L * 0.46, body, 0, 1.06, -L * 0.04); // cabin
    box(g, W * 0.86, 0.36, L * 0.42, glass(), 0, 1.15, -L * 0.04); // glass band
    box(g, W * 0.84, 0.07, L * 0.4, body, 0, 1.37, -L * 0.05); // roof
    box(g, W * 0.9, 0.09, 0.22, body, 0, 0.86, -L * 0.43); // trunk lip
    box(g, W * 0.52, 0.15, 0.05, dark, 0, 0.6, L * 0.505); // grille
    for (const sgn of [1, -1]) {
      box(g, 0.32, 0.09, 0.05, lampMat(), sgn * W * 0.31, 0.76, L * 0.5);
      box(g, 0.34, 0.07, 0.04, tailMat(), sgn * W * 0.28, 0.78, -L * 0.505);
      box(g, 0.02, 0.04, 0.14, dark, sgn * (W / 2 + 0.005), 0.92, L * 0.08); // handles
      box(g, 0.02, 0.04, 0.14, dark, sgn * (W / 2 + 0.005), 0.92, -L * 0.14);
    }
    mirrors(g, W, 1.18, L * 0.14);
    box(g, W, 0.2, 0.1, dark, 0, 0.34, L * 0.52); // bumpers
    box(g, W, 0.2, 0.1, dark, 0, 0.34, -L * 0.52);
  }
  // wheels
  const wr =
    def.id === 'f250' ? 0.44 :
    def.id === 'pickup' ? 0.4 :
    def.id === 'bronco' ? 0.38 :
    def.id === 'van' ? 0.36 :
    def.id === 'semi' || def.id === 'boxtruck' ? 0.42 :
    def.id === 'apc' ? 0.46 : 0.33;
  v.wheelR = wr;
  const ww = def.id === 'apc' ? 0.34 : def.id === 'pickup' || def.id === 'f250' || def.id === 'bronco' ? 0.3 : 0.24;
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
  const dark = darkTrim();
  if (def.kind === 'atv') {
    // quad: fenders over every wheel, racks, bars, footboards
    v.wheelR = 0.32;
    box(g, 1.0, 0.28, 1.85, body, 0, 0.6, 0); // chassis/body
    box(g, 0.55, 0.16, 0.75, mat(0x1e1e22), 0, 0.82, -0.18); // seat
    box(g, 0.6, 0.2, 0.35, body, 0, 0.78, 0.62); // front bodywork
    for (const sgn of [1, -1]) {
      box(g, 0.3, 0.05, 0.8, dark, sgn * 0.5, 0.34, 0); // footboards
      box(g, 0.06, 0.1, 0.3, lampMat(), sgn * 0.18, 0.72, 0.99); // headlights
    }
    for (const [sx, sz] of [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]] as [number, number][]) {
      box(g, 0.34, 0.07, 0.78, body, sx * 0.52, 0.72, sz); // fender over wheel
      wheel(g, 0.32, 0.24, sx * 0.52, 0.32, sz, v.wheelSpin, sz > 0 ? v.wheelPivots : undefined);
    }
    box(g, 1.0, 0.05, 0.38, dark, 0, 0.86, 0.88); // front rack
    box(g, 1.0, 0.05, 0.38, dark, 0, 0.86, -0.88); // rear rack
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), mat(0x2b2f36, 0.5, 0.5));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.02, 0.62);
    g.add(bar);
    return;
  }
  if (def.kind === 'moto') {
    // dirt bike: slim tank, long flat seat, high fenders, number plate
    v.wheelR = 0.36;
    box(g, 0.28, 0.24, 0.95, body, 0, 0.86, 0.12); // tank/shrouds
    box(g, 0.26, 0.09, 0.95, mat(0x1e1e22), 0, 0.99, -0.32); // long seat
    const ff = box(g, 0.34, 0.05, 0.5, body, 0, 0.78, 0.82);
    ff.rotation.x = -0.25; // high front fender
    const rf = box(g, 0.3, 0.05, 0.45, body, 0, 0.92, -0.85);
    rf.rotation.x = 0.45; // kicked rear fender
    box(g, 0.3, 0.34, 0.04, mat(0xe8e8e2, 0.6, 0), 0, 0.95, 0.86); // number plate
    box(g, 0.34, 0.1, 0.5, mat(0x2b2f36, 0.8, 0.1), 0, 0.42, -0.05); // skid/engine
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 8), mat(0x2b2f36, 0.5, 0.5));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.08, 0.68);
    g.add(bar);
    wheel(g, 0.36, 0.13, 0, 0.36, 0.82, v.wheelSpin, v.wheelPivots);
    wheel(g, 0.36, 0.14, 0, 0.36, -0.82, v.wheelSpin);
    return;
  }
  // sport bike: full fairing wedge, windscreen, raised tail, low exhaust
  v.wheelR = 0.32;
  box(g, 0.3, 0.26, 1.15, body, 0, 0.74, 0.08); // tank/frame
  const fairing = box(g, 0.42, 0.44, 0.62, body, 0, 0.8, 0.52);
  fairing.rotation.x = 0.3; // nose wedge
  const screen = box(g, 0.3, 0.24, 0.04, glass(), 0, 1.06, 0.62);
  screen.rotation.x = -0.5; // windscreen
  box(g, 0.28, 0.13, 0.6, mat(0x1e1e22), 0, 0.94, -0.32); // seat
  const tail = box(g, 0.24, 0.1, 0.35, body, 0, 1.0, -0.68);
  tail.rotation.x = -0.3; // raised tail
  for (const sgn of [1, -1]) box(g, 0.2, 0.07, 0.05, lampMat(), sgn * 0.09, 0.86, 0.83); // twin lamps
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.7, 8), chrome());
  exh.rotation.x = Math.PI / 2;
  exh.position.set(0.16, 0.42, -0.25);
  g.add(exh);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), mat(0x2b2f36, 0.5, 0.5));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.02, 0.66);
  g.add(bar);
  wheel(g, 0.32, 0.1, 0, 0.32, 0.8, v.wheelSpin, v.wheelPivots);
  wheel(g, 0.32, 0.12, 0, 0.32, -0.8, v.wheelSpin);
}

function buildSkiff(g: THREE.Group, def: VehicleDef): void {
  // flat-bottom skiff: floor, side walls, tapered bow, benches, outboard
  const hull = mat(def.color, 0.8, 0.1);
  const wood = mat(0x6b4a2f, 0.9, 0);
  box(g, 1.8, 0.12, 4.9, hull, 0, 0.2, -0.2); // floor
  for (const sgn of [1, -1]) {
    box(g, 0.08, 0.52, 4.9, hull, sgn * 0.9, 0.48, -0.2); // side walls
    box(g, 0.1, 0.06, 4.9, wood, sgn * 0.9, 0.76, -0.2); // gunwale rails
    const bowSide = box(g, 0.08, 0.52, 1.3, hull, sgn * 0.62, 0.48, 2.55);
    bowSide.rotation.y = -sgn * 0.5; // bow panels angle in
  }
  box(g, 1.85, 0.52, 0.08, hull, 0, 0.48, -2.62); // transom
  const deck = box(g, 1.0, 0.08, 1.1, hull, 0, 0.72, 2.6);
  deck.scale.x = 0.7; // bow deck
  box(g, 1.7, 0.08, 0.4, wood, 0, 0.6, 0.5); // benches
  box(g, 1.7, 0.08, 0.4, wood, 0, 0.6, -1.1);
  box(g, 0.5, 0.35, 0.4, mat(0x3a4148, 0.8, 0.1), 0, 0.45, -0.3); // console/livewell
  // outboard: cowling + shaft + fin
  box(g, 0.42, 0.55, 0.32, mat(0x23272c, 0.6, 0.3), 0, 0.85, -2.78);
  box(g, 0.1, 0.55, 0.14, mat(0x23272c, 0.6, 0.3), 0, 0.35, -2.82);
  box(g, 0.04, 0.22, 0.3, mat(0x23272c, 0.6, 0.3), 0, 0.05, -2.86);
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
    suspV: 0,
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
    const condF = 0.6 + 0.4 * v.condition;

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
      v.speed += th * (topF / 2.9) * power * (onSand ? 0.8 : 1) * dt;
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
    const rideH = def.kind === 'atv' || def.kind === 'bike' || def.kind === 'moto' ? 0.05 : 0.02;
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
    const pitchTarget = terrainPitch + clamp(-accel * 0.005, -0.045, 0.06); // nose dives on brake, lifts on launch
    const leansIn = def.kind === 'bike' || def.kind === 'moto'; // NOT the ATV — four wheels roll like a car
    const rollTarget = terrainRoll + (leansIn
      ? v.steerAngle * clamp(Math.abs(v.speed) / 8, 0, 1) * 0.5 * Math.sign(v.speed || 1) // bikes lean IN
      : -v.steerAngle * speedRatio * 0.05); // cars + ATV roll OUT, a little
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
