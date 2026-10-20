// Houses.ts — procedural enterable houses for POIs.
// v2: closed roofs (gable ends on the correct faces — v1 put them on the
// eave sides, leaving the roof open at both ends), two-story houses with
// real stairs + height-aware floors, a rich two-story variant, garages.
// Wall colliders, floor rects, furniture loot. Deterministic from seed.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import type { Collider, FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import { FURNITURE_LOOT, SAFE_LOOT } from '../data/items';
import { FURNITURE_LABEL, FURNITURE_HALF, type FurnitureKind } from './furnitureMeshes';

export type HouseTier = 'camp' | 'suburban';
export type VariantName =
  | 'ranch' | 'bungalow' | 'farmhouse' | 'ranch2' | 'richhouse' | 'garage' // suburban
  | 'cabin' | 'shack' | 'leanto' | 'ruin'; // camp (+ suburban ruin)

interface HousePlacement {
  poi: string;
  dx: number;
  dz: number;
  variant: VariantName;
  rotQ: 0 | 1 | 2 | 3; // quarter turns
}

const PLACEMENTS: HousePlacement[] = [
  // town — replaces the old shell boxes
  { poi: 'town', dx: -20, dz: -6, variant: 'ranch', rotQ: 1 },
  { poi: 'town', dx: 16, dz: 12, variant: 'ranch2', rotQ: 3 },
  { poi: 'town', dx: 2, dz: 24, variant: 'farmhouse', rotQ: 0 },
  { poi: 'town', dx: -26, dz: 14, variant: 'cabin', rotQ: 2 },
  { poi: 'town', dx: 26, dz: -22, variant: 'shack', rotQ: 1 },
  { poi: 'town', dx: 36, dz: 10, variant: 'richhouse', rotQ: 2 },
  { poi: 'town', dx: -38, dz: -20, variant: 'garage', rotQ: 0 },
  // camps
  { poi: 'shore_camp', dx: 10, dz: 8, variant: 'cabin', rotQ: 0 },
  { poi: 'shore_camp', dx: -9, dz: -10, variant: 'leanto', rotQ: 1 },
  { poi: 'jonah_camp', dx: 9, dz: -7, variant: 'cabin', rotQ: 3 },
  { poi: 'jonah_camp', dx: -11, dz: 6, variant: 'shack', rotQ: 0 },
  { poi: 'jonah_camp', dx: 14, dz: 12, variant: 'ruin', rotQ: 2 },
  { poi: 'forest_cache', dx: -8, dz: 9, variant: 'cabin', rotQ: 1 },
  { poi: 'dune_cache', dx: 7, dz: -8, variant: 'shack', rotQ: 3 },
  { poi: 'relay_station', dx: -12, dz: -9, variant: 'ruin', rotQ: 0 },
];

interface VariantSpec {
  tier: HouseTier;
  w: number;
  d: number;
  wallH: number;
  wallColor: number;
  roof: 'pitched' | 'shed' | 'none';
  interiorWall: boolean; // one dividing wall with a door gap
  openFront: boolean; // lean-to / garage: no front wall
  furniture: { kind: FurnitureKind; lx: number; lz: number; rot: number }[];
  /** v2: a real second story — slab, stairs up the east wall, upper rooms. */
  twoStory?: boolean;
  /** Upstairs furniture. Align lx/lz with ground pieces below where
   *  possible: colliders are height-blind, so an upstairs piece only earns
   *  a collider when it sits (nearly) over an existing ground collider. */
  furnitureUp?: { kind: FurnitureKind; lx: number; lz: number; rot: number }[];
}

