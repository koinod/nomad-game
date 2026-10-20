// Husks.ts — husk entities + FSM (Idle/Wander/Investigate/Hunt/Attack/Return)
// plus spawn management, perception, and hit resolution helpers.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import { staggerPower } from './gunMath';
import { resolveCollisions, type Collider } from './Colliders';
import { sfx } from '../systems/audio';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';

export type HuskKind = 'shambler' | 'stalker' | 'armored';
export type HuskState =
  | 'idle' | 'wander' | 'investigate' | 'hunt' | 'attack' | 'return' | 'dead';

const KIND_STATS: Record<HuskKind, { hp: number; speed: number; damage: number; color: number; height: number; armorClass: number }> = {
  shambler: { hp: 40, speed: 2.3, damage: 12, color: 0x5d6b52, height: 1.8, armorClass: 0 },
  stalker: { hp: 30, speed: 3.6, damage: 9, color: 0x46465a, height: 1.95, armorClass: 0 },
  // the carrier's guard pack: ship-security husks in plate carriers and
  // helmets — 3x the HP of a shambler, slower, hits much harder, and the
  // plate eats small-caliber fire (armorClass 2 — see gunMath.armorMult)
  armored: { hp: 125, speed: 2.1, damage: 19, color: 0x3f4750, height: 1.92, armorClass: 2 },
};

export const HUSK_CAP = 14;

export interface HuskCtx {
  playerPos: THREE.Vector3;
  isNight: boolean;
  groundY: (x: number, z: number, refY?: number) => number;
  colliders: readonly Collider[];
  onHuskKilled: (h: Husk) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Deterministic per-husk variation from its id (clothing, hat, carried tool). */
function hashId(id: string): () => number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return mulberry32(h);
}

const JACKETS = [0x5a4632, 0x3c5a6e, 0x6e3c3c, 0x4a5a3c, 0x555555, 0x6b5a2e, 0x2e4a4e];
const PANTS = [0x35322c, 0x2c3540, 0x404040, 0x3a3230, 0x4a3b2c];
const HATS = [0x2c2c30, 0x5a4632, 0x6e6e6e, 0x3c3c3c];

export class Husk {
  readonly id: string;
  readonly kind: HuskKind;
  readonly zoneId: string;
  readonly group = new THREE.Group();
  hp: number;
  state: HuskState = 'idle';
  home = new THREE.Vector3();
  target = new THREE.Vector3();
  stateT = 0;
  attackCd = 0;
  flashT = 0;
  deathT = 0;
  lostSightT = 0;
  staggerT = 0; // heavy hits interrupt the attack windup
  flinchT = 0; // procedural hit reaction clock (head snap + torso rock)
  flinchPow = 0; // 0..1 — how hard this hit rocked the husk
  // stealth model: being shot builds alert; only a triangulated firing
  // line (or eyes on the player) earns a hunt — no hive-mind GPS
  alert = 0; // 0..1
  private pendingInvest: { x: number; z: number; t: number } | null = null;
  get armorClass(): number {
    return KIND_STATS[this.kind].armorClass;
  }
  limpT = 0; // walk-cycle clock for the shuffle animation
  stunT = 0; // flashbang / concussion: no perception, no movement
  knock = new THREE.Vector3();
  removed = false;
  killReported = false;
  private mats: THREE.MeshStandardMaterial[] = [];
  private bodyMat!: THREE.MeshStandardMaterial;
  private headMesh: THREE.Mesh | null = null;
  private torsoMesh: THREE.Mesh | null = null;

  constructor(id: string, kind: HuskKind, x: number, z: number, zoneId: string, groundY: (x: number, z: number) => number) {
    this.id = id;
    this.kind = kind;
    this.zoneId = zoneId;
    const st = KIND_STATS[kind];
    this.hp = st.hp;
    this.home.set(x, 0, z);
    this.target.set(x, 0, z);
    this.buildMesh(st.color, st.height);
    this.group.position.set(x, groundY(x, z), z);
    this.stateT = 1 + Math.random() * 3;
  }

