// Trailers.ts — hitched trailers with their own articulated physics,
// storage, doors, loadable decks, and buildout modules. Models are built
// from Ian's Stitch renders: charcoal NOMAD box trailer with ribbed twin
// rear doors, plank-deck flatbeds with ramps, olive tactical trailers
// (dish / solar / mast) for the beacon buildout.

import * as THREE from 'three';
import { clamp } from './rng';
import {
  isDeckKind, trailerDef, type ModuleId, type TrailerDef,
} from '../data/trailerData';
import { pointAt, stepTrailer, swayDampedHeading } from './trailerPhysics';
import {
  itemsWeightKg, stepDoors, type DoorAnim, type InteriorSpec, type Vehicle,
} from './Vehicles';
import type { InvItem } from '../store/types';

export type BeaconMode = 'off' | 'sat' | 'horde';

export interface Trailer {
  uid: string; // == def id (one of each on the island)
  def: TrailerDef;
  group: THREE.Group;
  heading: number;
  hitchedTo: string | null; // vehicle def id
  module: 'none' | ModuleId;
  storage: InvItem[];
  fuelLiters: number; // tanker only
  doorOpen: boolean;
  doors: DoorAnim[];
  loadedVehicleUid: string | null;
  /** Extra deck loads after the first (HET-70's 2nd/3rd bays), load order. */
  extraLoadedUids: string[];
  rampDown: boolean;
  rampLen: number;
  beaconMode: BeaconMode;
  cargoCrates: number;
  cargoGroup?: THREE.Group;
  moduleGroup?: THREE.Group;
  roofObj?: THREE.Object3D;
  interior?: InteriorSpec;
  wheelSpin: THREE.Object3D[];
  wheelR: number;
  prevX: number;
  prevZ: number;
  suspV: number;
  bodyPitch: number;
  bodyRoll: number;
  fuelGauge?: THREE.Object3D;
  dish?: THREE.Object3D;
  beaconLight?: THREE.Mesh;
}

export interface TrailerEnv {
  groundY: (x: number, z: number) => number;
  ram: (x: number, z: number, radius: number, dmg: number) => void;
  noise: (x: number, z: number, r: number) => void;
  time: number;
}

/** Tongue reach: coupler distance ahead of the trailer center. */
export function tongueDist(t: Trailer): number {
  return t.def.length / 2 + 0.9;
}

/** Effective axle position (local z, behind center) — the follow pivot. */
export function axleDist(t: Trailer): number {
  if (t.def.kind === 'utility') return -0.3;
  if (t.def.kind === 'lowboy') return -t.def.length * 0.398; // center of the 4-axle bogie
  return -t.def.length * 0.22;
}

/** All vehicles locked on a trailer's deck, in load order. */
export function loadedUids(t: Trailer): string[] {
  return t.loadedVehicleUid ? [t.loadedVehicleUid, ...t.extraLoadedUids] : [...t.extraLoadedUids];
}

/** Deck surface height above the trailer group origin, by kind. */
export function deckTopY(t: Trailer): number {
  return t.def.kind === 'lowboy' ? 0.55 : 0.97;
}

export function tongueWorld(t: Trailer): { x: number; z: number } {
  const p = t.group.position;
  return pointAt({ x: p.x, z: p.z, heading: t.heading }, tongueDist(t));
}

/** Everything the tow vehicle feels: chassis + storage + crates + fuel + cars. */
export function trailerMassKg(t: Trailer, vehicles: { byId: (id: string) => Vehicle | null }): number {
  let m = t.def.massKg + itemsWeightKg(t.storage) + t.cargoCrates * 90 + t.fuelLiters * 0.85;
  for (const uid of loadedUids(t)) {
    const lv = vehicles.byId(uid);
    if (lv) m += 1000 + Math.max(0, lv.def.length - 4) * 320;
  }
  return Math.round(m);
}

/** Storage capacity with the cargo buildout's racks factored in. */
export function trailerStorageCapKg(t: Trailer): number {
  return Math.round(t.def.storageKg * (t.module === 'cargo' ? 2.2 : 1));
}

// ---------------------------------------------------------------------------
// Model building (Stitch-grounded)
// ---------------------------------------------------------------------------

const mat = (c: number, rough = 0.75, metal = 0.15) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
const darkTrim = () => mat(0x23272c, 0.9, 0.05);
const tailMat = () => mat(0x9e1622, 0.35, 0.1);

function box(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function twheel(g: THREE.Group, r: number, w: number, x: number, y: number, z: number, spin: THREE.Object3D[]): void {
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
}

/** "NOMAD" stencil as a canvas texture — the box trailer's signature. */
function stencilPlane(w: number, h: number, text: string, color = '#c8ccd0'): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '900 92px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.88;
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, metalness: 0.05 }),
  );
  return mesh;
}

