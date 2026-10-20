// Vehicles.ts — the 13-vehicle roster, procedural meshes, arcade driving
// physics (arcade, honest fuel + wear from the spec), enter/exit, ramming.
// Wave 1: driving core. Trailers ship next wave.

import * as THREE from 'three';
import { clamp } from './rng';
import { resolveCollisions, type Collider } from './Colliders';
import { CARRIER_DECK_Y } from './Airbase';
import { approach, hoverDamping, landingSeverity, liftAuthority, tiltForVelocity } from './heliMath';
import { wrapAngle } from './trailerPhysics';
import { ITEMS } from '../data/items';
import type { InvItem } from '../store/types';
import {
  accelFactor, collisionLossFactor, ramDamageFactor, sandFactor, topSpeedFactor, wearFactor,
} from '../data/upgrades';
import { box, darkTrim, glassTint, loftMesh, mat, tube } from './modelKit';
import { buildStallion, applyStallionUpgrades } from './carModels';
import { buildBoxtruck, buildBronco, buildF250, buildPickup, buildSemi } from './truckModels';
import { buildGoliath, buildSedan, buildSprinter, buildTank, buildV03, buildVan } from './vanModels';
import { buildATV, buildMarshBuggy, buildMotocross, buildSkiff as buildSkiffModel, buildSportbike } from './smallModels';
import {
  cgHeightM, cornerRoll, effectiveSteerAngle, impactBounce, impactDamage,
  understeerK, vehicleMassKg, weightTransferPitch,
} from './drivePhysics';

export { glassTint } from './modelKit';

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'bike' | 'moto' | 'atv' | 'skiff' | 'car' | 'heli';
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
  /** Balloon tires: sand imposes ~no penalty in the drive model. */
  sandRunner?: boolean;
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
  { id: 'marsh_buggy', name: 'Marsh Buggy', kind: 'car', length: 3.6, width: 1.9, fuelMax: 30, burnClass: 0.8, topSpeed: 17, noiseDrive: 52, color: 0xd8621e, storageKg: 40, sandRunner: true, armorMul: 1.6 },
  { id: 'skiff', name: 'Skiff', kind: 'skiff', length: 5.5, width: 2.0, fuelMax: 24, burnClass: 0.9, topSpeed: 14, noiseDrive: 38, color: 0xd8d8d0, water: true, storageKg: 120 },
  { id: 'tug', name: 'Armored Tug', kind: 'skiff', length: 13, width: 4.6, fuelMax: 160, burnClass: 2.2, topSpeed: 7, noiseDrive: 50, color: 0x4d565e, water: true, storageKg: 1500, armorMul: 0.3 },
  // helicopters (AIRBASE wave) — arcade flight on the drive loop
  { id: 'seahawk', name: 'MH-60S Sea Hawk', kind: 'heli', length: 13, width: 3.2, fuelMax: 220, burnClass: 3.5, topSpeed: 33, noiseDrive: 105, color: 0x707880, storageKg: 300 },
  { id: 'cargo_bob', name: 'CH-47 Cargo Bob', kind: 'heli', length: 15.5, width: 3.8, fuelMax: 400, burnClass: 5, topSpeed: 25, noiseDrive: 115, color: 0x6b7256, storageKg: 2400 },
  { id: 'little_bird', name: 'Scout Little Bird', kind: 'heli', length: 7, width: 1.9, fuelMax: 90, burnClass: 2, topSpeed: 40, noiseDrive: 85, color: 0x5c6650, storageKg: 60 },
  { id: 'sedan', name: 'Sedan', kind: 'car', length: 4.7, width: 1.8, fuelMax: 40, burnClass: 1.0, topSpeed: 21, noiseDrive: 45, color: 0x5a6a7a, storageKg: 70 },
  { id: 'mustang', name: 'Mustang Dark Horse', kind: 'car', length: 4.8, width: 1.9, fuelMax: 45, burnClass: 1.1, topSpeed: 42, noiseDrive: 55, color: 0x3a3f44, storageKg: 45 },
  { id: 'van', name: 'Utility Van', kind: 'car', length: 5.2, width: 2.0, fuelMax: 55, burnClass: 1.3, topSpeed: 19, noiseDrive: 50, color: 0xb8b8b0, storageKg: 260 },
  { id: 'sprinter', name: 'Sprinter Van', kind: 'car', length: 6.0, width: 2.05, fuelMax: 75, burnClass: 1.4, topSpeed: 18, noiseDrive: 48, color: 0x9aa4ac, storageKg: 380 },
  { id: 'v03_hauler', name: 'V-03 Hauler', kind: 'car', length: 5.6, width: 2.1, fuelMax: 65, burnClass: 1.5, topSpeed: 16.5, noiseDrive: 52, color: 0x2f3337, storageKg: 520 },
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
  wasClipped: boolean; // collision edge detection for impact damage
  colorPick: number; // semi paint variation index
  towedMassKg: number; // trailer + cargo mass, set by the trailer manager
  cargoCrates: number; // physical crates loaded (visual + mass)
  doors: DoorAnim[];
  interior?: InteriorSpec; // walk-in cargo space (sprinter)
  roofObj?: THREE.Object3D; // hidden while the player is inside, camera outside
  loadedOn: string | null; // trailer uid this vehicle is locked onto, if any
  /** Helicopters: spinning assemblies (main/tail rotors), spun by the
   *  drive loop from the live rotor spool. */
  rotorBlades?: { obj: THREE.Object3D; dir: 1 | -1; axis: 'y' | 'x' }[];
  /** Helicopter flight state (vertical + drift velocity, rotor spool). */
  heliState?: { vy: number; vx: number; vz: number; rotor: number };
  /** Set by a hard touchdown; Game reads + clears it for the toast. */
  hardLanding?: 'hard' | 'crash';
  upgradeGroup?: THREE.Group; // armor / racks / bullbar meshes
  cargoGroup?: THREE.Group; // loaded-crate meshes
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
  /** Helicopters: collective input -1 (descend) .. 1 (climb). */
  lift?: number;
  /** Helicopters: yaw input -1 .. 1 (Q/E). */
  yawIn?: number;
}

function buildCarBody(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  // CRAFT WAVE dispatch — every hull has a lofted builder in the model
  // files (carModels / truckModels / vanModels / smallModels). The
  // legacy stacked-box branches were deleted in the wave's purge:
  // no box build survives anywhere in the fleet.
  if (def.id === 'mustang') { buildStallion(g, def, v); return; } // the Stallion family
  if (def.id === 'boxtruck') { buildBoxtruck(g, def, v); return; }
  if (def.id === 'van') { buildVan(g, def, v); return; }
  if (def.id === 'sedan') { buildSedan(g, def, v); return; }
  if (def.id === 'semi' || def.id === 'semi_day') { buildSemi(g, def, v); return; }
  if (def.id === 'pickup') { buildPickup(g, def, v); return; }
  if (def.id === 'f250') { buildF250(g, def, v); return; }
  if (def.id === 'bronco') { buildBronco(g, def, v); return; }
  if (def.id === 'sprinter') { buildSprinter(g, def, v); return; }
  if (def.id === 'v03_hauler') { buildV03(g, def, v); return; }
  if (def.id === 'goliath') { buildGoliath(g, def, v); return; }
  if (def.id === 'tank') { buildTank(g, def, v); return; }
  if (def.id === 'marsh_buggy') { buildMarshBuggy(g, def, v); return; }
  buildSedan(g, def, v); // fallback for any future car def
}