  private buildMesh(color: number, height: number): void {
    // Husks as infected people, not robots: slumped torso, head tilted and
    // lolling, arms hanging forward like a sleepwalker's, torn clothes in
    // zone palettes, glowing eyes for night readability.
    const vrnd = hashId(this.id);
    const pick = (arr: number[]): number => arr[Math.floor(vrnd() * arr.length)];
    const jacketMat = new THREE.MeshStandardMaterial({ color: pick(JACKETS), roughness: 1 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pick(PANTS), roughness: 1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1 });
    this.bodyMat = jacketMat;
    this.mats.push(jacketMat, pantsMat, skinMat, darkMat);
    void color;
    // torso slumps forward
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, height * 0.58, 0.4), jacketMat);
    body.position.y = height * 0.55;
    body.rotation.x = 0.14;
    this.torsoMesh = body;
    // head lolls to the side, jaw dropped
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
    head.position.set(0.05, height * 0.95, 0.05);
    head.rotation.z = 0.18;
    head.name = 'head';
    this.headMesh = head;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), darkMat);
    jaw.position.set(0.05, height * 0.95 - 0.24, 0.12);
    jaw.rotation.x = 0.35;
    // glowing eyes — two small emissive pits
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
      eye.position.set(0.05 + sx, height * 0.95 + 0.03, 0.2);
      this.group.add(eye);
    }
    // arms hang forward, slightly uneven, claws out
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.19, height * 0.52, 0.19), jacketMat);
    armL.position.set(-0.46, height * 0.52, 0.2);
    armL.rotation.x = -0.5;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.19, height * 0.52, 0.19), jacketMat);
    armR.position.set(0.46, height * 0.5, 0.16);
    armR.rotation.x = -0.35;
    const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skinMat);
    clawL.position.set(-0.46, height * 0.52 - height * 0.27, 0.33);
    const clawR = clawL.clone();
    clawR.position.x = 0.46;
    clawR.position.z = 0.29;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, height * 0.44, 0.23), pantsMat);
    legL.position.set(-0.18, height * 0.22, 0);
    const legR = legL.clone();
    legR.position.x = 0.18;
    this.group.add(body, head, jaw, armL, armR, clawL, clawR, legL, legR);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2; // asymmetric walk limp
    if (this.kind === 'armored') {
      // plate carrier over the torso, a helmet shell, shoulder pads —
      // the silhouette reads MILITARY before it reads infected
      const plateMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45 });
      this.mats.push(plateMat);
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.76, height * 0.42, 0.52), plateMat);
      vest.position.set(0, height * 0.58, 0.02);
      vest.rotation.x = 0.14;
      this.group.add(vest);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), plateMat);
      helmet.position.set(0.05, height * 0.95 + 0.03, 0.05);
      helmet.rotation.z = 0.18;
      this.group.add(helmet);
      for (const sx of [-0.46, 0.46]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.3), plateMat);
        pad.position.set(sx, height * 0.78, 0.08);
        this.group.add(pad);
      }
    }
    if (vrnd() < 0.35) {
      const hat = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.11, 0.32),
        new THREE.MeshStandardMaterial({ color: pick(HATS), roughness: 1 }),
      );
      hat.position.set(0.05, height * 0.95 + 0.24, 0.05);
      hat.rotation.z = 0.2;
      this.group.add(hat);
      this.mats.push(hat.material as THREE.MeshStandardMaterial);
    }
    if (vrnd() < 0.25) {
      const tool = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.55, 0.09),
        new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 1 }),
      );
      tool.position.set(0.46, height * 0.32, 0.34);
      tool.rotation.x = 0.5;
      this.group.add(tool);
      this.mats.push(tool.material as THREE.MeshStandardMaterial);
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.userData.headY = height * 0.95;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  headPos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.group.position.x,
      this.group.position.y + (this.group.userData.headY as number),
      this.group.position.z,
    );
  }

  /** Apply damage; returns true if this hit killed it. */
  damage(
    amount: number,
    fromDir: THREE.Vector3,
    knockPower = 2.2,
    canStagger = false,
    opts?: { head?: boolean; pen?: number },
  ): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashT = 0.18;
    this.bodyMat.emissive.setHex(0xff2222);
    this.knock.addScaledVector(fromDir, knockPower);
    // a melee hit is point-blank information: the husk KNOWS where you are
    if (canStagger) this.alert = 1;
    // every connecting hit is FELT: the head snaps and the torso rocks,
    // scaled by the hit's stagger power (headshots and heavies rock hardest).
    // Plate shrugs off small-caliber flinch: pen-0 fire barely rocks an
    // armored husk, and it never breaks its windup.
    const sp = staggerPower(amount, opts?.head ?? false);
    const plateShrug = this.armorClass >= 2 && !canStagger && (opts?.pen ?? 0) < 1;
    this.flinchT = 0.24;
    this.flinchPow = Math.max(this.flinchPow, plateShrug ? sp * 0.45 : sp);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      // death fling: the killing blow throws the body back
      this.knock.addScaledVector(fromDir, knockPower * 0.8);
      return true;
    }
    // a solid connecting blow breaks the attack windup
    if (canStagger && knockPower >= 2.4 && this.state === 'attack') {
      this.state = 'hunt';
      this.staggerT = 0.55;
      this.attackCd = Math.max(this.attackCd, 0.9);
    } else if (canStagger && knockPower >= 3.4) {
      this.staggerT = Math.max(this.staggerT, 0.35);
    }
    // a heavy ranged hit (or any headshot) breaks the windup too — a DMR
    // round to the chest is not something you swing through — unless a
    // plate carrier eats it (pen < 1 against the armored kind)
    if (!canStagger && sp >= 0.6 && !plateShrug) {
      if (this.state === 'attack') {
        this.state = 'hunt';
        this.attackCd = Math.max(this.attackCd, 0.8);
      }
      this.staggerT = Math.max(this.staggerT, 0.32);
    }
    // getting hit draws attention (caller routes investigateAt at the attacker)
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') {
      this.state = 'investigate';
      this.stateT = 0;
    }
    return false;
  }

  investigateAt(p: THREE.Vector3, opts?: { delay?: number; jitter?: number }): void {
    if (!this.alive) return;
    // a distant gunshot is information with travel time and error bars:
    // the husk reacts when the sound arrives, at a point NEAR the shot
    if (opts?.delay && opts.delay > 0) {
      const j = opts.jitter ?? 0;
      this.pendingInvest = {
        x: p.x + (Math.random() * 2 - 1) * j,
        z: p.z + (Math.random() * 2 - 1) * j,
        t: opts.delay,
      };
      return;
    }
    this.applyInvestigate(p.x, p.z);
  }

  private applyInvestigate(x: number, z: number): void {
    if (!this.alive) return;
    if (this.state === 'hunt' || this.state === 'attack') return;
    this.state = 'investigate';
    this.target.set(x, 0, z);
    this.stateT = 0;
  }

  /**
   * Shot from stealth: the husk does NOT get the shooter's live position.
   * One hit buys a delayed, jittered investigate at the muzzle. Hits stack
   * alert; only a triangulated line (alert full) earns a hunt.
   */
  shotFrom(shooterPos: THREE.Vector3, dist: number, head: boolean): void {
    if (!this.alive) return;
    this.alert = Math.min(1, this.alert + (head ? 0.55 : 0.45));
    if (this.alert >= 0.99) {
      this.pendingInvest = null;
      if (this.state !== 'attack') {
        this.state = 'hunt';
        this.stateT = 0;
      }
      this.target.copy(shooterPos);
    } else {
      this.investigateAt(shooterPos, {
        delay: Math.min(0.45, dist / 400),
        jitter: Math.max(2, dist * 0.22),
      });
    }
  }

  /** Concussion: the husk sees nothing, moves nothing, for dur seconds. */
  stun(dur: number): void {
    this.stunT = Math.max(this.stunT, dur);
    this.state = 'idle';
    this.stateT = 0;
  }

  update(dt: number, ctx: HuskCtx, rng: () => number): void {
    const g = this.group;
    if (this.state === 'dead') {
      this.deathT += dt;
      // ragdoll-lite: tip over and stay — the corpse is searchable (Skyrim-style)
      const tip = Math.min(1, this.deathT / 0.45);
      g.rotation.x = -tip * Math.PI * 0.5;
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.bodyMat.emissive.setHex(0x000000);
    }

    // flinch: the hit lands on the body — head snaps back, torso rocks,
    // both riding one jolt curve scaled by the hit's stagger power
    if (this.flinchT > 0) {
      this.flinchT -= dt;
      const phase = 1 - Math.max(this.flinchT, 0) / 0.24;
      const jolt = Math.sin(phase * Math.PI) * this.flinchPow;
      if (this.headMesh) this.headMesh.rotation.x = -jolt * 0.85;
      if (this.torsoMesh) this.torsoMesh.rotation.x = 0.14 - jolt * 0.42;
      if (this.flinchT <= 0) {
        this.flinchPow = 0;
        if (this.headMesh) this.headMesh.rotation.x = 0;
        if (this.torsoMesh) this.torsoMesh.rotation.x = 0.14;
      }
    }

    // stagger: rock back on the heels, attacks can't land mid-stagger
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      const k = Math.min(1, this.staggerT / 0.55);
      g.rotation.x = Math.sin(k * Math.PI) * 0.4; // jolt back, then recover
      if (this.staggerT <= 0) g.rotation.x = 0;
    }

    // stunned (flashbang): frozen, head down, senses gone
    if (this.stunT > 0) {
      this.stunT -= dt;
      g.rotation.x = 0.25;
      if (this.stunT <= 0) g.rotation.x = 0;
      g.position.y = ctx.groundY(g.position.x, g.position.z, g.position.y);
      return;
    }

    // a heard shot lands late and off-target: the pending investigation
    // fires when its delay runs out, if nothing better has happened since
    if (this.pendingInvest) {
      this.pendingInvest.t -= dt;
      if (this.pendingInvest.t <= 0) {
        const pi = this.pendingInvest;
        this.pendingInvest = null;
        this.applyInvestigate(pi.x, pi.z);
      }
    }
    // alert bleeds off while the trail is cold
    if (this.state !== 'hunt' && this.state !== 'attack' && this.alert > 0) {
      this.alert = Math.max(0, this.alert - dt * 0.05);
    }

    const st = KIND_STATS[this.kind];
    const speedMul = ctx.isNight ? 1.4 : 0.7;
    const burst = this.kind === 'stalker' && ctx.isNight && this.state === 'hunt' ? 1.3 : 1;
    const speed = st.speed * speedMul * burst;

    // knockback decay
    g.position.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));

    const pp = ctx.playerPos;
    const toPlayer = _v1.set(pp.x - g.position.x, 0, pp.z - g.position.z);
    const distP = toPlayer.length();

    // ---- perception ----
    let sees = false;
    if (distP < 6) {
      sees = true; // smell / hearing at close range
    } else {
      const sightRange = 25 * (ctx.isNight ? 0.55 : 1);
      if (distP < sightRange) {
        const fwd = _v2.set(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
        const ang = fwd.angleTo(toPlayer.clone().normalize());
        if (ang < (110 * Math.PI) / 360) sees = true;
      }
    }
    if (sees) {
      this.lostSightT = 0;
      this.alert = 1; // eyes on you: fully alert, no decay games
      this.pendingInvest = null;
      if (this.state !== 'attack') this.state = 'hunt';
    } else if (this.state === 'hunt' || this.state === 'attack') {
      this.lostSightT += dt;
      if (this.lostSightT > 6) {
        this.state = 'investigate';
        this.target.set(pp.x, 0, pp.z);
        this.stateT = 0;
      }
    }

    this.stateT += dt;
    this.attackCd -= dt;

    const moveToward = (tx: number, tz: number, sp: number) => {
      const dx = tx - g.position.x;
      const dz = tz - g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, sp * dt);
        g.position.x += (dx / d) * step;
        g.position.z += (dz / d) * step;
        g.rotation.y = Math.atan2(dx, dz);
        return d - step;
      }
      return 0;
    };
    const groundClamp = () => {
      g.position.y = ctx.groundY(g.position.x, g.position.z, g.position.y);
    };

    switch (this.state) {
      case 'idle':
        if (this.stateT > 2 + rng() * 3) {
          this.state = 'wander';
          this.stateT = 0;
          const a = rng() * Math.PI * 2;
          const r = 8 + rng() * 20;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        break;
      case 'wander': {
        const left = moveToward(this.target.x, this.target.z, speed * 0.45);
        if (left <= 0.5 || this.stateT > 14) {
          this.state = 'idle';
          this.stateT = 0;
        }
        break;
      }
      case 'investigate': {
        const left = moveToward(this.target.x, this.target.z, speed * 0.8);
        if (left <= 1.2) {
          // look around, then give up
          g.rotation.y += dt * 2.2;
          if (this.stateT > 4.5) {
            this.state = 'return';
            this.stateT = 0;
          }
        }
        break;
      }
      case 'hunt': {
        moveToward(pp.x, pp.z, speed);
        if (distP < 2.3) {
          this.state = 'attack';
          this.attackCd = 0.4;
        }
        break;
      }
      case 'attack': {
        // face the player
        g.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (distP > 2.8) {
          this.state = 'hunt';
          break;
        }
        if (this.attackCd <= 0) {
          this.attackCd = 1.4;
          const s = useGameStore.getState();
          s.damagePlayer(st.damage * DIFFICULTIES[s.difficulty].huskDamage, 'husk');
          sfx.play('hurt', { volume: 0.7 });
          // lunge visual
          this.knock.addScaledVector(toPlayer.normalize(), 1.2);
        }
        break;
      }
      case 'return': {
        const left = moveToward(this.home.x, this.home.z, speed * 0.5);
        if (left <= 1.5) {
          this.state = 'idle';
          this.stateT = 0;
        }
        break;
      }
    }
    // husks respect walls too — they come through the door, not the drywall
    resolveCollisions(g.position, 0.5, ctx.colliders, g.position.y);
    groundClamp();

    // the shuffle: asymmetric limp walk — bob, roll, and a yaw wobble driven
    // by each husk's own phase. Faster when hunting, heavier in attack.
    const limp = (g.userData.limpPhase as number) ?? 0;
    const moving =
      this.state === 'hunt' || this.state === 'wander' || this.state === 'investigate' || this.state === 'return';
    const rate = this.state === 'hunt' ? 7.5 : 5;
    if (moving) {
      const amp = this.state === 'hunt' ? 1 : 0.55;
      this.limpT += dt * rate;
      g.position.y += Math.abs(Math.sin(this.limpT + limp)) * 0.06 * amp;
      g.rotation.z = Math.sin(this.limpT + limp) * 0.05 * amp;
      g.rotation.y += Math.sin(this.limpT * 0.5 + limp) * 0.03 * amp; // wobble, not drift
    } else {
      g.rotation.z *= 0.9;
    }
  }
}

