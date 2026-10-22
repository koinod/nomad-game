// figures.test.ts — LANE 4: the figureKit rig + behavior parity.
//
// Two contracts are pinned here:
//  1. STRUCTURE — every husk kind and the human figure build on the
//     shared rig (named joint pivots, skull sitting on the kind's
//     HitProfile head window), so animation/pose code can trust it.
//  2. BEHAVIOR PARITY — the model swap must not move a single gameplay
//     number: shriek wind-up + interrupt, brute charge + explosion
//     counter, spitter telegraph, bloater burst, raycast hit windows.

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildHumanFigure, buildHuskFigure, bindFigureGLB,
  type FigureRig, type HuskFigureKind,
} from '../game/figureKit';
import { Husk, HuskManager, type HuskCtx, type HuskKind, type SpawnZone } from '../game/Husks';
import { SHRIEK_WINDUP_SEC } from '../game/huskMath';
import { mulberry32 } from '../game/rng';

const PAL = { skin: 0x8a7a68, jacket: 0x5a4632, pants: 0x35322c, dark: 0x2c2c30 };

// kind -> (height, profile headY) lifted from Husks' KIND_STATS: the
// visible skull must sit where the hit resolution thinks the head is.
const KIND_PROFILE: Record<HuskKind, { height: number; headY: number }> = {
  shambler: { height: 1.8, headY: 1.71 },
  stalker: { height: 1.95, headY: 1.85 },
  armored: { height: 1.92, headY: 1.82 },
  screamer: { height: 2.1, headY: 2.0 },
  brute: { height: 2.4, headY: 2.26 },
  crawler: { height: 0.95, headY: 0.6 },
  bloater: { height: 1.85, headY: 1.76 },
  spitter: { height: 1.85, headY: 1.76 },
};

function skullWorldY(kind: HuskKind): number {
  const { height, headY } = KIND_PROFILE[kind];
  const rig = buildHuskFigure(kind as HuskFigureKind, {
    height, headCenterY: headY, palette: PAL, vrnd: mulberry32(7),
  });
  rig.group.updateWorldMatrix(true, true);
  const skull = rig.head.getObjectByName('skull');
  expect(skull, `${kind} skull`).toBeDefined();
  const v = new THREE.Vector3();
  skull!.getWorldPosition(v);
  return v.y;
}

