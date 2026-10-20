// Projectiles.ts — true projectiles for the long guns (hunting rifle,
// DMR, crossbow). Rounds fly, drop, and take time to arrive; the close
// weapons stay hitscan. Segment tests reuse HuskManager.raycastShot, so
// a fast round can never tunnel through a husk between frames.

import * as THREE from 'three';
import type { Husk, HuskManager } from './Husks';

export interface ProjectileShot {
  damage: number;
  pen: number; // armor penetration class of the ammo (gunMath.armorMult)
  weaponId: string;
}

export interface ProjectileHit {
  husk: Husk;
  point: THREE.Vector3;
  head: boolean;
  dist: number; // meters flown when it connected
  shot: ProjectileShot;
  dir: THREE.Vector3; // flight direction at impact (knockback source)
}

const MAX_PROJECTILES = 24;
const GRAVITY = 9.8;
const MAX_TRAVEL = 240;

interface Proj {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  shot: ProjectileShot;
  traveled: number;
  alive: boolean;
}

export class ProjectileManager {
  private pool: Proj[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.03, 0.03, 0.55);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffc873 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), shot: { damage: 0, pen: 0, weaponId: '' }, traveled: 0, alive: false });
    }
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, shot: ProjectileShot): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PROJECTILES;
    p.mesh.position.copy(origin);
    p.vel.copy(dir).multiplyScalar(speed);
    p.shot = shot;
    p.traveled = 0;
    p.alive = true;
    p.mesh.visible = true;
    // bolts are slow, heavy, and silver; bullets are a hot streak
    const bolt = speed < 80;
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(bolt ? 0xd8dde2 : 0xffc873);
    p.mesh.scale.set(bolt ? 1.5 : 1, bolt ? 1.5 : 1, bolt ? 1.3 : 1);
    p.mesh.lookAt(_t.copy(origin).add(dir));
  }

  update(
    dt: number,
    husks: HuskManager,
    groundY: (x: number, z: number) => number,
    onHit: (hit: ProjectileHit) => void,
    onGround: (point: THREE.Vector3) => void,
  ): void {
    if (dt <= 0) return;
    for (const p of this.pool) {
      if (!p.alive) continue;
      const pos = p.mesh.position;
      const stepLen = p.vel.length() * dt;
      _dir.copy(p.vel).normalize();
      // husk test along this frame's flight segment (continuous ray — the
      // round cannot skip past a body no matter the frame rate)
      const res = husks.raycastShot(pos, _dir, stepLen + 0.15);
      if (res) {
        const point = pos.clone().addScaledVector(_dir, res.dist);
        onHit({
          husk: res.husk,
          point,
          head: res.head,
          dist: p.traveled + res.dist,
          shot: p.shot,
          dir: _dir.clone(),
        });
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      pos.addScaledVector(p.vel, dt);
      p.traveled += stepLen;
      p.mesh.lookAt(_t.copy(pos).add(p.vel));
      const gy = groundY(pos.x, pos.z);
      if (pos.y <= gy + 0.03) {
        pos.y = gy + 0.03;
        onGround(pos.clone());
        p.alive = false;
        p.mesh.visible = false;
      } else if (p.traveled > MAX_TRAVEL) {
        p.alive = false;
        p.mesh.visible = false;
      }
    }
  }
}

const _dir = new THREE.Vector3();
const _t = new THREE.Vector3();
