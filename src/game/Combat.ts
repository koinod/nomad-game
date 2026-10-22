// Combat.ts — melee + pistol hit resolution. Called from the player controller.

import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import { walkCarried } from '../store/containers';
import { sfx, gunClassForItem } from '../systems/audio';
import type { HuskManager } from './Husks';
import { modSpreadMult } from '../data/mods';
import { bloomSpread, convergedDir, moveSpread, rangeFalloff, rayGroundDistance, sightFor, sightSpreadMult } from './gunMath';
import { gunshotRadius, noiseClassRadius } from './noise';
import {
  applyWear, armorMult, conditionDamageMult, rollJam, WEAR_PER_SHOT, WEAR_PER_SWING,
} from './gunMath';
import { AMBIENT_SPECIALS } from './huskMath';
import { cleaveBonus, meleeDamageMult } from '../systems/perkEffects';

/** Special-class husks (Lane 8 §6.1: their kills pay the special_kill XP
 *  event instead of the standard melee/ranged award). */
export function isSpecialKind(kind: string): boolean {
  return (AMBIENT_SPECIALS as readonly string[]).includes(kind);
}

export interface CombatFx {
  impact: (p: THREE.Vector3, kind: 'flesh' | 'dust', damage: number, head: boolean) => void;
  tracer: (from: THREE.Vector3, to: THREE.Vector3) => void;
}

export interface CombatHooks {
  husks: HuskManager;
  emitNoise: (x: number, z: number, radius: number) => void;
  playerPos: THREE.Vector3;
  playerYaw: number;
  aimDir: THREE.Vector3; // camera forward, normalized
  eyePos: THREE.Vector3; // muzzle origin
  flashMuzzle: () => void;
  aimLevel: number; // 0 = hip, 1 = shoulder, 2 = down sights — drives the accuracy cone
  onThrow?: (itemId: string) => void; // grenades: hand off to Game's projectile sim
  groundY?: (x: number, z: number) => number; // tracer endpoints + dust on misses
  fx?: CombatFx; // impact puffs + tracers (Game-owned Fx, optional in tests)
  onProjectile?: ( // true projectiles for the long guns (Game-owned sim)
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    shot: { damage: number; pen: number; weaponId: string },
  ) => void;
  adsBlend?: number; // 0 hip .. 0.55 shoulder .. 1 sights — eased aim state
  bloom?: number; // 0..1 sustained-fire bloom (Player-owned)
  moveSpeedNorm?: number; // 0..1 of sprint speed — firing on the move
  sway?: { x: number; y: number }; // ADS sway offset, radians on right/up axes
  camRay?: { origin: THREE.Vector3; dir: THREE.Vector3 }; // Item 6: the TRUE crosshair ray (camera)
  convDist?: number; // Item 6: crosshair's world distance along camRay (Player-measured)
  muzzlePos?: THREE.Vector3; // Item 6: visible barrel tip — tracers/projectiles start here
}

/**
 * Per-weapon melee feel AND timing (Ian 2026-10-22: "timing for melee
 * weapons"). Every weapon carries an explicit TIMING PROFILE —
 * windup (raise, no hit yet) → active (the sweep resolves) → recovery
 * (follow-through; the next swing cannot start until it ends). The
 * SwingTimer state machine below enforces the profile; the old model
 * (hits resolve on the click, cadence = one global swingTime + 0.16)
 * is gone. swingTime is always windup + active + recovery — the full
 * cycle the anim runs. Swings cost NO stamina (Ian, same pass): the
 * stamina economy is sprint + jump only.
 */
export interface MeleeStats {
  damage: number;
  range: number;      // meters
  halfArcRad: number; // half-angle of the swing cone
  windup: number;     // seconds from swing start to the active window
  active: number;     // seconds the sweep is live (hits resolve at its start)
  recovery: number;   // seconds of follow-through before the next swing
  swingTime: number;  // windup + active + recovery (full cycle / anim)
  knockback: number;
  cleave: number;     // max husks hit per swing
}

type MeleeCore = Omit<MeleeStats, 'swingTime'>;
function profiled(core: MeleeCore): MeleeStats {
  return { ...core, swingTime: core.windup + core.active + core.recovery };
}

