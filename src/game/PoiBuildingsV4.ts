// PoiBuildingsV4.ts — POI-scale buildings on the BUILDING_STRATEGY kit,
// replacing the legacy PoiBuildings.ts builders in the map phase. Same
// lots, same container ids, same loot tables — every shell is now kit
// pieces the QA gate audits. The gas station is the full redo: canopy +
// pump islands, an enterable store, and a garage bay.
//
// KEEPERS: the town warehouse and Jonah's barn are NOT rebuilt — Ian's
// order. They are built by the frozen legacy segment builder (class B)
// at the bottom of this file, byte-for-byte the old construction.

import * as THREE from 'three';
import { FURNITURE_LOOT, type HuskLootEntry } from '../data/items';
import { FURNITURE_HALF, FURNITURE_LABEL, type FurnitureKind } from './furnitureMeshes';
import { type Collider, type FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import { Kit, KIT, type KitBuilding } from './kit';
import { decalPlane } from './modelKit';

export interface PoiBuildResult {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: Collider; group: THREE.Group }[];
  /** Kit buildings for the QA gate (keepers are legacy — not included). */
  buildings: KitBuilding[];
}

export interface PoiFootprint {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
}

type GroundY = (x: number, z: number) => number;

// ------------------------------------------------------------- loot tables
// Verbatim from the legacy builders — loot identity does not change.

const GROCERY: HuskLootEntry[] = [
  { id: 'canned_food', min: 1, max: 3, chance: 0.85 },
  { id: 'water_bottle', min: 1, max: 2, chance: 0.6 },
  { id: 'cooked_meat', min: 1, max: 1, chance: 0.3 },
];
const PHARMACY: HuskLootEntry[] = [
  { id: 'bandage', min: 1, max: 2, chance: 0.65 },
  { id: 'medkit', min: 1, max: 1, chance: 0.22 },
  { id: 'cloth', min: 1, max: 2, chance: 0.4 },
];
const PARTS: HuskLootEntry[] = [
  { id: 'tire', min: 1, max: 1, chance: 0.5 },
  { id: 'engine_part', min: 1, max: 1, chance: 0.4 },
  { id: 'car_battery', min: 1, max: 1, chance: 0.45 },
  { id: 'armor_plate', min: 1, max: 1, chance: 0.3 },
  { id: 'scrap', min: 2, max: 4, chance: 0.85 },
];
const BATTERIES: HuskLootEntry[] = [
  { id: 'car_battery', min: 1, max: 2, chance: 0.7 },
  { id: 'wire', min: 1, max: 2, chance: 0.5 },
  { id: 'scrap', min: 1, max: 2, chance: 0.6 },
];

function kitAt(id: string, cx: number, cz: number, w: number, d: number, stories: number, groundY: GroundY): Kit {
  const corners: [number, number][] = [
    [cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2],
    [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2],
  ];
  const base = Math.min(...corners.map(([x, z]) => groundY(x, z))) - 0.08;
  return new Kit(id, cx, cz, 0, base, w, d, stories);
}

// ------------------------------------------------------------------ the mall

