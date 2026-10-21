// game/visibility.ts — the §6.3 visibility system (Lane 8).
//
// Stealth was noise-only; the Ghost tree and the tac-light mod need light.
// This module is deliberately small, per spec: ONE computed number
// (exposure 0..1), one perception formula, one HUD data model. No raycast
// shadow mapping — the caller samples the light level at the player
// (sun/moon + shadow + interiors, however it likes) and hands it in.
//
//   exposure = light × crouch × movement × flashlight × night-perks
//     light:      lightLevel at the player; at night an ambient floor of
//                 0.3 applies (moonlight — darkness alone never zeroes it)
//     crouch:     ×0.5 (×0.35 total with gh_shadow's extra −30%)
//     movement:   ×1.3 while moving
//     flashlight: ×2.0 (caller passes flashlightOn=true when the beam is
//                 on AND the observer is inside the cone — §3.2 mod hook)
//     smoke:      ×0 — inside a smoke cloud you are simply not visible
//   husk sight  = baseRange × exposure × (1 − stealthLevel × 0.03)
//
// INTEGRATION (Husks.ts is Lane 4's; Player/Game supply inputs):
// Husks.ts perception block (~line 747) currently does
//   sightRange = 25 * (isNight ? 0.55 : 1)
// Replace with computeVisibility(...) fed from ctx (lightLevel at player,
// crouched/moving/flashlight flags on the ctx) and huskSightRange(25,
// vis.exposure, stealthLevel); the ×0.55 night factor is superseded —
// night is inside exposure now (ambient floor 0.3).
// gh_unseen is applied by canHuskSee: crouched + still + shadowed ⇒
// invisible beyond 3m.

import { perkNum } from '../data/skills';

export interface VisibilityInput {
  /** 0..1 — light falling on the player (0 = pitch black, 1 = full sun). */
  lightLevel: number;
  isNight?: boolean;
  crouched?: boolean;
  moving?: boolean;
  /** Tac light on, with the observer in the cone (caller's call). */
  flashlightOn?: boolean;
  /** Player inside a smoke cloud — hard zero, beats every other factor. */
  inSmoke?: boolean;
  /** Player in shadow (for the gh_unseen capstone check). Callers that
   *  don't track shadow can omit it; computeVisibility derives a default
   *  from effectiveLight < 0.35 when the field is absent. */
  inShadow?: boolean;
}

export interface VisibilityState {
  /** 0..1 — the one number everything reads (§6.3). */
  exposure: number;
  /** Light after the night ambient floor, before posture factors. */
  effectiveLight: number;
  /** True when gh_unseen's conditions hold (crouched + still + shadow). */
  unseenPosture: boolean;
}

export const NIGHT_AMBIENT_FLOOR = 0.3;
export const CROUCH_FACTOR = 0.5;
export const MOVEMENT_FACTOR = 1.3;
export const FLASHLIGHT_FACTOR = 2.0;
export const STEALTH_PER_LEVEL = 0.03;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeVisibility(
  input: VisibilityInput,
  perks: readonly string[] = [],
): VisibilityState {
  const rawLight = clamp01(input.lightLevel || 0);
  const effectiveLight = input.isNight
    ? Math.max(rawLight, NIGHT_AMBIENT_FLOOR)
    : rawLight;
  const inShadow = input.inShadow ?? effectiveLight < 0.35;
  const unseenPosture =
    perks.includes('gh_unseen') && !!input.crouched && !input.moving && inShadow;

  if (input.inSmoke) return { exposure: 0, effectiveLight, unseenPosture };

  let exposure = effectiveLight;
  if (input.crouched) {
    // gh_shadow: crouched visibility −30% on top of the crouch factor.
    exposure *= CROUCH_FACTOR * perkNum(perks, 'crouchVisMult', 1);
  }
  if (input.moving) exposure *= MOVEMENT_FACTOR;
  if (input.flashlightOn) exposure *= FLASHLIGHT_FACTOR;
  if (input.isNight) {
    // Night-stealth perks: gh_nightowl (0.8), sc_nightharvest (0.9).
    exposure *= perkNum(perks, 'nightStealthMult', 1);
    exposure *= perkNum(perks, 'nightVisMult', 1);
  }
  return { exposure: clamp01(exposure), effectiveLight, unseenPosture };
}

/** Convenience: just the number. */
export function computeExposure(input: VisibilityInput, perks: readonly string[] = []): number {
  return computeVisibility(input, perks).exposure;
}

/** §6.3 husk perception: sight range scaled by exposure and the player's
 *  stealth skill (3% per level, so a level-10 ghost is seen at 0.7×). */
export function huskSightRange(baseRange: number, exposure: number, stealthLevel: number): number {
  const lvl = Math.max(0, Math.min(10, stealthLevel));
  return baseRange * clamp01(exposure) * (1 - lvl * STEALTH_PER_LEVEL);
}

/** Full "does this husk see the player" verdict, incl. the gh_unseen
 *  capstone: crouched + still + in shadow = invisible beyond 3m. */
export function canHuskSee(args: {
  baseRange: number;
  distance: number;
  visibility: VisibilityState;
  stealthLevel: number;
}): boolean {
  if (args.visibility.unseenPosture && args.distance > 3) return false;
  return args.distance < huskSightRange(args.baseRange, args.visibility.exposure, args.stealthLevel);
}

// ------------------------------------------------------- HUD data model --

export type LightBand = 'hidden' | 'dim' | 'watched' | 'spotted';

export interface LightIndicatorModel {
  /** 0..1 — how full the eye icon renders. */
  fill: number;
  band: LightBand;
  /** Player-facing label for the indicator. */
  label: string;
}

/** The LightIndicator data model (§6.3, sodgame port): an eye that fills
 *  as exposure climbs. Lane 11 renders it in HUD.tsx from this model —
 *  feed it computeVisibility(...).exposure each frame. */
export function lightIndicator(exposure: number): LightIndicatorModel {
  const fill = clamp01(exposure);
  if (fill < 0.25) return { fill, band: 'hidden', label: 'Hidden' };
  if (fill < 0.5) return { fill, band: 'dim', label: 'Dim' };
  if (fill < 0.75) return { fill, band: 'watched', label: 'Watched' };
  return { fill, band: 'spotted', label: 'Spotted' };
}
