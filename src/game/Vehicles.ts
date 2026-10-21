// Vehicles.ts — VEHICLE RESET (Ian, 2026-10-20): the 13-vehicle roster
// is deleted; one Stallion FX remains. This module owns the vehicle's
// state (fuel, condition, storage, upgrades), its spawn, and its models:
// the Blender GLB (Piece 2) with the procedural Stallion as stand-in.
// Driving physics lives in CarPhysics.ts (Rapier rigid body, Piece 3).

import * as THREE from 'three';
import { ITEMS } from '../data/items';
import type { InvItem } from '../store/types';
import { buildStallion, applyStallionUpgrades } from './carModels';
import { GT500_DEF, GT500_GLB_PATH, GT500_SPAWN, GT500_WHEEL_RIG } from './gt500Def';

export { glassTint } from './modelKit';
export { GT500_DEF, GT500_SPAWN } from './gt500Def';

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'car';
  length: number;
  width: number;
  fuelMax: number; // L
  burnClass: number;
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
  // build (1769 kg, ~500 hp, 267 km/h). Real performance lives in
  // carSpec.ts — this def carries identity + tank + storage only.
  { id: 'mustang', name: 'Stallion FX', kind: 'car', length: 4.79, width: 1.92, fuelMax: 61, burnClass: 1.1, noiseDrive: 55, color: 0x1e4a7a, storageKg: 45 },
  // FLEET RETURN (gate-approved, one at a time): the 2007 Shelby GT500 —
  // the benchmark model. Full def lives in gt500Def.ts.
  GT500_DEF,
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
  /** Piece 3: accumulated wheel spin (rad) + per-wheel suspension length,
   *  written by CarPhysics, consumed by the GLB visual rig. */
  wheelSpinAngle: number;
  suspension: number[];
  suspRest: number;
  /** Piece 2: the Blender GLB rig (wrapper + wheel pivots), when loaded.
   *  Until it lands (or if it fails), the procedural body stands in. */
  glb?: {
    wrapper: THREE.Group;
    steerPivots: THREE.Object3D[];
    spinPivots: THREE.Object3D[];
    suspPivots: { obj: THREE.Object3D; baseY: number; wheelIdx: number }[];
    headLights: THREE.SpotLight[];
  };
  bobT: number;
  steerAngle: number; // current front-wheel angle (rad), the bicycle model's input
  wheelR: number; // rolling radius for wheel spin
  // NOTE (Item 4 audit, 2026-10-21): there are deliberately NO
  // bodyPitch/bodyRoll scripted-lean fields — the old smoothed-lean
  // fields were dead (declared, never driven) and are removed. Body
  // roll/pitch comes only from the rigid body + suspension forces;
  // the rendered group copies the body's quaternion in syncVisual.
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


function buildCarBody(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  buildStallion(g, def, v); // the one car — procedural stand-in until the GLB lands
}

