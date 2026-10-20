// Vehicles.ts — the 13-vehicle roster, procedural meshes, arcade driving
// physics (arcade, honest fuel + wear from the spec), enter/exit, ramming.
// Wave 1: driving core. Trailers ship next wave.

import * as THREE from 'three';
import { clamp } from './rng';
import { resolveCollisions, type Collider } from './Colliders';
import { ITEMS } from '../data/items';
import type { InvItem } from '../store/types';
import {
  accelFactor, collisionLossFactor, ramDamageFactor, sandFactor, topSpeedFactor, wearFactor,
} from '../data/upgrades';

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
  storageKg: number; // trunk / bed / cargo capacity
  tracked?: boolean; // tank: tracks not wheels, crushes, near-indestructible
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

/** Walk-in interior volume in entity-local space (rear is -Z local). */
export interface InteriorSpec {
  halfW: number;
  zFront: number;
  zRear: number;
  floorY: number; // floor height above the entity group origin
  doorHalfW: number; // rear opening half-width (passable when doors are open)
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
  { id: 'sportbike', name: 'Sport Bike', kind: 'bike', length: 2.1, width: 0.7, fuelMax: 12, burnClass: 0.5, topSpeed: 30, noiseDrive: 40, color: 0xc23b2e, storageKg: 5 },
  { id: 'motocross', name: 'Dirt Bike', kind: 'moto', length: 2.2, width: 0.8, fuelMax: 10, burnClass: 0.5, topSpeed: 26, noiseDrive: 45, color: 0x3a6ea5, storageKg: 5 },
  { id: 'atv', name: 'ATV', kind: 'atv', length: 2.1, width: 1.1, fuelMax: 15, burnClass: 0.6, topSpeed: 19, noiseDrive: 42, color: 0x4a5230, storageKg: 25 },
  { id: 'skiff', name: 'Skiff', kind: 'skiff', length: 5.5, width: 2.0, fuelMax: 24, burnClass: 0.9, topSpeed: 14, noiseDrive: 38, color: 0xd8d8d0, water: true, storageKg: 120 },
  { id: 'sedan', name: 'Sedan', kind: 'car', length: 4.7, width: 1.8, fuelMax: 40, burnClass: 1.0, topSpeed: 21, noiseDrive: 45, color: 0x5a6a7a, storageKg: 70 },
  { id: 'mustang', name: 'Mustang Dark Horse', kind: 'car', length: 4.8, width: 1.9, fuelMax: 45, burnClass: 1.1, topSpeed: 42, noiseDrive: 55, color: 0x2f4d7d, storageKg: 45 },
  { id: 'van', name: 'Utility Van', kind: 'car', length: 5.2, width: 2.0, fuelMax: 55, burnClass: 1.3, topSpeed: 19, noiseDrive: 50, color: 0xb8b8b0, storageKg: 260 },
  { id: 'sprinter', name: 'Sprinter Van', kind: 'car', length: 6.0, width: 2.05, fuelMax: 75, burnClass: 1.4, topSpeed: 18, noiseDrive: 48, color: 0x9aa4ac, storageKg: 380 },
  { id: 'bronco', name: 'Bronco 4x4', kind: 'car', length: 4.6, width: 1.9, fuelMax: 55, burnClass: 1.3, topSpeed: 21, noiseDrive: 55, color: 0x4a5a3a, storageKg: 130 },
  { id: 'pickup', name: 'Pickup', kind: 'car', length: 5.3, width: 1.9, fuelMax: 60, burnClass: 1.3, topSpeed: 20, noiseDrive: 55, color: 0x5f7285, storageKg: 320 },
  { id: 'f250', name: 'F-250 Dually', kind: 'car', length: 5.9, width: 2.0, fuelMax: 70, burnClass: 1.4, topSpeed: 20, noiseDrive: 55, color: 0x2e2e32, storageKg: 420 },
  { id: 'boxtruck', name: 'Box Truck', kind: 'car', length: 7.5, width: 2.5, fuelMax: 90, burnClass: 1.8, topSpeed: 16, noiseDrive: 58, color: 0xd8d4c8, storageKg: 900 },
  { id: 'semi', name: 'Semi Tractor', kind: 'car', length: 6.5, width: 2.5, fuelMax: 200, burnClass: 2.5, topSpeed: 15, noiseDrive: 60, color: 0x3a3f45, storageKg: 120 },
  { id: 'semi_day', name: 'Semi Day Cab', kind: 'car', length: 5.8, width: 2.5, fuelMax: 160, burnClass: 2.3, topSpeed: 16, noiseDrive: 58, color: 0x6e3b32, storageKg: 100 },
  { id: 'goliath', name: 'Goliath 6x6', kind: 'car', length: 6.8, width: 2.6, fuelMax: 150, burnClass: 3.0, topSpeed: 13, noiseDrive: 65, color: 0x4a5230, storageKg: 260 },
  { id: 'tank', name: 'Battle Tank', kind: 'car', length: 7.4, width: 3.3, fuelMax: 190, burnClass: 4.2, topSpeed: 9, noiseDrive: 85, color: 0x4a4f42, storageKg: 160, tracked: true },
];