const MELEE_STATS: Record<string, MeleeStats> = {
  //            dmg  rng  arc   wind  act   rec   kb    cleave
  pipe:         profiled({ damage: 14, range: 3.1, halfArcRad: 0.75, windup: 0.16, active: 0.12, recovery: 0.24, knockback: 4.2, cleave: 3 }),
  machete:      profiled({ damage: 22, range: 2.9, halfArcRad: 0.62, windup: 0.11, active: 0.11, recovery: 0.18, knockback: 2.4, cleave: 2 }),
  hatchet:      profiled({ damage: 18, range: 2.8, halfArcRad: 0.55, windup: 0.13, active: 0.11, recovery: 0.20, knockback: 3.0, cleave: 2 }),
  baseball_bat: profiled({ damage: 16, range: 3.0, halfArcRad: 0.70, windup: 0.15, active: 0.12, recovery: 0.23, knockback: 3.8, cleave: 3 }),
  combat_knife: profiled({ damage: 15, range: 2.5, halfArcRad: 0.45, windup: 0.07, active: 0.08, recovery: 0.12, knockback: 1.2, cleave: 1 }),
  sledgehammer: profiled({ damage: 30, range: 2.9, halfArcRad: 0.60, windup: 0.24, active: 0.14, recovery: 0.34, knockback: 5.5, cleave: 2 }),
  torch:        profiled({ damage: 6,  range: 2.7, halfArcRad: 0.60, windup: 0.13, active: 0.11, recovery: 0.20, knockback: 2.0, cleave: 2 }),
  flare:        profiled({ damage: 4,  range: 2.5, halfArcRad: 0.55, windup: 0.11, active: 0.10, recovery: 0.19, knockback: 1.6, cleave: 1 }),
  crowbar:      profiled({ damage: 17, range: 2.9, halfArcRad: 0.60, windup: 0.13, active: 0.11, recovery: 0.19, knockback: 3.4, cleave: 2 }),
  fire_axe:     profiled({ damage: 34, range: 3.0, halfArcRad: 0.55, windup: 0.22, active: 0.13, recovery: 0.31, knockback: 6.0, cleave: 2 }),
  spear:        profiled({ damage: 20, range: 3.6, halfArcRad: 0.30, windup: 0.15, active: 0.10, recovery: 0.25, knockback: 2.8, cleave: 1 }),
  riot_baton:   profiled({ damage: 12, range: 2.7, halfArcRad: 0.60, windup: 0.08, active: 0.09, recovery: 0.13, knockback: 2.2, cleave: 2 }),
};
const FIST_STATS: MeleeStats = profiled({
  damage: 8, range: 2.3, halfArcRad: 0.5, windup: 0.09, active: 0.09, recovery: 0.14, knockback: 1.8, cleave: 1,
});
const GUN_BASH_STATS: MeleeStats = profiled({
  damage: 12, range: 2.5, halfArcRad: 0.55, windup: 0.12, active: 0.10, recovery: 0.20, knockback: 2.6, cleave: 1,
});
const THROW_STATS: MeleeStats = profiled({
  damage: 0, range: 0, halfArcRad: 0, windup: 0.12, active: 0.08, recovery: 0.20, knockback: 0, cleave: 0,
});

export function meleeStatsFor(itemId: string | null): MeleeStats {
  if (itemId && MELEE_STATS[itemId]) return MELEE_STATS[itemId];
  const def = itemId ? ITEMS[itemId] : undefined;
  if (def?.thrown) return THROW_STATS;
  if (def?.category === 'weapon-melee') {
    // unknown melee weapon: sane defaults from its damage number
    return profiled({ damage: def.damage ?? 10, range: 2.8, halfArcRad: 0.6, windup: 0.13, active: 0.11, recovery: 0.20, knockback: 2.6, cleave: 2 });
  }
  return FIST_STATS;
}

/**
 * The swing state machine: windup → active → recovery, one swing at a
 * time, enforced for every melee weapon (Player drives it; the hit
 * resolution fires exactly once, when the active window opens).
 * Input during a swing QUEUES at most one follow-up, which starts the
 * instant recovery ends — never earlier, so recovery can't be skipped
 * by buffering, and holding the button chains swings at exactly the
 * weapon's cadence. Pure (no THREE/store) — cadence is unit-tested.
 */
export class SwingTimer {
  phase: 'windup' | 'active' | 'recovery' | null = null;
  private t = 0; // seconds left in the current phase
  private stats: MeleeStats | null = null;
  private durMult = 1;
  private queued = false;
  /** Set when a queued follow-up auto-starts (callers re-arm anim/sfx). */
  justStarted = false;

  get busy(): boolean {
    return this.phase !== null;
  }
  get current(): MeleeStats | null {
    return this.stats;
  }

