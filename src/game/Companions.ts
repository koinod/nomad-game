// Companions.ts — ORDER #6: recruited survivors as living world
// entities — the missing middle layer the Phase A audit found.
//
// The store half of the crew (roster, morale, jobs, dispatch) always
// existed; nobody had a BODY. A Companion is one recruited survivor's
// figure (figureKit, their designed look via survivorLook) driven by:
//
//   ORDERS (store survivorRuntime.order) — follow the player in
//   formation (and take a passenger seat when the player drives),
//   hold a position and guard it, or live at the claimed base.
//   NEEDS (hunger/fatigue) — tick in game minutes via companionMath,
//   flushed back to the store ~1/s; companions eat from the pack or
//   the base stockpile when hungry, rest at base / while riding, and
//   fight at reduced output while flagging.
//   COMBAT ASSIST — engage husks near them with their equipped weapon
//   (the store instance handed over in the Team app), trait-scaled per
//   the trait table's own words, through the same Husk.damage path
//   the player uses; kills feed order #5's survivor XP events.
//
// Animation is the shared figureAnim driver (distance-clocked human
// gait, strike arcs, idle life) — companions move exactly like the
// world expects people to move, because it is the same code.
//
// Honest limits (audit §2): husks still hunt the PLAYER — companions
// are combatants, not targets (retargeting is a Husk FSM change);
// dispatched crews remain the abstract sim's (they are simply not
// here); companion gunfire does not draw the player's ammo.

import * as THREE from 'three';
import { buildHumanFigure, type FigureRig } from './figureKit';
import {
  GAITS, STRIKE_HIT_AT, STRIKE_SEC, applyGaitPose,
  gaitPhaseAdvance, gaitPose, idlePose, strikePose,
} from './figureAnim';
import {
  RUN_SPEED, WALK_SPEED, catchUpMode, formationOffset, needsCombatMult,
  passengerSeatCount, passengerSeatLocal, tickNeeds, traitCombat, weaponProfile,
  type NeedsMode,
} from './companionMath';
import { resolveCollisions, type Collider } from './Colliders';
import { CAR_SEATS, carSeatPose } from './Player';
import { buildHandMesh } from './weaponMeshes';
import { sfx } from '../systems/audio';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { survivorLook, type SurvivorDef } from '../data/survivors';
import { defaultSurvivorRuntime, type SurvivorRuntime } from '../store/types';
import type { Husk } from './Husks';

export interface CompanionVehicleFrame {
  x: number; y: number; z: number;
  quat: THREE.Quaternion;
  defId: string;
  kind?: string;
  width: number; length: number;
  /** Driver-seat anchor locals (the GLB's driver_seat marker). */
  ax?: number; az?: number;
}

export interface CompanionCtx {
  playerPos: THREE.Vector3;
  playerHeading: number;
  groundY: (x: number, z: number, refY?: number) => number;
  colliders: readonly Collider[];
  nearestHusk: (x: number, z: number, r: number) => Husk | null;
  vehicle: CompanionVehicleFrame | null;
  basePos: { x: number; z: number } | null;
  /** Game minutes elapsed since last frame (sleep jumps included). */
  gameMinDelta: number;
}

const ENGAGE_LEASH_PLAYER_M = 26; // followers never chase past this
const ENGAGE_LEASH_ANCHOR_M = 20; // holders/base crew guard their ground
const SCAN_SEC = 0.22;