/** Semi tractor paint rotation — the Stitch charcoal leads, fleets vary. */
export const SEMI_PAINTS = [0x3a3f45, 0x7a2020, 0x2e4a5a, 0x5c5648];

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
  turret?: THREE.Group; // goliath / tank weapon turret (aims with the camera)
  // --- vehicle & trailer wave state ---
  storage: InvItem[]; // what's riding in the trunk / bed / cargo bay
  upgrades: string[]; // installed upgrade ids (data/upgrades)
  tiresFlat: number; // blown tires: drag + pull until replaced
  flatSide: 1 | -1; // which way a flat pulls
  blewTire: boolean; // set by drive() on a blowout, consumed by Game (toast)
  colorPick: number; // semi paint variation index
  towedMassKg: number; // trailer + cargo mass, set by the trailer manager
  cargoCrates: number; // physical crates loaded (visual + mass)
  doors: DoorAnim[];
  interior?: InteriorSpec; // walk-in cargo space (sprinter)
  roofObj?: THREE.Object3D; // hidden while the player is inside, camera outside
  loadedOn: string | null; // trailer uid this vehicle is locked onto, if any
  upgradeGroup?: THREE.Group; // armor / racks / bullbar meshes
  cargoGroup?: THREE.Group; // loaded-crate meshes
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
  const { length: L, width: W } = def;
  const color = def.id === 'semi' ? SEMI_PAINTS[v.colorPick % SEMI_PAINTS.length] : def.color;
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
    // cab-over style box truck: white cargo cube, ANIMATED slatted roll door
    box(g, W, 2.2, L * 0.66, body, 0, 1.58, -L * 0.15); // cargo cube
    box(g, W * 0.84, 1.94, 0.03, mat(0x0b0d0f, 0.95, 0), 0, 1.5, -L * 0.482); // dark cargo throat behind the door
    const rollDoor = box(g, W * 0.8, 1.9, 0.05, mat(0xbdbab0, 0.7, 0.1), 0, 1.5, -L * 0.5); // roll door (slides up)
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.04, 0.02), darkTrim());
      slat.position.set(0, -0.65 + i * 0.45, -0.04);
      rollDoor.add(slat);
    }
    v.doors.push({ obj: rollDoor, kind: 'slide-up', base: 1.5, t: 0, target: 0 });
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
  } else if (def.id === 'semi' || def.id === 'semi_day') {
    // Long-hood tractor from the Stitch render: charcoal cab, vertical-bar
    // grille, chrome stacks/tanks, roof markers, cow-catcher guard. The
    // day cab drops the sleeper — same front face, shorter cab, and its
    // shorter wheelbase (def.length) is what makes it turn tighter.
    const day = def.id === 'semi_day';
    const cabD = day ? 1.9 : 3.0;
    const cabZ = L * 0.2 + (3.0 - cabD) / 2; // front face stays put
    const frontZ = cabZ + cabD / 2;
    box(g, W * 0.96, 1.72, cabD, body, 0, 1.36, cabZ); // cab (+sleeper on the semi)
    box(g, W * 0.98, 0.07, cabD + 0.05, body, 0, 2.25, cabZ); // cab roof
    box(g, W * 0.88, 0.52, 0.07, glass(), 0, 1.62, frontZ); // windshield
    box(g, W * 0.7, 0.85, 0.1, chrome(), 0, 0.95, frontZ + 0.03); // grille
    box(g, W * 0.9, 0.5, L * 0.14, body, 0, 0.62, L * 0.42); // hood snub
    box(g, W, 0.3, 0.14, chrome(), 0, 0.32, L * 0.52); // bumper
    for (let i = -1; i <= 1; i++) box(g, 0.12, 0.05, 0.04, mat(0xd88f2a, 0.4, 0), i * 0.3, 2.31, frontZ - 0.1); // roof markers
    // cow-catcher guard (the Stitch semi's signature): rails + teeth
    const guard = mat(0x2b2f36, 0.8, 0.3);
    box(g, W * 0.78, 0.09, 0.07, guard, 0, 0.92, L * 0.56);
    box(g, W * 0.78, 0.09, 0.07, guard, 0, 0.38, L * 0.58);
    for (let i = -2; i <= 2; i++) {
      const tooth = box(g, 0.09, 0.62, 0.07, guard, i * W * 0.17, 0.65, L * 0.57);
      tooth.rotation.x = 0.1;
    }
    for (const sgn of [1, -1]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), v.colorPick % 2 === 0 ? chrome() : mat(0x2b2f36, 0.6, 0.4));
      stack.position.set(sgn * (W / 2 - 0.12), 1.6, cabZ - cabD / 2 - 0.12);
      stack.castShadow = true;
      g.add(stack);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.3, 10), mat(0x6a7076, 0.35, 0.7));
      tank.rotation.x = Math.PI / 2;
      tank.position.set(sgn * (W / 2 - 0.05), 0.55, L * 0.28);
      g.add(tank);
      box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.32, 0.78, L * 0.51);
    }
    mirrors(g, W, 1.7, frontZ - 0.05, 0.12);
    box(g, W * 0.8, 0.3, 2.4, mat(0x2e3238), 0, 0.92, -L * 0.18); // fifth-wheel deck
  } else if (def.id === 'goliath') {
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
    // weapon turret group: empty ring mount until an MG / cannon upgrade
    // is bolted on (applyUpgradeVisuals fills it); Game aims it.
    const turret = new THREE.Group();
    turret.position.set(0, 2.2, 0.3);
    g.add(turret);
    v.turret = turret;
    // hull stowage: side boxes + rear spare, working-vehicle clutter
    for (const sgn of [1, -1]) box(g, 0.18, 0.4, 1.6, mat(0x454d3c, 0.9, 0.1), sgn * (W / 2 + 0.02), 1.15, -L * 0.28);
    const gspare = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.24, 14), mat(0x1e1e22, 1, 0));
    gspare.rotation.x = Math.PI / 2;
    gspare.position.set(0, 1.1, -L / 2 - 0.1);
    gspare.castShadow = true;
    g.add(gspare);
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
  } else if (def.id === 'sprinter') {
    // Tall cargo van: real cab + a HOLLOW walk-in cargo box with twin
    // rear doors that swing open — you can step in the back and load it.
    const inner = mat(0x59616a, 0.9, 0.05);
    box(g, W * 0.98, 1.06, L * 0.26, body, 0, 0.9, L * 0.36); // cab
    const shieldS = box(g, W * 0.9, 0.58, 0.07, glass(), 0, 1.48, L * 0.48);
    shieldS.rotation.x = -0.1; // raked windshield
    box(g, W * 0.96, 0.4, L * 0.13, body, 0, 0.52, L * 0.44); // snub hood
    box(g, W * 0.66, 0.2, 0.06, dark, 0, 0.5, L * 0.51); // grille
    for (const sgn of [1, -1]) {
      box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.34, 0.76, L * 0.51);
      box(g, 0.07, 0.34, 0.05, tailMat(), sgn * W * 0.44, 1.0, -L * 0.51);
    }
    mirrors(g, W, 1.5, L * 0.44, 0.08);
    box(g, W, 0.24, 0.12, dark, 0, 0.32, L * 0.52); // bumper
    // cargo shell: floor / side walls / roof / front wall — a real inside
    const cz = -L * 0.13;
    const cd = L * 0.72;
    box(g, W * 0.96, 0.08, cd, inner, 0, 0.52, cz); // floor (top ≈ 0.56)
    box(g, 0.07, 1.62, cd, body, -(W / 2 - 0.035), 1.37, cz);
    box(g, 0.07, 1.62, cd, body, W / 2 - 0.035, 1.37, cz);
    const roofS = box(g, W, 0.07, cd, body, 0, 2.21, cz);
    v.roofObj = roofS;
    box(g, W, 1.62, 0.07, body, 0, 1.37, cz + cd / 2); // front wall (behind cab)
    box(g, W, 0.26, 0.07, body, 0, 2.05, cz - cd / 2); // header over the doors
    // interior ribs + a work light so the inside reads as a space
    for (let i = 0; i < 3; i++) box(g, W * 0.9, 0.05, 0.08, inner, 0, 2.14, cz - cd * 0.3 + i * cd * 0.3);
    box(g, 0.3, 0.04, 0.12, mat(0xd8cf9a, 0.4, 0), 0, 2.15, cz); // cargo lamp
    // twin rear doors, hinged at the sides (+X hinge swings with -Y rot)
    for (const sgn of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sgn * (W / 2 - 0.03), 1.28, cz - cd / 2);
      g.add(pivot);
      const leaf = box(pivot, W / 2 - 0.05, 1.5, 0.05, body, -sgn * (W / 4 - 0.01), 0, 0);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), glass());
      win.position.set(0, 0.42, -0.04);
      leaf.add(win); // door window
      v.doors.push({ obj: pivot, kind: sgn > 0 ? 'swing-l' : 'swing-r', base: 0, t: 0, target: 0 });
    }
    v.interior = { halfW: W / 2 - 0.17, zFront: L * 0.2, zRear: -L * 0.47, floorY: 0.56, doorHalfW: W / 2 - 0.08 };
  } else if (def.id === 'tank') {
    // Tracked armor: no wheels — long track housings with road wheels,
    // a sloped glacis, and a turret whose cannon is very real.
    const armor = mat(color, 0.85, 0.25);
    const trackM = mat(0x22241f, 1, 0);
    for (const sgn of [1, -1]) {
      box(g, 0.62, 0.95, L * 0.98, trackM, sgn * (W / 2 - 0.31), 0.55, 0); // track housing
      for (let i = 0; i < 5; i++) {
        const rw = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.66, 10), mat(0x363a31, 0.9, 0.1));
        rw.rotation.z = Math.PI / 2;
        rw.position.set(sgn * (W / 2 - 0.31), 0.36, -L * 0.36 + i * L * 0.18);
        rw.castShadow = true;
        g.add(rw);
      }
      box(g, 0.66, 0.16, L * 0.9, armor, sgn * (W / 2 - 0.31), 1.1, 0); // track top skirt
    }
    box(g, W * 0.72, 0.78, L * 0.94, armor, 0, 1.06, 0); // hull
    const glacis = box(g, W * 0.72, 0.72, 0.12, armor, 0, 1.02, L * 0.47);
    glacis.rotation.x = -0.45; // sloped nose
    box(g, W * 0.7, 0.16, L * 0.52, armor, 0, 1.52, -L * 0.12); // rear deck
    for (const sgn of [1, -1]) box(g, 0.24, 0.06, 0.05, lampMat(), sgn * W * 0.26, 1.24, L * 0.52); // headlights
    // turret: hull ring + slab turret + long cannon with muzzle brake
    const turret = new THREE.Group();
    turret.position.set(0, 1.6, -L * 0.02);
    g.add(turret);
    box(turret, 1.7, 0.52, 2.2, armor, 0, 0.26, -0.1);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 3.4, 10), mat(0x3a3e35, 0.55, 0.4));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.34, 2.35);
    barrel.castShadow = true;
    turret.add(barrel);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), mat(0x2c2f29, 0.7, 0.3));
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.34, 3.85);
    turret.add(brake);
    box(turret, 0.62, 0.1, 0.62, mat(0x2c2f29, 0.8, 0.2), 0.32, 0.57, -0.35); // hatch
    box(turret, 1.2, 0.3, 0.5, mat(0x454d3c, 0.9, 0.1), 0, 0.3, -1.35); // turret basket stowage
    v.turret = turret;
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
  // wheels (the tank rides on its modeled tracks instead)
  if (def.id === 'tank') { v.wheelR = 0.5; return; }
  const wr =
    def.id === 'f250' ? 0.44 :
    def.id === 'pickup' ? 0.4 :
    def.id === 'bronco' ? 0.38 :
    def.id === 'van' || def.id === 'sprinter' ? 0.36 :
    def.id === 'semi' || def.id === 'semi_day' || def.id === 'boxtruck' ? 0.42 :
    def.id === 'goliath' ? 0.46 : 0.33;
  v.wheelR = wr;
  const ww = def.id === 'goliath' ? 0.34 : def.id === 'pickup' || def.id === 'f250' || def.id === 'bronco' ? 0.3 : 0.24;
  const nAxle = def.id === 'semi' || def.id === 'semi_day' || def.id === 'goliath' || def.id === 'boxtruck' ? 3 : 2;
  const axleZs = nAxle === 3 ? [L * 0.32, -L * 0.1, -L * 0.32] : [L * 0.32, -L * 0.32];
  axleZs.forEach((az, i) => {
    for (const sx of [-1, 1]) {
      wheel(g, wr, ww, (sx * (W / 2 - 0.05)), wr, az, v.wheelSpin, i === 0 ? v.wheelPivots : undefined);
    }
  });
  if (def.id === 'f250') {
    // the dually: paired rear wheels — the mid-tier tow class shows it
    for (const sx of [-1, 1]) wheel(g, wr, 0.22, sx * (W / 2 - 0.3), wr, -L * 0.32, v.wheelSpin);
  }
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
    storage: [],
    upgrades: [],
    tiresFlat: 0,
    flatSide: 1,
    blewTire: false,
    colorPick: def.id === 'semi' ? Math.floor(Math.random() * SEMI_PAINTS.length) : 0,
    towedMassKg: 0,
    cargoCrates: 0,
    doors: [],
    loadedOn: null,
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
  { id: 'semi_day', poi: 'dune_cache', dx: 38, dz: -30, heading: Math.PI / 2 },
  { id: 'sprinter', poi: 'town', dx: 88, dz: 58, heading: Math.PI },
  { id: 'goliath', poi: 'lighthouse_base', dx: 12, dz: -8, heading: -Math.PI / 2 },
  { id: 'tank', poi: 'lighthouse_base', dx: 24, dz: -18, heading: -Math.PI / 2 },
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
      if (v.loadedOn) continue; // riding a trailer deck — not enterable
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** World position of a vehicle's rear hitch point (behind the bumper). */
  hitchWorld(v: Vehicle): { x: number; z: number } {
    const p = v.group.position;
    const back = v.def.length / 2 + 0.35;
    return { x: p.x - Math.sin(v.heading) * back, z: p.z - Math.cos(v.heading) * back };
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

    // longitudinal: power curve launch, real brakes, aero + rolling drag.
    // Load matters: a hitched trailer's mass (towedMassKg, set by the
    // trailer manager) and blown tires cut the top end and the pull;
    // an engine tune buys some of it back (data/upgrades math).
    const surfaceTop = onSand ? sandFactor(v.upgrades) : 1;
    const topF = def.topSpeed * condF * surfaceTop * (inWater ? 0.3 : 1)
      * topSpeedFactor(v.upgrades, v.towedMassKg, v.tiresFlat);
    const accelF = accelFactor(v.upgrades, v.towedMassKg);
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
    // tracked vehicles pivot on their tracks at a standstill
    if (def.tracked && Math.abs(v.speed) < 1.2 && Math.abs(th) < 0.05 && Math.abs(steer) > 0.1) {
      v.heading -= clamp(steer, -1, 1) * 1.1 * dt;
    }
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
    if (clipped && Math.abs(v.speed) > 5) {
      if (def.tracked) {
        env.noise(pos.x, pos.z, 26); // the building loses; the tank doesn't notice
      } else {
        v.condition = Math.max(0, v.condition - 0.02 * collisionLossFactor(v.upgrades));
        env.noise(pos.x, pos.z, 18);
        // a hard hit on a worn vehicle can blow a tire (run-flats prevent it)
        if (v.condition < 0.3 && v.tiresFlat < 2 && !v.upgrades.includes('run_flats') && Math.random() < 0.45) {
          v.tiresFlat += 1;
          v.flatSide = Math.random() < 0.5 ? 1 : -1;
          v.blewTire = true;
          env.noise(pos.x, pos.z, 30);
        }
      }
    }
    pos.x = p3.x;
    pos.z = p3.z;
    if (clipped) v.speed *= def.tracked ? 0.88 : 0.35;

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
    const rideH = (def.kind === 'atv' || def.kind === 'bike' || def.kind === 'moto' ? 0.05 : 0.02)
      + (v.upgrades.includes('lift_kit') ? 0.1 : 0);
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
      v.condition = Math.max(0, v.condition - (0.02 / 60) * (0.3 + speedRatio) * dt * wearFactor(v.upgrades));
    }
    if (Math.abs(v.speed) > 4) {
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      const crush = !!def.tracked; // the tank flattens what it touches
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
    if (def.water) {
      for (const w of v.wheelSpin) w.rotation.x += (v.speed / v.wheelR) * dt;
    }
  }
}