/** Chassis rails, A-frame tongue, coupler, landing jack, rear lights. */
function buildChassis(g: THREE.Group, t: Trailer, frameY: number): void {
  const { length: L, width: W } = t.def;
  const dark = darkTrim();
  for (const sgn of [1, -1]) box(g, 0.12, 0.16, L * 0.92, dark, sgn * W * 0.3, frameY, 0); // rails
  // A-frame: two bars converging on the coupler
  for (const sgn of [1, -1]) {
    const bar = box(g, 0.09, 0.11, L / 2 + 1.0, dark, sgn * W * 0.17, frameY, L / 4 + 0.35);
    bar.rotation.y = sgn * 0.16;
  }
  box(g, 0.22, 0.16, 0.3, mat(0x3d434b, 0.6, 0.5), 0, frameY, tongueDist(t) - 0.15); // coupler
  // landing jack near the tongue (visible when parked)
  box(g, 0.09, 0.62, 0.09, dark, W * 0.22, frameY - 0.2, L / 2 - 0.35);
  box(g, 0.3, 0.05, 0.3, dark, W * 0.22, frameY - 0.5, L / 2 - 0.35);
  // rear light bar
  for (const sgn of [1, -1]) box(g, 0.3, 0.09, 0.05, tailMat(), sgn * W * 0.36, frameY + 0.12, -L / 2 - 0.03);
}

function buildUtility(g: THREE.Group, t: Trailer): void {
  const { length: L, width: W } = t.def;
  const wood = mat(0x77603e, 0.95, 0);
  const dark = darkTrim();
  // plank deck (planks run lengthwise, like the showcase equipment trailer)
  const n = 5;
  for (let i = 0; i < n; i++) {
    box(g, W / n - 0.03, 0.06, L * 0.94, wood, -W / 2 + (i + 0.5) * (W / n), 0.62, 0);
  }
  box(g, W, 0.1, L, dark, 0, 0.52, 0); // frame under deck
  // low rail sides: posts + top rail
  for (const sgn of [1, -1]) {
    box(g, 0.05, 0.05, L * 0.94, dark, sgn * (W / 2 - 0.03), 1.02, 0);
    for (let i = 0; i < 4; i++) box(g, 0.05, 0.4, 0.05, dark, sgn * (W / 2 - 0.03), 0.82, -L * 0.42 + i * L * 0.28);
    // fender over the wheel
    box(g, 0.14, 0.08, 1.1, dark, sgn * (W / 2 + 0.02), 0.82, axleDist(t));
  }
  box(g, W, 0.05, 0.05, dark, 0, 1.02, L * 0.47); // front rail
  box(g, W, 0.05, 0.05, dark, 0, 1.02, -L * 0.47);
  t.wheelR = 0.34;
  for (const sgn of [1, -1]) twheel(g, 0.34, 0.2, sgn * (W / 2 - 0.02), 0.34, axleDist(t), t.wheelSpin);
}

function buildDeckTrailer(g: THREE.Group, t: Trailer, carrier: boolean): void {
  const { length: L, width: W } = t.def;
  const wood = mat(0x6e5638, 0.95, 0);
  const dark = darkTrim();
  const steel = mat(0x3d434b, 0.6, 0.5);
  const deckY = 0.94;
  box(g, W, 0.12, L, steel, 0, deckY - 0.08, 0); // steel frame
  const n = 6;
  for (let i = 0; i < n; i++) {
    box(g, W / n - 0.03, 0.05, L * 0.97, wood, -W / 2 + (i + 0.5) * (W / n), deckY + 0.02, 0);
  }
  // side rub rails + stake pockets
  for (const sgn of [1, -1]) {
    box(g, 0.06, 0.14, L * 0.97, dark, sgn * (W / 2 + 0.02), deckY - 0.02, 0);
    box(g, 0.3, 0.07, 1.6, dark, sgn * (W / 2 + 0.03), deckY + 0.48, axleDist(t) + 0.6); // fender front
    box(g, 0.3, 0.07, 1.6, dark, sgn * (W / 2 + 0.03), deckY + 0.48, axleDist(t) - 0.6); // fender rear
  }
  if (carrier) {
    // wheel-stop bar + tire rack at the front, winch box on the neck
    box(g, W * 0.92, 0.22, 0.1, steel, 0, deckY + 0.14, L / 2 - 0.35);
    for (const sgn of [1, -1]) {
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 12), mat(0x1e1e22, 1, 0));
      spare.rotation.x = Math.PI / 2;
      spare.position.set(sgn * W * 0.28, deckY + 0.35, L / 2 - 0.55);
      spare.castShadow = true;
      g.add(spare);
    }
    box(g, 0.5, 0.3, 0.4, dark, 0, deckY + 0.2, L / 2 + 0.3); // winch box
  } else {
    // flatbed: diamond-plate toolbox under the front + headache bar
    box(g, 0.9, 0.42, 0.5, mat(0x707880, 0.45, 0.6), 0, 0.45, L / 2 - 0.5);
    box(g, W * 0.9, 0.08, 0.08, dark, 0, deckY + 0.34, L / 2 - 0.1);
  }
  // loading ramp: hinged at the rear edge — stored upright, folds down
  const pivot = new THREE.Group();
  pivot.position.set(0, deckY, -L / 2);
  g.add(pivot);
  const rampLen = 2.3;
  const panel = box(pivot, W * 0.88, 0.06, rampLen, steel, 0, 0, -rampLen / 2);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.03, 0.12), darkTrim());
    rib.position.set(0, 0.05, -0.4 - i * 0.55);
    panel.add(rib);
  }
  t.doors.push({ obj: pivot, kind: 'ramp', base: 1.35, t: 0, target: 0, travel: -1.78 });
  t.wheelR = 0.42;
  for (const az of [axleDist(t) + 0.62, axleDist(t) - 0.62]) {
    for (const sgn of [1, -1]) twheel(g, 0.42, 0.26, sgn * (W / 2 - 0.02), 0.42, az, t.wheelSpin);
  }
}