describe('figureKit rig structure', () => {
  it('every husk kind exposes the full pivot set', () => {
    for (const kind of Object.keys(KIND_PROFILE) as HuskKind[]) {
      const { height, headY } = KIND_PROFILE[kind];
      const rig = buildHuskFigure(kind as HuskFigureKind, {
        height, headCenterY: headY, palette: PAL, vrnd: mulberry32(3),
      });
      expect(rig.torso, kind).toBeTruthy();
      expect(rig.head, kind).toBeTruthy();
      expect(rig.jaw, kind).toBeTruthy();
      expect(rig.armL && rig.armR && rig.legL && rig.legR, kind).toBeTruthy();
      expect(rig.eyeMat, kind).toBeTruthy();
      expect(rig.bodyMat, kind).toBeTruthy();
      expect(rig.mats.length, kind).toBeGreaterThan(3);
      // only the spitter carries the sac feature
      expect(rig.sac !== null, kind).toBe(kind === 'spitter');
      // the figure is real geometry, not a token
      let meshes = 0;
      rig.group.traverse((c) => { if (c instanceof THREE.Mesh) meshes++; });
      expect(meshes, kind).toBeGreaterThan(12);
    }
  });

  it('upright kinds place the skull on the HitProfile head window', () => {
    for (const kind of ['shambler', 'stalker', 'armored', 'screamer', 'brute', 'bloater', 'spitter'] as HuskKind[]) {
      const y = skullWorldY(kind);
      expect(Math.abs(y - KIND_PROFILE[kind].headY), `${kind}: skull ${y}`).toBeLessThan(0.06);
    }
  });

  it('crawler rides low and thrusts its head forward', () => {
    const y = skullWorldY('crawler');
    expect(y).toBeGreaterThan(0.42);
    expect(y).toBeLessThan(0.82);
    const rig = buildHuskFigure('crawler', {
      height: 0.95, headCenterY: 0.6, palette: PAL, vrnd: mulberry32(5),
    });
    rig.group.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    rig.head.getObjectByName('skull')!.getWorldPosition(v);
    expect(v.z).toBeGreaterThan(0.4); // head at the FRONT of the body
  });

  it('legs attach at the hips: anatomical pivot width, parallel at rest (Item 8)', () => {
    // Ian playtest 2026-10-21: "legs are detached from hips, out to
    // the sides". The pivots sat at ±0.095H — outside the pelvis.
    // Pin the anatomy: hip joints at ±0.09..0.11 m for a 1.8 m figure,
    // scaling with height, hanging straight (no rest splay), with the
    // thigh tops meeting the pelvis instead of floating beside it.
    const base = buildHumanFigure({ palette: PAL });
    expect(Math.abs(base.legL.position.x)).toBeGreaterThanOrEqual(0.09);
    expect(Math.abs(base.legL.position.x)).toBeLessThanOrEqual(0.11);
    expect(base.legL.position.x).toBeCloseTo(-base.legR.position.x, 6);
    expect(base.legL.position.z).toBe(0);
    expect(base.legL.rotation.z).toBe(0);
    expect(base.legR.rotation.z).toBe(0);
    expect(base.legL.rotation.x).toBe(base.pose.legLX);
    // proportional on a bigger frame
    const brute = buildHumanFigure({ palette: PAL, height: 2.4 });
    expect(Math.abs(brute.legL.position.x)).toBeCloseTo(0.055 * 2.4, 3);
    // thigh inner edges nearly meet at the crotch (no bow-legged gap):
    // pivot 0.099 - thigh top half-width ~0.094 leaves ~5 mm
    const thighHalf = 0.052 * 1.8;
    expect(Math.abs(base.legL.position.x) - thighHalf).toBeLessThan(0.02);
    // and the thigh stays inside a human silhouette (pivot + half < 0.21)
    expect(Math.abs(base.legL.position.x) + thighHalf).toBeLessThan(0.21);
  });

  it('human figure: contract proportions + gear renders on the body', () => {
    const base = buildHumanFigure({ palette: PAL });
    expect(base.height).toBe(1.8);
    expect(base.legL.position.y).toBeCloseTo(0.864, 3); // hip line .48H
    const count = (r: typeof base) => {
      let n = 0;
      r.group.traverse((c) => { if (c instanceof THREE.Mesh) n++; });
      return n;
    };
    const geared = buildHumanFigure({
      palette: PAL, hairStyle: 'long', gear: { pack: 2, vest: true, helmet: true, riotVisor: true },
    });
    expect(count(geared)).toBeGreaterThan(count(base) + 4);
    // build variants actually change the frame
    const slim = buildHumanFigure({ palette: PAL, build: 'slim' });
    const heavy = buildHumanFigure({ palette: PAL, build: 'heavy' });
    slim.group.updateWorldMatrix(true, true);
    heavy.group.updateWorldMatrix(true, true);
    const sx = new THREE.Box3().setFromObject(slim.group);
    const hx = new THREE.Box3().setFromObject(heavy.group);
    expect(hx.max.x - hx.min.x).toBeGreaterThan(sx.max.x - sx.min.x);
  });

  it('bindFigureGLB binds named pivots and rejects a poseless GLB', () => {
    const root = new THREE.Group();
    for (const n of ['torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR']) {
      const g = new THREE.Group();
      g.name = n;
      root.add(g);
    }
    const tm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    tm.name = 'torsoMesh';
    root.add(tm);
    const rig = bindFigureGLB(root, 1.8);
    expect(rig.torso).toBeTruthy();
    expect(rig.bodyMat).toBeTruthy();
    const bare = new THREE.Group();
    expect(() => bindFigureGLB(bare, 1.8)).toThrow(/missing required pivot/);
  });
});

// ------------------------------------------------------- behavior parity ---

const groundY = () => 0;
function ctx(playerPos: THREE.Vector3): HuskCtx {
  return {
    playerPos, isNight: false, groundY, colliders: [],
    onHuskKilled: () => undefined, daysElapsed: 0,
  };
}
const rng = mulberry32(99);
const DIR = new THREE.Vector3(1, 0, 0);

