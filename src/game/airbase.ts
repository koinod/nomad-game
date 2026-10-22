// airbase.ts — the REVAMPED AIRBASE (Ian's order, 2026-10-21), composed:
// the portable structure kit (Airfield.ts) sited by the ONE site
// definition (airbaseSite.ts), plus the ground works — runway, taxiway,
// apron and the MARKED PADS the fleet respawns on.
//
// Every vehicle in the game homes here now: GT500, V-04 Sprinter and
// the Nomad Prime on painted pads along the apron, the Seahawk on its
// pad (position is contract), the Dark Horse's pad marked and waiting.
// Saved vehicle positions still restore (persistence is law) — these
// pads are where a FRESH start, a reset, or a recovery puts the fleet.
//
// Lighting doctrine: pad floodlights are PROPS — poles and heads, no
// fake light. The real sun + hemisphere standard does the work; the
// interiors' light is proven by the daylight audit in the gate.

import * as THREE from 'three';
import { buildAirfield } from './Airfield';
import {
  AIRBASE_PADS, AIRBASE_SITE, siteToWorld,
  type AirbasePad, type AirbaseSite,
} from './airbaseSite';
import type { Collider } from './Colliders';
import type { KitResult } from './kit';
import { decalPlane } from './modelKit';
import { mergeStaticMeshes, excludeNamedSubtrees } from './staticMerge';

type GroundY = (x: number, z: number) => number;

export interface AirbaseBuild {
  kits: KitResult[];
  /** Runway + apron + pad markings + props, one group at the site. */
  groundGroup: THREE.Group;
  /** Colliders for apron props (floodlight poles, windsock) — the kits
   *  carry their own; Game merges both. */
  propColliders: Collider[];
  pads: AirbasePad[];
}

const PAINT = 0xd8d4c4;
const HELI_PAINT = 0xe8c84a;

/** The apron slab in site-local coords — every pad (and the fuel
 *  point) sits on it; the gate asserts exactly that. */
export const APRON_LOCAL = { cx: -6, cz: -4.5, w: 104, d: 33 };

