// HousesV4.ts — residential buildings assembled from the BUILDING_STRATEGY
// kit (src/game/kit.ts), replacing the legacy Houses.ts builders in the
// map phase. Same lots, same placement order (house container ids stay
// index-stable for old saves), same loot identity — every shell is now
// kit pieces with recorded structure the QA gate audits.
//
// KEEPERS: Jonah's camp structures (cabin/shack/ruin at jonah_camp) are
// NOT rebuilt — Ian's order. They are built by the frozen legacy segment
// builder at the bottom of this file, byte-for-byte the old construction.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import type { Collider, FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import { FURNITURE_LOOT, SAFE_LOOT } from '../data/items';
import { FURNITURE_LABEL, FURNITURE_HALF, type FurnitureKind } from './furnitureMeshes';
import { Kit, type KitBuilding } from './kit';

export type HouseTier = 'camp' | 'suburban';

type ArchName =
  | 'ranch' | 'ranch2' | 'farmhouse' | 'bungalow' | 'richhouse' | 'garage' | 'beach'
  | 'trailer' | 'apartment'
  | 'cabin' | 'shack' | 'shed' | 'leanto' | 'ruin';

interface Placement {
  poi: string;
  dx: number;
  dz: number;
  arch: ArchName;
  rotQ: 0 | 1 | 2 | 3;
  keeper?: boolean; // jonah_camp: frozen legacy build, never demolished
}

// SAME order as the legacy PLACEMENTS (container ids are index-based).
const PLACEMENTS: Placement[] = [
  { poi: 'town', dx: -20, dz: -6, arch: 'ranch', rotQ: 1 },
  { poi: 'town', dx: 16, dz: 12, arch: 'ranch2', rotQ: 3 },
  { poi: 'town', dx: 2, dz: 24, arch: 'farmhouse', rotQ: 0 },
  { poi: 'town', dx: -26, dz: 14, arch: 'trailer', rotQ: 2 },
  { poi: 'town', dx: 26, dz: -22, arch: 'bungalow', rotQ: 1 },
  { poi: 'town', dx: 36, dz: 10, arch: 'richhouse', rotQ: 2 },
  { poi: 'town', dx: -38, dz: -20, arch: 'garage', rotQ: 0 },
  { poi: 'shore_camp', dx: 10, dz: 8, arch: 'cabin', rotQ: 0 },
  { poi: 'shore_camp', dx: -9, dz: -10, arch: 'leanto', rotQ: 1 },
  { poi: 'jonah_camp', dx: 9, dz: -7, arch: 'cabin', rotQ: 3, keeper: true },
  { poi: 'jonah_camp', dx: -11, dz: 6, arch: 'shack', rotQ: 0, keeper: true },
  { poi: 'jonah_camp', dx: 14, dz: 12, arch: 'ruin', rotQ: 2, keeper: true },
  { poi: 'forest_cache', dx: -8, dz: 9, arch: 'cabin', rotQ: 1 },
  { poi: 'dune_cache', dx: 7, dz: -8, arch: 'shed', rotQ: 3 },
  { poi: 'relay_station', dx: -12, dz: -9, arch: 'ruin', rotQ: 0 },
  { poi: 'town', dx: 58, dz: 14, arch: 'beach', rotQ: 2 },
  { poi: 'town', dx: -52, dz: -34, arch: 'beach', rotQ: 1 },
  { poi: 'shore_camp', dx: -16, dz: 16, arch: 'beach', rotQ: 0 },
  // new in V4: the apartment block on the empty town lot west of the ranch
  { poi: 'town', dx: -58, dz: 28, arch: 'apartment', rotQ: 0 },
];

interface ArchDef {
  tier: HouseTier;
  w: number;
  d: number;
  stories: number;
  padGrow?: number;
  build: (k: Kit, rng: () => number, wallCol: number) => void;
}

type Rng = () => number;

function loot(tier: HouseTier, kind: FurnitureKind) {
  return FURNITURE_LOOT[kind][tier] as ContainerDef['loot'];
}

function furn(k: Kit, id: string, tier: HouseTier, kind: FurnitureKind, lx: number, lz: number, rot = 0, story = 0): void {
  k.furnish({ kind, lx, lz, rot, story, id, loot: loot(tier, kind) });
}

/** Locked safe, rolled per house (id stamped later with the legacy scheme). */
function safeRoll(k: Kit, tier: HouseTier, rng: Rng, chance: number, lx: number, lz: number, story = 0): void {
  if (tier !== 'suburban' || rng() >= chance) return;
  k.furnish({
    kind: 'safe', lx, lz, story, id: '', loot: SAFE_LOOT,
    label: FURNITURE_LABEL.safe, locked: true, searchTime: 4,
  });
}

const DOOR_COLS = [0x3a5a6e, 0x6e3a3a, 0x6b5335, 0x3f5a3a];
const doorCol = (rng: Rng) => DOOR_COLS[Math.floor(rng() * DOOR_COLS.length)];

/**
 * Divider position relative to the front door: the divider must stand at
 * least ~1.15m off the door's centerline, or its collider seals the
 * doorway lane and its end catches the door leaf's swing (both caught by
 * the QA gate on real placements).
 */
