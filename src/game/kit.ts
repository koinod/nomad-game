// kit.ts — the BUILDING_STRATEGY modular building kit (V4).
//
// Buildings are ASSEMBLED from tested pieces on a 1 m grid, never sculpted
// freehand. Every piece the builder places is recorded (world-space AABB)
// so the QA gate in kitQa.ts can audit connectivity, collider coverage,
// doors, stairs, scale, reachability and roofs — a building that fails
// the gate does not ship.
//
// Conventions (BUILDING_STRATEGY.md):
// - wall height 3.0 m per story, floor top = base + 0.14 + story * 3.0
// - door leaf 2.1 h x 0.95 w; window sill 0.9, head 2.4
// - stair riser <= 0.19, tread >= 0.28
// - rotations are quarter turns only; everything stays axis-aligned, so
//   colliders and floors are exact AABBs
// - local frame: building center at (0,0), front face toward +Z

import * as THREE from 'three';
import type { Collider, FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';
import { FURNITURE_HALF, FURNITURE_LABEL, type FurnitureKind } from './furnitureMeshes';
import type { HuskLootEntry } from '../data/items';

export const KIT = {
  WALL_H: 3.0,
  WALL_T: 0.3,
  DOOR_W: 0.95,
  DOOR_H: 2.1,
  WIN_SILL: 0.9,
  WIN_HEAD: 2.4,
  RISER_MAX: 0.19,
  TREAD_MIN: 0.28,
  SLAB_T: 0.16,
  FLOOR_LIFT: 0.14,
  STAIR_W: 1.2,
  CORRIDOR_MIN: 1.2,
} as const;

/** Local floor-top height for a story (story 0 = ground floor). */
export const floorTopLocal = (story: number): number => KIT.FLOOR_LIFT + story * KIT.WALL_H;

export type PieceKind =
  | 'foundation' | 'wall' | 'floor' | 'roof' | 'gable'
  | 'stair' | 'post' | 'beam' | 'door' | 'canopy';

export interface Piece {
  kind: PieceKind;
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
  structural: boolean;
}

export type DoorKind = 'door' | 'slider' | 'bay' | 'open';

export interface DoorRecord {
  cx: number; cz: number; // opening center (world, plan)
  axis: 'x' | 'z'; // the wall runs along this axis
  fixed: number; // wall plane coordinate on the perpendicular axis (world)
  w: number; h: number; // opening size
  kind: DoorKind;
  hingeX: number; hingeZ: number; // world; (0,0) for leaf-less openings
  leafW: number;
  leafBox?: { x0: number; x1: number; z0: number; z1: number }; // leaf rest pose, world plan
  outward: [number, number]; // unit vector pointing outside (world)
  story: number;
  interior?: boolean; // interior divider passage — not an entrance, no leaf rules
}

export interface StairRecord {
  x0: number; x1: number; z0: number; z1: number; // flight strip, world plan
  fromY: number; toY: number; // world floor tops
  riser: number; tread: number; steps: number;
}

export interface StairHole {
  x0: number; x1: number; z0: number; z1: number; // world plan
  y: number; // world floor top of the slab the hole is cut in
}

export interface ExteriorWall {
  axis: 'x' | 'z';
  fixed: number; // wall centerline, perpendicular world coord
  a0: number; a1: number; // along-axis extent (world)
  openings: { a0: number; a1: number }[]; // passable gaps (door/bay/slider), world along-axis
}

export interface KitBuilding {
  id: string;
  cx: number; cz: number; baseY: number;
  w: number; d: number; stories: number;
  topPlateY: number; // world y of the top wall plate (roof seat)
  roofKind: 'gable' | 'shed' | 'flat' | 'pyramid' | 'none';
  pieces: Piece[];
  doors: DoorRecord[];
  stairs: StairRecord[];
  stairHoles: StairHole[];
  exteriorWalls: ExteriorWall[];
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roomPoints: { x: number; z: number; label: string }[];
  npcPoints: { x: number; z: number }[];
  /** Plan half-extents the terrain pad must flatten (incl. porches/decks). */
  padHW: number; padHD: number;
}

export interface KitResult {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: Collider; group: THREE.Group }[];
  building: KitBuilding;
}

export type Face = 'S' | 'N' | 'E' | 'W';

export interface Opening {
  at: number; // center along the wall's axis (local)
  w: number; // opening width
  type: 'door' | 'window' | 'bay' | 'slider';
  h?: number; // opening height (door 2.1, bay ~3.0, slider 2.1)
  sill?: number; // window sill height override (high shop windows)
  head?: number; // window head height override
  leaf?: boolean; // swing doors get a leaf (default true for 'door')
  leafColor?: number;
  swing?: 'L' | 'R'; // which jamb the leaf hinges on (default 'L' = low-axis side)
  shut?: boolean; // bay only: a closed slat curtain — collider, not passable
}

export class Kit {
  readonly group = new THREE.Group();
  private readonly local = new THREE.Group(); // meshes live here, transformed at finalize
  private readonly roofLocal = new THREE.Group();
  private pieces: Piece[] = [];
  private colliders: Collider[] = [];
  private floors: FloorRect[] = [];
  private containers: ContainerDef[] = [];
  private doors: DoorRecord[] = [];
  private stairRecs: StairRecord[] = [];
  private stairHoles: StairHole[] = [];
  private extWalls: ExteriorWall[] = [];
  private roomPoints: { x: number; z: number; label: string }[] = [];
  private npcPoints: { x: number; z: number }[] = [];
  private mats = new Map<string, THREE.Material>();
  private roofKind: KitBuilding['roofKind'] = 'none';
  private padHW: number;
  private padHD: number;

  constructor(
    readonly id: string,
    private readonly cx: number,
    private readonly cz: number,
    private readonly rotQ: 0 | 1 | 2 | 3,
    readonly baseY: number,
    readonly w: number,
    readonly d: number,
    readonly stories: number,
  ) {
    this.padHW = w / 2;
    this.padHD = d / 2;
    this.group.add(this.local);
  }

