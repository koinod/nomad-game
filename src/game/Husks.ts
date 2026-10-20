// Husks.ts — husk entities + FSM (Idle/Wander/Investigate/Hunt/Attack/Return)
// plus spawn management, perception, and hit resolution helpers.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import { staggerPower } from './gunMath';
import {
  ACID_POOL, BLOATER_BURST, BRUTE_CHARGE, BRUTE_EXPLOSION_MULT, SHRIEK_INTERRUPT_STAGGER,
  SHRIEK_WINDUP_SEC, SPIT_BAND, SPIT_HIT_DMG, burstDamageAt, crawlerSwerve, pickAmbientSpecial,
  shriekAlertRadius, shriekNoiseLevel, shouldBruteCharge, specialChance, spitFlightTime, spitVelocity,
  SPIT_GRAVITY,
} from './huskMath';
import { loftMesh } from './modelKit';
import { resolveCollisions, type Collider } from './Colliders';
import { sfx } from '../systems/audio';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';

export type HuskKind =
  | 'shambler' | 'stalker' | 'armored'
  | 'screamer' | 'brute' | 'crawler' | 'bloater' | 'spitter';
export type HuskState =
  | 'idle' | 'wander' | 'investigate' | 'hunt' | 'attack' | 'return' | 'dead';

/** Where shots actually land on this kind — the raycast/melee windows read
 *  the profile, never a hardcoded human silhouette. Heights are group-local
 *  meters (group origin at the feet). */
export interface HitProfile {
  bodyY: number; // center of the torso capsule
  bodyHalfH: number; // vertical half-extent of the body window
  bodyR: number; // horizontal radius of the body window
  headY: number; // head sphere center
  headR: number; // head sphere radius
}

interface KindStats {
  hp: number; speed: number; damage: number; color: number; height: number;
  armorClass: number; knockResist: number; profile: HitProfile;
}

const KIND_STATS: Record<HuskKind, KindStats> = {
  shambler: { hp: 40, speed: 2.3, damage: 12, color: 0x5d6b52, height: 1.8, armorClass: 0, knockResist: 0, profile: { bodyY: 1.0, bodyHalfH: 1.1, bodyR: 0.55, headY: 1.71, headR: 0.38 } },
  stalker: { hp: 30, speed: 3.6, damage: 9, color: 0x46465a, height: 1.95, armorClass: 0, knockResist: 0, profile: { bodyY: 1.05, bodyHalfH: 1.15, bodyR: 0.55, headY: 1.85, headR: 0.38 } },
  // the carrier's guard pack: ship-security husks in plate carriers and
  // helmets — 3x the HP of a shambler, slower, hits much harder, and the
  // plate eats small-caliber fire (armorClass 2 — see gunMath.armorMult)
  armored: { hp: 125, speed: 2.1, damage: 19, color: 0x3f4750, height: 1.92, armorClass: 2, knockResist: 0.25, profile: { bodyY: 1.05, bodyHalfH: 1.15, bodyR: 0.58, headY: 1.82, headR: 0.38 } },
  // WAVE 4 specials — each is a silhouette, a behavior, and a counter.
  // screamer: gaunt and mostly stationary; its shriek pulls the whole
  // neighborhood onto you. Counter: break the wind-up (see damage()).
  screamer: { hp: 45, speed: 1.15, damage: 8, color: 0x6e5a6e, height: 2.1, armorClass: 0, knockResist: 0.1, profile: { bodyY: 1.1, bodyHalfH: 1.2, bodyR: 0.5, headY: 2.0, headR: 0.4 } },
  // brute: 2.4m of muscle that barely notices knockback or small fire.
  // Counter: explosives (BRUTE_EXPLOSION_MULT) and penetration.
  brute: { hp: 340, speed: 1.7, damage: 26, color: 0x5a4632, height: 2.4, armorClass: 0, knockResist: 0.85, profile: { bodyY: 1.25, bodyHalfH: 1.35, bodyR: 0.8, headY: 2.26, headR: 0.42 } },
  // crawler: low, fast, swerving — a hard shot at range, a soft target up close.
  crawler: { hp: 22, speed: 4.3, damage: 8, color: 0x4e5a48, height: 0.95, armorClass: 0, knockResist: 0, profile: { bodyY: 0.5, bodyHalfH: 0.55, bodyR: 0.62, headY: 0.6, headR: 0.34 } },
  // bloater: swollen with gas and acid — killing it IS the explosion.
  // Counter: kill it from range, or next to its friends.
  bloater: { hp: 70, speed: 1.5, damage: 10, color: 0x6a7a4a, height: 1.85, armorClass: 0, knockResist: 0.3, profile: { bodyY: 1.0, bodyHalfH: 1.1, bodyR: 0.72, headY: 1.76, headR: 0.38 } },
  // spitter: holds its band and lobs acid. Counter: close the distance
  // or break line of sight during the telegraph.
  spitter: { hp: 38, speed: 2.6, damage: 7, color: 0x59684a, height: 1.85, armorClass: 0, knockResist: 0, profile: { bodyY: 1.0, bodyHalfH: 1.1, bodyR: 0.55, headY: 1.76, headR: 0.4 } },
};

