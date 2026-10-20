// Airbase.ts — the AIRBASE wave's built environment: the fleet depot
// (MAINT-BAY), the airbase complex (runway, helipads, hangar, radar tower,
// command center, ammo depot, checkpoint, perimeter) and the beached
// Heavy Logistics Carrier POI. Modeled from Ian's renders in
// design-refs/airbase/ — shaped geometry (tapered cylinders, domes,
// lofted/extruded hulls, real gable geometry), flat-shaded to match.
//
// Output mirrors PoiBuildResult (world-space colliders / floors /
// containers / roofs) so World can merge it straight into poiBuildings.

import * as THREE from 'three';
import { FURNITURE_LOOT, type HuskLootEntry } from '../data/items';
import type { Collider, FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import type { PoiBuildResult } from './PoiBuildings';

type GroundY = (x: number, z: number) => number;

export interface AirbaseFootprint { cx: number; cz: number; hw: number; hd: number }

/** The carrier's main deck height (world Y). Vehicle spawns aboard and
 *  the carrier builder both anchor to this one number. */
export const CARRIER_DECK_Y = 3.1;

const mat = (color: number, rough = 0.95, metal = 0.05, flat = false) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
const STEEL = () => mat(0x5f6a72, 0.8, 0.25);
const CORRUGATED = () => mat(0x707880, 0.85, 0.2);
const CONCRETE = () => mat(0x8f8c84, 1, 0);
const DARK = () => mat(0x2e3236, 0.9, 0.1);
const GLASS = () => mat(0x27333e, 0.18, 0.55);
const TEAL = () => mat(0x2e6f6a, 0.7, 0.2);
const RUST = () => mat(0x8a5a38, 0.95, 0.05);

/** Stencil lettering as a transparent canvas texture (the family look:
 *  NOMAD hull stencil, MAINT-BAY 02, SECTOR 4 — AMMO DEPOT). */
function stencilTex(lines: string[], fg = '#e8e6df', px = 92): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128 * lines.length;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = `bold ${px}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => ctx.fillText(ln, 24, 64 + i * 128));
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function stencilPlane(lines: string[], w: number, fg?: string): THREE.Mesh {
  const h = w * (0.125 * lines.length);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: stencilTex(lines, fg), transparent: true, roughness: 0.9 }),
  );
  return m;
}

/** Builder with an origin: meshes are local, colliders/floors/containers
 *  are emitted in world space directly (carrier decks ride above terrain,
 *  so floor Y must be the true world height). */
export class AB {
  group = new THREE.Group();
  colliders: Collider[] = [];
  floors: FloorRect[] = [];
  containers: ContainerDef[] = [];
  roofs: PoiBuildResult['roofs'] = [];
  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly base: number, // world Y of local y=0
  ) {
    this.group.position.set(cx, base, cz);
  }
  box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
  /** World-space wall collider from a local center + half extents. */
  col(lx: number, lz: number, hw: number, hd: number, minY?: number): void {
    const c: Collider = { x0: this.cx + lx - hw, z0: this.cz + lz - hd, x1: this.cx + lx + hw, z1: this.cz + lz + hd };
    if (minY !== undefined) c.minY = minY;
    this.colliders.push(c);
  }
  floor(lx: number, lz: number, hw: number, hd: number, yLocal: number): void {
    this.floors.push({
      x0: this.cx + lx - hw, z0: this.cz + lz - hd,
      x1: this.cx + lx + hw, z1: this.cz + lz + hd,
      y: this.base + yLocal,
    });
  }
  loot(id: string, lx: number, lz: number, loot: HuskLootEntry[], label: string, meshKind: ContainerDef['meshKind'], extra?: Partial<ContainerDef>): void {
    this.containers.push({ id, x: this.cx + lx, z: this.cz + lz, loot, label, meshKind, ...extra });
  }
  /** Endpoint-exact gable roof, ridge along local X (the Houses V3 /
   *  PoiBuildings pattern: panels meet at the ridge, caps close the
   *  X ends in the ZY plane). Registers in roofs[] when asked. */
  gable(w: number, d: number, topY: number, rise: number, m: THREE.Material, register = false, capColor?: number): void {
    const hd = d / 2;
    const slopeLen = Math.hypot(hd + 0.39, rise + 0.08);
    const a = Math.atan2(rise + 0.08, hd + 0.39);
    const rg = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.14, slopeLen), m);
      panel.rotation.x = -sgn * a;
      panel.position.set(0, topY + (rise - 0.04) / 2, sgn * ((hd + 0.33) / 2));
      panel.castShadow = true;
      rg.add(panel);
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.22, 0.08), DARK());
      fascia.position.set(0, topY - 0.02, sgn * (hd + 0.3));
      rg.add(fascia);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.14, 0.3), DARK());
    ridge.position.set(0, topY + rise + 0.02, 0);
    ridge.castShadow = true;
    rg.add(ridge);
    const capMat = mat(capColor ?? 0x5f6a72, 1, 0);
    (capMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    for (const sgn of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, topY - 0.05);
      shape.lineTo(hd, topY - 0.05);
      shape.lineTo(0, topY + rise);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(Math.PI / 2);
      const gable = new THREE.Mesh(geo, capMat);
      gable.position.set(sgn * (w / 2 - 0.02), 0, 0);
      gable.castShadow = true;
      rg.add(gable);
    }
    rg.position.set(this.cx, this.base, this.cz);
    if (register) {
      this.roofs.push({ bounds: { x0: this.cx - w / 2, z0: this.cz - d / 2, x1: this.cx + w / 2, z1: this.cz + d / 2 }, group: rg });
    }
    this.group.parent?.add(rg); // (unused path — see addRoofGroup below)
    (this as { _roofGroups?: THREE.Group[] })._roofGroups = [...((this as { _roofGroups?: THREE.Group[] })._roofGroups ?? []), rg];
  }
  /** Roof groups are positioned in world space; the parent result adds
   *  them to the scene-level group instead of this building's group. */
  takeRoofGroups(): THREE.Group[] {
    const s = this as { _roofGroups?: THREE.Group[] };
    const out = s._roofGroups ?? [];
    s._roofGroups = [];
    return out;
  }
  sandbags(lx: number, lz: number, len: number, alongX = true, y = 0.22): void {
    const m = mat(0x8a7d5f, 1, 0);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.9 + (row % 2) * 0.3;
        const bag = this.box(0.85, 0.2, 0.5, m, alongX ? lx + off : lx, y + row * 0.19, alongX ? lz : lz + off);
        bag.scale.y = 0.9;
      }
    }
  }
  result(): PoiBuildResult {
    return { group: this.group, colliders: this.colliders, floors: this.floors, containers: this.containers, roofs: this.roofs };
  }
}

function mergeInto(out: PoiBuildResult, b: AB): void {
  const r = b.result();
  out.group.add(r.group);
  for (const g of b.takeRoofGroups()) out.group.add(g);
  out.colliders.push(...r.colliders);
  out.floors.push(...r.floors);
  out.containers.push(...r.containers);
  out.roofs.push(...r.roofs);
}

const PARTS_LOOT: HuskLootEntry[] = [
  { id: 'tire', min: 1, max: 1, chance: 0.5 },
  { id: 'engine_part', min: 1, max: 1, chance: 0.42 },
  { id: 'car_battery', min: 1, max: 1, chance: 0.45 },
  { id: 'armor_plate', min: 1, max: 1, chance: 0.3 },
  { id: 'scrap', min: 2, max: 4, chance: 0.85 },
];
const AMMO_LOOT: HuskLootEntry[] = [
  { id: 'ammo_556', min: 6, max: 14, chance: 0.8 },
  { id: 'ammo_rifle', min: 4, max: 9, chance: 0.6 },
  { id: 'shells', min: 4, max: 8, chance: 0.5 },
  { id: 'ammo_9mm', min: 8, max: 16, chance: 0.55 },
  { id: 'frag', min: 1, max: 1, chance: 0.3 },
  { id: 'flare', min: 1, max: 2, chance: 0.4 },
];

// ---------------------------------------------------------------------------
// THE DEPOT — MAINT-BAY: the fleet's home. 48×24 corrugated drive-through
// maintenance hall (render 05): three bays each way, gantry crane, a lift,
// workbenches and parts caches, Machine Shop station inside.

function buildDepot(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax - 52;
  const cz = az + 26;
  const base = groundY(cx, cz) - 0.1;
  const b = new AB(cx, cz, base);
  const W = 48;
  const D = 24;
  const H = 6.4;
  const T = 0.22;
  const steel = STEEL();
  const hw = W / 2;
  const hd = D / 2;
  // foundation skirt + slab + interior floor
  b.box(W + 0.3, 0.6, D + 0.3, mat(0x6a625a), 0, -0.16, 0);
  b.box(W - T, 0.14, D - T, mat(0x7d766c), 0, 0.07, 0);
  b.floor(0, 0, hw - T / 2, hd - T / 2, 0.14);
  // front/back walls: piers between three 9m drive-through bays
  const pierRuns: [number, number][] = [[-24, -20.5], [-11.5, -4.5], [4.5, 11.5], [20.5, 24]];
  for (const zs of [hd - T / 2, -hd + T / 2]) {
    for (const [x0, x1] of pierRuns) {
      const wSeg = x1 - x0;
      b.box(wSeg, H, T, steel, (x0 + x1) / 2, H / 2 - 0.3, zs);
      b.col((x0 + x1) / 2, zs, wSeg / 2, T / 2);
    }
    // header band above the bays (visual only — colliders stay out of the opening)
    b.box(W, H - 4.8, T, steel, 0, 4.8 - 0.3 + (H - 4.8) / 2, zs);
    // girts: horizontal stiffeners that sell the corrugated read
    for (const gy of [1.6, 3.1]) b.box(W, 0.09, 0.05, DARK(), 0, gy, zs + (zs > 0 ? 0.13 : -0.13));
  }
  // end walls: solid, high glass band, pedestrian door on +X end
  for (const xs of [-hw + T / 2, hw - T / 2]) {
    if (xs < 0) {
      b.box(T, H, D - 2 * T, steel, xs, H / 2 - 0.3, 0);
      b.col(xs, 0, T / 2, (D - 2 * T) / 2);
    } else {
      // door gap 1.2 centered: two runs + header
      b.box(T, H, (D - 2 * T) / 2 - 0.6, steel, xs, H / 2 - 0.3, -((D - 2 * T) / 4 + 0.3));
      b.box(T, H, (D - 2 * T) / 2 - 0.6, steel, xs, H / 2 - 0.3, (D - 2 * T) / 4 + 0.3);
      b.col(xs, -((D - 2 * T) / 4 + 0.3), T / 2, ((D - 2 * T) / 2 - 0.6) / 2);
      b.col(xs, (D - 2 * T) / 4 + 0.3, T / 2, ((D - 2 * T) / 2 - 0.6) / 2);
      const leaf = b.box(0.06, 2.05, 1.14, mat(0x4a3a30), xs - 0.1, 0.72, -0.62);
      leaf.rotation.y = 0.5;
    }
    for (const wz of [-6, 0, 6]) {
      const g = b.box(0.07, 1.0, 2.2, GLASS(), xs + (xs > 0 ? 0.02 : -0.02), 4.6, wz);
      g.castShadow = false;
    }
  }
  b.gable(W, D, H - 0.3, 2.3, CORRUGATED(), true, 0x5f6a72);
  // stencil over the middle bay
  const st = stencilPlane(['MAINT-BAY 02'], 13);
  st.position.set(0, 5.6, hd + 0.14);
  b.group.add(st);
  // gantry crane: runway beams along X, bridge across, hoist + hook
  const craneM = mat(0xb87333, 0.7, 0.3);
  for (const rz of [-7, 7]) b.box(W - 4, 0.32, 0.24, craneM, 0, 5.5, rz);
  b.box(0.3, 0.36, 14.6, craneM, -6, 5.85, 0);
  b.box(0.5, 0.5, 0.5, DARK(), -6, 5.45, 0);
  const cable = b.cyl(0.02, 0.02, 1.6, DARK(), -6, 4.4, 0, 5);
  cable.castShadow = false;
  b.box(0.16, 0.3, 0.06, craneM, -6, 3.55, 0);
  // vehicle lift in the east bay: posts + raised platform
  for (const px of [14.6, 19.4]) for (const pz of [-2.2, 2.2]) {
    b.box(0.28, 2.6, 0.28, TEAL(), px, 1.3, pz);
    b.col(px, pz, 0.16, 0.16);
  }
  b.box(5.6, 0.18, 3.6, mat(0x3d434b, 0.7, 0.4), 17, 0.32, 0);
  // workbench run + cabinets along the back wall, tire stacks, tool chests
  b.box(10, 0.9, 0.9, mat(0x5a4632), -14, 0.59, -hd + 1.1);
  b.col(-14, -hd + 1.1, 5, 0.45);
  const tireM = mat(0x1c1c1e, 1, 0);
  for (const [tx, tz, n] of [[22.4, -9.5, 4], [22.4, 9.8, 3], [-22.6, 9.8, 3]] as [number, number, number][]) {
    for (let i = 0; i < n; i++) {
      const tire = b.cyl(0.37, 0.37, 0.26, tireM, tx, 0.27 + i * 0.27, tz, 14);
      void tire;
    }
    b.col(tx, tz, 0.4, 0.4);
  }
  for (const bx of [-20, -8]) {
    const drum = b.cyl(0.32, 0.32, 0.95, RUST(), bx, 0.48, hd - 1.2, 12);
    void drum;
    b.col(bx, hd - 1.2, 0.34, 0.34);
  }
  b.loot('depot_toolbox_1', -19, -8, FURNITURE_LOOT.toolbox.suburban, 'Search toolbox', 'toolbox');
  b.loot('depot_parts_shelf', 4, -10.6, PARTS_LOOT, 'Search parts shelf', 'bookshelf');
  b.loot('depot_cabinet', 12, -10.6, PARTS_LOOT, 'Search parts cabinet', 'cabinets');
  b.loot('depot_crate', -22, 4, FURNITURE_LOOT.crate.suburban, 'Search crate', 'crate');
  return b;
}

// ---------------------------------------------------------------------------
// THE HANGAR — open-front aircraft hangar (36×26): sliding door parked
// open, roof registered for the interior camera rule.

function buildHangar(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax + 86;
  const cz = az - 14;
  const base = groundY(cx, cz) - 0.1;
  const b = new AB(cx, cz, base);
  const W = 36;
  const D = 26;
  const H = 7.6;
  const T = 0.24;
  const steel = STEEL();
  const hw = W / 2;
  const hd = D / 2;
  b.box(W + 0.3, 0.6, D + 0.3, mat(0x6a625a), 0, -0.16, 0);
  b.box(W - T, 0.14, D - T, mat(0x7d766c), 0, 0.07, 0);
  b.floor(0, 0, hw - T / 2, hd - T / 2, 0.14);
  // back + ends solid
  b.box(W, H, T, steel, 0, H / 2 - 0.3, -hd + T / 2);
  b.col(0, -hd + T / 2, W / 2, T / 2);
  for (const xs of [-hw + T / 2, hw - T / 2]) {
    b.box(T, H, D - 2 * T, steel, xs, H / 2 - 0.3, 0);
    b.col(xs, 0, T / 2, (D - 2 * T) / 2);
    for (const wz of [-6, 2]) {
      const g = b.box(0.07, 1.1, 2.4, GLASS(), xs, 5.2, wz);
      g.castShadow = false;
    }
  }
  // front: two stubs + the great header; the sliding door panel parked
  // open against the east stub
  for (const xs of [-hw + 1.5, hw - 1.5]) {
    b.box(3, H, T, steel, xs, H / 2 - 0.3, hd - T / 2);
    b.col(xs, hd - T / 2, 1.5, T / 2);
  }
  b.box(W, H - 6.1, T, steel, 0, 6.1 - 0.3 + (H - 6.1) / 2, hd - T / 2);
  const doorPanel = b.box(11, 5.9, 0.12, CORRUGATED(), hw - 8.6, 2.65, hd + 0.35);
  doorPanel.rotation.y = 0.04;
  b.box(11.4, 0.18, 0.3, DARK(), hw - 8.6, 5.75, hd + 0.3); // door rail
  b.gable(W, D, H - 0.3, 1.9, CORRUGATED(), true, 0x5f6a72);
  const st = stencilPlane(['NOMAD AIR'], 8);
  st.position.set(-hw + 6, 6.7, hd + 0.14);
  b.group.add(st);
  // interior dressing: work light strip, barrels, a wing crate, tool cabinet
  const strip = b.box(20, 0.08, 0.3, mat(0xf2e3b3, 0.4, 0, true), 0, H - 0.75, 0);
  (strip.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xf2e3b3);
  (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
  for (const [bx, bz] of [[-15, -10], [-14, -10], [15.5, -10]] as [number, number][]) {
    b.cyl(0.32, 0.32, 0.95, RUST(), bx, 0.48, bz, 12);
    b.col(bx, bz, 0.34, 0.34);
  }
  b.loot('hangar_toolbox', -16, -4, FURNITURE_LOOT.toolbox.suburban, 'Search toolbox', 'toolbox');
  b.loot('hangar_cabinet', 16, -11, PARTS_LOOT, 'Search parts cabinet', 'cabinets');
  return b;
}

// ---------------------------------------------------------------------------
// CONTROL TOWER — concrete shaft, balcony ring, glass cab, and the radar
// dome + EW fit from render 05 on top.

function buildTower(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax + 118;
  const cz = az + 26;
  const base = groundY(cx, cz) - 0.1;
  const b = new AB(cx, cz, base);
  const conc = CONCRETE();
  b.box(7.5, 0.6, 7.5, mat(0x6a625a), 0, -0.16, 0);
  // tapered shaft: two stacked, slightly shrinking boxes read as cast concrete
  b.box(6.2, 6.5, 6.2, conc, 0, 2.95, 0);
  b.box(5.6, 4.5, 5.6, conc, 0, 8.4, 0);
  b.col(0, 0, 3.1, 3.1);
  // door + slit windows up the shaft
  b.box(1.1, 2.1, 0.08, DARK(), 0, 0.75, 3.12);
  for (const wy of [3.4, 6.2, 9.2]) b.box(0.7, 0.5, 0.07, GLASS(), 0, wy, 2.82 - (wy > 5 ? 0.3 : 0));
  // balcony ring at the cab floor: slab + railing posts
  b.box(8.6, 0.22, 8.6, mat(0x6a625a), 0, 10.72, 0);
  const railM = DARK();
  for (let i = -4; i <= 4; i++) {
    b.box(0.06, 0.85, 0.06, railM, i * 1.05, 11.25, 4.24);
    b.box(0.06, 0.85, 0.06, railM, i * 1.05, 11.25, -4.24);
    b.box(0.06, 0.85, 0.06, railM, 4.24, 11.25, i * 1.05);
    b.box(0.06, 0.85, 0.06, railM, -4.24, 11.25, i * 1.05);
  }
  b.box(8.6, 0.06, 0.06, railM, 0, 11.68, 4.24);
  b.box(8.6, 0.06, 0.06, railM, 0, 11.68, -4.24);
  // the cab: glass band all round under a slab roof
  b.box(7.2, 0.25, 7.2, conc, 0, 10.95, 0);
  for (const [w, d, x, z] of [[7.2, 0.18, 0, 3.45], [7.2, 0.18, 0, -3.45], [0.18, 7.2, 3.45, 0], [0.18, 7.2, -3.45, 0]] as [number, number, number, number][]) {
    const g = b.box(w, 1.9, d, GLASS(), x, 12.05, z);
    g.castShadow = false;
  }
  for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]] as [number, number][]) {
    b.box(0.3, 2.2, 0.3, conc, x, 12.05, z);
  }
  b.box(7.8, 0.28, 7.8, mat(0x4c4f52, 0.9, 0.2), 0, 13.15, 0);
  // radar dome: a faceted sphere on a drum, sage green (render 05)
  b.cyl(1.5, 1.7, 0.7, mat(0x6a7078, 0.8, 0.3), 0, 13.6, 0, 10);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.15, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x8b957e, 0.85, 0.05, true),
  );
  dome.position.set(0, 13.9, 0);
  dome.castShadow = true;
  b.group.add(dome);
  // EW fit: whip antennas, a small dish, a yagi cross
  const mastM = DARK();
  for (const [mx, mz, mh] of [[-2.9, -2.9, 3.4], [2.9, -2.6, 2.6], [2.7, 2.8, 2.2]] as [number, number, number][]) {
    const whip = b.cyl(0.03, 0.05, mh, mastM, mx, 13.3 + mh / 2, mz, 5);
    whip.castShadow = false;
  }
  const dish = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), mat(0x9aa0a4, 0.6, 0.4));
  dish.position.set(-3.2, 14.4, 1.5);
  dish.rotation.set(-0.5, 0.7, 0);
  b.group.add(dish);
  b.box(0.08, 1.6, 0.08, mastM, -2.9, 15.6, -2.9);
  b.box(1.1, 0.06, 0.06, mastM, -2.9, 16.2, -2.9);
  b.loot('tower_cache', 2.8, 2.8, FURNITURE_LOOT.toolbox.suburban, 'Search toolbox', 'toolbox');
  return b;
}

// ---------------------------------------------------------------------------
// COMMAND CENTER (render 06) — concrete block, sandbagged roof ring, dish,
// crates; enterable, with a light military loot inside.

function buildCommand(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax + 28;
  const cz = az + 30;
  const base = groundY(cx, cz) - 0.1;
  const b = new AB(cx, cz, base);
  const W = 14;
  const D = 10;
  const H = 3.6;
  const T = 0.24;
  const conc = mat(0x98958a, 1, 0);
  const hw = W / 2;
  const hd = D / 2;
  b.box(W + 0.3, 0.6, D + 0.3, mat(0x6a625a), 0, -0.16, 0);
  b.box(W - T, 0.14, D - T, mat(0x7d766c), 0, 0.07, 0);
  b.floor(0, 0, hw - T / 2, hd - T / 2, 0.14);
  // walls: front has the door gap (1.3, offset left), others solid
  b.box(W, H, T, conc, 0, H / 2 - 0.3, -hd + T / 2);
  b.col(0, -hd + T / 2, W / 2, T / 2);
  for (const xs of [-hw + T / 2, hw - T / 2]) {
    b.box(T, H, D - 2 * T, conc, xs, H / 2 - 0.3, 0);
    b.col(xs, 0, T / 2, (D - 2 * T) / 2);
    const g = b.box(0.07, 0.8, 1.6, GLASS(), xs, 2.2, 0);
    g.castShadow = false;
  }
  const doorC = -2.2;
  b.box(doorC - 0.65 + hw, H, T, conc, (-hw + (doorC - 0.65)) / 2, H / 2 - 0.3, hd - T / 2);
  b.col((-hw + (doorC - 0.65)) / 2, hd - T / 2, (doorC - 0.65 + hw) / 2, T / 2);
  b.box(hw - (doorC + 0.65), H, T, conc, (doorC + 0.65 + hw) / 2, H / 2 - 0.3, hd - T / 2);
  b.col((doorC + 0.65 + hw) / 2, hd - T / 2, (hw - (doorC + 0.65)) / 2, T / 2);
  const leaf = b.box(1.24, 2.05, 0.06, mat(0x44584c, 0.9, 0.1), doorC - 0.6, 0.72, hd - 0.2);
  leaf.rotation.y = 0.45;
  // flat roof slab + sandbag ring + dish + crates up top
  const roof = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.18, D + 0.5), mat(0x7a766c, 1, 0));
  slab.position.set(cx, base + H - 0.28, cz);
  slab.castShadow = true;
  roof.add(slab);
  b.roofs.push({ bounds: { x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd }, group: roof });
  (b as { _roofGroups?: THREE.Group[] })._roofGroups = [...((b as { _roofGroups?: THREE.Group[] })._roofGroups ?? []), roof];
  b.sandbags(0, -hd + 0.5, W - 1.5, true, H - 0.05);
  b.sandbags(0, hd - 0.5, W - 1.5, true, H - 0.05);
  b.sandbags(-hw + 0.5, 0, D - 1.5, false, H - 0.05);
  b.sandbags(hw - 0.5, 0, D - 1.5, false, H - 0.05);
  // the dish: a tilted disc on a pedestal, looking at the Static
  const ped = b.cyl(0.22, 0.3, 0.8, DARK(), 2.5, H + 0.35, -1.5, 8);
  void ped;
  const dish = new THREE.Mesh(new THREE.CircleGeometry(1.6, 18), mat(0xb9bdb9, 0.55, 0.35));
  dish.position.set(2.5, H + 1.15, -1.5);
  dish.rotation.set(-0.9, 0.3, 0);
  dish.castShadow = true;
  b.group.add(dish);
  const feed = b.cyl(0.03, 0.03, 1.1, DARK(), 2.5, H + 1.0, -1.15, 5);
  feed.rotation.x = 0.9;
  // roof crates + antenna mast with a blinking amber lamp (emissive)
  b.box(1.1, 0.7, 1.1, mat(0x565e4c, 0.9, 0.05), -3.5, H + 0.28, 2.5);
  b.box(0.9, 0.55, 0.9, mat(0x565e4c, 0.9, 0.05), -2.2, H + 0.2, 2.6);
  const mast = b.cyl(0.05, 0.07, 3.6, DARK(), -5.5, H + 1.7, -3.5, 6);
  mast.castShadow = false;
  const lamp = b.box(0.16, 0.16, 0.16, mat(0xffb35c, 0.4, 0, true), -5.5, H + 3.55, -3.5);
  (lamp.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff9a3c);
  (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
  // interior: map table (visual) + cabinets with a light tactical table
  b.box(2.6, 0.85, 1.3, mat(0x5a4632), 1.5, 0.56, -2.5);
  b.col(1.5, -2.5, 1.3, 0.65);
  b.loot('cmd_cabinets', -5.8, -3.8, [
    { id: 'ammo_9mm', min: 4, max: 10, chance: 0.6 },
    { id: 'wire', min: 1, max: 3, chance: 0.55 },
    { id: 'bandage', min: 1, max: 2, chance: 0.5 },
    { id: 'flare', min: 1, max: 2, chance: 0.45 },
  ], 'Search command cabinets', 'cabinets');
  b.loot('cmd_crate', 5.6, 3.6, FURNITURE_LOOT.crate.suburban, 'Search crate', 'crate');
  return b;
}

// ---------------------------------------------------------------------------
// AMMO DEPOT (render 06) — corrugated gable shed, SECTOR 4 stencil, roll
// door shut; the ammo lives in stacks by the door.

function buildAmmoDepot(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax + 66;
  const cz = az + 34;
  const base = groundY(cx, cz) - 0.1;
  const b = new AB(cx, cz, base);
  const W = 13;
  const D = 9;
  const H = 3.8;
  const T = 0.2;
  const steel = STEEL();
  const hw = W / 2;
  const hd = D / 2;
  b.box(W + 0.3, 0.6, D + 0.3, mat(0x6a625a), 0, -0.16, 0);
  b.box(W, H, T, steel, 0, H / 2 - 0.3, -hd + T / 2);
  b.col(0, -hd + T / 2, W / 2, T / 2);
  b.box(W, H, T, steel, 0, H / 2 - 0.3, hd - T / 2);
  b.col(0, hd - T / 2, W / 2, T / 2);
  for (const xs of [-hw + T / 2, hw - T / 2]) {
    b.box(T, H, D - 2 * T, steel, xs, H / 2 - 0.3, 0);
    b.col(xs, 0, T / 2, (D - 2 * T) / 2);
  }
  b.gable(W, D, H - 0.3, 1.5, CORRUGATED(), false, 0x5f6a72);
  // roll door on the front, SHUT: slat curtain proud of the wall
  const slatM = mat(0x8b9299, 0.6, 0.35);
  for (let i = 0; i < 8; i++) b.box(4.2, 0.4, 0.06, slatM, -1.5, 0.35 + i * 0.4, hd + 0.06);
  // side pedestrian door (visual, shut)
  b.box(0.07, 2.05, 1.0, DARK(), hw + 0.02, 0.72, 1.5);
  const st = stencilPlane(['SECTOR 4 - AMMO DEPOT'], 10);
  st.position.set(1.2, 2.9, hd + 0.14);
  b.group.add(st);
  // ammo stacks flanking the door + a generator box (render 06)
  const canM = mat(0x565e4c, 0.85, 0.1);
  for (const [sx, sz] of [[-4.6, hd + 1.2], [-4.6, hd + 2.3], [3.9, hd + 1.2]] as [number, number][]) {
    b.box(1.15, 0.62, 0.75, canM, sx, 0.31, sz);
    b.box(1.15, 0.62, 0.75, canM, sx + 0.15, 0.93, sz);
    b.col(sx, sz, 0.6, 0.4);
  }
  const gen = b.box(1.6, 1.1, 1.0, mat(0x707880, 0.8, 0.2), 5.6, 0.55, hd + 1.4);
  void gen;
  b.col(5.6, hd + 1.4, 0.8, 0.5);
  b.loot('ammo_stack_1', -4.6, hd + 1.75, AMMO_LOOT, 'Search ammo stack', 'crate', { searchTime: 3 });
  b.loot('ammo_stack_2', 3.9, hd + 1.2, AMMO_LOOT, 'Search ammo stack', 'crate', { searchTime: 3 });
  b.loot('ammo_stack_3', 0.5, hd + 1.6, [
    { id: 'ammo_556', min: 8, max: 16, chance: 0.85 },
    { id: 'frag', min: 1, max: 2, chance: 0.4 },
    { id: 'flashbang', min: 1, max: 1, chance: 0.3 },
    { id: 'smoke', min: 1, max: 1, chance: 0.3 },
  ], 'Search ammo stack', 'crate', { searchTime: 3 });
  return b;
}

// ---------------------------------------------------------------------------
// Site furniture: barracks module, watchtowers, bunkers, fuel farm.

function buildBarracks(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax - 30;
  const cz = az - 38;
  const base = groundY(cx, cz) - 0.05;
  const b = new AB(cx, cz, base);
  // a lived-in container module (render 05): ribbed sides via thin ribs,
  // end doors, windows with shutters, roof AC units
  const body = mat(0x44584c, 0.9, 0.1);
  b.box(8.6, 2.7, 3.1, body, 0, 1.4, 0);
  b.col(0, 0, 4.3, 1.55);
  for (let i = -5; i <= 5; i++) {
    b.box(0.09, 2.5, 0.04, mat(0x3a4c41, 0.9, 0.1), i * 0.78, 1.4, 1.57);
    b.box(0.09, 2.5, 0.04, mat(0x3a4c41, 0.9, 0.1), i * 0.78, 1.4, -1.57);
  }
  for (const wx of [-2.6, 0.4, 2.8]) {
    const g = b.box(0.9, 0.7, 0.05, GLASS(), wx, 1.8, 1.58);
    g.castShadow = false;
    b.box(1.0, 0.08, 0.06, DARK(), wx, 1.38, 1.58);
  }
  b.box(0.05, 2.1, 1.1, DARK(), 4.32, 1.1, 0);
  for (const acx of [-2.4, 1.8]) b.box(1.2, 0.5, 0.9, mat(0x9aa0a4, 0.8, 0.3), acx, 3.0, 0);
  b.box(1.4, 0.18, 0.9, mat(0x6a625a), 5.1, 0.09, 0); // step
  b.loot('barracks_crate', 5.6, 1.8, [
    { id: 'canned_food', min: 2, max: 4, chance: 0.85 },
    { id: 'water_bottle', min: 2, max: 3, chance: 0.7 },
    { id: 'bandage', min: 1, max: 2, chance: 0.5 },
    { id: 'cooked_meat', min: 1, max: 2, chance: 0.4 },
  ], 'Search rations crate', 'crate');
  return b;
}

function buildWatchtower(ax: number, az: number, dx: number, dz: number, groundY: GroundY): AB {
  const cx = ax + dx;
  const cz = az + dz;
  const base = groundY(cx, cz) - 0.05;
  const b = new AB(cx, cz, base);
  const legM = mat(0x6e5638, 0.95, 0.05); // rust-brown truss steel
  const H = 8;
  // four splayed legs + two brace tiers
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const leg = b.box(0.18, H + 0.6, 0.18, legM, sx * 1.05, H / 2, sz * 1.05);
    leg.rotation.z = -sx * 0.055;
    leg.rotation.x = sz * 0.055;
  }
  for (const tierY of [2.6, 5.2]) {
    for (const sgn of [-1, 1]) {
      const brace = b.box(2.5, 0.1, 0.1, legM, 0, tierY, sgn * (1.32 - tierY * 0.05));
      brace.rotation.z = 0.5;
      const brace2 = b.box(2.5, 0.1, 0.1, legM, 0, tierY, sgn * (1.32 - tierY * 0.05));
      brace2.rotation.z = -0.5;
    }
  }
  b.col(0, 0, 1.15, 1.15);
  // cab: floor, half walls, window band, pyramid cap roof
  b.box(3.4, 0.18, 3.4, mat(0x5a4632), 0, H + 0.09, 0);
  b.box(3.3, 0.9, 3.3, mat(0x707880, 0.85, 0.2), 0, H + 0.6, 0);
  for (const [w, d, x, z] of [[3.3, 0.14, 0, 1.6], [3.3, 0.14, 0, -1.6], [0.14, 3.3, 1.6, 0], [0.14, 3.3, -1.6, 0]] as [number, number, number, number][]) {
    const g = b.box(w, 0.85, d, GLASS(), x, H + 1.45, z);
    g.castShadow = false;
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.1, 4), mat(0x4c4f52, 0.9, 0.2, true));
  cap.rotation.y = Math.PI / 4;
  cap.position.set(0, H + 2.45, 0);
  cap.castShadow = true;
  b.group.add(cap);
  // searchlight under the cab rail
  const lampM = mat(0xf2e3b3, 0.4, 0, true);
  (lampM as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xf2e3b3);
  (lampM as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  b.box(0.3, 0.22, 0.22, lampM, 0, H + 1.0, 1.78);
  return b;
}

function buildBunker(ax: number, az: number, dx: number, dz: number, groundY: GroundY): AB {
  const cx = ax + dx;
  const cz = az + dz;
  const base = groundY(cx, cz) - 0.05;
  const b = new AB(cx, cz, base);
  const conc = mat(0x5d6a63, 1, 0, true); // weathered teal-green concrete (render 07)
  const main = b.box(6.2, 2.5, 3.6, conc, 0, 1.25, 0);
  void main;
  b.box(6.6, 0.35, 4.0, conc, 0, 2.65, 0);
  // the firing slit: a recessed black band across the front
  b.box(4.6, 0.32, 0.1, mat(0x101314, 1, 0), 0, 1.55, 1.83);
  b.box(0.8, 0.5, 0.5, conc, -1.2, 3.05, 0); // roof hatch block
  b.col(0, 0, 3.1, 1.8);
  b.sandbags(0, 2.6, 6.4, true, 0.2);
  b.sandbags(-3.9, 0.8, 3.4, false, 0.2);
  return b;
}

function buildFuelFarm(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax - 88;
  const cz = az - 32;
  const base = groundY(cx, cz) - 0.05;
  const b = new AB(cx, cz, base);
  const tankM = mat(0x707880, 0.7, 0.35);
  for (const off of [-1.6, 1.6]) {
    const tank = b.cyl(1.05, 1.05, 4.4, tankM, 0, 1.25, off, 14);
    tank.rotation.z = Math.PI / 2;
    for (const sx of [-1.6, 1.6]) b.box(0.3, 0.7, 0.5, mat(0x4c4f52, 0.9, 0.2), sx, 0.35, off);
    // rust banding
    for (const bx of [-1.4, 0, 1.4]) {
      const band = b.cyl(1.07, 1.07, 0.16, RUST(), bx, 1.25, off, 14);
      band.rotation.z = Math.PI / 2;
    }
  }
  b.col(0, 0, 2.4, 3.1);
  const pipe = b.cyl(0.07, 0.07, 3.4, DARK(), 2.6, 0.8, 0, 8);
  pipe.rotation.x = Math.PI / 2;
  for (const [dx, dz] of [[3.4, -1.8], [3.4, -0.9], [3.4, 0.9]] as [number, number][]) {
    b.cyl(0.3, 0.3, 0.9, RUST(), dx, 0.45, dz, 11);
  }
  b.loot('fuel_cache', 3.4, 2.2, [
    { id: 'fuel_can', min: 1, max: 2, chance: 0.75 },
    { id: 'scrap', min: 1, max: 3, chance: 0.6 },
  ], 'Search fuel drums', 'barrel');
  return b;
}

// ---------------------------------------------------------------------------
// CHECKPOINT (renders 05/06/07) — guard booth, RAISED barrier arm, chain
// fence runs, jersey barriers on the complex's west entrance lane.

function buildCheckpoint(ax: number, az: number, groundY: GroundY): AB {
  const cx = ax - 128;
  const cz = az + 8;
  const base = groundY(cx, cz) - 0.05;
  const b = new AB(cx, cz, base);
  // booth
  b.box(2.4, 2.6, 2.4, mat(0x44584c, 0.9, 0.1), 0, 1.3, -4.2);
  b.box(2.7, 0.18, 2.7, mat(0x33373c, 0.9, 0.2), 0, 2.7, -4.2);
  for (const [w, d, x, z] of [[2.0, 0.06, 0, -3.05], [2.0, 0.06, 0, -5.35], [0.06, 2.0, 1.18, -4.2], [0.06, 2.0, -1.18, -4.2]] as [number, number, number, number][]) {
    const g = b.box(w, 0.8, d, GLASS(), x, 1.85, z);
    g.castShadow = false;
  }
  b.col(0, -4.2, 1.2, 1.2);
  // barrier machine + arm, raised so traffic passes (arm = striped segments)
  b.box(0.5, 1.05, 0.5, mat(0xb87333, 0.7, 0.3), 1.9, 0.52, -1.6);
  const arm = new THREE.Group();
  arm.position.set(cx + 1.9, base + 1.0, cz - 1.6);
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.2, 0.78),
      mat(i % 2 === 0 ? 0xc23b2e : 0xe8e6df, 0.7, 0.1),
    );
    seg.position.set(0, i * 0.72, 0);
    seg.castShadow = true;
    arm.add(seg);
  }
  arm.rotation.x = 0; // arm segments stack +Y: the arm points UP (raised)
  (b as { _roofGroups?: THREE.Group[] })._roofGroups = [...((b as { _roofGroups?: THREE.Group[] })._roofGroups ?? []), arm];
  b.roofs.length = 0; // arm is a prop group, not a hideable roof — it rides _roofGroups only as a carrier
  // fence runs north + south of the lane: posts, top rail, dark mesh sheet
  const fenceM = mat(0x3a4046, 0.9, 0.3);
  for (const [fz, len] of [[-9.5, 26], [5.5, 30]] as [number, number][]) {
    const n = Math.floor(len / 3);
    for (let i = 0; i <= n; i++) b.box(0.09, 2.3, 0.09, DARK(), -len / 2 + i * 3, 1.15, fz);
    b.box(len, 0.07, 0.07, DARK(), 0, 2.28, fz);
    const sheet = b.box(len, 1.9, 0.03, fenceM, 0, 1.2, fz);
    sheet.castShadow = false;
    b.col(0, fz, len / 2, 0.12);
  }
  // jersey barriers flanking the lane
  for (const [jx, jz] of [[-3.4, -1.2], [4.4, -1.2], [-3.4, 2.8], [4.4, 2.8]] as [number, number][]) {
    b.box(2.2, 0.55, 0.5, CONCRETE(), jx, 0.28, jz);
    b.box(2.2, 0.45, 0.24, CONCRETE(), jx, 0.78, jz);
    b.col(jx, jz, 1.1, 0.26);
  }
  return b;
}

// ---------------------------------------------------------------------------
// Ground plane works: runway, taxiway, helipads, aprons, perimeter HESCO.

function buildGroundWorks(ax: number, az: number, groundY: GroundY): AB {
  const b = new AB(ax, az, 0);
  const slab = (lx: number, lz: number, w: number, d: number, color: number, y = 0.045) => {
    const gy = groundY(ax + lx, az + lz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), mat(color, 1, 0));
    m.position.set(ax + lx, gy + y, az + lz);
    m.receiveShadow = true;
    b.group.add(m);
    return m;
  };
  b.group.position.set(0, 0, 0);
  // runway: 230×24 asphalt, centerline dashes, threshold bars, edge lights
  slab(10, -52, 230, 24, 0x33373c);
  const dashM = mat(0xd8d4c8, 0.9, 0);
  for (let x = -100; x <= 120; x += 16) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(7, 0.02, 0.5), dashM);
    dash.position.set(ax + x, groundY(ax + x, az - 52) + 0.1, az - 52);
    b.group.add(dash);
  }
  for (const tx of [-102, 122]) {
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 2.2), dashM);
      bar.position.set(ax + tx, groundY(ax + tx, az - 52) + 0.1, az - 52 + i * 3.1);
      b.group.add(bar);
    }
  }
  const edgeM = mat(0xffb35c, 0.4, 0, true);
  (edgeM as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff9a3c);
  (edgeM as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
  for (let x = -104; x <= 124; x += 19) {
    for (const lz of [-64.5, -39.5]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.32), edgeM);
      lamp.position.set(ax + x, groundY(ax + x, az + lz) + 0.12, az + lz);
      b.group.add(lamp);
    }
  }
  // taxiway from the runway down to the apron + the motor-pool apron
  // (wide enough for the fleet rows and the trailer yard)
  slab(40, -26, 15, 30, 0x3a3f45);
  slab(2, 40, 235, 76, 0x3d4148);
  // helipads ×3: concrete, painted ring + H, teal corner lights
  const ringM = mat(0xd8d4c8, 0.9, 0);
  const cornerM = mat(0x7ae0d4, 0.4, 0, true);
  (cornerM as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x2e8f86);
  (cornerM as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  for (const px of [-62, -16, 30]) {
    slab(px, -18, 16.5, 16.5, 0x555a5e);
    const gy = groundY(ax + px, az - 18);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.15, 28), ringM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(ax + px, gy + 0.105, az - 18);
    b.group.add(ring);
    for (const [hx, hz, hw, hd] of [[-1.15, 0, 0.55, 3.6], [1.15, 0, 0.55, 3.6], [0, 0, 1.75, 0.55]] as [number, number, number, number][]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.02, hd), ringM);
      bar.position.set(ax + px + hx, gy + 0.105, az - 18 + hz);
      b.group.add(bar);
    }
    for (const [lx, lz] of [[-7.6, -7.6], [7.6, -7.6], [-7.6, 7.6], [7.6, 7.6]] as [number, number][]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), cornerM);
      lamp.position.set(ax + px + lx, gy + 0.12, az - 18 + lz);
      b.group.add(lamp);
    }
  }
  return b;
}

function buildPerimeter(ax: number, az: number, groundY: GroundY): AB {
  const b = new AB(ax, az, 0);
  b.group.position.set(0, 0, 0);
  const hescoM = mat(0x9a8a68, 1, 0);
  const hescoTop = mat(0x77694e, 1, 0);
  const run = (lx: number, lz: number, len: number, alongX: boolean) => {
    const gy = groundY(ax + lx, az + lz);
    const n = Math.round(len / 2.3);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 2.3;
      const x = ax + lx + (alongX ? off : 0);
      const z = az + lz + (alongX ? 0 : off);
      const cell = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.25 : 1.05, 1.45, alongX ? 1.05 : 2.25), hescoM);
      cell.position.set(x, gy + 0.72, z);
      cell.castShadow = true;
      cell.receiveShadow = true;
      b.group.add(cell);
      const top = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.25 : 0.9, 0.14, alongX ? 0.9 : 2.25), hescoTop);
      top.position.set(x, gy + 1.5, z);
      b.group.add(top);
    }
    b.colliders.push({
      x0: ax + lx - (alongX ? len / 2 : 0.55), z0: az + lz - (alongX ? 0.55 : len / 2),
      x1: ax + lx + (alongX ? len / 2 : 0.55), z1: az + lz + (alongX ? 0.55 : len / 2),
    });
  };
  // south line with a gap at the depot apron mouth, west line below the checkpoint
  run(-40, 68, 120, true);
  run(95, 68, 55, true);
  run(-133, 40, 44, false);
  run(140, 20, 90, false);
  // jersey barriers dressing the apron edge
  for (const [jx, jz] of [[-96, 44], [-92, 44], [58, 46], [62, 46], [108, -34]] as [number, number][]) {
    const gy = groundY(ax + jx, az + jz);
    const low = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.5), CONCRETE());
    low.position.set(ax + jx, gy + 0.28, az + jz);
    low.castShadow = true;
    b.group.add(low);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.24), CONCRETE());
    top.position.set(ax + jx, gy + 0.78, az + jz);
    top.castShadow = true;
    b.group.add(top);
    b.colliders.push({ x0: ax + jx - 1.1, z0: az + jz - 0.26, x1: ax + jx + 1.1, z1: az + jz + 0.26 });
  }
  return b;
}

// ---------------------------------------------------------------------------

export function airbaseFootprints(pois: Record<string, [number, number]>): AirbaseFootprint[] {
  const p = pois['airbase'] ?? [0, 0];
  const at = (dx: number, dz: number, hw: number, hd: number): AirbaseFootprint => ({ cx: p[0] + dx, cz: p[1] + dz, hw, hd });
  return [
    at(-52, 26, 24.5, 12.5), // depot
    at(86, -14, 18.5, 13.5), // hangar
    at(28, 30, 7.5, 5.5), // command center
    at(66, 34, 7, 5), // ammo depot
    at(118, 26, 4, 4), // tower
    at(-30, -38, 4.6, 2), // barracks
    at(-88, -32, 3.4, 3.6), // fuel farm
    at(-96, -34, 3.4, 2.2), // bunker west
    at(98, 54, 3.4, 2.2), // bunker east
  ];
}

/** The land complex: depot + hangar + tower + command + ammo + site works.
 *  The carrier is built separately (buildCarrier) and merged by World. */
export function buildAirbase(
  scene: THREE.Scene,
  pois: Record<string, [number, number]>,
  groundY: GroundY,
): PoiBuildResult {
  const out: PoiBuildResult = { group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [] };
  const [ax, az] = pois['airbase'] ?? [0, 0];
  mergeInto(out, buildDepot(ax, az, groundY));
  mergeInto(out, buildHangar(ax, az, groundY));
  mergeInto(out, buildTower(ax, az, groundY));
  mergeInto(out, buildCommand(ax, az, groundY));
  mergeInto(out, buildAmmoDepot(ax, az, groundY));
  mergeInto(out, buildBarracks(ax, az, groundY));
  mergeInto(out, buildWatchtower(ax, az, -120, -40, groundY));
  mergeInto(out, buildWatchtower(ax, az, 124, -44, groundY));
  mergeInto(out, buildBunker(ax, az, -96, -34, groundY));
  mergeInto(out, buildBunker(ax, az, 98, 54, groundY));
  mergeInto(out, buildFuelFarm(ax, az, groundY));
  mergeInto(out, buildCheckpoint(ax, az, groundY));
  mergeInto(out, buildGroundWorks(ax, az, groundY));
  mergeInto(out, buildPerimeter(ax, az, groundY));
  scene.add(out.group);
  return out;
}

// ---------------------------------------------------------------------------
// HEAVY LOGISTICS CARRIER — a beached landing ship off the marina, shipped
// as a HIGH-TIER POI (Ian's static-now blessing; a drivable carrier is a
// later wave). Lofted hull, walkable well deck with a stepped bow ramp,
// a two-deck superstructure (bunk room below, glass bridge above), the
// richest loot on the island, and an armored-husk guard pack (Game/Husks).

/** Loft a hull along X: `sections` are (x, halfBeam) pairs; the profile
 *  is a flat-deck D — vertical topsides, curved bilge, flat keel. */
function hullLoft(sections: { x: number; hb: number }[], deckY: number, keelY: number, material: THREE.Material): THREE.Mesh {
  const prof = (hb: number): [number, number][] => [
    [hb, deckY], [hb, deckY - 1.9], [hb * 0.97, -0.6], [hb * 0.78, keelY + 0.5],
    [0, keelY],
    [-hb * 0.78, keelY + 0.5], [-hb * 0.97, -0.6], [-hb, deckY - 1.9], [-hb, deckY],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  sections.forEach((s, ri) => {
    for (const [pz, py] of prof(s.hb)) positions.push(s.x, py, pz);
    void ri;
  });
  const cols = 9;
  for (let ri = 0; ri < sections.length - 1; ri++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = ri * cols + i;
      const b2 = a + 1;
      const c = a + cols;
      const d = b2 + cols;
      indices.push(a, b2, c, b2, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCarrier(
  scene: THREE.Scene,
  pois: Record<string, [number, number]>,
): PoiBuildResult {
  const out: PoiBuildResult = { group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [] };
  const [ax, az] = pois['carrier'] ?? [-688, 48];
  const b = new AB(ax, az, 0);
  const D = CARRIER_DECK_Y;
  const hullM = mat(0x5d6862, 0.62, 0.35);
  const deckM = mat(0x4c554e, 0.85, 0.15);
  const rustM = mat(0x74523a, 0.9, 0.1);
  const tealM = mat(0x39565c, 0.6, 0.3);
  const darkM = mat(0x24282c, 0.85, 0.15);

  // ---- hull (bow toward +X, the island) + transom ----
  const hull = hullLoft([
    { x: 43, hb: 0.5 }, { x: 40, hb: 4.4 }, { x: 34, hb: 7.2 }, { x: 24, hb: 8.35 },
    { x: 12, hb: 8.5 }, { x: 0, hb: 8.5 }, { x: -12, hb: 8.5 }, { x: -24, hb: 8.4 },
    { x: -34, hb: 8.15 }, { x: -42, hb: 7.9 },
  ], D, -2.3, hullM);
  b.group.add(hull);
  b.box(0.3, D + 2.3, 15.8, hullM, -42.1, (D - 2.3) / 2, 0); // transom plate
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const px = -30 + i * 10.5;
      b.box(3.6, 1.5, 0.08, i % 2 ? rustM : mat(0x66706a, 0.7, 0.3), px, 0.6, sgn * 8.56);
      b.box(0.5, 2.2, 0.06, rustM, px + 2.2, 1.7, sgn * 8.58);
    }
  }
  for (const sgn of [1, -1]) {
    const name = stencilPlane(['NOMAD'], 13);
    name.position.set(16, 1.9, sgn * 8.62);
    if (sgn < 0) name.rotation.y = Math.PI;
    b.group.add(name);
    const sub = stencilPlane(['HEAVY LOGISTICS CARRIER'], 15);
    sub.position.set(-8, 1.75, sgn * 8.62);
    if (sgn < 0) sub.rotation.y = Math.PI;
    b.group.add(sub);
  }

  // ---- well deck: floor, tie-down lanes, bulwarks ----
  b.floor(0, 0, 40, 8, D);
  b.box(80, 0.1, 16, deckM, 0, D + 0.02, 0);
  for (const laneZ of [-4.5, 0, 4.5]) {
    b.box(74, 0.03, 0.28, darkM, -2, D + 0.09, laneZ);
    for (let i = 0; i < 9; i++) b.box(0.5, 0.035, 0.9, darkM, -34 + i * 8.5, D + 0.09, laneZ);
  }
  for (const sgn of [1, -1]) {
    b.box(78, 1.15, 0.22, hullM, -1, D + 0.57, sgn * 8.35);
    b.box(78, 0.12, 0.4, tealM, -1, D + 1.2, sgn * 8.35); // teal cap rail
    b.col(0, sgn * 8.35, 39.5, 0.3);
    for (let i = 0; i < 8; i++) b.box(0.18, 1.15, 0.18, tealM, -36 + i * 10.5, D + 0.57, sgn * 8.35);
  }
  b.col(-41.5, 0, 0.4, 8.2);

  // ---- stepped bow ramp down to the waterline (the gangway ashore) ----
  [2.35, 1.6, 0.85, 0.12].forEach((sy, i) => {
    const sx = 42 + i * 4;
    b.floor(sx, 0, 2.1, 3.4, sy);
    b.box(4.2, 0.22, 6.8, deckM, sx, sy - 0.1, 0);
    for (const sgn of [1, -1]) b.box(4.2, 0.75, 0.2, hullM, sx, sy + 0.3, sgn * 3.45);
  });

  // ---- superstructure (stern): bunk deck + glass bridge ----
  const S = { x: -35, hw: 6, hd: 6 };
  const wallM = mat(0x707880, 0.6, 0.3);
  b.box(12, 2.8, 0.25, wallM, S.x, D + 1.4, -S.hd + 0.12);
  b.box(12, 2.8, 0.25, wallM, S.x, D + 1.4, S.hd - 0.12);
  b.box(0.25, 2.8, 12, wallM, S.x - S.hw + 0.12, D + 1.4, 0);
  b.box(0.25, 2.8, 4.9, wallM, S.x + S.hw - 0.12, D + 1.4, -3.55);
  b.box(0.25, 2.8, 4.9, wallM, S.x + S.hw - 0.12, D + 1.4, 3.55);
  b.box(0.25, 0.75, 1.3, wallM, S.x + S.hw - 0.12, D + 2.42, 0); // door header
  b.col(S.x, -S.hd + 0.12, 6, 0.2);
  b.col(S.x, S.hd - 0.12, 6, 0.2);
  b.col(S.x - S.hw + 0.12, 0, 0.2, 6);
  b.col(S.x + S.hw - 0.12, -3.55, 0.2, 2.5);
  b.col(S.x + S.hw - 0.12, 3.55, 0.2, 2.5);
  b.floor(S.x, 0, 5.8, 5.8, D + 0.06); // bunk-room floor
  // bunk room: bunks + lockers (the workbench station is placed aboard by
  // World.buildStations; the sleep point is the bunk corner, Game-side)
  for (const bz of [-4.6, -3.4]) {
    b.box(2.3, 0.14, 1.0, darkM, S.x - 3.6, D + 0.62, bz);
    b.box(2.3, 0.14, 1.0, darkM, S.x - 3.6, D + 1.55, bz);
    b.box(2.2, 0.1, 0.9, mat(0x59614f, 0.95, 0), S.x - 3.6, D + 0.72, bz);
    b.box(2.2, 0.1, 0.9, mat(0x59614f, 0.95, 0), S.x - 3.6, D + 1.65, bz);
    for (const px of [-4.7, -2.5]) b.box(0.1, 1.75, 0.95, darkM, S.x + px, D + 0.9, bz);
  }
  for (let i = 0; i < 3; i++) b.box(0.9, 1.9, 0.5, tealM, S.x - 5.2, D + 0.95, 1.2 + i * 1.15);
  b.box(12, 0.14, 12, wallM, S.x, D + 2.87, 0); // deck-2 slab
  // bridge: low walls + a full glass band + cap (scenic — the helm and
  // chart table read through the glass; entry is via the bunk deck)
  const B2 = D + 2.94;
  b.box(11.6, 0.5, 0.25, wallM, S.x, B2 + 0.25, -S.hd + 0.12);
  b.box(11.6, 0.5, 0.25, wallM, S.x, B2 + 0.25, S.hd - 0.12);
  b.box(0.25, 0.5, 11.6, wallM, S.x - S.hw + 0.12, B2 + 0.25, 0);
  b.box(0.25, 0.5, 11.6, wallM, S.x + S.hw - 0.12, B2 + 0.25, 0);
  const bridgeGlassM = new THREE.MeshStandardMaterial({ color: 0x39505e, roughness: 0.08, metalness: 0.65, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
  for (const gg of [
    b.box(11.6, 1.35, 0.14, bridgeGlassM, S.x, B2 + 1.18, -S.hd + 0.12),
    b.box(11.6, 1.35, 0.14, bridgeGlassM, S.x, B2 + 1.18, S.hd - 0.12),
    b.box(0.14, 1.35, 11.6, bridgeGlassM, S.x + S.hw - 0.12, B2 + 1.18, 0),
    b.box(0.14, 1.35, 11.6, bridgeGlassM, S.x - S.hw + 0.12, B2 + 1.18, 0),
  ]) gg.castShadow = false;
  b.box(11.6, 0.42, 0.25, wallM, S.x, B2 + 2.06, -S.hd + 0.12);
  b.box(11.6, 0.42, 0.25, wallM, S.x, B2 + 2.06, S.hd - 0.12);
  b.box(0.25, 0.42, 11.6, wallM, S.x - S.hw + 0.12, B2 + 2.06, 0);
  b.box(0.25, 0.42, 11.6, wallM, S.x + S.hw - 0.12, B2 + 2.06, 0);
  b.box(2.6, 0.8, 0.5, darkM, S.x + 4.4, B2 + 0.45, 0); // helm console
  const helmWheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 18), darkM);
  helmWheel.position.set(S.x + 3.9, B2 + 1.05, 0);
  helmWheel.rotation.y = Math.PI / 2;
  b.group.add(helmWheel);
  b.box(1.6, 0.75, 1.0, mat(0x6b5a41, 0.85, 0.05), S.x - 2.5, B2 + 0.4, -2.5); // chart table
  // roof (registered for the interior hide rule) + mast + radar
  const roofGroup = new THREE.Group();
  const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.18, 12.4), wallM);
  roofSlab.position.set(ax + S.x, B2 + 2.36, az);
  roofSlab.castShadow = true;
  roofGroup.add(roofSlab);
  out.group.add(roofGroup);
  out.roofs.push({ bounds: { x0: ax + S.x - 6.2, z0: az - 6.2, x1: ax + S.x + 6.2, z1: az + 6.2 }, group: roofGroup });
  const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), darkM);
  mastPole.position.set(S.x - 2, B2 + 4.1, 0);
  mastPole.castShadow = true;
  b.group.add(mastPole);
  b.box(1.9, 0.08, 0.08, darkM, S.x - 2, B2 + 5.2, 0);
  const radarBar = b.box(1.5, 0.09, 0.28, mat(0xd8dccf, 0.4, 0.3), S.x - 2, B2 + 4.35, 0);
  radarBar.rotation.y = 0.5;

  // ---- skiff cradle at the stern quarter (a weathered prop hull) ----
  const cradleX = -33;
  const cradleZ = 11.5;
  for (const [px, pz] of [[-3.4, -1.6], [3.4, -1.6], [-3.4, 1.6], [3.4, 1.6]] as [number, number][]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8), darkM);
    post.position.set(cradleX + px, 1.4, cradleZ + pz);
    b.group.add(post);
  }
  for (const sgn of [1, -1]) b.box(7.4, 0.14, 0.3, darkM, cradleX, 2.6, cradleZ + sgn * 1.6);
  const propSkiff = hullLoft([
    { x: 3.1, hb: 0.2 }, { x: 2.4, hb: 0.85 }, { x: 0.5, hb: 1.05 }, { x: -1.5, hb: 1.05 }, { x: -3.0, hb: 0.95 },
  ], 0.75, -0.35, mat(0x8a8d84, 0.8, 0.1));
  propSkiff.position.set(cradleX, 2.35, cradleZ);
  b.group.add(propSkiff);
  b.box(1.9, 0.07, 0.35, mat(0x6b4a2f, 0.9, 0), cradleX, 2.85, cradleZ);

  // ---- deck dressing ----
  const crateM = mat(0x5d6855, 0.9, 0.05);
  b.box(1.6, 1.1, 1.6, crateM, 22, D + 0.55, -5.6);
  b.box(1.6, 1.1, 1.6, crateM, 22, D + 1.65, -5.6);
  b.box(1.3, 0.9, 1.3, crateM, 24.2, D + 0.45, -5.4);
  b.box(1.6, 1.1, 1.6, crateM, -18, D + 0.55, 5.8);
  b.box(1.2, 0.85, 1.2, mat(0x707880, 0.75, 0.25), -16.2, D + 0.43, 5.6);
  for (const [bx, bz] of [[14, 6.4], [15.1, 6.1], [14.5, 5.2]] as [number, number][]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 12), rustM);
    barrel.position.set(bx, D + 0.44, bz);
    barrel.castShadow = true;
    b.group.add(barrel);
  }
  b.box(1.6, 0.9, 1.2, darkM, 36.5, D + 0.45, 0); // anchor windlass
  const chainPile = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 14), darkM);
  chainPile.rotation.x = Math.PI / 2;
  chainPile.position.set(34.6, D + 0.14, 1.6);
  b.group.add(chainPile);
  for (const sgn of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 8, 16), mat(0xe3e0d5, 0.6, 0.05));
    ring.position.set(-4, D + 0.75, sgn * 8.2);
    b.group.add(ring);
  }

  // ---- the loot: the richest concentration on the island (chance-1
  // rolls are guaranteed — this deck is a guarded vault, not a lottery)
  const sure = (id: string, qty = 1): HuskLootEntry => ({ id, min: qty, max: qty, chance: 1 });
  b.loot('carrier_armory', S.x - 1.5, -4.9, [
    sure('dmr'), sure('reflex_sight'), sure('suppressor'), sure('ammo_556', 2), sure('armored_vest'),
  ], 'Carrier armory safe', 'safe', { locked: true, searchTime: 6 });
  b.loot('carrier_safe', S.x + 2.8, 4.7, [
    sure('valuables', 2), sure('relay_part'), sure('beacon_cell'), sure('extended_mag'), sure('lockpick'),
  ], 'Ship safe', 'safe', { locked: true, searchTime: 6 });
  b.loot('carrier_crate_a', 12, -5.9, [
    sure('carbine'), sure('ammo_556'), sure('foregrip'), sure('laser_sight'),
  ], 'Weapons crate', 'crate', { searchTime: 3.5 });
  b.loot('carrier_crate_b', -12, -6.1, [
    sure('armor_plate', 2), sure('gun_parts', 2), sure('engine_part'), sure('car_battery'),
  ], 'Parts crate', 'crate', { searchTime: 3.5 });
  b.loot('carrier_crate_c', 4, 6.2, [
    sure('medkit'), sure('bandage', 2), sure('riot_helmet'),
  ], 'Medical crate', 'crate', { searchTime: 3.5 });
  b.loot('carrier_toolbox', S.x + 7.6, 3.4, [
    sure('tool_kit'), sure('tire'), sure('fuel_can'),
  ], 'Deck toolbox', 'toolbox');

  mergeInto(out, b);
  scene.add(out.group);
  return out;
}