function makeVehicle(def: VehicleDef, x: number, z: number, heading: number, groundY: (x: number, z: number) => number, variant?: string): Vehicle {
  const g = new THREE.Group();
  const v: Vehicle = {
    uid: def.id, def, group: g, heading, speed: 0,
    fuel: def.fuelMax * (0.2 + Math.random() * 0.4),
    condition: 0.2 + Math.random() * 0.4,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0, suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: Math.random() * 10,
    steerAngle: 0, wheelR: 0.35,
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
  /** Absolute height override for spawns not on terrain. */
  y?: number;
  /** Model variant (the Stallion FX hero car). */
  variant?: string;
}

export const VEHICLE_SPAWNS: SpawnDef[] = [
  // FX STAND-IN DELETED (Ian, 2026-10-21): "the FX teal version —
  // delete that." The procedural Stallion no longer spawns; the
  // GT500 is the sole car at the lighthouse until the Dark Horse
  // lands (separate asset wave). The mustang DEF + carSpec data stay
  // (build sheet, Dark Horse) — only the spawn/visual is gone. A
  // saved Stallion instance is stripped by saveMigration like other
  // deleted content. (Dispatch's >=2-car unlock now waits for the
  // Dark Horse — the roster is honestly one car.)
  GT500_SPAWN,
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

/**
 * Piece 2 — the Blender-built Stallion FX (public/mustang.glb, authored
 * by tools/build_mustang.py at real S650 dimensions). Loads async; the
 * procedural body stands in until it arrives, and stays if it fails.
 * Orientation: the GLB's nose is +X, up +Y — a -90° wrapper yaw puts
 * the nose on the game's +Z forward. Wheel empties (WheelFL/FR/RL/RR)
 * get steering/suspension pivots in wrapper space.
 */
export function attachMustangGlb(v: Vehicle): void {
  import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync('/mustang.glb'))
    .then((gltf) => {
      const model = gltf.scene;
      const wrapper = new THREE.Group();
      wrapper.rotation.y = -Math.PI / 2;
      wrapper.add(model);
      // clear the procedural stand-in
      while (v.group.children.length) v.group.remove(v.group.children[0]);
      v.wheelSpin = [];
      v.wheelPivots = [];
      v.group.add(wrapper);
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      // wheel rig: suspension index order matches CarPhysics [FR, FL, RR, RL]
      const order: [string, number][] = [
        ['WheelFR', 0], ['WheelFL', 1], ['WheelRR', 2], ['WheelRL', 3],
      ];
      const steerPivots: THREE.Object3D[] = [];
      const spinPivots: THREE.Object3D[] = [];
      const suspPivots: { obj: THREE.Object3D; baseY: number; wheelIdx: number }[] = [];
      for (const [name, wheelIdx] of order) {
        const wheel = model.getObjectByName(name);
        if (!wheel || !wheel.parent) continue;
        const susp = new THREE.Group();
        susp.position.copy(wheel.position);
        wheel.parent.add(susp);
        susp.add(wheel);
        wheel.position.set(0, 0, 0);
        const spin = new THREE.Group();
        spin.position.copy(wheel.position);
        susp.add(spin);
        spin.add(wheel);
        wheel.position.set(0, 0, 0);
        suspPivots.push({ obj: susp, baseY: susp.position.y, wheelIdx });
        spinPivots.push(spin);
        if (wheelIdx <= 1) steerPivots.push(susp);
      }
      // headlights: real spotlights seated at the lenses (glTF space:
      // nose +X, up +Y, width on Z) — light only, no fake glow geometry
      const headLights: THREE.SpotLight[] = [];
      for (const sz of [-0.6, 0.6]) {
        const spot = new THREE.SpotLight(0xffeec4, 0, 60, 0.46, 0.55, 1.2);
        spot.position.set(2.42, 0.62, sz);
        spot.target.position.set(14, 0, sz * 1.25);
        wrapper.add(spot);
        wrapper.add(spot.target);
        headLights.push(spot);
      }
      v.glb = { wrapper, steerPivots, spinPivots, suspPivots, headLights };
      if (v.upgrades.length) applyUpgradeVisuals(v);
    })
    .catch((err) => {
      console.warn('[Vehicles] mustang.glb failed to load; procedural body stands:', err);
    });
}

/**
 * The gate-approved Shelby GT500 (public/gt500.glb, built by
 * tools/gt500/build_gt500.py at real S197 dimensions). Same rig
 * contract as the Stallion GLB: nose +X, wheels as WheelFL/FR/RL/RR
 * objects with axle-centre origins. Loads async; the procedural
 * stand-in stays if it fails. No upgrade morphs exist for this body —
 * applyStallionUpgrades is Stallion sheet-metal and is NOT applied.
 */
export function attachGt500Glb(v: Vehicle): void {
  import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(GT500_GLB_PATH))
    .then((gltf) => {
      const model = gltf.scene;
      const wrapper = new THREE.Group();
      wrapper.rotation.y = -Math.PI / 2;
      wrapper.add(model);
      // clear the procedural stand-in
      while (v.group.children.length) v.group.remove(v.group.children[0]);
      v.wheelSpin = [];
      v.wheelPivots = [];
      v.group.add(wrapper);
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      // wheel rig: GT500_WHEEL_RIG is already in CarPhysics suspension
      // order [FR, FL, RR, RL] (see gt500Def.ts)
      const steerPivots: THREE.Object3D[] = [];
      const spinPivots: THREE.Object3D[] = [];
      const suspPivots: { obj: THREE.Object3D; baseY: number; wheelIdx: number }[] = [];
      for (const [name, wheelIdx] of GT500_WHEEL_RIG) {
        const wheel = model.getObjectByName(name);
        if (!wheel || !wheel.parent) continue;
        const susp = new THREE.Group();
        susp.position.copy(wheel.position);
        wheel.parent.add(susp);
        susp.add(wheel);
        wheel.position.set(0, 0, 0);
        const spin = new THREE.Group();
        spin.position.copy(wheel.position);
        susp.add(spin);
        spin.add(wheel);
        wheel.position.set(0, 0, 0);
        suspPivots.push({ obj: susp, baseY: susp.position.y, wheelIdx });
        spinPivots.push(spin);
        if (wheelIdx <= 1) steerPivots.push(susp);
      }
      // headlights: real spotlights seated at the S197 lenses (glTF
      // space: nose +X, up +Y, width on Z) — light only, no glow shell
      const headLights: THREE.SpotLight[] = [];
      for (const sz of [-0.62, 0.62]) {
        const spot = new THREE.SpotLight(0xffeec4, 0, 60, 0.46, 0.55, 1.2);
        spot.position.set(2.38, 0.66, sz);
        spot.target.position.set(14, 0, sz * 1.25);
        wrapper.add(spot);
        wrapper.add(spot.target);
        headLights.push(spot);
      }
      v.glb = { wrapper, steerPivots, spinPivots, suspPivots, headLights };
    })
    .catch((err) => {
      console.warn('[Vehicles] gt500.glb failed to load; procedural body stands:', err);
    });
}