describe('husk behavior parity after the figure swap', () => {
  it('HitProfiles are unchanged by the rebuild', () => {
    const mk = (kind: HuskKind) => new Husk(`p_${kind}`, kind, 0, 0, 'test', groundY);
    expect(mk('shambler').profile).toEqual({ bodyY: 1.0, bodyHalfH: 1.1, bodyR: 0.55, headY: 1.71, headR: 0.38 });
    expect(mk('brute').profile).toEqual({ bodyY: 1.25, bodyHalfH: 1.35, bodyR: 0.8, headY: 2.26, headR: 0.42 });
    expect(mk('crawler').profile).toEqual({ bodyY: 0.5, bodyHalfH: 0.55, bodyR: 0.62, headY: 0.6, headR: 0.34 });
    expect(mk('armored').armorClass).toBe(2);
  });

  it('screamer: wind-up completes into a shriek on schedule', () => {
    const h = new Husk('sc1', 'screamer', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 10));
    h.update(0.1, c, rng); // eyes on the player -> wind-up starts
    expect(h.windupT).toBeGreaterThan(0);
    let fired = false;
    for (let t = 0; t < SHRIEK_WINDUP_SEC + 0.6; t += 0.1) {
      h.update(0.1, c, rng);
      if (h.shriekFired) { fired = true; break; }
    }
    expect(fired).toBe(true);
  });

  it('screamer: a headshot during the wind-up breaks the shriek', () => {
    const h = new Husk('sc2', 'screamer', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 10));
    h.update(0.1, c, rng);
    expect(h.windupT).toBeGreaterThan(0);
    h.damage(20, DIR, 2.2, false, { head: true });
    expect(h.windupT).toBe(0);
    expect(h.shriekCd).toBeGreaterThan(0);
  });

  it('brute: charges in its window and explosions are its counter', () => {
    const h = new Husk('br1', 'brute', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 10));
    h.update(0.1, c, rng); // sees the player at 10m: inside 5.5..15
    expect(h.chargeT).toBeGreaterThan(0);
    const hp0 = h.hp;
    h.damage(50, DIR, 0, false, { explosive: true });
    expect(hp0 - h.hp).toBe(80); // 50 x BRUTE_EXPLOSION_MULT (1.6)
  });

  it('spitter: telegraphs, then hands the manager a launch point', () => {
    const h = new Husk('sp1', 'spitter', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 12)); // inside the 8..16 band
    h.update(0.1, c, rng);
    expect(h.telegraphT).toBeGreaterThan(0);
    for (let t = 0; t < 1.2 && !h.spitLaunch; t += 0.1) h.update(0.1, c, rng);
    expect(h.spitLaunch).not.toBeNull();
    expect(h.spitLaunch!.x).toBeCloseTo(0, 1);
    expect(h.spitLaunch!.z).toBeCloseTo(12, 1);
  });

  it('lane 8 hook #10: husk_lost fires exactly once when the trail goes cold', () => {
    const h = new Husk('hl1', 'shambler', 0, 0, 'test', groundY);
    let lost = 0;
    const near = ctx(new THREE.Vector3(0, 0, 10));
    near.onHuskLost = () => { lost++; };
    h.update(0.1, near, rng); // sees the player -> hunt
    expect(h.state).toBe('hunt');
    // player breaks line of sight (far + behind): the 6s clock runs out
    const far = ctx(new THREE.Vector3(0, 0, -40));
    far.onHuskLost = near.onHuskLost;
    for (let t = 0; t < 16 && h.state !== 'investigate'; t += 0.5) h.update(0.5, far, rng);
    expect(h.state).toBe('investigate');
    expect(lost).toBe(1);
    // and it does not re-fire while it investigates / returns
    for (let t = 0; t < 4; t += 0.5) h.update(0.5, far, rng);
    expect(lost).toBe(1);
  });

  it('bloater: death arms the burst', () => {
    const h = new Husk('bl1', 'bloater', 0, 0, 'test', groundY);
    const hp0 = h.hp;
    expect(hp0).toBe(70);
    const killed = h.damage(999, DIR, 2.2, true);
    expect(killed).toBe(true);
    expect(h.burstPending).toBe(true);
  });

  it('raycast: body and head windows resolve through the profiles', () => {
    const scene = new THREE.Scene();
    const zone: SpawnZone = { id: 't', x: 0, z: 0, radius: 0.5, count: 1, kinds: ['shambler'] };
    const mgr = new HuskManager(scene, [zone], 42);
    mgr.spawnInitial(new Set(), () => 5, false, 0);
    expect(mgr.husks.length).toBe(1);
    const h = mgr.husks[0];
    const base = h.group.position; // y = 5 (groundY)
    const shoot = (aimY: number) => {
      const origin = new THREE.Vector3(base.x, aimY, base.z - 12);
      const target = new THREE.Vector3(base.x, aimY, base.z);
      const dir = target.clone().sub(origin).normalize();
      return mgr.raycastShot(origin, dir, 40);
    };
    const body = shoot(base.y + h.profile.bodyY);
    expect(body?.husk).toBe(h);
    expect(body?.head).toBe(false);
    const head = shoot(base.y + h.profile.headY);
    expect(head?.husk).toBe(h);
    expect(head?.head).toBe(true);
  });
});

