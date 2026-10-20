// kitQa.ts — the BUILDING_STRATEGY QA gate, as code. Every kit building
// must pass every applicable audit or it does not ship:
//
// - connectivity: every structural piece touches the assembly (no floaters)
// - colliders:    every exterior wall is solid in plan except at declared
//                 door openings, and no collider blocks a door opening
// - doors:        leaf size, hinge at the jamb, leaf in the wall's plane,
//                 rest pose swings clear of furniture and walls
// - stairs:       riser/tread within code, top lands flush, a stairwell
//                 hole in the slab above covers the flight
// - scale:        story spacing 3.0 m, slab lift 0.14, ceilings >= 2.7 m
// - roofs:        panels meet at the ridge, roof seated on the top plate,
//                 footprint covered
// - reachability: a flood fill over the building's own floors + colliders,
//                 run with the engine's movement rules (step-up 0.55,
//                 minY-gated colliders), must reach every room point and
//                 stand next to every container and NPC point
//
// Pure functions over the recorded KitBuilding — no THREE, no scene.

import type { Collider } from './Colliders';
import { KIT, type KitBuilding, type Piece } from './kit';

export interface QaFailure {
  audit: string;
  building: string;
  msg: string;
}

type GroundY = (x: number, z: number) => number;

const fail = (out: QaFailure[], audit: string, b: KitBuilding, msg: string): void => {
  out.push({ audit, building: b.id, msg });
};

// ------------------------------------------------------------------ helpers

function overlaps1(a0: number, a1: number, b0: number, b1: number, tol = 0): boolean {
  return a0 <= b1 + tol && b0 <= a1 + tol;
}

function pieceTouch(a: Piece, b: Piece): boolean {
  return (
    overlaps1(a.x0, a.x1, b.x0, b.x1, 0.07) &&
    overlaps1(a.z0, a.z1, b.z0, b.z1, 0.07) &&
    overlaps1(a.y0, a.y1, b.y0, b.y1, 0.45)
  );
}

// ------------------------------------------------------------- connectivity