function dividerAt(doorAt: number, max: number, rng: Rng): number {
  const raw = doorAt - (doorAt >= 0 ? 1 : -1) * (1.15 + rng() * 0.3);
  return Math.max(-max, Math.min(max, raw));
}

/** The front door hinges on the side AWAY from the divider: the leaf
 *  rests open against the wall run beside the jamb, and the divider's
 *  end stands in that strip when they're on the same side (QA gate). */
function swingAway(doorAt: number, divAt: number): 'L' | 'R' {
  return divAt < doorAt ? 'R' : 'L';
}

// ---------------------------------------------------------------- archetypes

const ARCHS: Record<ArchName, ArchDef> = {
  ranch: {
    tier: 'suburban', w: 10, d: 9, stories: 1,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 4;
      const divAt = dividerAt(doorAt, 1.2, rng);
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng), swing: swingAway(doorAt, divAt) },
        windows: [
          { face: 'N', at: -2 }, { face: 'N', at: 2 },
          { face: 'E', at: 0 }, { face: 'W', at: 0 },
          { face: 'S', at: -3.4 }, { face: 'S', at: 3.4 },
        ],
      });
      k.divider({ axis: 'z', at: divAt, from: -4.2, to: 4.2, color: col, doorAt: (rng() - 0.5) * 3.6 });
      furn(k, '', 'suburban', 'fridge', -4.2, -1.5);
      furn(k, '', 'suburban', 'cabinets', -2.2, -3.85);
      furn(k, '', 'suburban', 'bookshelf', 3.6, -3.7);
      furn(k, '', 'suburban', 'dresser', 3.6, 3.6, 2);
      furn(k, '', 'suburban', 'crate', -2.8, 3.75);
      safeRoll(k, 'suburban', rng, 0.2, -4.15, -3.6);
      k.roomPoint(-3, 0.5, 'living room');
      k.roomPoint(3.2, 0.5, 'bedroom');
    },
  },
  ranch2: {
    tier: 'suburban', w: 11, d: 9, stories: 2,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 4;
      const divAt = dividerAt(doorAt, 1.2, rng);
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng), swing: swingAway(doorAt, divAt) },
        windows: [
          { face: 'N', at: -2.5 }, { face: 'N', at: 2.5 },
          { face: 'E', at: 0 }, { face: 'W', at: 0 },
          { face: 'S', at: -3.6 }, { face: 'S', at: 3.6 },
        ],
      });
      k.divider({ axis: 'z', at: divAt, from: -4.2, to: 4.2, color: col, doorAt: (rng() - 0.5) * 3.6 });
      k.stairs({ x: 4.05, z: 2.4, dir: 'nz', story: 0, runLen: 4.8 });
      k.floorSlabStairwell(1, [{ x0: 3.35, z0: -2.5, x1: 4.8, z1: 2.5 }]);
      k.perimeter({
        story: 1, color: col,
        windows: [
          { face: 'N', at: 0 }, { face: 'S', at: -3 }, { face: 'S', at: 3 },
          { face: 'E', at: 0 }, { face: 'W', at: 0 },
        ],
      });
      k.roofGable(1.6, 0x4a3a30, col);
      furn(k, '', 'suburban', 'fridge', -4.7, -3.7);
      furn(k, '', 'suburban', 'cabinets', -2.4, -3.85);
      furn(k, '', 'suburban', 'bookshelf', 3.2, -3.7);
      furn(k, '', 'suburban', 'dresser', 4.55, 3.7, 2);
      furn(k, '', 'suburban', 'crate', -4.6, 3.7);
      furn(k, '', 'suburban', 'dresser', -4.7, -3.7, 0, 1);
      furn(k, '', 'suburban', 'bookshelf', 4.55, 3.7, 2, 1);
      furn(k, '', 'suburban', 'cabinets', -2.4, -3.85, 0, 1);
      furn(k, '', 'suburban', 'crate', -4.6, 3.7, 3, 1);
      safeRoll(k, 'suburban', rng, 0.2, 4.6, -3.7, 1);
      k.roomPoint(-3, 0.5, 'living room');
      k.roomPoint(2.2, 3.8, 'bedroom');
      k.roomPoint(-2.5, 0, 'upstairs loft');
      k.roomPoint(1.9, -3.5, 'upstairs north room');
    },
  },
  richhouse: {
    tier: 'suburban', w: 12, d: 11, stories: 2,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 4.5;
      const divAt = dividerAt(doorAt, 1.5, rng);
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng), swing: swingAway(doorAt, divAt) },
        windows: [
          { face: 'N', at: -3 }, { face: 'N', at: 3 },
          { face: 'E', at: -2 }, { face: 'E', at: 2 },
          { face: 'W', at: 0 }, { face: 'S', at: -4 }, { face: 'S', at: 4 },
        ],
      });
      k.divider({ axis: 'z', at: divAt, from: -5.2, to: 5.2, color: col, doorAt: (rng() - 0.5) * 4 });
      k.stairs({ x: 4.55, z: 2.4, dir: 'nz', story: 0, runLen: 4.8 });
      k.floorSlabStairwell(1, [{ x0: 3.85, z0: -2.5, x1: 5.3, z1: 2.5 }]);
      k.perimeter({
        story: 1, color: col,
        windows: [
          { face: 'N', at: -3 }, { face: 'N', at: 3 },
          { face: 'S', at: -4 }, { face: 'S', at: 4 },
          { face: 'E', at: 0 }, { face: 'W', at: 0 },
        ],
      });
      k.roofGable(1.8, 0x4a3a30, col);
      furn(k, '', 'suburban', 'fridge', -5.2, -4.6);
      furn(k, '', 'suburban', 'cabinets', -3.0, -4.85);
      furn(k, '', 'suburban', 'cabinets', -0.8, -4.85);
      furn(k, '', 'suburban', 'bookshelf', 4.4, -4.6);
      furn(k, '', 'suburban', 'dresser', 4.8, 4.7, 2);
      furn(k, '', 'suburban', 'crate', -5.0, 4.8);
      furn(k, '', 'suburban', 'dresser', 4.4, -4.6, 0, 1);
      furn(k, '', 'suburban', 'bookshelf', 4.8, 4.7, 2, 1);
      furn(k, '', 'suburban', 'dresser', -5.2, -4.6, 0, 1);
      furn(k, '', 'suburban', 'cabinets', -3.0, -4.85, 0, 1);
      safeRoll(k, 'suburban', rng, 0.45, -5.25, 4.75, 1);
      k.roomPoint(-3.5, 0.5, 'living room');
      k.roomPoint(3.5, 1, 'bedroom');
      k.roomPoint(-3, 0, 'upstairs loft');
      k.roomPoint(2.6, 4.5, 'upstairs south room');
    },
  },
  farmhouse: {
    tier: 'suburban', w: 8, d: 10, stories: 1,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 3;
      const divAt = dividerAt(doorAt, 1.0, rng);
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng), swing: swingAway(doorAt, divAt) },
        windows: [
          { face: 'N', at: 0 }, { face: 'E', at: -2.5 }, { face: 'E', at: 2.5 },
          { face: 'W', at: 0 }, { face: 'S', at: -2.6 }, { face: 'S', at: 2.6 },
        ],
      });
      k.divider({ axis: 'z', at: divAt, from: -4.7, to: 4.7, color: col, doorAt: (rng() - 0.5) * 4 });
      furn(k, '', 'suburban', 'fridge', -3.1, -4.25);
      furn(k, '', 'suburban', 'cabinets', -1.0, -4.4);
      furn(k, '', 'suburban', 'cabinets', 1.2, -4.4);
      furn(k, '', 'suburban', 'dresser', 3.0, 4.3, 2);
      furn(k, '', 'suburban', 'bookshelf', -3.2, 4.3, 1);
      furn(k, '', 'suburban', 'crate', 0.6, 1.2);
      safeRoll(k, 'suburban', rng, 0.2, 3.05, -4.25);
      k.roomPoint(-2, 0.5, 'kitchen');
      k.roomPoint(2.2, -1, 'bedroom');
    },
  },
  bungalow: {
    tier: 'suburban', w: 8, d: 7, stories: 1,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 3;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng) },
        windows: [{ face: 'N', at: 0 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }, { face: 'S', at: 2.8 }],
      });
      k.roofGable(1.4, 0x4a3a30, col);
      furn(k, '', 'suburban', 'fridge', -3.1, -2.8);
      furn(k, '', 'suburban', 'cabinets', -0.9, -3.0);
      furn(k, '', 'suburban', 'dresser', 3.1, 2.6, 2);
      furn(k, '', 'suburban', 'toolbox', -3.1, 2.7, 1);
      safeRoll(k, 'suburban', rng, 0.2, 3.15, -2.85);
      k.roomPoint(0, 0.5, 'bungalow room');
    },
  },
  beach: {
    tier: 'suburban', w: 10, d: 8, stories: 2,
    build(k, rng, col) {
      const trim = 0xe8e2d4;
      const roofC = 0x9a5a38;
      const doorAt = (rng() - 0.5) * 3.2;
      const divAt = dividerAt(doorAt, 1.0, rng);
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col, trim,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng), swing: swingAway(doorAt, divAt) },
        windows: [
          { face: 'N', at: -2 }, { face: 'N', at: 2 },
          { face: 'E', at: 0 }, { face: 'W', at: 0 },
          { face: 'S', at: -3.4 }, { face: 'S', at: 3.4 },
        ],
      });
      k.divider({ axis: 'z', at: divAt, from: -3.7, to: 3.7, color: col, doorAt: (rng() - 0.5) * 2.5 });
      // ground porch under the balcony
      k.deck({ face: 'S', story: 0, depth: 1.8, spanFrom: -3.5, spanTo: 3.5, color: 0x8a7a66, railColor: trim });
      const awn = k.box(7.4, 0.08, 2.1, roofC, 0, 2.66, 4 + 0.95);
      awn.rotation.x = 0.07;
      // stairs up the west wall
      k.stairs({ x: -4.05, z: -2.4, dir: 'pz', story: 0, runLen: 4.8 });
      k.floorSlabStairwell(1, [{ x0: -4.8, z0: -2.5, x1: -3.35, z1: 2.5 }]);
      k.perimeter({
        story: 1, color: col, trim,
        door: { face: 'S', at: doorAt, kind: 'slider', w: 1.3 },
        windows: [{ face: 'N', at: 0 }, { face: 'E', at: 0 }, { face: 'W', at: -1 }],
      });
      // wrap-around balcony ring: S/N span the corners, E/W run between
      k.deck({ face: 'S', story: 1, depth: 1.3, spanFrom: -6.3, spanTo: 6.3, color: 0x8a7a66, railing: true, railColor: trim });
      k.deck({ face: 'N', story: 1, depth: 1.3, spanFrom: -6.3, spanTo: 6.3, color: 0x8a7a66, railing: true, railColor: trim, yOff: -0.004 });
      k.deck({ face: 'E', story: 1, depth: 1.3, spanFrom: -4, spanTo: 4, color: 0x8a7a66, railing: true, railColor: trim, yOff: -0.008 });
      k.deck({ face: 'W', story: 1, depth: 1.3, spanFrom: -4, spanTo: 4, color: 0x8a7a66, railing: true, railColor: trim, yOff: -0.012 });
      k.roofGable(1.5, roofC, col);
      furn(k, '', 'suburban', 'fridge', -4.2, -3.2);
      furn(k, '', 'suburban', 'cabinets', -2.2, -3.4);
      furn(k, '', 'suburban', 'cabinets', 0.2, -3.4);
      furn(k, '', 'suburban', 'bookshelf', 3.4, -3.2);
      furn(k, '', 'suburban', 'dresser', 3.6, 2.9, 2);
      furn(k, '', 'suburban', 'crate', -3.7, 3.1);
      furn(k, '', 'suburban', 'dresser', 3.4, -3.2, 0, 1);
      furn(k, '', 'suburban', 'dresser', -4.2, -3.2, 0, 1);
      furn(k, '', 'suburban', 'cabinets', -2.2, -3.4, 0, 1);
      furn(k, '', 'suburban', 'bookshelf', 3.6, 2.9, 2, 1);
      safeRoll(k, 'suburban', rng, 0.2, 4.15, -3.25, 1);
      k.roomPoint(-2.8, 0.8, 'beach living room');
      k.roomPoint(2.8, 0.5, 'beach bedroom');
      k.roomPoint(-2.5, -0.5, 'beach upstairs');
      k.roomPoint(2.5, 0.5, 'beach upstairs east');
      k.roomPoint(doorAt, 4.9, 'balcony');
    },
  },
  garage: {
    tier: 'suburban', w: 8, d: 7, stories: 1,
    build(k, rng, col) {
      void rng;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col, open: ['S'],
        windows: [{ face: 'N', at: 0 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
      });
      k.post(-3.8, 3.3, -0.1, 3.0, 0x4a3826, 0.2);
      k.post(3.8, 3.3, -0.1, 3.0, 0x4a3826, 0.2);
      k.beam('x', 3.42, -4, 4, 3.0, 0x5a4632, 0.24);
      k.openEntrance('S', 0, 7);
      k.roofGable(1.4, 0x4a3a30, col);
      // the workbench reads as cabinets, loots as a toolbox
      k.furnish({
        kind: 'cabinets', lx: -2.5, lz: -3.05, id: '',
        loot: loot('suburban', 'toolbox'), label: 'Search workbench',
      });
      furn(k, '', 'suburban', 'toolbox', -3.2, 2.6, 1);
      furn(k, '', 'suburban', 'crate', 3.1, -2.7);
      furn(k, '', 'suburban', 'barrel', 3.3, 1.0);
      k.roomPoint(0, 0.5, 'garage bay');
    },
  },
  trailer: {
    tier: 'suburban', w: 12, d: 4, stories: 1,
    build(k, rng, col) {
      k.foundation(0x5a564e);
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: -3, leafColor: doorCol(rng) },
        windows: [
          { face: 'S', at: 0.5 }, { face: 'S', at: 3.5 }, { face: 'S', at: -5 },
          { face: 'N', at: -4 }, { face: 'N', at: 0 }, { face: 'N', at: 4 },
        ],
      });
      k.divider({ axis: 'z', at: 2.5, from: -1.7, to: 1.7, color: col, doorAt: 0 });
      k.roofShed(0.6, 0x6a5a48, col);
      furn(k, '', 'suburban', 'cabinets', -5.2, -1.4);
      furn(k, '', 'suburban', 'cooler', -5.3, 1.3);
      furn(k, '', 'suburban', 'dresser', 5.2, -1.3, 0);
      furn(k, '', 'suburban', 'crate', 3.9, 1.3);
      k.roomPoint(-3, 0, 'trailer living');
      k.roomPoint(4.3, 0, 'trailer bedroom');
    },
  },
  apartment: {
    tier: 'suburban', w: 14, d: 10, stories: 2,
    build(k, rng, col) {
      void rng;
      k.foundation();
      k.floorSlab(0);
      // south wall is custom: two front doors, one per unit
      k.wall({
        axis: 'x', at: 5 - 0.15, from: -7, to: 7, story: 0, color: col, exterior: true,
        openings: [
          { at: -3.5, w: 0.95, type: 'door', h: 2.1, leafColor: 0x3a5a6e },
          { at: 3.5, w: 0.95, type: 'door', h: 2.1, leafColor: 0x6e3a3a },
          { at: -5.8, w: 1.2, type: 'window' }, { at: -1.2, w: 1.2, type: 'window' },
          { at: 1.2, w: 1.2, type: 'window' }, { at: 5.8, w: 1.2, type: 'window' },
        ],
      });
      k.perimeter({
        story: 0, color: col, open: ['S'],
        windows: [{ face: 'N', at: -4 }, { face: 'N', at: 0 }, { face: 'N', at: 4 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
      });
      // solid party wall: two separate units, no connecting door
      k.divider({ axis: 'z', at: 0, from: -4.7, to: 4.7, color: col });
      k.stairs({ x: -6.05, z: 2.4, dir: 'nz', story: 0, runLen: 4.8 });
      k.stairs({ x: 6.05, z: -2.4, dir: 'pz', story: 0, runLen: 4.8 });
      k.floorSlabStairwell(1, [
        { x0: -6.75, z0: -2.5, x1: -5.35, z1: 2.5 },
        { x0: 5.35, z0: -2.5, x1: 6.75, z1: 2.5 },
      ]);
      k.perimeter({
        story: 1, color: col,
        windows: [
          { face: 'S', at: -5 }, { face: 'S', at: -2 }, { face: 'S', at: 2 }, { face: 'S', at: 5 },
          { face: 'N', at: -4 }, { face: 'N', at: 4 }, { face: 'E', at: 0 }, { face: 'W', at: 0 },
        ],
      });
      k.divider({ axis: 'z', at: 0, from: -4.7, to: 4.7, story: 1, color: col });
      k.roofFlat(0x5a5a5e, col);
      furn(k, '', 'suburban', 'fridge', -6.2, -4.25);
      furn(k, '', 'suburban', 'cabinets', -4.0, -4.5);
      furn(k, '', 'suburban', 'dresser', -6.2, 4.2, 2);
      furn(k, '', 'suburban', 'fridge', 6.2, -4.25);
      furn(k, '', 'suburban', 'cabinets', 4.0, -4.5);
      furn(k, '', 'suburban', 'bookshelf', 6.2, 4.2, 2);
      furn(k, '', 'suburban', 'dresser', -6.2, -4.25, 0, 1);
      furn(k, '', 'suburban', 'bookshelf', -4.0, -4.5, 0, 1);
      furn(k, '', 'suburban', 'dresser', 6.2, 4.25, 2, 1);
      furn(k, '', 'suburban', 'cabinets', 4.0, -4.5, 0, 1);
      k.roomPoint(-3.5, 0.5, 'unit A');
      k.roomPoint(3.5, -0.5, 'unit B');
      k.roomPoint(-3.5, -0.5, 'unit A upstairs');
      k.roomPoint(3.5, 0.5, 'unit B upstairs');
    },
  },
  cabin: {
    tier: 'camp', w: 6, d: 7, stories: 1,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 2;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng) },
        windows: [{ face: 'N', at: 0 }, { face: 'E', at: 0 }],
      });
      k.roofShed(0.8, 0x4a3a30, col);
      furn(k, '', 'camp', 'cooler', -2.0, -2.6);
      furn(k, '', 'camp', 'crate', 2.0, -2.6, 3);
      furn(k, '', 'camp', 'barrel', 2.2, 2.7);
      k.roomPoint(0, 0.3, 'cabin room');
    },
  },
  shack: {
    tier: 'camp', w: 5, d: 6, stories: 1,
    build(k, rng, col) {
      const doorAt = (rng() - 0.5) * 1.6;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({
        story: 0, color: col,
        door: { face: 'S', at: doorAt, leafColor: doorCol(rng) },
        windows: [{ face: 'N', at: 0 }],
      });
      k.roofShed(0.7, 0x4a3a30, col);
      furn(k, '', 'camp', 'crate', -1.3, -2.1, 2);
      furn(k, '', 'camp', 'barrel', 1.5, 2.0);
      k.roomPoint(0, 0, 'shack room');
    },
  },
  shed: {
    tier: 'camp', w: 4, d: 3, stories: 1,
    build(k, rng, col) {
      void rng;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({ story: 0, color: col, door: { face: 'S', at: 0, leafColor: 0x6b5335 } });
      k.roofShed(0.5, 0x4a3a30, col);
      furn(k, '', 'camp', 'toolbox', -1.2, -0.9);
      furn(k, '', 'camp', 'crate', 1.1, 0.8);
      k.roomPoint(0, 0.2, 'shed');
    },
  },
  leanto: {
    tier: 'camp', w: 4, d: 4, stories: 1,
    build(k, rng, col) {
      void rng;
      k.foundation();
      k.floorSlab(0);
      k.perimeter({ story: 0, color: col, open: ['S'] });
      k.post(-1.8, 1.8, -0.1, 3.0, 0x4a3826, 0.16);
      k.post(1.8, 1.8, -0.1, 3.0, 0x4a3826, 0.16);
      k.beam('x', 1.9, -2, 2, 3.0, 0x5a4632, 0.2);
      k.openEntrance('S', 0, 3.6);
      k.roofShed(0.6, 0x4a3a30, col);
      furn(k, '', 'camp', 'cooler', -1.0, -1.2);
      furn(k, '', 'camp', 'crate', 1.2, -1.0, 1);
      k.roomPoint(0, -0.3, 'lean-to');
    },
  },
  ruin: {
    tier: 'suburban', w: 8, d: 7, stories: 1,
    build(k, rng, col) {
      k.foundation();
      k.floorSlab(0);
      const t = 0.3;
      const hd = 3.5;
      const hw = 4;
      const jit = () => 1.25 + rng() * 0.75;
      k.wall({ axis: 'x', at: -hd + t / 2, from: -hw, to: hw, story: 0, color: col, exterior: true, h: jit() });
      k.wall({
        axis: 'x', at: hd - t / 2, from: -hw, to: hw, story: 0, color: col, exterior: true, h: 1.9,
        openings: [{ at: 0.8, w: 1.1, type: 'bay', h: 1.6 }],
      });
      k.wall({ axis: 'z', at: hw - t / 2, from: -hd, to: hd, story: 0, color: col, exterior: true, h: jit() });
      k.wall({ axis: 'z', at: -hw + t / 2, from: -hd, to: hd, story: 0, color: col, exterior: true, h: jit() });
      furn(k, '', 'suburban', 'toolbox', 1.5, 1.0, 2);
      furn(k, '', 'suburban', 'crate', -1.5, -1.2);
      k.roomPoint(0, 0, 'ruin');
    },
  },
};

