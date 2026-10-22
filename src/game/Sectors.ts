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
  shell: number, opts: { npc?: boolean; label: string; lootKind: 'camp' | 'suburban' },
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
  w: number, d: number, clearH: number, opts: { label: string; lootKind: 'camp' | 'suburban'; backWall?: boolean },
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
  // the crate stands in the corner AWAY from the door leaf's rest
  k.furnish({ kind: 'crate', lx: doorFace === 'E' ? -1.2 : 1.25, lz: doorFace === 'E' ? -1.2 : 1.25, id: `${id}_crate`, loot: FURNITURE_LOOT.crate.suburban, label: 'Search gate crate' });
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
    gw.feature(id, 'pier_hq', 'boat_slip', cx, cz, 1, 4.5, 'Workboat slip: finger deck on piling pairs, cleated both sides.');
  };
  slip('pier_slip_a', -530, 228.5);
  slip('pier_slip_b', -541.5, 216);

  // the landward palisade arc — two runs with the road gap between
  gw.palisadeRun('z', -444, 220, 248, [], -1);
  gw.palisadeRun('z', -444, 196, 202, [], -1);
  gw.feature('pier_palisade', 'pier_hq', 'palisade', -444, 222, 0.4, 26, 'Landward palisade arc, gap at the west-fork road end.');
}

// ------------------------------------------------------------ the builders

const BUILDERS: Record<string, (cx: number, cz: number, rot: 0 | 1 | 2 | 3, gy: GroundY) => KitResult> = {
  ridge_bunker: buildRidgeBunker,
  ridge_tower: (cx, cz, r, gy) => buildWatchtower('ridge_tower', cx, cz, r, gy, { label: 'ridge watchtower', lootKind: 'camp' }),
  ridge_ops: (cx, cz, r, gy) => buildCanopyShelter('ridge_ops', cx, cz, r, gy, 14, 10, 4.4, { label: 'ops shelter', lootKind: 'camp' }),
  citadel_gate_w: (cx, cz, r, gy) => buildGateTower('citadel_gate_w', cx, cz, r, gy, 'E'),
  citadel_gate_e: (cx, cz, r, gy) => buildGateTower('citadel_gate_e', cx, cz, r, gy, 'W'),
  citadel_container_office: (cx, cz, r, gy) => buildContainerRoom('citadel_container_office', cx, cz, r, gy, 0x7a4a38, { npc: true, label: 'toll office', lootKind: 'suburban' }),
  citadel_container_store: (cx, cz, r, gy) => buildContainerRoom('citadel_container_store', cx, cz, r, gy, 0x44586a, { label: 'freight stores', lootKind: 'suburban' }),
  citadel_truck_hall: buildTruckHall,
  lighthouse_radar: buildRadarTower,
  lighthouse_lab_a: (cx, cz, r, gy) => buildContainerRoom('lighthouse_lab_a', cx, cz, r, gy, 0x5a6e64, { npc: true, label: 'signal lab', lootKind: 'suburban' }),
  lighthouse_lab_b: (cx, cz, r, gy) => buildContainerRoom('lighthouse_lab_b', cx, cz, r, gy, 0x746a52, { label: 'instrument lab', lootKind: 'suburban' }),
  lighthouse_shed: (cx, cz, r, gy) => buildCanopyShelter('lighthouse_shed', cx, cz, r, gy, 9, 5, 3.0, { label: 'shore shed', lootKind: 'suburban', backWall: true }),
  refuge_chapel: buildChapel,
  refuge_greenhouse_a: (cx, cz, r, gy) => buildGreenhouse('refuge_greenhouse_a', cx, cz, r, gy),
  refuge_greenhouse_b: (cx, cz, r, gy) => buildGreenhouse('refuge_greenhouse_b', cx, cz, r, gy),
  pier_icehouse: buildIcehouse,
  pier_shed: (cx, cz, r, gy) => buildCanopyShelter('pier_shed', cx, cz, r, gy, 10, 6, 3.0, { label: 'gear shed', lootKind: 'camp', backWall: true }),
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
