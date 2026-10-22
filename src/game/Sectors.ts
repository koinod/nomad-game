// Sectors.ts — the SIX SECTOR STRONGHOLDS (Spec §3.2 build-out).
//
// Every stronghold is composed on the BUILDING_STRATEGY kit (kit.ts) —
// the same system as the lighthouse and the revamped airbase: true
// cut openings, recorded pieces, colliders/floors/containers the
// kitQa gate audits before anything ships. Siting is DATA
// (sectorSites.ts over betaLayout's surveyed pads); this file is the
// architecture.
//
// Enclosed structures are Kit buildings. Open works — the Citadel's
// stacked-container fortress, the Refuge palisade, the refinery, the
// harbor slips — are ground works in the airbase's idiom (one group +
// prop colliders), and each reports a tagged SectorFeature AABB so
// the gate can pin that the named structure EXISTS, where it stands,
// and what it may never touch (roads, stations, the water line).
//
// Interiors obey the lighting law: every enclosed room sits within
// the daylight audit's throw of a real opening (windows are cut, never
// painted), and roofs are slabs that never disappear.

import * as THREE from 'three';
import { FURNITURE_LOOT } from '../data/items';
import { BETA_EXTRA_PADS } from '../data/betaLayout';
import { Kit, type KitResult } from './kit';
import type { Collider } from './Colliders';
import { decalPlane } from './modelKit';
import { SECTOR_BUILDINGS, resolveSpotWorld, type SectorBuildingSpot } from './sectorSites';

type GroundY = (x: number, z: number) => number;

/** A named ground-works structure, world AABB — the gate's handle on
 *  everything that is not a Kit building. */
export interface SectorFeature {
  id: string;
  sector: string;
  kind: string;
  x: number; z: number;
  hx: number; hz: number;
  note: string;
}

export interface SectorsBuild {
  kits: KitResult[];
  groundGroup: THREE.Group;
  propColliders: Collider[];
  features: SectorFeature[];
}

// ---------------------------------------------------------------- palette

const CONCRETE = 0x8a8d90;
const CONCRETE_DARK = 0x6f7276;
const STEEL = 0x5d6a72;
const STEEL_DARK = 0x424c52;
const ROOF = 0x3c444a;
const TRIM = 0x2e3438;
const STONE = 0x8b8578;
const TIMBER = 0x6e5a41;
const TIMBER_DARK = 0x4a3826;
const GLASSY = 0x9fc4d8;

// ------------------------------------------------------------- kit helpers

/** A cylinder as kit detail (vents, tanks, drums inside rooms) —
 *  visual only; pair with k.obstacle where it stands on the floor. */
function kitCyl(k: Kit, r: number, h: number, color: number, x: number, y: number, z: number, opts: { seg?: number; rz?: number; rx?: number } = {}): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, opts.seg ?? 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.rx) m.rotation.x = opts.rx;
  m.castShadow = true;
  k.detail(m);
  return m;
}

/** A tire as kit detail (stacks in the workshops) — visual only. */
function kitTire(k: Kit, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.13, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95 }),
  );
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  k.detail(m);
}

/** An emissive lamp face (detail mesh) — the fixture convention:
 *  emissive only, never a real light source; the sun does the work. */
function kitLampFace(k: Kit, w: number, h: number, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.2, roughness: 0.6 }),
  );
  m.position.set(x, y, z);
  k.detail(m);
}

function baseAt(cx: number, cz: number, groundY: GroundY): number {
  // the pads are formula-flat; take the min corner so foundations seat
  return Math.min(
    groundY(cx - 2, cz - 2), groundY(cx + 2, cz - 2),
    groundY(cx - 2, cz + 2), groundY(cx + 2, cz + 2),
  ) - 0.06;
}

/**
 * A 40 ft container fitted out as a room — the stronghold vernacular
 * of the Citadel and the Collective. A real kit building: cut door +
 * windows in continuous walls, corrugation ribs and corner castings
 * as modeled detail over the recorded wall pieces, a roof slab that
 * never disappears.
 */
function buildContainerRoom(
  id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY,
  shell: number, opts: { npc?: boolean; label: string; lootKind: 'camp' | 'suburban'; dress: 'office' | 'store' | 'lab' },
): KitResult {
  const k = new Kit(id, cx, cz, rot, baseAt(cx, cz, groundY), 12.2, 2.9, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, 0x5a5148);
  k.perimeter({
    story: 0, color: shell, trim: STEEL_DARK,
    door: { face: 'S', at: -3.6, leafColor: STEEL_DARK },
    windows: [
      { face: 'S', at: 1.6, w: 1.1 }, { face: 'S', at: 4.2, w: 1.1 },
      { face: 'N', at: -1.2, w: 1.1 }, { face: 'N', at: 2.6, w: 1.1 },
    ],
  });
  // corrugation: ribs down both long faces + corner castings — detail
  // over the recorded walls, the container read at touch distance
  for (let i = 0; i < 19; i++) {
    const x = -5.7 + i * 0.63;
    k.box(0.17, 2.55, 0.06, shell, x, 1.5, 1.48, 0.7);
    k.box(0.17, 2.55, 0.06, shell, x, 1.5, -1.48, 0.7);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box(0.24, 2.9, 0.24, STEEL_DARK, sx * 5.95, 1.5, sz * 1.33);
  }
  // the roof slab (detail — the kit records it as a canopy-class cap
  // via the parapet-less flat slab boxes) + roof rim
  k.box(12.5, 0.12, 3.2, shell, 0, 3.06, 0, 0.7);
  k.box(12.5, 0.14, 0.1, STEEL_DARK, 0, 2.98, 1.58);
  k.box(12.5, 0.14, 0.1, STEEL_DARK, 0, 2.98, -1.58);
  // interior fit-out: bench run along the north wall + stores
  k.box(4.6, 0.08, 0.6, TIMBER, 1.4, 0.95, -1.05);
  k.box(4.6, 0.85, 0.5, STEEL_DARK, 1.4, 0.45, -1.08);
  k.obstacle(1.4, -1.05, 2.35, 0.35);
  k.furnish({ kind: 'cabinets', lx: -5.2, lz: -1.05, id: `${id}_cabinets`, loot: FURNITURE_LOOT.cabinets[opts.lootKind], label: `Search ${opts.label} cabinets` });
  k.furnish({ kind: 'crate', lx: 5.4, lz: 0.9, id: `${id}_crate`, loot: FURNITURE_LOOT.crate[opts.lootKind], label: `Search ${opts.label} crate` });
  // ── greeble: the low shelf run under the south windows (kept under
  // the sill line so the rooms' daylight throw survives), dressed per
  // role below
  k.box(3.2, 0.06, 0.5, TIMBER, 2.9, 0.5, 0.88);
  k.box(3.2, 0.06, 0.5, TIMBER, 2.9, 0.88, 0.88);
  k.box(0.06, 0.9, 0.5, TIMBER_DARK, 1.35, 0.45, 0.88);
  k.box(0.06, 0.9, 0.5, TIMBER_DARK, 4.45, 0.45, 0.88);
  k.obstacle(2.9, 0.88, 1.65, 0.28);
  if (opts.dress === 'office') {
    // the watch-keeper's bunk at the east end (clear of the door
    // leaf's rest strip on the south wall): two-tier frame,
    // army-blanket mattresses, a lantern over the door
    for (const px of [4.95, 5.75]) {
      for (const pz of [-1.6, 0.2]) k.box(0.08, 1.6, 0.08, TIMBER_DARK, px, 0.94, pz);
    }
    k.box(0.95, 0.09, 1.95, 0x707a5e, 5.35, 0.5, -0.7);
    k.box(0.95, 0.09, 1.95, 0x707a5e, 5.35, 1.38, -0.7);
    k.box(0.5, 0.07, 0.4, 0xd8d4c8, 5.35, 0.58, -1.35);
    k.obstacle(5.35, -0.7, 0.55, 1.05);
    k.box(0.34, 0.14, 0.2, STEEL_DARK, -3.6, 2.62, 1.32);
    kitLampFace(k, 0.24, 0.08, -3.6, 2.6, 1.44);
    // ledgers + a kettle on the shelf
    k.box(0.3, 0.22, 0.24, 0x8a3b3b, 2.5, 1.02, 0.88);
    k.box(0.26, 0.18, 0.2, 0x3b5a8a, 2.85, 1.0, 0.88);
    kitCyl(k, 0.09, 0.16, STEEL_DARK, 3.6, 0.99, 0.88, { seg: 8 });
  } else if (opts.dress === 'store') {
    // freight staged at the west end, clear of the door opening
    // and its leaf: a two-high crate stack + drums of smalls
    k.box(0.92, 0.92, 0.92, 0x6e5a3e, -5.3, 0.6, 0.1);
    k.box(0.92, 0.92, 0.92, 0x63512f, -5.3, 1.52, 0.1);
    k.obstacle(-5.3, 0.1, 0.5, 0.5);
    kitCyl(k, 0.3, 0.9, 0x51606e, 5.5, 0.59, -0.75);
    kitCyl(k, 0.3, 0.9, 0x746a52, 4.85, 0.59, -0.85);
    k.obstacle(5.2, -0.8, 0.7, 0.4);
    // tins + sacks on the shelf boards
    k.box(0.5, 0.3, 0.34, 0x8a7a3b, 1.9, 1.06, 0.88);
    k.box(0.44, 0.26, 0.3, 0x9a8a76, 3.3, 1.04, 0.88);
    k.box(0.4, 0.34, 0.3, 0x707a5e, 3.85, 1.08, 0.88);
  } else {
    // lab: standing gas tanks at the east end + sample jars riding
    // the bench, reagent tins on the shelf
    kitCyl(k, 0.34, 1.7, 0x7a8a72, 5.35, 0.99, -0.55);
    kitCyl(k, 0.34, 1.7, 0x8a7a4a, 4.55, 0.99, -0.75);
    k.box(0.72, 0.08, 0.3, STEEL_DARK, 4.95, 1.9, -0.65);
    k.obstacle(4.95, -0.65, 0.85, 0.42);
    for (let i = 0; i < 5; i++) {
      kitCyl(k, 0.055, 0.2, i % 2 ? 0xbfd8c8 : 0xd8cfae, 0.1 + i * 0.75, 1.09, -1.05, { seg: 8 });
    }
    k.box(0.34, 0.26, 0.26, 0xb9bdc0, 2.2, 1.04, 0.88);
    k.box(0.3, 0.2, 0.24, 0x8a4a3a, 2.65, 1.01, 0.88);
    kitCyl(k, 0.08, 0.24, 0x3f7a8a, 3.4, 1.03, 0.88, { seg: 8 });
  }
  if (opts.npc) k.npcPoint(0.5, 0.6);
  k.roomPoint(0, 0.4, opts.label);
  return k.finalize();
}

/**
 * An open-front canopy shelter — posts + a real service canopy (the
 * fuel point's form), the working cover of the Ridge ops yard, the
 * lighthouse shore and the harbor. Contents are searchable; the
 * opening is registered so the gate can walk in.
 */