const WALL_COLORS: Record<ArchName, number> = {
  ranch: 0x9fb4a4, ranch2: 0xb8b0a0, farmhouse: 0x8a4a3c, bungalow: 0xa8b6c2,
  richhouse: 0xc2b49a, garage: 0x8b9096, beach: 0x9fd8c9, trailer: 0xb0a89a,
  apartment: 0x9a8f80, cabin: 0x6e5a3e, shack: 0x5a4a38, shed: 0x77685a,
  leanto: 0x6e5a3e, ruin: 0x8a7f72,
};

// ------------------------------------------------------------------- results

export interface HouseResult {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: Collider; group: THREE.Group }[];
  /** Kit buildings for the QA gate (keepers are legacy — not included). */
  buildings: KitBuilding[];
}

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
    const def = ARCHS[p.arch];
    const swap = p.rotQ % 2 === 1;
    const grow = (def.padGrow ?? 0) + (p.arch === 'beach' ? 1.5 : 0);
    out.push({
      cx: poi[0] + p.dx,
      cz: poi[1] + p.dz,
      hw: (swap ? def.d : def.w) / 2 + grow,
      hd: (swap ? def.w : def.d) / 2 + grow,
    });
  }
  return out;
}

type GroundY = (x: number, z: number) => number;

function buildKitHouse(
  id: string,
  p: Placement,
  cx: number,
  cz: number,
  groundY: GroundY,
  rng: Rng,
): ReturnType<Kit['finalize']> {
  const def = ARCHS[p.arch];
  const corners: [number, number][] = [
    [cx - def.w / 2, cz - def.d / 2], [cx + def.w / 2, cz - def.d / 2],
    [cx - def.w / 2, cz + def.d / 2], [cx + def.w / 2, cz + def.d / 2],
  ];
  const base = Math.min(...corners.map(([x, z]) => groundY(x, z))) - 0.08;
  const k = new Kit(id, cx, cz, p.rotQ, base, def.w, def.d, def.stories);
  // slight per-house tint so the same archetype doesn't read as clones
  const tintShift = (rng() - 0.5) * 0.06;
  const wallCol = new THREE.Color(WALL_COLORS[p.arch]).offsetHSL(0, 0, tintShift).getHex();
  def.build(k, rng, wallCol);
  const res = k.finalize();
  stampIds(res.containers, id);
  return res;
}

