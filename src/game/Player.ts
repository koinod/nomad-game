// Player.ts — low-poly humanoid, third-person controller + camera.

import * as THREE from 'three';
import { input, consumeLook } from './input';
import { tryMelee, tryRanged } from './Combat';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';
import { clamp, lerp } from './rng';

export interface PlayerCtx {
  groundY: (x: number, z: number) => number;
  sprintAllowed: boolean;
  speedMul: number; // encumbrance
  husks: HuskManager;
  emitNoise: (x: number, z: number, radius: number) => void;
  camera: THREE.PerspectiveCamera;
}

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.4;
const CAM_DIST = 6.4;

export class Player {
  readonly group = new THREE.Group();
  yaw = 0; // body facing
  camYaw = Math.PI; // camera behind player facing +z? set on spawn
  camPitch = -0.18;
  stamina = 100;
  meleeCd = 0;
  rangedCd = 0;
  private stepAcc = 0;
  private walkNoiseT = 0;
  private sprintNoiseT = 0;
  private muzzle!: THREE.PointLight;
  private muzzleT = 0;
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private armL!: THREE.Mesh;
  private armR!: THREE.Mesh;
  private walkPhase = 0;

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.muzzle = new THREE.PointLight(0xffd27a, 0, 14, 2);
    this.muzzle.position.set(0.4, 1.55, 0.6);
    this.group.add(this.muzzle);
    scene.add(this.group);
  }

  private buildMesh(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a180, roughness: 0.9 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2e4a4e, roughness: 1 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), jacket);
    torso.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
    head.position.y = 1.78;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
    this.legL.position.set(-0.16, 0.4, 0);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.16;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), jacket);
    this.armL.position.set(-0.42, 1.18, 0);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.42;
    this.group.add(torso, head, this.legL, this.legR, this.armL, this.armR);
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  spendStamina(n: number): boolean {
    if (this.stamina < n) return false;
    this.stamina -= n;
    return true;
  }

  flashMuzzle(): void {
    this.muzzleT = 0.09;
    this.muzzle.intensity = 26;
  }

  /** Eye position + aim dir for hitscan (camera-driven). */
  aim(camera: THREE.PerspectiveCamera): { eye: THREE.Vector3; dir: THREE.Vector3 } {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const eye = this.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    return { eye, dir };
  }

  update(dt: number, ctx: PlayerCtx): void {
    const [ldx, ldy] = consumeLook();
    // touch drag-look arrives in pixels too; scale both the same
    this.camYaw -= ldx * 0.0026;
    this.camPitch = clamp(this.camPitch - ldy * 0.0022, -1.15, 0.55);

    this.meleeCd -= dt;
    this.rangedCd -= dt;
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzle.intensity = 0;
    }

    // --- movement ---
    const mx = clamp(input.moveX, -1, 1);
    const mz = clamp(input.moveY, -1, 1);
    const moving = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;
    const wantSprint = input.sprint && ctx.sprintAllowed && this.stamina > 1 && mz > 0.1;
    const sprinting = wantSprint && moving;

    let speed = WALK_SPEED * ctx.speedMul;
    if (sprinting) speed = SPRINT_SPEED * ctx.speedMul;

    if (moving) {
      // camera-relative wish direction
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = -mx * sin - mz * cos;
      const len = Math.hypot(wx, wz) || 1;
      this.pos.x += (wx / len) * speed * dt;
      this.pos.z += (wz / len) * speed * dt;
      // face travel direction
      const targetYaw = Math.atan2(wx, wz);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 10);
      this.group.rotation.y = this.yaw;

      // walk cycle
      this.walkPhase += dt * (sprinting ? 13 : 9);
      const sw = Math.sin(this.walkPhase) * 0.5;
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.7;
      this.armR.rotation.x = sw * 0.7;

      // footsteps + locomotion noise
      this.stepAcc += speed * dt;
      if (this.stepAcc > 2.4) {
        this.stepAcc = 0;
        sfx.play('step', { volume: sprinting ? 0.5 : 0.28 });
      }
      this.walkNoiseT -= dt;
      this.sprintNoiseT -= dt;
      if (sprinting && this.sprintNoiseT <= 0) {
        this.sprintNoiseT = 1.2;
        ctx.emitNoise(this.pos.x, this.pos.z, 14);
      } else if (!sprinting && this.walkNoiseT <= 0) {
        this.walkNoiseT = 2.5;
        ctx.emitNoise(this.pos.x, this.pos.z, 6);
      }
    } else {
      this.legL.rotation.x *= 0.9;
      this.legR.rotation.x *= 0.9;
      this.armL.rotation.x *= 0.9;
      this.armR.rotation.x *= 0.9;
    }

    // stamina
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 11 * dt);
    } else {
      const regen = moving ? 4.5 : 10;
      this.stamina = Math.min(100, this.stamina + regen * dt);
    }

    // clamp to terrain (walk off ledges is fine — we just snap down)
    const gy = ctx.groundY(this.pos.x, this.pos.z);
    this.pos.y = lerp(this.pos.y, Math.max(gy, -0.5), Math.min(1, dt * 14));

    // --- attacks ---
    if (input.attackMelee && this.meleeCd <= 0) {
      this.meleeCd = 0.45;
      tryMelee({
        husks: ctx.husks,
        emitNoise: ctx.emitNoise,
        playerPos: this.pos,
        playerYaw: this.yaw,
        aimDir: new THREE.Vector3(),
        eyePos: new THREE.Vector3(),
        spendStamina: (n) => this.spendStamina(n),
        flashMuzzle: () => undefined,
      });
    }
    if (input.attackRanged && this.rangedCd <= 0) {
      this.rangedCd = 0.4;
      const { eye, dir } = this.aim(ctx.camera);
      tryRanged({
        husks: ctx.husks,
        emitNoise: ctx.emitNoise,
        playerPos: this.pos,
        playerYaw: this.yaw,
        aimDir: dir,
        eyePos: eye,
        spendStamina: (n) => this.spendStamina(n),
        flashMuzzle: () => this.flashMuzzle(),
      });
    }

    // --- third-person camera ---
    const cam = ctx.camera;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.9, this.pos.z);
    const cp = Math.cos(this.camPitch);
    const off = new THREE.Vector3(
      -Math.sin(this.camYaw) * cp,
      -Math.sin(this.camPitch),
      -Math.cos(this.camYaw) * cp,
    ).multiplyScalar(CAM_DIST);
    const camPos = target.clone().add(off);
    const minY = ctx.groundY(camPos.x, camPos.z) + 0.5;
    if (camPos.y < minY) camPos.y = minY;
    cam.position.lerp(camPos, Math.min(1, dt * 18));
    cam.lookAt(target);
  }
}
