// Player.ts — low-poly humanoid, third-person controller + camera.

import * as THREE from 'three';
import { input, consumeLook } from './input';
import { tryMelee, tryRanged, meleeStatsFor, equippedMeleeId, equippedRangedDef } from './Combat';
import { buildHandMesh, activeHandItemId } from './weaponMeshes';
import { getGame } from './instance';
import type { AnimalManager, AnimalKill } from './Animals';
import { resolveCollisions, type Collider } from './Colliders';
import { DIFFICULTIES, HAIR_COLORS, SKIN_TONES } from '../store/types';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';
import { clamp, lerp } from './rng';
import {
  accelRate, expDamp, sprintFovKick, wadeBlocksJump, wadeBlocksSprint, wadeFactor,
} from './moveMath';
import { useGameStore } from '../store/gameStore';
import { XP_EVENTS, type XpEventId } from '../systems/skills';
import { ITEMS } from '../data/items';

/** Pay a Lane 8 XP event through the store (amounts live in the table). */
function awardXpEvent(id: XpEventId, mult = 1): void {
  const ev = XP_EVENTS[id];
  useGameStore.getState().addSkillXp(ev.skill, ev.xp * mult);
}
import { magSizeOf, modAdsTimeMult, modRecoilMult } from '../data/mods';
import {
  RECOIL_RECOVERABLE, bloomAdd, bloomDecay, kickFor, recoveryStep, swayOffset,
} from './gunMath';

/** Seconds to bring a weapon from carry to ready, by what it is. */
const DRAW_TIMES: Record<string, number> = {
  pistol: 0.35, revolver: 0.4, flare_gun: 0.35, smg: 0.45, carbine: 0.5,
  shotgun: 0.55, crossbow: 0.6, hunting_rifle: 0.65, dmr: 0.65,
};
function drawTimeFor(itemId: string | null): number {
  if (!itemId) return 0.12;
  if (DRAW_TIMES[itemId] != null) return DRAW_TIMES[itemId];
  const cat = ITEMS[itemId]?.category;
  if (cat === 'weapon-ranged') return 0.5;
  if (cat === 'weapon-melee') return 0.25;
  return 0.3;
}

export interface PlayerCtx {
  groundY: (x: number, z: number) => number;
  sprintAllowed: boolean;
  speedMul: number; // encumbrance
  husks: HuskManager;
  animals: AnimalManager;
  emitNoise: (x: number, z: number, radius: number) => void;
  onAnimalKill: (kill: AnimalKill & { id: string; min: number; max: number }) => void;
  onThrow: (itemId: string) => void; // grenades: Game owns the projectile sim
  onProjectile?: ( // long guns: Game owns the round's flight
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    shot: { damage: number; pen: number; weaponId: string },
  ) => void;
  fx?: import('./Fx').Fx; // combat feedback particles/tracers (Game-owned)
  camera: THREE.PerspectiveCamera;
  colliders: readonly Collider[]; // house walls + furniture
}