// ------------------------------------------------ authored figures, wave 1 ---

/** Extract a GLB's JSON chunk read as utf8: the chunk is plain JSON and
 *  a string-aware brace scan finds its exact end before the binary chunk. */
function gltfJson(path: string): {
  nodes: { name?: string; children?: number[]; translation?: number[]; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; material?: number }[] }[];
  materials: { name?: string; extensions?: Record<string, unknown> }[];
} {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('{"asset"');
  expect(start, 'GLB JSON chunk').toBeGreaterThanOrEqual(0);
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  expect(end, 'GLB JSON chunk end').toBeGreaterThan(start);
  return JSON.parse(text.slice(start, end));
}

const AUTHORED_GLB = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..',
  'public', 'figures', 'husk_shambler_authored.glb',
);

describe('authored shambler GLB (wave 1)', () => {
  it('the shipped artifact honors the bindFigureGLB node contract', () => {
    const g = gltfJson(AUTHORED_GLB);
    const names = g.nodes.map((n) => n.name);
    for (const req of ['torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR', 'torsoMesh', 'eyes', 'skull']) {
      expect(names, req).toContain(req);
    }
    const parent = new Map<number, number>();
    g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
    const idx = (name: string) => names.indexOf(name);
    expect(g.nodes[parent.get(idx('head'))!].name).toBe('torso');
    expect(g.nodes[parent.get(idx('jaw'))!].name).toBe('head');
    expect(g.nodes[parent.get(idx('armL'))!].name).toBe('torso');
    // the skull rides the translation chain onto the HitProfile window
    let y = 0;
    let i: number | undefined = idx('skull');
    while (i !== undefined) {
      y += g.nodes[i].translation?.[1] ?? 0;
      i = parent.get(i);
    }
    expect(Math.abs(y - 1.71)).toBeLessThan(0.03);
    // eyes load as MeshBasicMaterial (unlit); the torso stays lit (flash seam)
    const matOf = (name: string) => g.materials[g.meshes[g.nodes[idx(name)].mesh!].primitives[0].material!];
    expect(matOf('eyes').extensions?.KHR_materials_unlit).toBeDefined();
    expect(matOf('torsoMesh').extensions?.KHR_materials_unlit).toBeUndefined();
    // grime vertex colors ride the visible shells
    for (const name of ['skull', 'torsoMesh', 'torsoSkin']) {
      expect(g.meshes[g.nodes[idx(name)].mesh!].primitives[0].attributes.COLOR_0, name).toBeDefined();
    }
  });

  it('useAuthoredShambler swaps ONLY shamblers, onto the slump, with per-husk materials', () => {
    // a synthetic template in the authored GLB's shape (the bind contract)
    const tmpl = new THREE.Group();
    const mk = (name: string, parent: THREE.Object3D) => {
      const o = new THREE.Group();
      o.name = name;
      parent.add(o);
      return o;
    };
    const torso = mk('torso', tmpl);
    const head = mk('head', torso);
    mk('jaw', head);
    mk('armL', torso);
    mk('armR', torso);
    mk('legL', tmpl);
    mk('legR', tmpl);
    const tm = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x776655 }),
    );
    tm.name = 'torsoMesh';
    torso.add(tm);
    const em = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
    );
    em.name = 'eyes';
    head.add(em);

    const sh = new Husk('auth_sh', 'shambler', 0, 0, 'test', groundY);
    const childrenBefore = sh.group.children.length;
    expect(sh.useAuthoredShambler(tmpl)).toBe(true);
    expect(sh.useAuthoredShambler(tmpl)).toBe(false); // one swap only
    expect(sh.group.children.length).toBe(childrenBefore); // old rig out, authored in
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (sh as any).rig as FigureRig;
    expect(rig.pose.torsoX).toBe(0.14); // the poseSlump base, same as the kit build
    expect(rig.torso.rotation.x).toBe(0.14);
    // per-husk material clones: flashing this husk never touches the template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyMat = (sh as any).bodyMat as THREE.MeshStandardMaterial;
    expect(bodyMat).not.toBe(tm.material);
    sh.damage(5, DIR, 0, false);
    expect(bodyMat.emissive.getHex()).toBe(0xff2222);
    expect((tm.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);
    // other kinds refuse — their interim meshes stand
    const st = new Husk('auth_st', 'stalker', 0, 0, 'test', groundY);
    expect(st.useAuthoredShambler(tmpl)).toBe(false);
  });
});