  // -- local→world transforms (quarter turns keep everything axis-aligned) --
  private pt(lx: number, lz: number): [number, number] {
    const cos = [1, 0, -1, 0][this.rotQ];
    const sin = [0, 1, 0, -1][this.rotQ];
    return [this.cx + lx * cos + lz * sin, this.cz - lx * sin + lz * cos];
  }
  private aabb(lx0: number, lz0: number, lx1: number, lz1: number): Collider {
    const [ax, az] = this.pt(lx0, lz0);
    const [bx, bz] = this.pt(lx1, lz1);
    return {
      x0: Math.min(ax, bx), z0: Math.min(az, bz),
      x1: Math.max(ax, bx), z1: Math.max(az, bz),
    };
  }
  private wy(ly: number): number {
    return this.baseY + ly;
  }
  /** World direction of a local unit vector under the quarter turn. */
  private dir(lx: number, lz: number): [number, number] {
    const cos = [1, 0, -1, 0][this.rotQ];
    const sin = [0, 1, 0, -1][this.rotQ];
    return [lx * cos + lz * sin, -lx * sin + lz * cos];
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

  /** Add a box mesh in local coords (center-based). Returns the mesh. */
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rough = 1): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color, rough));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.local.add(m);
    return m;
  }

  /** Add a detail mesh (visual only, not a recorded structural piece). */
  detail(mesh: THREE.Object3D): void {
    this.local.add(mesh);
  }

  private record(kind: PieceKind, lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, structural = true): void {
    const b = this.aabb(lx0, lz0, lx1, lz1);
    this.pieces.push({
      kind,
      x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1,
      y0: this.wy(Math.min(ly0, ly1)), y1: this.wy(Math.max(ly0, ly1)),
      structural,
    });
  }

  growPad(hw: number, hd: number): void {
    this.padHW = Math.max(this.padHW, hw);
    this.padHD = Math.max(this.padHD, hd);
  }

  // ------------------------------------------------------------------ pieces

  foundation(color = 0x6f6a63): void {
    const top = KIT.FLOOR_LIFT;
    // stem wall: top flush with the ground floor slab, deep enough to meet
    // sloped ground on the downhill side of the pad
    this.box(this.w + 0.3, top + 0.95, this.d + 0.3, color, 0, top - (top + 0.95) / 2, 0);
    this.record('foundation', -this.w / 2 - 0.15, -0.95, -this.d / 2 - 0.15, this.w / 2 + 0.15, top, this.d / 2 + 0.15);
  }

  /** Interior floor slab for a story (solid). Emits the FloorRect. */
  floorSlab(story: number, color = 0x6b5136): void {
    const t = KIT.WALL_T;
    const top = floorTopLocal(story);
    this.box(this.w - t, KIT.SLAB_T, this.d - t, color, 0, top - KIT.SLAB_T / 2, 0);
    const hw = this.w / 2;
    const hd = this.d / 2;
    const r = this.aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2);
    this.floors.push({ ...r, y: this.wy(top) });
    this.record('floor', -hw + t / 2, top - KIT.SLAB_T, -hd + t / 2, hw - t / 2, top, hd - t / 2);
  }

  /**
   * Floor slab with rectangular stairwell holes CUT through it: the visual
   * slab is tiled from boxes around the holes and the FloorRects are the
   * same tiles, so the hole is real in both. Holes in local coords.
   */
  floorSlabStairwell(story: number, holes: { x0: number; z0: number; x1: number; z1: number }[], color = 0x6b5136): void {
    const t = KIT.WALL_T;
    const top = floorTopLocal(story);
    const hw = this.w / 2;
    const hd = this.d / 2;
    const slab = { x0: -hw + t / 2, z0: -hd + t / 2, x1: hw - t / 2, z1: hd - t / 2 };
    // tile (slab minus holes) by recursive splitting on hole edges
    let rects = [slab];
    for (const h of holes) {
      const next: typeof rects = [];
      for (const r of rects) {
        if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) {
          next.push(r);
          continue;
        }
        // left / right / middle-bottom / middle-top strips
        if (h.x0 > r.x0) next.push({ x0: r.x0, z0: r.z0, x1: h.x0, z1: r.z1 });
        if (h.x1 < r.x1) next.push({ x0: h.x1, z0: r.z0, x1: r.x1, z1: r.z1 });
        const mx0 = Math.max(r.x0, h.x0);
        const mx1 = Math.min(r.x1, h.x1);
        if (h.z0 > r.z0) next.push({ x0: mx0, z0: r.z0, x1: mx1, z1: h.z0 });
        if (h.z1 < r.z1) next.push({ x0: mx0, z0: h.z1, x1: mx1, z1: r.z1 });
      }
      rects = next;
    }
    for (const r of rects) {
      if (r.x1 - r.x0 < 0.02 || r.z1 - r.z0 < 0.02) continue;
      this.box(r.x1 - r.x0, KIT.SLAB_T, r.z1 - r.z0, color, (r.x0 + r.x1) / 2, top - KIT.SLAB_T / 2, (r.z0 + r.z1) / 2);
      const wr = this.aabb(r.x0, r.z0, r.x1, r.z1);
      this.floors.push({ ...wr, y: this.wy(top) });
    }
    // the slab piece as a whole (holes recorded separately)
    this.record('floor', slab.x0, top - KIT.SLAB_T, slab.z0, slab.x1, top, slab.z1);
    for (const h of holes) {
      const wr = this.aabb(h.x0, h.z0, h.x1, h.z1);
      this.stairHoles.push({ ...wr, y: this.wy(top) });
      // trimmer beams around the opening — the support path reads
      const beamC = 0x5a4632;
      this.box(h.x1 - h.x0 + 0.2, 0.2, 0.12, beamC, (h.x0 + h.x1) / 2, top - 0.12, h.z0 - 0.02);
      this.box(h.x1 - h.x0 + 0.2, 0.2, 0.12, beamC, (h.x0 + h.x1) / 2, top - 0.12, h.z1 + 0.02);
    }
  }

  /**
   * One wall run. axis 'x': runs along X at local z = `at`; axis 'z': runs
   * along Z at local x = `at`. `from`/`to` are along-axis local coords.
   * Openings are CUT: solid runs beside, lintel/header above, sill below
   * (windows) — the wall continues around every opening.
   */
  wall(opts: {
    axis: 'x' | 'z';
    at: number;
    from: number;
    to: number;
    story?: number;
    h?: number; // height override (parapet, partial ruin walls, lamp rings)
    yBase?: number; // local bottom (default: story base)
    color: number;
    trim?: number;
    openings?: Opening[];
    collide?: boolean; // default: story-0 walls and ground-touching runs
    exterior?: boolean; // record for the collider audit (ground-story perimeter)
    glassColor?: number;
  }): void {
    const story = opts.story ?? 0;
    const t = KIT.WALL_T;
    // odd quarter turns swap the axes in world space; records speak world
    const worldAxis: 'x' | 'z' = this.rotQ % 2 === 0 ? opts.axis : opts.axis === 'x' ? 'z' : 'x';
    const h = opts.h ?? KIT.WALL_H;
    const y0 = opts.yBase ?? story * KIT.WALL_H - (story === 0 ? 0.3 : KIT.SLAB_T);
    // full stories top out exactly on the next plate; h overrides are literal
    const y1 = opts.h !== undefined ? y0 + h : (story + 1) * KIT.WALL_H;
    const trim = opts.trim ?? 0x4a3826;
    const collide = opts.collide ?? story === 0;
    const along = (a: number, alongCoord: number): [number, number] =>
      opts.axis === 'x' ? [alongCoord, a] : [a, alongCoord];
    const segBox = (a0: number, a1: number, yy0: number, yy1: number, color: number, thick = t): void => {
      if (a1 - a0 < 0.02 || yy1 - yy0 < 0.02) return;
      const mid = (a0 + a1) / 2;
      const [lx, lz] = along(opts.at, mid);
      const wAlong = a1 - a0;
      const m = opts.axis === 'x'
        ? this.box(wAlong, yy1 - yy0, thick, color, lx, (yy0 + yy1) / 2, lz)
        : this.box(thick, yy1 - yy0, wAlong, color, lx, (yy0 + yy1) / 2, lz);
      m.castShadow = true;
    };
    const segCollider = (a0: number, a1: number): void => {
      if (a1 - a0 < 0.02) return;
      const [x0, z0] = along(opts.at - t / 2, a0);
      const [x1, z1] = along(opts.at + t / 2, a1);
      this.colliders.push(this.aabb(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)));
    };
    const openings = [...(opts.openings ?? [])].sort((a, b) => a.at - b.at);
    // solid runs between openings
    let cursor = opts.from;
    const runs: { a0: number; a1: number }[] = [];
    for (const o of openings) {
      const o0 = o.at - o.w / 2;
      const o1 = o.at + o.w / 2;
      if (o0 > cursor) runs.push({ a0: cursor, a1: o0 });
      cursor = Math.max(cursor, o1);
    }
    if (cursor < opts.to) runs.push({ a0: cursor, a1: opts.to });
    for (const r of runs) {
      segBox(r.a0, r.a1, y0, y1, opts.color);
      if (collide) segCollider(r.a0, r.a1);
      const [px0, pz0] = along(opts.at - t / 2, r.a0);
      const [px1, pz1] = along(opts.at + t / 2, r.a1);
      this.record('wall', Math.min(px0, px1), y0, Math.min(pz0, pz1), Math.max(px0, px1), y1, Math.max(pz0, pz1));
    }
    // opening treatments
    const passable: { a0: number; a1: number }[] = [];
    for (const o of openings) {
      const o0 = o.at - o.w / 2;
      const o1 = o.at + o.w / 2;
      if (o.type === 'window') {
        // sill wall below + header above; the wall never stops being a wall
        const sillY = story * KIT.WALL_H + (o.sill ?? KIT.WIN_SILL);
        const headY = story * KIT.WALL_H + (o.head ?? KIT.WIN_HEAD);
        segBox(o0, o1, y0, sillY, opts.color);
        segBox(o0, o1, headY, y1, opts.color);
        if (collide) segCollider(o0, o1);
        // frame + glass + mullions + sill board
        const cy = (sillY + headY) / 2;
        const gh = headY - sillY;
        const [gx, gz] = along(opts.at, o.at);
        const ft = 0.09;
        const mkGlass = opts.axis === 'x'
          ? this.box(o.w - 0.06, gh - 0.06, 0.04, opts.glassColor ?? 0x2a3540, gx, cy, gz, 0.3)
          : this.box(0.04, gh - 0.06, o.w - 0.06, opts.glassColor ?? 0x2a3540, gx, cy, gz, 0.3);
        mkGlass.castShadow = false;
        if (opts.axis === 'x') {
          this.box(o.w + 0.1, ft, t + 0.06, trim, gx, headY - ft / 2, gz);
          this.box(o.w + 0.16, 0.07, t + 0.14, trim, gx, sillY - 0.035, gz);
          this.box(0.05, gh, 0.06, trim, gx, cy, gz);
          this.box(o.w - 0.1, 0.05, 0.06, trim, gx, cy, gz);
        } else {
          this.box(t + 0.06, ft, o.w + 0.1, trim, gx, headY - ft / 2, gz);
          this.box(t + 0.14, 0.07, o.w + 0.16, trim, gx, sillY - 0.035, gz);
          this.box(0.06, gh, 0.05, trim, gx, cy, gz);
          this.box(0.06, 0.05, o.w - 0.1, trim, gx, cy, gz);
        }
        // the sill segment is structure too
        const [sx0, sz0] = along(opts.at - t / 2, o0);
        const [sx1, sz1] = along(opts.at + t / 2, o1);
        this.record('wall', Math.min(sx0, sx1), y0, Math.min(sz0, sz1), Math.max(sx0, sx1), sillY, Math.max(sz0, sz1));
      } else {
        // door / slider / bay: lintel above the opening, jambs beside
        const oh = o.h ?? (o.type === 'bay' ? h - 0.35 : KIT.DOOR_H);
        const floorY = story * KIT.WALL_H;
        if (y1 - (floorY + oh) > 0.02) segBox(o0, o1, floorY + oh, y1, opts.color);
        for (const j of [o0, o1]) {
          const [jx, jz] = along(opts.at, j);
          if (opts.axis === 'x') this.box(0.1, oh, t + 0.08, trim, jx, floorY + oh / 2, jz);
          else this.box(t + 0.08, oh, 0.1, trim, jx, floorY + oh / 2, jz);
        }
        if (o.type === 'bay' && o.shut) {
          // closed slat curtain: visual slats + a real collider — not a gap
          const slatC = 0x8b9299;
          const n = Math.max(3, Math.round(oh / 0.37));
          for (let i = 0; i < n; i++) {
            const sy = floorY + 0.19 + i * ((oh - 0.2) / n);
            const [sx, sz] = along(opts.at, o.at);
            if (opts.axis === 'x') this.box(o.w, (oh - 0.2) / n - 0.02, 0.05, slatC, sx, sy, sz, 0.6);
            else this.box(0.05, (oh - 0.2) / n - 0.02, o.w, slatC, sx, sy, sz, 0.6);
          }
          if (collide) segCollider(o0, o1);
          const [bx0, bz0] = along(opts.at - 0.03, o0);
          const [bx1, bz1] = along(opts.at + 0.03, o1);
          this.record('wall', Math.min(bx0, bx1), floorY, Math.min(bz0, bz1), Math.max(bx0, bx1), floorY + oh, Math.max(bz0, bz1));
        } else {
          passable.push({ a0: o0, a1: o1 });
          // threshold
          const [tx, tz] = along(opts.at, o.at);
          if (opts.axis === 'x') this.box(o.w + 0.16, 0.07, t + 0.3, 0x5a5348, tx, floorY + 0.035, tz);
          else this.box(t + 0.3, 0.07, o.w + 0.16, 0x5a5348, tx, floorY + 0.035, tz);
          // the door record (world space)
          const [dcx, dcz] = this.pt(tx, tz);
          const outwardLocal: [number, number] = opts.axis === 'x'
            ? [0, opts.at > 0 ? 1 : -1]
            : [opts.at > 0 ? 1 : -1, 0];
          const outward = this.dir(outwardLocal[0], outwardLocal[1]);
          // wall plane world coordinate on the perpendicular axis
          const fixedWorld = worldAxis === 'x' ? dcz : dcx;
          const rec: DoorRecord = {
            cx: dcx, cz: dcz,
            axis: worldAxis, fixed: fixedWorld,
            w: o.w, h: oh,
            kind: o.type,
            hingeX: 0, hingeZ: 0, leafW: 0,
            outward, story,
          };
          if (o.type === 'door' && o.leaf !== false) {
            // Leaf hinged AT the jamb, in the wall's plane, resting open
            // flat against the interior face of the neighboring run.
            // All math is done in local plan coords, then baked to world.
            const swingL = (o.swing ?? 'L') === 'L';
            const hingeAt = swingL ? o0 + 0.04 : o1 - 0.04;
            const toward = swingL ? -1 : 1; // rest direction along the axis, away from the opening
            const leafW = o.w - 0.07;
            const leafH = oh - 0.05;
            const leafC = o.leafColor ?? 0x6b5335;
            const perpIn = -Math.sign(opts.at); // interior direction on the perpendicular axis
            const tilt = 0.22; // rad off the wall plane, into the room
            const dirL: [number, number] = opts.axis === 'x'
              ? [toward * Math.cos(tilt), perpIn * Math.sin(tilt)]
              : [perpIn * Math.sin(tilt), toward * Math.cos(tilt)];
            const hingeLocal: [number, number] = opts.axis === 'x'
              ? [hingeAt, opts.at + perpIn * (t / 2 + 0.045)]
              : [opts.at + perpIn * (t / 2 + 0.045), hingeAt];
            const centerLocal: [number, number] = [
              hingeLocal[0] + (dirL[0] * leafW) / 2,
              hingeLocal[1] + (dirL[1] * leafW) / 2,
            ];
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, 0.05), this.mat(leafC));
            // mesh +x must map onto dirL: rotation about Y sends +x to (cos, -sin)
            leaf.rotation.y = Math.atan2(-dirL[1], dirL[0]);
            leaf.position.set(centerLocal[0], floorY + 0.05 + leafH / 2, centerLocal[1]);
            leaf.castShadow = true;
            const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), this.mat(0x2e2e2e));
            knob.position.set(leafW / 2 - 0.14, -0.05, 0.05);
            leaf.add(knob);
            this.local.add(leaf);
            rec.leafW = leafW;
            const [whx, whz] = this.pt(hingeLocal[0], hingeLocal[1]);
            rec.hingeX = whx;
            rec.hingeZ = whz;
            // rest-pose plan AABB from the four leaf corners (world)
            const perp: [number, number] = [-dirL[1], dirL[0]];
            const corners: [number, number][] = [
              hingeLocal,
              [hingeLocal[0] + dirL[0] * leafW, hingeLocal[1] + dirL[1] * leafW],
              [hingeLocal[0] + dirL[0] * leafW + perp[0] * 0.06, hingeLocal[1] + dirL[1] * leafW + perp[1] * 0.06],
              [hingeLocal[0] + perp[0] * 0.06, hingeLocal[1] + perp[1] * 0.06],
            ];
            const wc = corners.map(([lx, lz]) => this.pt(lx, lz));
            rec.leafBox = {
              x0: Math.min(...wc.map((c) => c[0])) - 0.02, x1: Math.max(...wc.map((c) => c[0])) + 0.02,
              z0: Math.min(...wc.map((c) => c[1])) - 0.02, z1: Math.max(...wc.map((c) => c[1])) + 0.02,
            };
            const lc = corners;
            this.record('door',
              Math.min(...lc.map((c) => c[0])), floorY, Math.min(...lc.map((c) => c[1])),
              Math.max(...lc.map((c) => c[0])), floorY + leafH, Math.max(...lc.map((c) => c[1])), false);
          }
          if (o.type === 'slider') {
            // two glass panes IN the wall plane, one slid along the track
            const glassM = new THREE.MeshStandardMaterial({
              color: 0x9fc4cc, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.55,
            });
            const pw = o.w / 2;
            for (const [off, offPlane] of [[-pw / 2, 0], [pw / 2 + 0.04, 0.09]] as [number, number][]) {
              const pane = opts.axis === 'x'
                ? new THREE.Mesh(new THREE.BoxGeometry(pw - 0.03, oh - 0.08, 0.04), glassM)
                : new THREE.Mesh(new THREE.BoxGeometry(0.04, oh - 0.08, pw - 0.03), glassM);
              if (opts.axis === 'x') pane.position.set(o.at + off, floorY + oh / 2, opts.at + offPlane);
              else pane.position.set(opts.at + offPlane, floorY + oh / 2, o.at + off);
              pane.castShadow = true;
              this.local.add(pane);
            }
            const [tkx, tkz] = along(opts.at, o.at);
            if (opts.axis === 'x') this.box(o.w + 0.1, 0.07, 0.12, trim, tkx, floorY + oh + 0.03, tkz);
            else this.box(0.12, 0.07, o.w + 0.1, trim, tkx, floorY + oh + 0.03, tkz);
          }
          this.doors.push(rec);
        }
      }
    }
    if (opts.exterior) {
      // record the ground-plan of this wall for the collider audit:
      // along-axis coords map to world (monotonic under quarter turns)
      const a2w = (a: number): number => {
        const [wx, wz] = along(opts.at, a);
        const [px, pz] = this.pt(wx, wz);
        return worldAxis === 'x' ? px : pz;
      };
      const lo = a2w(opts.from);
      const hi = a2w(opts.to);
      const [fx, fz] = this.pt(...along(opts.at, opts.from));
      this.extWalls.push({
        axis: worldAxis,
        fixed: worldAxis === 'x' ? fz : fx,
        a0: Math.min(lo, hi), a1: Math.max(lo, hi),
        openings: passable.map((p) => {
          const q0 = a2w(p.a0);
          const q1 = a2w(p.a1);
          return { a0: Math.min(q0, q1), a1: Math.max(q0, q1) };
        }),
      });
    }
  }

  /** Convenience wrappers in the strategy's vocabulary. */
  wallSolid(len: number, o: Omit<Parameters<Kit['wall']>[0], 'from' | 'to' | 'openings'> & { from?: number }): void {
    this.wall({ ...o, from: o.from ?? -len / 2, to: (o.from ?? -len / 2) + len });
  }
  wallDoor(len: number, at: number, o: Omit<Parameters<Kit['wall']>[0], 'from' | 'to' | 'openings'> & { from?: number }): void {
    const from = o.from ?? -len / 2;
    this.wall({ ...o, from, to: from + len, openings: [{ at, w: KIT.DOOR_W, type: 'door' }] });
  }
  wallWindow(len: number, at: number, o: Omit<Parameters<Kit['wall']>[0], 'from' | 'to' | 'openings'> & { from?: number }): void {
    const from = o.from ?? -len / 2;
    this.wall({ ...o, from, to: from + len, openings: [{ at, w: 1.2, type: 'window' }] });
  }

  /**
   * All four perimeter walls of one story. Faces: S = +Z (front), N = -Z,
   * E = +X, W = -X. Door/slider/window openings are face-local `at` coords
   * along the face (x for S/N, z for E/W).
   */
  perimeter(opts: {
    story?: number;
    color: number;
    trim?: number;
    door?: { face: Face; at: number; w?: number; kind?: 'door' | 'slider'; leafColor?: number; swing?: 'L' | 'R' };
    windows?: { face: Face; at: number; w?: number; sill?: number; head?: number }[];
    open?: Face[]; // faces with NO wall (posts carry the roof instead)
    bays?: { face: Face; at: number; w: number; h?: number; shut?: boolean }[];
    h?: number;
    yBase?: number;
    collide?: boolean;
    glassColor?: number;
  }): void {
    const story = opts.story ?? 0;
    const hw = this.w / 2;
    const hd = this.d / 2;
    const t = KIT.WALL_T;
    const open = new Set(opts.open ?? []);
    const faceWall = (
      face: Face,
      axis: 'x' | 'z',
      at: number,
      from: number,
      to: number,
    ): void => {
      if (open.has(face)) return;
      const openings: Opening[] = [];
      if (opts.door && opts.door.face === face) {
        openings.push({
          at: opts.door.at, w: opts.door.w ?? KIT.DOOR_W,
          type: opts.door.kind ?? 'door', h: KIT.DOOR_H,
          leafColor: opts.door.leafColor, swing: opts.door.swing,
        });
      }
      for (const wn of opts.windows ?? []) {
        if (wn.face === face) openings.push({ at: wn.at, w: wn.w ?? 1.2, type: 'window', sill: wn.sill, head: wn.head });
      }
      for (const b of opts.bays ?? []) {
        if (b.face === face) openings.push({ at: b.at, w: b.w, type: 'bay', h: b.h, shut: b.shut });
      }
      this.wall({
        axis, at, from, to, story, color: opts.color, trim: opts.trim,
        openings, exterior: story === 0, h: opts.h, yBase: opts.yBase,
        collide: opts.collide, glassColor: opts.glassColor,
      });
    };
    faceWall('S', 'x', hd - t / 2, -hw, hw);
    faceWall('N', 'x', -hd + t / 2, -hw, hw);
    faceWall('E', 'z', hw - t / 2, -hd, hd);
    faceWall('W', 'z', -hw + t / 2, -hd, hd);
  }

  /** Interior divider wall with a door gap. axis 'z': a wall running along
   *  Z at local x = at (the common case); doorAt is along the run. */
  divider(opts: {
    axis: 'x' | 'z';
    at: number;
    from: number;
    to: number;
    story?: number;
    color: number;
    doorAt?: number; // omit for a solid divider
    doorW?: number;
  }): void {
    const story = opts.story ?? 0;
    const openings: Opening[] = opts.doorAt !== undefined
      ? [{ at: opts.doorAt, w: opts.doorW ?? 1.1, type: 'door', h: KIT.DOOR_H, leaf: false }]
      : [];
    const before = this.doors.length;
    this.wall({
      axis: opts.axis, at: opts.at, from: opts.from, to: opts.to,
      story, color: opts.color, openings, collide: story === 0,
    });
    for (let i = before; i < this.doors.length; i++) this.doors[i].interior = true;
  }

  /**
   * A flight of stairs from floorTop(story) to floorTop(story + 1).
   * (x, z) = the midpoint of the flight's FOOT edge (the near edge of the
   * bottom step, centered across the width); the flight climbs toward
   * `dir`. The matching stairwell hole must be cut in the upper slab —
   * the flight strip is what the hole has to cover (QA audits this).
   */
  stairs(opts: {
    x: number; z: number;
    dir: 'px' | 'nx' | 'pz' | 'nz';
    story: number;
    runLen?: number;
    width?: number;
    color?: number;
  }): StairRecord {
    const runLen = opts.runLen ?? 4.8;
    const width = opts.width ?? KIT.STAIR_W;
    const steps = Math.ceil(KIT.WALL_H / 0.1875); // 16
    const riser = KIT.WALL_H / steps;
    const tread = runLen / steps;
    const fromTop = floorTopLocal(opts.story);
    const dvec: [number, number] = opts.dir === 'px' ? [1, 0] : opts.dir === 'nx' ? [-1, 0] : opts.dir === 'pz' ? [0, 1] : [0, -1];
    const alongX = dvec[0] !== 0;
    const color = opts.color ?? 0x6e5f4c;
    for (let i = 0; i < steps; i++) {
      const cAlong = (i + 0.5) * tread;
      const cx = opts.x + dvec[0] * cAlong;
      const cz = opts.z + dvec[1] * cAlong;
      const topY = fromTop + (i + 1) * riser;
      const hgt = topY - (fromTop - KIT.FLOOR_LIFT); // solid wedge down to the floor below's base
      const m = alongX
        ? this.box(tread + 0.04, hgt, width, color, cx, fromTop - KIT.FLOOR_LIFT + hgt / 2, cz)
        : this.box(width, hgt, tread + 0.04, color, cx, fromTop - KIT.FLOOR_LIFT + hgt / 2, cz);
      m.castShadow = true;
      // each tread is a floor rect — the height-aware lookup climbs them
      const r = alongX
        ? this.aabb(cx - tread / 2 - 0.02, cz - width / 2, cx + tread / 2 + 0.02, cz + width / 2)
        : this.aabb(cx - width / 2, cz - tread / 2 - 0.02, cx + width / 2, cz + tread / 2 + 0.02);
      this.floors.push({ ...r, y: this.wy(topY) });
    }
    const ex = opts.x + dvec[0] * runLen;
    const ez = opts.z + dvec[1] * runLen;
    const strip = alongX
      ? this.aabb(Math.min(opts.x, ex), opts.z - width / 2, Math.max(opts.x, ex), opts.z + width / 2)
      : this.aabb(opts.x - width / 2, Math.min(opts.z, ez), opts.x + width / 2, Math.max(opts.z, ez));
    const rec: StairRecord = {
      ...strip,
      fromY: this.wy(fromTop), toY: this.wy(floorTopLocal(opts.story + 1)),
      riser, tread, steps,
    };
    this.stairRecs.push(rec);
    this.record('stair',
      Math.min(opts.x, ex) - (alongX ? 0 : width / 2), fromTop - KIT.FLOOR_LIFT, Math.min(opts.z, ez) - (alongX ? width / 2 : 0),
      Math.max(opts.x, ex) + (alongX ? 0 : width / 2), floorTopLocal(opts.story + 1), Math.max(opts.z, ez) + (alongX ? width / 2 : 0));
    return rec;
  }

  /** Support post from a local base height to a top height. */
  post(x: number, z: number, yFrom: number, yTo: number, color = 0x4a3826, size = 0.18): void {
    this.box(size, yTo - yFrom, size, color, x, (yFrom + yTo) / 2, z);
    this.record('post', x - size / 2, yFrom, z - size / 2, x + size / 2, yTo, z + size / 2);
  }

  /** Horizontal beam along an axis. */
  beam(axis: 'x' | 'z', at: number, from: number, to: number, y: number, color = 0x5a4632, hgt = 0.22): void {
    if (axis === 'x') this.box(to - from, hgt, 0.16, color, (from + to) / 2, y - hgt / 2, at);
    else this.box(0.16, hgt, to - from, color, at, y - hgt / 2, (from + to) / 2);
    this.record('beam',
      axis === 'x' ? from : at - 0.08, y - hgt, axis === 'x' ? at - 0.08 : from,
      axis === 'x' ? to : at + 0.08, y, axis === 'x' ? at + 0.08 : to);
  }

  /** Gable roof: two panels whose top edges MEET at the ridge (ridge along
   *  X), gable triangles part of the end walls on the ridge-axis faces. */
  roofGable(rise: number, color: number, wallColor: number): void {
    this.roofKind = 'gable';
    const hw = this.w / 2;
    const hd = this.d / 2;
    const top = this.stories * KIT.WALL_H;
    const roofGroup = new THREE.Group();
    const slopeLen = Math.hypot(hd + 0.39, rise + 0.08);
    const a = Math.atan2(rise + 0.08, hd + 0.39);
    for (const sgn of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.7, 0.14, slopeLen), this.mat(color));
      panel.rotation.x = sgn * a;
      panel.position.set(0, top + (rise - 0.04) / 2, (sgn * (hd + 0.33)) / 2);
      panel.castShadow = true;
      roofGroup.add(panel);
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.9, 0.2, 0.07), this.mat(0x4a3826));
      fascia.position.set(0, top - 0.03, sgn * (hd + 0.3));
      roofGroup.add(fascia);
      // panel piece AABB (bounding box of the rotated panel)
      const yLo = top + (rise - 0.04) / 2 - (Math.sin(a) * slopeLen) / 2 - 0.1;
      const yHi = top + (rise - 0.04) / 2 + (Math.sin(a) * slopeLen) / 2 + 0.1;
      const zEdge = (hd + 0.33) / 2 + (Math.cos(a) * slopeLen) / 2;
      this.record('roof', -hw - 0.35, yLo, sgn > 0 ? 0 : -zEdge, hw + 0.35, yHi, sgn > 0 ? zEdge : 0);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.8, 0.1, 0.36), this.mat(color));
    ridge.position.set(0, top + rise, 0);
    ridge.castShadow = true;
    roofGroup.add(ridge);
    // gable ends: part of the X-face walls, on the ridge axis
    const capMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [1, -1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, top - 0.05);
      shape.lineTo(hd, top - 0.05);
      shape.lineTo(0, top + rise);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(geo, capMat);
      m.position.set(sgn * (hw - 0.02), 0, 0);
      m.castShadow = true;
      roofGroup.add(m);
      this.record('gable', sgn * (hw - 0.02) - 0.03, top - 0.05, -hd, sgn * (hw - 0.02) + 0.03, top + rise, hd);
    }
    this.roofGroupAdd(roofGroup);
  }

  /** Shed roof: single slope, high at the back (-Z), closed by a filler
   *  band + trapezoid end caps. */
  roofShed(rise: number, color: number, wallColor: number): void {
    this.roofKind = 'shed';
    const hw = this.w / 2;
    const hd = this.d / 2;
    const top = this.stories * KIT.WALL_H;
    const roofGroup = new THREE.Group();
    const slope = Math.hypot(this.d, rise);
    const a = Math.atan2(rise, this.d);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.5, 0.12, slope + 0.4), this.mat(color));
    panel.rotation.x = a;
    panel.position.set(0, top + rise / 2 - 0.1, 0);
    panel.castShadow = true;
    roofGroup.add(panel);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.7, 0.2, 0.07), this.mat(0x4a3826));
    fascia.position.set(0, top - 0.12, hd + 0.22);
    roofGroup.add(fascia);
    const filler = new THREE.Mesh(new THREE.BoxGeometry(this.w - 0.05, rise + 0.15, 0.1), this.mat(wallColor));
    filler.position.set(0, top + (rise - 0.15) / 2 - 0.05, -hd + 0.05);
    roofGroup.add(filler);
    const capMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [1, -1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, top - 0.3);
      shape.lineTo(hd, top - 0.3);
      shape.lineTo(hd, top - 0.08);
      shape.lineTo(-hd, top + rise - 0.12);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(geo, capMat);
      m.position.set(sgn * (hw - 0.02), 0, 0);
      m.castShadow = true;
      roofGroup.add(m);
    }
    this.record('roof', -hw - 0.25, top - 0.15, -hd - 0.2, hw + 0.25, top + rise + 0.15, hd + 0.45);
    this.record('gable', -hw - 0.02, top - 0.3, -hd, hw + 0.02, top + rise, hd, false);
    this.roofGroupAdd(roofGroup);
  }

  /** Flat roof slab + parapet ring (stores, mall, school). */
  roofFlat(color: number, parapetColor: number): void {
    this.roofKind = 'flat';
    const hw = this.w / 2;
    const hd = this.d / 2;
    const top = this.stories * KIT.WALL_H;
    const roofGroup = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(this.w + 0.5, 0.16, this.d + 0.5), this.mat(color));
    slab.position.set(0, top + 0.02, 0);
    slab.castShadow = true;
    roofGroup.add(slab);
    this.record('roof', -hw - 0.25, top - 0.06, -hd - 0.25, hw + 0.25, top + 0.1, hd + 0.25);
    // parapet: low wall pieces seated on the slab edge
    const ph = 0.5;
    for (const [pw, pd, px, pz] of [
      [this.w + 0.5, 0.12, 0, hd + 0.19], [this.w + 0.5, 0.12, 0, -hd - 0.19],
      [0.12, this.d + 0.5, -hw - 0.19, 0], [0.12, this.d + 0.5, hw + 0.19, 0],
    ] as [number, number, number, number][]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), this.mat(parapetColor));
      p.position.set(px, top + 0.1 + ph / 2, pz);
      p.castShadow = true;
      roofGroup.add(p);
    }
    this.record('wall', -hw - 0.25, top + 0.1, -hd - 0.25, hw + 0.25, top + 0.1 + ph, hd + 0.25, false);
    this.roofGroupAdd(roofGroup);
  }

  private roofGroupAdd(g: THREE.Group): void {
    this.roofLocal.add(g);
  }

  /**
   * Open deck / porch slab at a story, extending beyond a face, carried by
   * posts to the ground. Returns the deck's outer edge coordinate.
   */
  deck(opts: {
    face: Face;
    story: number;
    depth: number; // how far beyond the wall
    spanFrom: number; spanTo: number; // along-face extent (local)
    color?: number;
    railing?: boolean;
    railColor?: number;
    yOff?: number; // tiny height offset so wrap-around corner slabs don't z-fight
  }): void {
    const story = opts.story;
    const top = floorTopLocal(story) + (opts.yOff ?? 0);
    const hw = this.w / 2;
    const hd = this.d / 2;
    const t = KIT.WALL_T;
    const color = opts.color ?? 0x8a7a66;
    let rect: { x0: number; z0: number; x1: number; z1: number };
    if (opts.face === 'S') rect = { x0: opts.spanFrom, z0: hd - t / 2, x1: opts.spanTo, z1: hd + opts.depth };
    else if (opts.face === 'N') rect = { x0: opts.spanFrom, z0: -hd - opts.depth, x1: opts.spanTo, z1: -hd + t / 2 };
    else if (opts.face === 'E') rect = { x0: hw - t / 2, z0: opts.spanFrom, x1: hw + opts.depth, z1: opts.spanTo };
    else rect = { x0: -hw - opts.depth, z0: opts.spanFrom, x1: -hw + t / 2, z1: opts.spanTo };
    this.box(rect.x1 - rect.x0, 0.12, rect.z1 - rect.z0, color, (rect.x0 + rect.x1) / 2, top - 0.06, (rect.z0 + rect.z1) / 2);
    const wr = this.aabb(rect.x0, rect.z0, rect.x1, rect.z1);
    this.floors.push({ ...wr, y: this.wy(top) });
    this.record('floor', rect.x0, top - 0.12, rect.z0, rect.x1, top, rect.z1);
    // posts at the outer corners + midspans — the support path reads
    const yBase = story === 0 ? -0.1 : -0.1;
    const postAt = (px: number, pz: number) => this.post(px, pz, yBase, top - 0.12, opts.railColor ?? 0x4a3826, 0.16);
    const along = opts.face === 'S' || opts.face === 'N';
    const fixed = opts.face === 'S' ? rect.z1 - 0.15 : opts.face === 'N' ? rect.z0 + 0.15 : opts.face === 'E' ? rect.x1 - 0.15 : rect.x0 + 0.15;
    const from = along ? rect.x0 + 0.15 : rect.z0 + 0.15;
    const to = along ? rect.x1 - 0.15 : rect.z1 - 0.15;
    const n = Math.max(1, Math.round((to - from) / 3));
    for (let i = 0; i <= n; i++) {
      const c = from + ((to - from) * i) / n;
      if (along) postAt(c, fixed);
      else postAt(fixed, c);
    }
    // the terrain pad must reach the deck's support posts on any story
    this.growPad(
      Math.max(Math.abs(rect.x0), Math.abs(rect.x1)) + 0.2,
      Math.max(Math.abs(rect.z0), Math.abs(rect.z1)) + 0.2,
    );
    if (opts.railing) {
      const railC = opts.railColor ?? 0xe8e2d4;
      const railTop = top + 1.02;
      const edge = 0.06;
      // top + mid rails as thin recorded beams along the outer edge
      const mkRail = (hgt: number) => {
        if (along) {
          this.box(rect.x1 - rect.x0, 0.06, 0.06, railC, (rect.x0 + rect.x1) / 2, top + hgt, opts.face === 'S' ? rect.z1 - edge : rect.z0 + edge);
        } else {
          this.box(0.06, 0.06, rect.z1 - rect.z0, railC, opts.face === 'E' ? rect.x1 - edge : rect.x0 + edge, top + hgt, (rect.z0 + rect.z1) / 2);
        }
      };
      mkRail(1.02);
      mkRail(0.55);
      const nb = Math.max(2, Math.round(((along ? rect.x1 - rect.x0 : rect.z1 - rect.z0)) / 1.3));
      for (let i = 0; i <= nb; i++) {
        const c = (along ? rect.x0 : rect.z0) + (((along ? rect.x1 - rect.x0 : rect.z1 - rect.z0)) * i) / nb;
        if (along) this.box(0.055, 1.0, 0.055, railC, c, top + 0.5, opts.face === 'S' ? rect.z1 - edge : rect.z0 + edge);
        else this.box(0.055, 1.0, 0.055, railC, opts.face === 'E' ? rect.x1 - edge : rect.x0 + edge, top + 0.5, c);
      }
      void railTop;
      // height-gated collider: holds a deck walker, invisible from below
      const rr = along
        ? this.aabb(rect.x0, opts.face === 'S' ? rect.z1 - 0.12 : rect.z0 - 0.02, rect.x1, opts.face === 'S' ? rect.z1 + 0.02 : rect.z0 + 0.12)
        : this.aabb(opts.face === 'E' ? rect.x1 - 0.12 : rect.x0 - 0.02, rect.z0, opts.face === 'E' ? rect.x1 + 0.02 : rect.x0 + 0.12, rect.z1);
      this.colliders.push({ ...rr, minY: this.wy(top) - 0.55 });
      this.record('beam',
        along ? rect.x0 : (opts.face === 'E' ? rect.x1 - 0.1 : rect.x0),
        top, along ? rect.z0 : rect.z0,
        along ? rect.x1 : (opts.face === 'E' ? rect.x1 : rect.x0 + 0.1), top + 1.05, along ? rect.z1 : rect.z1, false);
    }
  }

  /** Furniture → a searchable container + its collider. Local coords. */
  furnish(opts: {
    kind: FurnitureKind;
    lx: number; lz: number;
    rot?: number; // quarter turns, visual
    story?: number;
    loot: HuskLootEntry[];
    id: string;
    label?: string;
    locked?: boolean;
    searchTime?: number;
  }): void {
    const story = opts.story ?? 0;
    const [hx, hz] = FURNITURE_HALF[opts.kind];
    const [wx, wz] = this.pt(opts.lx, opts.lz);
    const rotated = this.rotQ % 2 === 1;
    const hxw = rotated ? hz : hx;
    const hzw = rotated ? hx : hz;
    const top = this.wy(floorTopLocal(story));
    const col: Collider = { x0: wx - hxw, z0: wz - hzw, x1: wx + hxw, z1: wz + hzw };
    if (story > 0) col.minY = top - 0.55; // only exists for walkers on that floor
    this.colliders.push(col);
    this.containers.push({
      id: opts.id,
      x: wx,
      z: wz,
      y: top,
      loot: opts.loot,
      label: opts.label ?? FURNITURE_LABEL[opts.kind],
      meshKind: opts.kind,
      rotY: (opts.rot ?? 0) * Math.PI * 0.5 + this.rotQ * Math.PI * 0.5,
      ...(opts.locked ? { locked: true } : {}),
      ...(opts.searchTime ? { searchTime: opts.searchTime } : {}),
    });
  }

  /** Attach a detail mesh (signage decals, one-off props) in LOCAL space. */
  addDetail(mesh: THREE.Object3D): void {
    this.local.add(mesh);
  }

  /** A plain world-anchored container (crate on the ground, pump island…). */
  container(opts: {
    id: string; lx: number; lz: number; loot: HuskLootEntry[];
    label?: string; searchTime?: number; y?: number; collider?: boolean;
  }): void {
    const [wx, wz] = this.pt(opts.lx, opts.lz);
    if (opts.collider) {
      this.colliders.push({ x0: wx - 0.45, z0: wz - 0.45, x1: wx + 0.45, z1: wz + 0.45 });
    }
    this.containers.push({
      id: opts.id, x: wx, z: wz, loot: opts.loot,
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.searchTime ? { searchTime: opts.searchTime } : {}),
      ...(opts.y !== undefined ? { y: opts.y } : {}),
    });
  }

  roomPoint(lx: number, lz: number, label: string): void {
    const [wx, wz] = this.pt(lx, lz);
    this.roomPoints.push({ x: wx, z: wz, label });
  }

  npcPoint(lx: number, lz: number): void {
    const [wx, wz] = this.pt(lx, lz);
    this.npcPoints.push({ x: wx, z: wz });
  }

  /** A collider with no mesh and no loot: pumps, tire stacks, benches —
   *  props the player must walk around. Pair with box() for the visual. */
  obstacle(lx: number, lz: number, hx: number, hz: number, story = 0): void {
    const c = this.aabb(lx - hx, lz - hz, lx + hx, lz + hz);
    if (story > 0) c.minY = this.baseY + floorTopLocal(story) - 0.55;
    this.colliders.push(c);
  }

  /** Register an entrance with no leaf (open-front buildings) so the
   *  reachability audit has a door to start from. */
  openEntrance(face: Face, at: number, w: number): void {
    const hd = this.d / 2;
    const hw = this.w / 2;
    let lx = at;
    let lz = hd;
    let axis: 'x' | 'z' = 'x';
    let outwardLocal: [number, number] = [0, 1];
    if (face === 'N') { lz = -hd; outwardLocal = [0, -1]; }
    if (face === 'E') { lx = hw; lz = at; axis = 'z'; outwardLocal = [1, 0]; }
    if (face === 'W') { lx = -hw; lz = at; axis = 'z'; outwardLocal = [-1, 0]; }
    const [cx, cz] = this.pt(lx, lz);
    const outward = this.dir(outwardLocal[0], outwardLocal[1]);
    const worldAxis: 'x' | 'z' = this.rotQ % 2 === 0 ? axis : axis === 'x' ? 'z' : 'x';
    this.doors.push({
      cx, cz, axis: worldAxis, fixed: worldAxis === 'x' ? cz : cx, w, h: KIT.WALL_H,
      kind: 'open', hingeX: 0, hingeZ: 0, leafW: 0, outward, story: 0,
    });
  }

  /** Bake everything into world space. Call exactly once. */
  finalize(scene?: THREE.Scene): KitResult {
    this.local.position.set(this.cx, this.baseY, this.cz);
    this.local.rotation.y = (this.rotQ * Math.PI) / 2;
    this.roofLocal.position.copy(this.local.position);
    this.roofLocal.rotation.copy(this.local.rotation);
    this.group.add(this.roofLocal);
    if (scene) scene.add(this.group);
    const building: KitBuilding = {
      id: this.id,
      cx: this.cx, cz: this.cz, baseY: this.baseY,
      w: this.w, d: this.d, stories: this.stories,
      topPlateY: this.wy(this.stories * KIT.WALL_H),
      roofKind: this.roofKind,
      pieces: this.pieces,
      doors: this.doors,
      stairs: this.stairRecs,
      stairHoles: this.stairHoles,
      exteriorWalls: this.extWalls,
      colliders: this.colliders,
      floors: this.floors,
      containers: this.containers,
      roomPoints: this.roomPoints,
      npcPoints: this.npcPoints,
      padHW: this.padHW,
      padHD: this.padHD,
    };
    const roofBounds = this.aabb(-this.w / 2, -this.d / 2, this.w / 2, this.d / 2);
    return {
      group: this.group,
      colliders: this.colliders,
      floors: this.floors,
      containers: this.containers,
      roofs: this.roofKind === 'none' ? [] : [{ bounds: roofBounds, group: this.roofLocal }],
      building,
    };
  }
}