/**
 * HET-70 Heavy Gooseneck Lowboy — from Ian's Stitch spec (M1000 HET
 * inspired): arched gooseneck with hydraulic cylinders, diamond-plate
 * toolboxes, an ultra-low wide deck you can park three vehicles on,
 * D-rings + stake pockets, a 4-axle/8-wheel rear bogie, and twin folding
 * rear ramps. Matte charcoal #171C1F, submerged-teal #203A43 accents,
 * rusted-orange weathering.
 */
function buildLowboy(g: THREE.Group, t: Trailer): void {
  const { length: L, width: W } = t.def;
  const charcoal = mat(0x171c1f, 0.8, 0.25);
  const teal = mat(0x203a43, 0.7, 0.2);
  const steel = mat(0x3d434b, 0.6, 0.5);
  const rust = mat(0xb85c38, 0.95, 0);
  const deckTop = 0.55;
  // frame rails + low deck plate
  for (const sgn of [1, -1]) box(g, 0.14, 0.18, L * 0.95, charcoal, sgn * W * 0.3, 0.42, 0);
  box(g, W, 0.1, L * 0.92, charcoal, 0, deckTop - 0.05, -L * 0.02); // deck
  for (const sgn of [1, -1]) box(g, 0.09, 0.045, L * 0.92, teal, sgn * (W / 2 - 0.07), deckTop + 0.01, -L * 0.02); // teal deck edges
  for (let i = 0; i < 9; i++) box(g, W * 0.94, 0.02, 0.12, mat(0x232a2e, 0.85, 0.2), 0, deckTop + 0.005, -L * 0.42 + i * L * 0.1); // tread strips
  // rust weathering patches on the deck edges
  for (const [rx, rz] of [[-W * 0.3, L * 0.12], [W * 0.36, -L * 0.2], [-W * 0.42, -L * 0.38]] as [number, number][]) {
    box(g, 0.5, 0.012, 0.34, rust, rx, deckTop + 0.012, rz);
  }
  // D-rings + stake pockets along both rails
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      box(g, 0.12, 0.04, 0.12, steel, sgn * (W / 2 - 0.22), deckTop + 0.02, -L * 0.36 + i * L * 0.15);
      box(g, 0.1, 0.13, 0.2, charcoal, sgn * (W / 2 + 0.02), 0.46, -L * 0.4 + i * L * 0.16);
    }
  }
  // diamond-plate toolboxes on the front deck corners
  for (const sgn of [1, -1]) {
    box(g, 1.15, 0.5, 0.62, mat(0x707880, 0.45, 0.6), sgn * (W / 2 - 0.66), deckTop + 0.25, L * 0.31);
    box(g, 1.15, 0.07, 0.62, teal, sgn * (W / 2 - 0.66), deckTop + 0.53, L * 0.31); // teal lid stripe
  }
  // ----- the gooseneck: twin arched beams rising to the coupler -----
  const riseDy = 0.97;
  const runDz = L / 2 + 0.3 - L * 0.3;
  const beamLen = Math.hypot(runDz, riseDy);
  const beamAng = Math.atan2(riseDy, runDz);
  for (const sgn of [1, -1]) {
    const beam = box(g, 0.16, 0.22, beamLen, charcoal, sgn * W * 0.3, deckTop + riseDy / 2, L * 0.3 + runDz / 2);
    beam.rotation.x = -beamAng; // +Z end rises to the coupler
    // hydraulic cylinder under the beam
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), steel);
    cyl.position.set(sgn * W * 0.18, deckTop + 0.42, L * 0.3 + 1.1);
    cyl.rotation.x = -0.62;
    cyl.castShadow = true;
    g.add(cyl);
    // landing jack at the neck (parked stance)
    box(g, 0.09, 0.6, 0.09, charcoal, sgn * W * 0.32, 0.28, L * 0.3);
    box(g, 0.3, 0.05, 0.3, charcoal, sgn * W * 0.32, 0.02, L * 0.3);
  }
  box(g, W * 0.68, 0.18, 0.24, charcoal, 0, deckTop + riseDy + 0.05, L / 2 + 0.22); // coupler crossbeam
  box(g, 0.52, 0.09, 0.72, steel, 0, deckTop + riseDy - 0.06, L / 2 + 0.34); // fifth-wheel plate
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), steel);
  pin.position.set(0, deckTop + riseDy - 0.2, L / 2 + 0.34);
  g.add(pin); // kingpin
  // rear light bar + mud flaps
  for (const sgn of [1, -1]) {
    box(g, 0.3, 0.09, 0.05, tailMat(), sgn * W * 0.38, 0.52, -L / 2 - 0.03);
    box(g, 0.55, 0.42, 0.04, charcoal, sgn * (W / 2 - 0.3), 0.24, -L / 2 - 0.5);
  }
  // bogie fenders (teal) over the 4-axle cluster
  for (const sgn of [1, -1]) box(g, 0.34, 0.07, 4.3, teal, sgn * (W / 2 - 0.02), 1.0, axleDist(t));
  // twin folding rear ramps, hinged at the deck's rear edge
  const pivot = new THREE.Group();
  pivot.position.set(0, deckTop, -L / 2);
  g.add(pivot);
  t.rampLen = 2.8;
  for (const sgn of [1, -1]) {
    const panel = box(pivot, W * 0.42, 0.06, t.rampLen, steel, sgn * W * 0.23, 0, -t.rampLen / 2);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 0.03, 0.12), darkTrim());
      rib.position.set(0, 0.05, -0.45 - i * 0.6);
      panel.add(rib);
    }
  }
  t.doors.push({ obj: pivot, kind: 'ramp', base: 1.35, t: 0, target: 0, travel: -1.55 });
  t.wheelR = 0.42;
  for (const off of [-1.44, -0.48, 0.48, 1.44]) {
    for (const sgn of [1, -1]) twheel(g, 0.42, 0.3, sgn * (W / 2 - 0.04), 0.42, axleDist(t) + off, t.wheelSpin);
  }
}

