// Lighthouse.ts — the lighthouse REBUILT on the BUILDING_STRATEGY kit
// (map phase, per the strategy's defect backlog). The legacy tower was
// a decorative cylinder stack: the lamp room floated disconnected, the
// shell had no colliders (you could walk through it), and the Keeper
// conversation was staged inside the broken shell.
//
// The V4 tower is one connected kit building: a square 8x8 shaft, six
// stories of switchback stairs inside (every flight audited: risers,
// treads, stairwell holes), a finished ground-floor watch room where
// Kowalski actually stands, and a lamp room you reach by climbing —
// glass band on all four faces, collar beams at its base, pyramid cap.
// The QA gate (kitQa) audits the whole thing like every other building.

import * as THREE from 'three';
import { FURNITURE_LOOT } from '../data/items';
import { Kit, floorTopLocal, type KitResult } from './kit';

type GroundY = (x: number, z: number) => number;

export interface LighthouseBuild {
  result: KitResult;
  /** World Y of the lamp center — the beam pivot + lamp light anchor. */
  lampAnchorY: number;
  /** World Y of the lamp room floor — the beacon + reach gates read it. */
  lampRoomFloorY: number;
}

const WHITE = 0xd8d4c8;
const RED = 0x8e2f28;
const TRIM = 0x4a3826;

// the stair strip runs along the east wall, switchbacking every story
const STRIP = { x: 3.05, hole: { x0: 2.35, z0: -2.5, x1: 3.8, z1: 2.5 } };

export function buildLighthouse(cx: number, cz: number, groundY: GroundY): LighthouseBuild {
  const w = 8;
  const d = 8;
  const stories = 7; // 6 shaft stories + the lamp room
  const corners: [number, number][] = [
    [cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2],
    [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2],
  ];
  const base = Math.min(...corners.map(([x, z]) => groundY(x, z))) - 0.08;
  const k = new Kit('lighthouse', cx, cz, 0, base, w, d, stories);
  const storyCol = (s: number) => (s % 2 === 0 ? WHITE : RED);

  k.foundation(0x6f6a63);
  k.floorSlab(0);

  // ground floor: the finished watch room — real door, Kowalski inside
  k.perimeter({
    story: 0, color: storyCol(0), trim: TRIM,
    door: { face: 'S', at: 0, leafColor: RED },
    windows: [{ face: 'W', at: 0 }, { face: 'N', at: 0 }, { face: 'E', at: -2, w: 1.0 }],
  });
  k.furnish({
    kind: 'cabinets', lx: -2.9, lz: -3.0, id: 'keeper_desk',
    loot: FURNITURE_LOOT.bookshelf.suburban, label: "Search keeper's desk",
  });
  k.furnish({ kind: 'bookshelf', lx: -3.15, lz: 0.6, id: 'keeper_shelf', loot: FURNITURE_LOOT.bookshelf.suburban });
  k.furnish({ kind: 'crate', lx: 0.4, lz: -3.2, id: 'keeper_crate', loot: FURNITURE_LOOT.crate.camp });
  k.npcPoint(-1.8, 1.0); // Kowalski stands in the watch room (Interact places him here)
  k.roomPoint(0, 0.5, 'watch room');

  // the climb: switchback flights, one per story, holes in every slab
  const faces: ('N' | 'E' | 'S' | 'W')[] = ['N', 'E', 'S', 'W', 'N'];
  for (let s = 0; s < 6; s++) {
    const even = s % 2 === 0;
    k.stairs({ x: STRIP.x, z: even ? 2.4 : -2.4, dir: even ? 'nz' : 'pz', story: s, runLen: 4.8 });
    k.floorSlabStairwell(s + 1, [STRIP.hole]);
    if (s + 1 < 6) {
      k.perimeter({
        story: s + 1, color: storyCol(s + 1), trim: TRIM,
        windows: [{ face: faces[s], at: 0, w: 1.0 }],
      });
    }
    if (s > 0) k.roomPoint(-1.5, 0, `landing ${s}`);
  }
  // tower stores on the climb (loot preserved + one new cache mid-tower)
  k.furnish({
    kind: 'crate', lx: -2.9, lz: -3.0, story: 2, id: 'c_light_tower',
    loot: [
      { id: 'armor_plate', min: 1, max: 2, chance: 0.6 },
      { id: 'engine_part', min: 1, max: 1, chance: 0.6 },
      { id: 'gun_parts', min: 1, max: 2, chance: 0.6 },
    ],
    label: 'Search tower stores',
  });
  k.furnish({ kind: 'cooler', lx: -2.9, lz: 3.0, story: 3, id: 'c_light_bunk', loot: FURNITURE_LOOT.cooler.camp });
  k.furnish({
    kind: 'crate', lx: 0.5, lz: -3.1, story: 4, id: 'c_light_spares',
    loot: [
      { id: 'scrap', min: 1, max: 3, chance: 0.8 },
      { id: 'wire', min: 1, max: 2, chance: 0.6 },
    ],
    label: 'Search spare parts',
  });

  // the lamp room: glass band on every face, collar beams at its base
  for (const [axis, at] of [['x', 3.7], ['x', -3.7]] as ['x', number][]) {
    k.beam(axis, at, -4, 4, 17.92, TRIM, 0.24);
  }
  for (const [axis, at] of [['z', 3.7], ['z', -3.7]] as ['z', number][]) {
    k.beam(axis, at, -4, 4, 17.92, TRIM, 0.24);
  }
  k.perimeter({
    story: 6, color: storyCol(6), trim: TRIM,
    windows: [
      { face: 'S', at: 0, w: 2.6 }, { face: 'N', at: 0, w: 2.6 },
      { face: 'E', at: 0, w: 2.6 }, { face: 'W', at: 0, w: 2.6 },
    ],
  });
  k.roofPyramid(1.6, RED);
  k.furnish({
    kind: 'crate', lx: 2.9, lz: 2.9, story: 6, id: 'c_light_lamp',
    loot: [
      { id: 'flare', min: 1, max: 2, chance: 0.8 },
      { id: 'ammo_rifle', min: 2, max: 4, chance: 0.5 },
    ],
    label: 'Search lamp stores',
  });
  k.roomPoint(0, 0, 'lamp room');

  // the lamp itself: housing + glass + emissive core (detail meshes)
  const lampBaseY = floorTopLocal(6);
  const housing = k.box(3.4, 0.22, 3.4, 0x3a3f45, 0, lampBaseY + 0.11, 0);
  void housing;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.45, 1.5, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xbfe3ff, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, roughness: 0.2,
    }),
  );
  glass.position.set(0, lampBaseY + 0.95, 0);
  k.addDetail(glass);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 1.6, roughness: 0.4,
    }),
  );
  core.position.set(0, lampBaseY + 0.95, 0);
  k.addDetail(core);

  const result = k.finalize();
  return {
    result,
    lampAnchorY: base + lampBaseY + 0.95,
    lampRoomFloorY: base + lampBaseY,
  };
}
