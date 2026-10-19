// Husks.ts — husk entities + FSM (Idle/Wander/Investigate/Hunt/Attack/Return)
// plus spawn management, perception, and hit resolution helpers.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import { sfx } from '../systems/audio';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';

export type HuskKind = 'shambler' | 'stalker';
export type HuskState =
  | 'idle' | 'wander' | 'investigate' | 'hunt' | 'attack' | 'return' | 'dead';

const KIND_STATS: Record<HuskKind, { hp: number; speed: number; damage: number; color: number; height: number }> = {
  shambler: { hp: 40, speed: 2.3, damage: 12, color: 0x5d6b52, height: 1.8 },
  stalker: { hp: 30, speed: 3.6, damage: 9, color: 0x46465a, height: 1.95 },
};

export const HUSK_CAP = 14;

export interface HuskCtx {
  playerPos: THREE.Vector3;
  isNight: boolean;
  groundY: (x: number, z: number) => number;
  onHuskKilled: (h: Husk) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Husk {
  readonly id: string;
  readonly kind: HuskKind;
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
  knock = new THREE.Vector3();
  removed = false;
  killReported = false;
  private mats: THREE.MeshStandardMaterial[] = [];
  private bodyMat!: THREE.MeshStandardMaterial;

  constructor(id: string, kind: HuskKind, x: number, z: number, groundY: (x: number, z: number) => number) {
    this.id = id;
    this.kind = kind;
    const st = KIND_STATS[kind];
    this.hp = st.hp;
    this.home.set(x, 0, z);
    this.target.set(x, 0, z);
    this.buildMesh(st.color, st.height);
    this.group.position.set(x, groundY(x, z), z);
    this.stateT = 1 + Math.random() * 3;
  }

  private buildMesh(color: number, height: number): void {
    this.bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    this.mats.push(this.bodyMat);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1 });
    this.mats.push(darkMat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, height * 0.62, 0.42), this.bodyMat);
    body.position.y = height * 0.52;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), darkMat);
    head.position.y = height * 0.94;
    head.name = 'head';
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, height * 0.5, 0.2), this.bodyMat);
    armL.position.set(-0.5, height * 0.55, 0.12);
    armL.rotation.x = -0.9;
    const armR = armL.clone();
    armR.position.x = 0.5;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, height * 0.42, 0.24), darkMat);
    legL.position.set(-0.18, height * 0.21, 0);
    const legR = legL.clone();
    legR.position.x = 0.18;
    this.group.add(body, head, armL, armR, legL, legR);
    this.group.userData.headY = height * 0.94;
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
  damage(amount: number, fromDir: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashT = 0.18;
    this.bodyMat.emissive.setHex(0xff2222);
    this.knock.addScaledVector(fromDir, 2.2);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      return true;
    }
    // getting hit draws attention (caller routes investigateAt at the attacker)
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'return') {
      this.state = 'investigate';
      this.stateT = 0;
    }
    return false;
  }

  investigateAt(p: THREE.Vector3): void {
    if (!this.alive) return;
    if (this.state === 'hunt' || this.state === 'attack') return;
    this.state = 'investigate';
    this.target.copy(p);
    this.stateT = 0;
  }

  update(dt: number, ctx: HuskCtx, rng: () => number): void {
    const g = this.group;
    if (this.state === 'dead') {
      this.deathT += dt;
      // ragdoll-lite: tip over then fade
      const tip = Math.min(1, this.deathT / 0.45);
      g.rotation.x = -tip * Math.PI * 0.5;
      if (this.deathT > 1.2) {
        const f = 1 - Math.min(1, (this.deathT - 1.2) / 1.8);
        for (const m of this.mats) {
          m.transparent = true;
          m.opacity = f;
        }
        if (f <= 0) this.removed = true;
      }
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.bodyMat.emissive.setHex(0x000000);
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
      g.position.y = ctx.groundY(g.position.x, g.position.z);
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
    groundClamp();
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

  private addHusk(id: string, kind: HuskKind, x: number, z: number, groundY: (x: number, z: number) => number): void {
    const h = new Husk(id, kind, x, z, groundY);
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
        this.addHusk(id, kind, p[0], p[1], groundY);
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
      if (d <= radius) h.investigateAt(_v1);
    }
  }

  /** Melee arc check. Returns the husk hit (nearest), if any. */
  meleeHit(origin: THREE.Vector3, facing: number, range: number, halfArcRad: number): Husk | null {
    let best: Husk | null = null;
    let bestD = Infinity;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    for (const h of this.husks) {
      if (!h.alive) continue;
      const dx = h.group.position.x - origin.x;
      const dz = h.group.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.001) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos(halfArcRad)) continue;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
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
              this.addHusk(`rz_${this.spawnCounter++}`, kind, p[0], p[1], ctx.groundY);
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