function buildCanopyShelter(
  id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY,
  w: number, d: number, clearH: number, opts: { label: string; lootKind: 'camp' | 'suburban'; backWall?: boolean; dress?: 'ops' | 'shore' | 'gear' },
): KitResult {
  const baseY = baseAt(cx, cz, groundY);
  const k = new Kit(id, cx, cz, rot, baseY, w, d, 1);
  const hw = w / 2;
  const hd = d / 2;
  for (const px of [-hw + 0.6, hw - 0.6]) {
    for (const pz of [-hd + 0.6, hd - 0.6]) {
      k.post(px, pz, -0.1, clearH, STEEL_DARK, 0.22);
      k.obstacle(px, pz, 0.16, 0.16);
    }
  }
  if (opts.backWall) {
    k.wall({ axis: 'x', at: -hd + 0.15, from: -hw, to: hw, story: 0, color: STEEL, exterior: true });
    k.wall({ axis: 'z', at: -hw + 0.15, from: -hd, to: hd, story: 0, color: STEEL, exterior: true });
    k.wall({ axis: 'z', at: hw - 0.15, from: -hd, to: hd, story: 0, color: STEEL, exterior: true });
  }
  k.roofCanopy(0xb9bdc0, STEEL_DARK, clearH);
  k.furnish({ kind: 'crate', lx: -hw + 1.6, lz: -hd + 1.4, id: `${id}_crate`, loot: FURNITURE_LOOT.crate[opts.lootKind], label: `Search ${opts.label} crate` });
  k.furnish({ kind: 'toolbox', lx: hw - 1.7, lz: -hd + 1.3, id: `${id}_toolbox`, loot: FURNITURE_LOOT.toolbox[opts.lootKind], label: `Search ${opts.label} toolbox` });
  // ── greeble: each shelter works a trade — drums + a bench for the
  // ops yard, a tool wall for the shore shed, net gear for the harbor
  if (opts.dress === 'ops') {
    for (const [dx, dz, c] of [[-5.6, 0.6, 0x51606e], [-4.95, 1.05, 0x8a4a3a], [-5.45, 1.65, 0x424c52]] as [number, number, number][]) {
      kitCyl(k, 0.3, 0.9, c, dx, 0.59, dz);
    }
    k.obstacle(-5.3, 1.05, 0.8, 0.85);
    k.box(0.6, 0.08, 3.4, TIMBER, -6.35, 0.92, -0.8);
    k.box(0.55, 0.78, 3.3, STEEL_DARK, -6.38, 0.5, -0.8);
    k.obstacle(-6.35, -0.8, 0.35, 1.75);
    k.box(0.3, 0.2, 0.24, 0x8a2f2f, -6.35, 1.06, -1.6);
    k.box(0.24, 0.16, 0.2, 0x3a3d40, -6.35, 1.04, 0.1);
  } else if (opts.dress === 'shore') {
    // the tool wall: pegboard over a bench on the back wall, tools
    // hung as dark shapes, a parts bin below
    k.box(3.6, 1.1, 0.05, TIMBER_DARK, 0, 1.65, -2.18);
    k.box(3.6, 0.08, 0.55, TIMBER, 0, 0.92, -1.9);
    k.box(3.5, 0.8, 0.45, STEEL_DARK, 0, 0.45, -1.93);
    k.obstacle(0, -1.9, 1.85, 0.32);
    for (const [tx, tw, th] of [[-1.3, 0.1, 0.5], [-0.7, 0.16, 0.34], [0.1, 0.1, 0.55], [0.8, 0.2, 0.28], [1.35, 0.09, 0.44]] as [number, number, number][]) {
      k.box(tw, th, 0.04, 0x2c2f33, tx, 1.7, -2.14);
    }
    k.box(0.5, 0.3, 0.34, 0xc8a03a, -1.2, 1.11, -1.9);
    kitCyl(k, 0.26, 0.75, 0x746a52, 3.6, 0.51, 1.6);
    k.obstacle(3.6, 1.6, 0.35, 0.35);
  } else if (opts.dress === 'gear') {
    // a net reel on stands + buoys hung off the back wall + a crate
    // stack by the post
    kitCyl(k, 0.55, 1.4, 0x2e4a34, -3.2, 0.85, 0.8, { rz: Math.PI / 2, seg: 14 });
    k.box(0.14, 0.85, 0.7, TIMBER_DARK, -3.95, 0.42, 0.8);
    k.box(0.14, 0.85, 0.7, TIMBER_DARK, -2.45, 0.42, 0.8);
    k.obstacle(-3.2, 0.8, 0.85, 0.45);
    for (const [bx, bc] of [[1.4, 0xd8622a], [2.1, 0xc23b2a], [2.8, 0xe8e4da]] as [number, number][]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: bc, roughness: 0.7 }));
      s.position.set(bx, 1.95, -2.62);
      s.castShadow = true;
      k.detail(s);
    }
    k.box(0.8, 0.8, 0.8, 0x6e5a3e, 3.9, 0.54, 1.9);
    k.box(0.7, 0.7, 0.7, 0x77644a, 3.85, 1.29, 1.85);
    k.obstacle(3.9, 1.9, 0.5, 0.5);
  }
  k.openEntrance('S', 0, Math.min(8, w - 3), clearH);
  k.roomPoint(0, 0.5, opts.label);
  return k.finalize();
}

/** The switchback watchtower — the airfield tower's climb in a 6 m
 *  shaft: flight per story along the east wall, holes cut in every
 *  slab above, a glazed cab under a flat parapet roof. */
function buildWatchtower(
  id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY,
  opts: { label: string; lootKind: 'camp' | 'suburban' },
): KitResult {
  const stories = 3;
  const k = new Kit(id, cx, cz, rot, baseAt(cx, cz, groundY), 6, 6, stories);
  k.foundation(0x74706a);
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: 'S', at: 0, leafColor: STEEL_DARK },
    windows: [{ face: 'W', at: 0, w: 1.0 }, { face: 'E', at: 0, w: 1.0 }],
  });
  const hole = { x0: 1.35, z0: -2.3, x1: 2.75, z1: 2.3 };
  for (let s = 0; s < stories - 1; s++) {
    const even = s % 2 === 0;
    k.stairs({ x: 2.05, z: even ? 2.24 : -2.24, dir: even ? 'nz' : 'pz', story: s, runLen: 4.48 });
    if (s + 1 < stories - 1) {
      k.floorSlabStairwell(s + 1, [hole]);
      k.perimeter({
        story: s + 1, color: CONCRETE, trim: TRIM,
        windows: [{ face: s % 2 ? 'E' : 'W', at: 0, w: 1.0 }],
      });
    }
    k.roomPoint(-1.2, 0, `${opts.label} landing ${s + 1}`);
  }
  k.floorSlabStairwell(stories - 1, [hole]);
  k.perimeter({
    story: stories - 1, color: STEEL, trim: TRIM, glassColor: GLASSY,
    windows: [
      { face: 'N', at: 0, w: 4.2, sill: 0.8, head: 2.7 },
      { face: 'S', at: 0, w: 4.2, sill: 0.8, head: 2.7 },
      { face: 'E', at: 0, w: 4.2, sill: 0.8, head: 2.7 },
      { face: 'W', at: 0, w: 4.2, sill: 0.8, head: 2.7 },
    ],
  });
  k.roofFlat(ROOF, TRIM);
  k.furnish({ kind: 'cabinets', lx: -2.2, lz: -2.2, story: stories - 1, id: `${id}_cabinet`, loot: FURNITURE_LOOT.cabinets[opts.lootKind], label: `Search ${opts.label} cabinet` });
  // ── greeble: the cab works a watch desk under the south glass
  // (story-2 floor top is local 6.14) with a radio on it; a toolbox
  // waits by the ground-floor door swing's clear corner
  const cabFloor = 6.14;
  k.box(2.6, 0.06, 0.6, TIMBER, 0, cabFloor + 0.74, 2.45);
  k.box(0.08, 0.72, 0.5, TIMBER_DARK, -1.2, cabFloor + 0.37, 2.45);
  k.box(0.08, 0.72, 0.5, TIMBER_DARK, 1.2, cabFloor + 0.37, 2.45);
  k.box(0.5, 0.24, 0.34, STEEL_DARK, -0.7, cabFloor + 0.89, 2.45);
  const radioDot = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1e2a1e, emissive: 0x51ff7a, emissiveIntensity: 1.3 }),
  );
  radioDot.position.set(-0.55, cabFloor + 0.92, 2.27);
  k.detail(radioDot);
  k.box(0.42, 0.3, 0.3, 0xcfc8a8, 0.55, cabFloor + 0.92, 2.45);
  k.obstacle(0, 2.45, 1.35, 0.35, stories - 1);
  k.furnish({ kind: 'toolbox', lx: -1.9, lz: 1.9, id: `${id}_toolbox`, loot: FURNITURE_LOOT.toolbox[opts.lootKind], label: `Search ${opts.label} toolbox` });
  k.roomPoint(0, 0, `${opts.label} cab`);
  k.npcPoint(-1.5, 1.5);
  return k.finalize();
}

// ------------------------------------------------------------- THE RIDGE

function buildRidgeBunker(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('ridge_bunker', cx, cz, rot, baseAt(cx, cz, groundY), 16, 11, 1);
  k.foundation(CONCRETE_DARK);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: 'S', at: -5.5, leafColor: STEEL_DARK },
    bays: [{ face: 'S', at: 2.5, w: 3.4, h: 2.6, shut: true }],
    windows: [
      { face: 'N', at: -4, w: 1.4, sill: 1.5, head: 2.5 },
      { face: 'N', at: 4, w: 1.4, sill: 1.5, head: 2.5 },
      { face: 'E', at: 0, w: 1.4, sill: 1.5, head: 2.5 },
      { face: 'W', at: 0, w: 1.4, sill: 1.5, head: 2.5 },
      { face: 'S', at: -2.2, w: 1.2, sill: 1.5, head: 2.5 },
    ],
  });
  // the blast door's furniture: a heavy frame proud of the wall and
  // the chicane wall in front of it — the entrance reads defended
  k.box(3.9, 2.9, 0.35, STEEL_DARK, 2.5, 1.45, 5.6);
  k.box(4.6, 3.0, 0.5, CONCRETE_DARK, 2.5, 1.5, 8.6);
  k.obstacle(2.5, 8.6, 2.3, 0.25);
  // ops room east / stores west, passage between
  k.divider({ axis: 'z', at: 2, from: -5.5, to: 5.5, color: CONCRETE, doorAt: 0 });
  // roof furniture: vent stack + whip antenna (detail over the slab)
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), new THREE.MeshStandardMaterial({ color: STEEL_DARK, roughness: 0.8 }));
  vent.position.set(-5, 3.6, -3);
  vent.castShadow = true;
  k.detail(vent);
  k.roofFlat(CONCRETE_DARK, TRIM);
  k.furnish({ kind: 'cabinets', lx: 6.8, lz: -4.6, id: 'ridge_bunker_cabinets', loot: FURNITURE_LOOT.cabinets.camp, label: 'Search bunker stores' });
  k.furnish({ kind: 'crate', lx: -6.8, lz: -4.4, id: 'ridge_bunker_crate_1', loot: FURNITURE_LOOT.crate.camp, label: 'Search bunker crate' });
  k.furnish({ kind: 'crate', lx: -6.8, lz: 3.8, id: 'ridge_bunker_crate_2', loot: FURNITURE_LOOT.crate.camp, label: 'Search bunker crate' });
  k.furnish({ kind: 'toolbox', lx: 6.6, lz: 4.2, id: 'ridge_bunker_toolbox', loot: FURNITURE_LOOT.toolbox.camp, label: 'Search bunker toolbox' });
  // ── greeble: the ops room works — a map table mid-room, a comms
  // rack on the east wall; the stores room sleeps two bunks + a
  // dresser against the west wall
  k.box(2.3, 0.07, 1.25, TIMBER, 4.4, 0.82, -1.3);
  for (const [lx, lz] of [[3.4, -1.8], [5.4, -1.8], [3.4, -0.8], [5.4, -0.8]] as [number, number][]) {
    k.box(0.09, 0.68, 0.09, TIMBER_DARK, lx, 0.48, lz);
  }
  k.box(1.9, 0.02, 1.0, 0xcfc8a8, 4.4, 0.87, -1.3);
  k.box(0.22, 0.05, 0.16, 0xc23b2a, 3.9, 0.9, -1.5);
  k.box(0.22, 0.05, 0.16, 0x3b5a8a, 4.8, 0.9, -1.05);
  k.box(0.18, 0.05, 0.14, 0x8a7a3b, 4.45, 0.9, -1.62);
  k.obstacle(4.4, -1.3, 1.2, 0.68);
  k.box(0.55, 1.9, 1.1, STEEL_DARK, 7.35, 1.09, -1.6);
  k.box(0.5, 0.06, 1.0, 0x2c2f33, 7.33, 0.6, -1.6);
  k.box(0.5, 0.06, 1.0, 0x2c2f33, 7.33, 1.15, -1.6);
  k.box(0.5, 0.06, 1.0, 0x2c2f33, 7.33, 1.7, -1.6);
  for (let i = 0; i < 4; i++) {
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.05, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x1e2a1e, emissive: i % 2 ? 0x51ff7a : 0xffca7a, emissiveIntensity: 1.3 }),
    );
    dot.position.set(7.05, 0.85 + i * 0.28, -1.85 + (i % 2) * 0.45);
    k.detail(dot);
  }
  k.obstacle(7.35, -1.6, 0.35, 0.6);
  for (const bx of [-4.4, -2.1]) {
    for (const [px, pz] of [[bx - 0.95, -5.25], [bx + 0.95, -5.25], [bx - 0.95, -4.4], [bx + 0.95, -4.4]] as [number, number][]) {
      k.box(0.08, 1.55, 0.08, TIMBER_DARK, px, 0.91, pz);
    }
    k.box(1.95, 0.09, 0.88, 0x707a5e, bx, 0.48, -4.82);
    k.box(1.95, 0.09, 0.88, 0x707a5e, bx, 1.36, -4.82);
    k.box(0.55, 0.07, 0.4, 0xd8d4c8, bx - 0.6, 0.56, -4.82);
    k.obstacle(bx, -4.82, 1.02, 0.5);
  }
  k.furnish({ kind: 'dresser', lx: -7.35, lz: 0.9, rot: 1, id: 'ridge_bunker_dresser', loot: FURNITURE_LOOT.dresser.camp, label: 'Search bunker dresser' });
  k.npcPoint(5.2, -2.5);
  k.roomPoint(-4, 0, 'bunker stores');
  k.roomPoint(5, 1.5, 'bunker ops');
  return k.finalize();
}