/** House container ids keep the legacy scheme: f_h{n}_{kind}_{i}, safes
 *  f_h{n}_safe — old saves' looted sets stay meaningful. */
function stampIds(containers: ContainerDef[], houseId: string): void {
  const counts = new Map<string, number>();
  for (const c of containers) {
    const kind = c.meshKind ?? 'crate';
    if (kind === 'safe') {
      c.id = `f_${houseId}_safe`;
      continue;
    }
    const i = counts.get(kind) ?? 0;
    counts.set(kind, i + 1);
    c.id = `f_${houseId}_${kind}_${i}`;
  }
}

export function buildHouses(
  scene: THREE.Scene,
  seed: number,
  pois: Record<string, [number, number]>,
  groundY: GroundY,
): HouseResult {
  const rng = mulberry32(seed ^ 0x40e587);
  const out: HouseResult = {
    group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [], buildings: [],
  };
  let n = 0;
  for (const p of PLACEMENTS) {
    const poi = pois[p.poi];
    if (!poi) continue;
    const cx = poi[0] + p.dx;
    const cz = poi[1] + p.dz;
    const id = `h${n++}`;
    if (p.keeper) {
      const kept = buildKeeperHouse(id, p.arch, cx, cz, p.rotQ, groundY, rng);
      out.group.add(kept.group);
      out.colliders.push(...kept.colliders);
      out.floors.push(...kept.floors);
      out.containers.push(...kept.containers);
      out.roofs.push(...kept.roofs);
      continue;
    }
    const result = buildKitHouse(id, p, cx, cz, groundY, rng);
    out.group.add(result.group);
    out.colliders.push(...result.colliders);
    out.floors.push(...result.floors);
    out.containers.push(...result.containers);
    out.roofs.push(...result.roofs);
    out.buildings.push(result.building);
  }
  scene.add(out.group);
  return out;
}