function buildBike(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  if (def.id === 'atv') { buildATV(g, def, v); return; }
  if (def.id === 'motocross') { buildMotocross(g, def, v); return; }
  buildSportbike(g, def, v); // sportbike + fallback
}

function buildTug(g: THREE.Group, def: VehicleDef): void {
  const L = def.length;
  const W = def.width;
  const hullM = mat(def.color, 0.72, 0.3);
  const deckM = mat(0x59614f, 0.9, 0.05);
  const rustM = mat(0x77543a, 0.9, 0.1);
  const darkM = mat(0x2b2f33, 0.8, 0.2);
  // hull: plan-view outline extruded vertically, beveled at the sheer
  const s = new THREE.Shape();
  const hl = L / 2;
  const hw = W / 2;
  s.moveTo(-hw, hl);
  s.lineTo(hw, hl);
  s.lineTo(hw, 1.5);
  s.lineTo(hw * 0.82, -2.5);
  s.lineTo(hw * 0.48, -hl + 1.3);
  s.lineTo(0, -hl - 0.1);
  s.lineTo(-hw * 0.48, -hl + 1.3);
  s.lineTo(-hw * 0.82, -2.5);
  s.lineTo(-hw, 1.5);
  s.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(s, {
    depth: 1.7, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.28, bevelSegments: 2, steps: 1,
  });
  hullGeo.rotateX(-Math.PI / 2); // shape +Y (stern) → -Z... bow (-Y) lands at +Z
  const hull = new THREE.Mesh(hullGeo, hullM);
  hull.position.y = -1.15; // extrude+bevel spans -0.35..2.05 → keel ≈ -1.5, sheer rim ≈ +0.9
  hull.castShadow = true;
  hull.receiveShadow = true;
  g.add(hull);
  // deck plate + a low bulwark lip aft
  box(g, W - 0.55, 0.09, L - 1.6, deckM, 0, 0.58, -0.3);
  for (const sgn of [1, -1]) box(g, 0.09, 0.34, 5.4, hullM, sgn * (hw - 0.18), 0.82, -3.6);
  box(g, W - 0.4, 0.34, 0.09, hullM, 0, 0.82, -6.3);
  // scrap-plate patchwork: angled plates down the bow and shoulders
  const plateCols = [0x5d686f, 0x646e66, 0x535c60, 0x6b6257];
  const plateSpots: [number, number, number, number, number][] = [
    // x, y, z, rotY, rotZ
    [1.35, 0.1, 4.6, 0.5, 0.15], [-1.35, 0.1, 4.6, -0.5, -0.15],
    [1.75, -0.25, 3.1, 0.28, 0.1], [-1.75, -0.25, 3.1, -0.28, -0.1],
    [2.18, 0.15, 0.9, 0.06, 0.05], [-2.18, 0.15, 0.9, -0.06, -0.05],
    [2.2, -0.3, -1.1, 0.03, -0.08], [-2.2, -0.3, -1.1, -0.03, 0.08],
    [1.5, -0.35, 5.6, 0.72, 0.1], [-1.5, -0.35, 5.6, -0.72, -0.1],
    [0.7, -0.15, 6.2, 0.9, 0.06], [-0.7, -0.15, 6.2, -0.9, -0.06],
  ];
  plateSpots.forEach(([px, py, pz, ry, rz], i) => {
    const p = box(g, 0.05, 1.05, 1.35, mat(plateCols[i % plateCols.length], 0.85, 0.25), px, py, pz);
    p.rotation.y = ry;
    p.rotation.z = rz;
    if (i % 3 === 0) {
      const patch = box(g, 0.055, 0.5, 0.6, rustM, px * 1.01, py - 0.2, pz + 0.2);
      patch.rotation.y = ry;
    }
  });
  // ---- wheelhouse (z +1.4): glazed, with a real helm inside ----
  const houseM = mat(0x59646c, 0.7, 0.3);
  box(g, 3.3, 0.14, 2.7, darkM, 0, 0.66, 1.4); // house floor
  // corner posts + aft/side walls (front + sides are glass)
  for (const [px, pz] of [[-1.55, 2.6], [1.55, 2.6], [-1.55, 0.2], [1.55, 0.2]] as [number, number][]) {
    box(g, 0.16, 1.75, 0.16, houseM, px, 1.55, pz);
  }
  box(g, 3.26, 1.75, 0.12, houseM, 0, 1.55, 0.14); // aft wall
  box(g, 3.5, 0.16, 2.9, houseM, 0, 2.5, 1.4); // roof
  box(g, 3.26, 0.5, 0.1, houseM, 0, 0.95, 2.66); // front lower panel
  for (const sgn of [1, -1]) box(g, 0.1, 0.5, 2.3, houseM, sgn * 1.6, 0.95, 1.4); // side lower panels
  const gt = glassTint();
  const frontGlass = box(g, 3.1, 1.05, 0.05, gt, 0, 1.95, 2.66);
  frontGlass.rotation.x = -0.1;
  for (const sgn of [1, -1]) {
    const sideGlass = box(g, 0.05, 1.05, 2.25, gt, sgn * 1.6, 1.95, 1.4);
    sideGlass.castShadow = false;
  }
  frontGlass.castShadow = false;
  // helm interior: console with gauges, a spoked wheel, two seats
  const console_ = box(g, 2.2, 0.62, 0.5, darkM, 0, 1.15, 2.15);
  console_.rotation.x = -0.16;
  for (const gx of [-0.6, 0, 0.6]) {
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14), mat(0xd8dccf, 0.35, 0.4));
    gauge.rotation.x = Math.PI / 2 - 0.16;
    gauge.position.set(gx, 1.32, 2.33);
    g.add(gauge);
  }
  const wheelCol = box(g, 0.09, 0.55, 0.09, darkM, 0.35, 1.15, 1.82);
  wheelCol.rotation.x = 0.5;
  const helm = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.032, 8, 18), mat(0x3a2e20, 0.7, 0.1));
  helm.position.set(0.35, 1.42, 1.68);
  helm.rotation.x = 0.5;
  helm.castShadow = true;
  g.add(helm);
  for (let i = 0; i < 3; i++) {
    const spoke = box(g, 0.045, 0.5, 0.045, mat(0x3a2e20, 0.7, 0.1), 0.35, 1.42, 1.68);
    spoke.rotation.z = (i / 3) * Math.PI;
    spoke.rotation.x = 0.5;
  }
  for (const sx of [0.35, -0.75]) {
    box(g, 0.55, 0.12, 0.55, mat(0x4a3b2c, 0.9, 0), sx, 0.98, 1.05); // seat cushion
    box(g, 0.55, 0.65, 0.12, mat(0x4a3b2c, 0.9, 0), sx, 1.3, 0.78); // seat back
    box(g, 0.4, 0.28, 0.4, darkM, sx, 0.78, 1.05); // pedestal
  }
  // mast + crossbar + spotlight + whips on the wheelhouse roof
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 8), darkM);
  mast.position.set(0, 3.4, 0.6);
  mast.castShadow = true;
  g.add(mast);
  box(g, 1.5, 0.07, 0.07, darkM, 0, 3.95, 0.6);
  box(g, 0.34, 0.2, 0.24, mat(0xe8e2c8, 0.4, 0.2), 0.8, 3.15, 1.9);
  // exhaust stack behind the house
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1.5, 10), rustM);
  stack.position.set(-1.1, 1.6, -0.35);
  stack.castShadow = true;
  g.add(stack);
  // ---- winch drums amidships: flanged drums wound with cable ----
  const drumM = mat(0x37414a, 0.6, 0.45);
  for (const dz of [-0.9, -2.15]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.15, 14), drumM);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, 1.0, dz);
    drum.castShadow = true;
    g.add(drum);
    for (const fx of [-0.62, 0.62]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14), drumM);
      flange.rotation.z = Math.PI / 2;
      flange.position.set(fx, 1.0, dz);
      g.add(flange);
    }
    for (let wi = -2; wi <= 2; wi++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.028, 6, 16), darkM);
      wrap.rotation.y = Math.PI / 2;
      wrap.position.set(wi * 0.16, 1.0, dz);
      g.add(wrap);
    }
    box(g, 1.7, 0.55, 0.3, drumM, 0, 0.72, dz);
  }
  // ---- stern crane: pedestal, angled boom, cable + hook ----
  const craneM = mat(0x707880, 0.65, 0.35);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 12), craneM);
  ped.position.set(-1.2, 1.3, -4.9);
  ped.castShadow = true;
  g.add(ped);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 4.8, 8), craneM);
  boom.position.set(-1.55, 3.3, -5.9);
  boom.rotation.x = 0.72;
  boom.rotation.z = 0.22;
  boom.castShadow = true;
  g.add(boom);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.1, 5), darkM);
  cable.position.set(-2.05, 3.6, -7.45);
  g.add(cable);
  box(g, 0.16, 0.26, 0.1, darkM, -2.05, 2.5, -7.45);
  // foredeck cargo: crates, barrels, a hatch
  box(g, 1.5, 0.12, 1.8, darkM, 0, 0.66, 4.6);
  const crateM = mat(0x6a7a4a, 0.9, 0.05);
  box(g, 0.85, 0.65, 0.85, crateM, -1.15, 0.95, -3.9);
  box(g, 0.85, 0.65, 0.85, crateM, -1.15, 1.6, -3.9);
  box(g, 0.7, 0.55, 0.7, mat(0x707880, 0.8, 0.2), 1.25, 0.9, -3.8);
  for (const [bx, bz] of [[1.5, 4.9], [0.85, 5.2]] as [number, number][]) {
    const drumB = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.85, 12), rustM);
    drumB.position.set(bx, 1.0, bz);
    drumB.castShadow = true;
    g.add(drumB);
  }
  // tire fenders along both rails
  for (const sgn of [1, -1]) {
    for (const fz of [-3.4, -0.4, 2.6]) {
      const fender = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.13, 8, 12, Math.PI), mat(0x1c1c1e, 1, 0));
      fender.position.set(sgn * (hw + 0.16), 0.35, fz);
      fender.rotation.z = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
      fender.rotation.y = Math.PI / 2;
      g.add(fender);
    }
  }
  // bollards
  for (const [bx, bz] of [[-1.8, 5.9], [1.8, 5.9], [-1.9, -5.9], [1.9, -5.9]] as [number, number][]) {
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 8), darkM);
    bol.position.set(bx, 0.8, bz);
    g.add(bol);
  }
}