export const HUSK_CAP = 14;

export interface HuskCtx {
  playerPos: THREE.Vector3;
  isNight: boolean;
  groundY: (x: number, z: number, refY?: number) => number;
  colliders: readonly Collider[];
  onHuskKilled: (h: Husk) => void;
  /** Wave 4: run length — ambient special spawns scale with it. */
  daysElapsed?: number;
  /** Wave 4: a bloater burst went off (Game hangs particles off this). */
  onBurstFx?: (x: number, y: number, z: number) => void;
  /** Wave 4: a screamer's shriek landed (Game hangs the sound off this). */
  onShriekFx?: (x: number, y: number, z: number) => void;
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
  get profile(): HitProfile {
    return KIND_STATS[this.kind].profile;
  }
  // ---- wave 4 special-kind state ----
  windupT = 0; // screamer: seconds left on the shriek wind-up (0 = not winding)
  shriekCd = 0; // screamer: cooldown before it can wind up again
  shriekFired = false; // screamer → manager: the shriek landed this frame
  chargeT = 0; // brute: seconds left on the charge
  chargeCd = 0; // brute: cooldown before the next charge
  private chargeDir = new THREE.Vector3(0, 0, 1);
  spitCd = 0; // spitter: cooldown between globs
  telegraphT = 0; // spitter: seconds left on the visible wind-up
  spitLaunch: { x: number; y: number; z: number } | null = null; // spitter → manager
  burstPending = false; // bloater: died and owes the world an explosion
  burstDone = false;
  private crawlT = 0; // crawler: swerve clock
  private torsoBaseRotX = 0.14; // flinch returns the torso to ITS slump, not a constant
  private jawMesh: THREE.Mesh | null = null;
  private sacMesh: THREE.Mesh | null = null; // spitter throat sac (pulses on telegraph)
  private eyeMat: THREE.MeshBasicMaterial | null = null;
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

  /** Shared per-husk wardrobe: deterministic from the id, like the loot. */
  private palette() {
    const vrnd = hashId(this.id);
    const pick = (arr: number[]): number => arr[Math.floor(vrnd() * arr.length)];
    const jacketMat = new THREE.MeshStandardMaterial({ color: pick(JACKETS), roughness: 1 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pick(PANTS), roughness: 1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1 });
    this.bodyMat = jacketMat;
    this.mats.push(jacketMat, pantsMat, skinMat, darkMat);
    return { vrnd, pick, jacketMat, pantsMat, skinMat, darkMat };
  }

  /** Glowing eye pits at a given height/face offset — night readability. */
  private addEyes(y: number, z: number, spread = 0.09, xOff = 0.05): void {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    this.eyeMat = eyeMat;
    for (const sx of [-spread, spread]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
      eye.position.set(xOff + sx, y, z);
      this.group.add(eye);
    }
  }

  /**
   * A vertical torso from loftMesh: sections are stations along Z
   * (z = height up the body, w = width, h = depth). The sweep is
   * recentered and stood upright; the flinch system rocks it around
   * torsoBaseRotX, which this sets to the upright orientation.
   */
  private loftTorso(sections: { z: number; w: number; h: number }[], m: THREE.Material): THREE.Mesh {
    const zc = (sections[0].z + sections[sections.length - 1].z) / 2;
    const mesh = loftMesh(sections.map((s) => ({ ...s, y: 0 })), m);
    mesh.geometry.translate(0, 0, -zc);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = zc;
    this.torsoBaseRotX = -Math.PI / 2;
    return mesh;
  }