function box(
  g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Runway + taxiway + apron + pads + props, in SITE-LOCAL coords (the
 *  group carries the site transform, exactly like a kit building). */
function buildGroundWorks(site: AirbaseSite, groundY: GroundY): { group: THREE.Group; colliders: Collider[] } {
  const g = new THREE.Group();
  const gy = groundY(site.origin[0], site.origin[1]);
  const slabY = gy + 0.03; // slab center; top = gy + 0.06
  const paintY = gy + 0.072;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.96 });
  const paint = new THREE.MeshStandardMaterial({ color: PAINT, roughness: 0.9 });
  const heliPaint = new THREE.MeshStandardMaterial({ color: HELI_PAINT, roughness: 0.9 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x424c52, roughness: 0.8, metalness: 0.3 });
  const colliders: Collider[] = [];
  const propCollider = (lx: number, lz: number, half: number): void => {
    const [ax, az] = siteToWorld(site, lx - half, lz - half);
    const [bx, bz] = siteToWorld(site, lx + half, lz + half);
    colliders.push({
      x0: Math.min(ax, bx), z0: Math.min(az, bz),
      x1: Math.max(ax, bx), z1: Math.max(az, bz),
    });
  };

  // --- runway (threshold bars + centerline dashes) ---
  box(g, 190, 0.06, 17, asphalt, 10, slabY, -62).castShadow = false;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(g, 7, 0.02, 1.1, paint, 10 + sx * 90, paintY, -62 - 5.4 + i * 3.6).castShadow = false;
    }
  }
  for (let i = 0; i < 11; i++) {
    box(g, 6, 0.02, 0.55, paint, 10 - 75 + i * 15, paintY, -62).castShadow = false;
  }
  // --- taxiway: runway to apron ---
  box(g, 10, 0.06, 28, asphalt, 3, slabY, -39).castShadow = false;
  // --- apron: hangar front + the whole pads row + the fuel point ---
  box(g, APRON_LOCAL.w, 0.06, APRON_LOCAL.d, asphalt, APRON_LOCAL.cx, slabY, APRON_LOCAL.cz).castShadow = false;

  // --- marked pads ---
  for (const pad of AIRBASE_PADS) {
    const mat = pad.id === 'pad_seahawk' ? heliPaint : paint;
    const t = 0.18; // painted line width
    box(g, pad.hx * 2, 0.02, t, mat, pad.lx, paintY, pad.lz - pad.hz + t / 2).castShadow = false;
    box(g, pad.hx * 2, 0.02, t, mat, pad.lx, paintY, pad.lz + pad.hz - t / 2).castShadow = false;
    box(g, t, 0.02, pad.hz * 2, mat, pad.lx - pad.hx + t / 2, paintY, pad.lz).castShadow = false;
    box(g, t, 0.02, pad.hz * 2, mat, pad.lx + pad.hx - t / 2, paintY, pad.lz).castShadow = false;
    const label = decalPlane(pad.label, Math.min(5, pad.hx * 1.1), pad.id === 'pad_seahawk' ? 'rgba(232,200,74,0.95)' : 'rgba(216,212,196,0.95)', 52);
    label.rotation.x = -Math.PI / 2;
    label.position.set(pad.lx, paintY + 0.012, pad.lz);
    g.add(label);
    // greeble: low corner blocks mark each pad's corners at night
    // and in the rain — flush enough to roll over, named for the gate
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const marker = box(g, 0.34, 0.1, 0.34, mat, pad.lx + sx * (pad.hx - 0.4), gy + 0.11, pad.lz + sz * (pad.hz - 0.4));
        marker.name = 'pad_marker';
        marker.castShadow = false;
      }
    }
  }

  // --- floodlight poles (props — the sun does the work) ---
  for (const [lx, lz] of [[-30, -19], [14, -19], [44, -16], [-50, 12]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 8), steelDark);
    pole.position.set(lx, gy + 3.5, lz);
    pole.castShadow = true;
    g.add(pole);
    box(g, 1.1, 0.28, 0.34, steelDark, lx, gy + 7.05, lz);
    box(g, 0.7, 0.5, 0.7, steelDark, lx, gy + 0.25, lz);
    propCollider(lx, lz, 0.36);
  }

  // --- windsock by the runway ---
  {
    const lx = 66;
    const lz = -48;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), steelDark);
    pole.position.set(lx, gy + 2.5, lz);
    pole.castShadow = true;
    g.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.7, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xc85a28, roughness: 0.9, side: THREE.DoubleSide }),
    );
    sock.rotation.z = Math.PI / 2 - 0.18; // streaming east, slight droop
    sock.position.set(lx + 0.95, gy + 4.8, lz);
    g.add(sock);
    propCollider(lx, lz, 0.3);
  }

  g.position.set(site.origin[0], 0, site.origin[1]);
  g.rotation.y = (site.rotQ * Math.PI) / 2;
  return { group: g, colliders };
}

/** Build the whole airbase at the site (demonstration siting: the old
 *  plateau — AIRBASE_SITE). World adds the groups and merges collision. */
export function buildAirbaseSite(groundY: GroundY, site: AirbaseSite = AIRBASE_SITE): AirbaseBuild {
  const af = buildAirfield(groundY, site);
  const { group, colliders } = buildGroundWorks(site, groundY);
  // Perf (2026-10-22): the ground works are ~100 one-part meshes
  // (runway dashes, pad outlines, markers) — fold the statics into
  // one merged mesh per material. Named pad_marker blocks and the
  // per-label decal planes (unique materials) survive untouched.
  mergeStaticMeshes(group, { mergedName: 'airbase-ground-merged', exclude: excludeNamedSubtrees });
  return { kits: af.results, groundGroup: group, propColliders: colliders, pads: AIRBASE_PADS };
}