// ---------------------------------------------------------------------------
// Helicopters (AIRBASE wave). Built to the Sea Hawk render as the fidelity
// bar: LOFTED fuselages (elliptical cross-sections swept along the body —
// no box shells), detailed rotor heads (mast, swashplate, pitch links,
// grips), transparent tinted canopies over MODELED cockpits (seats,
// instrument panel with gauges, cyclic + collective), and the pilot seat
// placed so the avatar reads through the glass.

function heliSeat(g: THREE.Group, x: number, y: number, z: number, fabric: THREE.Material, frame: THREE.Material): void {
  box(g, 0.52, 0.1, 0.5, fabric, x, y, z);
  const back = box(g, 0.52, 0.74, 0.1, fabric, x, y + 0.4, z - 0.27);
  back.rotation.x = 0.1;
  box(g, 0.3, 0.15, 0.08, fabric, x, y + 0.84, z - 0.31);
  box(g, 0.42, 0.3, 0.42, frame, x, y - 0.22, z);
}

/** Instrument panel: sloped console, glareshield, gauge discs, plus a
 *  cyclic stick and collective lever per pilot position. */
function heliPanel(g: THREE.Group, w: number, x: number, y: number, z: number, dark: THREE.Material): void {
  const p = box(g, w, 0.55, 0.26, dark, x, y, z);
  p.rotation.x = -0.3;
  box(g, w, 0.07, 0.36, dark, x, y + 0.31, z - 0.03);
  const gaugeM = mat(0xcfd4c2, 0.35, 0.4);
  const n = Math.max(3, Math.floor(w / 0.3));
  for (let i = 0; i < n; i++) {
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), gaugeM);
    gauge.rotation.x = Math.PI / 2 - 0.3;
    gauge.position.set(x - w / 2 + ((i + 0.5) * w) / n, y + 0.05, z + 0.13);
    g.add(gauge);
  }
}

function heliControls(g: THREE.Group, x: number, y: number, z: number, dark: THREE.Material): void {
  const cyc = tube(g, x, y, z + 0.05, x, y + 0.48, z + 0.16, 0.024, dark);
  cyc.castShadow = false;
  box(g, 0.05, 0.16, 0.05, dark, x, y + 0.52, z + 0.17);
  const col = tube(g, x - 0.36, y + 0.02, z - 0.05, x - 0.42, y + 0.3, z + 0.18, 0.026, dark);
  col.castShadow = false;
}

/** A detailed main-rotor head: mast, swashplate, hub, pitch links,
 *  grips, and tapered blades. Registers the spinning group on the
 *  vehicle so the drive loop can spin it from the rotor spool. */