const VARIANTS: Record<VariantName, VariantSpec> = {
  ranch: {
    tier: 'suburban', w: 10, d: 8.5, wallH: 3.1, wallColor: 0x9fb4a4, roof: 'pitched',
    interiorWall: true, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -3.9, lz: -3.4, rot: 0 },
      { kind: 'cabinets', lx: -2.0, lz: -3.6, rot: 0 },
      { kind: 'bookshelf', lx: 3.4, lz: -3.4, rot: 0 },
      { kind: 'dresser', lx: 3.4, lz: 2.9, rot: 2 },
      { kind: 'crate', lx: -3.4, lz: 3.2, rot: 1 },
    ],
  },
  bungalow: {
    tier: 'suburban', w: 7.5, d: 7, wallH: 3.05, wallColor: 0xa8b6c2, roof: 'pitched',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -2.7, lz: -2.7, rot: 0 },
      { kind: 'cabinets', lx: -0.8, lz: -2.9, rot: 0 },
      { kind: 'dresser', lx: 2.8, lz: 2.0, rot: 2 },
      { kind: 'toolbox', lx: -2.8, lz: 2.6, rot: 1 },
    ],
  },
  farmhouse: {
    tier: 'suburban', w: 8, d: 10, wallH: 3.15, wallColor: 0x8a4a3c, roof: 'pitched',
    interiorWall: true, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -2.9, lz: -4.2, rot: 0 },
      { kind: 'cabinets', lx: -1.0, lz: -4.4, rot: 0 },
      { kind: 'cabinets', lx: 1.2, lz: -4.4, rot: 0 },
      { kind: 'dresser', lx: 2.9, lz: 3.8, rot: 2 },
      { kind: 'bookshelf', lx: -3.1, lz: 3.8, rot: 1 },
      { kind: 'crate', lx: 0.6, lz: 1.2, rot: 0 },
    ],
  },
  ranch2: {
    tier: 'suburban', w: 10.5, d: 9, wallH: 3.1, wallColor: 0xb8b0a0, roof: 'pitched',
    interiorWall: true, openFront: false, twoStory: true,
    furniture: [
      { kind: 'fridge', lx: -4.0, lz: -3.7, rot: 0 },
      { kind: 'cabinets', lx: -2.0, lz: -3.9, rot: 0 },
      { kind: 'bookshelf', lx: 3.0, lz: -3.7, rot: 0 },
      { kind: 'dresser', lx: 3.5, lz: 3.4, rot: 2 },
      { kind: 'crate', lx: -3.6, lz: 3.6, rot: 1 },
    ],
    furnitureUp: [
      { kind: 'dresser', lx: 3.0, lz: -3.7, rot: 0 },
      { kind: 'bookshelf', lx: 3.5, lz: 3.4, rot: 2 },
      { kind: 'cabinets', lx: -4.0, lz: -3.7, rot: 0 },
      { kind: 'crate', lx: -3.6, lz: 3.6, rot: 3 },
    ],
  },
  richhouse: {
    tier: 'suburban', w: 12, d: 10.5, wallH: 3.2, wallColor: 0xc2b49a, roof: 'pitched',
    interiorWall: true, openFront: false, twoStory: true,
    furniture: [
      { kind: 'fridge', lx: -4.9, lz: -4.4, rot: 0 },
      { kind: 'cabinets', lx: -2.9, lz: -4.6, rot: 0 },
      { kind: 'cabinets', lx: -0.7, lz: -4.6, rot: 0 },
      { kind: 'bookshelf', lx: 4.1, lz: -4.4, rot: 0 },
      { kind: 'dresser', lx: 4.5, lz: 4.0, rot: 2 },
      { kind: 'crate', lx: -4.7, lz: 4.2, rot: 1 },
    ],
    furnitureUp: [
      { kind: 'dresser', lx: 4.1, lz: -4.4, rot: 0 },
      { kind: 'bookshelf', lx: 4.5, lz: 4.0, rot: 2 },
      { kind: 'dresser', lx: -4.9, lz: -4.4, rot: 0 },
      { kind: 'cabinets', lx: -2.9, lz: -4.6, rot: 0 },
    ],
  },
  garage: {
    tier: 'suburban', w: 7.5, d: 7, wallH: 2.9, wallColor: 0x8b9096, roof: 'pitched',
    interiorWall: false, openFront: true,
    furniture: [
      { kind: 'toolbox', lx: -2.7, lz: -2.7, rot: 1 },
      { kind: 'crate', lx: 2.7, lz: -2.7, rot: 0 },
      { kind: 'barrel', lx: 2.9, lz: 1.0, rot: 0 },
    ],
  },
  cabin: {
    tier: 'camp', w: 5.5, d: 6.5, wallH: 2.95, wallColor: 0x6e5a3e, roof: 'shed',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'cooler', lx: -1.9, lz: -2.5, rot: 0 },
      { kind: 'crate', lx: 1.9, lz: -2.5, rot: 3 },
      { kind: 'barrel', lx: 2.1, lz: 2.6, rot: 0 },
    ],
  },
  shack: {
    tier: 'camp', w: 4.5, d: 5.5, wallH: 2.8, wallColor: 0x5a4a38, roof: 'shed',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'crate', lx: -1.2, lz: -2.0, rot: 2 },
      { kind: 'barrel', lx: 1.4, lz: 1.8, rot: 0 },
    ],
  },
  leanto: {
    tier: 'camp', w: 4, d: 3.5, wallH: 2.6, wallColor: 0x6e5a3e, roof: 'shed',
    interiorWall: false, openFront: true,
    furniture: [
      { kind: 'cooler', lx: -1.0, lz: -1.2, rot: 0 },
      { kind: 'crate', lx: 1.2, lz: -1.0, rot: 1 },
    ],
  },
  ruin: {
    tier: 'suburban', w: 8, d: 7, wallH: 3.0, wallColor: 0x8a7f72, roof: 'none',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'toolbox', lx: 1.5, lz: 1.0, rot: 2 },
      { kind: 'crate', lx: -1.5, lz: -1.2, rot: 0 },
    ],
  },
};

