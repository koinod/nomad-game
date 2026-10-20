// Animals.ts — ambient wildlife: deer and rabbits. They wander, graze, and
// flee from the player and loud noises. Hunt them for raw meat.

import * as THREE from 'three';
import { mulberry32 } from './rng';

export type AnimalKind = 'deer' | 'rabbit';

const KIND_STATS: Record<AnimalKind, { hp: number; fleeSpeed: number; wanderSpeed: number; radius: number }> = {
  deer: { hp: 30, fleeSpeed: 7.2, wanderSpeed: 1.1, radius: 0.5 },
  rabbit: { hp: 8, fleeSpeed: 5.6, wanderSpeed: 1.6, radius: 0.25 },
};

const MEAT_DROPS: Record<AnimalKind, { id: string; min: number; max: number }> = {
  deer: { id: 'raw_meat', min: 2, max: 3 },
  rabbit: { id: 'raw_meat', min: 1, max: 1 },
};

export interface AnimalKill {
  x: number;
  z: number;
  kind: AnimalKind;
}

export class Animal {
  readonly id: string;
  readonly kind: AnimalKind;
  readonly group = new THREE.Group();
  hp: number;
  dead = false;
  private fleeDir = new THREE.Vector3();
  private state: 'graze' | 'wander' | 'flee' = 'graze';
  private stateT = 0;
  private target = new THREE.Vector3();
  private yaw = 0;
  private hopT = 0; // rabbit hop cycle
  private grazeNod = 0;
  corpseT = 0;

  constructor(id: string, kind: AnimalKind, x: number, z: number, groundY: (x: number, z: number) => number, rng: () => number) {
    this.id = id;
    this.kind = kind;
    this.hp = KIND_STATS[kind].hp;
    this.buildMesh(rng);
    this.group.position.set(x, groundY(x, z), z);
    this.target.set(x, 0, z);
    this.yaw = rng() * Math.PI * 2;
    this.stateT = rng() * 3;
  }