function rotorHead(g: THREE.Group, v: Vehicle, x: number, y: number, z: number, blades: number, bladeLen: number, dir: 1 | -1, dark: THREE.Material): void {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 10), dark);
  mast.position.set(x, y - 0.24, z);
  mast.castShadow = true;
  g.add(mast);
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  g.add(grp);
  const swash = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.07, 12), mat(0x9aa0a4, 0.35, 0.7));
  swash.position.y = -0.13;
  grp.add(swash);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 10), dark);
  grp.add(hub);
  const bladeM = mat(0x2e3236, 0.55, 0.3);
  for (let i = 0; i < blades; i++) {
    const bg = new THREE.Group();
    bg.rotation.y = (i / blades) * Math.PI * 2;
    grp.add(bg);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), dark);
    grip.position.x = 0.26;
    bg.add(grip);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeLen, 0.035, 0.27), bladeM);
    blade.position.x = 0.4 + bladeLen / 2;
    blade.rotation.x = 0.05;
    blade.castShadow = true;
    bg.add(blade);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.033, 0.24), bladeM);
    tip.position.set(0.4 + bladeLen + 0.18, 0.012, 0.05);
    tip.rotation.y = -0.35;
    bg.add(tip);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 6), dark);
    link.position.set(0.3, -0.12, 0.07);
    bg.add(link);
  }
  (v.rotorBlades ??= []).push({ obj: grp, dir, axis: 'y' });
}

function tailRotor(g: THREE.Group, v: Vehicle, x: number, y: number, z: number, blades: number, len: number, dir: 1 | -1, dark: THREE.Material): void {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  g.add(grp);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), dark);
  hub.rotation.z = Math.PI / 2;
  grp.add(hub);
  const bladeM = mat(0x2e3236, 0.55, 0.3);
  for (let i = 0; i < blades; i++) {
    const bg = new THREE.Group();
    bg.rotation.x = (i / blades) * Math.PI * 2;
    grp.add(bg);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, len, 0.15), bladeM);
    blade.position.y = len / 2 + 0.05;
    bg.add(blade);
  }
  (v.rotorBlades ??= []).push({ obj: grp, dir, axis: 'x' });
}

function heliWheel(g: THREE.Group, x: number, y: number, z: number, r: number, dark: THREE.Material): void {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.55, 14), mat(0x17181a, 0.95, 0));
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, y, z);
  wheel.castShadow = true;
  g.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 0.58, 10), dark);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x, y, z);
  g.add(hub);
}

/** Small canvas stencil (NAVY / rescue markings) as a side decal. */
function heliDecal(g: THREE.Group, text: string, w: number, x: number, y: number, z: number, side: 1 | -1): void {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(30,34,38,0.88)';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  m.position.set(x, y, z);
  m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(m);
}

// --- MH-60S Sea Hawk (render 04 is the pinned fidelity bar) ---------------
function buildSeaHawk(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const bodyM = mat(0x868d93, 0.5, 0.35);
  const dark = mat(0x23272c, 0.7, 0.3);
  const fabric = mat(0x44503e, 0.95, 0);
  g.add(loftMesh([
    { z: -6.4, w: 0.55, h: 1.95, y: 2.52 },
    { z: -5.6, w: 0.82, h: 1.5, y: 2.26 },
    { z: -4.0, w: 1.28, h: 1.28, y: 1.96 },
    { z: -2.2, w: 2.3, h: 2.0, y: 1.72 },
    { z: -0.5, w: 3.05, h: 2.5, y: 1.62 },
    { z: 1.8, w: 3.15, h: 2.58, y: 1.6 },
    { z: 3.8, w: 2.85, h: 2.42, y: 1.58 },
    { z: 5.4, w: 1.85, h: 1.75, y: 1.45 },
    { z: 6.35, w: 0.6, h: 0.85, y: 1.32 },
  ], bodyM));
  // cockpit glass: an open arc band over the nose (interior shows through)
  g.add(loftMesh([
    { z: 3.35, w: 2.92, h: 2.5, y: 1.58 },
    { z: 4.6, w: 2.62, h: 2.28, y: 1.52 },
    { z: 5.5, w: 1.92, h: 1.82, y: 1.45 },
  ], glassTint(), [-0.5, Math.PI + 0.5]));
  // cabin windows on the port side (starboard is the open gun door)
  for (const wz of [1.25, 0.05]) {
    const win = box(g, 0.05, 0.55, 0.95, glassTint(), 1.57, 1.88, wz);
    win.castShadow = false;
  }
  // --- interior: floor, pilot seats, panel, controls, cabin benches ---
  box(g, 2.9, 0.08, 5.8, dark, 0, 0.5, 1.1);
  heliSeat(g, 0.55, 0.98, 3.55, fabric, dark);
  heliSeat(g, -0.55, 0.98, 3.55, fabric, dark);
  heliPanel(g, 2.1, 0, 1.78, 4.72, dark);
  heliControls(g, 0.55, 0.98, 3.55, dark);
  heliControls(g, -0.55, 0.98, 3.55, dark);
  for (const sgn of [1, -1]) {
    box(g, 0.5, 0.09, 2.2, fabric, sgn * 1.08, 0.78, 0.3); // cabin bench
    box(g, 0.09, 0.55, 2.2, fabric, sgn * 1.34, 1.05, 0.3);
  }
  box(g, 2.9, 2.3, 0.1, mat(0x767d83, 0.6, 0.3), 0, 1.65, -1.7); // cabin bulkhead
  // --- open starboard cabin door + pintle MG (the render's signature) ---
  box(g, 0.06, 1.35, 1.3, mat(0x101215, 0.95, 0), -1.56, 1.5, 1.15); // dark opening
  const slidDoor = box(g, 0.05, 1.32, 1.24, bodyM, -1.6, 1.5, -0.42); // door slid aft
  box(g, 0.055, 0.5, 0.9, glassTint(), -1.6, 1.78, -0.42).castShadow = false;
  void slidDoor;
  box(g, 0.34, 0.22, 0.5, dark, -1.66, 2.45, 2.35); // rescue hoist
  tube(g, -1.66, 2.35, 2.35, -1.95, 2.2, 1.7, 0.035, dark);
  const mgM = mat(0x1d2126, 0.45, 0.6);
  tube(g, -1.58, 0.95, 1.15, -1.72, 1.48, 1.15, 0.04, mgM); // pintle post
  const gun = new THREE.Group();
  gun.position.set(-1.78, 1.52, 1.15);
  gun.rotation.z = 0.06;
  g.add(gun);
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.17, 0.15), mgM);
  recv.castShadow = true;
  gun.add(recv);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.8, 8), mgM);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = -0.62;
  gun.add(barrel);
  const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.18), mat(0x59614f, 0.8, 0.2));
  ammoBox.position.set(0.05, -0.2, 0.12);
  gun.add(ammoBox);
  tube(gun, 0.3, 0, 0.06, 0.48, -0.14, 0.1, 0.02, mgM);
  tube(gun, 0.3, 0, -0.06, 0.48, -0.14, -0.1, 0.02, mgM);
  // --- engines: twin nacelles + angled exhausts on the spine ---
  for (const sgn of [1, -1]) {
    const nac = box(g, 0.66, 0.52, 2.0, bodyM, sgn * 0.74, 2.98, 1.05);
    nac.rotation.x = 0.03;
    box(g, 0.5, 0.3, 0.3, dark, sgn * 0.74, 3.0, 2.12); // intake face
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.75, 10), dark);
    exh.position.set(sgn * 1.12, 2.98, 0.05);
    exh.rotation.set(-0.5, 0, sgn * 0.7);
    g.add(exh);
  }
  box(g, 0.8, 0.34, 2.4, bodyM, 0, 3.02, 1.0); // doghouse fairing
  // sensor ball under the nose
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), dark);
  ball.position.set(0, 0.6, 5.25);
  ball.castShadow = true;
  g.add(ball);
  const ballEye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), glassTint());
  ballEye.position.set(0, 0.55, 5.42);
  g.add(ballEye);
  // tail: stabilizer + tail wheel + tail rotor on the fin
  box(g, 2.35, 0.07, 0.55, bodyM, 0, 2.02, -5.45);
  tube(g, 0, 1.5, -5.75, 0, 0.3, -5.9, 0.05, dark);
  heliWheel(g, 0, 0.27, -5.92, 0.27, dark);
  tailRotor(g, v, -0.4, 2.56, -6.18, 4, 0.82, -1, dark);
  for (const sgn of [1, -1]) {
    tube(g, sgn * 1.15, 0.85, 0.95, sgn * 1.32, 0.38, 0.95, 0.06, dark);
    heliWheel(g, sgn * 1.35, 0.36, 0.95, 0.36, dark);
  }
  rotorHead(g, v, 0, 3.32, 1.3, 4, 2.95, 1, dark);
  heliDecal(g, 'NAVY', 1.7, 0.68, 2.0, -4.1, 1);
  heliDecal(g, 'NAVY', 1.7, -0.68, 2.0, -4.1, -1);
  heliDecal(g, '615', 0.9, 1.6, 1.6, 3.1, 1);
  void def;
}

