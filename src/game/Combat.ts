// Combat.ts — melee + pistol hit resolution. Called from the player controller.

import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';
import { modNoiseMult, modSpreadMult } from '../data/mods';
import { bloomSpread, moveSpread, rangeFalloff } from './gunMath';

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
  spendStamina: (n: number) => boolean;
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
}

/** Per-weapon melee feel: reach, arc, swing speed, knockback, stamina cost. */
export interface MeleeStats {
  damage: number;
  range: number;      // meters
  halfArcRad: number; // half-angle of the swing cone
  swingTime: number;  // seconds the swing anim runs
  knockback: number;
  stamina: number;
  cleave: number;     // max husks hit per swing
}

const MELEE_STATS: Record<string, MeleeStats> = {
  pipe:    { damage: 14, range: 3.1, halfArcRad: 0.75, swingTime: 0.42, knockback: 4.2, stamina: 18, cleave: 3 },
  machete: { damage: 22, range: 2.9, halfArcRad: 0.62, swingTime: 0.3,  knockback: 2.4, stamina: 13, cleave: 2 },
  hatchet: { damage: 18, range: 2.8, halfArcRad: 0.55, swingTime: 0.34, knockback: 3.0, stamina: 14, cleave: 2 },
  baseball_bat: { damage: 16, range: 3.0, halfArcRad: 0.7, swingTime: 0.38, knockback: 3.8, stamina: 15, cleave: 3 },
  combat_knife: { damage: 15, range: 2.5, halfArcRad: 0.45, swingTime: 0.22, knockback: 1.2, stamina: 8, cleave: 1 },
  sledgehammer: { damage: 30, range: 2.9, halfArcRad: 0.6, swingTime: 0.55, knockback: 5.5, stamina: 22, cleave: 2 },
  torch:   { damage: 6,  range: 2.7, halfArcRad: 0.6,  swingTime: 0.34, knockback: 2.0, stamina: 12, cleave: 2 },
  flare:   { damage: 4,  range: 2.5, halfArcRad: 0.55, swingTime: 0.3,  knockback: 1.6, stamina: 10, cleave: 1 },
  crowbar:     { damage: 17, range: 2.9, halfArcRad: 0.6,  swingTime: 0.33, knockback: 3.4, stamina: 14, cleave: 2 },
  fire_axe:    { damage: 34, range: 3.0, halfArcRad: 0.55, swingTime: 0.52, knockback: 6.0, stamina: 24, cleave: 2 },
  spear:       { damage: 20, range: 3.6, halfArcRad: 0.3,  swingTime: 0.4,  knockback: 2.8, stamina: 15, cleave: 1 },
  riot_baton:  { damage: 12, range: 2.7, halfArcRad: 0.6,  swingTime: 0.2,  knockback: 2.2, stamina: 7,  cleave: 2 },
};
const FIST_STATS: MeleeStats = {
  damage: 8, range: 2.3, halfArcRad: 0.5, swingTime: 0.26, knockback: 1.8, stamina: 10, cleave: 1,
};
const GUN_BASH_STATS: MeleeStats = {
  damage: 12, range: 2.5, halfArcRad: 0.55, swingTime: 0.32, knockback: 2.6, stamina: 12, cleave: 1,
};

export function meleeStatsFor(itemId: string | null): MeleeStats {
  if (itemId && MELEE_STATS[itemId]) return MELEE_STATS[itemId];
  const def = itemId ? ITEMS[itemId] : undefined;
  if (def?.category === 'weapon-melee') {
    // unknown melee weapon: sane defaults from its damage number
    return { damage: def.damage ?? 10, range: 2.8, halfArcRad: 0.6, swingTime: 0.34, knockback: 2.6, stamina: 14, cleave: 2 };
  }
  return FIST_STATS;
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
  stats: MeleeStats;
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
    const tStats: MeleeStats = { damage: 0, range: 0, halfArcRad: 0, swingTime: 0.4, knockback: 0, stamina: 6, cleave: 0 };
    return { swung: true, hits: 0, kills: 0, stats: tStats };
  }
  // no melee weapon but a gun in hand: bash with the gun itself
  const stats = itemId == null && equippedRangedDef() ? GUN_BASH_STATS : meleeStatsFor(itemId);
  const empty: MeleeResult = { swung: false, hits: 0, kills: 0, stats };
  if (!h.spendStamina(stats.stamina)) {
    useGameStore.getState().addToast('Too winded to swing.');
    return empty;
  }
  sfx.play('swing', { volume: 0.8 });
  h.emitNoise(h.playerPos.x, h.playerPos.z, 8);

  const targets = h.husks.meleeSweep(
    h.playerPos,
    h.playerYaw,
    stats.range,
    stats.halfArcRad,
    stats.cleave + (useGameStore.getState().perks.includes('br_cleaver') ? 1 : 0),
  );
  const perks = useGameStore.getState().perks;
  const dmgMult =
    (perks.includes('br_heavy') ? 1.15 : 1) *
    (perks.includes('br_juggernaut') && useGameStore.getState().hp < useGameStore.getState().maxHp / 2 ? 1.3 : 1);
  const execMult = perks.includes('br_executioner') ? 1.5 : 1;
  const backstab = perks.includes('gh_backstab');
  let kills = 0;
  for (const t of targets) {
    const dir = new THREE.Vector3(
      t.husk.group.position.x - h.playerPos.x,
      0,
      t.husk.group.position.z - h.playerPos.z,
    ).normalize();
    // edge hits do less — rewards centering the swing
    const falloff = t.centered ? 1 : 0.7;
    let mult = dmgMult * falloff;
    if (t.husk.stunT > 0) mult *= execMult; // Executioner: the helpless take double
    if (backstab) {
      const fwd = new THREE.Vector3(Math.sin(t.husk.group.rotation.y), 0, Math.cos(t.husk.group.rotation.y));
      const behind = fwd.dot(dir) > 0.5; // player is behind the husk's facing
      const unaware = t.husk.state === 'idle' || t.husk.state === 'wander' || t.husk.state === 'investigate';
      if (behind || unaware) mult *= 3;
    }
    const killed = t.husk.damage(Math.round(stats.damage * mult), dir, stats.knockback, true);
    t.husk.investigateAt(h.playerPos);
    sfx.play('thud', { volume: 0.9 });
    if (killed) {
      kills++;
      sfx.play('killconfirm', { volume: 0.5 });
    }
  }
  return { swung: true, hits: targets.length, kills, stats };
}