  private buildMesh(rng: () => number): void {
    const tint = 0.85 + rng() * 0.3;
    const fur = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6b5a44).multiplyScalar(tint), roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 1 });
    if (this.kind === 'deer') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 1.15), fur);
      body.position.y = 0.95; body.name = 'body';
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), fur);
      neck.position.set(0, 1.35, 0.6); neck.rotation.x = -0.35; neck.name = 'neck';
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.5), fur);
      head.position.set(0, 1.62, 0.82); head.name = 'head';
      // antlers on some
      if (rng() < 0.5) {
        for (const sx of [-1, 1]) {
          const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5), dark);
          antler.position.set(sx * 0.12, 1.9, 0.78);
          antler.rotation.z = sx * 0.4;
          this.group.add(antler);
        }
      }
      for (const [lx, lz] of [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.4], [0.18, -0.4]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), dark);
        leg.position.set(lx, 0.35, lz);
        this.group.add(leg);
      }
      this.group.add(body, neck, head);
    } else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), fur);
      body.scale.set(1, 0.85, 1.25); body.position.y = 0.2; body.name = 'body';
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
      head.position.set(0, 0.32, 0.24); head.name = 'head';
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), fur);
        ear.position.set(sx * 0.07, 0.5, 0.22);
        ear.rotation.z = -sx * 0.15;
        this.group.add(ear);
      }
      this.group.add(body, head);
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  /** Returns the meat drop if this hit killed it. */
  damage(amount: number, fromDir: THREE.Vector3): (AnimalKill & { id: string; min: number; max: number }) | null {
    if (this.dead) return null;
    this.hp -= amount;
    // getting shot at sends it bolting
    this.state = 'flee';
    this.stateT = 0;
    this.fleeDir.set(fromDir.x, 0, fromDir.z).normalize();
    if (this.hp <= 0) {
      this.dead = true;
      this.corpseT = 0;
      const drop = MEAT_DROPS[this.kind];
      return { x: this.group.position.x, z: this.group.position.z, kind: this.kind, id: drop.id, min: drop.min, max: drop.max };
    }
    return null;
  }

  scare(fromX: number, fromZ: number): void {
    if (this.dead || this.state === 'flee') return;
    this.state = 'flee';
    this.stateT = 0;
    this.fleeDir.set(
      this.group.position.x - fromX,
      0,
      this.group.position.z - fromZ,
    ).normalize();
  }

  update(dt: number, playerPos: THREE.Vector3, groundY: (x: number, z: number) => number, rng: () => number): void {
    const g = this.group;
    if (this.dead) {
      this.corpseT += dt;
      if (this.corpseT < 0.5) g.rotation.x = -(this.corpseT / 0.5) * Math.PI * 0.5;
      return;
    }
    const st = KIND_STATS[this.kind];
    this.stateT += dt;
    const toPlayer = Math.hypot(playerPos.x - g.position.x, playerPos.z - g.position.z);
    if (toPlayer < 14 && this.state !== 'flee') this.scare(playerPos.x, playerPos.z);

    let speed = 0;
    if (this.state === 'flee') {
      speed = st.fleeSpeed;
      g.position.x += this.fleeDir.x * speed * dt;
      g.position.z += this.fleeDir.z * speed * dt;
      this.yaw = Math.atan2(this.fleeDir.x, this.fleeDir.z);
      if (this.stateT > 4 || toPlayer > 40) {
        this.state = 'graze';
        this.stateT = 0;
      }
    } else if (this.state === 'graze') {
      // head-bob grazing
      this.grazeNod += dt * 2;
      const head = g.getObjectByName('head');
      if (head) head.position.y += Math.sin(this.grazeNod) * dt * 0.25;
      if (this.stateT > 2.5 + rng() * 3) {
        this.state = 'wander';
        this.stateT = 0;
        const a = rng() * Math.PI * 2;
        const r = 6 + rng() * 14;
        this.target.set(g.position.x + Math.cos(a) * r, 0, g.position.z + Math.sin(a) * r);
      }
    } else {
      speed = st.wanderSpeed;
      const dx = this.target.x - g.position.x;
      const dz = this.target.z - g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        g.position.x += (dx / d) * speed * dt;
        g.position.z += (dz / d) * speed * dt;
        this.yaw = Math.atan2(dx, dz);
      } else {
        this.state = 'graze';
        this.stateT = 0;
      }
    }
    // rabbit hop
    if (this.kind === 'rabbit' && speed > 0) {
      this.hopT += dt * (speed > 3 ? 14 : 8);
      g.position.y = groundY(g.position.x, g.position.z) + Math.abs(Math.sin(this.hopT)) * 0.35;
    } else {
      g.position.y = groundY(g.position.x, g.position.z);
    }
    g.rotation.y += (this.yaw - g.rotation.y) * Math.min(1, dt * 8);
  }
}