export interface SpawnZone {
  id: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  kinds: HuskKind[];
  nightOnly?: boolean;
}

export class HuskManager {
  readonly scene: THREE.Scene;
  readonly zones: SpawnZone[];
  readonly husks: Husk[] = [];
  readonly rng: () => number;
  private respawnT = 20;
  private spawnCounter = 0;

  constructor(scene: THREE.Scene, zones: SpawnZone[], seed: number) {
    this.scene = scene;
    this.zones = zones;
    this.rng = mulberry32(seed ^ 0xbeef01);
  }

  private landPoint(zone: SpawnZone, groundY: (x: number, z: number) => number): [number, number] | null {
    for (let i = 0; i < 12; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * zone.radius;
      const x = zone.x + Math.cos(a) * r;
      const z = zone.z + Math.sin(a) * r;
      if (groundY(x, z) > 0.8) return [x, z];
    }
    return null;
  }

  private addHusk(id: string, kind: HuskKind, x: number, z: number, zoneId: string, groundY: (x: number, z: number) => number): void {
    const h = new Husk(id, kind, x, z, zoneId, groundY);
    this.husks.push(h);
    this.scene.add(h.group);
  }

  spawnInitial(deadIds: Set<string>, groundY: (x: number, z: number) => number, isNight: boolean): void {
    for (const zone of this.zones) {
      if (zone.nightOnly && !isNight) continue;
      for (let i = 0; i < zone.count; i++) {
        const id = `${zone.id}_${i}`;
        if (deadIds.has(id)) continue;
        const p = this.landPoint(zone, groundY);
        if (!p) continue;
        const kind = zone.kinds[Math.floor(this.rng() * zone.kinds.length)];
        this.addHusk(id, kind, p[0], p[1], zone.id, groundY);
      }
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const h of this.husks) if (h.alive) n++;
    return n;
  }