export function auditConnectivity(b: KitBuilding, out: QaFailure[]): void {
  const structural = b.pieces.filter((p) => p.structural);
  if (structural.length === 0) {
    fail(out, 'connectivity', b, 'no structural pieces recorded');
    return;
  }
  const seen = new Set<number>();
  const queue: number[] = [];
  structural.forEach((p, i) => {
    // roots: the foundation, and anything standing on the ground itself
    if (p.kind === 'foundation' || p.y0 <= b.baseY + 0.05) {
      seen.add(i);
      queue.push(i);
    }
  });
  while (queue.length) {
    const i = queue.pop()!;
    for (let j = 0; j < structural.length; j++) {
      if (seen.has(j)) continue;
      if (pieceTouch(structural[i], structural[j])) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  let floaters = 0;
  structural.forEach((p, i) => {
    if (!seen.has(i)) {
      floaters++;
      if (floaters <= 4) {
        fail(out, 'connectivity', b,
          `floating ${p.kind} piece at x[${p.x0.toFixed(1)},${p.x1.toFixed(1)}] y[${p.y0.toFixed(1)},${p.y1.toFixed(1)}] z[${p.z0.toFixed(1)},${p.z1.toFixed(1)}]`);
      }
    }
  });
  if (floaters > 4) fail(out, 'connectivity', b, `…and ${floaters - 4} more floating pieces`);
}

// ---------------------------------------------------------------- colliders

interface Interval { a0: number; a1: number }

function subtractIntervals(base: Interval, holes: Interval[]): Interval[] {
  let segs = [base];
  for (const h of holes) {
    const next: Interval[] = [];
    for (const s of segs) {
      if (h.a1 <= s.a0 || h.a0 >= s.a1) { next.push(s); continue; }
      if (h.a0 > s.a0) next.push({ a0: s.a0, a1: h.a0 });
      if (h.a1 < s.a1) next.push({ a0: h.a1, a1: s.a1 });
    }
    segs = next;
  }
  return segs.filter((s) => s.a1 - s.a0 > 0.01);
}

function coveredBy(required: Interval[], cover: Interval[], tol: number): Interval | null {
  const sorted = [...cover].sort((a, b) => a.a0 - b.a0);
  for (const req of required) {
    let cur = req.a0;
    for (const c of sorted) {
      if (c.a1 < cur - tol) continue;
      if (c.a0 > cur + tol) break;
      cur = Math.max(cur, c.a1);
      if (cur >= req.a1 - tol) break;
    }
    if (cur < req.a1 - tol) return { a0: cur, a1: req.a1 };
  }
  return null;
}

export function auditColliders(b: KitBuilding, out: QaFailure[]): void {
  // ground-level blockers only (minY-gated pieces belong to upper floors)
  const ground = b.colliders.filter((c) => c.minY === undefined || c.minY <= b.baseY + 1.0);
  for (const ew of b.exteriorWalls) {
    const alongOf = (c: Collider): Interval => (ew.axis === 'x' ? { a0: c.x0, a1: c.x1 } : { a0: c.z0, a1: c.z1 });
    const perpOf = (c: Collider): Interval => (ew.axis === 'x' ? { a0: c.z0, a1: c.z1 } : { a0: c.x0, a1: c.x1 });
    const onWall = ground.filter((c) => {
      const p = perpOf(c);
      return p.a0 <= ew.fixed + 0.03 && p.a1 >= ew.fixed - 0.03 && p.a1 - p.a0 >= 0.1;
    });
    const cover = onWall.map(alongOf);
    const holes = ew.openings.map((o) => ({ a0: o.a0 + 0.03, a1: o.a1 - 0.03 }));
    const required = subtractIntervals({ a0: ew.a0, a1: ew.a1 }, holes);
    const gap = coveredBy(required, cover, 0.07);
    if (gap) {
      fail(out, 'colliders', b,
        `exterior wall (${ew.axis} @ ${ew.fixed.toFixed(1)}) has NO collider over [${gap.a0.toFixed(2)}, ${gap.a1.toFixed(2)}] — a walk-through wall`);
    }
    // and the converse: nothing may block a declared opening
    for (const o of ew.openings) {
      const shrunk = { a0: o.a0 + 0.07, a1: o.a1 - 0.07 };
      if (shrunk.a1 - shrunk.a0 < 0.1) continue;
      for (const c of onWall) {
        const iv = alongOf(c);
        if (iv.a0 < shrunk.a1 - 0.02 && iv.a1 > shrunk.a0 + 0.02) {
          fail(out, 'colliders', b,
            `a collider blocks the door opening at [${o.a0.toFixed(2)}, ${o.a1.toFixed(2)}] on wall (${ew.axis} @ ${ew.fixed.toFixed(1)})`);
          break;
        }
      }
    }
  }
}

// --------------------------------------------------------------------- doors

export function auditDoors(b: KitBuilding, out: QaFailure[]): void {
  const ground = b.colliders.filter((c) => c.minY === undefined || c.minY <= b.baseY + 1.0);
  for (const d of b.doors) {
    if (d.kind !== 'door') continue;
    if (Math.abs(d.h - KIT.DOOR_H) > 0.06) {
      fail(out, 'doors', b, `door at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)}) is ${d.h.toFixed(2)}m high, kit door is ${KIT.DOOR_H}`);
    }
    if (d.interior || d.leafW <= 0) continue;
    if (d.w < KIT.DOOR_W - 0.06 || d.w > KIT.DOOR_W + 0.06) {
      fail(out, 'doors', b, `door opening ${d.w.toFixed(2)}m wide at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)}), kit door is ${KIT.DOOR_W}`);
    }
    if (d.leafW < d.w - 0.13 || d.leafW > d.w - 0.02) {
      fail(out, 'doors', b, `leaf ${d.leafW.toFixed(2)}m does not fit its ${d.w.toFixed(2)}m opening at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)})`);
    }
    // hinge at the jamb: along-axis distance to the nearest opening edge
    const cAlong = d.axis === 'x' ? d.cx : d.cz;
    const hAlong = d.axis === 'x' ? d.hingeX : d.hingeZ;
    const hPerp = d.axis === 'x' ? d.hingeZ : d.hingeX;
    const edgeDist = Math.min(Math.abs(hAlong - (cAlong - d.w / 2)), Math.abs(hAlong - (cAlong + d.w / 2)));
    if (edgeDist > 0.12) {
      fail(out, 'doors', b, `hinge is ${edgeDist.toFixed(2)}m from the jamb at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)})`);
    }
    if (Math.abs(hPerp - d.fixed) > KIT.WALL_T / 2 + 0.13) {
      fail(out, 'doors', b, `hinge sits ${Math.abs(hPerp - d.fixed).toFixed(2)}m off the wall plane at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)})`);
    }
    if (d.leafBox) {
      // the leaf rests INSIDE (opposite the outward normal), in-plane
      const lb = d.leafBox;
      const lcPerp = d.axis === 'x' ? (lb.z0 + lb.z1) / 2 : (lb.x0 + lb.x1) / 2;
      const outPerp = d.axis === 'x' ? d.outward[1] : d.outward[0];
      if ((lcPerp - d.fixed) * outPerp > 0.05) {
        fail(out, 'doors', b, `leaf at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)}) rests OUTSIDE the wall plane`);
      }
      // swing-clear at rest: the leaf may not intersect any ground
      // collider. The recorded box is the AABB of a tilted thin plane —
      // shrink it back to the plane's real extent and require true
      // penetration (>3cm both axes); resting against its own wall
      // face (a ~2cm AABB graze) is the intended pose, while a divider
      // end or a dresser in the swing path penetrates far deeper.
      const sb = { x0: lb.x0 + 0.035, x1: lb.x1 - 0.035, z0: lb.z0 + 0.035, z1: lb.z1 - 0.035 };
      for (const c of ground) {
        const ox = Math.min(sb.x1, c.x1) - Math.max(sb.x0, c.x0);
        const oz = Math.min(sb.z1, c.z1) - Math.max(sb.z0, c.z0);
        if (ox > 0.03 && oz > 0.03) {
          fail(out, 'doors', b,
            `leaf at (${d.cx.toFixed(1)}, ${d.cz.toFixed(1)}) rests inside a collider [${c.x0.toFixed(1)},${c.z0.toFixed(1)}]-[${c.x1.toFixed(1)},${c.z1.toFixed(1)}]`);
          break;
        }
      }
    }
  }
}

// -------------------------------------------------------------------- stairs

export function auditStairs(b: KitBuilding, out: QaFailure[]): void {
  for (const s of b.stairs) {
    if (s.riser > KIT.RISER_MAX + 0.003) {
      fail(out, 'stairs', b, `riser ${s.riser.toFixed(3)}m exceeds ${KIT.RISER_MAX}`);
    }
    if (s.tread < KIT.TREAD_MIN - 0.003) {
      fail(out, 'stairs', b, `tread ${s.tread.toFixed(3)}m below ${KIT.TREAD_MIN}`);
    }
    if (Math.abs(s.toY - s.fromY - KIT.WALL_H) > 0.03) {
      fail(out, 'stairs', b, `flight rises ${(s.toY - s.fromY).toFixed(2)}m, not one story (${KIT.WALL_H}) — top step cannot land flush`);
    }
    const hole = b.stairHoles.find((h) =>
      Math.abs(h.y - s.toY) <= 0.03 &&
      h.x0 <= s.x0 + 0.06 && h.x1 >= s.x1 - 0.06 &&
      h.z0 <= s.z0 + 0.06 && h.z1 >= s.z1 - 0.06);
    if (!hole) {
      fail(out, 'stairs', b,
        `flight at x[${s.x0.toFixed(1)},${s.x1.toFixed(1)}] z[${s.z0.toFixed(1)},${s.z1.toFixed(1)}] arrives at y=${s.toY.toFixed(2)} with NO stairwell hole in the slab — stairs clip a solid slab`);
    }
  }
}

// --------------------------------------------------------------------- scale

export function auditScale(b: KitBuilding, out: QaFailure[]): void {
  // slab floors: big floor rects inside the footprint; their heights must
  // step by exactly one story
  const big = b.floors.filter((f) => (f.x1 - f.x0) * (f.z1 - f.z0) >= 4);
  // cluster heights within 5cm (deck y-offsets, tread tops) before diffing
  const sorted = big.map((f) => f.y).sort((a, c) => a - c);
  const ys: number[] = [];
  for (const y of sorted) {
    if (ys.length === 0 || y - ys[ys.length - 1] > 0.05) ys.push(y);
  }
  for (let i = 1; i < ys.length; i++) {
    const diff = ys[i] - ys[i - 1];
    if (Math.abs(diff - KIT.WALL_H) > 0.04) {
      fail(out, 'scale', b, `floor levels step ${diff.toFixed(2)}m between y=${ys[i - 1].toFixed(2)} and y=${ys[i].toFixed(2)} — story height is ${KIT.WALL_H}`);
    }
  }
  if (KIT.WALL_H - KIT.SLAB_T < 2.7) {
    fail(out, 'scale', b, `ceiling ${(KIT.WALL_H - KIT.SLAB_T).toFixed(2)}m below the 2.7m minimum`);
  }
}

// --------------------------------------------------------------------- roofs

export function auditRoof(b: KitBuilding, out: QaFailure[]): void {
  if (b.roofKind === 'none') return;
  const roofs = b.pieces.filter((p) => p.kind === 'roof');
  const found = b.pieces.find((p) => p.kind === 'foundation');
  if (roofs.length === 0) {
    fail(out, 'roofs', b, `roofKind is ${b.roofKind} but no roof pieces recorded`);
    return;
  }
  for (const r of roofs) {
    if (r.y0 > b.topPlateY + 0.3) {
      fail(out, 'roofs', b, `roof hovers: its underside (y=${r.y0.toFixed(2)}) floats above the top plate (y=${b.topPlateY.toFixed(2)})`);
    }
  }
  if (found) {
    // the roof must cover the footprint (shrunk slightly — eaves vary)
    const ux0 = Math.min(...roofs.map((r) => r.x0));
    const ux1 = Math.max(...roofs.map((r) => r.x1));
    const uz0 = Math.min(...roofs.map((r) => r.z0));
    const uz1 = Math.max(...roofs.map((r) => r.z1));
    if (ux0 > found.x0 + 0.15 || ux1 < found.x1 - 0.15 || uz0 > found.z0 + 0.15 || uz1 < found.z1 - 0.15) {
      fail(out, 'roofs', b, 'roof does not cover the building footprint');
    }
  }
  if (b.roofKind === 'gable' || b.roofKind === 'pyramid') {
    const tops = roofs.map((r) => r.y1);
    const spread = Math.max(...tops) - Math.min(...tops);
    if (spread > 0.18) {
      fail(out, 'roofs', b, `roof panels do not meet: top edges spread ${spread.toFixed(2)}m`);
    }
    if (b.roofKind === 'gable') {
      const gables = b.pieces.filter((p) => p.kind === 'gable');
      if (gables.length < 2) {
        fail(out, 'roofs', b, `gable roof has ${gables.length} gable ends — both ridge-axis faces must be closed`);
      }
    }
  }
}

// --------------------------------------------------------------- reachability

const CELL = 0.25;
const RADIUS = 0.28; // collider clearance (player radius 0.45, cell-tolerant)
const STEP_UP = 0.55; // engine floorYAtRef default

export function auditReachability(b: KitBuilding, groundY: GroundY, out: QaFailure[]): void {
  // every ground-story entrance is a seed: multi-unit buildings (an
  // apartment's separate front doors) are each entered from outside
  const entrances = b.doors.filter((d) => d.story === 0 && !d.interior);
  const targets: { x: number; z: number; label: string; near: boolean }[] = [
    ...b.roomPoints.map((p) => ({ ...p, near: false })),
    ...b.containers.map((c) => ({ x: c.x, z: c.z, label: `container ${c.id}`, near: true })),
    ...b.npcPoints.map((p) => ({ x: p.x, z: p.z, label: 'NPC point', near: true })),
  ];
  if (targets.length === 0) return;
  if (entrances.length === 0) {
    fail(out, 'reachability', b, 'no entrance door recorded — cannot audit reachability');
    return;
  }
  const entrance = entrances[0];
  // grid bounds: union of pieces + doors, padded
  const xs = b.pieces.flatMap((p) => [p.x0, p.x1]);
  const zs = b.pieces.flatMap((p) => [p.z0, p.z1]);
  const x0 = Math.min(...xs, entrance.cx) - 2.4;
  const x1 = Math.max(...xs, entrance.cx) + 2.4;
  const z0 = Math.min(...zs, entrance.cz) - 2.4;
  const z1 = Math.max(...zs, entrance.cz) + 2.4;
  const nx = Math.ceil((x1 - x0) / CELL);
  const nz = Math.ceil((z1 - z0) / CELL);
  const cellX = (i: number) => x0 + (i + 0.5) * CELL;
  const cellZ = (j: number) => z0 + (j + 0.5) * CELL;
  const idxOf = (x: number, z: number): [number, number] => [
    Math.floor((x - x0) / CELL), Math.floor((z - z0) / CELL),
  ];
  const standHeight = (x: number, z: number, refY: number): number => {
    let y = groundY(x, z);
    for (const f of b.floors) {
      if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.y <= refY + STEP_UP && f.y > y) y = f.y;
    }
    return y;
  };
  const blocked = (x: number, z: number, refY: number): boolean => {
    for (const c of b.colliders) {
      if (c.minY !== undefined && c.minY > refY + 0.6) continue;
      if (x >= c.x0 - RADIUS && x <= c.x1 + RADIUS && z >= c.z0 - RADIUS && z <= c.z1 + RADIUS) return true;
    }
    return false;
  };
  const heights = new Map<number, number>();
  const key = (i: number, j: number) => j * nx + i;
  const queue: [number, number][] = [];
  for (const e of entrances) {
    const sx = e.cx + e.outward[0] * 1.7;
    const sz = e.cz + e.outward[1] * 1.7;
    const [si, sj] = idxOf(sx, sz);
    if (si < 0 || sj < 0 || si >= nx || sj >= nz) continue;
    const startRef = groundY(sx, sz);
    if (blocked(sx, sz, startRef)) {
      fail(out, 'reachability', b, `the entrance at (${e.cx.toFixed(1)}, ${e.cz.toFixed(1)}) is itself blocked`);
      continue;
    }
    if (!heights.has(key(si, sj))) {
      heights.set(key(si, sj), startRef);
      queue.push([si, sj]);
    }
  }
  if (queue.length === 0) {
    fail(out, 'reachability', b, 'no usable entrance — every doorway is blocked or outside the audit grid');
    return;
  }
  while (queue.length) {
    const [i, j] = queue.shift()!;
    const refY = heights.get(key(i, j))!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const k = key(ni, nj);
      if (heights.has(k)) continue;
      const px = cellX(ni);
      const pz = cellZ(nj);
      const h = standHeight(px, pz, refY);
      if (blocked(px, pz, refY)) continue;
      heights.set(k, h);
      queue.push([ni, nj]);
    }
  }
  const reached = (x: number, z: number): boolean => {
    const [i, j] = idxOf(x, z);
    return heights.has(key(i, j));
  };
  // "near": some reached cell whose center is within 1.15m — close enough
  // to stand at the furniture and use it (its own cell is collider-blocked)
  const reachedNear = (x: number, z: number): boolean => {
    const [i, j] = idxOf(x, z);
    for (let di = -4; di <= 4; di++) {
      for (let dj = -4; dj <= 4; dj++) {
        if (!heights.has(key(i + di, j + dj))) continue;
        const dx = cellX(i + di) - x;
        const dz = cellZ(j + dj) - z;
        if (dx * dx + dz * dz <= 1.15 * 1.15) return true;
      }
    }
    return false;
  };
  for (const t of targets) {
    const ok = t.near ? reachedNear(t.x, t.z) : reached(t.x, t.z);
    if (!ok) {
      fail(out, 'reachability', b,
        `${t.label} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) is NOT reachable through door openings from outside`);
    }
  }
}

// ------------------------------------------------------------------ the gate

export function auditBuilding(b: KitBuilding, groundY: GroundY): QaFailure[] {
  const out: QaFailure[] = [];
  auditConnectivity(b, out);
  auditColliders(b, out);
  auditDoors(b, out);
  auditStairs(b, out);
  auditScale(b, out);
  auditRoof(b, out);
  auditReachability(b, groundY, out);
  return out;
}

export function auditBuildings(buildings: KitBuilding[], groundY: GroundY): QaFailure[] {
  return buildings.flatMap((b) => auditBuilding(b, groundY));
}
