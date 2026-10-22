// Airfield.ts — the AIRBASE structures, built on the BUILDING_STRATEGY
// kit (true cutouts in continuous walls, closed solids, recorded pieces
// the kitQa gate audits). REVAMPED 2026-10-21 on Ian's order — "respawn
// all vehicles at a revamped airbase properly made" — which un-parked
// airbase construction specifically (the rest of the building stock
// stays parked). The gate-held defects of the first kit pass are fixed
// by construction here:
//
//   - HANGAR (36x26, two stories): drive-in mouth is a true 20 m clear
//     span — the center post is GONE (posts flank it at ±10.4/±17.6),
//     beam), the entrance record carries the REAL clear height (5.5 m
//     under the beam — clears the Prime's 3.92 m with room), and the
//     posts themselves collide. A personnel door in the E wall; the
//     interior drive lane stays furniture-free (asserted in the gate).
//   - OPS / DEPOT (30x14): rebuilt around a worked interior — workshop
//     west (open vehicle bay, benches, parts), ops office east with the
//     QUARTERMASTER's armory counter (his NPC placement anchors to the
//     kit npcPoint behind it), a glass slider to the apron, and a real
//     window schedule on every face. The daylight audit (kitQa) proves
//     no room sits beyond an opening's throw — the pitch-black-depot
//     class does not come back.
//   - CONTROL TOWER (7x7, four stories): the first pass's best piece,
//     kept — switchback stairs, glazed cab, flat parapet roof.
//   - FUEL POINT (12x9 canopy): four posts carry a service canopy at
//     4.7 m clear (real fuel-canopy height — the Prime fuels here too),
//     pump island with collision, a searchable fuel-drum cache.
//
// Floors are single slabs (one box, one floor record — no tiling, no
// striping) in every building.
//
// PORTABLE: builders take an absolute center + quarter-turn from the
// site data (airbaseSite.ts) — nothing here knows where the airbase
// sits. Ground works (runway/apron/pads) live in airbase.ts.

import { FURNITURE_LOOT } from '../data/items';
import { Kit, type KitResult } from './kit';
import {
  AIRBASE_BUILDINGS, AIRBASE_SITE,
  siteToWorld, type AirbaseSite,
} from './airbaseSite';

type GroundY = (x: number, z: number) => number;

export interface AirfieldBuild {
  results: KitResult[];
  /** Building ids in results order. */
  ids: string[];
}

const CONCRETE = 0x8a8d90;
const STEEL = 0x5d6a72;
const STEEL_DARK = 0x424c52;
const ROOF = 0x3c444a;
const TRIM = 0x2e3438;
const GLASSY = 0x9fc4d8;

/** @deprecated Site data lives in airbaseSite.ts (AIRBASE_BUILDINGS);
 *  kept as a derived view for the old import path. */
export const AIRFIELD_LAYOUT = {
  hangar: { dx: -18, dz: -34, rot: 0 as const },
  depot: { dx: -34, dz: 26, rot: 0 as const },
  tower: { dx: 52, dz: 18, rot: 0 as const },
};

function baseAt(cx: number, cz: number, groundY: GroundY): number {
  // the pad is formula-flat; take the min corner so foundations seat
  return Math.min(
    groundY(cx - 2, cz - 2), groundY(cx + 2, cz - 2),
    groundY(cx - 2, cz + 2), groundY(cx + 2, cz + 2),
  ) - 0.06;
}