  private finishMesh(height: number): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.userData.headY = KIND_STATS[this.kind].profile.headY;
    void height;
  }

  private buildMesh(color: number, height: number): void {
    switch (this.kind) {
      case 'screamer': this.buildScreamer(height); return;
      case 'brute': this.buildBrute(height); return;
      case 'crawler': this.buildCrawler(height); return;
      case 'bloater': this.buildBloater(height); return;
      case 'spitter': this.buildSpitter(height); return;
      default: this.buildCommon(color, height);
    }
  }

  private buildCommon(color: number, height: number): void {
    // Husks as infected people, not robots: slumped torso, head tilted and
    // lolling, arms hanging forward like a sleepwalker's, torn clothes in
    // zone palettes, glowing eyes for night readability.
    const { vrnd, pick, jacketMat, pantsMat, skinMat, darkMat } = this.palette();
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
    this.jawMesh = jaw;
    this.addEyes(height * 0.95 + 0.03, 0.2);
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
    this.finishMesh(height);
  }

  // ------------------------------------------------------ special kinds ---
  // Each special is built like the vehicles are: proportioned lofted forms
  // first, details second — a silhouette you can name at 40 meters.

  /** Screamer: all ribs and throat — a lofted, tapered torso, a long neck,
   *  an elongated skull, and a jaw that unhinges when the wind-up starts. */
  private buildScreamer(height: number): void {
    const { vrnd, jacketMat, pantsMat, skinMat, darkMat } = this.palette();
    // lofted torso: narrow waist swelling into a ribcage, pinched shoulders
    const torso = this.loftTorso([
      { z: height * 0.36, w: 0.34, h: 0.3 },
      { z: height * 0.52, w: 0.54, h: 0.44 },
      { z: height * 0.66, w: 0.58, h: 0.42 },
      { z: height * 0.78, w: 0.36, h: 0.28 },
    ], jacketMat);
    this.torsoMesh = torso;
    // exposed ribs: bone rings riding proud of the cage
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xb8ab90, roughness: 0.9 });
    this.mats.push(boneMat);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.03, 0.022, 6, 18), boneMat);
      rib.position.set(0, height * (0.54 + i * 0.06), 0);
      rib.rotation.x = Math.PI / 2;
      this.group.add(rib);
    }
    // long neck + elongated skull thrown back
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.34, 8), skinMat);
    neck.position.set(0, height * 0.86, 0.02);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
    head.scale.set(0.85, 1.4, 0.95);
    head.position.set(0, height * 0.99, 0.03);
    head.rotation.x = -0.25;
    head.name = 'head';
    this.headMesh = head;
    // the jaw hangs from a stretched hinge — it drops further mid-wind-up
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.26, 0.12), darkMat);
    jaw.position.set(0, height * 0.99 - 0.3, 0.1);
    jaw.rotation.x = 0.5;
    this.jawMesh = jaw;
    this.addEyes(height * 0.99 + 0.05, 0.2, 0.08, 0);
    // arms too long for the body, fingers nearly at the knees
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, height * 0.62, 0.13), jacketMat);
      arm.position.set(sx * 0.34, height * 0.48, 0.14);
      arm.rotation.x = -0.4;
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), skinMat);
      claw.position.set(sx * 0.34, height * 0.48 - height * 0.36, 0.26);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, height * 0.4, 0.17), pantsMat);
      leg.position.set(sx * 0.13, height * 0.2, 0);
      this.group.add(arm, claw, leg);
    }
    this.group.add(torso, neck, head, jaw);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2;
    this.finishMesh(height);
  }

  /** Brute: a lofted mass of shoulders and back — the head is an afterthought
   *  sunk between traps, arms like wrecking bars knuckling the ground. */
  private buildBrute(height: number): void {
    const { vrnd, jacketMat, pantsMat, skinMat } = this.palette();
    const torso = this.loftTorso([
      { z: height * 0.34, w: 0.66, h: 0.5 },
      { z: height * 0.52, w: 0.98, h: 0.68 },
      { z: height * 0.68, w: 1.12, h: 0.66 },
      { z: height * 0.8, w: 0.72, h: 0.45 },
    ], jacketMat);
    this.torsoMesh = torso;
    // the hump: a squashed dome of muscle over the upper back
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), jacketMat);
    hump.scale.set(1.25, 0.7, 1);
    hump.position.set(0, height * 0.8, -0.12);
    // small head, sunk low and forward between the shoulders
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
    head.position.set(0, height * 0.86, 0.22);
    head.rotation.x = 0.3;
    head.name = 'head';
    this.headMesh = head;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.18), skinMat);
    jaw.position.set(0, height * 0.86 - 0.2, 0.3);
    this.jawMesh = jaw;
    this.addEyes(height * 0.86 + 0.03, 0.4, 0.09, 0);
    for (const sx of [-1, 1]) {
      // arms thick as legs, hanging to the knuckles
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, height * 0.55, 0.3), jacketMat);
      arm.position.set(sx * 0.62, height * 0.48, 0.18);
      arm.rotation.x = -0.3;
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), skinMat);
      fist.position.set(sx * 0.62, height * 0.16, 0.3);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, height * 0.42, 0.3), pantsMat);
      leg.position.set(sx * 0.24, height * 0.21, 0);
      this.group.add(arm, fist, leg);
    }
    this.group.add(torso, hump, head, jaw);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2;
    this.finishMesh(height);
  }

  /** Crawler: the body rides horizontal and low — spine parallel to the
   *  ground, head thrust forward, limbs bent for scuttling. */
  private buildCrawler(height: number): void {
    const { vrnd, jacketMat, pantsMat, skinMat, darkMat } = this.palette();
    // horizontal torso: a box pitched nearly flat, slung between shoulders and hips
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 1.0), jacketMat);
    torso.position.set(0, height * 0.52, -0.05);
    torso.rotation.x = 0.12;
    this.torsoMesh = torso;
    this.torsoBaseRotX = 0.12;
    // spine ridges down the back
    for (let i = 0; i < 4; i++) {
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), darkMat);
      ridge.position.set(0, height * 0.52 + 0.2, 0.28 - i * 0.22);
      this.group.add(ridge);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skinMat);
    head.scale.set(0.9, 0.85, 1.15);
    head.position.set(0, height * 0.6, 0.58);
    head.name = 'head';
    this.headMesh = head;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), darkMat);
    jaw.position.set(0, height * 0.6 - 0.16, 0.66);
    this.jawMesh = jaw;
    this.addEyes(height * 0.6 + 0.03, 0.76, 0.08, 0);
    for (const sx of [-1, 1]) {
      // forelimbs bent down-forward, hindlimbs trailing bent
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), jacketMat);
      arm.position.set(sx * 0.32, height * 0.3, 0.38);
      arm.rotation.x = 0.5;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), pantsMat);
      leg.position.set(sx * 0.3, height * 0.3, -0.45);
      leg.rotation.x = -0.7;
      this.group.add(arm, leg);
    }
    this.group.add(torso, head, jaw);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2;
    this.finishMesh(height);
  }

  /** Bloater: the belly IS the model — a lofted sac that swells past the
   *  jacket, weeping pustules, the head riding small on top of the mass. */
  private buildBloater(height: number): void {
    const { vrnd, jacketMat, pantsMat, skinMat, darkMat } = this.palette();
    const belly = this.loftTorso([
      { z: height * 0.26, w: 0.52, h: 0.45 },
      { z: height * 0.44, w: 0.98, h: 0.85 },
      { z: height * 0.58, w: 1.02, h: 0.88 },
      { z: height * 0.74, w: 0.6, h: 0.5 },
    ], jacketMat);
    this.torsoMesh = belly;
    // pustules: glossy sick-green blisters across the sac and shoulders
    const pusMat = new THREE.MeshStandardMaterial({ color: 0x9aa84e, roughness: 0.25, emissive: 0x2a3305, emissiveIntensity: 0.7 });
    this.mats.push(pusMat);
    const pusSpots: [number, number, number, number][] = [
      [0.3, 0.52, 0.42, 0.09], [-0.34, 0.44, 0.36, 0.07], [0.1, 0.62, 0.46, 0.06],
      [-0.2, 0.6, -0.4, 0.08], [0.38, 0.68, -0.1, 0.06], [0, 0.36, 0.5, 0.07],
    ];
    for (const [px, py, pz, pr] of pusSpots) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(pr, 8, 8), pusMat);
      p.position.set(px, height * py, pz);
      this.group.add(p);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat);
    head.position.set(0, height * 0.93, 0.06);
    head.rotation.z = 0.12;
    head.name = 'head';
    this.headMesh = head;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.13), darkMat);
    jaw.position.set(0, height * 0.93 - 0.22, 0.14);
    this.jawMesh = jaw;
    this.addEyes(height * 0.93 + 0.03, 0.24);
    for (const sx of [-1, 1]) {
      // arms dangle useless at the sides of the mass
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, height * 0.44, 0.16), jacketMat);
      arm.position.set(sx * 0.56, height * 0.5, 0.05);
      arm.rotation.z = sx * 0.25;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, height * 0.4, 0.2), pantsMat);
      leg.position.set(sx * 0.2, height * 0.2, 0);
      this.group.add(arm, leg);
    }
    this.group.add(belly, head, jaw);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2;
    this.finishMesh(height);
  }

  /** Spitter: a rangy frame carrying a translucent acid sac under the jaw —
   *  it swells bright on the telegraph, so the lob is always fair warning. */
  private buildSpitter(height: number): void {
    const { vrnd, jacketMat, pantsMat, skinMat, darkMat } = this.palette();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, height * 0.56, 0.36), jacketMat);
    body.position.y = height * 0.56;
    body.rotation.x = 0.14;
    this.torsoMesh = body;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skinMat);
    head.position.set(0.03, height * 0.95, 0.06);
    head.rotation.z = 0.1;
    head.name = 'head';
    this.headMesh = head;
    // the sac: a glossy green bulb slung from jaw to chest
    const sacMat = new THREE.MeshStandardMaterial({
      color: 0x7d9b3a, roughness: 0.2, emissive: 0x33450a, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.88,
    });
    this.mats.push(sacMat);
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), sacMat);
    sac.scale.set(0.9, 1.25, 0.9);
    sac.position.set(0.03, height * 0.95 - 0.3, 0.16);
    this.sacMesh = sac;
    // nozzle lips at the mouth
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0.03, height * 0.95 - 0.05, 0.28);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.12), darkMat);
    jaw.position.set(0.03, height * 0.95 - 0.2, 0.14);
    this.jawMesh = jaw;
    this.addEyes(height * 0.95 + 0.03, 0.24, 0.09, 0.03);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, height * 0.5, 0.16), jacketMat);
      arm.position.set(sx * 0.4, height * 0.52, 0.18);
      arm.rotation.x = -0.45;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, height * 0.44, 0.2), pantsMat);
      leg.position.set(sx * 0.16, height * 0.22, 0);
      this.group.add(arm, leg);
    }
    this.group.add(body, head, sac, nozzle, jaw);
    this.group.userData.limpPhase = vrnd() * Math.PI * 2;
    this.finishMesh(height);
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
    opts?: { head?: boolean; pen?: number; explosive?: boolean },
  ): boolean {
    if (!this.alive) return false;
    // the brute's counter is area damage: explosions land half again as hard
    if (opts?.explosive && this.kind === 'brute') amount *= BRUTE_EXPLOSION_MULT;
    this.hp -= amount;
    this.flashT = 0.18;
    this.bodyMat.emissive.setHex(0xff2222);
    // mass is a defense of its own: knockback scales with (1 - knockResist)
    const resist = 1 - KIND_STATS[this.kind].knockResist;
    this.knock.addScaledVector(fromDir, knockPower * resist);
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
      this.knock.addScaledVector(fromDir, knockPower * 0.8 * resist);
      // a dead bloater is a bomb with the pin already pulled — the
      // manager detonates it next frame (burst + acid pool)
      if (this.kind === 'bloater') this.burstPending = true;
      return true;
    }
    // THE SCREAMER'S COUNTER: a heavy hit, a headshot, or any melee
    // stagger during the wind-up breaks it — the shriek dies in its
    // throat and it needs time before it can try again.
    if (this.kind === 'screamer' && this.windupT > 0
      && (canStagger || (opts?.head ?? false) || sp >= SHRIEK_INTERRUPT_STAGGER)) {
      this.windupT = 0;
      this.shriekCd = 4.5;
      this.staggerT = Math.max(this.staggerT, 0.6);
      if (this.jawMesh) this.jawMesh.rotation.x = 0.5; // jaw snaps shut
      if (this.eyeMat) this.eyeMat.color.setHex(0xffd76a);
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
      // ragdoll-lite: tip over and stay — the corpse is searchable (Skyrim-style).
      // The crawler is already horizontal: it rolls onto its side instead.
      const tip = Math.min(1, this.deathT / 0.45);
      if (this.kind === 'crawler') g.rotation.z = tip * Math.PI * 0.5;
      else g.rotation.x = -tip * Math.PI * 0.5;
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
      if (this.torsoMesh) this.torsoMesh.rotation.x = this.torsoBaseRotX - jolt * 0.42;
      if (this.flinchT <= 0) {
        this.flinchPow = 0;
        if (this.headMesh) this.headMesh.rotation.x = 0;
        if (this.torsoMesh) this.torsoMesh.rotation.x = this.torsoBaseRotX;
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

    // ---- wave 4 special-kind clocks + committed actions ----
    this.shriekCd -= dt;
    this.spitCd -= dt;
    this.chargeCd -= dt;
    this.crawlT += dt;

    // SCREAMER: eyes on you (or a triangulated alert) starts the wind-up.
    // While it winds up it is rooted — head back, jaw dropping, eyes
    // flaring — and the ONLY ways out are the timer or the interrupt in
    // damage(). When the timer lands, the manager does the alerting.
    if (this.kind === 'screamer') {
      if (this.windupT <= 0 && this.shriekCd <= 0 && this.staggerT <= 0
        && (sees || this.alert >= 0.99) && distP <= 34) {
        this.windupT = SHRIEK_WINDUP_SEC;
      }
      if (this.windupT > 0) {
        this.windupT -= dt;
        const k = 1 - Math.max(this.windupT, 0) / SHRIEK_WINDUP_SEC;
        if (this.headMesh) this.headMesh.rotation.x = -0.25 - k * 0.55;
        if (this.jawMesh) this.jawMesh.rotation.x = 0.5 + k * 0.8;
        if (this.eyeMat) this.eyeMat.color.setHex(k > 0.6 ? 0xffe98a : 0xffd76a);
        if (this.windupT <= 0) {
          this.shriekFired = true;
          this.shriekCd = 9;
          this.staggerT = Math.max(this.staggerT, 0.25);
          if (this.headMesh) this.headMesh.rotation.x = -0.25;
          if (this.jawMesh) this.jawMesh.rotation.x = 0.5;
        }
        g.position.y = ctx.groundY(g.position.x, g.position.z, g.position.y);
        return;
      }
    }

    // SPITTER: the telegraph — sac swelling bright while it tracks you.
    // Break line of sight or close in; the glob goes where you WERE.
    if (this.kind === 'spitter' && this.telegraphT > 0) {
      this.telegraphT -= dt;
      const k = 1 - Math.max(this.telegraphT, 0) / 0.7;
      if (this.sacMesh) {
        const s = 1 + k * 0.55;
        this.sacMesh.scale.set(0.9 * s, 1.25 * s, 0.9 * s);
      }
      g.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      if (this.telegraphT <= 0) {
        this.spitLaunch = { x: pp.x, y: pp.y + 1.15, z: pp.z };
        if (this.sacMesh) this.sacMesh.scale.set(0.9, 1.25, 0.9);
        sfx.play('spit', { volume: 0.5 });
      }
      g.position.y = ctx.groundY(g.position.x, g.position.z, g.position.y);
      return;
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
        // BRUTE: a committed charge at the point it was aimed at — sidestep
        // the line and it sails past; stand in it and it arrives angry.
        if (this.kind === 'brute' && this.chargeT > 0) {
          this.chargeT -= dt;
          moveToward(
            g.position.x + this.chargeDir.x * 20,
            g.position.z + this.chargeDir.z * 20,
            speed * BRUTE_CHARGE.speedMult,
          );
          if (distP < 2.4) {
            this.chargeT = 0;
            this.state = 'attack';
            this.attackCd = 0; // the charge cashing in IS the first hit
          }
          break;
        }
        if (this.kind === 'brute' && sees
          && shouldBruteCharge(distP, this.chargeCd <= 0, this.chargeT > 0)) {
          this.chargeT = BRUTE_CHARGE.sec;
          this.chargeCd = BRUTE_CHARGE.cdSec;
          this.chargeDir.copy(toPlayer).normalize();
        }
        // SCREAMER: it does not close. Inside shriek range it holds its
        // ground (the wind-up logic above does the rest).
        if (this.kind === 'screamer' && distP <= 14) {
          if (distP < 2.3) {
            this.state = 'attack';
            this.attackCd = 0.4;
          }
          break;
        }
        // SPITTER: holds its band — closes when far, backs off when
        // crowded, lobs when it has eyes and a full sac.
        if (this.kind === 'spitter') {
          if (distP > SPIT_BAND.far) {
            moveToward(pp.x, pp.z, speed);
          } else if (distP < SPIT_BAND.near - 2) {
            moveToward(g.position.x - toPlayer.x, g.position.z - toPlayer.z, speed * 0.8);
          } else if (sees && this.spitCd <= 0 && this.telegraphT <= 0) {
            this.telegraphT = 0.7;
            this.spitCd = 3.4;
          }
          if (distP < 2.3) {
            this.state = 'attack';
            this.attackCd = 0.4;
          }
          break;
        }
        // CRAWLER: the approach swerves — the target point sloshes side to
        // side, so a scoped shot at range keeps missing the line.
        if (this.kind === 'crawler') {
          const d = Math.max(distP, 0.001);
          const sw = crawlerSwerve(this.crawlT, (g.userData.limpPhase as number) ?? 0) * 1.5;
          moveToward(pp.x + (-toPlayer.z / d) * sw, pp.z + (toPlayer.x / d) * sw, speed);
          if (distP < 2.0) {
            this.state = 'attack';
            this.attackCd = 0.3;
          }
          break;
        }
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

interface AcidPool {
  x: number; z: number; r: number; t: number; tickT: number; mesh: THREE.Mesh;
}

interface SpitGlob {
  mesh: THREE.Mesh;
  vx: number; vy: number; vz: number;
}

export class HuskManager {
  readonly scene: THREE.Scene;
  readonly zones: SpawnZone[];
  readonly husks: Husk[] = [];
  readonly rng: () => number;
  private respawnT = 20;
  private spawnCounter = 0;
  /** Run length, fed from the ctx each update — ambient specials scale with it. */
  private daysElapsed = 0;
  private pools: AcidPool[] = [];
  private globs: SpitGlob[] = [];

  /**
   * Optional placement veto (Game wires it to the building colliders):
   * a spawn point inside a structure is rejected and re-rolled, so area
   * zones that overlap buildings don't seed husks indoors.
   */
  spawnBlocked?: (x: number, z: number) => boolean;

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
      if (groundY(x, z) > 0.8 && !this.spawnBlocked?.(x, z)) return [x, z];
    }
    return null;
  }

  private addHusk(id: string, kind: HuskKind, x: number, z: number, zoneId: string, groundY: (x: number, z: number) => number): void {
    const h = new Husk(id, kind, x, z, zoneId, groundY);
    this.husks.push(h);
    this.scene.add(h.group);
  }

  /**
   * The ambient trickle: a rolled flesh kind (never the carrier's armored
   * pack — that stays military) sometimes comes up as a special instead,
   * more often the longer the run has gone.
   */
  private ambientKind(rolled: HuskKind): HuskKind {
    if (rolled === 'armored') return rolled;
    if (this.rng() < specialChance(this.daysElapsed)) {
      return pickAmbientSpecial(this.rng) as HuskKind;
    }
    return rolled;
  }

  spawnInitial(deadIds: Set<string>, groundY: (x: number, z: number) => number, isNight: boolean, daysElapsed = 0): void {
    this.daysElapsed = daysElapsed;
    for (const zone of this.zones) {
      if (zone.nightOnly && !isNight) continue;
      for (let i = 0; i < zone.count; i++) {
        const id = `${zone.id}_${i}`;
        if (deadIds.has(id)) continue;
        const p = this.landPoint(zone, groundY);
        if (!p) continue;
        const rolled = zone.kinds[Math.floor(this.rng() * zone.kinds.length)];
        // explicit special kinds in a zone list are seeded as listed;
        // the ambient substitution only upgrades flesh rolls
        const isListedSpecial = rolled !== 'shambler' && rolled !== 'stalker' && rolled !== 'armored';
        const kind = isListedSpecial ? rolled : this.ambientKind(rolled);
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
      // vertical window: husk body must overlap the player's reach band —
      // measured on the kind's own profile (a crawler's body rides at 0.5m)
      const dy = h.group.position.y + h.profile.bodyY - (origin.y + 1.2);
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
      const prof = h.profile;
      _v1.set(c.x - origin.x, c.y + prof.bodyY - origin.y, c.z - origin.z);
      const t = _v1.dot(dir);
      if (t < 0.5 || t > maxDist) continue;
      // closest approach of body center line — windowed by the kind's own
      // profile (brute is a wall, crawler is a rug)
      _v2.copy(dir).multiplyScalar(t).add(origin);
      const missBody = Math.hypot(_v2.x - c.x, _v2.z - c.z);
      const dyBody = Math.abs(_v2.y - (c.y + prof.bodyY));
      const bodyHit = missBody < prof.bodyR && dyBody < prof.bodyHalfH;
      // head sphere
      const hp = h.headPos(new THREE.Vector3());
      _v2.copy(dir).multiplyScalar(t).add(origin);
      const missHead = _v2.distanceTo(hp);
      if (bodyHit || missHead < prof.headR) {
        if (!best || t < best.dist) best = { husk: h, dist: t, head: missHead < prof.headR };
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
      // area damage is EXPLOSIVE damage — the brute's weakness applies
      if (h.damage(Math.round(dmg * fall), dir, 5, true, { explosive: true })) kills++;
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

  /** Leave a burning-green acid pool where something nasty landed. */
  private addPool(x: number, z: number, r: number, groundY: (x: number, z: number, refY?: number) => number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x86b93a, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, groundY(x, z) + 0.06, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.pools.push({ x, z, r, t: ACID_POOL.lifeSec, tickT: 0, mesh });
  }

  /** The shriek lands: every husk in earshot converges on the screamer's
   *  victim, and the player's noise meter pegs with the sound. */
  private resolveShriek(h: Husk, ctx: HuskCtx): void {
    const p = h.group.position;
    const radius = shriekAlertRadius(ctx.isNight);
    _v1.set(ctx.playerPos.x, 0, ctx.playerPos.z);
    for (const o of this.husks) {
      if (o === h || !o.alive) continue;
      const d = Math.hypot(o.group.position.x - p.x, o.group.position.z - p.z);
      if (d <= radius) o.investigateAt(_v1, { delay: Math.min(0.6, d / 300), jitter: 3 });
    }
    const dp = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
    const s = useGameStore.getState();
    const spike = shriekNoiseLevel(dp);
    if (spike > s.noiseLevel) s.setNoiseLevel(spike);
    sfx.play('shriek', { volume: Math.max(0.25, 1 - dp / 60) });
    ctx.onShriekFx?.(p.x, p.y + 2, p.z);
  }

  /** A bloater detonates: splash for everything near, acid for whoever lingers. */
  private resolveBurst(h: Husk, ctx: HuskCtx): void {
    const p = h.group.position;
    const R = BLOATER_BURST.radius;
    for (const o of this.husks) {
      if (o === h || !o.alive) continue;
      const d = Math.hypot(o.group.position.x - p.x, o.group.position.z - p.z);
      const dmg = burstDamageAt(BLOATER_BURST.huskDmg, d, R);
      if (dmg > 0) {
        const dir = _v1.set(o.group.position.x - p.x, 0, o.group.position.z - p.z);
        if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
        dir.normalize();
        o.damage(dmg, dir, 4, true, { explosive: true });
      }
    }
    const dp = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
    const pdmg = burstDamageAt(BLOATER_BURST.playerDmg, dp, R);
    if (pdmg > 0) {
      const s = useGameStore.getState();
      s.damagePlayer(pdmg * DIFFICULTIES[s.difficulty].huskDamage, 'husk');
    }
    sfx.play('burst', { volume: Math.max(0.3, 1 - dp / 40) });
    this.addPool(p.x, p.z, ACID_POOL.burstRadius, ctx.groundY);
    ctx.onBurstFx?.(p.x, p.y + 1, p.z);
  }

  /** A spitter's glob goes up: build the actual projectile from its arc. */
  private launchSpit(h: Husk): void {
    const target = h.spitLaunch!;
    h.spitLaunch = null;
    const from = h.headPos(new THREE.Vector3());
    const dist = from.distanceTo(_v1.set(target.x, target.y, target.z));
    const vel = spitVelocity(from, target, spitFlightTime(dist));
    if (!vel) return;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x86b93a, roughness: 0.25, emissive: 0x3a5205, emissiveIntensity: 1.2,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.globs.push({ mesh, vx: vel.vx, vy: vel.vy, vz: vel.vz });
  }

  private updateGlobs(dt: number, ctx: HuskCtx): void {
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const gl = this.globs[i];
      gl.vy -= SPIT_GRAVITY * dt; // the arc the launch velocity was solved for
      gl.mesh.position.x += gl.vx * dt;
      gl.mesh.position.y += gl.vy * dt;
      gl.mesh.position.z += gl.vz * dt;
      const p = gl.mesh.position;
      // caught the player mid-flight?
      const dx = p.x - ctx.playerPos.x;
      const dy = p.y - (ctx.playerPos.y + 1.15);
      const dz = p.z - ctx.playerPos.z;
      if (dx * dx + dy * dy + dz * dz < 0.65) {
        const s = useGameStore.getState();
        s.damagePlayer(SPIT_HIT_DMG * DIFFICULTIES[s.difficulty].huskDamage, 'husk');
        sfx.play('hurt', { volume: 0.6 });
        this.scene.remove(gl.mesh);
        this.globs.splice(i, 1);
        continue;
      }
      if (p.y <= ctx.groundY(p.x, p.z) + 0.08) {
        this.addPool(p.x, p.z, ACID_POOL.spitRadius, ctx.groundY);
        sfx.play('spit', { volume: 0.3 });
        this.scene.remove(gl.mesh);
        this.globs.splice(i, 1);
      }
    }
  }

  private updatePools(dt: number, ctx: HuskCtx): void {
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i];
      pool.t -= dt;
      if (pool.t <= 0) {
        this.scene.remove(pool.mesh);
        this.pools.splice(i, 1);
        continue;
      }
      // fade with age
      (pool.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.min(1, pool.t / 1.5);
      pool.tickT += dt;
      if (pool.tickT >= 0.5) {
        const tick = pool.tickT;
        pool.tickT = 0;
        const dp = Math.hypot(ctx.playerPos.x - pool.x, ctx.playerPos.z - pool.z);
        if (dp <= pool.r) {
          const s = useGameStore.getState();
          s.damagePlayer(ACID_POOL.playerDps * tick * DIFFICULTIES[s.difficulty].huskDamage, 'husk');
        }
        for (const h of this.husks) {
          if (!h.alive) continue;
          const d = Math.hypot(h.group.position.x - pool.x, h.group.position.z - pool.z);
          if (d <= pool.r) {
            _v1.set(0, 0, 1);
            h.damage(ACID_POOL.huskDps * tick, _v1, 0, false);
          }
        }
      }
    }
  }

  update(dt: number, ctx: HuskCtx, playerPos: THREE.Vector3, isNight: boolean): void {
    const full: HuskCtx = { ...ctx, playerPos, isNight };
    if (ctx.daysElapsed !== undefined) this.daysElapsed = ctx.daysElapsed;
    for (let i = this.husks.length - 1; i >= 0; i--) {
      const h = this.husks[i];
      h.update(dt, full, this.rng);
      if (h.removed) {
        this.scene.remove(h.group);
        this.husks.splice(i, 1);
      }
    }
    // wave 4 special effects resolve at manager level — a husk can't
    // alert its neighbors or splash its friends from inside its own update
    for (const h of [...this.husks]) {
      if (h.shriekFired) {
        h.shriekFired = false;
        this.resolveShriek(h, full);
      }
      if (h.burstPending && !h.burstDone) {
        h.burstDone = true;
        this.resolveBurst(h, full);
      }
      if (h.spitLaunch) this.launchSpit(h);
    }
    this.updateGlobs(dt, full);
    this.updatePools(dt, full);
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
              const rolled = zone.kinds[Math.floor(this.rng() * zone.kinds.length)];
              const kind = this.ambientKind(rolled);
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
    for (const p of this.pools) this.scene.remove(p.mesh);
    this.pools.length = 0;
    for (const g of this.globs) this.scene.remove(g.mesh);
    this.globs.length = 0;
  }
}