  /** Begin a swing. False when one is already running. */
  start(stats: MeleeStats, durMult = 1): boolean {
    if (this.phase !== null) return false;
    this.stats = stats;
    this.durMult = durMult;
    this.phase = 'windup';
    this.t = stats.windup * durMult;
    this.queued = false;
    this.justStarted = true;
    return true;
  }

  /** Ask for the next swing as soon as this one fully recovers. */
  queue(): void {
    if (this.phase !== null) this.queued = true;
  }

  cancel(): void {
    this.phase = null;
    this.stats = null;
    this.queued = false;
  }

  /**
   * Advance the machine. `hit` is true on exactly the frame the active
   * window opens — the caller resolves the sweep then. A queued swing
   * restarts inside the same update that ends recovery, so chain
   * cadence is exactly windup+active+recovery with zero dead frames.
   */
  update(dt: number): { hit: boolean } {
    this.justStarted = false;
    let hit = false;
    let rest = Math.max(0, dt);
    // loop: one long frame can cross several phase boundaries
    for (let guard = 0; guard < 8 && this.phase !== null && rest > 0; guard++) {
      if (rest < this.t) {
        this.t -= rest;
        rest = 0;
        break;
      }
      rest -= this.t;
      if (this.phase === 'windup') {
        this.phase = 'active';
        this.t = (this.stats?.active ?? 0) * this.durMult;
        hit = true;
      } else if (this.phase === 'active') {
        this.phase = 'recovery';
        this.t = (this.stats?.recovery ?? 0) * this.durMult;
      } else {
        // recovery done: chain the queued swing or go idle
        const stats = this.stats;
        this.phase = null;
        this.stats = null;
        if (this.queued && stats) {
          this.start(stats, this.durMult);
          // the new windup eats whatever is left of this frame
          if (rest >= this.t) {
            rest -= this.t;
            this.phase = 'active';
            this.t = stats.active * this.durMult;
            hit = true;
          } else {
            this.t -= rest;
            rest = 0;
          }
        }
      }
    }
    return { hit };
  }
}

function equippedMeleeId(): string | null {
  const s = useGameStore.getState();
  const uid = s.equipped.melee;
  if (!uid) return null;
  const it = s.inventory.find((i) => i.uid === uid);
  return it ? it.itemId : null;
}

export interface MeleeResult {
  swung: boolean;
  hits: number;
  kills: number;
  /** Of `kills`, how many were special-class husks (per-kill kinds are
   *  surfaced so the caller can pay Lane 8's special_kill event for them). */
  specialKills: number;
  stats: MeleeStats;
}

/** The stats a swing STARTS with — the same selection tryMelee
 *  resolves with (gun bash when a gun is in hand and no melee weapon
 *  is equipped), so the state machine times the swing the resolution
 *  will actually use. */
export function swingStatsFor(itemId: string | null): MeleeStats {
  if (itemId == null && equippedRangedDef()) return GUN_BASH_STATS;
  return meleeStatsFor(itemId);
}