// ------------------------------------------------------------ THE CITADEL

function buildGateTower(
  id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY, doorFace: 'E' | 'W',
): KitResult {
  const k = new Kit(id, cx, cz, rot, baseAt(cx, cz, groundY), 4, 4, 2);
  k.foundation(CONCRETE_DARK);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: doorFace, at: 0, leafColor: STEEL_DARK },
    windows: [{ face: 'N', at: 0, w: 1.0, sill: 1.0, head: 2.4 }],
  });
  k.floorSlab(1, CONCRETE);
  k.perimeter({
    story: 1, color: CONCRETE, trim: TRIM,
    windows: [
      { face: 'N', at: 0, w: 1.6, sill: 0.9, head: 2.5 },
      { face: doorFace, at: 0, w: 1.2, sill: 0.9, head: 2.5 },
    ],
  });
  k.roofFlat(ROOF, TRIM);
  // the beacon: a caged lamp over the gate — detail on the roof
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.5 }));
  lamp.position.set(0, 6.6, 0);
  k.detail(lamp);
  // ── greeble: a floodlight fixture on the roof's road-side corner
  // (emissive face only — no real light) + a lantern by the door
  const fx = doorFace === 'E' ? 1.45 : -1.45;
  const out = doorFace === 'E' ? 1 : -1;
  k.box(0.09, 0.55, 0.09, STEEL_DARK, fx, 6.42, -1.2);
  k.box(0.34, 0.24, 0.52, STEEL_DARK, fx + out * 0.14, 6.78, -1.2);
  const floodFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.16, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.2, roughness: 0.6 }),
  );
  floodFace.position.set(fx + out * 0.32, 6.78, -1.2);
  k.detail(floodFace);
  const lx2 = doorFace === 'E' ? 2.02 : -2.02;
  k.box(0.1, 0.24, 0.2, STEEL_DARK, lx2, 2.5, 0.95);
  const doorLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.15, 0.13),
    new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.2, roughness: 0.6 }),
  );
  doorLamp.position.set(lx2 + out * 0.05, 2.5, 0.95);
  k.detail(doorLamp);
  // the crate stands in the corner AWAY from the door leaf's rest
  k.furnish({ kind: 'crate', lx: doorFace === 'E' ? -1.2 : 1.25, lz: doorFace === 'E' ? -1.2 : 1.25, id: `${id}_crate`, loot: FURNITURE_LOOT.crate.suburban, label: 'Search gate crate' });
  k.furnish({ kind: 'toolbox', lx: doorFace === 'E' ? -1.25 : 1.25, lz: doorFace === 'E' ? 1.25 : -1.25, id: `${id}_toolbox`, loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search gate toolbox' });
  k.roomPoint(0, 0, 'gate post');
  k.npcPoint(0.8, -0.8);
  return k.finalize();
}

function buildTruckHall(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('citadel_truck_hall', cx, cz, rot, baseAt(cx, cz, groundY), 26, 18, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: STEEL, trim: TRIM,
    door: { face: 'E', at: -4, leafColor: STEEL_DARK },
    bays: [{ face: 'N', at: -6, w: 4.4, h: 3.0, shut: true }, { face: 'N', at: 6, w: 4.4, h: 3.0, shut: true }],
    windows: [
      { face: 'N', at: 0, w: 2.2, sill: 1.7, head: 2.6 },
      { face: 'E', at: 3, w: 2.0, sill: 1.1, head: 2.5 },
      { face: 'W', at: 0, w: 2.0, sill: 1.1, head: 2.5 },
    ],
    open: ['S'],
  });
  // posts flank the 12.4 m drive-in mouth; the beam carries the front
  for (const px of [-12.4, -6.2, 6.2, 12.4]) {
    k.post(px, 8.85, 0, 4.6, STEEL_DARK, 0.32);
    k.obstacle(px, 8.85, 0.2, 0.2);
  }
  k.beam('x', 8.85, -13, 13, 4.6, STEEL_DARK, 0.4);
  k.openEntrance('S', 0, 12.4, 4.2);
  k.roofFlat(ROOF, TRIM);
  // two truck lifts in the drive lane's flanks — posts, crossbar and
  // arms with real collision; the lane center stays driveable
  for (const lx of [-7.5, 7.5]) {
    k.box(0.28, 3.4, 0.28, 0xc8a03a, lx - 2.2, 1.7, 0);
    k.box(0.28, 3.4, 0.28, 0xc8a03a, lx + 2.2, 1.7, 0);
    k.box(4.7, 0.24, 0.3, 0xc8a03a, lx, 3.35, 0);
    k.box(1.4, 0.12, 0.3, STEEL_DARK, lx - 1.5, 0.75, 0);
    k.box(1.4, 0.12, 0.3, STEEL_DARK, lx + 1.5, 0.75, 0);
    k.obstacle(lx, 0, 2.45, 0.3);
  }
  k.furnish({ kind: 'toolbox', lx: -11.5, lz: -7.6, id: 'citadel_hall_toolbox', loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search hall toolbox' });
  k.furnish({ kind: 'cabinets', lx: 11.5, lz: -7.8, id: 'citadel_hall_cabinets', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search hall parts cabinet' });
  k.furnish({ kind: 'crate', lx: -11.5, lz: 5.5, id: 'citadel_hall_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search hall crate' });
  // ── greeble: rolling tool chests flank the lifts, a workbench
  // runs the north wall under the window, tires stack by the mouth,
  // and the beam over the drive-in carries the hall's name
  for (const sx of [-1, 1]) {
    k.box(1.1, 1.05, 0.55, 0x8a2f2f, sx * 10.8, 0.66, -3.5);
    k.box(1.14, 0.06, 0.58, STEEL_DARK, sx * 10.8, 1.21, -3.5);
    for (let d = 0; d < 3; d++) k.box(1.0, 0.04, 0.02, 0x2c2f33, sx * 10.8, 0.45 + d * 0.25, -3.21);
    k.obstacle(sx * 10.8, -3.5, 0.6, 0.33);
  }
  k.box(5.0, 0.08, 0.7, TIMBER, 0, 0.95, -8.35);
  k.box(5.0, 0.8, 0.6, STEEL_DARK, 0, 0.5, -8.38);
  k.box(0.34, 0.22, 0.3, 0x8a2f2f, -1.8, 1.1, -8.35);
  k.box(0.5, 0.14, 0.36, 0x51606e, 1.5, 1.06, -8.35);
  k.obstacle(0, -8.35, 2.55, 0.4);
  kitTire(k, 11.9, 0.27, 6.8);
  kitTire(k, 11.9, 0.53, 6.8);
  kitTire(k, 11.85, 0.79, 6.75);
  k.obstacle(11.9, 6.8, 0.45, 0.45);
  const sign = decalPlane('FREIGHT', 2.6, 'rgba(232,200,74,0.95)', 44);
  sign.position.set(0, 4.6, 9.08);
  k.addDetail(sign);
  k.roomPoint(0, -2, 'truck hall');
  k.roomPoint(-9, -5, 'hall workshop');
  return k.finalize();
}

// ------------------------------------------------- THE LIGHTHOUSE COLLECTIVE

function buildRadarTower(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('lighthouse_radar', cx, cz, rot, baseAt(cx, cz, groundY), 5, 5, 2);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: 'S', at: 0, leafColor: STEEL_DARK },
    windows: [{ face: 'E', at: 0, w: 1.0 }, { face: 'W', at: 0, w: 1.0 }],
  });
  k.floorSlab(1, CONCRETE);
  k.perimeter({
    story: 1, color: STEEL, trim: TRIM, glassColor: GLASSY,
    windows: [
      { face: 'N', at: 0, w: 3.0, sill: 0.7, head: 2.4 },
      { face: 'S', at: 0, w: 3.0, sill: 0.7, head: 2.4 },
      { face: 'E', at: 0, w: 3.0, sill: 0.7, head: 2.4 },
      { face: 'W', at: 0, w: 3.0, sill: 0.7, head: 2.4 },
    ],
  });
  k.roofFlat(ROOF, TRIM);
  // the array: pedestal + a tilted parabolic dish + feed arm, modeled
  // detail riding the roof slab
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xd4d8da, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.9, 10), dishMat);
  ped.position.set(0, 6.55, 0);
  ped.castShadow = true;
  k.detail(ped);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, 0.8), dishMat);
  dish.position.set(0.35, 7.35, -0.35);
  dish.rotation.set(-0.85, 0, 0.5);
  dish.castShadow = true;
  k.detail(dish);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 6), dishMat);
  arm.position.set(0.75, 7.5, -0.75);
  arm.rotation.set(0.9, 0, -0.6);
  k.detail(arm);
  k.furnish({ kind: 'cabinets', lx: -1.8, lz: -1.85, id: 'lighthouse_radar_cabinets', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search radar stores' });
  k.furnish({ kind: 'crate', lx: 1.8, lz: 1.6, id: 'lighthouse_radar_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search radar crate' });
  // ── greeble: the watch console on the cab's south wall (story-1
  // floor top is local 3.14) — a desk run, two stools, tilted scope
  // screens glowing over it
  k.box(2.6, 0.72, 0.6, STEEL_DARK, -0.5, 3.14 + 0.36, 1.85);
  k.box(2.7, 0.05, 0.68, TIMBER_DARK, -0.5, 3.14 + 0.75, 1.85);
  for (let i = 0; i < 3; i++) {
    const scr = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.44, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x10181a, emissive: 0x3f7a5e, emissiveIntensity: 0.9, roughness: 0.4 }),
    );
    scr.position.set(-1.35 + i * 0.85, 4.12, 1.66);
    scr.rotation.x = -0.28;
    k.detail(scr);
  }
  k.box(0.42, 0.45, 0.42, TIMBER_DARK, -1.1, 3.14 + 0.22, 1.0);
  k.box(0.42, 0.45, 0.42, TIMBER_DARK, 0.1, 3.14 + 0.22, 1.0);
  k.obstacle(-0.5, 1.85, 1.35, 0.35, 1);
  k.roomPoint(0, 0.4, 'radar shack');
  k.npcPoint(1.4, -1.2);
  return k.finalize();
}

// -------------------------------------------------------------- THE REFUGE