function buildTanker(g: THREE.Group, t: Trailer): void {
  const { length: L, width: W } = t.def;
  const alu = mat(0x9ba1a6, 0.38, 0.65);
  const dark = darkTrim();
  const tankLen = L * 0.8;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, tankLen, 18), alu);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.42, -L * 0.03);
  tank.castShadow = true;
  g.add(tank);
  // end caps + top hatch + walkway
  for (const e of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.02, 14, 10), alu);
    cap.scale.set(1, 1, 0.35);
    cap.position.set(0, 1.42, -L * 0.03 + e * tankLen / 2);
    g.add(cap);
  }
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10), dark);
  hatch.position.set(0, 2.5, -L * 0.03);
  g.add(hatch);
  box(g, 0.5, 0.05, tankLen * 0.7, dark, 0, 2.46, -L * 0.03); // walkway
  box(g, W * 0.7, 0.06, 0.5, mat(0xd88f2a, 0.5, 0.1), 0, 1.0, L * 0.32); // hazard placard board
  // side hose tubes + rear valve cabinet + ladder
  for (const sgn of [1, -1]) {
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, tankLen * 0.8, 8), dark);
    hose.rotation.x = Math.PI / 2;
    hose.position.set(sgn * (W / 2 - 0.08), 0.78, -L * 0.03);
    g.add(hose);
  }
  box(g, 0.8, 0.7, 0.25, dark, 0, 0.85, -L / 2 + 0.1); // valve cabinet
  // fuel gauge strip on the cabinet: fills with the load (scaled in update)
  const gauge = box(g, 0.5, 0.5, 0.03, mat(0xe8b34b, 0.4, 0.1), 0, 0.62, -L / 2 - 0.04);
  gauge.geometry.translate(0, 0.25, 0); // scale from the bottom
  gauge.scale.y = 0.01;
  t.fuelGauge = gauge;
  t.wheelR = 0.42;
  for (const az of [axleDist(t) + 0.62, axleDist(t) - 0.62]) {
    for (const sgn of [1, -1]) twheel(g, 0.42, 0.26, sgn * (W / 2 - 0.02), 0.42, az, t.wheelSpin);
  }
}