/** Swing: cleaves through every husk inside the arc, nearest-first. */
export function tryMelee(h: CombatHooks): MeleeResult {
  const itemId = equippedMeleeId();
  // thrown weapons (grenades): consume one and hand the projectile to Game
  const thrownDef = itemId ? ITEMS[itemId] : undefined;
  if (itemId && thrownDef?.thrown && h.onThrow) {
    const s = useGameStore.getState();
    const uid = s.equipped.melee;
    if (uid) s.removeItem(uid, 1);
    sfx.play('swing', { volume: 0.6 });
    h.onThrow(itemId);
    return { swung: true, hits: 0, kills: 0, specialKills: 0, stats: meleeStatsFor(itemId) };
  }
  // no melee weapon but a gun in hand: bash with the gun itself
  const stats = swingStatsFor(itemId);
  const empty: MeleeResult = { swung: false, hits: 0, kills: 0, specialKills: 0, stats };
  // a weapon worn to nothing is scrap until the bench sees it
  const meleeInst = (() => {
    const s = useGameStore.getState();
    return s.equipped.melee ? s.inventory.find((i) => i.uid === s.equipped.melee) : undefined;
  })();
  if (meleeInst && (meleeInst.condition ?? 100) <= 0) {
    useGameStore.getState().addToast(`${ITEMS[meleeInst.itemId]?.name ?? 'Weapon'} is wrecked — repair it at a bench.`);
    sfx.play('dryfire', { volume: 0.6 });
    return empty;
  }
  // swings are FREE (Ian 2026-10-22): stamina pays for sprint + jump
  // only — a winded player swings exactly as hard as a fresh one.
  sfx.play('swing', { volume: 0.8 });
  h.emitNoise(h.playerPos.x, h.playerPos.z, noiseClassRadius('melee_swing'));

  const storeState = useGameStore.getState();
  const perks = storeState.perks;
  const targets = h.husks.meleeSweep(
    h.playerPos,
    h.playerYaw,
    stats.range,
    stats.halfArcRad,
    stats.cleave + cleaveBonus(perks),
  );
  const hpFrac = storeState.maxHp > 0 ? storeState.hp / storeState.maxHp : 1;
  let kills = 0;
  let specialKills = 0;
  for (const t of targets) {
    const dir = new THREE.Vector3(
      t.husk.group.position.x - h.playerPos.x,
      0,
      t.husk.group.position.z - h.playerPos.z,
    ).normalize();
    // edge hits do less — rewards centering the swing
    const falloff = t.centered ? 1 : 0.7;
    // every melee perk reads through the one derivation (perkEffects):
    // Heavy Swings, Juggernaut low-hp, Executioner vs the stunned,
    // Backstab from behind / against the unaware.
    const fwd = new THREE.Vector3(Math.sin(t.husk.group.rotation.y), 0, Math.cos(t.husk.group.rotation.y));
    const behind = fwd.dot(dir) > 0.5; // player is behind the husk's facing
    const unaware = t.husk.state === 'idle' || t.husk.state === 'wander' || t.husk.state === 'investigate';
    const mult = falloff * meleeDamageMult(perks, {
      hpFrac,
      targetStunned: t.husk.stunT > 0,
      behindOrUnaware: behind || unaware,
    });
    // plate carriers eat light melee too: only a heavy head of steel
    // (25+ base damage) counts as pen 1 against the armored kind
    const meleePen = stats.damage >= 25 ? 1 : 0;
    const dealt = Math.round(stats.damage * mult * armorMult(meleePen, t.husk.armorClass));
    const killed = t.husk.damage(dealt, dir, stats.knockback, true, { pen: meleePen });
    t.husk.investigateAt(h.playerPos);
    sfx.play('thud', { volume: 0.9 });
    if (killed) {
      kills++;
      if (isSpecialKind(t.husk.kind)) specialKills++;
      sfx.play('killconfirm', { volume: 0.5 });
    }
  }
  // landed swings wear the edge (once per swing, however many it cleaved);
  // bashing with a gun wears the gun the same way
  if (targets.length > 0) {
    const st = useGameStore.getState();
    const wearTarget =
      meleeInst ??
      (itemId == null && st.equipped.ranged
        ? st.inventory.find((i) => i.uid === st.equipped.ranged)
        : undefined);
    if (wearTarget) {
      st.setCondition(wearTarget.uid, applyWear(wearTarget.condition ?? 100, WEAR_PER_SWING));
    }
  }
  return { swung: true, hits: targets.length, kills, specialKills, stats };
}

export interface RangedResult {
  fired: boolean;
  hit: boolean;
  killed: boolean;
  headshot: boolean; // any pellet found the head
  /** The kill (if any) was a special-class husk — pays Lane 8's
   *  special_kill event instead of the plain/headshot ranged award. */
  special: boolean;
  damage: number; // total damage dealt (drives tick volume + puff size)
  projectile?: boolean; // a true round is in flight — the verdict lands later
}