function hashSeed(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

class Companion {
  readonly id: string;
  readonly rig: FigureRig;
  private seed: number;
  private gaitPhase = 0;
  private gaitBlend = 0;
  private strikeT = 0;
  private strikeHitDone = false;
  private attackCd = 0;
  private scanT: number;
  private target: Husk | null = null;
  private holdX: number;
  private holdZ: number;
  private wasOrder: string | null = null;
  private riding = false;
  private hunger: number;
  private fatigue: number;
  private animT = 0; // idle-life clock (own timebase, like the husks')
  private needsFlushT = 0;
  private eatCd = 0;
  private toastCd = 0;
  private weaponUid: string | null = null;
  private weaponMesh: THREE.Group | null = null;

  constructor(def: SurvivorDef, rt: SurvivorRuntime, x: number, z: number, groundY: (x: number, z: number) => number) {
    this.id = def.id;
    const look = survivorLook(def.id);
    this.rig = buildHumanFigure({
      palette: { skin: look.skin, jacket: look.jacket, pants: look.pants, hair: look.hair },
      build: look.build,
      hairStyle: look.hairStyle,
    });
    this.rig.group.position.set(x, groundY(x, z), z);
    this.seed = hashSeed(def.id);
    this.scanT = this.seed * SCAN_SEC;
    this.holdX = x;
    this.holdZ = z;
    this.hunger = rt.hunger;
    this.fatigue = rt.fatigue;
  }

  get group(): THREE.Group {
    return this.rig.group;
  }

  /** Seat this companion in the player's vehicle, or return null when
   *  the vehicle has no seat for them (they stay on foot). */
  private tryRide(ctx: CompanionCtx, seatIndex: number): boolean {
    const v = ctx.vehicle;
    if (!v) return false;
    if (seatIndex >= passengerSeatCount(v.kind)) return false;
    const driver = { lx: v.ax ?? v.width * 0.21, lz: v.az ?? v.length * 0.03 };
    const local = passengerSeatLocal(seatIndex, driver, v.width);
    if (!local) return false;
    const spec = CAR_SEATS[v.defId];
    const pose = spec ? carSeatPose(this.rig.height, spec) : null;
    const gy = pose ? pose.gy : -0.1;
    const off = new THREE.Vector3(local.lx, gy, local.lz).applyQuaternion(v.quat);
    this.group.position.set(v.x + off.x, v.y + off.y, v.z + off.z);
    this.group.quaternion.copy(v.quat);
    // seated pose: thighs solved to the floorboard, hands resting
    const thighX = pose ? pose.thighX : -1.25;
    this.rig.legL.rotation.x = thighX;
    this.rig.legR.rotation.x = thighX;
    this.rig.armL.rotation.x = this.rig.pose.armLX - 0.35;
    this.rig.armR.rotation.x = this.rig.pose.armRX - 0.35;
    this.rig.torso.rotation.x = this.rig.pose.torsoX;
    this.gaitBlend = 0;
    this.riding = true;
    return true;
  }

  private dismount(ctx: CompanionCtx): void {
    // step out beside the player and stand level again
    const h = ctx.playerHeading;
    const sx = ctx.playerPos.x + Math.cos(h) * 1.7;
    const sz = ctx.playerPos.z - Math.sin(h) * 1.7;
    this.group.position.set(sx, ctx.groundY(sx, sz), sz);
    this.group.quaternion.identity();
    this.riding = false;
  }

  /** Move toward a point; returns the metres actually covered. */
  private moveToward(ctx: CompanionCtx, tx: number, tz: number, speed: number, dt: number): number {
    const p = this.group.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05 || dt <= 0) return 0;
    const step = Math.min(d, speed * dt * Math.min(1, d / 1.1 + 0.25));
    const ox = p.x;
    const oz = p.z;
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    resolveCollisions(p, 0.45, ctx.colliders, p.y);
    p.y = ctx.groundY(p.x, p.z, p.y);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    if (moved > 0.001) this.face(Math.atan2(p.x - ox, p.z - oz), dt);
    return moved;
  }

  private face(yaw: number, dt: number): void {
    const cur = this.group.rotation.y;
    let diff = yaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y = cur + diff * Math.min(1, dt * 10);
  }

  update(
    dt: number,
    ctx: CompanionCtx,
    def: SurvivorDef,
    rt: SurvivorRuntime,
    opts: { dispatched: boolean; formationIndex: number; seatIndex: number | null },
  ): void {
    const g = this.group;
    this.animT += dt;

    if (opts.dispatched || def.hp <= 0) {
      g.visible = false;
      this.riding = false;
      return;
    }
    g.visible = true;

    // hold anchor: captured where the order lands, never dragged along
    if (rt.order === 'hold' && this.wasOrder !== 'hold' && !this.riding) {
      this.holdX = g.position.x;
      this.holdZ = g.position.z;
    }
    this.wasOrder = rt.order;

    // ---- riding ----
    if (rt.order === 'follow' && ctx.vehicle && opts.seatIndex != null) {
      if (this.tryRide(ctx, opts.seatIndex)) {
        this.tickNeeds(ctx, 'ride');
        return;
      }
    }
    if (this.riding) this.dismount(ctx);

    // ---- anchor + leash origin for the active order ----
    let anchorX = ctx.playerPos.x;
    let anchorZ = ctx.playerPos.z;
    let leashFromPlayer = true;
    if (rt.order === 'hold') {
      anchorX = this.holdX;
      anchorZ = this.holdZ;
      leashFromPlayer = false;
    } else if (rt.order === 'base') {
      if (ctx.basePos) {
        const a = (this.seed * Math.PI * 2) + opts.formationIndex * 1.1;
        anchorX = ctx.basePos.x + Math.cos(a) * 4.2;
        anchorZ = ctx.basePos.z + Math.sin(a) * 4.2;
      } else {
        anchorX = this.holdX;
        anchorZ = this.holdZ;
      }
      leashFromPlayer = false;
    }

    // ---- weapon visual follows the store record ----
    const wid = rt.weapon?.itemId ?? null;
    if ((rt.weapon?.uid ?? null) !== this.weaponUid) {
      this.weaponUid = rt.weapon?.uid ?? null;
      if (this.weaponMesh) {
        this.rig.armR.remove(this.weaponMesh);
        this.weaponMesh = null;
      }
      if (wid) {
        this.weaponMesh = buildHandMesh(wid, rt.weapon?.finish, rt.weapon?.mods ?? []);
        this.weaponMesh.position.set(0, -this.rig.height * 0.38, 0.06);
        this.rig.armR.add(this.weaponMesh);
      }
    }

    // ---- combat scan ----
    const tc = traitCombat(def.traits);
    const wp = weaponProfile(wid);
    this.attackCd -= dt;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = SCAN_SEC;
      if (this.target && (!this.target.alive || this.target.state === 'dead')) this.target = null;
      if (!this.target) {
        const engageR = (wp.ranged ? 15 : 12) * tc.engageMult;
        const cand = ctx.nearestHusk(g.position.x, g.position.z, engageR);
        if (cand) {
          const dHusk = Math.hypot(cand.group.position.x - g.position.x, cand.group.position.z - g.position.z);
          const unboldClose = dHusk <= 6.5;
          const alreadyFighting = cand.state === 'hunt' || cand.state === 'attack';
          if (tc.bold || unboldClose || alreadyFighting) this.target = cand;
        }
      }
    }
    if (this.target) {
      const tp = this.target.group.position;
      const anchorD = leashFromPlayer
        ? Math.hypot(tp.x - ctx.playerPos.x, tp.z - ctx.playerPos.z)
        : Math.hypot(tp.x - anchorX, tp.z - anchorZ);
      const leash = leashFromPlayer ? ENGAGE_LEASH_PLAYER_M : ENGAGE_LEASH_ANCHOR_M;
      if (anchorD > leash || !this.target.alive) this.target = null;
    }

    // ---- locomotion: combat target outranks the anchor ----
    let moved = 0;
    let wantFace: number | null = null;
    if (this.target) {
      const tp = this.target.group.position;
      const d = Math.hypot(tp.x - g.position.x, tp.z - g.position.z);
      if (d > wp.range) {
        moved = this.moveToward(ctx, tp.x, tp.z, RUN_SPEED * 0.92, dt);
      } else {
        wantFace = Math.atan2(tp.x - g.position.x, tp.z - g.position.z);
        this.tryStrike(def, tc, wp);
      }
    } else if (rt.order === 'follow') {
      const off = formationOffset(opts.formationIndex);
      const h = ctx.playerHeading;
      const fwdX = Math.sin(h);
      const fwdZ = Math.cos(h);
      const tx = ctx.playerPos.x + fwdZ * off.side - fwdX * off.back;
      const tz = ctx.playerPos.z - fwdX * off.side - fwdZ * off.back;
      const d = Math.hypot(tx - g.position.x, tz - g.position.z);
      const mode = catchUpMode(d);
      if (mode === 'snap') {
        g.position.set(tx, ctx.groundY(tx, tz), tz);
        moved = 0;
        this.gaitBlend = 0;
      } else if (d > 0.55) {
        moved = this.moveToward(ctx, tx, tz, mode === 'run' ? RUN_SPEED : WALK_SPEED, dt);
      } else {
        wantFace = h; // fall in and face the way the player faces
      }
    } else {
      const d = Math.hypot(anchorX - g.position.x, anchorZ - g.position.z);
      if (d > 1.2) moved = this.moveToward(ctx, anchorX, anchorZ, d > 12 ? RUN_SPEED : WALK_SPEED, dt);
    }
    if (wantFace != null) this.face(wantFace, dt);

    // ---- needs ----
    const needsMode: NeedsMode = rt.order === 'base' ? 'rest' : 'active';
    this.tickNeeds(ctx, ctx.gameMinDelta > 30 ? 'rest' : needsMode);
    this.eatWhenHungry(ctx);

    // ---- animation: the shared driver, same as every other body ----
    const gait = GAITS.human;
    this.gaitPhase = gaitPhaseAdvance(this.gaitPhase, moved, gait.cycleM);
    const speedNow = dt > 0 ? moved / dt : 0;
    const target = Math.min(1, speedNow / (WALK_SPEED * 0.75));
    this.gaitBlend += (target - this.gaitBlend) * Math.min(1, dt * 7);
    if (this.gaitBlend < 0.005 && target === 0) this.gaitBlend = 0;
    const pose = gaitPose(this.gaitPhase + this.seed * 6.28, gait, this.gaitBlend);
    if (this.strikeT > 0) {
      this.strikeT -= dt;
      const sp = strikePose(1 - Math.max(this.strikeT, 0) / STRIKE_SEC);
      this.rig.legL.rotation.x = this.rig.pose.legLX + pose.legL;
      this.rig.legR.rotation.x = this.rig.pose.legRX + pose.legR;
      this.rig.armL.rotation.x = this.rig.pose.armLX + sp.armL * 0.7;
      this.rig.armR.rotation.x = this.rig.pose.armRX + sp.armR;
      this.rig.torso.rotation.x = this.rig.pose.torsoX + sp.torsoAdd;
      // the chop lands mid-arc, on the visual — same law as the husks
      const arcT = 1 - Math.max(this.strikeT, 0) / STRIKE_SEC;
      if (!this.strikeHitDone && arcT >= STRIKE_HIT_AT && this.target?.alive) {
        this.strikeHitDone = true;
        const tp = this.target.group.position;
        if (Math.hypot(tp.x - g.position.x, tp.z - g.position.z) <= wp.range + 1.1) {
          this.dealDamage(def, tc, wp);
        }
      }
    } else {
      applyGaitPose(this.rig, pose);
      if (this.gaitBlend < 0.03) {
        const ip = idlePose(this.animT, this.seed);
        this.rig.torso.rotation.x += ip.torsoAdd;
        this.rig.armL.rotation.x += ip.armSway;
        this.rig.armR.rotation.x += ip.armSway;
        this.rig.head.rotation.y = ip.headYaw * 0.7;
      }
    }
    if (pose.bobY > 0) g.position.y += pose.bobY;
    g.rotation.z = pose.rollZ;
  }

  private tryStrike(def: SurvivorDef, tc: ReturnType<typeof traitCombat>, wp: ReturnType<typeof weaponProfile>): void {
    if (this.attackCd > 0 || !this.target?.alive) return;
    this.attackCd = wp.cooldownSec;
    if (wp.ranged) {
      sfx.play('shot', { volume: 0.45 });
      this.dealDamage(def, tc, wp);
    } else {
      sfx.play('swing', { volume: 0.4 });
      this.strikeT = STRIKE_SEC;
      this.strikeHitDone = false;
    }
  }

  private dealDamage(def: SurvivorDef, tc: ReturnType<typeof traitCombat>, wp: ReturnType<typeof weaponProfile>): void {
    const t = this.target;
    if (!t?.alive) return;
    const g = this.group.position;
    const tp = t.group.position;
    const dir = new THREE.Vector3(tp.x - g.x, 0, tp.z - g.z).normalize();
    const dmg = wp.damage * tc.dmgMult * needsCombatMult(this.hunger, this.fatigue);
    const killed = t.damage(dmg, dir, wp.ranged ? 0.6 : 2.0, !wp.ranged);
    if (killed) {
      useGameStore.getState().awardSurvivorEvent(def.id, wp.ranged ? 'husk_kill_ranged' : 'husk_kill_melee');
      this.target = null;
    }
  }

  private tickNeeds(ctx: CompanionCtx, mode: NeedsMode): void {
    const next = tickNeeds(this.hunger, this.fatigue, Math.max(0, ctx.gameMinDelta), mode);
    this.hunger = next.hunger;
    this.fatigue = next.fatigue;
    this.needsFlushT -= ctx.gameMinDelta;
    if (this.needsFlushT <= 0) {
      this.needsFlushT = 1; // flush ~1/min of game time (1 real second)
      useGameStore.getState().setSurvivorNeeds(this.id, this.hunger, this.fatigue);
    }
  }

  private eatWhenHungry(ctx: CompanionCtx): void {
    if (this.hunger >= 40) return;
    this.eatCd -= ctx.gameMinDelta;
    if (this.eatCd > 0) return;
    this.eatCd = 20;
    const s = useGameStore.getState();
    const nearBase = ctx.basePos
      ? Math.hypot(this.group.position.x - ctx.basePos.x, this.group.position.z - ctx.basePos.z) < 45
      : false;
    const eaten = (nearBase ? s.survivorEat(this.id, 'base') : null) ?? s.survivorEat(this.id, 'pack');
    if (eaten) {
      // the store applied the satiety; re-mirror so the local tick
      // continues from the fed value, not the starving one
      const fresh = useGameStore.getState().survivorRuntime[this.id];
      if (fresh) this.hunger = fresh.hunger;
      this.toastCd -= ctx.gameMinDelta;
      if (this.toastCd <= 0) {
        this.toastCd = 90;
        const def = s.survivors.find((x) => x.id === this.id);
        s.addToast(`${def?.name ?? 'Your companion'} eats a ${ITEMS[eaten]?.name ?? 'meal'}.`);
      }
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.group);
    for (const m of this.rig.mats) m.dispose();
  }
}