// --- CH-47 Cargo Bob: tandem rotors, rear loading ramp --------------------
function buildCargoBob(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  void def;
  const bodyM = mat(0x6b7256, 0.55, 0.25);
  const dark = mat(0x23272c, 0.7, 0.3);
  const fabric = mat(0x4c5546, 0.95, 0);
  g.add(loftMesh([
    { z: -7.7, w: 2.7, h: 2.3, y: 2.05 },
    { z: -6.8, w: 3.3, h: 2.95, y: 1.98 },
    { z: -4.0, w: 3.6, h: 3.05, y: 1.95 },
    { z: 0, w: 3.62, h: 3.05, y: 1.95 },
    { z: 4.0, w: 3.55, h: 3.0, y: 1.95 },
    { z: 6.2, w: 2.9, h: 2.5, y: 1.85 },
    { z: 7.3, w: 1.6, h: 1.7, y: 1.6 },
    { z: 7.75, w: 0.5, h: 0.8, y: 1.45 },
  ], bodyM));
  g.add(loftMesh([
    { z: 5.75, w: 2.98, h: 2.56, y: 1.86 },
    { z: 6.7, w: 2.5, h: 2.14, y: 1.74 },
    { z: 7.35, w: 1.66, h: 1.76, y: 1.6 },
  ], glassTint(), [-0.45, Math.PI + 0.45]));
  // cargo-bay windows down both flanks
  for (const sgn of [1, -1]) {
    for (const wz of [-4.6, -2.2, 0.2, 2.6]) {
      const win = box(g, 0.05, 0.5, 0.62, glassTint(), sgn * 1.8, 2.45, wz);
      win.castShadow = false;
    }
  }
  // --- interior: cockpit + a real cargo bay the ramp opens into ---
  box(g, 3.1, 0.08, 12.6, dark, 0, 0.6, -1.2); // bay floor
  heliSeat(g, 0.6, 1.1, 5.75, fabric, dark);
  heliSeat(g, -0.6, 1.1, 5.75, fabric, dark);
  heliPanel(g, 2.3, 0, 1.92, 6.85, dark);
  heliControls(g, 0.6, 1.1, 5.75, dark);
  heliControls(g, -0.6, 1.1, 5.75, dark);
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      box(g, 0.08, 2.3, 0.16, mat(0x59614f, 0.7, 0.3), sgn * 1.68, 1.8, -6 + i * 2.6); // bay ribs
    }
    box(g, 0.4, 0.07, 9.5, fabric, sgn * 1.45, 0.85, -2.4); // fold-down troop seats
  }
  box(g, 0.5, 0.14, 10.5, dark, 0, 3.28, -2.2); // ceiling spine beam
  // rear ramp (animated on the shared door system, hinge at the sill)
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.62, -7.72);
  g.add(pivot);
  const rampPanel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.55, 0.1), bodyM);
  rampPanel.position.set(0, 1.28, 0);
  rampPanel.castShadow = true;
  pivot.add(rampPanel);
  const rampLip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.5), dark);
  rampLip.position.set(0, 2.5, 0.12);
  pivot.add(rampLip);
  v.doors.push({ obj: pivot, kind: 'ramp', base: 0, t: 0, target: 0, travel: -1.82 });
  // pylons + tandem rotors (counter-rotating)
  box(g, 1.15, 0.85, 1.7, bodyM, 0, 3.85, 5.35);
  const pylon = box(g, 1.05, 2.1, 1.9, bodyM, 0, 4.1, -6.55);
  pylon.rotation.x = 0.06;
  rotorHead(g, v, 0, 4.42, 5.4, 3, 3.3, 1, dark);
  rotorHead(g, v, 0, 5.32, -6.6, 3, 3.3, -1, dark);
  // sponsons + landing gear
  for (const sgn of [1, -1]) {
    const spon = box(g, 0.55, 0.85, 8.6, bodyM, sgn * 2.0, 0.98, -0.4);
    spon.rotation.x = 0.0;
    box(g, 0.5, 0.6, 1.1, bodyM, sgn * 1.98, 1.05, 3.95);
    box(g, 0.5, 0.6, 1.1, bodyM, sgn * 1.98, 1.05, -4.85);
    heliWheel(g, sgn * 1.95, 0.42, 4.4, 0.42, dark);
    heliWheel(g, sgn * 1.95, 0.42, -4.7, 0.42, dark);
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), dark);
    exh.position.set(sgn * 1.35, 3.3, -5.6);
    exh.rotation.x = -0.6;
    g.add(exh);
  }
  heliDecal(g, 'CARGO', 1.9, 1.84, 2.0, -1.5, 1);
  heliDecal(g, 'CARGO', 1.9, -1.84, 2.0, -1.5, -1);
}