function buildBox(g: THREE.Group, t: Trailer): void {
  const { length: L, width: W } = t.def;
  // the Stitch box: weathered charcoal panels, NOMAD stencil, ribbed
  // twin rear doors, marker lights, a personnel door up front.
  const shell = mat(0x42474d, 0.72, 0.2);
  const inner = mat(0x596068, 0.9, 0.05);
  const dark = darkTrim();
  const floorY = 1.02;
  const wallH = 2.35;
  const cy = floorY + wallH / 2;
  box(g, W * 0.97, 0.09, L * 0.97, mat(0x5d4c33, 0.95, 0), 0, floorY, 0); // wood floor
  box(g, W, 0.14, L, dark, 0, floorY - 0.1, 0); // underframe skirt
  for (const sgn of [1, -1]) {
    box(g, 0.07, wallH, L * 0.97, shell, sgn * (W / 2 - 0.035), cy, 0); // side wall
    // vertical ribs, proud of the panel like the render's pressed steel
    for (let i = 0; i < 6; i++) box(g, 0.03, wallH * 0.96, 0.09, shell, sgn * (W / 2 + 0.005), cy, -L * 0.4 + i * L * 0.16);
    const st = stencilPlane(3.6, 0.9, 'NOMAD');
    st.position.set(sgn * (W / 2 + 0.03), cy + 0.15, -L * 0.05);
    st.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(st);
    // red/white reflective skirt strips
    for (let i = 0; i < 4; i++) box(g, 0.02, 0.07, 0.34, i % 2 ? tailMat() : mat(0xd8d8d0, 0.4, 0), sgn * (W / 2 + 0.01), 0.55, -L * 0.36 + i * L * 0.22);
  }
  box(g, W, wallH, 0.07, shell, 0, cy, L / 2 - 0.035); // front wall
  const roof = box(g, W, 0.07, L * 0.97, shell, 0, floorY + wallH + 0.03, 0);
  t.roofObj = roof;
  // interior liner hint: darker ceiling ribs visible from inside
  for (let i = 0; i < 4; i++) box(g, W * 0.9, 0.04, 0.09, inner, 0, floorY + wallH - 0.05, -L * 0.36 + i * L * 0.24);
  // rear frame + header + marker lights
  box(g, W, 0.22, 0.08, shell, 0, floorY + wallH - 0.08, -L / 2);
  for (let i = -1; i <= 1; i++) box(g, 0.12, 0.05, 0.04, tailMat(), i * 0.5, floorY + wallH + 0.02, -L / 2 - 0.02);
  // twin rear doors: ribbed leaves with lock rods, hinged at the sides
  for (const sgn of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sgn * (W / 2 - 0.03), cy, -L / 2);
    g.add(pivot);
    const leaf = box(pivot, W / 2 - 0.06, wallH - 0.2, 0.05, shell, -sgn * (W / 4 - 0.02), 0, 0);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.2, 0.1, 0.03), darkTrim());
      rib.position.set(0, -0.7 + i * 0.7, -0.045);
      leaf.add(rib);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, wallH - 0.4, 6), mat(0x8a929a, 0.4, 0.6));
    rod.position.set(-sgn * 0.12, 0, -0.06);
    leaf.add(rod); // lock rod
    t.doors.push({ obj: pivot, kind: sgn > 0 ? 'swing-l' : 'swing-r', base: 0, t: 0, target: 0 });
  }
  // personnel door on the +X side, up front (the hab entry)
  const pPivot = new THREE.Group();
  pPivot.position.set(W / 2, cy - 0.25, L / 2 - 0.55);
  g.add(pPivot);
  const pLeaf = box(pPivot, 0.05, 1.85, 0.8, shell, 0, 0, -0.4);
  const pWin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.3), mat(0x2a3540, 0.2, 0.4));
  pWin.position.set(0.04, 0.55, 0);
  pLeaf.add(pWin);
  t.doors.push({ obj: pPivot, kind: 'swing-r', base: 0, t: 0, target: 0 });
  t.interior = { halfW: W / 2 - 0.18, zFront: L / 2 - 0.2, zRear: -L / 2 + 0.12, floorY, doorHalfW: W / 2 - 0.1 };
  t.wheelR = 0.42;
  for (const az of [axleDist(t) + 0.62, axleDist(t) - 0.62]) {
    for (const sgn of [1, -1]) twheel(g, 0.42, 0.26, sgn * (W / 2 - 0.02), 0.42, az, t.wheelSpin);
  }
}

/** Module buildout visuals — what the trailer BECOMES is visible. */
export function applyModuleVisuals(t: Trailer): void {
  if (t.moduleGroup) {
    t.group.remove(t.moduleGroup);
    t.moduleGroup = undefined;
  }
  t.dish = undefined;
  t.beaconLight = undefined;
  if (t.module === 'none') return;
  const g = new THREE.Group();
  const { length: L, width: W } = t.def;
  const dark = darkTrim();
  const olive = mat(0x565e4c, 0.85, 0.15);
  if (t.module === 'cargo') {
    // crate racks inside + a roof vent and reflective band outside
    for (const sgn of [1, -1]) {
      for (let i = 0; i < 3; i++) box(g, 0.7, 0.62, 0.9, mat(0x7a5c38, 0.9, 0), sgn * (W / 2 - 0.55), 1.35, -L * 0.3 + i * L * 0.22);
      box(g, 0.75, 0.06, L * 0.6, dark, sgn * (W / 2 - 0.55), 1.72, -L * 0.08); // rack shelf
    }
    box(g, 0.7, 0.18, 0.7, dark, 0, 3.5, L * 0.2); // roof vent
    box(g, W + 0.02, 0.14, L * 0.97, mat(0xd88f2a, 0.5, 0.1), 0, 2.6, 0); // hi-vis band
  } else if (t.module === 'hab') {
    // living fittings: bed platform + mattress up front, table, locker,
    // a warm lamp; outside: a glowing window and a stovepipe.
    box(g, 0.95, 0.28, 2.0, mat(0x6b5136, 0.9, 0), -(W / 2 - 0.62), 1.18, L / 2 - 1.25); // bed base
    box(g, 0.9, 0.14, 1.9, mat(0x8a94a3, 0.95, 0), -(W / 2 - 0.62), 1.39, L / 2 - 1.25); // mattress
    box(g, 0.5, 0.1, 0.35, mat(0xd8d3c3, 0.95, 0), -(W / 2 - 0.62), 1.5, L / 2 - 0.55); // pillow
    box(g, 0.8, 0.05, 0.6, mat(0x6b5136, 0.9, 0), W / 2 - 0.6, 1.15, L * 0.05); // table top
    box(g, 0.7, 0.9, 0.45, mat(0x4c5548, 0.8, 0.2), W / 2 - 0.55, 1.5, -L * 0.28); // locker
    const lamp = box(g, 0.16, 0.1, 0.16, new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: 0xcc8a3a, emissiveIntensity: 1.4, roughness: 0.4 }), W / 2 - 0.6, 1.24, L * 0.05);
    lamp.castShadow = false;
    box(g, 1.4, 0.03, 2.6, mat(0x74553a, 1, 0), 0, 1.08, -L * 0.05); // rug
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), dark);
    pipe.position.set(W / 2 - 0.5, 3.6, L * 0.28);
    g.add(pipe); // stovepipe
    const winGlow = box(g, 0.03, 0.4, 0.5, new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: 0xcc8a3a, emissiveIntensity: 0.9, roughness: 0.4 }), -(W / 2 + 0.01), 2.2, L * 0.28);
    winGlow.castShadow = false;
  } else if (t.module === 'beacon') {
    // the tactical-trailer look: mast + dish, solar wings, whip antenna,
    // a console inside and a status beacon that pulses with the mode.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), dark);
    mast.position.set(0, 4.1, L * 0.3);
    g.add(mast);
    const dish = new THREE.Group();
    dish.position.set(0, 4.85, L * 0.3);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.12, 0.28, 14, 1, true), mat(0xb9bcbe, 0.4, 0.4));
    bowl.rotation.x = Math.PI / 2.6;
    dish.add(bowl);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), dark);
    feed.rotation.x = Math.PI / 2.6;
    feed.position.set(0, 0.18, 0.22);
    dish.add(feed);
    g.add(dish);
    t.dish = dish;
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.2, 5), dark);
    whip.position.set(-(W / 2 - 0.2), 4.2, -L * 0.3);
    g.add(whip);
    for (const sgn of [1, -1]) {
      const panel = box(g, 0.05, 1.1, 1.7, mat(0x1d2f4a, 0.25, 0.6), sgn * (W / 2 + 0.28), 2.2, -L * 0.12);
      panel.rotation.z = sgn * 0.5; // solar wings, angled out
    }
    box(g, 0.9, 1.0, 0.4, olive, W / 2 - 0.75, 1.55, L * 0.3); // console
    const bl = box(g, 0.14, 0.14, 0.14, new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xaa1818, emissiveIntensity: 0.4, roughness: 0.4 }), 0, 3.62, -L * 0.42);
    bl.castShadow = false;
    t.beaconLight = bl;
    box(g, 0.8, 0.5, 0.6, olive, -(W / 2 - 0.5), 0.75, L * 0.32); // generator box on the neck
  }
  t.group.add(g);
  t.moduleGroup = g;
}

