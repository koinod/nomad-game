// Airfield.ts — the AIRFIELD rebuilt from scratch on the BUILDING_STRATEGY
// kit (environment wave). The original complex (wave-built boxes with
// floating roofs and fake door gaps) was demolished in the TOTAL PURGE;
// what returns is three closed-solid kit buildings on the surveyed
// plateau (AIRBASE_GRADE — the terrain formula kept the grade intact):
//
//   - the HANGAR: 36x26, two-story walls, a 20 m open front (posts carry
//     the gable), a proper ^ roof — no more V-roofs, no see-through
//     slabs, openings are cuts in continuous walls.
//   - the MAINT-BAY depot: 30x14, two vehicle bays (one shuttered), a
//     personnel door, high shop windows, workbenches + parts loot.
//   - the CONTROL TOWER: 7x7, four stories of switchback stairs to a
//     glazed cab under a flat parapet roof.
//
// Every building goes through the same kitQa audit as the lighthouse
// (connectivity, collider coverage, stair holes, reachability).
// INTEGRATION STATE: built + audited, NOT yet wired into World.build —
// kit buildings integrate on the main agent's gate verdict, like every
// model this wave.

import * as THREE from 'three';
import { FURNITURE_LOOT } from '../data/items';
import { Kit, type KitResult } from './kit';
import { AIRBASE_CENTER, AIRBASE_GRADE } from './World';

type GroundY = (x: number, z: number) => number;

export interface AirfieldBuild {
  results: KitResult[];
  /** Runway + apron ground works (asphalt at grade, markings). */
  groundGroup: THREE.Group;
  /** Building ids in results order. */
  ids: string[];
}

const CONCRETE = 0x8a8d90;
const STEEL = 0x5d6a72;
const STEEL_DARK = 0x424c52;
const ROOF = 0x3c444a;
const TRIM = 0x2e3438;
const GLASSY = 0x9fc4d8;

/** Plan positions on the plateau (relative to AIRBASE_CENTER, meters).
 *  The plateau's flat core is ~±120 x ±70 around the center. */
export const AIRFIELD_LAYOUT = {
  hangar: { dx: -18, dz: -34, rot: 0 as const },
  depot: { dx: -34, dz: 26, rot: 0 as const },
  tower: { dx: 52, dz: 18, rot: 0 as const },
};

function baseAt(cx: number, cz: number, groundY: GroundY): number {
  // the plateau is formula-flat; take the min corner so foundations seat
  return Math.min(
    groundY(cx - 2, cz - 2), groundY(cx + 2, cz - 2),
    groundY(cx - 2, cz + 2), groundY(cx + 2, cz + 2),
  ) - 0.06;
}