const WALK_SPEED = 5.6;
const SPRINT_SPEED = 10.4;
const CROUCH_SPEED = 2.6;
const JUMP_VEL = 5.6;
const GRAVITY = 20;

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
  private reloadT = 0; // seconds left on the current reload
  private reloadUid: string | null = null; // weapon the in-flight reload belongs to
  private clearT = 0; // seconds left working a jammed action clear
  private clearUid: string | null = null;
  // ---- wave 2 weapon handling state ----
  private bloom = 0; // 0..1 spread bloom from sustained fire
  private adsBlend = 0; // 0 hip .. 0.55 shoulder .. 1 sights (eased, not stepped)
  private drawT = 0; // seconds left raising a freshly drawn weapon
  private drawTotal = 1; // full draw time (for the raise animation curve)
  private recoilDebtP = 0; // kick the arms still owe back to the aim point
  private recoilDebtY = 0;
  private speedNorm = 0; // 0..1 of sprint speed, feeds move spread + sway
  private timeS = 0; // controller clock (sway phase)
  private lastHpSeen = -1; // damage interrupts reloads
  private vel = new THREE.Vector3(); // horizontal velocity (smoothed)
  private vy = 0; // vertical velocity
  private grounded = true;
  private crouching = false;
  private landDip = 0; // camera dip on hard landing, decays
  private handAnchor!: THREE.Group; // right-hand weapon mount
  private handItemId: string | null = null;
  private handKey = ''; // itemId + finish — the hand mesh's build signature
  private smoothCamMinY = 0; // smoothed ground clearance — kills the hard-clamp snap
  private blockBlend = 0; // 0..1 block pose blend
  private swingTrail!: THREE.Mesh; // translucent arc that sells the swing
  private swingTotal = 0.28; // full swing duration (per weapon)
  private hitPunch = 0; // camera dolly punch on connect, decays
  firstPerson = false; // V toggles; body hides, camera rides at eye level
  private viewModel!: THREE.Group; // FP arm + weapon, parented to the camera
  private vmAnchor!: THREE.Group; // weapon mount inside the view model
  private headRef!: THREE.Mesh; // head, for walk bob
  private figureParts: THREE.Object3D[] = []; // avatar figure meshes (rebuilt on appearance/gear change)
  private figureSig = ''; // last figureSignature() the meshes were built from
  private smoothTarget = new THREE.Vector3(); // damped look target (TP)
  private smoothInit = false; // snap the camera once on teleport/respawn
  private fpEyeYSmooth = 0; // damped eye height (FP)
  leanAmt = 0; // current lean (-1 left .. +1 right), drives camera + shot origin
  zoomDist = 6.4; // third-person orbit distance (mouse wheel / mobile buttons)
  aimLevel = 0; // 0 hip, 1 shoulder-aim, 2 down-the-sights

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.muzzle = new THREE.PointLight(0xffd27a, 0, 14, 2);
    this.muzzle.position.set(0.4, 1.55, 0.6);
    this.group.add(this.muzzle);
    scene.add(this.group);
  }

  /** Everything the figure is wearing/looking like, as one cheap string —
   *  when it changes, the figure rebuilds. Polled in update(). */
  private figureSignature(): string {
    const s = useGameStore.getState();
    const a = s.appearance;
    const packIt = s.equipped.pack ? s.inventory.find((i) => i.uid === s.equipped.pack) : undefined;
    const vest = s.inventory.some((i) => i.itemId === 'armored_vest' && i.qty > 0) ? 1 : 0;
    const helm = s.inventory.some((i) => i.itemId === 'riot_helmet' && i.qty > 0) ? 1 : 0;
    return [
      s.bodyType, a.skinTone, a.hairStyle, a.hairColor, a.build,
      packIt?.itemId ?? '-', vest, helm,
    ].join('|');
  }

  private buildMesh(): void {
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    // Rotated +90° about X so the weapon's forward (+Z in mesh space) aligns
    // with the ARM's direction: blade/gun point where the arm points — down at
    // rest, forward when raised to aim, sweeping with the arm on a swing.
    // Created before the figure so buildFigure can mount it on the arm;
    // rebuilds re-mount the SAME anchor (and its weapon mesh) on the new arm.
    this.handAnchor = new THREE.Group();
    this.handAnchor.position.set(0, -0.7, 0.08);
    this.handAnchor.rotation.x = Math.PI / 2;
    this.buildFigure();
    this.figureSig = this.figureSignature();
    // swing trail: the equipped weapon's real hit zone, drawn at chest height —
    // inner 0.9m, outer = weapon range, arc = full swing wedge, centered on facing
    const trailGeo = new THREE.RingGeometry(0.9, 2.7, 24, 1, -Math.PI / 2 - 0.85, 1.7);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffe6b0, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.swingTrail = new THREE.Mesh(trailGeo, trailMat);
    this.swingTrail.rotation.x = -Math.PI / 2;
    this.swingTrail.position.y = 1.3;
    this.swingTrail.visible = false;
    this.swingTrail.renderOrder = 5;
    // attached to the group (not the rig) so it stays visible in first person
    this.group.add(this.swingTrail);
    // first-person view model: forearm + weapon floating bottom-right of the lens
    this.viewModel = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2e4a4e, roughness: 1 });
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.5, 8), armMat);
    forearm.rotation.x = Math.PI / 2 - 0.35;
    forearm.position.set(0, -0.08, -0.18);
    this.vmAnchor = new THREE.Group();
    this.vmAnchor.position.set(0, 0.02, -0.42);
    // hand meshes point +Z; the camera looks down -Z, so flip the mount or
    // the barrel points back at the player's face
    this.vmAnchor.rotation.y = Math.PI;
    this.viewModel.add(forearm, this.vmAnchor);
    this.viewModel.position.set(0.32, -0.3, -0.55);
    this.viewModel.visible = false;
  }

  /**
   * The avatar figure itself — WAVE 4 character design: built from the
   * store's appearance (skin tone, hair style/color, build) + bodyType,
   * with carried gear rendered ON the body: the equipped pack on the back
   * (sized by tier), an armored vest's bulk, a riot helmet's shell. The
   * same figure third-person shows is the one seated in every vehicle.
   * Rebuilt wholesale whenever figureSignature() changes.
   */
  private buildFigure(): void {
    const s = useGameStore.getState();
    const female = s.bodyType === 'female';
    const a = s.appearance;
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN_TONES[a.skinTone] ?? SKIN_TONES[2], roughness: 0.9,
    });
    const jacket = new THREE.MeshStandardMaterial({
      color: female ? 0x5a3a4e : 0x2e4a4e,
      roughness: 1,
    });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1 });
    const parts: THREE.Object3D[] = [];
    const add = (o: THREE.Object3D) => { parts.push(o); this.rig.add(o); return o; };
    // build: slim narrows the frame, heavy broadens it (rig scale carries width)
    const buildW = a.build === 'slim' ? 0.9 : a.build === 'heavy' ? 1.14 : 1;
    this.rig.scale.set(buildW, female ? 0.96 : 1, buildW);
    // female: slimmer shoulders/torso, fractionally shorter frame
    const torsoW = (female ? 0.52 : 0.62) * (a.build === 'heavy' ? 1.1 : a.build === 'slim' ? 0.92 : 1);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, 0.78, 0.32), jacket);
    torso.position.y = 1.18;
    torso.castShadow = true;
    add(torso);
    this.headRef = new THREE.Mesh(
      new THREE.BoxGeometry(female ? 0.3 : 0.34, 0.36, female ? 0.3 : 0.32),
      skin,
    );
    this.headRef.position.y = 1.78;
    this.headRef.castShadow = true;
    add(this.headRef);
    // ---- hair: the Character app's styles, in its colors ----
    const hairMat = new THREE.MeshStandardMaterial({
      color: HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0], roughness: 1,
    });
    if (a.hairStyle === 'crop' || a.hairStyle === 'long') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.35), hairMat);
      top.position.set(0, 1.99, -0.01);
      top.castShadow = true;
      add(top);
    }
    if (a.hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.1), hairMat);
      back.position.set(0, 1.7, -0.17);
      back.castShadow = true;
      add(back);
    }
    if (a.hairStyle === 'hawk') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.37), hairMat);
      strip.position.set(0, 2.02, -0.01);
      strip.castShadow = true;
      add(strip);
    }
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
    const shoulderW = female ? 0.36 : 0.42;
    this.armL = new THREE.Mesh(armGeo, jacket);
    this.armL.position.set(-shoulderW, 1.52, 0);
    this.armL.castShadow = true;
    this.armR = new THREE.Mesh(armGeo, jacket);
    this.armR.position.set(shoulderW, 1.52, 0);
    this.armR.castShadow = true;
    add(this.legL); add(this.legR); add(this.armL); add(this.armR);
    // the weapon mount rides the (possibly brand-new) right arm
    if (this.handAnchor) this.armR.add(this.handAnchor);
    // ---- worn gear renders on the body ----
    const packIt = s.equipped.pack ? s.inventory.find((i) => i.uid === s.equipped.pack) : undefined;
    if (packIt?.itemId === 'pack_t1' || packIt?.itemId === 'pack_t2') {
      const big = packIt.itemId === 'pack_t2';
      const packMat = new THREE.MeshStandardMaterial({ color: big ? 0x3a3f35 : 0x4a4438, roughness: 1 });
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(big ? 0.52 : 0.44, big ? 0.66 : 0.54, big ? 0.3 : 0.23),
        packMat,
      );
      pack.position.set(0, 1.26, -(0.16 + (big ? 0.15 : 0.115)));
      pack.castShadow = true;
      add(pack);
      if (big) {
        // a bedroll strapped across the top — the rigger pack reads expedition-grade
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(0, 1.66, -0.31);
        add(roll);
      }
    }
    if (s.inventory.some((i) => i.itemId === 'armored_vest' && i.qty > 0)) {
      // the vest's bulk over the torso + its front plate
      const kevlar = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.95 });
      const vest = new THREE.Mesh(new THREE.BoxGeometry(torsoW + 0.12, 0.6, 0.44), kevlar);
      vest.position.y = 1.22;
      vest.castShadow = true;
      add(vest);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x3d434b, roughness: 0.6, metalness: 0.4 }));
      plate.position.set(0, 1.22, 0.24);
      add(plate);
    }
    if (s.inventory.some((i) => i.itemId === 'riot_helmet' && i.qty > 0)) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x35322c, roughness: 0.7 }),
      );
      shell.position.y = 1.82;
      shell.castShadow = true;
      add(shell);
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.09, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.2, metalness: 0.4 }),
      );
      visor.position.set(0, 1.8, 0.18);
      add(visor);
    }
    this.figureParts = parts;
  }

  /** Swap the whole figure for a fresh build (appearance/gear changed). */
  private rebuildFigure(): void {
    for (const p of this.figureParts) this.rig.remove(p);
    this.figureParts = [];
    this.buildFigure();
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.smoothInit = false; // camera snaps to the new spot instead of flying there
    this.smoothCamMinY = 0;
  }

  private setFirstPerson(v: boolean, camera: THREE.PerspectiveCamera): void {
    this.firstPerson = v;
    this.rig.visible = !v;
    this.viewModel.visible = v;
    if (this.viewModel.parent === camera) camera.remove(this.viewModel);
    if (v) {
      camera.add(this.viewModel);
      // re-anchor the camera ground clearance when entering FP
      this.smoothCamMinY = 0;
    }
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

  /** Feedback for a projectile round that just landed (Game reports it —
   *  the hitmark, camera punch and kill XP mirror the hitscan path).
   *  Kill XP follows Lane 8's event table: a special-class kill pays
   *  special_kill, a headshot kill the headshot event, else the plain
   *  ranged award. */
  registerShotFeedback(killed: boolean, head: boolean, special = false): void {
    useGameStore.getState().setHitmark(killed ? 'kill' : head ? 'headshot' : 'hit');
    this.hitPunch = killed ? 0.3 : head ? 0.24 : 0.18;
    if (killed) {
      awardXpEvent(special ? 'special_kill' : head ? 'husk_kill_ranged_headshot' : 'husk_kill_ranged');
    }
  }

  /** Eye position + aim dir for hitscan (camera-driven). Leaning shifts the
   *  eye toward the peek side so shots clear the cover you're peeking from. */
  aim(camera: THREE.PerspectiveCamera): { eye: THREE.Vector3; dir: THREE.Vector3 } {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const eye = this.pos.clone().add(new THREE.Vector3(0, 1.82, 0));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    eye.addScaledVector(right, this.leanAmt * 0.75);
    return { eye, dir };
  }

  /** Keep the right-hand mesh in sync with what's actually equipped. */
  private syncHandWeapon(): void {
    const s = useGameStore.getState();
    const want = activeHandItemId(s.equipped, s.inventory);
    // wave 4: a refinished weapon rebuilds its mesh even when the item
    // itself didn't change — the sync key carries the instance's finish
    const activeInst = want
      ? (s.equipped.melee ? s.inventory.find((i) => i.uid === s.equipped.melee) : undefined)
        ?? (s.equipped.ranged ? s.inventory.find((i) => i.uid === s.equipped.ranged) : undefined)
      : undefined;
    const key = `${want ?? ''}|${activeInst?.finish ?? ''}`;
    if (key === this.handKey) return;
    this.handKey = key;
    this.handItemId = want;
    // a fresh weapon comes up at carry height: it takes its draw time to
    // be ready, and it cannot fire mid-draw
    this.drawTotal = drawTimeFor(want);
    this.drawT = this.drawTotal;
    // clear old meshes (third-person hand + first-person view model)
    for (const anchor of [this.handAnchor, this.vmAnchor]) {
      while (anchor.children.length > 0) anchor.remove(anchor.children[0]);
    }
    if (want) {
      const mesh = buildHandMesh(want, activeInst?.finish);
      // slight grip tilt so weapons read naturally in hand
      mesh.rotation.x = 0.15;
      this.handAnchor.add(mesh);
      // view-model variant points down the lens
      const vm = buildHandMesh(want, activeInst?.finish);
      vm.rotation.y = Math.PI; // hand meshes point +Z; the lens looks -Z
      this.vmAnchor.add(vm);
    }
  }

  update(dt: number, ctx: PlayerCtx): void {
    // appearance or worn gear changed → rebuild the figure to match
    const sig = this.figureSignature();
    if (sig !== this.figureSig) {
      this.figureSig = sig;
      this.rebuildFigure();
    }
    this.syncHandWeapon();
    this.timeS += dt;
    if (this.drawT > 0) this.drawT -= dt;
    this.bloom = bloomDecay(this.bloom, dt);
    // camera zoom (mobile held buttons; desktop wheel writes zoomDist directly)
    if (input.zoomIn) this.zoomDist = clamp(this.zoomDist - 5 * dt, 2.5, 9);
    if (input.zoomOut) this.zoomDist = clamp(this.zoomDist + 5 * dt, 2.5, 9);
    const fpLocked = DIFFICULTIES[useGameStore.getState().difficulty].firstPersonOnly;
    if (input.fpToggle) {
      // hardcore runs are first-person only — no third-person crutch
      if (fpLocked) {
        useGameStore.getState().addToast('Hardcore is first-person only.');
      } else {
        this.setFirstPerson(!this.firstPerson, ctx.camera);
        useGameStore.getState().addToast(this.firstPerson ? 'First person.' : 'Third person.');
      }
      sfx.play('ui', { volume: 0.4 });
    }
    if (fpLocked && !this.firstPerson) this.setFirstPerson(true, ctx.camera);
    const [ldxRaw, ldyRaw] = consumeLook();
    // clamp per-frame deltas: pointer-lock re-entry and browser quirks can
    // deliver one enormous stale delta, which reads as a rotation snap
    const ldx = clamp(ldxRaw, -90, 90);
    const ldy = clamp(ldyRaw, -90, 90);
    // touch drag-look arrives in pixels too; scale both the same
    this.camYaw -= ldx * 0.0026;
    // wrap yaw to [-PI, PI] — unbounded growth loses float precision and
    // makes sin/cos stutter after many full turns (the "gyro hit something" snap)
    while (this.camYaw > Math.PI) this.camYaw -= Math.PI * 2;
    while (this.camYaw < -Math.PI) this.camYaw += Math.PI * 2;
    this.camPitch = clamp(this.camPitch - ldy * 0.0022, -1.15, 0.55);

    // recoil recovery: the arms pull the muzzle back toward the point you
    // were holding — most of the kick settles, the rest is real climb.
    // Muscling the look yourself forgives most of what's owed.
    if (Math.abs(ldx) > 6 || Math.abs(ldy) > 6) {
      this.recoilDebtP *= 0.35;
      this.recoilDebtY *= 0.35;
    }
    if (this.recoilDebtP !== 0) {
      const r = recoveryStep(this.recoilDebtP, dt);
      this.camPitch = clamp(this.camPitch - r, -1.15, 0.55);
      this.recoilDebtP -= r;
    }
    if (this.recoilDebtY !== 0) {
      const r = recoveryStep(this.recoilDebtY, dt);
      this.camYaw -= r;
      this.recoilDebtY -= r;
      while (this.camYaw > Math.PI) this.camYaw -= Math.PI * 2;
      while (this.camYaw < -Math.PI) this.camYaw += Math.PI * 2;
    }

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
    // wading: shoreline ground below y=0 drags the stride (moveMath)
    const groundHere = ctx.groundY(this.pos.x, this.pos.z);
    const wade = wadeFactor(groundHere);
    const wantSprint = input.sprint && ctx.sprintAllowed && this.stamina > 1 && mz > 0.1 && !this.crouching;
    const sprinting = wantSprint && wishInput && !wadeBlocksSprint(groundHere);

    let speed = WALK_SPEED * ctx.speedMul * wade;
    if (sprinting) speed = SPRINT_SPEED * ctx.speedMul * wade;
    else if (this.crouching) speed = CROUCH_SPEED * ctx.speedMul * wade;

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
    // smooth accel toward wish velocity: eager launch, firmer stop,
    // firmest direction reversal; drifty in the air. Exp-damped, so
    // the feel is identical at any frame rate.
    const opposing = wishInput && (this.vel.x * wishX + this.vel.z * wishZ) < 0;
    const vk = expDamp(accelRate(this.grounded, wishInput, opposing), dt);
    this.vel.x = lerp(this.vel.x, wishX, vk);
    this.vel.z = lerp(this.vel.z, wishZ, vk);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // walls and furniture are solid
    resolveCollisions(this.pos, 0.45, ctx.colliders, this.pos.y);
    const moving = this.vel.length() > 0.6;
    this.speedNorm = clamp(this.vel.length() / SPRINT_SPEED, 0, 1);

    // jump (edge) + gravity; the heightmap is the ground
    if (input.jump && this.grounded && !this.crouching && !wadeBlocksJump(groundHere)) {
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
      const crouchDrop = lerp(this.rig.userData.crouchDrop ?? 0, this.crouching ? 0.42 : 0, expDamp(11, dt));
      this.rig.userData.crouchDrop = crouchDrop;
      this.rig.position.y = Math.abs(Math.cos(this.walkPhase)) * (sprinting ? 0.085 : 0.05) - crouchDrop;
      this.headRef.position.y = 1.78 + Math.abs(Math.cos(this.walkPhase)) * 0.028;
      this.leanF = lerp(this.leanF, sprinting ? 0.17 : this.crouching ? 0.22 : 0.05, expDamp(7, dt));
      this.leanS = lerp(this.leanS, -mx * 0.07, expDamp(7, dt));
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
      const crouchDrop = lerp(this.rig.userData.crouchDrop ?? 0, this.crouching ? 0.42 : 0, expDamp(11, dt));
      this.rig.userData.crouchDrop = crouchDrop;
      this.rig.position.y = Math.sin(this.idleT * 2.1) * 0.015 - crouchDrop;
      this.headRef.position.y = 1.78 + Math.sin(this.idleT * 2.1) * 0.008;
      this.leanF = lerp(this.leanF, this.crouching ? 0.22 : 0, expDamp(7, dt));
      this.leanS = lerp(this.leanS, 0, expDamp(7, dt));
      this.rig.rotation.x = this.leanF;
      this.rig.rotation.z = this.leanS;
      this.legL.rotation.x *= 0.9;
      this.legR.rotation.x *= 0.9;
      this.armL.rotation.x *= 0.9;
      this.armR.rotation.x *= 0.9;
    }

    // stamina
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 9 * dt);
    } else {
      const regen = moving ? 4.5 : 10;
      this.stamina = Math.min(100, this.stamina + regen * dt);
    }

    // lean state: Q/E held (or mobile buttons) — computed before combat so
    // shots and swings originate from the peeked position
    {
      const leanDir = (input.leanLeft ? -1 : 0) + (input.leanRight ? 1 : 0);
      this.leanAmt = lerp(this.leanAmt, leanDir, Math.min(1, dt * 12));
      if (Math.abs(this.leanAmt) < 0.001 && leanDir === 0) this.leanAmt = 0;
    }

    // in first person the body follows the camera — swings go where you look.
    // Aiming in third person does the same: you point where you look.
    if (this.firstPerson) {
      this.yaw = this.camYaw;
      this.group.rotation.y = this.camYaw;
    }
    // right click with a gun cycles hip -> shoulder aim -> sights
    const hasRangedNow = useGameStore.getState().equipped.ranged != null;
    if (input.aimTap && hasRangedNow) {
      this.aimLevel = (this.aimLevel + 1) % 3;
      if (this.aimLevel === 1) useGameStore.getState().addToast('Aiming — right-click again for sights.');
      sfx.play('ui', { volume: 0.3 });
    }
    if (!hasRangedNow) this.aimLevel = 0;
    if (this.aimLevel > 0) {
      this.yaw = this.camYaw;
      this.group.rotation.y = this.camYaw;
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
      const k = 1 - Math.max(this.attackT, 0) / this.swingTotal; // 0..1 across the swing
      this.armR.rotation.x = -2.3 + k * 3.1; // raise, then chop down
      this.rig.rotation.y = Math.sin(k * Math.PI) * 0.22;
      // trail arc: sweep across the swing, fade out
      this.swingTrail.visible = true;
      const mat = this.swingTrail.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.42 * (this.attackT / this.swingTotal);
    } else {
      this.rig.rotation.y *= 0.8;
      this.armR.rotation.y *= 0.9; // release the block pose's cross-body angle
      if (this.swingTrail.visible && this.attackT <= 0) this.swingTrail.visible = false;
    }
    if (this.recoilT > 0) {
      this.recoilT -= dt;
      const k = Math.max(this.recoilT, 0) / 0.16;
      this.armR.rotation.x = -1.2 - k * 0.35; // arm up, kicked back
      this.rig.rotation.y *= 0.8;
    }

    // gun carry/aim pose: shoulder the ranged weapon with both hands — off-hand
    // supports the grip, barrel follows the arm now that the mount is fixed.
    // Lowered to a low ready while sprinting; shouldered while aiming.
    {
      const rangedNow = useGameStore.getState().equipped.ranged != null;
      const posing = rangedNow && this.attackT <= 0 && this.blockBlend < 0.5 && this.recoilT <= 0;
      if (posing && (!sprinting || this.aimLevel > 0)) {
        const aimX = this.aimLevel > 0 ? -1.52 : -1.2;
        this.armR.rotation.x = lerp(this.armR.rotation.x, aimX, Math.min(1, dt * 10));
        this.armL.rotation.x = lerp(this.armL.rotation.x, -1.1, Math.min(1, dt * 8));
        this.armL.rotation.y = lerp(this.armL.rotation.y, 0.5, Math.min(1, dt * 8));
      } else {
        this.armL.rotation.y = lerp(this.armL.rotation.y, 0, Math.min(1, dt * 8));
      }
    }

    // torso counter-twist: shoulders roll against the gait while walking —
    // classic procedural touch that sells weight better than limbs alone
    if (moving && this.attackT <= 0 && this.blockBlend < 0.5) {
      this.rig.rotation.y = Math.sin(this.walkPhase) * 0.09;
    }

    // --- aim blend: the gun comes up over adsTime seconds, not in a step.
    // A reflex sight snaps it up; a bare scope takes its time. ---
    {
      const s = useGameStore.getState();
      const rInst = s.equipped.ranged ? s.inventory.find((i) => i.uid === s.equipped.ranged) : undefined;
      const rDef = rInst ? ITEMS[rInst.itemId] : undefined;
      const target = !rDef ? 0 : this.aimLevel === 2 ? 1 : this.aimLevel === 1 ? 0.55 : 0;
      const t = Math.max(0.05, (rDef?.adsTime ?? 0.25) * modAdsTimeMult(rInst?.mods ?? []));
      const step = dt / t;
      this.adsBlend += clamp(target - this.adsBlend, -step, step);
    }

    // --- reload (R): timed; rounds move from the pack into the magazine.
    // Honest state: rounds only move on completion, so an interruption —
    // sprinting off, taking a hit, swapping the weapon — loses nothing
    // but the time. ---
    {
      const s = useGameStore.getState();
      const rInst = s.equipped.ranged ? s.inventory.find((i) => i.uid === s.equipped.ranged) : undefined;
      const rDef = rInst ? ITEMS[rInst.itemId] : undefined;
      const hpNow = s.hp;
      const hpDropped = this.lastHpSeen >= 0 && hpNow < this.lastHpSeen - 0.01;
      this.lastHpSeen = hpNow;
      // working a jam clear takes both hands and 1.2s — the same things
      // that break a reload break it, and the gun stays jammed
      if (this.clearT > 0) {
        const swapped = this.clearUid !== (s.equipped.ranged ?? null);
        if (swapped || (wantSprint && wishInput) || hpDropped) {
          this.clearT = 0;
          this.clearUid = null;
          if (!swapped) s.addToast('Still jammed.');
        } else {
          this.clearT -= dt;
          if (this.clearT <= 0 && this.clearUid) {
            s.setJammed(this.clearUid, false);
            this.clearUid = null;
            sfx.play('craft', { volume: 0.7 });
            ctx.emitNoise(this.pos.x, this.pos.z, 8); // working the action is not silent
            s.addToast('Jam cleared.');
          }
        }
      }
      if (this.reloadT > 0) {
        const swapped = this.reloadUid !== (s.equipped.ranged ?? null);
        const sprinted = wantSprint && wishInput;
        if (swapped || sprinted || hpDropped) {
          this.reloadT = 0;
          this.reloadUid = null;
          if (!swapped) s.addToast('Reload interrupted.');
        } else {
          this.reloadT -= dt;
          if (this.reloadT <= 0 && rInst && rDef?.magSize != null && rDef.ammoId) {
            const cap = magSizeOf(rDef.magSize, rInst.mods ?? []);
            const need = cap - (rInst.loaded ?? 0);
            let moved = 0;
            while (moved < need) {
              const stack = [...useGameStore.getState().inventory]
                .reverse()
                .find((i) => i.itemId === rDef.ammoId && i.qty > 0);
              if (!stack) break;
              const take = Math.min(stack.qty, need - moved);
              useGameStore.getState().removeItem(stack.uid, take);
              moved += take;
            }
            if (moved > 0) {
              useGameStore.getState().setLoaded(rInst.uid, (rInst.loaded ?? 0) + moved);
              sfx.play('ui', { volume: 0.5 });
            }
            this.reloadUid = null;
          }
        }
      } else if (input.refuel && rInst && rInst.jammed && this.clearT <= 0) {
        // R on a jammed gun works the action, it does not reload
        this.clearT = 1.2;
        this.clearUid = rInst.uid;
        sfx.play('ui', { volume: 0.35 });
        input.refuel = false;
      } else if (input.refuel && rInst && rDef?.magSize != null && rDef.ammoId) {
        const cap = magSizeOf(rDef.magSize, rInst.mods ?? []);
        if ((rInst.loaded ?? 0) < cap && s.inventory.some((i) => i.itemId === rDef.ammoId && i.qty > 0)) {
          this.reloadT = rDef.reloadSec ?? 1.8;
          this.reloadUid = rInst.uid;
          sfx.play('ui', { volume: 0.35 });
          input.refuel = false;
        }
      }
    }

    // --- attacks (blocked while guarding or mid-draw) ---
    if (input.attackMelee && this.meleeCd <= 0 && this.blockBlend < 0.5 && this.drawT <= 0) {
      // leaning shifts the swing origin: you can hook a swing around a corner
      const camRight = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const swingOrigin = this.pos.clone().addScaledVector(camRight, this.leanAmt * 0.55);
      const res = tryMelee({
        husks: ctx.husks,
        emitNoise: ctx.emitNoise,
        playerPos: swingOrigin,
        playerYaw: this.yaw,
        aimDir: new THREE.Vector3(),
        eyePos: new THREE.Vector3(),
        spendStamina: (n) => this.spendStamina(n),
        flashMuzzle: () => undefined,
        aimLevel: this.aimLevel,
        onThrow: ctx.onThrow,
      });
      if (res.swung) {
        this.swingTotal = res.stats.swingTime;
        this.meleeCd = res.stats.swingTime + 0.16;
        this.attackT = res.stats.swingTime; // swing the arm — weapon or bare fist
        // rebuild the trail to this weapon's exact sweep wedge (range × arc),
        // shifted toward the lean like the swing origin is
        this.swingTrail.geometry.dispose();
        this.swingTrail.geometry = new THREE.RingGeometry(
          0.9, res.stats.range, 24, 1,
          -Math.PI / 2 - res.stats.halfArcRad, res.stats.halfArcRad * 2,
        );
        this.swingTrail.position.x = this.leanAmt * 0.55;
        // the same swing can take down fleeing wildlife
        const animalHits = ctx.animals.damageInArc(
          this.pos, this.yaw, res.stats.range, res.stats.halfArcRad,
          res.stats.damage, (kill) => ctx.onAnimalKill(kill),
        );
        const anyHit = res.hits > 0 || animalHits > 0;
        if (anyHit) {
          // impact feel: brief freeze-frame + camera punch + hitmark
          getGame()?.requestHitstop(res.kills > 0 ? 0.09 : 0.055);
          this.hitPunch = res.kills > 0 ? 0.34 : 0.22;
          useGameStore.getState().setHitmark(res.kills > 0 ? 'kill' : 'hit');
        }
        if (res.kills > 0) {
          // Lane 8 events: plain melee kills pay husk_kill_melee each;
          // special-class kills pay special_kill instead
          const plain = res.kills - res.specialKills;
          if (plain > 0) awardXpEvent('husk_kill_melee', plain);
          if (res.specialKills > 0) awardXpEvent('special_kill', res.specialKills);
        }
      }
    }
    const rangedEquipped = equippedRangedDef();
    const wantFire =
      input.attackRanged || (rangedEquipped?.fireMode === 'auto' && input.attackHeld);
    if (wantFire && this.rangedCd <= 0 && this.blockBlend < 0.5 && this.drawT <= 0) {
      const rdef = rangedEquipped;
      this.rangedCd = rdef?.cooldown ?? 0.4;
      this.recoilT = 0.16;
      const { eye, dir } = this.aim(ctx.camera);
      const sway = rdef
        ? swayOffset(this.timeS, rdef.sway ?? 0, this.stamina, this.crouching, this.aimLevel)
        : { x: 0, y: 0 };
      const fired = tryRanged({
        husks: ctx.husks,
        emitNoise: ctx.emitNoise,
        playerPos: this.pos,
        playerYaw: this.yaw,
        aimDir: dir,
        eyePos: eye,
        spendStamina: (n) => this.spendStamina(n),
        flashMuzzle: () => this.flashMuzzle(),
        aimLevel: this.aimLevel,
        groundY: ctx.groundY,
        onProjectile: ctx.onProjectile,
        adsBlend: this.adsBlend,
        bloom: this.bloom,
        moveSpeedNorm: this.speedNorm,
        sway: { x: sway.x * this.adsBlend, y: sway.y * this.adsBlend },
        fx: ctx.fx
          ? {
              impact: (p, kind, damage, head) =>
                kind === 'flesh' ? ctx.fx!.impactFlesh(p, damage, head) : ctx.fx!.impactDust(p),
              tracer: (from, to) => ctx.fx!.tracer(from, to),
            }
          : undefined,
      });
      if (fired.fired && rdef) {
        // the kick is real camera motion: climb now, settle most of it
        // back over the next half-second (recovery runs by the look code)
        const sNow = useGameStore.getState();
        const rInst = sNow.equipped.ranged
          ? sNow.inventory.find((i) => i.uid === sNow.equipped.ranged)
          : undefined;
        const kick = kickFor(
          rdef.recoil ?? 0.012, rdef.recoilDrift ?? 0.004,
          this.adsBlend, this.crouching, modRecoilMult(rInst?.mods ?? []), Math.random,
        );
        this.camPitch = clamp(this.camPitch + kick.pitch, -1.15, 0.55);
        this.camYaw += kick.yaw;
        this.recoilDebtP += kick.pitch * RECOIL_RECOVERABLE;
        this.recoilDebtY += kick.yaw * 0.4;
        this.bloom = bloomAdd(this.bloom, rdef.bloomPerShot ?? 0.1);
        // firing mid-reload abandons it — the mag never got swapped
        if (this.reloadT > 0) {
          this.reloadT = 0;
          this.reloadUid = null;
        }
      }
      if (fired.fired) {
        // muzzle smoke + a kicked-out casing: the shot leaves evidence
        if (ctx.fx) {
          const muzzlePos = new THREE.Vector3();
          this.muzzle.getWorldPosition(muzzlePos);
          ctx.fx.muzzleSmoke(muzzlePos, dir);
          if (rdef && (rdef.fireMode === 'semi' || rdef.fireMode === 'auto')) {
            const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
            ctx.fx.brass(eye.clone().addScaledVector(dir, 0.3), right);
          }
        }
        if (fired.hit) {
          useGameStore.getState().setHitmark(
            fired.killed ? 'kill' : fired.headshot ? 'headshot' : 'hit',
          );
          this.hitPunch = fired.killed ? 0.3 : fired.headshot ? 0.24 : 0.18;
          if (fired.killed) {
            awardXpEvent(
              fired.special ? 'special_kill' : fired.headshot ? 'husk_kill_ranged_headshot' : 'husk_kill_ranged',
            );
          }
        } else if (!fired.projectile) {
          // a miss can still drop a rabbit or deer downrange (hitscan only —
          // projectile rounds report their own verdict when they land)
          const rdef2 = equippedRangedDef();
          ctx.animals.raycastShot(eye, dir, rdef2?.range ?? 45, rdef2?.damage ?? 20, (kill) =>
            ctx.onAnimalKill(kill),
          );
        }
      }
    }

    // --- crosshair state: is a husk or animal inside the current weapon's reach? ---
    {
      const stats = meleeStatsFor(equippedMeleeId());
      const inRange =
        ctx.husks.meleeSweep(this.pos, this.yaw, stats.range + 0.4, stats.halfArcRad, 1).length > 0 ||
        ctx.animals.queryArc(this.pos, this.yaw, stats.range + 0.4, stats.halfArcRad);
      const st = useGameStore.getState();
      if (st.meleeTarget !== inRange) st.setMeleeTarget(inRange);
    }

    // --- camera ---
    const cam = ctx.camera;
    const cp = Math.cos(this.camPitch);
    const leanAmt = this.leanAmt;

    if (this.firstPerson || this.aimLevel === 2) {
      // eye-level lens; x/z stay glued to the body, only height is damped.
      // Down-the-sights from third person borrows the same rig.
      if (this.aimLevel === 2 && !this.firstPerson) {
        if (this.viewModel.parent !== ctx.camera) ctx.camera.add(this.viewModel);
        this.viewModel.visible = true;
        this.rig.visible = false;
      }
      this.updateViewModel(dt, leanAmt);
      const eyeH = (this.crouching ? 1.2 : 1.82) - this.landDip;
      if (this.fpEyeYSmooth === 0) this.fpEyeYSmooth = this.pos.y + eyeH;
      this.fpEyeYSmooth = lerp(this.fpEyeYSmooth, this.pos.y + eyeH, Math.min(1, dt * 20));
      const eye = new THREE.Vector3(this.pos.x, this.fpEyeYSmooth, this.pos.z);
      const fwd = new THREE.Vector3(
        Math.sin(this.camYaw) * cp,
        Math.sin(this.camPitch),
        Math.cos(this.camYaw) * cp,
      );
      const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      eye.addScaledVector(right, leanAmt * 0.55);
      const minY = ctx.groundY(eye.x, eye.z) + 0.55;
      if (eye.y < minY) eye.y = minY;
      cam.position.copy(eye);
      cam.lookAt(eye.clone().addScaledVector(fwd, 3));
      cam.rotateZ(-leanAmt * 0.28);
    } else {
      // back in third person: detach the sights rig
      if (this.viewModel.parent === ctx.camera) ctx.camera.remove(this.viewModel);
      this.viewModel.visible = false;
      this.rig.visible = true;
      const camH = (this.crouching ? 1.35 : 1.9) - this.landDip;
      const target = new THREE.Vector3(this.pos.x, this.pos.y + camH, this.pos.z);
      // shift the target sideways along the camera's right vector so the lean peeks around cover
      const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      // shoulder aim: pull over the right shoulder, tighten the camera in
      const shoulderAim = this.aimLevel === 1;
      target.addScaledVector(right, leanAmt * 1.05 + (shoulderAim ? 0.5 : 0));
      // damped look target: collision push-outs and terrain jitter must not
      // snap the view — aim rides on the smoothed point, not the raw position
      if (!this.smoothInit) {
        this.smoothTarget.copy(target);
        this.smoothInit = true;
      }
      this.smoothTarget.lerp(target, Math.min(1, dt * 22));
      const dist = shoulderAim ? Math.min(this.zoomDist, 2.4) : this.zoomDist;
      const off = new THREE.Vector3(
        -Math.sin(this.camYaw) * cp,
        -Math.sin(this.camPitch),
        -Math.cos(this.camYaw) * cp,
      ).multiplyScalar(dist);
      const camPos = this.smoothTarget.clone().add(off);
      // smoothed ground clearance: the hard clamp snapped when the camera
      // swung over a hill or rock edge — ride over it instead
      const targetMinY = ctx.groundY(camPos.x, camPos.z) + 0.5;
      if (this.smoothCamMinY === 0) this.smoothCamMinY = targetMinY;
      this.smoothCamMinY = lerp(this.smoothCamMinY, targetMinY, Math.min(1, dt * 6));
      if (camPos.y < this.smoothCamMinY) camPos.y = this.smoothCamMinY;
      // impact punch: the camera jolts toward the player on every connect
      this.hitPunch = lerp(this.hitPunch, 0, Math.min(1, dt * 10));
      if (this.hitPunch > 0.001) {
        const punchDir = this.smoothTarget.clone().sub(camPos).normalize();
        camPos.addScaledVector(punchDir, this.hitPunch * 1.4);
      }
      cam.position.lerp(camPos, Math.min(1, dt * 18));
      cam.lookAt(this.smoothTarget);
      cam.rotateZ(-leanAmt * 0.32); // roll the view with the lean
    }

    // sight picture: field of view narrows as you go down the sights;
    // a full sprint kicks it wider — speed you can feel
    const speedNorm = clamp(Math.hypot(this.vel.x, this.vel.z) / SPRINT_SPEED, 0, 1);
    const wantFov = this.aimLevel === 2 ? 38 : this.aimLevel === 1 ? 52 : 60 + (sprinting ? sprintFovKick(speedNorm) : 0);
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov = lerp(cam.fov, wantFov, Math.min(1, dt * 10));
      cam.updateProjectionMatrix();
    }
  }

  /**
   * Driving rig: the player rides the vehicle — position glued to it, body
   * hidden, chase camera with free look. Call instead of update() while driving.
   */
  driveUpdate(
    dt: number,
    ctx: PlayerCtx,
    tx: number,
    ty: number,
    tz: number,
    camDist: number,
    seat?: { kind: string; id: string; length: number; width: number; heading: number },
  ): void {
    // V in the driver's seat: chase cam <-> driver's-eye first person
    if (input.fpToggle) {
      this.setFirstPerson(!this.firstPerson, ctx.camera);
      input.fpToggle = false;
    }
    if (this.viewModel.parent === ctx.camera) ctx.camera.remove(this.viewModel);
    this.viewModel.visible = false;
    this.swingTrail.visible = false;
    this.pos.x = tx;
    this.pos.z = tz;
    this.pos.y = ty;
    // the driver is IN the vehicle: visible and seated in third person,
    // hidden in first person (you ARE the driver). Seat locals are
    // computed either way — the first-person camera sits at the head.
    let eyeX = 0;
    let eyeY = 0;
    let eyeZ = 0;
    if (seat) {
      this.group.visible = !this.firstPerson;
      const W = seat.width;
      const L = seat.length;
      let lx = 0;
      let lz = 0;
      let gy = 0; // group-origin height offset (feet), per vehicle
      let armReach = -0.55;
      switch (seat.kind) {
        case 'bike':
        case 'moto':
          lz = -0.3; gy = 0.18; armReach = -0.7;
          break;
        case 'atv':
          lz = -0.05; gy = 0.24; armReach = -0.65;
          break;
        case 'skiff':
          lx = 0.3; lz = -0.6; gy = -0.22;
          if (seat.id === 'tug') { lx = 0.35; lz = 1.15; gy = 0.35; } // at the helm, head in the glass band
          break;
        case 'heli':
          // pilot seats, modeled per airframe — head inside the glass
          if (seat.id === 'seahawk') { lx = 0.55; lz = 3.55; gy = -0.32; }
          else if (seat.id === 'cargo_bob') { lx = 0.6; lz = 5.75; gy = -0.18; }
          else { lx = 0.3; lz = 1.05; gy = -0.42; } // little bird, in the bubble
          break;
        default: {
          lx = W * 0.21; // driver's seat, left-hand drive (+X = vehicle left)
          const cabForward = seat.id === 'van' || seat.id === 'v03_hauler' || seat.id === 'boxtruck' || seat.id === 'semi' || seat.id === 'semi_day' || seat.id === 'sprinter' || seat.id === 'goliath';
          lz = cabForward ? L * 0.24 : L * 0.03;
          // group origin is at the avatar's FEET and the avatar stands
          // 1.96m tall — sink the body so the head lands in the glass
          // band, not through the roof (per-vehicle roof heights)
          gy = ({
            semi: 0.28, semi_day: 0.28, boxtruck: 0.24, van: 0.0, v03_hauler: 0.0, sprinter: 0.06, goliath: 0.12, tank: 0.55,
            f250: 0.12, pickup: 0.06, bronco: 0.06, mustang: -0.66, marsh_buggy: 0.0, sedan: -0.14,
          } as Record<string, number>)[seat.id] ?? -0.66;
        }
      }
      const c = Math.cos(seat.heading);
      const s = Math.sin(seat.heading);
      this.group.position.set(tx + lx * c + lz * s, ty + gy, tz - lx * s + lz * c);
      this.group.rotation.y = seat.heading;
      // driver's eye: head position, a touch forward of the seat point
      eyeX = tx + lx * c + (lz + 0.12) * s;
      eyeY = ty + gy + 1.84;
      eyeZ = tz - lx * s + (lz + 0.12) * c;
      // seated pose: thighs forward, hands to the wheel/bars
      this.legL.rotation.x = -1.25;
      this.legR.rotation.x = -1.25;
      this.armL.rotation.x = armReach;
      this.armR.rotation.x = armReach;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
    } else {
      this.group.visible = false;
    }
    const [ldxRaw, ldyRaw] = consumeLook();
    const ldx = clamp(ldxRaw, -90, 90);
    const ldy = clamp(ldyRaw, -90, 90);
    this.camYaw -= ldx * 0.0026;
    while (this.camYaw > Math.PI) this.camYaw -= Math.PI * 2;
    while (this.camYaw < -Math.PI) this.camYaw += Math.PI * 2;
    this.camPitch = clamp(this.camPitch - ldy * 0.0022, -0.9, 0.4);
    const cam = ctx.camera;
    const cp = Math.cos(this.camPitch);
    if (this.firstPerson && seat) {
      // DRIVER'S EYE: the camera is your head — over the dash, wheel in
      // view, free look on the mouse. FOV opens up a touch for the cab.
      cam.position.set(eyeX, eyeY, eyeZ);
      const fwd = new THREE.Vector3(
        Math.sin(this.camYaw) * cp,
        Math.sin(this.camPitch),
        Math.cos(this.camYaw) * cp,
      );
      cam.lookAt(eyeX + fwd.x * 3, eyeY + fwd.y * 3, eyeZ + fwd.z * 3);
      if (Math.abs(cam.fov - 66) > 0.05) {
        cam.fov = lerp(cam.fov, 66, Math.min(1, dt * 8));
        cam.updateProjectionMatrix();
      }
      return;
    }
    const target = new THREE.Vector3(tx, ty + 1.9, tz);
    if (!this.smoothInit) {
      this.smoothTarget.copy(target);
      this.smoothInit = true;
    }
    this.smoothTarget.lerp(target, Math.min(1, dt * 22));
    const dist = Math.max(this.zoomDist, camDist);
    const off = new THREE.Vector3(
      -Math.sin(this.camYaw) * cp,
      -Math.sin(this.camPitch),
      -Math.cos(this.camYaw) * cp,
    ).multiplyScalar(dist);
    const camPos = this.smoothTarget.clone().add(off);
    const minY = ctx.groundY(camPos.x, camPos.z) + 0.6;
    if (camPos.y < minY) camPos.y = minY;
    cam.position.lerp(camPos, Math.min(1, dt * 18));
    cam.lookAt(this.smoothTarget);
    if (Math.abs(cam.fov - 62) > 0.05) {
      cam.fov = lerp(cam.fov, 62, Math.min(1, dt * 8));
      cam.updateProjectionMatrix();
    }
  }

  /** Restore the on-foot body after exiting a vehicle. */
  endDrive(): void {
    this.group.visible = true;
    // stand back up: clear the seated pose
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.armL.rotation.x = 0;
    this.armR.rotation.x = 0;
    this.armL.rotation.z = 0;
    this.armR.rotation.z = 0;
  }

  /** Vehicles drive from the chase camera: force the mode from outside. */
  forceFirstPerson(v: boolean, camera: THREE.PerspectiveCamera): void {
    this.setFirstPerson(v, camera);
  }

  /** First-person arm: bob, swing thrust, and block guard. */
  private updateViewModel(dt: number, leanAmt: number): void {
    const vm = this.viewModel;
    // draw raise: a freshly swapped weapon starts dipped at carry height
    // and climbs to ready over its draw time (firing is gated meanwhile)
    const dip = this.drawT > 0 ? (this.drawT / this.drawTotal) ** 2 : 0;
    this.vmAnchor.position.y = -dip * 0.32;
    this.vmAnchor.rotation.x = dip * 0.65;
    const bob = Math.abs(Math.cos(this.walkPhase)) * 0.018;
    if (this.aimLevel === 2) {
      // down the sights: gun centered, steady, no bob or swing theatrics
      vm.position.set(
        lerp(vm.position.x, -0.02, Math.min(1, dt * 14)),
        lerp(vm.position.y, -0.185, Math.min(1, dt * 14)),
        lerp(vm.position.z, -0.5, Math.min(1, dt * 14)),
      );
      vm.rotation.x = lerp(vm.rotation.x, 0, Math.min(1, dt * 14));
      vm.rotation.z = lerp(vm.rotation.z, 0, Math.min(1, dt * 14));
      return;
    }
    if (this.attackT > 0) {
      const k = 1 - Math.max(this.attackT, 0) / this.swingTotal;
      vm.rotation.x = -0.55 + k * 1.15;
      vm.position.set(0.32 - leanAmt * 0.1, -0.3 + bob, -0.55 - Math.sin(k * Math.PI) * 0.14);
    } else if (this.blockBlend > 0.02) {
      vm.position.set(
        lerp(vm.position.x, 0.08, Math.min(1, dt * 12)),
        lerp(vm.position.y, -0.27, Math.min(1, dt * 12)),
        -0.5,
      );
      vm.rotation.z = lerp(vm.rotation.z, 0.55, Math.min(1, dt * 12));
      vm.rotation.x = lerp(vm.rotation.x, -0.15, Math.min(1, dt * 12));
    } else {
      vm.rotation.x = lerp(vm.rotation.x, 0, Math.min(1, dt * 10));
      vm.rotation.z = lerp(vm.rotation.z, 0, Math.min(1, dt * 10));
      vm.position.set(0.32 - leanAmt * 0.12, -0.3 + bob, -0.55);
    }
  }
}
