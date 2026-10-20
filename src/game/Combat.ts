// Combat.ts — melee + pistol hit resolution. Called from the player controller.

import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';

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

  const targets = h.husks.meleeSweep(h.playerPos, h.playerYaw, stats.range, stats.halfArcRad, stats.cleave);
  let kills = 0;
  for (const t of targets) {
    const dir = new THREE.Vector3(
      t.husk.group.position.x - h.playerPos.x,
      0,
      t.husk.group.position.z - h.playerPos.z,
    ).normalize();
    // edge hits do less — rewards centering the swing
    const falloff = t.centered ? 1 : 0.7;
    const killed = t.husk.damage(Math.round(stats.damage * falloff), dir, stats.knockback, true);
    t.husk.investigateAt(h.playerPos);
    sfx.play('hit', { volume: 0.9 });
    if (killed) {
      kills++;
      sfx.play('quest', { volume: 0.4 });
    }
  }
  return { swung: true, hits: targets.length, kills, stats };
}

export interface RangedResult {
  fired: boolean;
  hit: boolean;
  killed: boolean;
}

/** Fire the equipped ranged weapon. */
export function tryRanged(h: CombatHooks): RangedResult {
  const miss: RangedResult = { fired: false, hit: false, killed: false };
  const def = equippedRangedDef();
  if (!def || def.category !== 'weapon-ranged' || !def.ammoId) {
    useGameStore.getState().addToast('No ranged weapon equipped.');
    return miss;
  }
  const s = useGameStore.getState();
  const ammoUid = s.inventory.find((i) => i.itemId === def.ammoId)?.uid;
  if (!ammoUid) {
    useGameStore.getState().addToast('No ammo.');
    sfx.play('ui', { volume: 0.4 });
    return miss;
  }
  s.removeItem(ammoUid, 1);

  sfx.play('shot', { volume: 1 });
  h.flashMuzzle();
  h.emitNoise(h.playerPos.x, h.playerPos.z, def.noiseRadius ?? 80); // per-weapon: the crossbow whispers, rifles carry

  const range = def.range ?? 45;
  const pellets = def.pellets ?? 1;
  // accuracy is calculated from stance: hip fire sprays, shoulder aim settles,
  // down-sights is nearly true. Weapon base spread scales the cone.
  const aimMult = h.aimLevel === 2 ? 0.18 : h.aimLevel === 1 ? 0.8 : 2.4;
  const spread = (def.spread ?? 0.045) * aimMult + (h.aimLevel === 2 ? 0.002 : 0.006);
  let hit = false;
  let killed = false;
  for (let p = 0; p < pellets; p++) {
    // each pellet jitters around the aim dir — tight pattern, real spread feel
    const dir = h.aimDir.clone();
    if (spread > 0) {
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const res = h.husks.raycastShot(h.eyePos, dir, range);
    if (res) {
      let dmg = def.damage ?? 20;
      if (res.dist > 25) dmg *= Math.max(0.5, 1 - (res.dist - 25) / 50);
      if (res.head) dmg *= 2;
      const kdir = new THREE.Vector3(
        res.husk.group.position.x - h.playerPos.x,
        0,
        res.husk.group.position.z - h.playerPos.z,
      ).normalize();
      const k = res.husk.damage(Math.round(dmg), kdir, 1.2, false);
      res.husk.investigateAt(h.playerPos);
      sfx.play('hit', { volume: 0.9 });
      hit = true;
      if (k) {
        killed = true;
        sfx.play('quest', { volume: 0.4 });
      }
    }
  }
  return { fired: true, hit, killed };
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