// ---------------------------------------------------------------------------
// Upgrade + cargo visuals: installed upgrades and loaded crates are real
// meshes on the vehicle, rebuilt whenever the state changes.
// ---------------------------------------------------------------------------

/** Rebuild the visible upgrade hardware (armor, racks, bullbar, weapons). */
export function applyUpgradeVisuals(v: Vehicle): void {
  if (v.upgradeGroup) {
    v.group.remove(v.upgradeGroup);
    v.upgradeGroup = undefined;
  }
  if (v.turret) {
    const old = v.turret.getObjectByName('weaponMount');
    if (old) v.turret.remove(old);
  }
  if (v.upgrades.length === 0) return;
  const g = new THREE.Group();
  const { length: L, width: W } = v.def;
  const steel = mat(0x3d434b, 0.6, 0.5);
  const dark = darkTrim();
  if (v.upgrades.includes('armor')) {
    // welded plate over doors, hood, and quarters
    for (const sgn of [1, -1]) {
      box(g, 0.06, 0.62, L * 0.52, steel, sgn * (W / 2 + 0.02), 0.95, L * 0.02);
      box(g, 0.06, 0.5, L * 0.3, steel, sgn * (W / 2 + 0.02), 0.8, -L * 0.33);
    }
    box(g, W * 0.8, 0.06, L * 0.3, steel, 0, 1.22, L * 0.32);
  }
  if (v.upgrades.includes('cargo_racks') && v.def.kind === 'car') {
    if (v.def.id === 'pickup' || v.def.id === 'f250') {
      // bed rails + a headache rack behind the cab
      for (const sgn of [1, -1]) box(g, 0.05, 0.22, L * 0.36, dark, sgn * (W / 2 - 0.05), 1.42, -L * 0.3);
      box(g, W * 0.9, 0.3, 0.05, dark, 0, 1.5, -L * 0.12);
    } else if (v.def.id !== 'goliath' && v.def.id !== 'tank') {
      const roofY = v.def.id === 'van' ? 2.2 : v.def.id === 'sprinter' ? 2.3 : v.def.id === 'boxtruck' ? 2.75 : 1.5;
      for (const sgn of [1, -1]) box(g, 0.06, 0.06, L * 0.44, dark, sgn * W * 0.3, roofY, -L * 0.05);
      for (let i = 0; i < 3; i++) box(g, W * 0.64, 0.05, 0.09, dark, 0, roofY + 0.02, -L * 0.05 + (i - 1) * L * 0.16);
    }
  }
  if (v.upgrades.includes('bullbar')) {
    // a heavier welded push bar than any factory guard
    box(g, W * 0.72, 0.12, 0.09, steel, 0, 0.98, L / 2 + 0.16);
    box(g, W * 0.72, 0.12, 0.09, steel, 0, 0.5, L / 2 + 0.2);
    for (const sgn of [1, -1]) box(g, 0.1, 0.66, 0.09, steel, sgn * W * 0.3, 0.74, L / 2 + 0.18);
    box(g, W * 0.5, 0.3, 0.06, steel, 0, 0.74, L / 2 + 0.2); // center plate
  }
  v.group.add(g);
  v.upgradeGroup = g;

  // weapons live on the turret so they aim with it
  if (v.turret) {
    const w = new THREE.Group();
    w.name = 'weaponMount';
    if (v.upgrades.includes('mg_mount')) {
      box(w, 0.22, 0.22, 0.7, dark, 0, 0.18, 0.3); // receiver
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), mat(0x1c1f24, 0.5, 0.5));
      b.rotation.x = Math.PI / 2;
      b.position.set(0, 0.24, 1.0);
      w.add(b);
      box(w, 0.5, 0.34, 0.05, steel, 0, 0.16, 0.62); // gun shield
      box(w, 0.16, 0.2, 0.3, mat(0x5c5648, 0.8, 0.1), 0.24, 0.1, 0.15); // ammo can
    }
    if (v.upgrades.includes('cannon_40')) {
      box(w, 0.9, 0.5, 1.3, mat(v.def.color, 0.7, 0.3), 0, 0.22, 0.1); // turret bustle
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 2.0, 10), mat(0x2c2f29, 0.55, 0.4));
      b.rotation.x = Math.PI / 2;
      b.position.set(0, 0.3, 1.5);
      b.castShadow = true;
      w.add(b);
      const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), mat(0x22241f, 0.7, 0.3));
      brake.rotation.x = Math.PI / 2;
      brake.position.set(0, 0.3, 2.45);
      w.add(brake);
    }
    if (v.upgrades.includes('tank_coax')) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), mat(0x1c1f24, 0.5, 0.5));
      b.rotation.x = Math.PI / 2;
      b.position.set(0.42, 0.34, 1.6);
      w.add(b);
      box(w, 0.18, 0.16, 0.4, dark, 0.42, 0.3, 0.6); // coax receiver
    }
    if (w.children.length) v.turret.add(w);
  }
  if (v.upgrades.includes('tank_reactive')) {
    const g2 = new THREE.Group();
    const era = mat(0x596048, 0.85, 0.15);
    for (const sgn of [1, -1]) {
      for (let i = 0; i < 4; i++) box(g2, 0.1, 0.34, 0.8, era, sgn * (W * 0.37 + 0.03), 1.1, -L * 0.3 + i * L * 0.19);
    }
    const plow = box(g2, W * 0.78, 0.55, 0.1, mat(0x3d434b, 0.6, 0.5), 0, 0.55, L / 2 + 0.22);
    plow.rotation.x = 0.35; // ram plow
    v.group.add(g2);
    if (v.upgradeGroup) v.upgradeGroup.add(g2);
  }
}