// --- Scout "Little Bird": all-glass bubble, skid stores -------------------
function buildLittleBird(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const bodyM = mat(0x5c6650, 0.55, 0.25);
  const dark = mat(0x23272c, 0.7, 0.3);
  const fabric = mat(0x54493a, 0.95, 0);
  g.add(loftMesh([
    { z: -2.6, w: 0.55, h: 0.72, y: 1.36 },
    { z: -1.4, w: 1.35, h: 1.45, y: 1.18 },
    { z: 0.2, w: 1.75, h: 1.8, y: 1.12 },
    { z: 1.15, w: 1.6, h: 1.65, y: 1.1 },
  ], bodyM));
  // THE bubble: a full tinted-glass dome — the pilot sits inside it
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.04, 26, 20), glassTint());
  bubble.position.set(0, 1.34, 1.78);
  bubble.scale.set(0.94, 1.02, 1.28);
  g.add(bubble);
  const noseShell = box(g, 1.15, 0.5, 1.3, bodyM, 0, 0.6, 2.15);
  noseShell.rotation.x = 0.25;
  // interior under the glass: floor, bench, panel, cyclic
  box(g, 1.5, 0.07, 2.3, dark, 0, 0.74, 1.25);
  box(g, 1.3, 0.09, 0.48, fabric, 0, 0.98, 0.92);
  const backrest = box(g, 1.3, 0.62, 0.09, fabric, 0, 1.3, 0.66);
  backrest.rotation.x = 0.1;
  heliPanel(g, 1.15, 0, 1.5, 2.32, dark);
  heliControls(g, 0.3, 0.98, 1.15, dark);
  // engine deck + exhaust behind the bubble
  box(g, 1.25, 0.52, 1.7, bodyM, 0, 2.18, -0.55);
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 8), dark);
  exh.position.set(0.3, 2.2, -1.6);
  exh.rotation.x = 1.1;
  g.add(exh);
  rotorHead(g, v, 0, 2.68, 0.05, 5, 2.55, 1, dark);
  // tail boom + fin + 2-blade tail rotor
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.15, 3.3, 10), bodyM);
  boom.rotation.x = Math.PI / 2 - 0.03;
  boom.position.set(0, 1.44, -4.15);
  boom.castShadow = true;
  g.add(boom);
  box(g, 0.06, 0.78, 0.52, bodyM, 0, 1.68, -5.62);
  box(g, 1.15, 0.05, 0.3, bodyM, 0, 1.32, -5.3);
  tailRotor(g, v, -0.13, 1.52, -5.62, 2, 0.6, 1, dark);
  // skid gear: struts + tubes with upturned noses
  const skidM = mat(0x3a3f45, 0.5, 0.5);
  for (const sgn of [1, -1]) {
    tube(g, sgn * 0.6, 0.78, 0.85, sgn * 0.8, 0.14, 1.35, 0.04, skidM);
    tube(g, sgn * 0.6, 0.78, -1.15, sgn * 0.8, 0.14, -1.55, 0.04, skidM);
    tube(g, sgn * 0.8, 0.12, 2.35, sgn * 0.8, 0.12, -1.85, 0.045, skidM);
    tube(g, sgn * 0.8, 0.12, 2.35, sgn * 0.8, 0.5, 2.85, 0.045, skidM);
  }
  tube(g, -0.8, 0.3, 1.0, 0.8, 0.3, 1.0, 0.035, skidM);
  tube(g, -0.8, 0.3, -1.4, 0.8, 0.3, -1.4, 0.035, skidM);
  // skid stores: rocket pod (port) + gun pod (starboard)
  const podM = mat(0x4a5244, 0.6, 0.3);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.15, 12), podM);
  pod.rotation.x = Math.PI / 2;
  pod.position.set(1.02, 0.66, 1.1);
  pod.castShadow = true;
  g.add(pod);
  for (const [ox, oy] of [[-0.08, 0.08], [0.08, 0.08], [-0.08, -0.08], [0.08, -0.08]] as [number, number][]) {
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), dark);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.set(1.02 + ox, 0.66 + oy, 1.69);
    g.add(mouth);
  }
  tube(g, 0.8, 0.35, 1.1, 1.0, 0.6, 1.1, 0.03, dark);
  const gunPod = box(g, 0.3, 0.3, 1.0, podM, -1.02, 0.66, 1.1);
  void gunPod;
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), dark);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(-1.02, 0.62, 1.85);
  g.add(gunBarrel);
  tube(g, -0.8, 0.35, 1.1, -1.0, 0.6, 1.1, 0.03, dark);
  void def;
}

function makeVehicle(def: VehicleDef, x: number, z: number, heading: number, groundY: (x: number, z: number) => number, variant?: string): Vehicle {
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
    wasClipped: false,
    colorPick: def.id === 'semi' ? Math.floor(Math.random() * SEMI_PAINTS.length) : 0,
    towedMassKg: 0,
    cargoCrates: 0,
    doors: [],
    loadedOn: null,
    variant,
  };
  if (def.kind === 'skiff') {
    if (def.id === 'tug') buildTug(g, def); // airbase-wave build, kept
    else buildSkiffModel(g, def, v); // CRAFT WAVE: lofted V-hull skiff
  }
  else if (def.kind === 'bike' || def.kind === 'moto' || def.kind === 'atv') buildBike(g, def, v);
  else if (def.kind === 'heli') {
    g.rotation.order = 'YXZ'; // yaw first, then flight tilt
    if (def.id === 'seahawk') buildSeaHawk(g, def, v);
    else if (def.id === 'cargo_bob') buildCargoBob(g, def, v);
    else buildLittleBird(g, def, v);
  }
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
  /** Absolute deck height for vehicles parked aboard a structure (the
   *  carrier) — terrain height does not apply there. */
  y?: number;
  /** Model variant (the Stallion FX hero car). */
  variant?: string;
}

