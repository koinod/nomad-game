// companionMath.ts — ORDER #6: the pure math of having a crew beside
// you — formation slots, needs rates, trait-scaled combat, weapon
// profiles, vehicle seat locals. No THREE, no store: every rule here
// is unit-pinned in companions.test.ts, and Companions.ts is the
// (thin) world wiring over it.

import { ITEMS } from '../data/items';
import type { ItemDef } from '../store/types';

/** Survival pressure, per GAME minute (the clock runs 1 real second =
 *  1 game minute — Game.ts). A companion goes from full to empty over
 *  roughly a long field day; resting at base restores fatigue ~4x
 *  faster than riding does, and riding still beats marching. */
export const HUNGER_PER_MIN = 100 / 480; // empty in 8 game hours
export const FATIGUE_PER_MIN = 100 / 840; // spent in 14 game hours
export const FATIGUE_REST_PER_MIN = 100 / 200;
export const FATIGUE_RIDE_PER_MIN = 100 / 600;

export type NeedsMode = 'active' | 'rest' | 'ride';

/** Advance hunger/fatigue by dtMin game minutes. Eating is an event,
 *  not a rate — it lands through the store's survivorEat. */
export function tickNeeds(
  hunger: number,
  fatigue: number,
  dtMin: number,
  mode: NeedsMode,
): { hunger: number; fatigue: number } {
  const h = Math.max(0, hunger - HUNGER_PER_MIN * dtMin);
  let f = fatigue - FATIGUE_PER_MIN * dtMin;
  if (mode === 'rest') f = Math.min(100, fatigue + FATIGUE_REST_PER_MIN * dtMin);
  if (mode === 'ride') f = Math.min(100, fatigue + FATIGUE_RIDE_PER_MIN * dtMin);
  return { hunger: h, fatigue: Math.max(0, Math.min(100, f)) };
}

/** Below these, a companion is flagging — combat output drops (the
 *  world-visible end of the needs system: feed and rest your crew). */
export const FLAGGING_HUNGER = 25;
export const FLAGGING_FATIGUE = 20;

export function needsCombatMult(hunger: number, fatigue: number): number {
  return (hunger < FLAGGING_HUNGER || fatigue < FLAGGING_FATIGUE) ? 0.7 : 1;
}

/** Formation slots behind the player: (lateral, behind) in metres,
 *  rotated by the player's heading at the call site. Slots fan wider
 *  and deeper as the crew grows so nobody walks inside anybody. */
const FORMATION: [number, number][] = [
  [-1.2, 1.7], [1.2, 1.7], [-2.2, 3.1], [2.2, 3.1], [0, 3.6], [-1.4, 4.6], [1.4, 4.6], [0, 5.6],
];

export function formationOffset(index: number): { side: number; back: number } {
  const [side, back] = FORMATION[Math.max(0, Math.min(index, FORMATION.length - 1))];
  return { side, back };
}

/** How a follower closes distance: walk the formation, run to catch
 *  up, and — past the snap radius — simply arrive (the island is big
 *  and a companion stuck on geometry two POIs back helps nobody;
 *  husks use the same honesty via their return-home leash). */
export type CatchUp = 'walk' | 'run' | 'snap';
export function catchUpMode(distM: number): CatchUp {
  if (distM > 55) return 'snap';
  if (distM > 9) return 'run';
  return 'walk';
}
export const WALK_SPEED = 3.1;
export const RUN_SPEED = 5.6;

export interface TraitCombat {
  /** Damage multiplier (trait descriptions in data/survivors are law:
   *  brave "fights at 130%", ex-military "fights at 140%", cowardly
   *  "fights at 70%"). */
  dmgMult: number;
  /** Engagement radius multiplier — a coward does not start fights. */
  engageMult: number;
  /** Bold companions start fights at full radius; the unbold only
   *  answer threats that are already close. */
  bold: boolean;
}

export function traitCombat(traits: readonly string[]): TraitCombat {
  let dmg = 1;
  let engage = 1;
  let bold = true;
  if (traits.includes('brave')) dmg *= 1.3;
  if (traits.includes('ex_military')) dmg *= 1.4;
  if (traits.includes('cowardly')) {
    dmg *= 0.7;
    engage *= 0.55;
    bold = false;
  }
  return { dmgMult: dmg, engageMult: engage, bold };
}

export interface CompanionWeapon {
  damage: number;
  /** Metres at which the companion can land it. */
  range: number;
  cooldownSec: number;
  ranged: boolean;
}

/** What a survivor fights with. Unarmed is a real (poor) profile —
 *  fists, short reach, and only the bold swing them unprompted. Guns
 *  fire on a slower cadence than the player's and pellet weapons land
 *  about half their spread on a moving husk. */
export function weaponProfile(itemId: string | null): CompanionWeapon {
  if (!itemId) return { damage: 5, range: 1.9, cooldownSec: 0.9, ranged: false };
  const def: ItemDef | undefined = ITEMS[itemId];
  if (!def || def.damage == null) return { damage: 5, range: 1.9, cooldownSec: 0.9, ranged: false };
  if (def.range != null) {
    const pellets = def.pellets ?? 1;
    return {
      damage: Math.round(def.damage * pellets * (pellets > 1 ? 0.5 : 1)),
      range: Math.min(16, def.range * 0.6),
      cooldownSec: 1.25,
      ranged: true,
    };
  }
  return { damage: def.damage, range: 2.0, cooldownSec: 0.85, ranged: false };
}

/** Passenger seat locals in vehicle space, mirroring the driver's
 *  solved locals in Player.ts (lx: +X is vehicle-left, lz: forward).
 *  Seat 0 rides shotgun; 1–2 take the rear bench (long vehicles);
 *  anything past that walks. Kinds with no cabin (bike/moto) seat
 *  nobody — the crew follows on foot and snaps on arrival. */
export function passengerSeatCount(kind: string | undefined): number {
  if (kind === 'bike' || kind === 'moto') return 0;
  if (kind === 'atv' || kind === 'skiff') return 1;
  return 3;
}

export function passengerSeatLocal(
  seatIndex: number,
  driver: { lx: number; lz: number },
  width: number,
): { lx: number; lz: number } | null {
  if (seatIndex === 0) return { lx: driver.lx - width * 0.42, lz: driver.lz };
  if (seatIndex === 1) return { lx: driver.lx, lz: driver.lz - 0.95 };
  if (seatIndex === 2) return { lx: driver.lx - width * 0.42, lz: driver.lz - 0.95 };
  return null;
}