/** Rebuild the physical crate meshes riding in a bed / cargo bay. */
export function refreshCargoVisuals(v: Vehicle): void {
  if (v.cargoGroup) {
    v.group.remove(v.cargoGroup);
    v.cargoGroup = undefined;
  }
  const n = Math.min(v.cargoCrates, 6);
  if (n <= 0) return;
  const id = v.def.id;
  // only open/visible cargo areas get meshes; sealed vehicles carry inside
  if (id !== 'pickup' && id !== 'f250' && id !== 'sprinter' && id !== 'bronco') return;
  const g = new THREE.Group();
  const wood = mat(0x7a5c38, 0.9, 0);
  const frame = mat(0x4c3a22, 0.95, 0);
  const L = v.def.length;
  const floorY = id === 'sprinter' ? 0.6 : id === 'bronco' ? 1.0 : 0.9;
  const z0 = id === 'sprinter' ? -L * 0.32 : -L * 0.3;
  for (let i = 0; i < n; i++) {
    const cx = (i % 2 === 0 ? -0.42 : 0.42) * (v.def.width / 2);
    const cz = z0 - Math.floor(i / 2) * 0.72;
    const crate = box(g, 0.64, 0.5, 0.64, wood, cx, floorY + 0.25, cz);
    for (const fy of [0.22, -0.22]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.68), frame);
      band.position.set(0, fy, 0);
      crate.add(band);
    }
  }
  v.group.add(g);
  v.cargoGroup = g;
}