function buildChapel(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('refuge_chapel', cx, cz, rot, baseAt(cx, cz, groundY), 13, 9, 1);
  k.foundation(0x6f6a5e);
  k.floorSlab(0, 0x7d7668);
  k.perimeter({
    story: 0, color: STONE, trim: TIMBER_DARK,
    door: { face: 'S', at: 0, leafColor: TIMBER_DARK },
    windows: [
      { face: 'N', at: -4, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'N', at: 0, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'N', at: 4, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'S', at: -3.8, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'S', at: 3.8, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'E', at: 0, w: 1.1, sill: 0.6, head: 2.7 },
      { face: 'W', at: 0, w: 1.1, sill: 0.6, head: 2.7 },
    ],
  });
  // sanctuary north / infirmary south, a real passage between
  k.divider({ axis: 'x', at: 0.5, from: -6.5, to: 6.5, color: STONE, doorAt: 0 });
  // infirmary bed bays: two partition stubs make three bays — the
  // stubs start clear of the divider's swing band so the bay mouths
  // stay walkable from the center aisle
  k.divider({ axis: 'z', at: -2.2, from: 1.55, to: 3.6, color: STONE });
  k.divider({ axis: 'z', at: 2.2, from: 1.55, to: 3.6, color: STONE });
  const bed = (bx: number, bz: number): void => {
    k.box(0.95, 0.32, 2.0, TIMBER_DARK, bx, 0.3, bz);
    k.box(0.85, 0.16, 1.9, 0xd8d4c8, bx, 0.54, bz, 0.9);
    k.box(0.6, 0.1, 0.45, 0xece8de, bx, 0.62, bz - 0.65, 0.9);
    k.obstacle(bx, bz, 0.45, 0.95);
  };
  // a three-bed ward row — two west, one east, aisles kept walkable
  bed(-5.2, 2.8);
  bed(-3.9, 2.8);
  bed(4.85, 2.8);
  // ── greeble: curtains hang at the bay mouths (cloth — no
  // collider, the bays stay walkable), pews fill the sanctuary in
  // two rows off a clear center aisle, and a supply shelf works
  // the infirmary's south wall between cabinet and cooler
  for (const sx of [-2.2, 2.2]) {
    kitCyl(k, 0.025, 1.9, STEEL_DARK, sx, 2.34, 2.55, { rx: Math.PI / 2, seg: 6 });
    k.box(0.05, 1.85, 1.7, 0x9a8a7a, sx, 1.38, 2.55, 0.95);
  }
  for (const sx of [-2.9, 2.9]) {
    for (const zz of [-1.7, -3.3]) {
      k.box(2.6, 0.1, 0.48, TIMBER, sx, 0.62, zz);
      k.box(2.6, 0.55, 0.09, TIMBER, sx, 1.0, zz - 0.26);
      k.box(0.12, 0.5, 0.4, TIMBER_DARK, sx - 1.1, 0.37, zz);
      k.box(0.12, 0.5, 0.4, TIMBER_DARK, sx + 1.1, 0.37, zz);
      k.obstacle(sx, zz, 1.35, 0.32);
    }
  }
  // supply shelves flank the door (its leaf rests between them)
  for (const sx of [-2.0, 2.1]) {
    k.box(1.3, 0.05, 0.44, TIMBER, sx, 0.62, 4.02);
    k.box(1.3, 0.05, 0.44, TIMBER, sx, 1.14, 4.02);
    k.box(0.06, 1.24, 0.4, TIMBER_DARK, sx - 0.62, 0.74, 4.02);
    k.box(0.06, 1.24, 0.4, TIMBER_DARK, sx + 0.62, 0.74, 4.02);
    k.obstacle(sx, 4.02, 0.68, 0.26);
  }
  k.box(0.34, 0.24, 0.3, 0xd8d4c8, -2.3, 1.29, 4.02);
  k.box(0.3, 0.2, 0.26, 0xc23b2a, -1.8, 1.27, 4.02);
  k.box(0.38, 0.3, 0.3, 0x8a6f4d, 2.2, 1.32, 4.02);
  k.box(0.3, 0.22, 0.26, 0xd8d4c8, 1.75, 0.76, 4.02);
  k.roofGable(2.2, ROOF, STONE);
  // the cross on the east gable peak — two plain timbers
  k.box(0.1, 1.0, 0.14, TIMBER_DARK, 6.56, 5.55, 0);
  k.box(0.1, 0.14, 0.55, TIMBER_DARK, 6.56, 5.7, 0);
  k.furnish({ kind: 'cabinets', lx: -3.4, lz: 3.9, id: 'refuge_chapel_cabinets', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search infirmary stores' });
  k.furnish({ kind: 'cooler', lx: 3.4, lz: 3.9, id: 'refuge_chapel_cooler', loot: FURNITURE_LOOT.cooler.suburban, label: 'Search med cooler' });
  k.furnish({ kind: 'crate', lx: -5.5, lz: -3.5, id: 'refuge_chapel_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search chapel supplies' });
  k.npcPoint(3.1, 1.6);
  k.roomPoint(0, -2.2, 'chapel sanctuary');
  k.roomPoint(0, 2.6, 'infirmary');
  return k.finalize();
}

function buildGreenhouse(id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit(id, cx, cz, rot, baseAt(cx, cz, groundY), 12, 6, 1);
  k.foundation(0x6f6a5e);
  k.floorSlab(0, 0x6b5b43);
  const frame = 0x5a6656;
  k.perimeter({
    story: 0, color: frame, trim: TIMBER_DARK, glassColor: 0xbfe0d8,
    door: { face: 'E', at: 0, leafColor: STEEL_DARK },
    windows: [
      { face: 'S', at: -3.6, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'S', at: 0, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'S', at: 3.6, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'N', at: -3.6, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'N', at: 0, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'N', at: 3.6, w: 2.8, sill: 0.25, head: 2.75 },
      { face: 'W', at: 0, w: 2.2, sill: 0.25, head: 2.75 },
      { face: 'E', at: -2, w: 1.4, sill: 0.25, head: 2.75 },
      { face: 'E', at: 2, w: 1.4, sill: 0.25, head: 2.75 },
    ],
  });
  k.roofGable(1.6, 0x9fc4b8, frame);
  // grow racks: two long benches with living tops, real collision
  for (const rz of [-1.4, 1.4]) {
    k.box(9, 0.85, 0.9, STEEL_DARK, 0, 0.55, rz);
    k.box(9, 0.3, 0.8, 0x4a7a3a, 0, 1.1, rz, 0.95);
    k.obstacle(0, rz, 4.5, 0.5);
  }
  // ── greeble: planted rows on the benches (tufted crops in the
  // soil band), an irrigation line over each bench fed from a
  // header tank at the west end of the aisle
  const cropGreens = [0x55803e, 0x649048, 0x4a7a3a, 0x6a9a4a];
  for (const rz of [-1.4, 1.4]) {
    kitCyl(k, 0.03, 9, 0x8a9296, 0, 1.58, rz, { rz: Math.PI / 2, seg: 8 });
    for (let i = 0; i < 10; i++) {
      const tx = -4 + i * 0.89;
      k.box(0.36, 0.24, 0.32, cropGreens[i % 4], tx, 1.37, rz + (i % 2 ? 0.14 : -0.14), 0.95);
      k.box(0.2, 0.14, 0.18, cropGreens[(i + 2) % 4], tx + 0.3, 1.32, rz - (i % 2 ? 0.12 : -0.12), 0.95);
    }
  }
  kitCyl(k, 0.42, 1.25, 0xb9bdc0, -5.15, 0.76, 0, { seg: 14 });
  kitCyl(k, 0.3, 0.18, STEEL_DARK, -5.15, 1.47, 0, { seg: 14 });
  k.obstacle(-5.15, 0, 0.48, 0.48);
  k.furnish({ kind: 'crate', lx: -5.2, lz: 2.3, id: `${id}_crate`, loot: FURNITURE_LOOT.crate.suburban, label: 'Search greenhouse crate' });
  k.furnish({ kind: 'cooler', lx: -5.2, lz: -2.3, id: `${id}_cooler`, loot: FURNITURE_LOOT.cooler.suburban, label: 'Search produce cooler' });
  k.roomPoint(0, 0, 'greenhouse');
  return k.finalize();
}

// --------------------------------------------------------------- THE PIER HQ

function buildIcehouse(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('pier_icehouse', cx, cz, rot, baseAt(cx, cz, groundY), 11, 7.5, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: 0xcfd4d2, trim: TIMBER_DARK,
    door: { face: 'S', at: -2, leafColor: STEEL_DARK },
    windows: [
      { face: 'N', at: -2.5, w: 1.2 }, { face: 'N', at: 2.5, w: 1.2 },
      { face: 'E', at: 0, w: 1.2 }, { face: 'W', at: 0, w: 1.2 },
    ],
  });
  k.roofGable(1.8, STEEL, 0xcfd4d2);
  // the ice: sawn blocks stacked by the north wall, real collision
  for (let i = 0; i < 3; i++) {
    k.box(0.95, 0.5, 0.62, 0xdfeef2, -1.2 + i * 1.05, 0.4, -3.0, 0.3);
    k.box(0.95, 0.5, 0.62, 0xd8e8ee, -1.2 + i * 1.05, 0.9, -3.0, 0.3);
  }
  k.obstacle(0, -3.0, 1.7, 0.4);
  // ── greeble: the day's work happens outside the south door — a
  // fish table with the catch laid out, crates stacked beside it
  k.box(1.9, 0.07, 0.85, 0xd8d4c8, 2.5, 0.95, 5.4);
  k.box(1.7, 0.05, 0.65, TIMBER_DARK, 2.5, 0.45, 5.4);
  for (const [lx, lz] of [[1.7, 5.1], [3.3, 5.1], [1.7, 5.7], [3.3, 5.7]] as [number, number][]) {
    k.box(0.09, 0.9, 0.09, TIMBER_DARK, lx, 0.48, lz);
  }
  k.box(0.55, 0.1, 0.22, 0x9fc4d8, 2.1, 1.04, 5.3, 0.4);
  k.box(0.45, 0.09, 0.2, 0x8fb0c2, 2.85, 1.03, 5.5, 0.4);
  kitCyl(k, 0.16, 0.3, 0x51606e, 3.6, 0.29, 5.5, { seg: 10 });
  k.obstacle(2.5, 5.4, 1.0, 0.48);
  k.box(0.85, 0.85, 0.85, 0x6e5a3e, -3.6, 0.56, 4.7);
  k.box(0.75, 0.75, 0.75, 0x77644a, -3.55, 1.36, 4.65);
  k.obstacle(-3.6, 4.7, 0.5, 0.5);
  k.furnish({ kind: 'fridge', lx: -4.6, lz: -3.1, id: 'pier_icehouse_fridge_1', loot: FURNITURE_LOOT.fridge.camp, label: 'Search icehouse cold store' });
  k.furnish({ kind: 'fridge', lx: -3.6, lz: -3.1, id: 'pier_icehouse_fridge_2', loot: FURNITURE_LOOT.fridge.camp, label: 'Search icehouse cold store' });
  k.furnish({ kind: 'cooler', lx: 4.6, lz: -3.1, id: 'pier_icehouse_cooler', loot: FURNITURE_LOOT.cooler.camp, label: 'Search fish cooler' });
  k.furnish({ kind: 'crate', lx: 4.6, lz: 2.9, id: 'pier_icehouse_crate', loot: FURNITURE_LOOT.crate.camp, label: 'Search icehouse crate' });
  k.npcPoint(3.2, 1.2);
  k.roomPoint(0, 0.6, 'icehouse');
  return k.finalize();
}

/**
 * The harbor boardwalk — a kit, not a prop: its floor is real (the
 * gate floods it from the shore entrance), carried on piling pairs
 * driven to the seabed, railed on the channel side, open to the work
 * slips on the harbor side. The net crane stands at its west end.
 */
function buildBoardwalk(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  void groundY; // the deck is level by design; piles reach the bed
  const k = new Kit('pier_boardwalk', cx, cz, rot, 2.16, 44, 4, 1);
  k.floorSlab(0, 0x8a7a66);
  // piling pairs + stringers under the deck
  for (let lx = -21; lx <= 21; lx += 4.2) {
    k.post(lx, -1.7, -6.6, 0, TIMBER_DARK, 0.3);
    k.post(lx, 1.7, -6.6, 0, TIMBER_DARK, 0.3);
  }
  k.box(43.6, 0.24, 0.26, TIMBER_DARK, 0, -0.24, -1.7);
  k.box(43.6, 0.24, 0.26, TIMBER_DARK, 0, -0.24, 1.7);
  // plank grooves across the deck — saw lines, not a texture
  for (let lx = -20.9; lx <= 21; lx += 2.2) {
    k.box(0.09, 0.03, 3.68, 0x5a4632, lx, 0.15, 0);
  }
  // channel-side railing: posts, two rails, a collider line
  for (let lx = -21; lx <= 21; lx += 3) {
    k.box(0.09, 1.1, 0.09, TIMBER, lx, 0.68, -1.86);
  }
  k.box(43.6, 0.08, 0.08, TIMBER, 0, 1.26, -1.86);
  k.box(43.6, 0.06, 0.06, TIMBER, 0, 0.78, -1.86);
  k.obstacle(0, -1.9, 22, 0.09);
  // the net crane at the west end: post, angled boom, fall line
  k.post(-20.5, 0.9, 0, 5.2, STEEL_DARK, 0.3);
  k.obstacle(-20.5, 0.9, 0.3, 0.3);
  const boomMat = new THREE.MeshStandardMaterial({ color: STEEL_DARK, roughness: 0.8 });
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6.4, 8), boomMat);
  boom.position.set(-20.5, 4.4, 3.4);
  boom.rotation.x = 1.05;
  boom.castShadow = true;
  k.detail(boom);
  const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), boomMat);
  fall.position.set(-20.5, 2.6, 6.1);
  k.detail(fall);
  k.furnish({ kind: 'crate', lx: 13, lz: 1.1, id: 'pier_boardwalk_crate', loot: FURNITURE_LOOT.crate.camp, label: 'Search pier crate' });
  k.furnish({ kind: 'barrel', lx: -16, lz: -1.0, id: 'pier_boardwalk_barrel', loot: FURNITURE_LOOT.barrel.camp, label: 'Search pier barrel' });
  // ── greeble: the working deck — net bundles waiting on repair,
  // buoys drying on the planks and the rail, a fish table mid-run
  for (const [nx, nz, nr, sy] of [[-8, 1.15, 0.78, 0.5], [-7.0, 0.45, 0.55, 0.42]] as [number, number, number, number][]) {
    const net = new THREE.Mesh(
      new THREE.IcosahedronGeometry(nr, 0),
      new THREE.MeshStandardMaterial({ color: 0x2e4a34, roughness: 1 }),
    );
    net.scale.y = sy;
    net.position.set(nx, 0.14 + nr * sy, nz);
    net.castShadow = true;
    net.name = 'deck_net';
    k.detail(net);
  }
  k.obstacle(-7.6, 0.9, 1.0, 0.65);
  for (const [bx, bz, bc] of [[5.5, -1.15, 0xd8622a], [18.5, 1.2, 0xc23b2a], [-2, -1.72, 0xe8c84a]] as [number, number, number][]) {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: bc, roughness: 0.7 }));
    buoy.position.set(bx, bz === -1.72 ? 0.95 : 0.31, bz);
    buoy.castShadow = true;
    buoy.name = 'deck_buoy';
    k.detail(buoy);
    if (bz !== -1.72) k.obstacle(bx, bz, 0.2, 0.2);
  }
  k.box(1.7, 0.06, 0.8, TIMBER, -13.5, 0.99, 0.95);
  for (const [lx, lz] of [[-14.2, 0.65], [-12.8, 0.65], [-14.2, 1.25], [-12.8, 1.25]] as [number, number][]) {
    k.box(0.08, 0.85, 0.08, TIMBER_DARK, lx, 0.56, lz);
  }
  k.box(0.5, 0.09, 0.2, 0x9fc4d8, -13.7, 1.06, 0.9, 0.4);
  k.obstacle(-13.5, 0.95, 0.9, 0.45);
  k.openEntrance('E', 0, 3.6, 2.9);
  k.growPad(23, 3);
  return k.finalize();
}