// ------------------------------------------------------------ keeper builder
// FROZEN legacy construction for Jonah's camp (cabin / shack / ruin) —
// Ian's keeper order: these structures are not demolished or rebuilt.
// Segment walls with a real door gap, shed roof with end caps, floor
// slab, foundation, furniture loot. Do not extend; new buildings use
// the kit.

interface KeeperSpec {
  w: number; d: number; wallH: number; wallColor: number;
  furniture: { kind: FurnitureKind; lx: number; lz: number; rot: number }[];
  tier: HouseTier;
  ruin?: boolean;
}

const KEEPER_SPECS: Partial<Record<ArchName, KeeperSpec>> = {
  cabin: {
    w: 5.5, d: 6.5, wallH: 2.95, wallColor: 0x6e5a3e, tier: 'camp',
    furniture: [
      { kind: 'cooler', lx: -1.9, lz: -2.5, rot: 0 },
      { kind: 'crate', lx: 1.9, lz: -2.5, rot: 3 },
      { kind: 'barrel', lx: 2.1, lz: 2.6, rot: 0 },
    ],
  },
  shack: {
    w: 4.5, d: 5.5, wallH: 2.8, wallColor: 0x5a4a38, tier: 'camp',
    furniture: [
      { kind: 'crate', lx: -1.2, lz: -2.0, rot: 2 },
      { kind: 'barrel', lx: 1.4, lz: 1.8, rot: 0 },
    ],
  },
  ruin: {
    w: 8, d: 7, wallH: 3.0, wallColor: 0x8a7f72, tier: 'suburban', ruin: true,
    furniture: [
      { kind: 'toolbox', lx: 1.5, lz: 1.0, rot: 2 },
      { kind: 'crate', lx: -1.5, lz: -1.2, rot: 0 },
    ],
  },
};