// AIRBASE wave: the fleet consolidates at the depot motor pool — two
// apron rows south of the MAINT-BAY, heavies behind. The carrier keeps a
// pickup + bronco aboard as deck spawns; boats stay at the marina.
const SPAWNS: SpawnDef[] = [
  // light row (bikes, ATV, buggy)
  { id: 'sportbike', poi: 'airbase', dx: -24, dz: 52, heading: Math.PI },
  { id: 'motocross', poi: 'airbase', dx: -20, dz: 52, heading: Math.PI },
  { id: 'atv', poi: 'airbase', dx: -16, dz: 52, heading: Math.PI },
  { id: 'marsh_buggy', poi: 'airbase', dx: -11, dz: 52, heading: Math.PI },
  // car row
  { id: 'sedan', poi: 'airbase', dx: -4, dz: 52, heading: Math.PI },
  { id: 'mustang', poi: 'airbase', dx: 3, dz: 52, heading: Math.PI },
  { id: 'mustang', poi: 'airbase', dx: 58, dz: 52, heading: Math.PI, variant: 'fx' },
  { id: 'pickup', poi: 'airbase', dx: 10, dz: 52, heading: Math.PI },
  { id: 'bronco', poi: 'airbase', dx: 17, dz: 52, heading: Math.PI },
  { id: 'f250', poi: 'airbase', dx: 25, dz: 52, heading: Math.PI },
  { id: 'van', poi: 'airbase', dx: 33, dz: 52, heading: Math.PI },
  { id: 'sprinter', poi: 'airbase', dx: 41, dz: 52, heading: Math.PI },
  { id: 'v03_hauler', poi: 'airbase', dx: 50, dz: 52, heading: Math.PI },
  // heavy row
  { id: 'boxtruck', poi: 'airbase', dx: -2, dz: 64, heading: Math.PI },
  { id: 'semi', poi: 'airbase', dx: 10, dz: 64, heading: Math.PI },
  { id: 'semi_day', poi: 'airbase', dx: 21, dz: 64, heading: Math.PI },
  { id: 'goliath', poi: 'airbase', dx: 32, dz: 64, heading: Math.PI },
  { id: 'tank', poi: 'airbase', dx: 44, dz: 64, heading: Math.PI },
  // aboard the Heavy Logistics Carrier (deck spawns, second hulls)
  { id: 'pickup', poi: 'carrier', dx: 10, dz: -3.2, heading: Math.PI / 2, y: CARRIER_DECK_Y },
  { id: 'bronco', poi: 'carrier', dx: -8, dz: 3.6, heading: Math.PI / 2, y: CARRIER_DECK_Y },
  // boats stay at the marina
  { id: 'skiff', poi: 'marina', dx: -64, dz: 8, heading: Math.PI / 2 },
  { id: 'tug', poi: 'marina', dx: -26, dz: 16, heading: Math.PI / 2 },
  // helicopters on the airbase pads (west pad: Sea Hawk, mid: Cargo Bob,
  // east: Little Bird), noses into the prevailing wind off the sea
  { id: 'seahawk', poi: 'airbase', dx: -62, dz: -18, heading: Math.PI },
  { id: 'cargo_bob', poi: 'airbase', dx: -16, dz: -18, heading: Math.PI },
  { id: 'little_bird', poi: 'airbase', dx: 30, dz: -18, heading: Math.PI },
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
      const v = makeVehicle(def, x, z, s.heading, groundY, s.variant);
      if (s.y !== undefined) v.group.position.y = s.y; // parked on a deck, not terrain
      // duplicate hulls of one def (the carrier's second pickup/bronco)
      // need unique uids — storage, hitching, and the fleet list key on uid
      if (this.vehicles.some((o) => o.uid === v.uid)) {
        let n = 2;
        while (this.vehicles.some((o) => o.uid === `${def.id}#${n}`)) n++;
        v.uid = `${def.id}#${n}`;
      }
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

  /** Wind down parked helicopters' rotors each frame. */
  updateRotors(dt: number, drivenUid?: string): void {
    this.stepRotors(dt, drivenUid);
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

    // ---------- air: arcade rotor flight ----------
    if (def.kind === 'heli') {
      this.driveHeli(dt, v, throttle, steer, env);
      return;
    }

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
    // grip saturation: the tires can't deliver full lock at speed
    // (the wheel + steering wheel still show the commanded angle)
    const effSteer = effectiveSteerAngle(v.steerAngle, speedRatio, understeerK(def));
    const massKg = vehicleMassKg(def) + itemsWeightKg(v.storage);

    // longitudinal: power curve launch, real brakes, aero + rolling drag.
    // Load matters: a hitched trailer's mass (towedMassKg, set by the
    // trailer manager) and blown tires cut the top end and the pull;
    // an engine tune buys some of it back (data/upgrades math).
    const surfaceTop = onSand ? (def.sandRunner ? 1 : sandFactor(v.upgrades)) : 1;
    const topF = def.topSpeed * condF * surfaceTop * (inWater ? 0.3 : 1)
      * topSpeedFactor(v.upgrades, v.towedMassKg, v.tiresFlat);
    const accelF = accelFactor(v.upgrades, v.towedMassKg);
    const topR = def.topSpeed * 0.32 * condF;
    const th = hasFuel ? clamp(throttle, -1, 1) : 0;
    const accelBefore = v.speed;
    if (th > 0.02) {
      const power = clamp(1 - v.speed / Math.max(topF, 1), 0.22, 1); // strong launch, tapering top end
      v.speed += th * (topF / 2.9) * power * (onSand && !def.sandRunner ? 0.8 : 1) * accelF * dt;
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
      const roll = (onSand && !def.sandRunner ? 1.1 : 0.55) * dt;
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
    // IMPACT physics: damage lands once, on the impact edge, scaled by
    // kinetic energy (speed², mass class) — scraping a wall bleeds
    // speed but doesn't keep re-charging the repair bill. A hard hit
    // bounces: light hulls ricochet, heavy hulls just stop.
    const impactSpeed = Math.abs(v.speed);
    let bounced = false;
    if (clipped && impactSpeed > 5 && def.tracked) {
      env.noise(pos.x, pos.z, 26); // the building loses; the tank doesn't notice
    }
    if (clipped && !v.wasClipped && impactSpeed > 5 && !def.tracked) {
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
    if (clipped && !bounced) v.speed *= def.tracked ? 0.88 : 0.35;

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
    const cgH = cgHeightM(def);
    const pitchTarget = terrainPitch + weightTransferPitch(accel, cgH, wb); // weight transfer: dive on brake, squat on launch
    const leansIn = def.kind === 'bike' || def.kind === 'moto'; // NOT the ATV — four wheels roll like a car
    const rollTarget = terrainRoll + (leansIn
      ? v.steerAngle * clamp(Math.abs(v.speed) / 8, 0, 1) * 0.5 * Math.sign(v.speed || 1) // bikes lean IN
      : cornerRoll(yawRate, v.speed, cgH, track)); // cars + ATV roll OUT with lateral load
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
  // ---------- helicopter flight ----------
  // Arcade rotor model: the rotor spools up over ~2s; lift authority goes
  // with the SQUARE of spool, so a cold rotor cannot lift. WASD is the
  // cyclic (desired velocity in the heading frame), Space/Ctrl (env.lift)
  // is the collective, Q/E (env.yawIn) yaws. The airframe leans into its
  // velocity, auto-levels in a hover, and a touchdown is graded — soft is
  // free, hard costs condition, a crash can write the airframe off.

  private static HELI_REST: Record<string, number> = { seahawk: 0.02, cargo_bob: 0.02, little_bird: 0.0 };

  private spinRotors(v: Vehicle, dt: number): void {
    const rotor = v.heliState?.rotor ?? 0;
    if (rotor <= 0) return;
    for (const r of v.rotorBlades ?? []) {
      if (r.axis === 'x') r.obj.rotation.x += r.dir * rotor * 44 * dt;
      else r.obj.rotation.y += r.dir * rotor * 36 * dt;
    }
  }

  /** Parked helicopters wind their rotors down (the driven one is
   *  skipped — driveHeli owns its spool). */
  stepRotors(dt: number, skipUid?: string): void {
    for (const v of this.vehicles) {
      if (v.def.kind !== 'heli' || !v.heliState || v.uid === skipUid) continue;
      if (v.heliState.rotor > 0) {
        v.heliState.rotor = Math.max(0, v.heliState.rotor - dt / 4.5);
        this.spinRotors(v, dt);
      }
    }
  }

  private driveHeli(dt: number, v: Vehicle, throttle: number, steer: number, env: DriveEnv): void {
    const def = v.def;
    const pos = v.group.position;
    const H = (v.heliState ??= { vy: 0, vx: 0, vz: 0, rotor: 0 });
    const rest = VehicleManager.HELI_REST[def.id] ?? 0;
    const live = v.fuel > 0.05 && v.condition > 0.03;
    H.rotor = clamp(H.rotor + (live ? dt / 2.2 : -dt / 3), 0, 1);
    const auth = liftAuthority(H.rotor);
    const sin = Math.sin(v.heading);
    const cos = Math.cos(v.heading);
    // cyclic: desired velocity in the heading frame
    const sp = def.topSpeed * (0.55 + 0.45 * v.condition) * auth;
    const desF = clamp(throttle, -1, 1) * sp;
    const desS = clamp(steer, -1, 1) * sp * 0.6;
    const desX = sin * desF + cos * desS;
    const desZ = cos * desF - sin * desS;
    const accelStep = 10.5 * auth * dt;
    H.vx = approach(H.vx, desX, accelStep);
    H.vz = approach(H.vz, desZ, accelStep);
    if (Math.abs(throttle) < 0.05 && Math.abs(steer) < 0.05) {
      const damp = hoverDamping(dt);
      H.vx *= damp;
      H.vz *= damp;
    }
    // yaw (Q/E), gated by spool
    const yawIn = env.yawIn ?? 0;
    if (yawIn !== 0) v.heading = wrapAngle(v.heading + yawIn * 1.25 * dt * (0.25 + 0.75 * auth));
    // collective + the sink of an unspooled rotor
    const lift = clamp(env.lift ?? 0, -1, 1);
    let targetVy = lift * (lift > 0 ? 5.4 : 4.4) * auth;
    if (H.rotor < 0.62) targetVy -= (0.62 - H.rotor) * 13;
    H.vy = approach(H.vy, targetVy, 7.5 * dt);
    pos.x += H.vx * dt;
    pos.z += H.vz * dt;
    pos.y += H.vy * dt;
    // ground contact = landing
    const groundAt = env.groundY(pos.x, pos.z);
    const restY = groundAt + rest;
    const onGround = pos.y <= restY + 0.02;
    if (pos.y <= restY) {
      pos.y = restY;
      if (H.vy < -1.4) {
        const sev = landingSeverity(H.vy);
        if (sev.damage > 0) {
          v.condition = clamp(v.condition - sev.damage, sev.grade === 'crash' ? 0.02 : 0.05, 1);
          if (sev.grade === 'hard' || sev.grade === 'crash') v.hardLanding = sev.grade;
        }
      }
      H.vy = 0;
      H.vx = approach(H.vx, 0, 16 * dt);
      H.vz = approach(H.vz, 0, 16 * dt);
    }
    // soft ceiling over the local ground
    const ceil = groundAt + 135;
    if (pos.y > ceil) {
      pos.y = ceil;
      H.vy = Math.min(H.vy, 0);
    }
    // buildings only matter down low; open sky above the roofline
    if (!onGround && pos.y < groundAt + 13) {
      const bx = pos.x;
      const bz = pos.z;
      resolveCollisions(pos, 1.35, env.colliders);
      if (pos.x !== bx || pos.z !== bz) {
        const impact = Math.hypot(H.vx, H.vz);
        if (impact > 9) v.condition = clamp(v.condition - 0.07, 0.03, 1);
        H.vx *= 0.35;
        H.vz *= 0.35;
      }
    }
    // airframe lean: into the velocity, plus a touch of yaw bank
    const vf = H.vx * sin + H.vz * cos;
    const vs = H.vx * cos - H.vz * sin;
    const tilt = tiltForVelocity(vf, vs);
    const levelRate = onGround ? 6 : 2.6;
    v.bodyPitch = approach(v.bodyPitch, onGround ? 0 : tilt.pitch, levelRate * dt);
    v.bodyRoll = approach(v.bodyRoll, onGround ? 0 : tilt.roll - yawIn * 0.1, levelRate * dt);
    v.group.rotation.set(v.bodyPitch, v.heading, v.bodyRoll);
    v.speed = vf;
    this.spinRotors(v, dt);
    stepDoors(v.doors, dt);
    // fuel, wear, and the loudest noise on the island
    if (H.rotor > 0.04 && live) {
      const load = 0.35 + 0.65 * Math.min(1, Math.abs(H.vy) / 5 + Math.hypot(H.vx, H.vz) / def.topSpeed);
      v.fuel = Math.max(0, v.fuel - def.burnClass * 0.03 * load * H.rotor * dt);
      v.condition = clamp(v.condition - dt * 0.0001 * load, 0, 1);
    }
    (v as { noiseT?: number }).noiseT = ((v as { noiseT?: number }).noiseT ?? 0) + dt;
    if ((v as { noiseT?: number }).noiseT! > 0.3) {
      (v as { noiseT?: number }).noiseT = 0;
      if (H.rotor > 0.12) env.noise(pos.x, pos.z, def.noiseDrive * (0.35 + 0.65 * H.rotor));
    }
  }

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
  // the Stallion's roof turret is itself an upgrade visual — remove it first
  if (v.def.id === 'mustang' && v.turret) {
    v.group.remove(v.turret);
    v.turret = undefined;
  }
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
  if (v.def.id === 'mustang') {
    // Convoy Combat Edition: the upgrade tree made visible (carModels.ts)
    applyStallionUpgrades(v, g);
    v.group.add(g);
    v.upgradeGroup = g;
    return;
  }
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
      for (const sgn of [1, -1]) box(g, 0.05, 0.22, L * 0.36, dark, sgn * (W / 2 - 0.05), 1.46, -L * 0.3);
      box(g, W * 0.9, 0.3, 0.05, dark, 0, 1.52, -L * 0.165);
    } else if (v.def.id !== 'goliath' && v.def.id !== 'tank' && v.def.id !== 'marsh_buggy') {
      const roofY = v.def.id === 'van' ? 2.2 : v.def.id === 'v03_hauler' ? 2.27 : v.def.id === 'sprinter' ? 2.3 : v.def.id === 'boxtruck' ? 2.75 : 1.5;
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