export interface HouseResult {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: Collider; group: THREE.Group }[];
}

type GroundY = (x: number, z: number) => number;

interface BuiltHouse {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: Collider; group: THREE.Group }[];
}

/**
 * Quarter-turn local→world transform. Everything stays axis-aligned,
 * so colliders and floors are exact AABBs.
 */
function makeTransform(cx: number, cz: number, rotQ: number) {
  const cos = [1, 0, -1, 0][rotQ];
  const sin = [0, 1, 0, -1][rotQ];
  const pt = (lx: number, lz: number): [number, number] => [
    cx + lx * cos + lz * sin,
    cz - lx * sin + lz * cos,
  ];
  const aabb = (lx0: number, lz0: number, lx1: number, lz1: number): Collider => {
    const [ax, az] = pt(lx0, lz0);
    const [bx, bz] = pt(lx1, lz1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  };
  return { pt, aabb };
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildOne(
  id: string,
  p: HousePlacement,
  spec: VariantSpec,
  cx: number,
  cz: number,
  groundY: GroundY,
  rng: () => number,
): BuiltHouse {
  const { aabb, pt } = makeTransform(cx, cz, p.rotQ);
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const floors: FloorRect[] = [];
  const containers: ContainerDef[] = [];
  const roofs: { bounds: Collider; group: THREE.Group }[] = [];
  const t = 0.25; // wall thickness
  const wh = spec.wallH;
  const ruin = p.variant === 'ruin';
  const wallTop = wh - 0.3; // walls sink 0.3 into the ground, roof meets them

  // base: sink into the lowest corner so no wall floats on slopes
  const corners: [number, number][] = [
    [cx - spec.w / 2, cz - spec.d / 2], [cx + spec.w / 2, cz - spec.d / 2],
    [cx - spec.w / 2, cz + spec.d / 2], [cx + spec.w / 2, cz + spec.d / 2],
  ];
  const base = Math.min(...corners.map(([x, z]) => groundY(x, z))) - 0.08;

  const wallMat = spec.wallColor;
  // slight per-house tint so variants don't read as clones
  const tintShift = (rng() - 0.5) * 0.06;
  const wallCol = new THREE.Color(wallMat).offsetHSL(0, 0, tintShift).getHex();

  interface Seg { ax: number; az: number; bx: number; bz: number; hMul: number }
  const segs: Seg[] = [];
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  const doorW = 1.0; // 36" rough opening
  const DOOR_H = 2.05; // 80" door
  const doorAt = (rng() - 0.5) * spec.w * 0.4; // local x of the front door

  // perimeter: south (front, +z) with door gap unless lean-to is open-front
  const gapLo = doorAt - doorW / 2;
  const gapHi = doorAt + doorW / 2;
  if (spec.openFront) {
    // lean-to: side + back walls only
  } else {
    // south wall in two runs around the door
    segs.push({ ax: -hw, az: hd, bx: gapLo, bz: hd, hMul: 1 });
    segs.push({ ax: gapHi, az: hd, bx: hw, bz: hd, hMul: 1 });
    // north + sides
    segs.push({ ax: -hw, az: -hd, bx: hw, bz: -hd, hMul: 1 });
    segs.push({ ax: -hw, az: -hd, bx: -hw, bz: hd, hMul: 1 });
    segs.push({ ax: hw, az: -hd, bx: hw, bz: hd, hMul: 1 });
  }
  if (spec.openFront) {
    segs.push({ ax: -hw, az: -hd, bx: hw, bz: -hd, hMul: 1 });
    segs.push({ ax: -hw, az: -hd, bx: -hw, bz: hd, hMul: 1 });
    segs.push({ ax: hw, az: -hd, bx: hw, bz: hd, hMul: 1 });
  }
  // interior divider with its own door
  if (spec.interiorWall) {
    const ix = (rng() - 0.5) * spec.w * 0.3;
    const gz = (rng() - 0.5) * spec.d * 0.4;
    segs.push({ ax: ix, az: -hd + t, bx: ix, bz: gz - 0.55, hMul: 1 });
    segs.push({ ax: ix, az: gz + 0.55, bx: ix, bz: hd - t, hMul: 1 });
    // header above the interior doorway (32" passage, 2.05m opening)
    const iHead = box(1.1, wallTop - 2.05, t, wallCol);
    iHead.position.set(ix, 2.05 + (wallTop - 2.05) / 2, gz);
    group.add(iHead);
  }
  if (ruin) {
    for (const s of segs) s.hMul = 0.45 + rng() * 0.3;
  }

  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    if (len < 0.2) continue;
    const h = wh * s.hMul;
    const alongX = Math.abs(s.bz - s.az) < 1e-6;
    const m = box(alongX ? len : t, h, alongX ? t : len, wallCol);
    m.position.set((s.ax + s.bx) / 2, h / 2 - 0.3, (s.az + s.bz) / 2); // sink 0.3 into ground
    group.add(m);
    // collider (full segment, perpendicular thickness t)
    colliders.push(
      alongX
        ? aabb(s.ax, s.az - t / 2, s.bx, s.bz + t / 2)
        : aabb(s.ax - t / 2, s.az, s.bx + t / 2, s.bz),
    );
  }
  // entry door: jambs, header, threshold, wall above, and a leaf swung open
  // inward — real 36"×80" proportions (door opening never blocks; leaf never collides)
  if (!spec.openFront && !ruin) {
    const TRIMC = 0x4a3826;
    const DOOR_COLORS = [0x3a5a6e, 0x6e3a3a, 0x6b5335, 0x3f5a3a];
    for (const jx of [gapLo, gapHi]) {
      const jamb = box(0.1, DOOR_H, t + 0.08, TRIMC);
      jamb.position.set(jx, DOOR_H / 2, hd);
      group.add(jamb);
    }
    const header = box(doorW + 0.2, 0.14, t + 0.08, TRIMC);
    header.position.set(doorAt, DOOR_H + 0.07, hd);
    group.add(header);
    const aboveH = wallTop - DOOR_H - 0.14;
    if (aboveH > 0.05) {
      const above = box(doorW, aboveH, t, wallCol);
      above.position.set(doorAt, DOOR_H + 0.14 + aboveH / 2, hd);
      group.add(above);
    }
    const thresh = box(doorW + 0.16, 0.07, t + 0.34, 0x5a5348);
    thresh.position.set(doorAt, 0.035, hd);
    group.add(thresh);
    // the leaf, swung open against the inside wall (flat = along +X; a touch
    // ajar so it reads as a real door, not a wall panel)
    const hinge = new THREE.Group();
    hinge.position.set(gapLo + 0.05, 0.07, hd - t / 2 - 0.03);
    hinge.rotation.y = 0.22;
    const slabW = doorW - 0.06;
    const slabH = DOOR_H - 0.04;
    const leaf = box(slabW, slabH, 0.05, DOOR_COLORS[Math.floor(rng() * DOOR_COLORS.length)]);
    leaf.position.set(slabW / 2, slabH / 2, 0);
    const knob = box(0.07, 0.07, 0.12, 0x2e2e2e);
    knob.position.set(slabW - 0.12, slabH / 2 - 0.05, 0);
    hinge.add(leaf, knob);
    group.add(hinge);
  }

  // windows: framed units with glass, mullion cross, and a sill —
  // sill sits 0.95m above the floor, per residential convention
  const addWindow = (wx: number, wz: number, ry: number, yOff = 0) => {
    const g = new THREE.Group();
    const TRIMC = 0x4a3826;
    const W = 1.06;
    const H = 1.26;
    const cy = 1.64;
    const ft = 0.09;
    const top = box(W, ft, 0.1, TRIMC); top.position.set(0, H / 2 - ft / 2, 0);
    const bot = box(W, ft, 0.1, TRIMC); bot.position.set(0, -H / 2 + ft / 2, 0);
    const lf = box(ft, H - 2 * ft, 0.1, TRIMC); lf.position.set(-W / 2 + ft / 2, 0, 0);
    const rt = box(ft, H - 2 * ft, 0.1, TRIMC); rt.position.set(W / 2 - ft / 2, 0, 0);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(W - 2 * ft, H - 2 * ft, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.35, metalness: 0.4 }),
    );
    glass.castShadow = true;
    const mv = box(0.05, H - 2 * ft, 0.06, TRIMC);
    const mh = box(W - 2 * ft, 0.05, 0.06, TRIMC);
    const sill = box(W + 0.14, 0.07, 0.2, TRIMC);
    sill.position.set(0, -H / 2 - 0.035, 0.04);
    g.add(top, bot, lf, rt, glass, mv, mh, sill);
    g.position.set(wx, cy + yOff, wz);
    g.rotation.y = ry;
    group.add(g);
  };
  if (!ruin && p.variant !== 'leanto') {
    const nWin = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nWin; i++) {
      addWindow(-hw + ((i + 1) * spec.w) / (nWin + 1), -hd - t / 2 - 0.03, 0);
    }
    addWindow(hw + t / 2 + 0.03, (rng() - 0.5) * spec.d * 0.5, Math.PI / 2);
    addWindow(-hw - t / 2 - 0.03, (rng() - 0.5) * spec.d * 0.5, Math.PI / 2);
    // front wall: flank the entry when the wall runs are long enough
    const leftRun = doorAt - doorW / 2 + hw;
    if (leftRun > 2.6) addWindow(-hw + leftRun / 2, hd + t / 2 + 0.03, 0);
    const rightRun = hw - doorAt - doorW / 2;
    if (rightRun > 2.6) addWindow(hw - rightRun / 2, hd + t / 2 + 0.03, 0);
  }

  // floor slab (local coords — the group sits at base height)
  const floorTop = base + 0.14;
  const slab = box(spec.w - t, 0.14, spec.d - t, 0x6b5136);
  slab.position.set(0, 0.07, 0);
  group.add(slab);
  floors.push({ ...aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2), y: floorTop });

  // foundation (v3): a real stem wall, deep enough to meet sloped ground
  // on the downhill side — no floating corners, no sand-colored skirting
  const found = box(spec.w + 0.3, 1.7, spec.d + 0.3, 0x6f6a63);
  found.position.set(0, -0.68, 0);
  group.add(found);
  // corner boards: trim that visually connects the wall runs
  if (!ruin) {
    for (const [ccx, ccz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as [number, number][]) {
      const cb = box(0.14, wallTop, 0.14, 0x4a3826);
      cb.position.set(ccx, wallTop / 2 - 0.3, ccz);
      group.add(cb);
    }
  }

  // roof — CLOSED construction: pitched roofs get their triangular gable
  // ends on the X faces (the ridge runs along X; v1 misplaced them on the
  // eave sides, leaving both ends of every roof open), shed roofs get a
  // raised back filler + sloped end caps.
  const roofBase = spec.twoStory && !ruin ? wh + 2.67 : wallTop;
  if (spec.roof !== 'none') {
    const roofGroup = new THREE.Group();
    const roofCol = new THREE.Color(0x4a3a30).offsetHSL(0, 0, (rng() - 0.5) * 0.05).getHex();
    const capMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 1, side: THREE.DoubleSide });
    // flat end cap in the ZY plane at x = ±hw, from shape points (z, y).
    // flipZ for asymmetric shapes (shed): rotateY(+90°) maps shape X to
    // world -Z, which would mirror the slope; -90° keeps z as z.
    const endCap = (pts: [number, number][], x: number, flipZ = false) => {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(flipZ ? -Math.PI / 2 : Math.PI / 2);
      const m = new THREE.Mesh(geo, capMat);
      m.position.set(x, 0, 0);
      m.castShadow = true;
      roofGroup.add(m);
    };
    if (spec.roof === 'pitched') {
      const rise = Math.min(spec.w, spec.d) * 0.3;
      const slopeLen = Math.hypot(hd + 0.39, rise + 0.08);
      const a = Math.atan2(rise + 0.08, hd + 0.39);
      for (const sgn of [1, -1]) {
        const panel = box(spec.w + 0.7, 0.14, slopeLen, roofCol);
        panel.rotation.x = sgn * a;
        panel.position.set(0, roofBase + (rise - 0.04) / 2, (sgn * (hd + 0.33)) / 2);
        roofGroup.add(panel);
      }
      // fascia along the eaves + ridge cap: the roof reads as connected,
      // not two slabs floating over the walls
      for (const sgn of [1, -1]) {
        const fascia = box(spec.w + 0.9, 0.2, 0.07, 0x4a3826);
        fascia.position.set(0, roofBase - 0.03, sgn * (hd + 0.3));
        roofGroup.add(fascia);
      }
      const ridge = box(spec.w + 0.8, 0.1, 0.36, roofCol);
      ridge.position.set(0, roofBase + rise, 0);
      roofGroup.add(ridge);
      // gable caps on the X ends — the triangle spans the depth (z) and
      // rises to the ridge; this is what actually closes the roof
      for (const sgn of [1, -1]) {
        endCap(
          [[-hd, roofBase - 0.05], [hd, roofBase - 0.05], [0, roofBase + rise]],
          sgn * (hw - 0.02),
        );
      }
    } else {
      // shed roof: single slope, high at the back
      const rise = 0.8;
      const slope = Math.hypot(spec.d, rise);
      const a = Math.atan2(rise, spec.d);
      const panel = box(spec.w + 0.5, 0.12, slope + 0.4, roofCol);
      panel.rotation.x = a;
      panel.position.set(0, roofBase + rise / 2 - 0.1, 0);
      roofGroup.add(panel);
      const fascia = box(spec.w + 0.7, 0.2, 0.07, 0x4a3826);
      fascia.position.set(0, roofBase - 0.12, hd + 0.22);
      roofGroup.add(fascia);
      // raised back filler: the panel's high edge floats `rise` above the
      // back wall — fill that band so the back of the roof is closed too
      const filler = box(spec.w - 0.05, rise + 0.15, 0.1, wallCol);
      filler.position.set(0, roofBase + (rise - 0.15) / 2 - 0.05, -hd + 0.05);
      roofGroup.add(filler);
      // trapezoid end caps following the slope
      for (const sgn of [1, -1]) {
        endCap(
          [[-hd, roofBase - 0.3], [hd, roofBase - 0.3], [hd, roofBase - 0.08], [-hd, roofBase + rise - 0.12]],
          sgn * (hw - 0.02),
          true,
        );
      }
    }
    group.add(roofGroup);
    roofs.push({ bounds: aabb(-hw, -hd, hw, hd), group: roofGroup });
  }

  // furniture → containers (InteractSystem builds the meshes + loot flow)
  spec.furniture.forEach((f, i) => {
    const [wx, wz] = pt(f.lx, f.lz);
    const [hx, hz] = FURNITURE_HALF[f.kind];
    const rotated = p.rotQ % 2 === 1;
    const hxw = rotated ? hz : hx;
    const hzw = rotated ? hx : hz;
    colliders.push({ x0: wx - hxw, z0: wz - hzw, x1: wx + hxw, z1: wz + hzw });
    containers.push({
      id: `f_${id}_${f.kind}_${i}`,
      x: wx,
      z: wz,
      // two-story houses pin every container's height: floor inference
      // would otherwise float ground furniture up to the second floor
      ...(spec.twoStory ? { y: floorTop } : {}),
      loot: FURNITURE_LOOT[f.kind][spec.tier] as ContainerDef['loot'],
      label: FURNITURE_LABEL[f.kind],
      meshKind: f.kind,
      rotY: f.rot * Math.PI * 0.5 + p.rotQ * Math.PI * 0.5,
    });
  });

  // safes: locked loot, 20% on suburban houses (HOUSES_DESIGN) — bedroom
  // corner. Two-story houses roll theirs upstairs in the block below.
  if (!spec.twoStory && spec.tier === 'suburban' && rng() < 0.2) {
    const [wx, wz] = pt(-hw + 0.9, -hd + 0.9);
    const [hx, hz] = FURNITURE_HALF.safe;
    const rotated = p.rotQ % 2 === 1;
    colliders.push({ x0: wx - (rotated ? hz : hx), z0: wz - (rotated ? hx : hz), x1: wx + (rotated ? hz : hx), z1: wz + (rotated ? hx : hz) });
    containers.push({
      id: `f_${id}_safe`,
      x: wx,
      z: wz,
      loot: SAFE_LOOT,
      label: FURNITURE_LABEL.safe,
      meshKind: 'safe',
      rotY: p.rotQ * Math.PI * 0.5 + Math.PI / 4,
      locked: true,
      searchTime: 4,
    });
  }

  // ---------- second story (v2) ----------
  if (spec.twoStory && !ruin && !spec.openFront) {
    const floorTop2 = base + wh + 0.12; // world height of the upstairs floor
    // slab (visual) — its top is the walking surface
    const slab2 = box(spec.w - t, 0.16, spec.d - t, 0x6b5136);
    slab2.position.set(0, wh + 0.04, 0);
    group.add(slab2);
    // floor rects: full floor minus the stairwell (east strip, north run)
    const stairW = 1.35;
    floors.push({ ...aabb(-hw + t / 2, -hd + t / 2, hw - stairW, hd - t / 2), y: floorTop2 });
    floors.push({ ...aabb(hw - stairW, -hd + 3.1, hw - t / 2, hd - t / 2), y: floorTop2 });
    // stairs: a solid stepped wedge up the east wall, north → south.
    // 10 steps of ~0.27 rise; each tread is also a floor rect, and the
    // height-aware floor lookup climbs them one at a time.
    const steps = 10;
    const riseEach = (wh + 0.12 - 0.14) / steps;
    const z0 = -hd + 0.55;
    const runEach = 2.75 / steps;
    for (let i = 0; i < steps; i++) {
      const topY = 0.14 + (i + 1) * riseEach;
      const step = box(1.15, topY, runEach + 0.06, 0x6e5f4c);
      step.position.set(hw - 0.72, topY / 2, z0 + i * runEach);
      group.add(step);
      floors.push({
        ...aabb(hw - 1.32, z0 + i * runEach - runEach / 2 - 0.03, hw - 0.12, z0 + i * runEach + runEach / 2 + 0.03),
        y: base + topY,
      });
    }
    // upper perimeter walls — same footprint as the ground walls (their
    // colliders already exist), no interior partitions upstairs (open loft)
    const uh = 2.75;
    const uN = box(spec.w, uh, t, wallCol); uN.position.set(0, wh + uh / 2 - 0.05, -hd);
    const uS = box(spec.w, uh, t, wallCol); uS.position.set(0, wh + uh / 2 - 0.05, hd);
    const uW = box(t, uh, spec.d, wallCol); uW.position.set(-hw, wh + uh / 2 - 0.05, 0);
    const uE = box(t, uh, spec.d, wallCol); uE.position.set(hw, wh + uh / 2 - 0.05, 0);
    group.add(uN, uS, uW, uE);
    addWindow(0, -hd - t / 2 - 0.03, 0, wh + 0.05);
    addWindow(hw + t / 2 + 0.03, 0.6, Math.PI / 2, wh + 0.05);
    addWindow(-hw - t / 2 - 0.03, -0.6, Math.PI / 2, wh + 0.05);
    // upstairs furniture: pinned to floor 2; a collider only where it sits
    // over an existing ground collider (height-blind colliders must not
    // invent new blocked spots on the floor below)
    const overlapsExisting = (c: Collider): boolean =>
      colliders.some((o) => c.x0 < o.x1 && c.x1 > o.x0 && c.z0 < o.z1 && c.z1 > o.z0);
    (spec.furnitureUp ?? []).forEach((f, i) => {
      const [wx, wz] = pt(f.lx, f.lz);
      const [hx, hz] = FURNITURE_HALF[f.kind];
      const rotated = p.rotQ % 2 === 1;
      const hxw = rotated ? hz : hx;
      const hzw = rotated ? hx : hz;
      const col: Collider = { x0: wx - hxw, z0: wz - hzw, x1: wx + hxw, z1: wz + hzw };
      if (overlapsExisting(col)) colliders.push(col);
      containers.push({
        id: `f_${id}_up_${f.kind}_${i}`,
        x: wx,
        z: wz,
        y: floorTop2,
        loot: FURNITURE_LOOT[f.kind][spec.tier] as ContainerDef['loot'],
        label: FURNITURE_LABEL[f.kind],
        meshKind: f.kind,
        rotY: f.rot * Math.PI * 0.5 + p.rotQ * Math.PI * 0.5,
      });
    });
    // the safe lives upstairs in a two-story house (rich: 45%, else 20%)
    const safeChance = p.variant === 'richhouse' ? 0.45 : 0.2;
    if (rng() < safeChance) {
      const [wx, wz] = pt(-hw + 0.9, -hd + 0.9);
      const [hx, hz] = FURNITURE_HALF.safe;
      const rotated = p.rotQ % 2 === 1;
      const col: Collider = {
        x0: wx - (rotated ? hz : hx), z0: wz - (rotated ? hx : hz),
        x1: wx + (rotated ? hz : hx), z1: wz + (rotated ? hx : hz),
      };
      if (overlapsExisting(col)) colliders.push(col);
      containers.push({
        id: `f_${id}_safe`,
        x: wx,
        z: wz,
        y: floorTop2,
        loot: SAFE_LOOT,
        label: FURNITURE_LABEL.safe,
        meshKind: 'safe',
        rotY: p.rotQ * Math.PI * 0.5 + Math.PI / 4,
        locked: true,
        searchTime: 4,
      });
    }
  }

  group.position.set(cx, base, cz);
  group.rotation.y = (p.rotQ * Math.PI) / 2;
  return { group, colliders, floors, containers, roofs };
}