export const SEAHAWK_GLB_PATH = '/seahawk.glb';

/** Where the Seahawk sits: the hangar apron survey point on the airbase
 *  plateau (AIRFIELD_LAYOUT's hangar at AIRBASE_CENTER + (-18,-34), its
 *  apron 24 m south of the hangar front). Heading -PI/2 reads as a
 *  vehicle heading — nose west, parked parallel to the hangar front. */
export const SEAHAWK_PAD = { x: 462, z: -118, heading: -Math.PI / 2 };

/**
 * Lane 2's MH-60S Seahawk (public/seahawk.glb, tools/seahawk/SPEC.md),
 * staged as a STATIC landmark on the airbase apron. Deliberately NOT a
 * Vehicle instance: no flight model exists yet (heliMath was purged),
 * so nothing here touches the vehicle save shape — it's a world prop
 * that loads async and simply never appears if the fetch fails. The
 * model's gear bottoms sit on its local z=0 plane and its glTF space
 * matches the cars' (nose +X, up +Y — verified against the shipped
 * node transforms), so the same wrapper correction applies: -PI/2
 * about Y brings the nose to the stack's +Z forward before the pad
 * heading turns it west. Doors ship closed, rotors parked in X —
 * boarding/flight wiring is a later stage.
 */
export function placeSeahawk(scene: THREE.Scene, groundY: (x: number, z: number) => number): void {
  const y = groundY(SEAHAWK_PAD.x, SEAHAWK_PAD.z);
  import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(SEAHAWK_GLB_PATH))
    .then((gltf) => {
      const model = gltf.scene;
      const wrapper = new THREE.Group();
      wrapper.rotation.y = -Math.PI / 2;
      wrapper.add(model);
      const group = new THREE.Group();
      group.add(wrapper);
      group.position.set(SEAHAWK_PAD.x, y, SEAHAWK_PAD.z);
      group.rotation.y = SEAHAWK_PAD.heading;
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(group);
    })
    .catch((err) => {
      console.warn('[Vehicles] seahawk.glb failed to load; the apron stands empty:', err);
    });
}

/** Per-frame GLB rig update: steering, spin, suspension travel. */
export function applyGlbVisuals(v: Vehicle): void {
  const g = v.glb;
  if (!g) return;
  for (const p of g.steerPivots) p.rotation.y = v.steerVis;
  for (const p of g.spinPivots) p.rotation.z = -v.wheelSpinAngle;
  for (const s of g.suspPivots) {
    const len = v.suspension[s.wheelIdx] ?? 0.32;
    // shorter ray = compressed = wheel travels UP into the arch
    s.obj.position.y = s.baseY + (v.suspRest - len);
  }
}