/** Fire the equipped ranged weapon. */
export function tryRanged(h: CombatHooks): RangedResult {
  const miss: RangedResult = { fired: false, hit: false, killed: false, headshot: false, special: false, damage: 0 };
  const def = equippedRangedDef();
  if (!def || def.category !== 'weapon-ranged' || !def.ammoId) {
    useGameStore.getState().addToast('No ranged weapon equipped.');
    return miss;
  }
  const s = useGameStore.getState();
  const inst = s.equipped.ranged ? s.inventory.find((i) => i.uid === s.equipped.ranged) : undefined;
  const mods = inst?.mods ?? [];
  // a jammed action cycles nothing; a shot-out barrel fires nothing.
  // Both are honest states, told to the player instead of silent clicks.
  if (inst?.jammed) {
    s.addToast('Jammed — press R to work the action clear.');
    sfx.play('jam', { volume: 0.7 });
    return miss;
  }
  if (inst && (inst.condition ?? 100) <= 0) {
    s.addToast(`${def.name} is shot out — repair it at a bench or strip it for parts.`);
    sfx.play('dryfire', { volume: 0.7 });
    return miss;
  }
  if (def.magSize != null) {
    // magazine-fed: rounds come from the mag, not straight from the pack
    const loaded = inst?.loaded ?? 0;
    if (loaded <= 0) {
      s.addToast('Magazine empty — R to reload.');
      sfx.play('dryfire', { volume: 0.7 });
      return miss;
    }
    if (inst) s.setLoaded(inst.uid, loaded - 1);
  } else {
    const ammoUid = walkCarried(s.inventory).find((i) => i.itemId === def.ammoId)?.uid;
    if (!ammoUid) {
      useGameStore.getState().addToast('No ammo.');
      sfx.play('dryfire', { volume: 0.7 });
      return miss;
    }
    s.removeItem(ammoUid, 1);
  }

  sfx.gunshot(gunClassForItem(def.id));
  h.flashMuzzle();
  h.emitNoise(h.playerPos.x, h.playerPos.z, gunshotRadius(def.noiseRadius, mods)); // suppressor: the loud problem, solved

  const range = def.range ?? 45;
  const pellets = def.pellets ?? 1;
  // accuracy is calculated from stance: hip fire sprays, shoulder aim settles,
  // down-sights is nearly true. The eased adsBlend drives the cone when the
  // controller supplies it (a gun still coming up shoots like it's coming up).
  const aimMult = h.adsBlend != null
    ? h.adsBlend <= 0.55
      ? 2.4 + (0.8 - 2.4) * (h.adsBlend / 0.55)
      : 0.8 + (0.18 - 0.8) * ((h.adsBlend - 0.55) / 0.45)
    : h.aimLevel === 2 ? 0.18 : h.aimLevel === 1 ? 0.8 : 2.4;
  // the sight picture steadies (or, for glass, truly settles) the cone
  // as the gun comes up: eased over the same blend that drives the cone
  const sight = sightFor(def, mods);
  const sightMult = h.adsBlend != null
    ? sightSpreadMult(sight, h.adsBlend)
    : h.aimLevel === 2 ? sight.adsSpreadMult : 1;
  const spread =
    (def.spread ?? 0.045) * aimMult * modSpreadMult(mods, h.aimLevel) * sightMult +
    (h.aimLevel === 2 ? 0.002 : 0.006) +
    bloomSpread(h.bloom ?? 0, def.bloomMax ?? 0) +
    moveSpread(h.moveSpeedNorm ?? 0, h.aimLevel);
  // Item 6 crosshair convergence: the shot is aimed from the eye
  // THROUGH the crosshair point — the camera-ray point at the
  // convergence distance — not fired parallel to the camera ray from
  // an offset eye (which landed every shot beside the crosshair).
  // Player supplies camRay + a measured convDist; compute it here
  // when only the ray is given; no ray = legacy parallel fire.
  const baseDir = h.aimDir.clone();
  if (h.camRay) {
    let convDist = h.convDist;
    if (convDist == null) {
      const camHit = h.husks.raycastShot(h.camRay.origin, h.camRay.dir, range);
      if (camHit) convDist = camHit.dist;
      else if (h.groundY) convDist = rayGroundDistance(h.camRay.origin, h.camRay.dir, h.groundY, range) ?? range;
      else convDist = range;
    }
    const cd = convergedDir(h.eyePos, h.camRay.origin, h.camRay.dir, convDist);
    baseDir.set(cd.x, cd.y, cd.z);
  }
  // sway bends the whole shot group off the aim point before pellets scatter
  if (h.sway && (h.sway.x !== 0 || h.sway.y !== 0)) {
    const r0 = new THREE.Vector3().crossVectors(baseDir, new THREE.Vector3(0, 1, 0)).normalize();
    const u0 = new THREE.Vector3().crossVectors(r0, baseDir).normalize();
    baseDir.addScaledVector(r0, h.sway.x).addScaledVector(u0, h.sway.y).normalize();
  }
  // every trigger pull wears the gun a hair, and a worn gun can jam —
  // applied identically to hitscan and projectile paths
  const condMult = conditionDamageMult(inst?.condition ?? 100);
  const afterShot = () => {
    if (!inst) return;
    const st = useGameStore.getState();
    const worn = applyWear(inst.condition ?? 100, WEAR_PER_SHOT);
    st.setCondition(inst.uid, worn);
    if (rollJam(worn, mods.includes('suppressor'), Math.random)) {
      st.setJammed(inst.uid, true);
      sfx.play('jam', { volume: 0.9 });
      st.addToast('Weapon jammed — R to clear.');
    }
  };
  // long guns throw a true round: it leaves now, the verdict lands when
  // it does. Ammo, noise and the flash already happened above.
  if (def.projectileSpeed && h.onProjectile) {
    const dir = baseDir.clone();
    if (spread > 0) {
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    h.onProjectile((h.muzzlePos ? h.muzzlePos.clone() : h.eyePos.clone()).addScaledVector(dir, 0.3), dir, {
      damage: (def.damage ?? 20) * condMult,
      pen: def.ammoId ? (ITEMS[def.ammoId]?.pen ?? 0) : 0,
      weaponId: def.id,
    });
    afterShot();
    return { fired: true, hit: false, killed: false, headshot: false, special: false, damage: 0, projectile: true };
  }
  let hit = false;
  let killed = false;
  let headshot = false;
  let specialKill = false;
  let totalDamage = 0;
  for (let p = 0; p < pellets; p++) {
    // each pellet jitters around the (possibly swaying) aim dir
    const dir = baseDir.clone();
    if (spread > 0) {
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const res = h.husks.raycastShot(h.eyePos, dir, range);
    // the tracer starts at the VISIBLE barrel tip when the caller
    // knows it (Item 6) — never from inside the shooter's face
    const muzzle = h.muzzlePos ? h.muzzlePos.clone() : h.eyePos.clone().addScaledVector(dir, 0.45);
    if (res) {
      const pen = def.ammoId ? (ITEMS[def.ammoId]?.pen ?? 0) : 0;
      let dmg = rangeFalloff((def.damage ?? 20) * condMult, res.dist) * armorMult(pen, res.husk.armorClass);
      if (res.head) dmg *= 2;
      const dealt = Math.round(dmg);
      const kdir = new THREE.Vector3(
        res.husk.group.position.x - h.playerPos.x,
        0,
        res.husk.group.position.z - h.playerPos.z,
      ).normalize();
      const k = res.husk.damage(dealt, kdir, 1.2, false, { head: res.head, pen });
      // shot from stealth: delayed, jittered investigate — or a hunt,
      // if the husk has triangulated the firing line (see Husk.shotFrom)
      res.husk.shotFrom(h.playerPos, res.dist, res.head);
      if (h.fx) {
        const point = h.eyePos.clone().addScaledVector(dir, res.dist);
        h.fx.impact(point, 'flesh', dealt, res.head);
        h.fx.tracer(muzzle, point);
      }
      hit = true;
      totalDamage += dealt;
      if (res.head) headshot = true;
      if (k) {
        killed = true;
        if (isSpecialKind(res.husk.kind)) specialKill = true;
      }
    } else if (h.fx) {
      // a miss still draws its line — walk the ray to the dirt so the
      // tracer ends where the round actually went
      let end = h.eyePos.clone().addScaledVector(dir, range);
      if (h.groundY) {
        for (let d = 2; d <= range; d += 2) {
          const p = h.eyePos.clone().addScaledVector(dir, d);
          const gy = h.groundY(p.x, p.z);
          if (p.y <= gy + 0.05) {
            p.y = gy + 0.05;
            end = p;
            h.fx.impact(p, 'dust', 0, false);
            break;
          }
        }
      }
      h.fx.tracer(muzzle, end);
    }
  }
  // one feedback voice per trigger pull, best result wins: a shotgun blast
  // is one thud of information, not six overlapping ticks. Tick volume
  // scales with damage dealt — falloff you can hear.
  if (killed) sfx.play('killconfirm', { volume: 0.55 });
  else if (headshot) sfx.play('headshot', { volume: 0.9 });
  else if (hit) sfx.play('tick', { volume: 0.35 + Math.min(0.6, totalDamage / 90) });
  afterShot();
  return { fired: true, hit, killed, headshot, special: specialKill, damage: totalDamage };
}

function equippedRangedDef() {
  const s = useGameStore.getState();
  const uid = s.equipped.ranged;
  if (!uid) return null;
  const it = s.inventory.find((i) => i.uid === uid);
  return it ? ITEMS[it.itemId] ?? null : null;
}

export { equippedRangedDef };

/** Re-export for the controller: which melee item is swinging. */
export { equippedMeleeId };