// ------------------------------------------------ authored figures, wave 2 ---

/** A synthetic template in the authored shape (the bind contract). */
function syntheticAuthoredTemplate(withSac = false): THREE.Group {
  const tmpl = new THREE.Group();
  const mk = (name: string, parent: THREE.Object3D) => {
    const o = new THREE.Group();
    o.name = name;
    parent.add(o);
    return o;
  };
  const torso = mk('torso', tmpl);
  const head = mk('head', torso);
  mk('jaw', head);
  mk('armL', torso);
  mk('armR', torso);
  mk('legL', tmpl);
  mk('legR', tmpl);
  const tm = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.6, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x776655 }),
  );
  tm.name = 'torsoMesh';
  torso.add(tm);
  const em = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd76a }),
  );
  em.name = 'eyes';
  head.add(em);
  if (withSac) {
    const sac = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x7d9b3a }),
    );
    sac.name = 'sac';
    torso.add(sac);
  }
  return tmpl;
}

/** Per-class artifact expectations. skullY is the UNPOSED skull-center
 *  height the class builder targets: the HitProfile headY for every
 *  kind except the crawler, whose kit build stands at 1.62 and is
 *  re-posed quadruped at runtime. Rows land one class per commit. */
const AUTHORED2: { kind: HuskKind; file: string; skullY: number; hipY: number; legX: number; extra: string[] }[] = [
  { kind: 'crawler', file: 'husk_crawler_authored.glb', skullY: 1.62, hipY: 0.864, legX: 0.0851, extra: [] },
  { kind: 'spitter', file: 'husk_spitter_authored.glb', skullY: 1.76, hipY: 0.888, legX: 0.0875, extra: ['sac'] },
  { kind: 'screamer', file: 'husk_screamer_authored.glb', skullY: 2.0, hipY: 1.008, legX: 0.0993, extra: [] },
  { kind: 'bloater', file: 'husk_bloater_authored.glb', skullY: 1.76, hipY: 0.888, legX: 0.1201, extra: [] },
  { kind: 'stalker', file: 'husk_stalker_authored.glb', skullY: 1.85, hipY: 0.936, legX: 0.0922, extra: [] },
  { kind: 'armored', file: 'husk_armored_authored.glb', skullY: 1.82, hipY: 0.9216, legX: 0.1246, extra: [] },
  { kind: 'brute', file: 'husk_brute_authored.glb', skullY: 2.26, hipY: 1.152, legX: 0.1558, extra: [] },
];

