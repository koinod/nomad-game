// noise.ts — the canonical noise-class table (Wave 3's stealth contract,
// completed). Every actor action that makes sound belongs to a class with
// one radius; husks and animals hear by radius, and the HUD meter is
// calibrated so a class-gunshot reads 100%.
//
// Sources, per value: ROADMAP Wave 3 (crouch / sprint / gunshot),
// SYSTEMS_SPEC §0.1 (the 80m gunshot ruling — the old 60m figure was a
// bug), §4.4 + GAP_AUDIT (forced entry, alarm, vehicle + explosion
// classes), and the shipped emitters where the docs never ruled (code
// wins: walk 6m and melee 8m are what Player/Combat already emit).
// Item-driven sounds (lure landings, decoy loops, shrieks) are NOT
// classes — their radius rides on the item/ability def that makes them.
//
// Pure module: no THREE, no store. Unit-tested in tests/noise.test.ts,
// including an end-to-end Combat check that the suppressor multiplier
// really reaches the emitted radius.

import { modNoiseMult } from '../data/mods';

export type NoiseClassId =
  | 'crouch_step'
  | 'walk_step'
  | 'sprint_step'
  | 'melee_swing'
  | 'gunshot'
  | 'forced_entry'
  | 'alarm'
  | 'vehicle_idle'
  | 'vehicle_drive'
  | 'vehicle_crash'
  | 'explosion';

export interface NoiseClass {
  id: NoiseClassId;
  radius: number; // meters — a husk inside this radius hears the act
  label: string;
}

export const NOISE_CLASSES: Record<NoiseClassId, NoiseClass> = {
  crouch_step: { id: 'crouch_step', radius: 2, label: 'Crouched footsteps' },
  walk_step: { id: 'walk_step', radius: 6, label: 'Footsteps' },
  sprint_step: { id: 'sprint_step', radius: 14, label: 'Sprinting' },
  melee_swing: { id: 'melee_swing', radius: 8, label: 'Melee swing' },
  gunshot: { id: 'gunshot', radius: 80, label: 'Gunshot (unsuppressed)' },
  forced_entry: { id: 'forced_entry', radius: 45, label: 'Forced entry / smashed container' },
  alarm: { id: 'alarm', radius: 60, label: 'Tripped alarm burst' },
  vehicle_idle: { id: 'vehicle_idle', radius: 30, label: 'Engine idling' },
  vehicle_drive: { id: 'vehicle_drive', radius: 55, label: 'Vehicle at speed' },
  vehicle_crash: { id: 'vehicle_crash', radius: 150, label: 'Vehicle crash' },
  explosion: { id: 'explosion', radius: 200, label: 'Explosion' },
};

export function noiseClassRadius(id: NoiseClassId): number {
  return NOISE_CLASSES[id].radius;
}

/**
 * The radius a shot actually emits. Per-weapon `noiseRadius` on the item
 * def overrides the class default (crossbow 12m, flare gun 45m); the
 * suppressor's noiseMult then scales whatever the weapon starts from —
 * the class case is the spec's worked example: 80m × 0.31 ≈ 25m.
 */
export function gunshotRadius(
  weaponNoiseRadius: number | undefined,
  mods: readonly string[],
): number {
  return (weaponNoiseRadius ?? NOISE_CLASSES.gunshot.radius) * modNoiseMult(mods);
}

/**
 * HUD meter level for a radius, 0..100. The meter's full scale IS the
 * gunshot class — anything louder (a crash, an explosion) pegs it.
 * Game's emitNoise mapping uses this same curve.
 */
export function meterLevel(radius: number): number {
  return Math.min(100, Math.max(0, (radius / NOISE_CLASSES.gunshot.radius) * 100));
}