function stripMall(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('mall', cx, cz, 16, 7, 1, groundY);
  const col = 0x9a8f80;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 3.5 - 0.15, from: -8, to: 8, story: 0, color: col, exterior: true,
    openings: [
      { at: -5.2, w: 1.6, type: 'slider', h: 2.1 },
      { at: -7.0, w: 1.8, type: 'window', sill: 0.55, head: 2.45 },
      { at: 0, w: 3.4, type: 'window', sill: 0.55, head: 2.45 },
      { at: 5.2, w: 3.4, type: 'window', sill: 0.55, head: 2.45 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [
      { face: 'N', at: -4 }, { face: 'N', at: 0 }, { face: 'N', at: 4 },
      { face: 'E', at: 0 }, { face: 'W', at: 0 },
    ],
  });
  k.roofFlat(0x5a5a5e, col);
  // signage band + lit strip (detail)
  k.box(15.5, 0.7, 0.1, 0x2e4a6e, 0, 2.72, 3.56);
  const strip = k.box(15.0, 0.1, 0.06, 0xe8b34b, 0, 2.32, 3.57);
  (strip.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xe8b34b);
  (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
  const sign = decalPlane('MART · HARDWARE · CAFE', 13, 'rgba(232,230,223,0.95)', 40);
  sign.position.set(0, 2.72, 3.62);
  k.addDetail(sign);
  k.furnish({ kind: 'crate', lx: -5, lz: -2, id: 'mall_crate_1', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'crate', lx: 5, lz: -2, id: 'mall_crate_2', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'toolbox', lx: 0, lz: -2, id: 'mall_toolbox', loot: FURNITURE_LOOT.toolbox.suburban });
  k.roomPoint(-5.2, 0.5, 'west shop');
  k.roomPoint(0, 0.5, 'middle shop');
  k.roomPoint(5.2, 0.5, 'east shop');
  return k;
}

// ---------------------------------------------------------- convenience store

function convenienceStore(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('store', cx, cz, 12, 10, 1, groundY);
  const col = 0xdcd8d0;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 5 - 0.15, from: -6, to: 6, story: 0, color: col, exterior: true,
    openings: [
      { at: 0, w: 1.4, type: 'slider', h: 2.1 },
      { at: -3.4, w: 3.6, type: 'window', sill: 0.55, head: 2.45 },
      { at: 3.4, w: 3.6, type: 'window', sill: 0.55, head: 2.45 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [{ face: 'N', at: -3 }, { face: 'N', at: 3 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.roofFlat(0x6a6a6e, col);
  k.box(11.6, 0.85, 0.12, 0x2e7a6e, 0, 2.72, 5.06);
  const strip = k.box(11.2, 0.09, 0.06, 0xf2e3b3, 0, 2.22, 5.07);
  (strip.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xf2e3b3);
  (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
  const openSign = k.box(0.72, 0.3, 0.05, 0xffb35c, 1.35, 1.7, 5.04);
  (openSign.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff9a3c);
  (openSign.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  const sign = decalPlane('KWIK MART', 8, 'rgba(240,238,230,0.95)', 52);
  sign.position.set(0, 2.72, 5.13);
  k.addDetail(sign);
  k.box(1.5, 0.7, 1.5, 0x9aa0a4, -3, 3.55, -2); // rooftop AC
  k.furnish({ kind: 'bookshelf', lx: -3.6, lz: -3.9, id: 'store_shelf_1', loot: GROCERY, label: 'Search grocery shelf' });
  k.furnish({ kind: 'bookshelf', lx: 0, lz: -3.9, id: 'store_shelf_2', loot: GROCERY, label: 'Search grocery shelf' });
  k.furnish({ kind: 'bookshelf', lx: 0, lz: 0.4, id: 'store_aisle', loot: GROCERY, label: 'Search grocery shelf' });
  k.furnish({ kind: 'cabinets', lx: 3.6, lz: -3.9, id: 'store_pharmacy', loot: PHARMACY, label: 'Search pharmacy shelf' });
  k.furnish({ kind: 'fridge', lx: -5.0, lz: 1.6, id: 'store_fridge', loot: FURNITURE_LOOT.fridge.suburban });
  k.furnish({ kind: 'cooler', lx: 5.0, lz: 3.4, id: 'store_cooler', loot: FURNITURE_LOOT.cooler.suburban });
  k.furnish({ kind: 'crate', lx: -5.0, lz: -3.6, id: 'store_stock', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(0, 2.5, 'store floor');
  k.roomPoint(-3, 0.5, 'store west aisle');
  return k;
}

// --------------------------------------------------------------- auto garage

function autoGarage(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('autogarage', cx, cz, 15, 12, 1, groundY);
  const col = 0x7a4438;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 6 - 0.15, from: -7.5, to: 7.5, story: 0, color: col, exterior: true,
    openings: [
      { at: -3.6, w: 3.4, type: 'bay', h: 3.0 },
      { at: 3.6, w: 3.4, type: 'bay', h: 3.0, shut: true },
      { at: 0, w: 0.95, type: 'door', h: 2.1, leafColor: 0x4a3a30 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [
      { face: 'E', at: -2.6, w: 1.4, sill: 2.0, head: 2.9 }, { face: 'E', at: 2.6, w: 1.4, sill: 2.0, head: 2.9 },
      { face: 'W', at: -2.6, w: 1.4, sill: 2.0, head: 2.9 }, { face: 'W', at: 2.6, w: 1.4, sill: 2.0, head: 2.9 },
      { face: 'N', at: -4 }, { face: 'N', at: 4 },
    ],
  });
  k.roofGable(1.9, 0x8a5a40, col);
  // bay rails (detail)
  for (const bx of [-3.6, 3.6]) {
    for (const rx of [bx - 1.74, bx + 1.74]) {
      k.box(0.09, 3.05, 0.12, 0x3a3f45, rx, 1.55, 5.85);
    }
  }
  // workbench: visual + a cabinets-loot container (the repair economy hub)
  k.box(3.2, 0.85, 0.8, 0x5a4632, -4.4, 0.57, -5.3);
  k.furnish({
    kind: 'cabinets', lx: -4.4, lz: -5.3, id: 'garage_workbench',
    loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search workbench',
  });
  // tire stack (visual + obstacle collider, no loot — legacy parity)
  for (let i = 0; i < 3; i++) k.box(0.74, 0.26, 0.74, 0x1c1c1e, 6.2, 0.27 + i * 0.27, 3.4);
  k.obstacle(6.2, 3.4, 0.37, 0.37);
  k.furnish({ kind: 'bookshelf', lx: 0.5, lz: -5.2, id: 'garage_parts_shelf', loot: PARTS, label: 'Search parts shelf' });
  k.furnish({ kind: 'cabinets', lx: 6.5, lz: -0.6, id: 'garage_battery_rack', loot: BATTERIES, label: 'Search battery rack' });
  k.furnish({ kind: 'toolbox', lx: -6.4, lz: -4.6, id: 'garage_toolbox_1', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'toolbox', lx: 6.4, lz: -4.6, id: 'garage_toolbox_2', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'crate', lx: -6.4, lz: 3.6, id: 'garage_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'barrel', lx: -6.5, lz: 0.8, id: 'garage_barrel', loot: FURNITURE_LOOT.barrel.suburban });
  k.roomPoint(0, 0, 'garage floor');
  k.roomPoint(-3.6, 2.5, 'open bay');
  return k;
}

// -------------------------------------------------------------------- school

function school(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('school', cx, cz, 19, 10, 1, groundY);
  const col = 0xa8785a;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 5 - 0.15, from: -9.5, to: 9.5, story: 0, color: col, exterior: true,
    openings: [
      { at: -0.65, w: 0.95, type: 'door', h: 2.1, leafColor: 0x3a5a7a },
      { at: 0.65, w: 0.95, type: 'door', h: 2.1, leafColor: 0x3a5a7a, swing: 'R' },
      { at: -4.5, w: 1.6, type: 'window' }, { at: 4.5, w: 1.6, type: 'window' },
      { at: -7.5, w: 1.6, type: 'window' }, { at: 7.5, w: 1.6, type: 'window' },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [
      { face: 'N', at: -7 }, { face: 'N', at: -3.5 }, { face: 'N', at: 0 }, { face: 'N', at: 3.5 }, { face: 'N', at: 7 },
      { face: 'E', at: -2.5 }, { face: 'E', at: 2.5 }, { face: 'W', at: -2.5 }, { face: 'W', at: 2.5 },
    ],
  });
  k.roofFlat(0x5e5e62, col);
  // entrance portico on two posts + sign
  k.box(6, 0.25, 1.6, 0x8a6a4a, 0, 2.95, 5.7);
  k.post(-2.6, 6.3, -0.1, 2.85, 0xd8d0c0, 0.3);
  k.post(2.6, 6.3, -0.1, 2.85, 0xd8d0c0, 0.3);
  k.box(4.4, 0.6, 0.12, 0x3a5a7a, 0, 2.68, 5.06);
  const sign = decalPlane('ISLAND SCHOOL', 4.2, 'rgba(240,238,230,0.95)', 44);
  sign.position.set(0, 2.68, 5.13);
  k.addDetail(sign);
  k.furnish({ kind: 'bookshelf', lx: -7, lz: -3, id: 'school_shelf', loot: FURNITURE_LOOT.bookshelf.suburban });
  k.furnish({ kind: 'cabinets', lx: 7, lz: -3, id: 'school_cabinets', loot: FURNITURE_LOOT.cabinets.suburban });
  k.furnish({ kind: 'crate', lx: 0, lz: -3, id: 'school_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'cooler', lx: -7, lz: 3, id: 'school_cooler', loot: FURNITURE_LOOT.cooler.suburban });
  k.roomPoint(0, 0, 'school hall');
  k.roomPoint(-6, 2, 'west classroom');
  k.roomPoint(6, 2, 'east classroom');
  return k;
}

// ----------------------------------------------------------------- boathouse

function boathouse(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('boathouse', cx, cz, 10, 7, 1, groundY);
  const col = 0x5a6a72;
  k.foundation();
  k.floorSlab(0);
  k.perimeter({ story: 0, color: col, open: ['S'], windows: [{ face: 'E', at: 0 }, { face: 'W', at: 0 }] });
  k.post(-4.8, 3.3, -0.1, 3.0, 0x4a3826, 0.2);
  k.post(4.8, 3.3, -0.1, 3.0, 0x4a3826, 0.2);
  k.beam('x', 3.42, -5, 5, 3.0, 0x5a4632, 0.24);
  k.openEntrance('S', 0, 9);
  k.roofGable(1.2, 0x3a4a52, col);
  // dock planks out over the water
  for (let i = 0; i < 8; i++) {
    k.box(1.6, 0.1, 0.7, 0x6b4a2f, 0, 0.3, 4.3 + i * 0.78);
  }
  k.furnish({ kind: 'crate', lx: -3.5, lz: -2, id: 'dock_crate', loot: FURNITURE_LOOT.crate.camp });
  k.furnish({ kind: 'cooler', lx: 3.5, lz: -2, id: 'dock_cooler', loot: FURNITURE_LOOT.cooler.camp });
  k.furnish({
    kind: 'toolbox', lx: 2, lz: 1, id: 'dock_boat_tools',
    loot: [
      { id: 'scrap', min: 1, max: 3, chance: 0.8 },
      { id: 'wire', min: 1, max: 2, chance: 0.6 },
    ],
    label: 'Search dock box', searchTime: 2,
  });
  k.roomPoint(0, 0, 'boathouse');
  return k;
}

// --------------------------------------------------------------- gas station
// THE REDO: an enterable store with shelves + register, an attached
// garage bay, and a canopy on posts over two pump islands. Parts-cache
// loot stays (gas_kiosk_cabinets, the bay caches, c_parts_gas outside).

/** Real-world fuel-canopy clearance: ~4.7 m of open air above the pad
 *  (production stations run 14–16 ft; a semi stands ~4.1 m tall). The
 *  soffit is the canopy slab's underside in kit-local height. */
export const GAS_CANOPY_CLEARANCE_M = 4.7;
export const GAS_CANOPY_SOFFIT_LOCAL = KIT.FLOOR_LIFT + GAS_CANOPY_CLEARANCE_M;

function gasStation(cx: number, cz: number, groundY: GroundY): Kit[] {
  // --- the store + bay block (11x6), front faces the canopy (+Z)
  const store = kitAt('gas_store', cx, cz + 1, 11, 6, 1, groundY);
  const col = 0xa09a8e;
  store.foundation();
  store.floorSlab(0);
  store.wall({
    axis: 'x', at: 3 - 0.15, from: -5.5, to: 5.5, story: 0, color: col, exterior: true,
    openings: [
      { at: -2.2, w: 0.95, type: 'door', h: 2.1, leafColor: 0xb03a2e },
      // contemporary storefront glass: low-sill, full-height panes
      { at: -4.2, w: 2.0, type: 'window', sill: 0.3, head: 2.5 },
      { at: 0.3, w: 1.9, type: 'window', sill: 0.3, head: 2.5 },
      { at: 3.6, w: 3.2, type: 'bay', h: 2.9 },
    ],
  });
  store.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [{ face: 'N', at: -3.5 }, { face: 'N', at: 0 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  // divider: store west, bay east, staff door between
  store.divider({ axis: 'z', at: 1.6, from: -2.7, to: 2.7, color: col, doorAt: -0.5 });
  store.roofFlat(0x6a6a6e, col);
  const band = store.box(10.6, 0.6, 0.1, 0xb03a2e, 0, 2.62, 3.06);
  void band;
  const sign = decalPlane('GAS · MART', 7, 'rgba(245,242,235,0.97)', 54);
  sign.position.set(-1.5, 2.62, 3.12);
  store.addDetail(sign);
  // LED strip under the fascia band + bollards guarding the storefront
  const strip = store.box(10.6, 0.07, 0.06, 0xd6e6f2, 0, 2.28, 3.08);
  (strip.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xd6e6f2);
  (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.55;
  for (const bx of [-3.3, -1.1]) {
    store.box(0.16, 0.85, 0.16, 0xd8a022, bx, 0.45, 3.5);
    store.obstacle(bx, 3.5, 0.1, 0.1);
  }
  // store interior: shelves, the register counter, the legacy kiosk cabinets
  store.furnish({ kind: 'bookshelf', lx: -4.5, lz: -2.2, id: 'gas_shelf_1', loot: GROCERY, label: 'Search grocery shelf' });
  store.furnish({ kind: 'bookshelf', lx: -1.5, lz: -2.2, id: 'gas_shelf_2', loot: GROCERY, label: 'Search grocery shelf' });
  store.furnish({
    kind: 'cabinets', lx: -4.7, lz: 1.9, id: 'gas_register',
    loot: [
      { id: 'bandage', min: 1, max: 1, chance: 0.4 },
      { id: 'canned_food', min: 1, max: 2, chance: 0.5 },
      { id: 'scrap', min: 1, max: 2, chance: 0.4 },
    ],
    label: 'Search register',
  });
  store.furnish({ kind: 'cabinets', lx: 0.5, lz: -2.3, id: 'gas_kiosk_cabinets', loot: FURNITURE_LOOT.cabinets.suburban });
  // bay interior: toolbox + crate caches
  store.furnish({ kind: 'toolbox', lx: 4.6, lz: -2.2, id: 'gas_bay_toolbox', loot: FURNITURE_LOOT.toolbox.suburban });
  store.furnish({ kind: 'crate', lx: 4.8, lz: 2.2, id: 'gas_bay_crate', loot: FURNITURE_LOOT.crate.suburban });
  store.roomPoint(-3.2, 0, 'gas store');
  store.roomPoint(3.8, 0, 'garage bay');

  // --- the canopy (13x9): pad slab, four tall posts, raised roof slab.
  // Clearance is REAL (see GAS_CANOPY_CLEARANCE_M): a semi rolls through.
  const canopy = kitAt('gas_canopy', cx, cz + 9, 13, 9, 1, groundY);
  canopy.floorSlab(0);
  for (const [px, pz] of [[-5.5, -3.5], [5.5, -3.5], [-5.5, 3.5], [5.5, 3.5]] as [number, number][]) {
    canopy.post(px, pz, -0.1, GAS_CANOPY_SOFFIT_LOCAL, 0xd8d8d0, 0.38);
  }
  canopy.roofCanopy(0xe8e6df, 0xb03a2e, GAS_CANOPY_SOFFIT_LOCAL);
  canopy.openEntrance('S', 0, 12);
  // LED light band under the raised soffit: perimeter strip + flat
  // panels over the lanes (emissive — the station glows like a 2020s one)
  const ledY = GAS_CANOPY_SOFFIT_LOCAL - 0.05;
  const led = canopy.box(12.6, 0.05, 0.16, 0xcfe0ee, 0, ledY, 4.32);
  (led.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xcfe0ee);
  (led.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  canopy.box(12.6, 0.05, 0.16, 0xcfe0ee, 0, ledY, -4.32);
  canopy.box(0.16, 0.05, 8.6, 0xcfe0ee, -6.42, ledY, 0);
  canopy.box(0.16, 0.05, 8.6, 0xcfe0ee, 6.42, ledY, 0);
  for (const px of [-3.4, 0, 3.4]) canopy.box(2.0, 0.05, 0.7, 0xcfe0ee, px, ledY, 0);
  // pump island: curb, two MODERN dispensers (light body, glass screen
  // both faces, card reader, brand cap, nozzle holster + hose loop),
  // bollards on the island corners, the legacy pump loot
  canopy.box(7.5, 0.12, 1.1, 0x8a8578, 0, 0.2, 0);
  for (const px of [-3, 3]) {
    canopy.box(0.72, 1.35, 0.52, 0xdcd8d0, px, 0.82, 0);
    canopy.box(0.56, 0.5, 0.05, 0x11161c, px, 1.14, 0.27);
    canopy.box(0.56, 0.5, 0.05, 0x11161c, px, 1.14, -0.27);
    canopy.box(0.18, 0.3, 0.05, 0x2a3540, px + 0.17, 0.68, 0.27); // card reader
    canopy.box(0.3, 0.09, 0.34, 0xb03a2e, px, 1.56, 0); // brand cap
    canopy.box(0.1, 0.5, 0.14, 0x23272c, px - 0.42, 0.72, 0); // nozzle holster
    const hose = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.032, 8, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95 }),
    );
    hose.position.set(px - 0.44, 0.78, 0);
    hose.rotation.y = Math.PI / 2;
    hose.rotation.z = Math.PI;
    canopy.addDetail(hose);
    canopy.obstacle(px, 0, 0.36, 0.26);
  }
  for (const bx of [-3.8, 3.8]) {
    for (const bz of [-0.62, 0.62]) {
      canopy.box(0.16, 0.85, 0.16, 0xd8a022, bx, 0.55, bz);
      canopy.obstacle(bx, bz, 0.1, 0.1);
    }
  }
  canopy.container({
    lx: 0, lz: 0, id: 'gas_pump_loot',
    loot: [
      { id: 'fuel_can', min: 1, max: 2, chance: 0.6 },
      { id: 'scrap', min: 1, max: 2, chance: 0.5 },
    ],
    label: 'Search pump island', searchTime: 2.5,
  });
  // modern price totem at the pad corner: twin posts, tall dark panel,
  // FUEL header over a big price readout (flavor digits, pre-Static)
  canopy.post(5.5, 3.9, -0.1, 4.3, 0x3a3f45, 0.16);
  canopy.post(6.3, 3.9, -0.1, 4.3, 0x3a3f45, 0.16);
  canopy.box(1.9, 2.3, 0.16, 0x1d2733, 5.9, 3.05, 3.9);
  canopy.box(1.9, 0.1, 0.18, 0xb03a2e, 5.9, 4.22, 3.9);
  const price = decalPlane('FUEL', 1.5, 'rgba(245,242,235,0.97)', 64);
  price.position.set(5.9, 3.72, 4.0);
  canopy.addDetail(price);
  const digits = decalPlane('4.09', 1.4, 'rgba(232,179,75,0.97)', 72);
  digits.position.set(5.9, 2.85, 4.0);
  canopy.addDetail(digits);
  return [store, canopy];
}

// ------------------------------------------- Stitch templates (map phase 7)
// The remaining unbuilt templates from the Stitch roster, placed at
// sensible town/marina sites with their own loot identities.

const MARINE_LOOT: HuskLootEntry[] = [
  { id: 'fuel_can', min: 1, max: 1, chance: 0.5 },
  { id: 'scrap', min: 1, max: 3, chance: 0.8 },
  { id: 'wire', min: 1, max: 2, chance: 0.6 },
  { id: 'cloth', min: 1, max: 2, chance: 0.4 },
];
const POLICE_LOOT: HuskLootEntry[] = [
  { id: 'ammo_9mm', min: 4, max: 8, chance: 0.7 },
  { id: 'ammo_shells', min: 2, max: 4, chance: 0.5 },
  { id: 'ammo_556', min: 3, max: 6, chance: 0.4 },
  { id: 'bandage', min: 1, max: 2, chance: 0.4 },
];

function pharmacy(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('pharmacy', cx, cz, 10, 8, 1, groundY);
  const col = 0xdcd8d0;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 4 - 0.15, from: -5, to: 5, story: 0, color: col, exterior: true,
    openings: [
      { at: 0, w: 1.4, type: 'slider', h: 2.1 },
      { at: -3, w: 2.2, type: 'window', sill: 0.55, head: 2.45 },
      { at: 3, w: 2.2, type: 'window', sill: 0.55, head: 2.45 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [{ face: 'N', at: -2.5 }, { face: 'N', at: 2.5 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.roofFlat(0x6a6a6e, col);
  k.box(9.6, 0.7, 0.1, 0x2e7a4a, 0, 2.68, 4.06);
  // the green cross
  k.box(0.62, 0.2, 0.06, 0x39c26a, -3.4, 2.68, 4.12);
  k.box(0.2, 0.62, 0.06, 0x39c26a, -3.4, 2.68, 4.12);
  const sign = decalPlane('PHARMACY', 5.5, 'rgba(240,246,240,0.97)', 50);
  sign.position.set(0.6, 2.68, 4.12);
  k.addDetail(sign);
  k.furnish({ kind: 'cabinets', lx: -3.6, lz: -3.3, id: 'pharmacy_shelf_1', loot: PHARMACY, label: 'Search pharmacy shelf' });
  k.furnish({ kind: 'cabinets', lx: 0, lz: -3.3, id: 'pharmacy_shelf_2', loot: PHARMACY, label: 'Search pharmacy shelf' });
  k.furnish({ kind: 'cabinets', lx: 3.6, lz: -3.3, id: 'pharmacy_shelf_3', loot: PHARMACY, label: 'Search pharmacy shelf' });
  k.furnish({
    kind: 'fridge', lx: -4.2, lz: 1.5, id: 'pharmacy_fridge',
    loot: [
      { id: 'medkit', min: 1, max: 1, chance: 0.35 },
      { id: 'bandage', min: 1, max: 3, chance: 0.8 },
    ],
    label: 'Search medical fridge',
  });
  k.furnish({ kind: 'bookshelf', lx: 4.2, lz: 2.8, id: 'pharmacy_counter', loot: PHARMACY, label: 'Search pharmacy counter' });
  k.roomPoint(0, 1, 'pharmacy floor');
  return k;
}

function clinic(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('clinic', cx, cz, 12, 9, 1, groundY);
  const col = 0xe2ded4;
  k.foundation();
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: col,
    door: { face: 'S', at: -2, leafColor: 0x8e2f28 },
    windows: [
      { face: 'S', at: 2.5 }, { face: 'S', at: -4.8 },
      { face: 'N', at: -3 }, { face: 'N', at: 3 },
      { face: 'E', at: 0 }, { face: 'W', at: 0 },
    ],
  });
  // exam rooms along the back, one door off the waiting room
  k.divider({ axis: 'x', at: -1.5, from: -5.7, to: 5.7, color: col, doorAt: 3 });
  k.roofFlat(0x6a6a6e, col);
  k.box(11.6, 0.7, 0.1, 0xb03a2e, 0, 2.68, 4.56);
  const sign = decalPlane('CLINIC', 5, 'rgba(245,242,235,0.97)', 54);
  sign.position.set(0, 2.68, 4.62);
  k.addDetail(sign);
  k.furnish({ kind: 'cabinets', lx: -4.5, lz: -3.6, id: 'clinic_cabinets_1', loot: PHARMACY, label: 'Search clinic cabinet' });
  k.furnish({ kind: 'cabinets', lx: 0.5, lz: -3.6, id: 'clinic_cabinets_2', loot: PHARMACY, label: 'Search clinic cabinet' });
  k.furnish({
    kind: 'fridge', lx: 5.2, lz: -3.4, id: 'clinic_fridge',
    loot: [
      { id: 'medkit', min: 1, max: 2, chance: 0.4 },
      { id: 'bandage', min: 2, max: 3, chance: 0.85 },
    ],
    label: 'Search medical fridge',
  });
  k.furnish({ kind: 'cooler', lx: -5.2, lz: 2.5, id: 'clinic_supplies', loot: FURNITURE_LOOT.cooler.suburban });
  k.furnish({ kind: 'crate', lx: 5.2, lz: 3.4, id: 'clinic_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(0, 2.8, 'waiting room');
  k.roomPoint(-3, -3, 'exam room');
  return k;
}

function hardwareStore(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('hardware', cx, cz, 12, 9, 1, groundY);
  const col = 0x8a7f72;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 4.5 - 0.15, from: -6, to: 6, story: 0, color: col, exterior: true,
    openings: [
      { at: -1.5, w: 1.6, type: 'slider', h: 2.1 },
      { at: 3.2, w: 3.2, type: 'window', sill: 0.55, head: 2.45 },
      { at: -4.6, w: 1.8, type: 'window', sill: 0.55, head: 2.45 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [{ face: 'N', at: -3 }, { face: 'N', at: 3 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.roofFlat(0x5a5a5e, col);
  k.box(11.6, 0.7, 0.1, 0x8a6a2a, 0, 2.68, 4.56);
  const sign = decalPlane('HARDWARE', 6.5, 'rgba(240,238,230,0.97)', 50);
  sign.position.set(0, 2.68, 4.62);
  k.addDetail(sign);
  k.furnish({ kind: 'bookshelf', lx: -4, lz: -3.6, id: 'hardware_shelf_1', loot: PARTS, label: 'Search parts shelf' });
  k.furnish({ kind: 'bookshelf', lx: 0, lz: -3.6, id: 'hardware_shelf_2', loot: PARTS, label: 'Search parts shelf' });
  k.furnish({ kind: 'cabinets', lx: 4, lz: -3.6, id: 'hardware_batteries', loot: BATTERIES, label: 'Search battery rack' });
  k.furnish({ kind: 'toolbox', lx: -5.2, lz: 0.5, id: 'hardware_toolbox_1', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'toolbox', lx: 5.2, lz: 0.5, id: 'hardware_toolbox_2', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'crate', lx: 0, lz: 3.4, id: 'hardware_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(0, 0.5, 'hardware floor');
  return k;
}

function marineStore(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('marine_store', cx, cz, 10, 7, 1, groundY);
  const col = 0x6a7a86;
  k.foundation();
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: col,
    door: { face: 'S', at: 1.5, leafColor: 0x2e4a6e },
    windows: [{ face: 'S', at: -2.5 }, { face: 'N', at: 0 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.roofShed(0.7, 0x3a4a52, col);
  const sign = decalPlane('MARINE SUPPLY', 5.5, 'rgba(238,240,242,0.95)', 42);
  sign.position.set(0, 2.5, 3.56);
  k.addDetail(sign);
  k.furnish({ kind: 'crate', lx: -3.8, lz: -2.4, id: 'marine_crate_1', loot: MARINE_LOOT, label: 'Search marine crate' });
  k.furnish({ kind: 'crate', lx: 0, lz: -2.6, id: 'marine_crate_2', loot: MARINE_LOOT, label: 'Search marine crate' });
  k.furnish({ kind: 'cooler', lx: 3.8, lz: -2.4, id: 'marine_cooler', loot: FURNITURE_LOOT.cooler.camp });
  k.furnish({ kind: 'toolbox', lx: -3.8, lz: 2.4, id: 'marine_toolbox', loot: FURNITURE_LOOT.toolbox.camp });
  k.roomPoint(0, 0.5, 'marine store');
  return k;
}

function policeSubstation(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('police', cx, cz, 12, 8, 1, groundY);
  const col = 0x7a7f88;
  k.foundation();
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: col,
    door: { face: 'S', at: -3, leafColor: 0x2e3a4a },
    windows: [
      { face: 'S', at: 1.5, w: 1.0, sill: 1.2, head: 2.2 }, { face: 'S', at: 4.2, w: 1.0, sill: 1.2, head: 2.2 },
      { face: 'N', at: -3, w: 1.0, sill: 1.2, head: 2.2 }, { face: 'N', at: 3, w: 1.0, sill: 1.2, head: 2.2 },
      { face: 'E', at: 0, w: 1.0, sill: 1.2, head: 2.2 }, { face: 'W', at: 0, w: 1.0, sill: 1.2, head: 2.2 },
    ],
  });
  // the cell block: a divider with a cell door, bunks behind it
  k.divider({ axis: 'z', at: 2.5, from: -3.7, to: 0.5, color: col, doorAt: -1 });
  k.roofFlat(0x4a4e55, col);
  k.box(11.6, 0.6, 0.1, 0x2e3a4a, 0, 2.7, 4.06);
  const sign = decalPlane('POLICE', 4.5, 'rgba(240,242,245,0.97)', 54);
  sign.position.set(0, 2.7, 4.12);
  k.addDetail(sign);
  k.furnish({ kind: 'cabinets', lx: -5.2, lz: -3.3, id: 'police_armory', loot: POLICE_LOOT, label: 'Search armory locker' });
  k.furnish({ kind: 'bookshelf', lx: -1.5, lz: -3.5, id: 'police_records', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search records shelf' });
  k.furnish({ kind: 'toolbox', lx: -5.2, lz: 2.8, id: 'police_toolbox', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'crate', lx: 4.2, lz: 2.6, id: 'police_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(-3, 1, 'front office');
  k.roomPoint(4.2, -1.5, 'cell block');
  return k;
}

function warehouseUtility(cx: number, cz: number, groundY: GroundY): Kit {
  const k = kitAt('warehouse_util', cx, cz, 12, 8, 1, groundY);
  const col = 0x7a8a94;
  k.foundation();
  k.floorSlab(0);
  k.wall({
    axis: 'x', at: 4 - 0.15, from: -6, to: 6, story: 0, color: col, exterior: true,
    openings: [
      { at: -1.8, w: 3.4, type: 'bay', h: 3.0 },
      { at: 3.4, w: 0.95, type: 'door', h: 2.1, leafColor: 0x5a6a74 },
    ],
  });
  k.perimeter({
    story: 0, color: col, open: ['S'],
    windows: [
      { face: 'N', at: -3, w: 1.4, sill: 2.0, head: 2.9 }, { face: 'N', at: 3, w: 1.4, sill: 2.0, head: 2.9 },
      { face: 'E', at: 0 }, { face: 'W', at: 0 },
    ],
  });
  k.roofGable(1.5, 0x4a5a63, col);
  const sign = decalPlane('DEPOT STORAGE', 6, 'rgba(238,240,242,0.95)', 44);
  sign.position.set(0.8, 2.55, 4.06);
  k.addDetail(sign);
  k.furnish({ kind: 'bookshelf', lx: 0.5, lz: -3.4, id: 'util_shelf', loot: PARTS, label: 'Search parts shelf' });
  k.furnish({ kind: 'crate', lx: -4.5, lz: -3.2, id: 'util_crate_1', loot: PARTS, label: 'Search parts crate' });
  k.furnish({ kind: 'crate', lx: -4.5, lz: 1.5, id: 'util_crate_2', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'crate', lx: 4.6, lz: -3.2, id: 'util_crate_3', loot: FURNITURE_LOOT.crate.suburban });
  k.furnish({ kind: 'barrel', lx: 4.8, lz: 1.8, id: 'util_barrel_1', loot: FURNITURE_LOOT.barrel.suburban });
  k.furnish({ kind: 'barrel', lx: 3.6, lz: 2.8, id: 'util_barrel_2', loot: FURNITURE_LOOT.barrel.suburban });
  k.roomPoint(0, 0.5, 'utility warehouse floor');
  return k;
}

// ------------------------------------------------------------------ assembly

export function poiFootprints(pois: Record<string, [number, number]>): PoiFootprint[] {
  const at = (pid: string, dx: number, dz: number): [number, number] => {
    const p = pois[pid] ?? [0, 0];
    return [p[0] + dx, p[1] + dz];
  };
  const town: [number, number, number, number][] = [
    [55, -30, 8.5, 4], // strip mall
    [105, 55, 9, 6], // warehouse (keeper)
    [-30, 60, 10, 7], // school (pad covers the portico)
    [30, 48, 6.5, 5.5], // convenience store
    [130, 58, 8, 6.5], // auto garage
    // map phase 7: the remaining Stitch templates
    [52, 26, 5.5, 4.5], // pharmacy
    [-44, 44, 6.5, 5], // clinic
    [88, -18, 6.5, 5], // hardware store
    [-8, -34, 6.5, 4.5], // police substation
    [120, 20, 6.5, 4.5], // warehouse utility
  ];
  const out: PoiFootprint[] = town.map(([dx, dz, hw, hd]) => {
    const [cx, cz] = at('town', dx, dz);
    return { cx, cz, hw, hd };
  });
  {
    // gas station: one pad under store + canopy + pump islands
    const [kx, kz] = at('town', 75, 30);
    out.push({ cx: kx, cz: kz + 8, hw: 8, hd: 11 });
  }
  {
    const [cx, cz] = at('jonah_camp', -16, -10);
    out.push({ cx, cz, hw: 5.5, hd: 4.5 }); // barn (keeper)
  }
  {
    const [cx, cz] = at('marina', 0, 0);
    out.push({ cx, cz, hw: 5.5, hd: 4 }); // boathouse
  }
  {
    const [cx, cz] = at('marina', 16, 8);
    out.push({ cx, cz, hw: 5.5, hd: 4 }); // marine store
  }
  return out;
}

export function buildPoiBuildings(
  scene: THREE.Scene,
  pois: Record<string, [number, number]>,
  groundY: GroundY,
): PoiBuildResult {
  const out: PoiBuildResult = {
    group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [], buildings: [],
  };
  const addKit = (k: Kit) => {
    const res = k.finalize();
    out.group.add(res.group);
    out.colliders.push(...res.colliders);
    out.floors.push(...res.floors);
    out.containers.push(...res.containers);
    out.roofs.push(...res.roofs);
    out.buildings.push(res.building);
  };
  const addKeeper = (b: B) => {
    for (const c of b.colliders) {
      out.colliders.push({ x0: b.cx + c.x0, z0: b.cz + c.z0, x1: b.cx + c.x1, z1: b.cz + c.z1 });
    }
    for (const f of b.floors) {
      out.floors.push({ x0: b.cx + f.x0, z0: b.cz + f.z0, x1: b.cx + f.x1, z1: b.cz + f.z1, y: f.y + b.base });
    }
    out.group.add(b.group);
    out.containers.push(...b.containers);
    for (const r of b.roofs) {
      out.roofs.push({
        bounds: { x0: b.cx + r.bounds.x0, z0: b.cz + r.bounds.z0, x1: b.cx + r.bounds.x1, z1: b.cz + r.bounds.z1 },
        group: r.group,
      });
    }
  };
  const at = (pid: string, dx: number, dz: number): [number, number] => {
    const p = pois[pid] ?? [0, 0];
    return [p[0] + dx, p[1] + dz];
  };
  let m: [number, number];
  m = at('town', 55, -30);
  addKit(stripMall(m[0], m[1], groundY));
  m = at('town', 75, 30);
  for (const k of gasStation(m[0], m[1], groundY)) addKit(k);
  m = at('town', 105, 55);
  addKeeper(warehouse(m[0], m[1], groundY));
  m = at('town', -30, 60);
  addKit(school(m[0], m[1], groundY));
  m = at('town', 30, 48);
  addKit(convenienceStore(m[0], m[1], groundY));
  m = at('town', 130, 58);
  addKit(autoGarage(m[0], m[1], groundY));
  m = at('jonah_camp', -16, -10);
  addKeeper(barn(m[0], m[1], groundY));
  m = at('marina', 0, 0);
  addKit(boathouse(m[0], m[1], groundY));
  // map phase 7: the remaining Stitch templates as working POI buildings
  m = at('town', 52, 26);
  addKit(pharmacy(m[0], m[1], groundY));
  m = at('town', -44, 44);
  addKit(clinic(m[0], m[1], groundY));
  m = at('town', 88, -18);
  addKit(hardwareStore(m[0], m[1], groundY));
  m = at('town', -8, -34);
  addKit(policeSubstation(m[0], m[1], groundY));
  m = at('town', 120, 20);
  addKit(warehouseUtility(m[0], m[1], groundY));
  m = at('marina', 16, 8);
  addKit(marineStore(m[0], m[1], groundY));
  scene.add(out.group);
  return out;
}

// ------------------------------------------------------------ keeper builder
// FROZEN legacy construction for the town warehouse and Jonah's barn —
// Ian's keeper order: these structures are not demolished or rebuilt.
// Segment walls with a real door gap, joined roofs, framed windows,
// foundation skirts. Do not extend; new buildings use the kit.

function aabb(x0: number, z0: number, x1: number, z1: number): Collider {
  return { x0, z0, x1, z1 };
}

interface KeeperWallOpt {
  doorW?: number;
  doorX?: number;
  winN?: number;
}

class B {
  group = new THREE.Group();
  colliders: Collider[] = [];
  floors: FloorRect[] = [];
  containers: ContainerDef[] = [];
  roofs: PoiBuildResult['roofs'] = [];
  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly w: number,
    readonly d: number,
    readonly h: number,
    readonly t = 0.18,
    readonly base: number = 0,
    readonly color = 0x8a7f72,
  ) {}
  private box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  shell(opt: KeeperWallOpt = {}): void {
    const { w, d, h, t } = this;
    const hw = w / 2;
    const hd = d / 2;
    const seg = (sw: number, sd: number, x: number, z: number) => {
      const m = this.box(sw, h, sd, this.color, x, h / 2 - 0.3, z);
      this.colliders.push(aabb(x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2));
      return m;
    };
    const doorW = opt.doorW ?? 0;
    const doorX = opt.doorX ?? 0;
    if (doorW > 0) {
      const lo = doorX - doorW / 2;
      const hi = doorX + doorW / 2;
      seg(lo + hw, t, (-hw + lo) / 2, hd - t / 2);
      seg(hw - hi, t, (hi + hw) / 2, hd - t / 2);
      const jamb = this.color;
      this.box(t, 2.05, t, jamb, lo + t / 2, 0.72, hd - t / 2);
      this.box(t, 2.05, t, jamb, hi - t / 2, 0.72, hd - t / 2);
      this.box(doorW, h - 2.05, t, this.color, doorX, 2.05 + (h - 2.05) / 2 - 0.3, hd - t / 2);
      const leaf = this.box(doorW - 0.08, 2.0, 0.06, 0x5a4632, lo + 0.06, 0.72, hd - t / 2 - 0.06);
      leaf.geometry.translate(-(doorW - 0.08) / 2, 0, 0);
      leaf.position.x = lo + 0.06 + (doorW - 0.08) / 2;
      leaf.rotation.y = 0.35;
    } else {
      seg(w, t, 0, hd - t / 2);
    }
    seg(w, t, 0, -hd + t / 2);
    seg(t, d - 2 * t, -hw + t / 2, 0);
    seg(t, d - 2 * t, hw - t / 2, 0);
    const n = opt.winN ?? 2;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const z = -hd + t + ((i + 1) * (d - 2 * t)) / (n + 1);
        this.box(0.08, 1.1, 1.0, this.color, sx * (hw - t / 2), 1.3, z);
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 1.0, 0.86),
          new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2, metalness: 0.4 }),
        );
        glass.position.set(sx * (hw - t / 2), 1.3, z);
        this.group.add(glass);
        this.box(0.1, 0.08, 1.0, 0xd8d0c0, sx * (hw - t / 2), 0.78, z);
      }
    }
    this.box(w + 0.24, 0.55, d + 0.24, 0x6a625a, 0, -0.14, 0);
    this.box(w - t, 0.14, d - t, 0x9a938a, 0, 0.07, 0);
    const fr = aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2);
    this.floors.push({ x0: fr.x0, z0: fr.z0, x1: fr.x1, z1: fr.z1, y: 0.14 });
  }
  gableRoof(riseFrac = 0.35, color = 0x6e4a3a): void {
    const { w, d, h } = this;
    const hw = w / 2;
    const hd = d / 2;
    const rise = riseFrac * hd;
    const top = h - 0.3 + 0.1;
    const slopeLen = Math.hypot(hd + 0.39, rise + 0.08);
    const a = Math.atan2(rise + 0.08, hd + 0.39);
    const roofGroup = new THREE.Group();
    const roofMat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    for (const sgn of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.14, slopeLen), roofMat);
      panel.rotation.x = -sgn * a;
      panel.position.set(0, top + (rise - 0.04) / 2, sgn * ((hd + 0.33) / 2));
      panel.castShadow = true;
      roofGroup.add(panel);
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.7, 0.22, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
      );
      fascia.position.set(0, h - 0.3, sgn * (hd + 0.3));
      roofGroup.add(fascia);
    }
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.7, 0.14, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
    );
    ridge.position.set(0, top + rise + 0.02, 0);
    ridge.castShadow = true;
    roofGroup.add(ridge);
    const capMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, top - 0.05);
      shape.lineTo(hd, top - 0.05);
      shape.lineTo(0, top + rise);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(Math.PI / 2);
      const gable = new THREE.Mesh(geo, capMat);
      gable.position.set(sgn * (hw - 0.02), 0, 0);
      gable.castShadow = true;
      roofGroup.add(gable);
    }
    this.group.add(roofGroup);
    this.roofs.push({ bounds: aabb(-hw, -hd, hw, hd), group: roofGroup });
  }
  furnish(kind: FurnitureKind, lx: number, lz: number, id: string, loot: HuskLootEntry[], label?: string): void {
    const [hx, hz] = FURNITURE_HALF[kind];
    this.colliders.push(aabb(lx - hx, lz - hz, lx + hx, lz + hz));
    this.containers.push({
      id,
      x: this.cx + lx,
      z: this.cz + lz,
      loot,
      label: label ?? FURNITURE_LABEL[kind],
      meshKind: kind,
    });
  }
  finalize(): void {
    this.group.position.set(this.cx, this.base, this.cz);
  }
}

function warehouse(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 17, 11, 4.6, 0.22, groundY(cx, cz) - 0.1, 0x7a8a94);
  b.shell({ doorW: 3.2, winN: 3 });
  b.gableRoof(0.22, 0x4a5a63);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.6, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x5a6a74, roughness: 0.9 }),
  );
  panel.position.set(3.3, 1.5, 5.52);
  panel.castShadow = true;
  b.group.add(panel);
  b.furnish('crate', -5, -3, 'wh_crate_1', FURNITURE_LOOT.crate.suburban);
  b.furnish('crate', -5, 2, 'wh_crate_2', FURNITURE_LOOT.crate.suburban);
  b.furnish('crate', 5, -3, 'wh_crate_3', FURNITURE_LOOT.crate.suburban);
  b.furnish('barrel', 5, 2, 'wh_barrel', FURNITURE_LOOT.barrel.suburban);
  b.furnish('toolbox', 0, -4, 'wh_toolbox', FURNITURE_LOOT.toolbox.suburban);
  b.finalize();
  return b;
}

function barn(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 10, 8, 3.2, 0.2, groundY(cx, cz) - 0.1, 0x8a3a2e);
  b.shell({ doorW: 2.6, winN: 1 });
  b.gableRoof(0.55, 0x5a2e24);
  for (const sgn of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.4, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x6e2e22, roughness: 1 }),
    );
    leaf.geometry.translate(sgn * 0.625, 0, 0);
    leaf.position.set(sgn * 1.25, 0.9, 4.06);
    leaf.rotation.y = sgn * -0.7;
    leaf.castShadow = true;
    b.group.add(leaf);
  }
  for (const [bx, bz] of [[-3, -2], [3, -2], [-3, 1.5]] as [number, number][]) {
    const bale = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0xb8a44a, roughness: 1 }),
    );
    bale.rotation.z = Math.PI / 2;
    bale.position.set(bx, 0.7, bz);
    bale.castShadow = true;
    b.group.add(bale);
    b.colliders.push(aabb(bx - 0.45, bz - 0.7, bx + 0.45, bz + 0.7));
  }
  b.furnish('toolbox', 3.5, 2, 'barn_toolbox', FURNITURE_LOOT.toolbox.suburban);
  b.furnish('crate', -3.5, 2.5, 'barn_crate', FURNITURE_LOOT.crate.suburban);
  b.finalize();
  return b;
}
