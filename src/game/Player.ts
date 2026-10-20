// Player.ts — low-poly humanoid, third-person controller + camera.

import * as THREE from 'three';
import { input, consumeLook } from './input';
import { tryMelee, tryRanged } from './Combat';
import { buildHandMesh, activeHandItemId } from './weaponMeshes';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';
import { clamp, lerp } from './rng';
import { useGameStore } from '../store/gameStore';

export interface PlayerCtx {
  groundY: (x: number, z: number) => number;
  sprintAllowed: boolean;
  speedMul: number; // encumbrance
  husks: HuskManager;
  emitNoise: (x: number, z: number, radius: number) => void;
  camera: THREE.PerspectiveCamera;
}

const WALK_SPEED = 4.9;
const SPRINT_SPEED = 8.8;
const CROUCH_SPEED = 2.3;
const CAM_DIST = 6.4;
const JUMP_VEL = 5.6;
const GRAVITY = 20;
const ACCEL_GROUND = 11;
const ACCEL_AIR = 3.2;

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
  /** Inner rig: bob + lean ride here so terrain clamping on group.position stays clean. */
  private rig!: THREE.Group;
  private leanF = 0; // smoothed forward lean (sprint)
  private leanS = 0; // smoothed strafe roll
  private idleT = 0;
  private attackT = 0; // melee swing timer (arm anim)
  private recoilT = 0; // ranged recoil timer (arm anim)
  private vel = new THREE.Vector3(); // horizontal velocity (smoothed)
  private vy = 0; // vertical velocity
  private grounded = true;
  private crouching = false;
  private landDip = 0; // camera dip on hard landing, decays
  private handAnchor!: THREE.Group; // right-hand weapon mount
  private handItemId: string | null = null;
  private smoothCamMinY = 0; // smoothed ground clearance — kills the hard-clamp snap
  private blockBlend = 0; // 0..1 block pose blend

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
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), jacket);
    torso.position.y = 1.18;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
    head.position.y = 1.78;
    head.castShadow = true;
    // Pivot limbs at the joint: translate geometry so rotation swings from hip/shoulder.
    const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.24);
    legGeo.translate(0, -0.4, 0);
    this.legL = new THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.16, 0.8, 0);
    this.legL.castShadow = true;
    this.legR = new THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.16, 0.8, 0);
    this.legR.castShadow = true;
    const armGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2);
    armGeo.translate(0, -0.36, 0);
    this.armL = new THREE.Mesh(armGeo, jacket);
    this.armL.position.set(-0.42, 1.52, 0);
    this.armL.castShadow = true;
    this.armR = new THREE.Mesh(armGeo, jacket);
    this.armR.position.set(0.42, 1.52, 0);
    this.armR.castShadow = true;
    // weapon mount at the fist (arm geometry is translated -0.36, so hand ≈ -0.72)
    this.handAnchor = new THREE.Group();
    this.handAnchor.position.set(0, -0.7, 0.08);
    this.armR.add(this.handAnchor);
    this.rig.add(torso, head, this.legL, this.legR, this.armL, this.armR);
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

  /** Keep the right-hand mesh in sync with what's actually equipped. */
  private syncHandWeapon(): void {
    const s = useGameStore.getState();
    const want = activeHandItemId(s.equipped, s.inventory);
    if (want === this.handItemId) return;
    this.handItemId = want;
    // clear old mesh
    while (this.handAnchor.children.length > 0) {
      const c = this.handAnchor.children[0];
      this.handAnchor.remove(c);
    }
    if (want) {
      const mesh = buildHandMesh(want);
      // slight grip tilt so weapons read naturally in hand
      mesh.rotation.x = 0.15;
      this.handAnchor.add(mesh);
    }
  }

  update(dt: number, ctx: PlayerCtx): void {
    this.syncHandWeapon();
    const [ldx, ldy] = consumeLook();
    // touch drag-look arrives in pixels too; scale both the same
    this.camYaw -= ldx * 0.0026;
    // wrap yaw to [-PI, PI] — unbounded growth loses float precision and
    // makes sin/cos stutter after many full turns (the "gyro hit something" snap)
    while (this.camYaw > Math.PI) this.camYaw -= Math.PI * 2;
    while (this.camYaw < -Math.PI) this.camYaw += Math.PI * 2;
    this.camPitch = clamp(this.camPitch - ldy * 0.0022, -1.15, 0.55);

    this.meleeCd -= dt;
    this.rangedCd -= dt;
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzle.intensity = 0;
    }

    // --- movement: smoothed velocity, jump, crouch ---
    const mx = clamp(input.moveX, -1, 1);
    const mz = clamp(input.moveY, -1, 1);
    const wishInput = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;
    this.crouching = input.crouch && this.grounded;
    const wantSprint = input.sprint && ctx.sprintAllowed && this.stamina > 1 && mz > 0.1 && !this.crouching;
    const sprinting = wantSprint && wishInput;

    let speed = WALK_SPEED * ctx.speedMul;
    if (sprinting) speed = SPRINT_SPEED * ctx.speedMul;
    else if (this.crouching) speed = CROUCH_SPEED * ctx.speedMul;

    // camera-relative wish direction: forward = (sin yaw, cos yaw),
    // right = (-cos yaw, sin yaw). (Both axes were negated before — W walked backward.)
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    let wishX = 0;
    let wishZ = 0;
    if (wishInput) {
      const wx = mz * sin - mx * cos;
      const wz = mz * cos + mx * sin;
      const len = Math.hypot(wx, wz) || 1;
      wishX = (wx / len) * speed;
      wishZ = (wz / len) * speed;
      // face travel direction
      const targetYaw = Math.atan2(wx, wz);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 10);
      this.group.rotation.y = this.yaw;
    }
    // smooth accel toward wish velocity: snappy on ground, drifty in air
    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const vk = Math.min(1, dt * accel);
    this.vel.x = lerp(this.vel.x, wishX, vk);
    this.vel.z = lerp(this.vel.z, wishZ, vk);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const moving = this.vel.length() > 0.6;

    // jump (edge) + gravity; the heightmap is the ground
    if (input.jump && this.grounded && !this.crouching) {
      this.vy = JUMP_VEL;
      this.grounded = false;
      sfx.play('step', { volume: 0.4 });
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      const gy = Math.max(ctx.groundY(this.pos.x, this.pos.z), -0.5);
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        if (this.vy < -13) {
          // hard fall: damage scales past the safe threshold, camera dips
          const dmg = Math.round((-this.vy - 13) * 6);
          useGameStore.getState().damagePlayer(dmg, 'fall');
          this.landDip = Math.min(0.35, 0.1 + dmg * 0.004);
          sfx.play('hurt', { volume: 0.5 });
        } else if (this.vy < -6) {
          this.landDip = 0.08;
          sfx.play('step', { volume: 0.5 });
        }
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      // glued to terrain when grounded (walk off a ledge -> next tick we're airborne)
      const gy = Math.max(ctx.groundY(this.pos.x, this.pos.z), -0.5);
      if (this.pos.y > gy + 0.02) this.grounded = false; // walked off something
      else this.pos.y = gy;
    }
    this.landDip = lerp(this.landDip, 0, Math.min(1, dt * 7));

    if (moving) {
      // locomotion cycle: limbs swing from hip/shoulder pivots
      this.walkPhase += dt * (sprinting ? 13 : this.crouching ? 6 : 9);
      const sw = Math.sin(this.walkPhase);
      const amp = sprinting ? 0.68 : this.crouching ? 0.34 : 0.52;
      this.legL.rotation.x = sw * amp;
      this.legR.rotation.x = -sw * amp;
      this.armL.rotation.x = -sw * amp * 0.75;
      this.armR.rotation.x = sw * amp * 0.75;
      // body bob on the rig, forward lean when sprinting, roll into strafes,
      // and ride low when crouching
      const crouchDrop = lerp(this.rig.userData.crouchDrop ?? 0, this.crouching ? 0.42 : 0, Math.min(1, dt * 10));
      this.rig.userData.crouchDrop = crouchDrop;
      this.rig.position.y = Math.abs(Math.cos(this.walkPhase)) * (sprinting ? 0.085 : 0.05) - crouchDrop;
      this.leanF = lerp(this.leanF, sprinting ? 0.17 : this.crouching ? 0.22 : 0.05, Math.min(1, dt * 6));
      this.leanS = lerp(this.leanS, -mx * 0.07, Math.min(1, dt * 6));
      this.rig.rotation.x = this.leanF;
      this.rig.rotation.z = this.leanS;

      // footsteps + locomotion noise (crouching is quiet)
      this.stepAcc += this.vel.length() * dt;
      if (this.stepAcc > 2.4) {
        this.stepAcc = 0;
        sfx.play('step', { volume: sprinting ? 0.5 : this.crouching ? 0.12 : 0.28 });
      }
      this.walkNoiseT -= dt;
      this.sprintNoiseT -= dt;
      if (sprinting && this.sprintNoiseT <= 0) {
        this.sprintNoiseT = 1.2;
        ctx.emitNoise(this.pos.x, this.pos.z, 14);
      } else if (!sprinting && this.walkNoiseT <= 0) {
        this.walkNoiseT = 2.5;
        ctx.emitNoise(this.pos.x, this.pos.z, this.crouching ? 3 : 6);
      }
    } else {
      // idle: settle the limbs, breathe (stay low if crouching)
      this.idleT += dt;
      const crouchDrop = lerp(this.rig.userData.crouchDrop ?? 0, this.crouching ? 0.42 : 0, Math.min(1, dt * 10));
      this.rig.userData.crouchDrop = crouchDrop;
      this.rig.position.y = Math.sin(this.idleT * 2.1) * 0.015 - crouchDrop;
      this.leanF = lerp(this.leanF, this.crouching ? 0.22 : 0, Math.min(1, dt * 6));
      this.leanS = lerp(this.leanS, 0, Math.min(1, dt * 6));
      this.rig.rotation.x = this.leanF;
      this.rig.rotation.z = this.leanS;
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

    // --- attack animation (right-arm override, after locomotion) ---
    const blocking = input.blocking && this.handItemId != null;
    this.blockBlend = lerp(this.blockBlend, blocking ? 1 : 0, Math.min(1, dt * 12));
    if (this.blockBlend > 0.02) {
      // block pose: arm across the chest, weapon up — blends in/out, overrides
      const b = this.blockBlend;
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.45, b);
      this.armR.rotation.y = lerp(this.armR.rotation.y, -0.9, b);
      this.rig.rotation.y = lerp(this.rig.rotation.y, 0.25, b);
    } else if (this.attackT > 0) {
      this.attackT -= dt;
      const k = 1 - Math.max(this.attackT, 0) / 0.28; // 0..1 across the swing
      this.armR.rotation.x = -2.3 + k * 3.1; // raise, then chop down
      this.rig.rotation.y = Math.sin(k * Math.PI) * 0.22;
    } else if (this.recoilT > 0) {
      this.recoilT -= dt;
      const k = Math.max(this.recoilT, 0) / 0.16;
      this.armR.rotation.x = -1.2 - k * 0.35; // arm up, kicked back
      this.rig.rotation.y *= 0.8;
    } else {
      this.rig.rotation.y *= 0.8;
      this.armR.rotation.y *= 0.9; // release the block pose's cross-body angle
    }

    // --- attacks (blocked while guarding) ---
    if (input.attackMelee && this.meleeCd <= 0 && this.blockBlend < 0.5) {
      this.meleeCd = 0.45;
      this.attackT = 0.28; // swing the arm — weapon or bare fist
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
    if (input.attackRanged && this.rangedCd <= 0 && this.blockBlend < 0.5) {
      this.rangedCd = 0.4;
      this.recoilT = 0.16;
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
    const camH = (this.crouching ? 1.35 : 1.9) - this.landDip;
    // lean: Q left, E right — shift the camera sideways + roll it
    const leanDir = (input.leanLeft ? -1 : 0) + (input.leanRight ? 1 : 0);
    const leanAmt = lerp((this.rig.userData.leanCamAmt as number) ?? 0, leanDir, Math.min(1, dt * 10));
    this.rig.userData.leanCamAmt = leanAmt;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + camH, this.pos.z);
    // shift the target sideways along the camera's right vector so the lean peeks around cover
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    target.addScaledVector(right, leanAmt * 0.9);
    const cp = Math.cos(this.camPitch);
    const off = new THREE.Vector3(
      -Math.sin(this.camYaw) * cp,
      -Math.sin(this.camPitch),
      -Math.cos(this.camYaw) * cp,
    ).multiplyScalar(CAM_DIST);
    const camPos = target.clone().add(off);
    // smoothed ground clearance: the hard clamp snapped when the camera
    // swung over a hill or rock edge — ride over it instead
    const targetMinY = ctx.groundY(camPos.x, camPos.z) + 0.5;
    if (this.smoothCamMinY === 0) this.smoothCamMinY = targetMinY;
    this.smoothCamMinY = lerp(this.smoothCamMinY, targetMinY, Math.min(1, dt * 6));
    if (camPos.y < this.smoothCamMinY) camPos.y = this.smoothCamMinY;
    cam.position.lerp(camPos, Math.min(1, dt * 18));
    cam.lookAt(target);
    cam.rotateZ(-leanAmt * 0.28); // roll the view with the lean
  }
}