function keeperBox(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildKeeperHouse(
  id: string,
  arch: ArchName,
  cx: number,
  cz: number,
  rotQ: 0 | 1 | 2 | 3,
  groundY: GroundY,
  rng: Rng,
): { group: THREE.Group; colliders: Collider[]; floors: FloorRect[]; containers: ContainerDef[]; roofs: { bounds: Collider; group: THREE.Group }[] } {
  const spec = KEEPER_SPECS[arch];
  if (!spec) throw new Error(`no keeper spec for ${arch}`);
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
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const floors: FloorRect[] = [];
  const containers: ContainerDef[] = [];
  const roofs: { bounds: Collider; group: THREE.Group }[] = [];
  const t = 0.25;
  const wh = spec.wallH;
  const wallTop = wh - 0.3;
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  const corners: [number, number][] = [
    [cx - hw, cz - hd], [cx + hw, cz - hd], [cx - hw, cz + hd], [cx + hw, cz + hd],
  ];
  const base = Math.min(...corners.map(([x, z]) => groundY(x, z))) - 0.08;
  const tintShift = (rng() - 0.5) * 0.06;
  const wallCol = new THREE.Color(spec.wallColor).offsetHSL(0, 0, tintShift).getHex();

  interface Seg { ax: number; az: number; bx: number; bz: number; hMul: number }
  const segs: Seg[] = [];
  const doorW = 1.0;
  const doorAt = (rng() - 0.5) * spec.w * 0.4;
  const gapLo = doorAt - doorW / 2;
  const gapHi = doorAt + doorW / 2;
  segs.push({ ax: -hw, az: hd, bx: gapLo, bz: hd, hMul: 1 });
  segs.push({ ax: gapHi, az: hd, bx: hw, bz: hd, hMul: 1 });
  segs.push({ ax: -hw, az: -hd, bx: hw, bz: -hd, hMul: 1 });
  segs.push({ ax: -hw, az: -hd, bx: -hw, bz: hd, hMul: 1 });
  segs.push({ ax: hw, az: -hd, bx: hw, bz: hd, hMul: 1 });
  if (spec.ruin) for (const s of segs) s.hMul = 0.45 + rng() * 0.3;
  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    if (len < 0.2) continue;
    const h = wh * s.hMul;
    const alongX = Math.abs(s.bz - s.az) < 1e-6;
    const m = keeperBox(alongX ? len : t, h, alongX ? t : len, wallCol);
    m.position.set((s.ax + s.bx) / 2, h / 2 - 0.3, (s.az + s.bz) / 2);
    group.add(m);
    colliders.push(alongX
      ? aabb(s.ax, s.az - t / 2, s.bx, s.bz + t / 2)
      : aabb(s.ax - t / 2, s.az, s.bx + t / 2, s.bz));
  }
  // door dressing: jambs, header, wall above, leaf ajar (not for ruins)
  if (!spec.ruin) {
    const DOOR_H = 2.05;
    for (const jx of [gapLo, gapHi]) {
      const jamb = keeperBox(0.1, DOOR_H, t + 0.08, 0x4a3826);
      jamb.position.set(jx, DOOR_H / 2, hd);
      group.add(jamb);
    }
    const header = keeperBox(doorW + 0.2, 0.14, t + 0.08, 0x4a3826);
    header.position.set(doorAt, DOOR_H + 0.07, hd);
    group.add(header);
    const aboveH = wallTop - DOOR_H - 0.14;
    if (aboveH > 0.05) {
      const above = keeperBox(doorW, aboveH, t, wallCol);
      above.position.set(doorAt, DOOR_H + 0.14 + aboveH / 2, hd);
      group.add(above);
    }
    const hinge = new THREE.Group();
    hinge.position.set(gapLo + 0.05, 0.07, hd - t / 2 - 0.03);
    hinge.rotation.y = 0.22;
    const leaf = keeperBox(doorW - 0.06, DOOR_H - 0.04, 0.05, 0x6b5335);
    leaf.position.set((doorW - 0.06) / 2, (DOOR_H - 0.04) / 2, 0);
    hinge.add(leaf);
    group.add(hinge);
  }
  // floor slab + foundation
  const floorTop = base + 0.14;
  const slab = keeperBox(spec.w - t, 0.14, spec.d - t, 0x6b5136);
  slab.position.set(0, 0.07, 0);
  group.add(slab);
  floors.push({ ...aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2), y: floorTop });
  const found = keeperBox(spec.w + 0.3, 1.7, spec.d + 0.3, 0x6f6a63);
  found.position.set(0, -0.68, 0);
  group.add(found);
  // shed roof (cabins/shacks): slope + back filler + trapezoid end caps
  if (!spec.ruin) {
    const roofGroup = new THREE.Group();
    const roofCol = new THREE.Color(0x4a3a30).offsetHSL(0, 0, (rng() - 0.5) * 0.05).getHex();
    const rise = 0.8;
    const slope = Math.hypot(spec.d, rise);
    const a = Math.atan2(rise, spec.d);
    const panel = keeperBox(spec.w + 0.5, 0.12, slope + 0.4, roofCol);
    panel.rotation.x = a;
    panel.position.set(0, wallTop + rise / 2 - 0.1, 0);
    roofGroup.add(panel);
    const fascia = keeperBox(spec.w + 0.7, 0.2, 0.07, 0x4a3826);
    fascia.position.set(0, wallTop - 0.12, hd + 0.22);
    roofGroup.add(fascia);
    const filler = keeperBox(spec.w - 0.05, rise + 0.15, 0.1, wallCol);
    filler.position.set(0, wallTop + (rise - 0.15) / 2 - 0.05, -hd + 0.05);
    roofGroup.add(filler);
    const capMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [1, -1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, wallTop - 0.3);
      shape.lineTo(hd, wallTop - 0.3);
      shape.lineTo(hd, wallTop - 0.08);
      shape.lineTo(-hd, wallTop + rise - 0.12);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(geo, capMat);
      m.position.set(sgn * (hw - 0.02), 0, 0);
      m.castShadow = true;
      roofGroup.add(m);
    }
    group.add(roofGroup);
    roofs.push({ bounds: aabb(-hw, -hd, hw, hd), group: roofGroup });
  }
  spec.furniture.forEach((f, i) => {
    const [wx, wz] = pt(f.lx, f.lz);
    const [hx, hz] = FURNITURE_HALF[f.kind];
    const rotated = rotQ % 2 === 1;
    colliders.push({ x0: wx - (rotated ? hz : hx), z0: wz - (rotated ? hx : hz), x1: wx + (rotated ? hz : hx), z1: wz + (rotated ? hx : hz) });
    containers.push({
      id: `f_${id}_${f.kind}_${i}`,
      x: wx, z: wz,
      loot: FURNITURE_LOOT[f.kind][spec.tier] as ContainerDef['loot'],
      label: FURNITURE_LABEL[f.kind],
      meshKind: f.kind,
      rotY: f.rot * Math.PI * 0.5 + rotQ * Math.PI * 0.5,
    });
  });
  group.position.set(cx, base, cz);
  group.rotation.y = (rotQ * Math.PI) / 2;
  return { group, colliders, floors, containers, roofs };
}