export class AnimalManager {
  readonly scene: THREE.Scene;
  readonly animals: Animal[] = [];
  readonly rng: () => number;
  private spawnCounter = 0;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.rng = mulberry32(seed ^ 0xa41a1);
  }

  spawnInitial(groundY: (x: number, z: number) => number): void {
    // deer in the forest band, rabbits on dune/marsh
    const spots: { kind: AnimalKind; x: number; z: number }[] = [];
    let guard = 0;
    while (spots.filter((s) => s.kind === 'deer').length < 8 && guard++ < 3000) {
      const x = -420 + this.rng() * 800;
      const z = -140 + this.rng() * 280;
      if (groundY(x, z) < 2) continue;
      spots.push({ kind: 'deer', x, z });
    }
    guard = 0;
    while (spots.filter((s) => s.kind === 'rabbit').length < 10 && guard++ < 3000) {
      const x = -650 + this.rng() * 1300;
      const z = -280 + this.rng() * 560;
      const h = groundY(x, z);
      if (h < 1 || h > 8) continue;
      spots.push({ kind: 'rabbit', x, z });
    }
    for (const s of spots) {
      const a = new Animal(`a_${this.spawnCounter++}`, s.kind, s.x, s.z, groundY, this.rng);
      this.animals.push(a);
      this.scene.add(a.group);
    }
  }

  emitNoise(x: number, z: number, radius: number): void {
    for (const a of this.animals) {
      if (a.dead) continue;
      if (Math.hypot(a.group.position.x - x, a.group.position.z - z) <= radius) {
        a.scare(x, z);
      }
    }
  }

  /** Non-damaging arc query — for crosshair/target feedback. */
  queryArc(origin: THREE.Vector3, facing: number, range: number, halfArcRad: number): boolean {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const cosArc = Math.cos(halfArcRad);
    for (const a of this.animals) {
      if (a.dead) continue;
      const st = KIND_STATS[a.kind];
      const dx = a.group.position.x - origin.x;
      const dz = a.group.position.z - origin.z;
      const d = Math.hypot(dx, dz) - st.radius;
      if (d > range) continue;
      const dot = (dx * fx + dz * fz) / Math.max(Math.hypot(dx, dz), 0.001);
      if (dot < cosArc) continue;
      return true;
    }
    return false;
  }

  /** Apply melee damage to every animal in the swing arc; returns hit count. */
  damageInArc(
    origin: THREE.Vector3,
    facing: number,
    range: number,
    halfArcRad: number,
    damage: number,
    onKill: (kill: AnimalKill & { id: string; min: number; max: number }) => void,
  ): number {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const cosArc = Math.cos(halfArcRad);
    let hits = 0;
    for (const a of this.animals) {
      if (a.dead) continue;
      const st = KIND_STATS[a.kind];
      const dx = a.group.position.x - origin.x;
      const dz = a.group.position.z - origin.z;
      const d = Math.hypot(dx, dz) - st.radius;
      if (d > range) continue;
      const dot = (dx * fx + dz * fz) / Math.max(Math.hypot(dx, dz), 0.001);
      if (dot < cosArc) continue;
      hits++;
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const kill = a.damage(damage, dir);
      if (kill) {
        const drop = MEAT_DROPS[a.kind];
        onKill({ ...kill, id: drop.id, min: drop.min, max: drop.max });
      }
    }
    return hits;
  }

  /** Explosions don't care about facing: pure radius damage. */
  damageInRadius(x: number, z: number, radius: number, damage: number): void {
    for (const a of this.animals) {
      if (a.dead) continue;
      const dx = a.group.position.x - x;
      const dz = a.group.position.z - z;
      if (Math.hypot(dx, dz) > radius) continue;
      const dir = new THREE.Vector3(dx, 0, dz);
      if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
      dir.normalize();
      a.damage(damage, dir);
    }
  }

  /** Hitscan for the pistol. */
  raycastShot(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    damage: number,
    onKill: (kill: AnimalKill & { id: string; min: number; max: number }) => void,
  ): boolean {
    let hitAny = false;
    for (const a of this.animals) {
      if (a.dead) continue;
      const st = KIND_STATS[a.kind];
      const c = a.group.position;
      const toC = new THREE.Vector3(c.x - origin.x, c.y + 0.6 - origin.y, c.z - origin.z);
      const t = toC.dot(dir);
      if (t < 0.5 || t > maxDist) continue;
      const closest = new THREE.Vector3().copy(dir).multiplyScalar(t).add(origin);
      const miss = Math.hypot(closest.x - c.x, closest.z - c.z);
      const dy = Math.abs(closest.y - (c.y + 0.6));
      if (miss < st.radius + 0.25 && dy < 1.2) {
        hitAny = true;
        const d = new THREE.Vector3(c.x - origin.x, 0, c.z - origin.z).normalize();
        const kill = a.damage(damage, d);
        if (kill) {
          const drop = MEAT_DROPS[a.kind];
          onKill({ ...kill, id: drop.id, min: drop.min, max: drop.max });
        }
        break; // one animal per shot
      }
    }
    return hitAny;
  }

  update(dt: number, playerPos: THREE.Vector3, groundY: (x: number, z: number) => number): void {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      a.update(dt, playerPos, groundY, this.rng);
      // corpses fade after 25s
      if (a.dead && a.corpseT > 25) {
        this.scene.remove(a.group);
        this.animals.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const a of this.animals) this.scene.remove(a.group);
    this.animals.length = 0;
  }
}