function buildHangar(cx: number, cz: number, groundY: GroundY): KitResult {
  const k = new Kit('airfield_hangar', cx, cz, 0, baseAt(cx, cz, groundY), 36, 26, 2);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  // ground story: back + side walls solid; the front (S) is the great
  // opening — posts carry it, per the strategy's open-front hangar form
  k.perimeter({
    story: 0, color: STEEL, trim: TRIM,
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
  // posts carrying the open front (both stories read as one opening)
  for (const px of [-17.6, -8.8, 0, 8.8, 17.6]) {
    k.post(px, 12.85, 0, 6.0, STEEL_DARK, 0.35);
  }
  k.beam('x', 12.85, -18, 18, 5.9, STEEL_DARK, 0.4);
  k.openEntrance('S', 0, 20);
  k.roofGable(3.6, ROOF, STEEL);
  // stores along the back wall (loot tables preserved from the old hangar)
  k.furnish({ kind: 'toolbox', lx: -15, lz: -11, id: 'hangar_toolbox', loot: FURNITURE_LOOT.toolbox.suburban });
  k.furnish({ kind: 'cabinets', lx: 15, lz: -11, id: 'hangar_cabinet', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search parts cabinet' });
  k.furnish({ kind: 'crate', lx: 10, lz: 8, id: 'hangar_crate', loot: FURNITURE_LOOT.crate.suburban });
  k.roomPoint(0, 0, 'hangar floor');
  k.roomPoint(-12, -8, 'hangar stores');
  return k.finalize();
}

function buildDepot(cx: number, cz: number, groundY: GroundY): KitResult {
  const k = new Kit('airfield_depot', cx, cz, 0, baseAt(cx, cz, groundY), 30, 14, 1);
  k.foundation(0x74706a);
  k.floorSlab(0, CONCRETE);
  k.perimeter({
    story: 0, color: CONCRETE, trim: TRIM,
    door: { face: 'E', at: 0, leafColor: STEEL_DARK },
    bays: [
      { face: 'S', at: -7.5, w: 4.4, h: 3.0 },
      { face: 'S', at: 7.5, w: 4.4, h: 3.0, shut: true },
    ],
    windows: [
      { face: 'N', at: -9, w: 1.8, sill: 1.7, head: 2.6 },
      { face: 'N', at: 0, w: 1.8, sill: 1.7, head: 2.6 },
      { face: 'N', at: 9, w: 1.8, sill: 1.7, head: 2.6 },
      { face: 'W', at: 0, w: 1.8, sill: 1.7, head: 2.6 },
    ],
  });
  // stores half / workshop half, passage between
  k.divider({ axis: 'z', at: 3, from: -7, to: 7, color: CONCRETE, doorAt: 0 });
  k.roofFlat(ROOF, TRIM);
  k.furnish({ kind: 'toolbox', lx: -11, lz: -4, id: 'depot_toolbox_1', loot: FURNITURE_LOOT.toolbox.suburban, label: 'Search toolbox' });
  k.furnish({ kind: 'bookshelf', lx: -6, lz: -6.2, id: 'depot_parts_shelf', loot: FURNITURE_LOOT.bookshelf.suburban, label: 'Search parts shelf' });
  k.furnish({ kind: 'cabinets', lx: 9, lz: -6.2, id: 'depot_cabinet', loot: FURNITURE_LOOT.cabinets.suburban, label: 'Search parts cabinet' });
  k.furnish({ kind: 'crate', lx: -13, lz: 4.5, id: 'depot_crate', loot: FURNITURE_LOOT.crate.suburban, label: 'Search crate' });
  k.roomPoint(-7, 0, 'depot stores');
  k.roomPoint(9, 2, 'depot workshop');
  return k.finalize();
}

function buildTower(cx: number, cz: number, groundY: GroundY): KitResult {
  const w = 7;
  const stories = 4;
  const k = new Kit('airfield_tower', cx, cz, 0, baseAt(cx, cz, groundY), w, w, stories);
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

/** Runway + apron: flat asphalt works seated ON the grade (the plateau
 *  formula keeps the whole strip at AIRBASE_GRADE). */
function buildGroundWorks(): THREE.Group {
  const g = new THREE.Group();
  const [cx, cz] = AIRBASE_CENTER;
  const y = AIRBASE_GRADE + 0.03;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.96 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.9 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(190, 0.06, 17), asphalt);
  strip.position.set(cx + 10, y, cz - 62);
  strip.receiveShadow = true;
  g.add(strip);
  // threshold bars + centerline dashes
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.075, 1.1), paint);
      bar.position.set(cx + 10 + sx * 90, y + 0.005, cz - 62 - 5.4 + i * 3.6);
      g.add(bar);
    }
  }
  for (let i = 0; i < 11; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(6, 0.075, 0.55), paint);
    dash.position.set(cx + 10 - 75 + i * 15, y + 0.005, cz - 62);
    g.add(dash);
  }
  // apron in front of the hangar
  const apron = new THREE.Mesh(new THREE.BoxGeometry(52, 0.06, 30), asphalt);
  apron.position.set(cx + AIRFIELD_LAYOUT.hangar.dx, y, cz + AIRFIELD_LAYOUT.hangar.dz + 24);
  apron.receiveShadow = true;
  g.add(apron);
  return g;
}

/** Build the whole airfield on its plateau. Pure construction — the
 *  caller (World, post-gate) adds groups + merges colliders/floors. */
export function buildAirfield(groundY: GroundY): AirfieldBuild {
  const [cx, cz] = AIRBASE_CENTER;
  const L = AIRFIELD_LAYOUT;
  const results = [
    buildHangar(cx + L.hangar.dx, cz + L.hangar.dz, groundY),
    buildDepot(cx + L.depot.dx, cz + L.depot.dz, groundY),
    buildTower(cx + L.tower.dx, cz + L.tower.dz, groundY),
  ];
  return {
    results,
    groundGroup: buildGroundWorks(),
    ids: results.map((r) => r.building.id),
  };
}