// --------------------------------------------------------------- TERN ROCK

const COTTAGE_COAT = [0xb8a888, 0x9fb4a8, 0xc4b096];

function buildCottage(
  id: string, cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY, coat: number,
): KitResult {
  const k = new Kit(id, cx, cz, rot, baseAt(cx, cz, groundY), 8, 7, 2);
  // the stilt level: timber posts carry the house a full story over
  // the sand — open beneath, storage in the shade, the stair climbs
  // the east wall to the living floor
  for (const [px, pz] of [[-3.7, -3.2], [3.7, -3.2], [-3.7, 3.2], [3.7, 3.2], [-3.7, 0], [3.7, 0], [0, -3.2], [0, 3.2]] as [number, number][]) {
    k.post(px, pz, -0.15, 2.98, TIMBER_DARK, 0.26);
    k.obstacle(px, pz, 0.17, 0.17);
  }
  k.stairs({ x: 3.0, z: 2.2, dir: 'nz', story: 0, runLen: 4.48 });
  k.openEntrance('E', 2.2, 2.6, 2.9);
  // the living floor, with the stairwell cut through it
  k.floorSlabStairwell(1, [{ x0: 2.3, z0: -2.35, x1: 3.7, z1: 2.3 }], 0x7a6248);
  k.perimeter({
    story: 1, color: coat, trim: TIMBER_DARK,
    door: { face: 'S', at: 0, leafColor: TIMBER_DARK },
    windows: [
      { face: 'N', at: -2, w: 1.1 }, { face: 'N', at: 2, w: 1.1 },
      { face: 'E', at: -1.5, w: 1.1 },
      { face: 'W', at: 1.5, w: 1.1 },
      { face: 'S', at: -2.4, w: 1.0 }, { face: 'S', at: 2.4, w: 1.0 },
    ],
  });
  k.deck({ face: 'S', story: 1, depth: 1.8, spanFrom: -3.6, spanTo: 3.6, color: 0x8a7a66, railing: true, railColor: TIMBER_DARK });
  // ── greeble: the porch is lived on — two chairs facing the
  // water, a crate for a table, lanterns on the rail corners, and
  // a lantern post lighting the stair foot (deck floor top is
  // local 3.14; obstacles ride story 1 like the furniture there)
  const deckY = 3.14;
  for (const cx of [-2.3, 1.9]) {
    k.box(0.46, 0.05, 0.44, TIMBER, cx, deckY + 0.45, 4.55);
    k.box(0.46, 0.52, 0.05, TIMBER, cx, deckY + 0.72, 4.32);
    k.box(0.05, 0.45, 0.44, TIMBER_DARK, cx - 0.21, deckY + 0.22, 4.55);
    k.box(0.05, 0.45, 0.44, TIMBER_DARK, cx + 0.21, deckY + 0.22, 4.55);
    k.obstacle(cx, 4.55, 0.28, 0.28, 1);
  }
  k.box(0.62, 0.62, 0.62, 0x6e5a3e, -3.15, deckY + 0.31, 4.6);
  k.box(0.66, 0.06, 0.66, 0x54401f, -3.15, deckY + 0.65, 4.6);
  k.obstacle(-3.15, 4.6, 0.35, 0.35, 1);
  for (const lx of [-3.5, 3.5]) {
    k.box(0.18, 0.1, 0.18, STEEL_DARK, lx, deckY + 1.12, 5.22);
    const lampGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.16, 0.13),
      new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.1, roughness: 0.6 }),
    );
    lampGlass.position.set(lx, deckY + 1.26, 5.22);
    lampGlass.name = 'porch_lantern';
    k.detail(lampGlass);
  }
  kitCyl(k, 0.05, 1.6, TIMBER_DARK, 4.9, 0.8, 4.9, { seg: 8 });
  const postLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.22, 0.17),
    new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.1, roughness: 0.6 }),
  );
  postLamp.position.set(4.9, 1.72, 4.9);
  postLamp.name = 'porch_lantern';
  k.detail(postLamp);
  k.obstacle(4.9, 4.9, 0.18, 0.18);
  k.box(0.85, 0.85, 0.85, 0x77644a, -2.9, 0.56, -2.7);
  k.box(0.7, 0.7, 0.7, 0x6e5a3e, -2.85, 1.34, -2.65);
  k.obstacle(-2.9, -2.7, 0.5, 0.5);
  k.roofGable(1.8, 0x6a7076, coat);
  // lived-in, upstairs and down
  k.furnish({ kind: 'fridge', lx: -3.3, lz: -2.7, story: 1, id: `${id}_fridge`, loot: FURNITURE_LOOT.fridge.suburban, label: 'Search cottage fridge' });
  k.furnish({ kind: 'dresser', lx: -0.5, lz: -2.85, story: 1, id: `${id}_dresser`, loot: FURNITURE_LOOT.dresser.suburban, label: 'Search cottage dresser' });
  k.furnish({ kind: 'cabinets', lx: -3.5, lz: 0.5, rot: 1, story: 1, id: `${id}_cabinets`, loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search cottage cabinets' });
  k.furnish({ kind: 'crate', lx: -2.5, lz: 1.5, story: 0, id: `${id}_crate`, loot: FURNITURE_LOOT.crate.suburban, label: 'Search under-house crate' });
  k.furnish({ kind: 'barrel', lx: 1.8, lz: -2.2, story: 0, id: `${id}_barrel`, loot: FURNITURE_LOOT.barrel.suburban, label: 'Search under-house barrel' });
  k.roomPoint(0, 0.3, 'cottage');
  return k.finalize();
}

function buildStore(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('tern_store', cx, cz, rot, baseAt(cx, cz, groundY), 12, 9, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, 0x7a6a52);
  k.perimeter({
    story: 0, color: 0xa89878, trim: TIMBER_DARK,
    door: { face: 'S', at: -3, leafColor: TIMBER_DARK },
    windows: [
      { face: 'S', at: 1.5, w: 2.2, sill: 0.5, head: 2.6 },
      { face: 'S', at: 4.2, w: 2.2, sill: 0.5, head: 2.6 },
      { face: 'N', at: -3, w: 1.6 }, { face: 'N', at: 3, w: 1.6 },
      { face: 'E', at: 0, w: 1.4 }, { face: 'W', at: 0, w: 1.4 },
    ],
  });
  k.roofFlat(ROOF, TIMBER_DARK);
  // the shop counter — the clerk stands behind it
  k.box(3.2, 1.02, 0.85, TIMBER, 0, 0.65, 1.2);
  k.box(3.4, 0.07, 1.0, TIMBER_DARK, 0, 1.19, 1.2);
  k.obstacle(0, 1.2, 1.65, 0.45);
  // ── greeble: the counter works — a scale and register ride it;
  // outside, the store hangs its name over the door between two
  // lanterns, with produce crates by the front wall
  k.box(0.34, 0.2, 0.3, 0x8a9296, -0.9, 1.32, 1.2);
  k.box(0.4, 0.05, 0.34, 0x6e5639, -0.9, 1.45, 1.2);
  k.box(0.4, 0.26, 0.36, 0x3a3d40, 0.8, 1.35, 1.2);
  const regGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.07, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x10181a, emissive: 0xffca7a, emissiveIntensity: 0.9 }),
  );
  regGlow.position.set(0.8, 1.44, 1.0);
  k.detail(regGlow);
  const storeSign = decalPlane('TERN ROCK GENERAL STORE', 5.2, 'rgba(232,224,200,0.95)', 40);
  storeSign.position.set(0.5, 2.72, 4.56);
  k.addDetail(storeSign);
  for (const lx of [-4.35, -1.65]) {
    k.box(0.15, 0.24, 0.1, STEEL_DARK, lx, 2.3, 4.54);
    kitLampFace(k, 0.09, 0.15, lx, 2.3, 4.6);
  }
  k.box(0.85, 0.85, 0.85, 0x6e5a3e, 3.6, 0.56, 5.4);
  k.box(0.85, 0.85, 0.85, 0x77644a, 4.5, 0.56, 5.3);
  k.box(0.8, 0.8, 0.8, 0x63512f, 4.05, 1.39, 5.35);
  for (const [ax, ac] of [[3.45, 0xc23b2a], [3.65, 0x649048], [3.8, 0xc23b2a]] as [number, number][]) {
    k.box(0.13, 0.13, 0.13, ac, ax, 1.05, 5.3);
  }
  k.obstacle(4.05, 5.35, 1.0, 0.5);
  k.furnish({ kind: 'bookshelf', lx: -4, lz: -3.9, id: 'tern_store_shelf_1', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search store shelves' });
  k.furnish({ kind: 'bookshelf', lx: 0, lz: -3.9, id: 'tern_store_shelf_2', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search store shelves' });
  k.furnish({ kind: 'bookshelf', lx: 4, lz: -3.9, id: 'tern_store_shelf_3', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search store shelves' });
  k.furnish({ kind: 'cabinets', lx: 4.6, lz: 3.85, id: 'tern_store_cabinets', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search store cabinets' });
  k.furnish({ kind: 'cooler', lx: -4.6, lz: 3.85, id: 'tern_store_cooler', loot: FURNITURE_LOOT.cooler.suburban, label: 'Search store cooler' });
  k.npcPoint(0, 2.3);
  k.roomPoint(-1.5, -1.5, 'general store');
  return k.finalize();
}

function buildMarineGarage(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('tern_garage', cx, cz, rot, baseAt(cx, cz, groundY), 11, 8, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: STEEL, trim: TRIM,
    door: { face: 'E', at: 0, leafColor: STEEL_DARK },
    bays: [
      { face: 'S', at: -2.6, w: 3.6, h: 2.6 },
      { face: 'S', at: 2.6, w: 3.6, h: 2.6, shut: true },
    ],
    windows: [
      { face: 'N', at: -3, w: 1.6, sill: 1.2, head: 2.5 },
      { face: 'N', at: 3, w: 1.6, sill: 1.2, head: 2.5 },
    ],
  });
  k.roofFlat(ROOF, TRIM);
  // one lift frame in the open bay's flank
  k.box(0.26, 3.0, 0.26, 0xc8a03a, -2.2, 1.5, -1);
  k.box(0.26, 3.0, 0.26, 0xc8a03a, 2.2, 1.5, -1);
  k.box(4.7, 0.22, 0.28, 0xc8a03a, 0, 2.95, -1);
  k.obstacle(0, -1, 2.45, 0.3);
  k.furnish({ kind: 'toolbox', lx: -4.8, lz: -3.3, id: 'tern_garage_toolbox', loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search garage toolbox' });
  k.furnish({ kind: 'cabinets', lx: 4.9, lz: -3.4, id: 'tern_garage_cabinets', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search garage cabinets' });
  k.furnish({ kind: 'crate', lx: 4.8, lz: 3.2, id: 'tern_garage_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search garage crate' });
  // ── greeble: a workbench under the north windows, oil drums
  // beside the cabinets, tires stacked in the open bay's corner
  k.box(3.6, 0.08, 0.65, TIMBER, 0, 0.95, -3.45);
  k.box(3.5, 0.78, 0.55, STEEL_DARK, 0, 0.5, -3.48);
  k.box(0.4, 0.18, 0.3, 0x8a2f2f, -1.2, 1.08, -3.45);
  k.box(0.3, 0.24, 0.26, 0x51606e, 0.9, 1.11, -3.45);
  k.obstacle(0, -3.45, 1.85, 0.38);
  kitCyl(k, 0.31, 0.9, 0x424c52, 3.1, 0.59, -3.25);
  kitCyl(k, 0.31, 0.9, 0x5d6a72, 3.7, 0.59, -3.5);
  k.obstacle(3.4, -3.37, 0.7, 0.4);
  kitTire(k, -4.5, 0.27, 2.9);
  kitTire(k, -4.5, 0.53, 2.9);
  kitTire(k, -4.45, 0.79, 2.85);
  k.obstacle(-4.5, 2.9, 0.45, 0.45);
  k.roomPoint(0, 2.2, 'marine garage');
  return k.finalize();
}

/**
 * The town fuel dock — a kit deck (real floor) walking east off the
 * beach into the sound: piling pairs, a pump at the shore end, the
 * drum cache at the deep end.
 */
function buildFuelDock(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  void groundY; // level deck by design; piles reach the bed
  const baseY = 2.36;
  const k = new Kit('tern_fuel_dock', cx, cz, rot, baseY, 32, 3, 1);
  k.floorSlab(0, 0x8a7a66);
  for (let lx = -15; lx <= 15; lx += 3.75) {
    k.post(lx, -1.25, -3.8, 0, TIMBER_DARK, 0.26);
    k.post(lx, 1.25, -3.8, 0, TIMBER_DARK, 0.26);
  }
  k.box(31.6, 0.22, 0.24, TIMBER_DARK, 0, -0.22, -1.25);
  k.box(31.6, 0.22, 0.24, TIMBER_DARK, 0, -0.22, 1.25);
  for (let lx = -14.9; lx <= 15; lx += 2.15) {
    k.box(0.09, 0.03, 2.68, 0x5a4632, lx, 0.15, 0);
  }
  // the pump at the shore end + the drum cache at the deep end
  k.box(0.62, 1.15, 0.5, 0x8a3a30, -13, 0.72, 0);
  k.obstacle(-13, 0, 0.4, 0.35);
  k.box(0.62, 0.92, 0.62, STEEL, 12.2, 0.6, -0.7);
  k.box(0.62, 0.92, 0.62, 0x8a3a30, 12.9, 0.6, 0.1);
  k.box(0.62, 0.92, 0.62, STEEL_DARK, 12.3, 0.6, 0.8);
  k.container({
    id: 'tern_fuel_cache', lx: 12.6, lz: 0.1,
    loot: [
      { id: 'fuel_can', min: 1, max: 2, chance: 0.9 },
      { id: 'gun_oil', min: 1, max: 1, chance: 0.4 },
    ],
    label: 'Search dock fuel drums', searchTime: 2.5, y: baseY + 0.2, collider: true,
  });
  // ── greeble: tire fenders hang along both faces at the
  // waterline, a hose coils on the pump, a lantern stands at the
  // deep end, and a toolbox rides the deck mid-run
  for (const fx of [-10, 0, 10]) {
    for (const fz of [-1.62, 1.62]) {
      const fender = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.1, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95 }),
      );
      fender.position.set(fx, -1.0, fz);
      fender.name = 'dock_fender';
      k.detail(fender);
    }
  }
  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.05, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.9 }),
  );
  hose.position.set(-13, 0.9, 0.32);
  k.detail(hose);
  k.box(0.08, 1.3, 0.08, STEEL_DARK, 15.2, 0.79, -1.1);
  const dockLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.1, roughness: 0.6 }),
  );
  dockLamp.position.set(15.2, 1.56, -1.1);
  dockLamp.name = 'dock_lantern';
  k.detail(dockLamp);
  k.obstacle(15.2, -1.1, 0.14, 0.14);
  k.furnish({ kind: 'toolbox', lx: -8, lz: 0.85, id: 'tern_fuel_dock_toolbox', loot: FURNITURE_LOOT.toolbox.camp, label: 'Search dock toolbox' });
  k.openEntrance('W', 0, 2.8, 2.9);
  k.growPad(17, 2.5);
  return k.finalize();
}

// ------------------------------------------------------------ ground works
//
// Open structures in the airbase ground-works idiom: real geometry in
// one group, prop colliders beside it, and a tagged SectorFeature for
// every named structure so the gate can pin existence and placement.

const CONT_COLORS = [0x7a4a38, 0x44586a, 0x5a6e64, 0x746a52, 0x6e4a4a, 0x51606e];

class GroundWorks {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly features: SectorFeature[] = [];
  readonly logSpots: { x: number; z: number; y: number }[] = [];
  private mats = new Map<string, THREE.Material>();

  constructor(private readonly groundY: GroundY) {}

  gy(x: number, z: number): number {
    return this.groundY(x, z);
  }

  private mat(color: number, rough = 1): THREE.Material {
    const key = `${color}:${rough}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough });
      this.mats.set(key, m);
    }
    return m;
  }

  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rough = 1): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color, rough));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  cyl(rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, rx = 0, rz = 0, seg = 12): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(color));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  collider(x: number, z: number, hx: number, hz: number): void {
    this.colliders.push({ x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz });
  }

  feature(id: string, sector: string, kind: string, x: number, z: number, hx: number, hz: number, note: string): void {
    this.features.push({ id, sector, kind, x, z, hx, hz, note });
  }

  /** One 40 ft container as stacked-yard geometry (visual + the
   *  footprint). Only ground-tier units earn a collider — the tiers
   *  above stand on them, and a plan collider has no height to give. */
  containerUnit(x: number, z: number, tier: number, alongZ: boolean, colorIdx: number): void {
    const gy = this.gy(x, z);
    const cy = gy + tier * 2.6 + 1.3;
    const color = CONT_COLORS[colorIdx % CONT_COLORS.length];
    const L = 12.2;
    const W = 2.44;
    const H = 2.6;
    if (alongZ) this.box(W, H, L, color, x, cy, z, 0, 0.75);
    else this.box(L, H, W, color, x, cy, z, 0, 0.75);
    // corrugation ribs on the long faces
    const ribs = 10;
    for (let i = 0; i < ribs; i++) {
      const a = -L / 2 + 0.7 + (i * (L - 1.4)) / (ribs - 1);
      if (alongZ) {
        this.box(0.06, H - 0.3, 0.17, color, x - W / 2 - 0.03, cy, z + a, 0, 0.7);
        this.box(0.06, H - 0.3, 0.17, color, x + W / 2 + 0.03, cy, z + a, 0, 0.7);
      } else {
        this.box(0.17, H - 0.3, 0.06, color, x + a, cy, z - W / 2 - 0.03, 0, 0.7);
        this.box(0.17, H - 0.3, 0.06, color, x + a, cy, z + W / 2 + 0.03, 0, 0.7);
      }
    }
    // corner castings
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = alongZ ? x + sx * (W / 2 - 0.11) : x + sx * (L / 2 - 0.11);
        const pz = alongZ ? z + sz * (L / 2 - 0.11) : z + sz * (W / 2 - 0.11);
        this.box(0.22, H, 0.22, STEEL_DARK, px, cy, pz);
      }
    }
    if (tier === 0) {
      if (alongZ) this.collider(x, z, W / 2, L / 2);
      else this.collider(x, z, L / 2, W / 2);
    }
  }

  /**
   * A palisade run: pointed logs (instanced later from logSpots),
   * two rail beams on the inward face, a collider per unbroken
   * segment. `gaps` are [a0, a1] spans left open (gates).
   */
  palisadeRun(
    axis: 'x' | 'z', fixed: number, a0: number, a1: number,
    gaps: [number, number][], inward: 1 | -1,
  ): void {
    const segs: [number, number][] = [];
    let cur = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 > cur) segs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < a1) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 0.2) continue;
      const mid = (s0 + s1) / 2;
      for (let a = s0 + 0.17; a < s1; a += 0.34) {
        const x = axis === 'x' ? a : fixed;
        const z = axis === 'x' ? fixed : a;
        this.logSpots.push({ x, z, y: this.gy(x, z) });
      }
      for (const ry of [1.05, 2.15]) {
        if (axis === 'x') this.box(len, 0.14, 0.09, TIMBER, mid, this.gy(mid, fixed) + ry, fixed + inward * 0.17);
        else this.box(0.09, 0.14, len, TIMBER, fixed + inward * 0.17, this.gy(fixed, mid) + ry, mid);
      }
      if (axis === 'x') this.collider(mid, fixed, len / 2, 0.22);
      else this.collider(fixed, mid, 0.22, len / 2);
    }
  }

  /** Bake the collected palisade logs into two instanced meshes. */
  bakePalisadeLogs(): void {
    if (this.logSpots.length === 0) return;
    const logGeo = new THREE.CylinderGeometry(0.105, 0.125, 3.1, 6);
    logGeo.translate(0, 1.55, 0);
    const tipGeo = new THREE.ConeGeometry(0.105, 0.4, 6);
    tipGeo.translate(0, 3.3, 0);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x77644a, roughness: 1 });
    const logs = new THREE.InstancedMesh(logGeo, logMat, this.logSpots.length);
    const tips = new THREE.InstancedMesh(tipGeo, logMat, this.logSpots.length);
    const m = new THREE.Matrix4();
    this.logSpots.forEach((s, i) => {
      m.makeTranslation(s.x, s.y - 0.15, s.z);
      logs.setMatrixAt(i, m);
      tips.setMatrixAt(i, m);
    });
    logs.instanceMatrix.needsUpdate = true;
    tips.instanceMatrix.needsUpdate = true;
    logs.castShadow = true;
    this.group.add(logs);
    this.group.add(tips);
  }
}

function ridgeGround(gw: GroundWorks): void {
  // the tactical helipad on its benched shoulder (BETA_EXTRA_PADS)
  const pad = BETA_EXTRA_PADS.find((p) => p.id === 'helipad');
  if (!pad) throw new Error('helipad pad missing from BETA_EXTRA_PADS');
  const gy = gw.gy(pad.x, pad.z);
  gw.cyl(11, 11, 0.14, 0x4c5157, pad.x, gy + 0.02, pad.z, 0, 0, 28);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9.4, 10.3, 40),
    new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pad.x, gy + 0.1, pad.z);
  ring.receiveShadow = true;
  gw.group.add(ring);
  const hMark = decalPlane('H', 6, 'rgba(232,200,74,0.95)', 60);
  hMark.rotation.x = -Math.PI / 2;
  hMark.position.set(pad.x, gy + 0.11, pad.z);
  gw.group.add(hMark);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x2e3438, emissive: 0xffca7a, emissiveIntensity: 1.1, roughness: 0.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), lightMat);
    lamp.position.set(pad.x + Math.cos(a) * 10.7, gy + 0.18, pad.z + Math.sin(a) * 10.7);
    gw.group.add(lamp);
  }
  // windsock at the pad's corner
  gw.cyl(0.06, 0.08, 5, STEEL_DARK, pad.x - 12, gy + 2.5, pad.z + 10);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.6, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xc85a28, roughness: 0.9, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2 - 0.18;
  sock.position.set(pad.x - 11.1, gy + 4.8, pad.z + 10);
  gw.group.add(sock);
  gw.collider(pad.x - 12, pad.z + 10, 0.3, 0.3);
  gw.feature('ridge_helipad', 'ridge', 'helipad', pad.x, pad.z, 11, 11, 'Tactical helipad on the benched shoulder pad — slab, ring, H, edge lights, windsock.');

  // the comms mast NE of the tower
  const mx = -482;
  const mz = -191;
  const my = gw.gy(mx, mz);
  for (const sx of [-0.8, 0.8]) {
    for (const sz of [-0.8, 0.8]) gw.box(0.14, 14, 0.14, STEEL_DARK, mx + sx, my + 7, mz + sz);
  }
  for (const ry of [3.5, 7, 10.5, 13.9]) {
    gw.box(1.75, 0.12, 0.12, STEEL_DARK, mx, my + ry, mz - 0.8);
    gw.box(1.75, 0.12, 0.12, STEEL_DARK, mx, my + ry, mz + 0.8);
    gw.box(0.12, 0.12, 1.75, STEEL_DARK, mx - 0.8, my + ry, mz);
    gw.box(0.12, 0.12, 1.75, STEEL_DARK, mx + 0.8, my + ry, mz);
  }
  gw.cyl(0.05, 0.05, 4.4, STEEL_DARK, mx, my + 16, mz);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xd42424, emissiveIntensity: 1.4 }));
  beacon.position.set(mx, my + 14.3, mz);
  gw.group.add(beacon);
  gw.collider(mx, mz, 0.95, 0.95);
  gw.feature('ridge_mast', 'ridge', 'comms_mast', mx, mz, 1, 1, 'Lattice comms mast, 14 m + whip — the Redoubt\'s long ear.');
  // ── greeble: the mast is dressed — two yagi arrays on the frame
  // and three guy wires flown to anchored blocks
  for (const [yy, ry] of [[11.2, 0.5], [8.6, -0.9]] as [number, number][]) {
    gw.box(1.7, 0.06, 0.06, STEEL_DARK, mx, my + yy, mz, ry);
    for (let e = 0; e < 4; e++) {
      const t = -0.6 + e * 0.4;
      gw.box(0.05, 0.05, 0.8 - Math.abs(t) * 0.3, STEEL_DARK, mx + Math.sin(ry) * t, my + yy, mz + Math.cos(ry) * t, ry);
    }
  }
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7, metalness: 0.4 });
  for (const ang of [0.5, 2.6, 4.7]) {
    const ax = mx + Math.cos(ang) * 7;
    const az = mz + Math.sin(ang) * 7;
    const ay = gw.gy(ax, az);
    gw.box(0.55, 0.4, 0.55, CONCRETE_DARK, ax, ay + 0.2, az);
    gw.collider(ax, az, 0.32, 0.32);
    const from = new THREE.Vector3(mx, my + 13.6, mz);
    const to = new THREE.Vector3(ax, ay + 0.45, az);
    const dir = to.clone().sub(from);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, dir.length(), 5), wireMat);
    wire.position.copy(from.clone().add(to).multiplyScalar(0.5));
    wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    gw.group.add(wire);
  }
  gw.feature('ridge_guy_wires', 'ridge', 'greeble', mx, mz, 7.6, 7.6, 'Greeble: mast guy wires (3) flown to anchored blocks + yagi arrays on the frame.');

  // sandbag lines: one before the bunker's chicane, one covering the
  // tower approach — two staggered courses of bags with collision
  const sandbagLine = (id: string, x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / 1.12);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const ry = Math.atan2(dx, dz) + Math.PI / 2;
    for (let course = 0; course < 2; course++) {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5 + (course ? 0.5 : 0)) / n;
        if (t > 1) continue;
        const bx = x0 + dx * len * t;
        const bz = z0 + dz * len * t;
        gw.box(1.08, 0.26, 0.52, 0x8a7d5c, bx, gw.gy(bx, bz) + 0.13 + course * 0.27, bz, ry, 1);
      }
    }
    gw.collider((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.3, Math.abs(z1 - z0) / 2 + 0.3);
    gw.feature(id, 'ridge', 'sandbag_line', (x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.3, Math.abs(z1 - z0) / 2 + 0.3, 'Two-course sandbag line.');
  };
  sandbagLine('ridge_sandbags_a', -556, -198, -544, -198);
  sandbagLine('ridge_sandbags_b', -496, -200, -496, -192);
  // ── greeble: the bunker line is stocked — a crate and ammo boxes
  // ride the bags (the line's collider already covers the spot)
  const sbY = gw.gy(-550, -198);
  gw.box(0.82, 0.82, 0.82, 0x6e5a3e, -550, sbY + 1.06, -198, 0.12);
  gw.box(0.52, 0.3, 0.36, 0x4a5548, -548.4, sbY + 0.8, -198, -0.08);
  gw.box(0.52, 0.3, 0.36, 0x5a6656, -547.6, sbY + 0.8, -197.8, 0.15);
  // ── greeble: patch-and-wear on the helipad slab — dark asphalt
  // repairs laid between slab and paint
  for (const [px, pz, pr] of [[pad.x - 4, pad.z - 3, 0.2], [pad.x + 3.5, pad.z + 4, -0.15], [pad.x + 5, pad.z - 4.5, 0.4], [pad.x - 5.5, pad.z + 2.5, -0.3]] as [number, number, number][]) {
    gw.box(2.3, 0.015, 1.7, 0x33373b, px, gy + 0.095, pz, pr, 1);
  }
  gw.feature('ridge_pad_wear', 'ridge', 'greeble', pad.x, pad.z, 6.5, 6.5, 'Greeble: asphalt patch repairs worn into the helipad slab.');

  // rock revetment heaped behind the bunker's north and west faces
  const rock = (x: number, z: number, w: number, h: number, d: number, ry: number): void => {
    gw.box(w, h, d, 0x6a6d70, x, gw.gy(x, z) + h / 2 - 0.2, z, ry, 1);
    gw.collider(x, z, w / 2, d / 2);
  };
  rock(-554, -217.5, 5.5, 2.6, 2.2, 0.15);
  rock(-547, -218.5, 6.5, 3.1, 2.4, -0.1);
  rock(-540, -217.5, 5, 2.3, 2, 0.3);
  rock(-557.5, -210, 2.2, 2.8, 6, 0.1);
  rock(-557.5, -203, 2, 2.1, 4.5, -0.2);
  gw.feature('ridge_revetment', 'ridge', 'revetment', -548, -214, 11, 6, 'Rock revetment against the bunker\'s north and west faces — the portal headhouse\'s earthwork.');

  // the 6x6 hardstand east of the ops canopy
  gw.box(12, 0.07, 10, 0x3f444a, -479, gw.gy(-479, -169) + 0.035, -169, 0, 0.96);
  gw.feature('ridge_hardstand', 'ridge', 'hardstand', -479, -169, 6, 5, 'Graded hardstand for the heavy 6x6 reserve beside the ops shelter.');
}

function citadelGround(gw: GroundWorks): void {
  // ── the container fortress: three tiers in a U over the courtyard
  // back row (along x at z=-268) + west/east rows (along z)
  gw.containerUnit(222, -268, 0, false, 0);
  gw.containerUnit(234.5, -268, 0, false, 1);
  gw.containerUnit(247, -268, 0, false, 2);
  gw.containerUnit(218, -256, 0, true, 3);
  gw.containerUnit(218, -243.5, 0, true, 4);
  gw.containerUnit(252, -256, 0, true, 5);
  gw.containerUnit(252, -243.5, 0, true, 0);
  gw.containerUnit(228.25, -268, 1, false, 2);
  gw.containerUnit(240.75, -268, 1, false, 4);
  gw.containerUnit(218, -249.75, 1, true, 1);
  gw.containerUnit(252, -256, 1, true, 3);
  gw.containerUnit(234.5, -268, 2, false, 5);
  gw.feature('citadel_fortress_t1', 'citadel', 'container_fortress', 234.5, -253.3, 18.7, 15.9, 'Fortress ground tier: 7 units in a U — back row + two side rows.');
  gw.feature('citadel_fortress_t2', 'citadel', 'container_fortress', 235, -252.9, 18.2, 9.2, 'Fortress second tier: 4 units, offset half a bay over the first.');
  gw.feature('citadel_fortress_t3', 'citadel', 'container_fortress', 234.5, -268, 6.1, 1.3, 'Fortress third tier: the crown unit over the back row.');

  // ── the toll gantry between the gate towers
  const gy = gw.gy(268, -284);
  gw.box(21, 0.55, 0.45, STEEL_DARK, 268, gy + 5.35, -284);
  const sign = decalPlane('CONVOY CITADEL', 8, 'rgba(232,200,74,0.95)', 44);
  sign.rotation.y = Math.PI; // faces the northbound approach
  sign.position.set(268, gy + 4.5, -284.3);
  gw.group.add(sign);
  for (const sx of [-1, 1]) {
    const arm = gw.box(4.4, 0.17, 0.17, 0xc23b2a, 268 + sx * 6.4, gy + 1.8, -284);
    arm.rotation.z = sx * -0.28;
    const tip = gw.box(1.1, 0.17, 0.17, 0xe8e4da, 268 + sx * 4.4, gy + 1.28, -284);
    tip.rotation.z = sx * -0.28;
  }
  gw.feature('citadel_gantry', 'citadel', 'gate_gantry', 268, -284, 10.5, 0.6, 'Gantry beam + striped barrier arms spanning the causeway between the gate towers.');

  // ── the diesel refinery in the yard's east
  const ry = gw.gy(306, -192);
  gw.box(17, 0.12, 14, CONCRETE, 306, ry + 0.06, -192, 0, 0.95);
  for (const tz of [-196, -188]) {
    gw.cyl(2.1, 2.1, 6.2, 0xb9bdc0, 300, ry + 3.1, tz, 0, 0, 18);
    gw.cyl(0.3, 2.1, 0.9, 0x9aa0a4, 300, ry + 6.65, tz, 0, 0, 18);
    gw.collider(300, tz, 2.25, 2.25);
  }
  gw.cyl(1.5, 1.5, 6, 0x8a4a3a, 311, ry + 1.9, -184, 0, Math.PI / 2, 16);
  gw.box(0.5, 0.9, 2.2, STEEL_DARK, 308.5, ry + 0.45, -184);
  gw.box(0.5, 0.9, 2.2, STEEL_DARK, 313.5, ry + 0.45, -184);
  gw.collider(311, -184, 3.2, 1.65);
  // cracking tower + platforms + the pipe run from the tanks
  gw.box(2.4, 11, 2.4, STEEL, 313, ry + 5.5, -198);
  gw.box(3.1, 0.16, 3.1, STEEL_DARK, 313, ry + 4.2, -198);
  gw.box(3.1, 0.16, 3.1, STEEL_DARK, 313, ry + 7.6, -198);
  gw.collider(313, -198, 1.5, 1.5);
  gw.cyl(0.09, 0.09, 11, STEEL_DARK, 303, ry + 2.2, -194, 0, Math.PI / 2, 8);
  gw.cyl(0.09, 0.09, 11, STEEL_DARK, 303, ry + 2.55, -194, 0, Math.PI / 2, 8);
  gw.feature('citadel_refinery', 'citadel', 'refinery', 306, -192, 9, 8.5, 'Diesel refinery: two vertical tanks, a horizontal separator, cracking tower, pipe run.');

  // ── yard floodlights (props — the sun does the work)
  for (const [fx, fz, fid] of [[228, -186, 'citadel_floodlight_a'], [314, -206, 'citadel_floodlight_b']] as [number, number, string][]) {
    const fy = gw.gy(fx, fz);
    gw.cyl(0.09, 0.12, 7, STEEL_DARK, fx, fy + 3.5, fz);
    gw.box(1.1, 0.28, 0.34, STEEL_DARK, fx, fy + 7.05, fz);
    gw.box(0.7, 0.5, 0.7, STEEL_DARK, fx, fy + 0.25, fz);
    gw.collider(fx, fz, 0.36, 0.36);
    gw.feature(fid, 'citadel', 'floodlight', fx, fz, 0.6, 0.6, 'Yard floodlight pole (prop).');
  }

  // ── greeble: floodlight fixtures ride the fortress crown,
  // aimed over the courtyard (emissive faces only, rooftop — no
  // colliders up there)
  const crownY = gw.gy(234.5, -268) + 3 * 2.6;
  for (const fx of [229.5, 239.5]) {
    gw.box(0.08, 0.5, 0.08, STEEL_DARK, fx, crownY + 0.25, -267.2);
    gw.box(0.62, 0.26, 0.3, STEEL_DARK, fx, crownY + 0.6, -267.2);
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.2, roughness: 0.6 }),
    );
    face.position.set(fx, crownY + 0.6, -267.03);
    face.name = 'crown_floodlight';
    gw.group.add(face);
  }

  // ── greeble: the freight yard works — drum cluster, pallet
  // stacks and a tire pile on the apron east of the truck hall,
  // clear of the warehouse stations and the hall's drive-in mouth
  const drumAt = (x: number, z: number, c: number): void => {
    gw.cyl(0.31, 0.31, 0.92, c, x, gw.gy(x, z) + 0.46, z, 0, 0, 12);
  };
  drumAt(287.4, -188.4, 0x51606e);
  drumAt(288.3, -187.8, 0x8a4a3a);
  drumAt(287.8, -189.2, 0x424c52);
  drumAt(288.6, -188.9, 0x746a52);
  gw.collider(288, -188.6, 0.85, 0.85);
  for (let p = 0; p < 3; p++) gw.box(1.2, 0.12, 1.0, 0x77644a, 283, gw.gy(283, -200) + 0.06 + p * 0.13, -200, p * 0.06);
  gw.box(0.85, 0.85, 0.85, 0x6e5a3e, 283, gw.gy(283, -200) + 0.84, -200, 0.1);
  gw.collider(283, -200, 0.7, 0.6);
  for (let t = 0; t < 3; t++) {
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.13, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95 }),
    );
    tire.rotation.x = Math.PI / 2;
    tire.position.set(292, gw.gy(292, -196) + 0.14 + t * 0.26, -196);
    tire.castShadow = true;
    gw.group.add(tire);
  }
  gw.collider(292, -196, 0.45, 0.45);
  gw.feature('citadel_yard_clutter', 'citadel', 'greeble', 287.5, -194, 6, 7.5, 'Greeble: freight-yard working clutter — drum cluster, pallet stack, tire pile east of the truck hall.');

  // ── greeble: the refinery's drum yard on its south apron
  drumAt(300, -180, 0x8a4a3a);
  drumAt(300.8, -179.3, 0x51606e);
  drumAt(301.4, -180.2, 0x424c52);
  gw.collider(300.7, -179.8, 0.95, 0.7);
  for (let p = 0; p < 2; p++) gw.box(1.2, 0.12, 1.0, 0x77644a, 310, gw.gy(310, -179) + 0.06 + p * 0.13, -179, -p * 0.05);
  gw.box(0.8, 0.6, 0.8, 0x63512f, 310, gw.gy(310, -179) + 0.56, -179);
  gw.collider(310, -179, 0.7, 0.6);
  gw.feature('citadel_yard_refinery_drums', 'citadel', 'greeble', 305, -180, 6.5, 1.8, 'Greeble: refinery drum yard + pallet stack on the south apron.');
}

function refugeGround(gw: GroundWorks): void {
  // the palisade ring, inset from the pad edge — W gate where the
  // inland spur terminates, E gate facing the NC-12 corridor
  gw.palisadeRun('x', -50, -86, 26, [], -1);
  gw.palisadeRun('x', 30, -86, 26, [], 1);
  gw.palisadeRun('z', -86, -50, 30, [[-44.5, -39.5]], -1);
  gw.palisadeRun('z', 26, -50, 30, [[-12.5, -7.5]], 1);
  // gate frames: taller posts + a lintel at each opening
  for (const [gx, gz, alongZ] of [[-86, -42, true], [26, -10, true]] as [number, number, boolean][]) {
    void alongZ;
    const gy = gw.gy(gx, gz);
    gw.box(0.26, 3.5, 0.26, TIMBER_DARK, gx, gy + 1.75, gz - 2.6);
    gw.box(0.26, 3.5, 0.26, TIMBER_DARK, gx, gy + 1.75, gz + 2.6);
    gw.box(0.26, 0.3, 5.8, TIMBER_DARK, gx, gy + 3.4, gz);
    gw.collider(gx, gz - 2.6, 0.2, 0.2);
    gw.collider(gx, gz + 2.6, 0.2, 0.2);
  }
  gw.feature('refuge_palisade_n', 'refuge', 'palisade', -30, -50, 56, 0.4, 'Palisade north run.');
  gw.feature('refuge_palisade_s', 'refuge', 'palisade', -30, 30, 56, 0.4, 'Palisade south run.');
  gw.feature('refuge_palisade_w', 'refuge', 'palisade', -86, -10, 0.4, 40, 'Palisade west run — gate where the inland spur terminates.');
  gw.feature('refuge_palisade_e', 'refuge', 'palisade', 26, -10, 0.4, 40, 'Palisade east run — gate facing NC-12.');

  // ── greeble: fighting platforms inside the north run (deck on
  // posts at rail height, a crate staged on each, ladder rails up
  // the inside face) + lanterns on both gate frames
  for (const px of [-60, 5]) {
    const py = gw.gy(px, -49.2);
    for (const [ox, oz] of [[-1.55, -0.55], [1.55, -0.55], [-1.55, 0.55], [1.55, 0.55]] as [number, number][]) {
      gw.box(0.18, 1.95, 0.18, TIMBER_DARK, px + ox, py + 0.97, -49.2 + oz);
      gw.collider(px + ox, -49.2 + oz, 0.15, 0.15);
    }
    gw.box(3.4, 0.14, 1.3, TIMBER, px, py + 1.97, -49.2);
    gw.box(0.7, 0.7, 0.7, 0x6e5a3e, px - 1.1, py + 2.39, -49.2);
    gw.box(0.09, 1.9, 0.09, TIMBER_DARK, px + 0.75, py + 0.95, -48.4);
    gw.box(0.09, 1.9, 0.09, TIMBER_DARK, px + 1.25, py + 0.95, -48.4);
    for (let r = 0; r < 4; r++) gw.box(0.55, 0.07, 0.07, TIMBER, px + 1.0, py + 0.35 + r * 0.45, -48.4);
  }
  gw.feature('refuge_palisade_platforms', 'refuge', 'greeble', -27.5, -49.2, 36, 1.1, 'Greeble: two fighting platforms inside the north palisade — decks, staged crates, ladders.');
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0x38301e, emissive: 0xffca7a, emissiveIntensity: 1.15, roughness: 0.6 });
  for (const [gx, gz] of [[-86, -42], [26, -10]] as [number, number][]) {
    const gy2 = gw.gy(gx, gz);
    for (const s of [-1, 1]) {
      const lampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lanternMat);
      lampMesh.position.set(gx, gy2 + 3.05, gz + s * 2.6);
      lampMesh.name = 'gate_lantern';
      gw.group.add(lampMesh);
      gw.box(0.24, 0.06, 0.24, STEEL_DARK, gx, gy2 + 3.22, gz + s * 2.6);
    }
  }

  // the water filtration plant in the ring's NE corner
  const fy = gw.gy(14, -44);
  gw.box(10, 0.1, 8, CONCRETE, 14, fy + 0.05, -44, 0, 0.95);
  for (const tz of [-46.5, -41.5]) {
    gw.cyl(1.3, 1.3, 3.4, 0xb9bdc0, 11, fy + 1.7, tz, 0, 0, 16);
    gw.collider(11, tz, 1.45, 1.45);
  }
  gw.cyl(0.12, 0.12, 5, STEEL_DARK, 11, fy + 1.2, -44, Math.PI / 2, 0, 8);
  gw.box(1, 0.9, 1, STEEL, 17.5, fy + 0.45, -43);
  gw.box(1, 0.9, 1, STEEL_DARK, 17.5, fy + 1.35, -43);
  gw.collider(17.5, -43, 0.55, 0.55);
  gw.feature('refuge_filtration', 'refuge', 'filtration', 14, -44, 5.5, 4.5, 'Water filtration: twin tanks, cross pipe, pump crates.');
}

function pierGround(gw: GroundWorks): void {
  // workboat slips: finger decks off the boardwalk's harbor side,
  // piling pairs to the bed, cleats along the edges (geometry only —
  // the walkable waterline structure is the boardwalk kit itself)
  const slip = (id: string, cx: number, cz: number): void => {
    gw.box(2.0, 0.16, 9, 0x8a7a66, cx, 2.2, cz, 0, 1);
    gw.box(0.24, 0.2, 8.8, TIMBER_DARK, cx - 0.85, 2.05, cz);
    gw.box(0.24, 0.2, 8.8, TIMBER_DARK, cx + 0.85, 2.05, cz);
    for (const pz of [cz - 3.8, cz, cz + 3.8]) {
      for (const px of [cx - 0.8, cx + 0.8]) {
        const bed = gw.gy(px, pz);
        gw.cyl(0.13, 0.15, 2.2 - bed + 0.3, TIMBER_DARK, px, (2.2 + bed) / 2, pz, 0, 0, 8);
        gw.collider(px, pz, 0.2, 0.2);
      }
    }
    for (const pz of [cz - 2.5, cz + 0.5, cz + 3.2]) {
      gw.box(0.34, 0.1, 0.14, STEEL_DARK, cx - 0.8, 2.34, pz);
      gw.box(0.34, 0.1, 0.14, STEEL_DARK, cx + 0.8, 2.34, pz);
    }
    // ── greeble: tire fenders hang on the outer piles at the
    // waterline, mooring lines run from the cleats down to the
    // water (geometry only — a boat earns the walkable part)
    const fenderMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95 });
    for (const pz of [cz - 3.8, cz + 0.2, cz + 3.8]) {
      for (const px of [cx - 0.95, cx + 0.95]) {
        const fender = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16), fenderMat);
        fender.rotation.y = Math.PI / 2;
        fender.position.set(px, 1.5, pz);
        fender.name = 'slip_fender';
        gw.group.add(fender);
      }
    }
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x8a7d5c, roughness: 1 });
    for (const [px, pz, tilt] of [[cx - 0.8, cz - 3.2, 0.6], [cx + 0.8, cz + 3.2, -0.6]] as [number, number, number][]) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 5), lineMat);
      line.position.set(px + tilt * 0.8, 1.55, pz);
      line.rotation.z = tilt;
      gw.group.add(line);
    }
    gw.feature(id, 'pier_hq', 'boat_slip', cx, cz, 1, 4.5, 'Workboat slip: finger deck on piling pairs, cleated both sides.');
  };
  slip('pier_slip_a', -530, 228.5);
  slip('pier_slip_b', -541.5, 216);
  gw.feature('pier_slip_dressing', 'pier_hq', 'boat_slip', -535.75, 222.25, 6.75, 8.75, 'Greeble: tire fenders at the waterline + mooring lines on both slips.');

  // the landward palisade arc — two runs with the road gap between
  gw.palisadeRun('z', -444, 220, 248, [], -1);
  gw.palisadeRun('z', -444, 196, 202, [], -1);
  gw.feature('pier_palisade', 'pier_hq', 'palisade', -444, 222, 0.4, 26, 'Landward palisade arc, gap at the west-fork road end.');
}

// ------------------------------------------------------------ the builders

const BUILDERS: Record<string, (cx: number, cz: number, rot: 0 | 1 | 2 | 3, gy: GroundY) => KitResult> = {
  ridge_bunker: buildRidgeBunker,
  ridge_tower: (cx, cz, r, gy) => buildWatchtower('ridge_tower', cx, cz, r, gy, { label: 'ridge watchtower', lootKind: 'camp' }),
  ridge_ops: (cx, cz, r, gy) => buildCanopyShelter('ridge_ops', cx, cz, r, gy, 14, 10, 4.4, { label: 'ops shelter', lootKind: 'camp', dress: 'ops' }),
  citadel_gate_w: (cx, cz, r, gy) => buildGateTower('citadel_gate_w', cx, cz, r, gy, 'E'),
  citadel_gate_e: (cx, cz, r, gy) => buildGateTower('citadel_gate_e', cx, cz, r, gy, 'W'),
  citadel_container_office: (cx, cz, r, gy) => buildContainerRoom('citadel_container_office', cx, cz, r, gy, 0x7a4a38, { npc: true, label: 'toll office', lootKind: 'suburban', dress: 'office' }),
  citadel_container_store: (cx, cz, r, gy) => buildContainerRoom('citadel_container_store', cx, cz, r, gy, 0x44586a, { label: 'freight stores', lootKind: 'suburban', dress: 'store' }),
  citadel_truck_hall: buildTruckHall,
  lighthouse_radar: buildRadarTower,
  lighthouse_lab_a: (cx, cz, r, gy) => buildContainerRoom('lighthouse_lab_a', cx, cz, r, gy, 0x5a6e64, { npc: true, label: 'signal lab', lootKind: 'suburban', dress: 'lab' }),
  lighthouse_lab_b: (cx, cz, r, gy) => buildContainerRoom('lighthouse_lab_b', cx, cz, r, gy, 0x746a52, { label: 'instrument lab', lootKind: 'suburban', dress: 'lab' }),
  lighthouse_shed: (cx, cz, r, gy) => buildCanopyShelter('lighthouse_shed', cx, cz, r, gy, 9, 5, 3.0, { label: 'shore shed', lootKind: 'suburban', backWall: true, dress: 'shore' }),
  refuge_chapel: buildChapel,
  refuge_greenhouse_a: (cx, cz, r, gy) => buildGreenhouse('refuge_greenhouse_a', cx, cz, r, gy),
  refuge_greenhouse_b: (cx, cz, r, gy) => buildGreenhouse('refuge_greenhouse_b', cx, cz, r, gy),
  pier_icehouse: buildIcehouse,
  pier_shed: (cx, cz, r, gy) => buildCanopyShelter('pier_shed', cx, cz, r, gy, 10, 6, 3.0, { label: 'gear shed', lootKind: 'camp', backWall: true, dress: 'gear' }),
  pier_boardwalk: buildBoardwalk,
  tern_cottage_a: (cx, cz, r, gy) => buildCottage('tern_cottage_a', cx, cz, r, gy, COTTAGE_COAT[0]),
  tern_cottage_b: (cx, cz, r, gy) => buildCottage('tern_cottage_b', cx, cz, r, gy, COTTAGE_COAT[1]),
  tern_cottage_c: (cx, cz, r, gy) => buildCottage('tern_cottage_c', cx, cz, r, gy, COTTAGE_COAT[2]),
  tern_store: buildStore,
  tern_garage: buildMarineGarage,
  tern_fuel_dock: buildFuelDock,
};

/** Build every stronghold: the gated kits + the ground works.
 *  Pure construction — the caller (World) adds the groups and merges
 *  colliders/floors/containers, exactly like the airbase. */
export function buildSectors(groundY: GroundY): SectorsBuild {
  const kits = SECTOR_BUILDINGS.map((spot: SectorBuildingSpot) => {
    const build = BUILDERS[spot.id];
    if (!build) throw new Error(`no stronghold builder for ${spot.id}`);
    const [cx, cz] = resolveSpotWorld(spot);
    return build(cx, cz, spot.rot, groundY);
  });
  const gw = new GroundWorks(groundY);
  ridgeGround(gw);
  citadelGround(gw);
  refugeGround(gw);
  pierGround(gw);
  gw.bakePalisadeLogs();
  return { kits, groundGroup: gw.group, propColliders: gw.colliders, features: gw.features };
}