/** Physical crate meshes riding in an open trailer bed/deck. */
export function refreshTrailerCargoVisuals(t: Trailer): void {
  if (t.cargoGroup) {
    t.group.remove(t.cargoGroup);
    t.cargoGroup = undefined;
  }
  const n = Math.min(t.cargoCrates, 6);
  if (n <= 0 || t.def.kind === 'box' || t.def.kind === 'tanker') return;
  const g = new THREE.Group();
  const wood = mat(0x7a5c38, 0.9, 0);
  const L = t.def.length;
  const floorY = t.def.kind === 'utility' ? 0.66 : t.def.kind === 'lowboy' ? 0.57 : 0.98;
  for (let i = 0; i < n; i++) {
    const cx = (i % 2 === 0 ? -0.42 : 0.42) * (t.def.width / 2);
    const cz = L * 0.22 - Math.floor(i / 2) * 0.75;
    box(g, 0.64, 0.5, 0.64, wood, cx, floorY + 0.25, cz);
  }
  t.group.add(g);
  t.cargoGroup = g;
}

// ---------------------------------------------------------------------------
// Spawning + per-frame trailer physics
// ---------------------------------------------------------------------------

export interface TrailerSpawn { id: string; poi: string; dx: number; dz: number; heading: number }

export const TRAILER_SPAWNS: TrailerSpawn[] = [
  // AIRBASE wave: the trailer yard — one of each, in a row on the apron
  { id: 't_utility', poi: 'airbase', dx: -108, dz: 54, heading: Math.PI },
  { id: 't_flatbed', poi: 'airbase', dx: -99, dz: 54, heading: Math.PI },
  { id: 't_box', poi: 'airbase', dx: -90, dz: 54, heading: Math.PI },
  { id: 't_tanker', poi: 'airbase', dx: -81, dz: 54, heading: Math.PI },
  { id: 't_carrier', poi: 'airbase', dx: -72, dz: 54, heading: Math.PI },
  { id: 't_lowboy', poi: 'airbase', dx: -61, dz: 56, heading: Math.PI },
];

function makeTrailer(def: TrailerDef, x: number, z: number, heading: number, groundY: (x: number, z: number) => number): Trailer {
  const g = new THREE.Group();
  const t: Trailer = {
    uid: def.id,
    def,
    group: g,
    heading,
    hitchedTo: null,
    module: 'none',
    storage: [],
    fuelLiters: def.kind === 'tanker' ? 300 + Math.random() * 500 : 0,
    doorOpen: false,
    doors: [],
    loadedVehicleUid: null,
    extraLoadedUids: [],
    rampDown: false,
    rampLen: 2.3,
    beaconMode: 'off',
    cargoCrates: 0,
    wheelSpin: [],
    wheelR: 0.42,
    prevX: x,
    prevZ: z,
    suspV: 0,
    bodyPitch: 0,
    bodyRoll: 0,
  };
  if (def.kind === 'lowboy') buildLowboy(g, t);
  else {
    buildChassis(g, t, def.kind === 'box' ? 0.62 : 0.55);
    if (def.kind === 'utility') buildUtility(g, t);
    else if (def.kind === 'flatbed') buildDeckTrailer(g, t, false);
    else if (def.kind === 'carrier') buildDeckTrailer(g, t, true);
    else if (def.kind === 'tanker') buildTanker(g, t);
    else buildBox(g, t);
  }
  g.position.set(x, groundY(x, z), z);
  g.rotation.order = 'YXZ';
  g.rotation.y = heading;
  return t;
}