describe('authored husk GLBs (wave 2)', () => {
  for (const row of AUTHORED2) {
    it(`${row.kind}: the shipped artifact honors the bindFigureGLB node contract`, () => {
      const path = join(
        dirname(fileURLToPath(import.meta.url)), '..', '..',
        'public', 'figures', row.file,
      );
      const g = gltfJson(path);
      const names = g.nodes.map((n) => n.name);
      for (const req of ['torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR', 'torsoMesh', 'eyes', 'skull', ...row.extra]) {
        expect(names, req).toContain(req);
      }
      const parent = new Map<number, number>();
      g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
      const idx = (name: string) => names.indexOf(name);
      expect(g.nodes[parent.get(idx('head'))!].name).toBe('torso');
      expect(g.nodes[parent.get(idx('jaw'))!].name).toBe('head');
      expect(g.nodes[parent.get(idx('armL'))!].name).toBe('torso');
      // the skull rides the translation chain onto the class window
      let y = 0;
      let i: number | undefined = idx('skull');
      while (i !== undefined) {
        y += g.nodes[i].translation?.[1] ?? 0;
        i = parent.get(i);
      }
      expect(Math.abs(y - row.skullY)).toBeLessThan(0.03);
      // pivots where the kit puts them (hip line, bi-acetabular width)
      const torsoT = g.nodes[idx('torso')].translation!;
      expect(Math.abs(torsoT[1] - row.hipY)).toBeLessThan(0.01);
      for (const leg of ['legL', 'legR']) {
        const t = g.nodes[idx(leg)].translation!;
        expect(Math.abs(Math.abs(t[0]) - row.legX)).toBeLessThan(0.006);
        expect(Math.abs(t[1] - row.hipY)).toBeLessThan(0.01);
      }
      // eyes load as MeshBasicMaterial (unlit); the torso stays lit
      const matOf = (name: string) => g.materials[g.meshes[g.nodes[idx(name)].mesh!].primitives[0].material!];
      expect(matOf('eyes').extensions?.KHR_materials_unlit).toBeDefined();
      expect(matOf('torsoMesh').extensions?.KHR_materials_unlit).toBeUndefined();
      // grime vertex colors ride the visible shells
      for (const name of ['skull', 'torsoMesh', 'torsoSkin']) {
        expect(g.meshes[g.nodes[idx(name)].mesh!].primitives[0].attributes.COLOR_0, name).toBeDefined();
      }
    });
  }

  it('crawler swap applies the quadruped re-pose the kit builder applies', () => {
    const cr = new Husk('auth2_cr', 'crawler', 0, 0, 'test', groundY);
    expect(cr.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(true);
    expect(cr.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(false); // one swap only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (cr as any).rig as FigureRig;
    expect(rig.torso.position.y).toBe(0.4);
    expect(rig.torso.rotation.x).toBe(1.35);
    expect(rig.pose.torsoX).toBe(1.35);
    expect(rig.head.rotation.x).toBe(-1.1);
    expect(rig.armL.rotation.x).toBe(-1.85);
    expect(rig.legL.rotation.x).toBe(0.95);
    expect(rig.legR.position.z).toBe(-0.2);
    expect(rig.group.scale.y).toBe(0.96);
  });

  it('spitter swap binds the authored sac and lands on the kit slump', () => {
    const sp = new Husk('auth2_sp', 'spitter', 0, 0, 'test', groundY);
    expect(sp.useAuthoredFigure(syntheticAuthoredTemplate(true))).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (sp as any).rig as FigureRig;
    expect(rig.sac).not.toBeNull();
    expect(rig.sac!.name).toBe('sac');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sp as any).sacMesh).toBe(rig.sac); // the telegraph pulses THIS mesh
    expect(rig.pose.torsoX).toBe(0.14);
    expect(rig.torso.rotation.x).toBe(0.14);
  });

  it('screamer swap applies the kit builder\u2019s bespoke stance (no slump)', () => {
    const sc = new Husk('auth2_sc', 'screamer', 0, 0, 'test', groundY);
    expect(sc.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (sc as any).rig as FigureRig;
    expect(rig.torso.rotation.x).toBe(0.06);
    expect(rig.pose.torsoX).toBe(0.06);
    expect(rig.head.rotation.x).toBe(-0.25); // thrown back — the wind-up deepens it
    expect(rig.armL.rotation.x).toBe(-0.42);
    expect(rig.armR.rotation.x).toBe(-0.34);
  });

  it('bloater swap slumps and splays — authored pivots stay put', () => {
    const bl = new Husk('auth2_bl', 'bloater', 0, 0, 'test', groundY);
    const tmpl = syntheticAuthoredTemplate();
    expect(bl.useAuthoredFigure(tmpl)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (bl as any).rig as FigureRig;
    expect(rig.pose.torsoX).toBe(0.1); // the bloater's shallower slump
    // Joint-continuity pass (2026-10-21): the kit's ±0.17 outboard
    // shift is GONE for authored figures — it floated the arms
    // detached beside the belly. Pivots authored at x=0 in the
    // template stay at x=0; the 0.38 splay alone clears the mass.
    expect(rig.armL.position.x).toBeCloseTo(0);
    expect(rig.armR.position.x).toBeCloseTo(0);
    expect(rig.armL.rotation.z).toBe(0.38);
    expect(rig.armR.rotation.z).toBe(-0.38);
  });

  it('stalker swap applies its deeper 0.2 slump', () => {
    const st = new Husk('auth2_st', 'stalker', 0, 0, 'test', groundY);
    expect(st.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (st as any).rig as FigureRig;
    expect(rig.pose.torsoX).toBe(0.2);
    expect(rig.torso.rotation.x).toBe(0.2);
  });

  it('armored swap applies its shallow 0.14 slump', () => {
    const ar = new Husk('auth2_ar', 'armored', 0, 0, 'test', groundY);
    expect(ar.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (ar as any).rig as FigureRig;
    expect(rig.pose.torsoX).toBe(0.14);
    expect(rig.torso.rotation.x).toBe(0.14);
  });

  it('brute swap applies the heavy stance AND the kit group breadth', () => {
    const br = new Husk('auth2_br', 'brute', 0, 0, 'test', groundY);
    expect(br.useAuthoredFigure(syntheticAuthoredTemplate())).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rig = (br as any).rig as FigureRig;
    expect(rig.pose.torsoX).toBe(0.24);
    expect(rig.head.rotation.x).toBe(0.28);
    expect(rig.armL.rotation.x).toBe(-0.3);
    // the runtime adds the breadth — the authored clay is built unscaled
    expect(rig.group.scale.x).toBeCloseTo(1.22);
    expect(rig.group.scale.z).toBeCloseTo(1.12);
  });
});

/* ------------------------------------------------------------------ *
 * JOINT CONTINUITY (2026-10-21) — Ian's playtest verdict on the wave-2
 * crawler proof: "legs disconnected — legs and arms should bend". The
 * Python verifier (tools/figures/joint_check.py) pins the same numbers
 * at build time; this block pins them on the SHIPPED artifacts: per
 * limb pivot, in pivot-local space (glTF Y-up, +Z = figure front) —
 *   telescope:  the limb's own clay reaches >= 0.028 above the pivot;
 *   bend:       clay below -0.45 hangs displaced toward flexion
 *               (arms forward: centroid Z >= +0.022; legs back: <= -0.008);
 *   coverage:   parent-side clay fills >= 7 of 8 octants around the
 *               pivot with >= 30 verts in the shell (0.25x–1.3x the
 *               joint-mass radius) — a pivot backed on one side only
 *               fails (the pre-pass loft wall: 4/8).
 * ------------------------------------------------------------------ */
type Mat4 = number[][]; // row-major 4x4

function matMul(a: Mat4, b: Mat4): Mat4 {
  return a.map((row, i) => row.map((_, j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j]));
}
function matInv(m: Mat4): Mat4 {
  const [a, b, c] = [m[0][0], m[0][1], m[0][2]];
  const [d, e, f] = [m[1][0], m[1][1], m[1][2]];
  const [g, h, i] = [m[2][0], m[2][1], m[2][2]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
  const t = [m[0][3], m[1][3], m[2][3]];
  const ti = inv.map((r) => -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]));
  return [[...inv[0], ti[0]], [...inv[1], ti[1]], [...inv[2], ti[2]], [0, 0, 0, 1]];
}

interface GlbFull {
  nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
}

function pivotMetrics(path: string) {
  const buf = readFileSync(path);
  const jlen = buf.readUInt32LE(12);
  const g = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8')) as GlbFull;
  const binOff = 20 + jlen + 8;
  const parent = new Map<number, number>();
  g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const local = (n: GlbFull['nodes'][number]): Mat4 => {
    const t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1];
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
    const R = [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    return [
      [R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]],
      [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
      [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]],
      [0, 0, 0, 1],
    ];
  };
  const worldCache = new Map<number, Mat4>();
  const world = (i: number): Mat4 => {
    let m = worldCache.get(i);
    if (!m) {
      m = local(g.nodes[i]);
      const p = parent.get(i);
      if (p !== undefined) m = matMul(world(p), m);
      worldCache.set(i, m);
    }
    return m;
  };
  const xf = (m: Mat4, v: number[]) => [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3],
  ];
  const idx = (name: string) => g.nodes.findIndex((n) => n.name === name);
  const subtree = (root: number) => {
    const out = new Set<number>();
    const stack = [root];
    while (stack.length) {
      const i = stack.pop()!;
      out.add(i);
      stack.push(...(g.nodes[i].children ?? []));
    }
    return out;
  };
  const verts = (set: Set<number>) => {
    const out: number[][] = [];
    for (const i of set) {
      const node = g.nodes[i];
      if (node.mesh === undefined) continue;
      for (const prim of g.meshes[node.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        const bv = g.bufferViews[acc.bufferView];
        const off = binOff + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        const stride = bv.byteStride ?? 12;
        const w = world(i);
        for (let k = 0; k < acc.count; k++) {
          out.push(xf(w, [
            buf.readFloatLE(off + k * stride),
            buf.readFloatLE(off + k * stride + 4),
            buf.readFloatLE(off + k * stride + 8),
          ]));
        }
      }
    }
    return out;
  };
  const sib: Record<string, string> = { armL: 'armR', armR: 'armL', legL: 'legR', legR: 'legL' };
  const meshNodes = new Set(g.nodes.map((n, i) => i).filter((i) => g.nodes[i].mesh !== undefined));
  const out: Record<string, { extUp: number; lowCz: number; near: number; octs: number }> = {};
  for (const piv of ['armL', 'armR', 'legL', 'legR']) {
    const pi = idx(piv);
    const inv = matInv(world(pi));
    const sub = subtree(pi);
    const own = verts(sub).map((v) => xf(inv, v));
    const low = own.filter((v) => v[1] < -0.45);
    // the coverage shell scales with the joint-mass radius, read off
    // the limb's own above-pivot verts (the brute's shoulder ball is
    // 2x a standard class's; below-pivot verts would include the
    // elbow/knee ball and inflate the radius)
    const rBall = Math.max(...own.filter((v) => v[1] > -0.01).map((v) => Math.hypot(v[0], v[1], v[2])));
    const excl = new Set([...sub, ...subtree(idx(sib[piv])), ...subtree(idx('head'))]);
    const pv = verts(new Set([...meshNodes].filter((i) => !excl.has(i)))).map((v) => xf(inv, v));
    const nearV = pv.filter((v) => {
      const d = Math.hypot(v[0], v[1], v[2]);
      return d > rBall * 0.25 && d <= rBall * 1.3;
    });
    const octs = new Set(nearV.map((v) => `${Math.sign(v[0])},${Math.sign(v[1])},${Math.sign(v[2])}`));
    out[piv] = {
      extUp: Math.max(...own.map((v) => v[1])),
      lowCz: low.reduce((a, v) => a + v[2], 0) / Math.max(1, low.length),
      near: nearV.length,
      octs: octs.size,
    };
  }
  return out;
}

describe('authored GLB joint continuity (all 8 classes)', () => {
  const all = [
    { kind: 'shambler', file: 'husk_shambler_authored.glb' },
    ...AUTHORED2.map((r) => ({ kind: r.kind as string, file: r.file })),
  ];
  for (const row of all) {
    it(`${row.kind}: joints telescope, limbs bend, pivots are backed on all sides`, () => {
      const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'figures', row.file);
      const m = pivotMetrics(path);
      for (const piv of ['armL', 'armR', 'legL', 'legR']) {
        const mm = m[piv];
        expect(mm.extUp, `${piv} telescope`).toBeGreaterThanOrEqual(0.028);
        if (piv.startsWith('arm')) expect(mm.lowCz, `${piv} elbow bend`).toBeGreaterThanOrEqual(0.022);
        else expect(mm.lowCz, `${piv} knee bend`).toBeLessThanOrEqual(-0.008);
        expect(mm.near, `${piv} parent coverage count`).toBeGreaterThanOrEqual(30);
        expect(mm.octs, `${piv} parent coverage octants`).toBeGreaterThanOrEqual(7);
      }
    });
  }
});