export interface RangedResult {
  fired: boolean;
  hit: boolean;
  killed: boolean;
  headshot: boolean; // any pellet found the head
  damage: number; // total damage dealt (drives tick volume + puff size)
  projectile?: boolean; // a true round is in flight — the verdict lands later
}

/** Fire the equipped ranged weapon. */
export function tryRanged(h: CombatHooks): RangedResult {
  const miss: RangedResult = { fired: false, hit: false, killed: false, headshot: false, damage: 0 };
  const def = equippedRangedDef();
  if (!def || def.category !== 'weapon-ranged' || !def.ammoId) {
    useGameStore.getState().addToast('No ranged weapon equipped.');
    return miss;
  }
  const s = useGameStore.getState();
  const inst = s.equipped.ranged ? s.inventory.find((i) => i.uid === s.equipped.ranged) : undefined;
  const mods = inst?.mods ?? [];
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
    const ammoUid = s.inventory.find((i) => i.itemId === def.ammoId)?.uid;
    if (!ammoUid) {
      useGameStore.getState().addToast('No ammo.');
      sfx.play('dryfire', { volume: 0.7 });
      return miss;
    }
    s.removeItem(ammoUid, 1);
  }

  sfx.play('shot', { volume: 1 });
  h.flashMuzzle();
  h.emitNoise(h.playerPos.x, h.playerPos.z, (def.noiseRadius ?? 80) * modNoiseMult(mods)); // suppressor: the loud problem, solved

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
  const spread =
    (def.spread ?? 0.045) * aimMult * modSpreadMult(mods, h.aimLevel) +
    (h.aimLevel === 2 ? 0.002 : 0.006) +
    bloomSpread(h.bloom ?? 0, def.bloomMax ?? 0) +
    moveSpread(h.moveSpeedNorm ?? 0, h.aimLevel);
  // sway bends the whole shot group off the aim point before pellets scatter
  const baseDir = h.aimDir.clone();
  if (h.sway && (h.sway.x !== 0 || h.sway.y !== 0)) {
    const r0 = new THREE.Vector3().crossVectors(baseDir, new THREE.Vector3(0, 1, 0)).normalize();
    const u0 = new THREE.Vector3().crossVectors(r0, baseDir).normalize();
    baseDir.addScaledVector(r0, h.sway.x).addScaledVector(u0, h.sway.y).normalize();
  }
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
    h.onProjectile(h.eyePos.clone().addScaledVector(dir, 0.3), dir, {
      damage: def.damage ?? 20,
      pen: def.ammoId ? (ITEMS[def.ammoId]?.pen ?? 0) : 0,
      weaponId: def.id,
    });
    return { fired: true, hit: false, killed: false, headshot: false, damage: 0, projectile: true };
  }
  let hit = false;
  let killed = false;
  let headshot = false;
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
    const muzzle = h.eyePos.clone().addScaledVector(dir, 0.45);
    if (res) {
      let dmg = rangeFalloff(def.damage ?? 20, res.dist);
      if (res.head) dmg *= 2;
      const dealt = Math.round(dmg);
      const kdir = new THREE.Vector3(
        res.husk.group.position.x - h.playerPos.x,
        0,
        res.husk.group.position.z - h.playerPos.z,
      ).normalize();
      const k = res.husk.damage(dealt, kdir, 1.2, false, { head: res.head });
      res.husk.investigateAt(h.playerPos);
      if (h.fx) {
        const point = h.eyePos.clone().addScaledVector(dir, res.dist);
        h.fx.impact(point, 'flesh', dealt, res.head);
        h.fx.tracer(muzzle, point);
      }
      hit = true;
      totalDamage += dealt;
      if (res.head) headshot = true;
      if (k) killed = true;
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
  return { fired: true, hit, killed, headshot, damage: totalDamage };
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
