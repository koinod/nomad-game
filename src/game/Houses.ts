// Houses.ts — procedural enterable houses for POIs.
// v1: camp + suburban, single-story. Wall colliders, floor rects, furniture
// loot, 3-4 visual variants per tier. Deterministic from seed ^ house id.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import type { Collider, FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import { FURNITURE_LOOT } from '../data/items';
import { FURNITURE_LABEL, FURNITURE_HALF, type FurnitureKind } from './furnitureMeshes';

export type HouseTier = 'camp' | 'suburban';
export type VariantName =
  | 'ranch' | 'bungalow' | 'farmhouse'   // suburban
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
  { poi: 'town', dx: 16, dz: 12, variant: 'bungalow', rotQ: 3 },
  { poi: 'town', dx: 2, dz: 24, variant: 'farmhouse', rotQ: 0 },
  { poi: 'town', dx: -26, dz: 14, variant: 'cabin', rotQ: 2 },
  { poi: 'town', dx: 26, dz: -22, variant: 'shack', rotQ: 1 },
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
  openFront: boolean; // lean-to: no front wall
  furniture: { kind: FurnitureKind; lx: number; lz: number; rot: number }[];
}

const VARIANTS: Record<VariantName, VariantSpec> = {
  ranch: {
    tier: 'suburban', w: 9, d: 7.5, wallH: 2.7, wallColor: 0x9a8f7e, roof: 'pitched',
    interiorWall: true, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -3.3, lz: -2.9, rot: 0 },
      { kind: 'cabinets', lx: -1.6, lz: -3.1, rot: 0 },
      { kind: 'bookshelf', lx: 2.9, lz: -2.9, rot: 0 },
      { kind: 'dresser', lx: 2.9, lz: 2.4, rot: 2 },
      { kind: 'crate', lx: -2.8, lz: 2.6, rot: 1 },
    ],
  },
  bungalow: {
    tier: 'suburban', w: 6.5, d: 6, wallH: 2.6, wallColor: 0x8a7f6a, roof: 'pitched',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -2.2, lz: -2.3, rot: 0 },
      { kind: 'cabinets', lx: -0.6, lz: -2.5, rot: 0 },
      { kind: 'dresser', lx: 2.3, lz: 1.6, rot: 2 },
      { kind: 'toolbox', lx: -2.3, lz: 2.2, rot: 1 },
    ],
  },
  farmhouse: {
    tier: 'suburban', w: 7, d: 9, wallH: 2.7, wallColor: 0x7a4a3a, roof: 'pitched',
    interiorWall: true, openFront: false,
    furniture: [
      { kind: 'fridge', lx: -2.4, lz: -3.7, rot: 0 },
      { kind: 'cabinets', lx: -0.8, lz: -3.9, rot: 0 },
      { kind: 'cabinets', lx: 1.0, lz: -3.9, rot: 0 },
      { kind: 'dresser', lx: 2.4, lz: 3.2, rot: 2 },
      { kind: 'bookshelf', lx: -2.6, lz: 3.2, rot: 1 },
      { kind: 'crate', lx: 0.5, lz: 1.0, rot: 0 },
    ],
  },
  cabin: {
    tier: 'camp', w: 5, d: 6, wallH: 2.4, wallColor: 0x6e5a3e, roof: 'shed',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'cooler', lx: -1.6, lz: -2.2, rot: 0 },
      { kind: 'crate', lx: 1.6, lz: -2.2, rot: 3 },
      { kind: 'barrel', lx: 1.8, lz: 2.3, rot: 0 },
    ],
  },
  shack: {
    tier: 'camp', w: 4, d: 5, wallH: 2.2, wallColor: 0x5a4a38, roof: 'shed',
    interiorWall: false, openFront: false,
    furniture: [
      { kind: 'crate', lx: -1.0, lz: -1.7, rot: 2 },
      { kind: 'barrel', lx: 1.2, lz: 1.5, rot: 0 },
    ],
  },
  leanto: {
    tier: 'camp', w: 4, d: 3.5, wallH: 2.0, wallColor: 0x6e5a3e, roof: 'shed',
    interiorWall: false, openFront: true,
    furniture: [
      { kind: 'cooler', lx: -1.0, lz: -1.2, rot: 0 },
      { kind: 'crate', lx: 1.2, lz: -1.0, rot: 1 },
    ],
  },
  ruin: {
    tier: 'suburban', w: 8, d: 7, wallH: 2.7, wallColor: 0x8a7f72, roof: 'none',
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
  const doorW = 1.1;
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
  }
  if (ruin) {
    for (const s of segs) s.hMul = 0.45 + rng() * 0.3;
  }

  const LINTEL_Y = 2.05;
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
  // lintel over the front door (visual only — above head height)
  if (!spec.openFront && !ruin) {
    const lintel = box(doorW, wallTop - LINTEL_Y, t, wallCol);
    lintel.position.set(doorAt, (LINTEL_Y + wallTop) / 2, hd);
    group.add(lintel);
    // door frame posts
    for (const px of [gapLo, gapHi]) {
      const post = box(0.08, LINTEL_Y, t + 0.04, 0x4a3826);
      post.position.set(px, LINTEL_Y / 2, hd);
      group.add(post);
    }
  }

  // windows: dark recesses on north/east/west walls (visual only)
  if (!ruin) {
    const winMat = 0x1c2126;
    const nWin = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nWin; i++) {
      const win = box(0.9, 0.9, 0.06, winMat);
      win.position.set(-hw + ((i + 1) * spec.w) / (nWin + 1), 1.45, -hd - t / 2 - 0.025);
      group.add(win);
    }
    for (const sgn of [1, -1]) {
      const win = box(0.9, 0.9, 0.06, winMat);
      win.rotation.y = Math.PI / 2;
      win.position.set(sgn * (hw + t / 2 + 0.025), 1.45, (rng() - 0.5) * spec.d * 0.5);
      group.add(win);
    }
  }

  // floor slab
  const floorTop = base + 0.14;
  const slab = box(spec.w - t, 0.14, spec.d - t, 0x5a5348);
  slab.position.set(0, base + 0.07, 0);
  group.add(slab);
  floors.push({ ...aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2), y: floorTop });

  // roof
  if (spec.roof !== 'none') {
    const roofGroup = new THREE.Group();
    const roofCol = new THREE.Color(0x4a3a30).offsetHSL(0, 0, (rng() - 0.5) * 0.05).getHex();
    if (spec.roof === 'pitched') {
      const rise = Math.min(spec.w, spec.d) * 0.3;
      const slope = Math.hypot(hd, rise);
      const a = Math.atan2(rise, hd);
      for (const sgn of [1, -1]) {
        const panel = box(spec.w + 0.7, 0.14, slope + 0.5, roofCol);
        panel.rotation.x = sgn * a;
        panel.position.set(0, wallTop + rise / 2, (sgn * hd) / 2);
        roofGroup.add(panel);
      }
      // gable caps
      for (const sgn of [1, -1]) {
        const shape = new THREE.Shape();
        shape.moveTo(-hw, wallTop);
        shape.lineTo(hw, wallTop);
        shape.lineTo(0, wallTop + rise);
        shape.closePath();
        const cap = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color: wallCol, roughness: 1 }),
        );
        cap.position.set(0, 0, sgn * hd);
        if (sgn < 0) cap.rotation.y = Math.PI;
        cap.castShadow = true;
        roofGroup.add(cap);
      }
    } else {
      // shed roof: single slope, high at the back
      const rise = 0.8;
      const slope = Math.hypot(spec.d, rise);
      const a = Math.atan2(rise, spec.d);
      const panel = box(spec.w + 0.5, 0.12, slope + 0.4, roofCol);
      panel.rotation.x = a;
      panel.position.set(0, wallTop + rise / 2 - 0.1, 0);
      roofGroup.add(panel);
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
      loot: FURNITURE_LOOT[f.kind][spec.tier] as ContainerDef['loot'],
      label: FURNITURE_LABEL[f.kind],
      meshKind: f.kind,
      rotY: f.rot * Math.PI * 0.5 + p.rotQ * Math.PI * 0.5,
    });
  });

  group.position.set(cx, base, cz);
  group.rotation.y = (p.rotQ * Math.PI) / 2;
  return { group, colliders, floors, containers, roofs };
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
