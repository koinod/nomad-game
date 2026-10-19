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
}

const MELEE_RANGE = 2.7;
const MELEE_ARC = (70 * Math.PI) / 180 / 2;
const MELEE_STAMINA = 15;
const FIST_DAMAGE = 8;

function equippedDef(slot: 'melee' | 'ranged') {
  const s = useGameStore.getState();
  const uid = s.equipped[slot];
  if (!uid) return null;
  const it = s.inventory.find((i) => i.uid === uid);
  return it ? ITEMS[it.itemId] ?? null : null;
}

/** Returns true if a swing was performed (hit or miss). */
export function tryMelee(h: CombatHooks): boolean {
  if (!h.spendStamina(MELEE_STAMINA)) {
    useGameStore.getState().addToast('Too winded to swing.');
    return false;
  }
  sfx.play('swing', { volume: 0.8 });
  h.emitNoise(h.playerPos.x, h.playerPos.z, 8);
  const def = equippedDef('melee');
  const damage = def?.damage ?? FIST_DAMAGE;
  const hit = h.husks.meleeHit(h.playerPos, h.playerYaw, MELEE_RANGE, MELEE_ARC);
  if (hit) {
    const dir = new THREE.Vector3(
      hit.group.position.x - h.playerPos.x,
      0,
      hit.group.position.z - h.playerPos.z,
    ).normalize();
    const killed = hit.damage(damage, dir);
    hit.investigateAt(h.playerPos);
    sfx.play('hit', { volume: 0.9 });
    if (killed) sfx.play('quest', { volume: 0.4 });
  }
  return true;
}

/** Returns true if a shot was fired. */
export function tryRanged(h: CombatHooks): boolean {
  const def = equippedDef('ranged');
  if (!def || def.category !== 'weapon-ranged' || !def.ammoId) {
    useGameStore.getState().addToast('No ranged weapon equipped.');
    return false;
  }
  const s = useGameStore.getState();
  const ammoUid = s.inventory.find((i) => i.itemId === def.ammoId)?.uid;
  if (!ammoUid) {
    useGameStore.getState().addToast('No ammo.');
    sfx.play('ui', { volume: 0.4 });
    return false;
  }
  s.removeItem(ammoUid, 1);

  sfx.play('shot', { volume: 1 });
  h.flashMuzzle();
  h.emitNoise(h.playerPos.x, h.playerPos.z, 60);

  const range = def.range ?? 45;
  const res = h.husks.raycastShot(h.eyePos, h.aimDir, range);
  if (res) {
    let dmg = def.damage ?? 20;
    if (res.dist > 25) dmg *= Math.max(0.5, 1 - (res.dist - 25) / 50);
    if (res.head) dmg *= 2;
    const dir = new THREE.Vector3(
      res.husk.group.position.x - h.playerPos.x,
      0,
      res.husk.group.position.z - h.playerPos.z,
    ).normalize();
    const killed = res.husk.damage(Math.round(dmg), dir);
    res.husk.investigateAt(h.playerPos);
    sfx.play('hit', { volume: 0.9 });
    if (killed) sfx.play('quest', { volume: 0.4 });
  }
  return true;
}