  emitNoise(x: number, z: number, radius: number): void {
    _v1.set(x, 0, z);
    for (const h of this.husks) {
      if (!h.alive) continue;
      const d = Math.hypot(h.group.position.x - x, h.group.position.z - z);
      if (d <= radius) {
        // sound arrives at the speed of sound and localizes badly at
        // range: far husks turn late, toward a point near — not on — it
        h.investigateAt(_v1, { delay: Math.min(0.5, d / 340), jitter: Math.min(6, d * 0.08) });
      }
    }
  }

  /**
   * Melee sweep: every alive husk inside (range + husk radius) of the player
   * and within the swing cone, nearest-first up to maxTargets. `centered`
   * marks hits near the cone's middle so centered swings hit harder.
   */
  meleeSweep(
    origin: THREE.Vector3,
    facing: number,
    range: number,
    halfArcRad: number,
    maxTargets: number,
  ): { husk: Husk; centered: boolean }[] {
    const HUSK_RADIUS = 0.55;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const cosArc = Math.cos(halfArcRad);
    const scored: { husk: Husk; d: number; centered: boolean }[] = [];
    for (const h of this.husks) {
      if (!h.alive) continue;
      const dx = h.group.position.x - origin.x;
      const dz = h.group.position.z - origin.z;
      const d = Math.hypot(dx, dz) - HUSK_RADIUS; // capsule: swing can graze
      if (d > range || d < -HUSK_RADIUS) continue;
      // vertical window: husk body must overlap the player's reach band
      const dy = h.group.position.y + 1.0 - (origin.y + 1.2);
      if (Math.abs(dy) > 2.6) continue;
      const nd = Math.max(d, 0.001);
      const dot = (dx * fx + dz * fz) / Math.hypot(dx, dz);
      if (dot < cosArc) continue;
      scored.push({ husk: h, d: nd, centered: dot > cosArc * 0.55 + 0.45 });
    }
    scored.sort((a, b) => a.d - b.d);
    return scored.slice(0, maxTargets).map(({ husk, centered }) => ({ husk, centered }));
  }