/** Building footprints (axis-aligned; quarter-turn rotations swap w/d).
 *  World uses these to flatten a terrain pad under every house — no terrain
 *  poking through floors, no floating corners. */
export interface HouseFootprint {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
}

export function houseFootprints(pois: Record<string, [number, number]>): HouseFootprint[] {
  const out: HouseFootprint[] = [];
  for (const p of PLACEMENTS) {
    const poi = pois[p.poi];
    if (!poi) continue;
    const spec = VARIANTS[p.variant];
    const swap = p.rotQ % 2 === 1;
    out.push({
      cx: poi[0] + p.dx,
      cz: poi[1] + p.dz,
      hw: (swap ? spec.d : spec.w) / 2,
      hd: (swap ? spec.w : spec.d) / 2,
    });
  }
  return out;
}

export function buildHouses(
  scene: THREE.Scene,
  seed: number,
  pois: Record<string, [number, number]>,
  groundY: GroundY,
): HouseResult {
  const rng = mulberry32(seed ^ 0x40e587);
  const out: HouseResult = { group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [] };
  let n = 0;
  for (const p of PLACEMENTS) {
    const poi = pois[p.poi];
    if (!poi) continue;
    const cx = poi[0] + p.dx;
    const cz = poi[1] + p.dz;
    const spec = VARIANTS[p.variant];
    const h = buildOne(`h${n++}`, p, spec, cx, cz, groundY, rng);
    out.group.add(h.group);
    out.colliders.push(...h.colliders);
    out.floors.push(...h.floors);
    out.containers.push(...h.containers);
    out.roofs.push(...h.roofs);
  }
  scene.add(out.group);
  return out;
}