export class Companions {
  private entities = new Map<string, Companion>();

  constructor(private scene: THREE.Scene) {}

  update(dt: number, ctx: CompanionCtx): void {
    const s = useGameStore.getState();
    const dispatchedIds = new Set(s.dispatches.map((d) => d.survivorId));
    const alive = new Set<string>();

    // seat + formation indices walk the roster in order — stable
    // across frames, so nobody swaps seats mid-drive.
    let formationIx = 0;
    let seatIx = 0;
    for (const def of s.survivors) {
      alive.add(def.id);
      const rt = s.survivorRuntime[def.id] ?? defaultSurvivorRuntime();
      let ent = this.entities.get(def.id);
      if (!ent) {
        const atBase = rt.order === 'base' && ctx.basePos;
        const x = atBase ? ctx.basePos!.x + 3 : ctx.playerPos.x + 1.5;
        const z = atBase ? ctx.basePos!.z + 3 : ctx.playerPos.z + 1.5;
        ent = new Companion(def, rt, x, z, ctx.groundY);
        this.scene.add(ent.group);
        this.entities.set(def.id, ent);
      }
      const mySeat = rt.order === 'follow' && ctx.vehicle && !dispatchedIds.has(def.id) ? seatIx++ : null;
      ent.update(dt, ctx, def, rt, {
        dispatched: dispatchedIds.has(def.id),
        formationIndex: formationIx++,
        seatIndex: mySeat,
      });
    }
    for (const [id, ent] of this.entities) {
      if (!alive.has(id)) {
        ent.dispose(this.scene);
        this.entities.delete(id);
      }
    }
  }

  /** Read-only handles for tests/tooling. */
  get size(): number {
    return this.entities.size;
  }
  entity(id: string): Companion | undefined {
    return this.entities.get(id);
  }

  dispose(): void {
    for (const ent of this.entities.values()) ent.dispose(this.scene);
    this.entities.clear();
  }
}