  /** Legacy single-target check kept for the ranged fallback path. */
  meleeHit(origin: THREE.Vector3, facing: number, range: number, halfArcRad: number): Husk | null {
    const r = this.meleeSweep(origin, facing, range, halfArcRad, 1);
    return r.length ? r[0].husk : null;
  }

  /** Hitscan. Returns nearest husk intersecting the ray, with head flag. */
  raycastShot(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): { husk: Husk; dist: number; head: boolean } | null {
    let best: { husk: Husk; dist: number; head: boolean } | null = null;
    for (const h of this.husks) {
      if (!h.alive) continue;
      const c = h.group.position;
      _v1.set(c.x - origin.x, c.y + 1.0 - origin.y, c.z - origin.z);
      const t = _v1.dot(dir);
      if (t < 0.5 || t > maxDist) continue;
      // closest approach of body center line
      _v2.copy(dir).multiplyScalar(t).add(origin);
      const missBody = Math.hypot(_v2.x - c.x, _v2.z - c.z);
      const dyBody = Math.abs(_v2.y - (c.y + 1.0));
      const bodyHit = missBody < 0.55 && dyBody < 1.1;
      // head sphere
      const hp = h.headPos(new THREE.Vector3());
      _v2.copy(dir).multiplyScalar(t).add(origin);
      const missHead = _v2.distanceTo(hp);
      if (bodyHit || missHead < 0.38) {
        if (!best || t < best.dist) best = { husk: h, dist: t, head: missHead < 0.38 };
      }
    }
    return best;
  }