function buildHangar(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('airfield_hangar', cx, cz, rot, baseAt(cx, cz, groundY), 36, 26, 2);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  // ground story: back + side walls solid; the front (S) is the great
  // opening — posts carry it, per the strategy's open-front hangar form.
  // A personnel door in the E wall for foot traffic.
  k.perimeter({
    story: 0, color: STEEL, trim: TRIM,
    door: { face: 'E', at: 8, leafColor: STEEL_DARK },
    windows: [
      { face: 'N', at: -10, w: 2.2, sill: 1.6, head: 2.6 },
      { face: 'N', at: 0, w: 2.2, sill: 1.6, head: 2.6 },
      { face: 'N', at: 10, w: 2.2, sill: 1.6, head: 2.6 },
    ],
    open: ['S'],
  });
  // upper story: clerestory band all around, front open too (the gable
  // triangle closes it above — see roofGable)
  k.perimeter({
    story: 1, color: STEEL, trim: TRIM,
    windows: [
      { face: 'N', at: -12, w: 3.0, sill: 0.7, head: 2.2 },
      { face: 'N', at: 12, w: 3.0, sill: 0.7, head: 2.2 },
      { face: 'E', at: 0, w: 3.0, sill: 0.7, head: 2.2 },
      { face: 'W', at: 0, w: 3.0, sill: 0.7, head: 2.2 },
    ],
    open: ['S'],
  });
  // posts carrying the open front — NONE inside the mouth: the middle
  // 20 m is the drive-in span, posts flank it at ±10.4 (faces clear of
  // the span), and the entrance record below states its true clear
  // height (beam underside at 5.9 - 0.4 = 5.5 m). Posts collide: a truck
  // must not ghost through the structure that holds the roof.
  for (const px of [-17.6, -10.4, 10.4, 17.6]) {
    k.post(px, 12.85, 0, 6.0, STEEL_DARK, 0.35);
    k.obstacle(px, 12.85, 0.22, 0.22);
  }
  k.beam('x', 12.85, -18, 18, 5.9, STEEL_DARK, 0.4);
  k.openEntrance('S', 0, 20, 5.5);
  k.roofGable(3.6, ROOF, STEEL);
  // stores along the back wall — the drive lane (|lx| <= 5) stays clear
  k.furnish({ kind: 'toolbox', lx: -15, lz: -11, id: 'hangar_toolbox', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'cabinets', lx: 15, lz: -11, id: 'hangar_cabinet', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search parts cabinet' });
  k.furnish({ kind: 'crate', lx: 10, lz: 8, id: 'hangar_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(0, 0, 'hangar floor');
  k.roomPoint(-12, -8, 'hangar stores');
  return k.finalize();
}

function buildOps(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const k = new Kit('airfield_depot', cx, cz, rot, baseAt(cx, cz, groundY), 30, 14, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: [
      { face: 'E', at: -3, leafColor: STEEL_DARK },
      { face: 'S', at: 11, w: 1.8, kind: 'slider' },
    ],
    bays: [
      { face: 'S', at: -7.5, w: 4.4, h: 3.0 },
      { face: 'S', at: 7.5, w: 4.4, h: 3.0, shut: true },
    ],
    windows: [
      { face: 'N', at: -9, w: 1.8, sill: 1.7, head: 2.6 },
      { face: 'N', at: 0, w: 1.8, sill: 1.7, head: 2.6 },
      { face: 'N', at: 9, w: 2.4, sill: 1.0, head: 2.5 },
      { face: 'S', at: -12.5, w: 1.8, sill: 1.2, head: 2.5 },
      { face: 'W', at: 0, w: 2.0, sill: 1.1, head: 2.5 },
      { face: 'E', at: 3.5, w: 2.0, sill: 1.0, head: 2.5 },
    ],
  });
  // workshop west / ops office east, passage between
  k.divider({ axis: 'z', at: 3, from: -7, to: 7, color: CONCRETE, doorAt: 0 });
  k.roofFlat(ROOF, TRIM);
  // the armory counter: a freestanding peninsula in the office — the
  // Quartermaster stands behind it (npcPoint), crews front it from the
  // room. Visual boxes + a real collider; not a loot container (his
  // trade UI is the counter's function, not a search).
  k.box(3.2, 1.02, 0.85, 0x6e5a41, 9, 0.65, -2);
  k.box(3.4, 0.07, 1.0, 0x4a3826, 9, 1.19, -2);
  k.obstacle(9, -2, 1.65, 0.45);
  k.npcPoint(9, -3.4);
  k.furnish({ kind: 'toolbox', lx: -11, lz: -4, id: 'depot_toolbox_1', loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search toolbox' });
  k.furnish({ kind: 'bookshelf', lx: -6, lz: -6.2, id: 'depot_parts_shelf', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search parts shelf' });
  k.furnish({ kind: 'cabinets', lx: 12.5, lz: -6.2, id: 'depot_cabinet', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search armory stores' });
  k.furnish({ kind: 'crate', lx: -13, lz: 4.5, id: 'depot_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search crate' });
  k.roomPoint(-7, 0, 'depot workshop');
  k.roomPoint(9, 2.5, 'ops office');
  return k.finalize();
}

function buildTower(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const w = 7;
  const stories = 4;
  const k = new Kit('airfield_tower', cx, cz, rot, baseAt(cx, cz, groundY), w, w, stories);
  k.foundation(0x74706a);
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: 'S', at: 0, leafColor: STEEL_DARK },
    windows: [{ face: 'W', at: 0, w: 1.0 }, { face: 'E', at: 0, w: 1.0 }],
  });
  // switchback climb, lighthouse pattern: flight per story along the
  // east wall, holes cut in every slab above
  const hole = { x0: 2.0, z0: -2.4, x1: 3.4, z1: 2.4 };
  for (let s = 0; s < stories - 1; s++) {
    const even = s % 2 === 0;
    k.stairs({ x: 2.7, z: even ? 2.3 : -2.3, dir: even ? 'nz' : 'pz', story: s, runLen: 4.6 });
    if (s + 1 < stories - 1) {
      k.floorSlabStairwell(s + 1, [hole]);
      k.perimeter({
        story: s + 1, color: CONCRETE, trim: TRIM,
        windows: [{ face: s % 2 ? 'E' : 'W', at: 0, w: 1.0 }],
      });
    }
    k.roomPoint(-1.2, 0, `tower landing ${s + 1}`);
  }
  // the cab: glass band on every face under a flat parapet roof
  k.floorSlabStairwell(stories - 1, [hole]);
  k.perimeter({
    story: stories - 1, color: STEEL, trim: TRIM, glassColor: GLASSY,
    windows: [
      { face: 'N', at: 0, w: 4.6, sill: 0.8, head: 2.7 },
      { face: 'S', at: 0, w: 4.6, sill: 0.8, head: 2.7 },
      { face: 'E', at: 0, w: 4.6, sill: 0.8, head: 2.7 },
      { face: 'W', at: 0, w: 4.6, sill: 0.8, head: 2.7 },
    ],
  });
  k.roofFlat(ROOF, TRIM);
  k.furnish({ kind: 'cabinets', lx: -2.6, lz: -2.6, id: 'tower_cabinet', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search tower cabinet' });
  k.roomPoint(0, 0, 'tower cab');
  k.npcPoint(-1.5, 1.5);
  return k.finalize();
}

function buildFuelPoint(cx: number, cz: number, rot: 0 | 1 | 2 | 3, groundY: GroundY): KitResult {
  const baseY = baseAt(cx, cz, groundY);
  const k = new Kit('airbase_fuel', cx, cz, rot, baseY, 12, 9, 1);
  // four posts carry the canopy — 4.7 m clear, real service-canopy
  // height (the NOMAD modeling standard cites 4.3-4.9 m; the Prime at
  // 3.92 m fuels under it with room to spare)
  for (const px of [-5.2, 5.2]) {
    for (const pz of [-3.7, 3.7]) {
      k.post(px, pz, -0.1, 4.7, STEEL_DARK, 0.22);
      k.obstacle(px, pz, 0.16, 0.16);
    }
  }
  k.roofCanopy(0xb9bdc0, 0x8a3a30, 4.7);
  // pump island: raised pad, two pumps, real collision
  k.box(3.4, 0.18, 1.1, CONCRETE, 0, 0.09, 0);
  k.box(0.62, 1.15, 0.5, 0x8a3a30, -0.9, 0.75, 0);
  k.box(0.62, 1.15, 0.5, STEEL, 0.9, 0.75, 0);
  k.obstacle(0, 0, 1.75, 0.6);
  // the drum cache beside the canopy — the fuel point's working stock
  k.box(0.62, 0.92, 0.62, STEEL, 7.6, 0.46, 2.6);
  k.box(0.62, 0.92, 0.62, 0x8a3a30, 8.3, 0.46, 3.3);
  k.box(0.62, 0.92, 0.62, STEEL_DARK, 7.7, 0.46, 3.9);
  k.container({
    id: 'fuel_drums', lx: 8, lz: 3.2,
    loot: [
      { id: 'fuel_can', min: 1, max: 2, chance: 0.9 },
      { id: 'gun_oil', min: 1, max: 1, chance: 0.4 },
    ],
    label: 'Search fuel drums', searchTime: 2.5, y: baseY + 0.2, collider: true,
  });
  k.openEntrance('S', 0, 6, 4.7);
  return k.finalize();
}

/** Build every airbase structure at the given site. Pure construction —
 *  the caller (World) adds groups + merges colliders/floors. */
export function buildAirfield(groundY: GroundY, site: AirbaseSite = AIRBASE_SITE): AirfieldBuild {
  const builders: Record<string, (cx: number, cz: number, rot: 0 | 1 | 2 | 3, gy: GroundY) => KitResult> = {
    airfield_hangar: buildHangar,
    airfield_depot: buildOps,
    airfield_tower: buildTower,
    airbase_fuel: buildFuelPoint,
  };
  const results = AIRBASE_BUILDINGS.map((spot) => {
    const [cx, cz] = siteToWorld(site, spot.lx, spot.lz);
    const rot = ((spot.rot + site.rotQ) % 4) as 0 | 1 | 2 | 3;
    return builders[spot.id](cx, cz, rot, groundY);
  });
  return { results, ids: results.map((r) => r.building.id) };
}