export class TrailerManager {
  trailers: Trailer[] = [];

  spawn(scene: THREE.Scene, pois: Record<string, [number, number]>, groundY: (x: number, z: number) => number): void {
    for (const s of TRAILER_SPAWNS) {
      const def = trailerDef(s.id);
      if (!def) continue;
      const p = pois[s.poi] ?? [0, 0];
      const t = makeTrailer(def, p[0] + s.dx, p[1] + s.dz, s.heading, groundY);
      this.trailers.push(t);
      scene.add(t.group);
    }
  }

  byId(uid: string): Trailer | null {
    return this.trailers.find((t) => t.uid === uid) ?? null;
  }

  nearest(x: number, z: number, maxD: number): Trailer | null {
    let best: Trailer | null = null;
    let bd = maxD;
    for (const t of this.trailers) {
      const d = Math.hypot(t.group.position.x - x, t.group.position.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  trailerTowedBy(vehicleUid: string): Trailer | null {
    return this.trailers.find((t) => t.hitchedTo === vehicleUid) ?? null;
  }

  /** Per-frame: articulate hitched trailers behind their tow vehicles,
   * settle parked ones, spin wheels, animate doors and beacons. */
  update(dt: number, vehicles: { byId: (id: string) => Vehicle | null; hitchWorld: (v: Vehicle) => { x: number; z: number } }, env: TrailerEnv): void {
    for (const t of this.trailers) {
      stepDoors(t.doors, dt);
      const pos = t.group.position;
      const fx = Math.sin(t.heading);
      const fz = Math.cos(t.heading);
      const rx = fz;
      const rz = -fx;
      const az = axleDist(t);
      const tz = tongueDist(t);
      // ground heights at tongue / axle-center / axle-sides
      const hT = env.groundY(pos.x + fx * tz, pos.z + fz * tz);
      const hA = env.groundY(pos.x + fx * az, pos.z + fz * az);
      const hL = env.groundY(pos.x + fx * az - rx * t.def.width * 0.4, pos.z + fz * az - rz * t.def.width * 0.4);
      const hR = env.groundY(pos.x + fx * az + rx * t.def.width * 0.4, pos.z + fz * az + rz * t.def.width * 0.4);
      const avgH = (hT + hA + hL + hR) / 4;

      if (t.hitchedTo) {
        const tow = vehicles.byId(t.hitchedTo);
        if (!tow || tow.loadedOn) {
          t.hitchedTo = null; // tow vehicle vanished / got loaded itself
        } else {
          const hitch = vehicles.hitchWorld(tow);
          const next = stepTrailer({ x: pos.x, z: pos.z, heading: t.heading }, hitch, tz, az, 1.15, tow.heading);
          // sway damping: the solved heading is rate-limited (tighter at
          // speed) and the body re-pins to the hitch on the damped angle
          const damped = swayDampedHeading(t.heading, next.heading, Math.abs(tow.speed), dt);
          pos.x = hitch.x - Math.sin(damped) * tz;
          pos.z = hitch.z - Math.cos(damped) * tz;
          t.heading = damped;
          tow.towedMassKg = trailerMassKg(t, vehicles as { byId: (id: string) => Vehicle | null });
          // a moving trailer shoves husks aside at its axle line
          const moved = Math.hypot(pos.x - t.prevX, pos.z - t.prevZ);
          const spd = dt > 0 ? moved / dt : 0;
          if (spd > 4) env.ram(pos.x + fx * az, pos.z + fz * az, t.def.width / 2 + 0.9, spd * 2);
        }
      }
      // ride height on a soft spring, like the vehicles
      t.suspV += ((avgH - pos.y) * 60 - t.suspV * 10) * dt;
      pos.y += t.suspV * dt;
      if (pos.y < avgH - 0.3) { pos.y = avgH - 0.3; t.suspV = 0; }
      if (pos.y > avgH + 0.3) { pos.y = avgH + 0.3; t.suspV = 0; }
      const pitchT = clamp(Math.atan2(hA - hT, tz - az) * 0.85, -0.3, 0.3);
      const rollT = clamp(Math.atan2(hL - hR, t.def.width * 0.8) * 0.85, -0.3, 0.3);
      const sm = Math.min(1, dt * 6);
      t.bodyPitch += (pitchT - t.bodyPitch) * sm;
      t.bodyRoll += (rollT - t.bodyRoll) * sm;
      t.group.rotation.set(t.bodyPitch, t.heading, t.bodyRoll);
      // wheels roll by distance actually travelled
      const moved = Math.hypot(pos.x - t.prevX, pos.z - t.prevZ);
      if (moved > 0.0001) {
        const dA = (moved / t.wheelR) * Math.sign((pos.x - t.prevX) * fx + (pos.z - t.prevZ) * fz || 1);
        for (const w of t.wheelSpin) w.rotation.x += dA;
      }
      t.prevX = pos.x;
      t.prevZ = pos.z;
      // tanker gauge + beacon life
      if (t.fuelGauge && t.def.fuelMax) {
        t.fuelGauge.scale.y = Math.max(0.01, t.fuelLiters / t.def.fuelMax);
      }
      if (t.dish && t.beaconMode === 'sat') t.dish.rotation.y += dt * 0.4;
      if (t.beaconLight) {
        const m = t.beaconLight.material as THREE.MeshStandardMaterial;
        if (t.beaconMode === 'horde') m.emissiveIntensity = 1.6 + Math.sin(env.time * 6) * 1.4;
        else if (t.beaconMode === 'sat') m.emissiveIntensity = 0.9;
        else m.emissiveIntensity = 0.25;
      }
    }
  }

  /** World-space deck height at (x, z) for drive-on trailers, or -Infinity. */
  deckHeightAt(t: Trailer, x: number, z: number): number {
    if (!isDeckKind(t.def.kind)) return -Infinity;
    const pos = t.group.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    const lx = dx * fz - dz * fx; // right-vector dot
    const lz = dx * fx + dz * fz; // forward dot
    const { length: L, width: W } = t.def;
    const top = deckTopY(t);
    const deckTop = pos.y + top;
    if (Math.abs(lx) <= W / 2 - 0.05 && lz >= -L / 2 && lz <= L / 2) return deckTop;
    if (t.rampDown && Math.abs(lx) <= W * 0.44 && lz < -L / 2 && lz >= -L / 2 - t.rampLen) {
      const frac = (lz + L / 2 + t.rampLen) / t.rampLen; // 0 at the ground end, 1 at the deck
      return pos.y + top * frac;
    }
    return -Infinity;
  }

  /** World-space interior floor height at (x, z) for the box trailer. */
  interiorFloorAt(t: Trailer, x: number, z: number): number {
    if (!t.interior) return -Infinity;
    const pos = t.group.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    const lx = dx * fz - dz * fx;
    const lz = dx * fx + dz * fz;
    if (Math.abs(lx) <= t.interior.halfW + 0.3 && lz >= t.interior.zRear - 0.3 && lz <= t.interior.zFront + 0.3) {
      return pos.y + t.interior.floorY;
    }
    return -Infinity;
  }

  /** Local-space coords of a world point relative to a trailer. */
  localOf(t: Trailer, x: number, z: number): { lx: number; lz: number } {
    const pos = t.group.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    return { lx: dx * fz - dz * fx, lz: dx * fx + dz * fz };
  }

  /** Inverse of localOf. */
  worldOf(t: Trailer, lx: number, lz: number): { x: number; z: number } {
    const pos = t.group.position;
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    return { x: pos.x + lx * fz + lz * fx, z: pos.z - lx * fx + lz * fz };
  }
}

// ---------------------------------------------------------------------------
// Cargo crates: physical freight. Loot inside, loadable onto beds/decks.
// ---------------------------------------------------------------------------

export interface CargoCrate {
  uid: string;
  group: THREE.Group;
  storage: InvItem[];
  loadedInto: { kind: 'vehicle' | 'trailer'; uid: string } | null;
  slot: number; // index in the carrier's cargo row
  label: string;
}

let crateCounter = 1;

export class CrateManager {
  crates: CargoCrate[] = [];

  spawnCrate(scene: THREE.Scene, x: number, z: number, heading: number, groundY: (x: number, z: number) => number, contents: InvItem[], label: string, bandColor = 0x8a6d3b): CargoCrate {
    const g = new THREE.Group();
    const wood = mat(0x7a5c38, 0.9, 0);
    const frame = mat(0x4c3a22, 0.95, 0);
    const bodyMesh = box(g, 0.92, 0.72, 0.92, wood, 0, 0.36, 0);
    for (const fy of [0.31, -0.31]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.09, 0.98), frame);
      band.position.set(0, fy, 0);
      bodyMesh.add(band);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94), mat(bandColor, 0.7, 0.1));
    stripe.position.set(0, 0.36, 0);
    bodyMesh.add(stripe);
    const crate: CargoCrate = {
      uid: `crate${crateCounter++}`,
      group: g,
      storage: contents,
      loadedInto: null,
      slot: 0,
      label,
    };
    g.position.set(x, groundY(x, z), z);
    g.rotation.y = heading;
    scene.add(g);
    this.crates.push(crate);
    return crate;
  }

  byId(uid: string): CargoCrate | null {
    return this.crates.find((c) => c.uid === uid) ?? null;
  }

  nearestFree(x: number, z: number, maxD: number): CargoCrate | null {
    let best: CargoCrate | null = null;
    let bd = maxD;
    for (const c of this.crates) {
      if (c.loadedInto) continue;
      const d = Math.hypot(c.group.position.x - x, c.group.position.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Place a loaded crate on its carrier (called when the carrier moves). */
  placeOnCarrier(crate: CargoCrate, carrierPos: { x: number; y: number; z: number }, heading: number, lx: number, floorY: number, lz: number): void {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    crate.group.position.set(
      carrierPos.x + lx * fz + lz * fx,
      carrierPos.y + floorY,
      carrierPos.z - lx * fx + lz * fz,
    );
    crate.group.rotation.y = heading;
  }
}