  /** Explosion / area damage: full at the core, falloff to the rim. */
  damageInRadius(x: number, z: number, radius: number, dmg: number): number {
    let kills = 0;
    for (const h of this.husks) {
      if (!h.alive) continue;
      const c = h.group.position;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > radius) continue;
      const fall = 1 - (d / radius) * 0.7;
      const dir = _v1.set(c.x - x, 0, c.z - z);
      if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
      dir.normalize();
      if (h.damage(Math.round(dmg * fall), dir, 5, true)) kills++;
    }
    return kills;
  }

  /** Flashbang: everything alive in radius loses its senses for dur seconds. */
  stunInRadius(x: number, z: number, radius: number, dur: number): void {
    for (const h of this.husks) {
      if (!h.alive) continue;
      const c = h.group.position;
      if (Math.hypot(c.x - x, c.z - z) <= radius) h.stun(dur);
    }
  }

  /** Live husks within a radius — the base-claim gate reads this. */
  aliveWithin(x: number, z: number, radius: number): number {
    let n = 0;
    for (const h of this.husks) {
      if (!h.alive) continue;
      const c = h.group.position;
      if (Math.hypot(c.x - x, c.z - z) <= radius) n++;
    }
    return n;
  }

  update(dt: number, ctx: HuskCtx, playerPos: THREE.Vector3, isNight: boolean): void {
    const full: HuskCtx = { ...ctx, playerPos, isNight };
    for (let i = this.husks.length - 1; i >= 0; i--) {
      const h = this.husks[i];
      h.update(dt, full, this.rng);
      if (h.removed) {
        this.scene.remove(h.group);
        this.husks.splice(i, 1);
      }
    }
    // respawn over time, away from the player
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = 22;
      if (this.activeCount < HUSK_CAP) {
        const zone = this.zones[Math.floor(this.rng() * this.zones.length)];
        if (!(zone.nightOnly && !isNight)) {
          const p = this.landPoint(zone, ctx.groundY);
          if (p) {
            const d = Math.hypot(p[0] - playerPos.x, p[1] - playerPos.z);
            if (d > 60) {
              const kind = zone.kinds[Math.floor(this.rng() * zone.kinds.length)];
              this.addHusk(`rz_${this.spawnCounter++}`, kind, p[0], p[1], zone.id, ctx.groundY);
            }
          }
        }
      }
    }
  }

  /** Nearest alive husk distance to a point (for ambience danger). */
  nearestThreat(x: number, z: number): { dist: number; hunting: boolean } {
    let dist = Infinity;
    let hunting = false;
    for (const h of this.husks) {
      if (!h.alive) continue;
      const d = Math.hypot(h.group.position.x - x, h.group.position.z - z);
      if (d < dist) {
        dist = d;
        hunting = h.state === 'hunt' || h.state === 'attack';
      }
    }
    return { dist, hunting };
  }

  dispose(): void {
    for (const h of this.husks) this.scene.remove(h.group);
    this.husks.length = 0;
  }
}
