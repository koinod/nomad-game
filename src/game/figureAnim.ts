// figureAnim.ts — ORDER #6: the shared procedural locomotion driver.
//
// One driver poses every figure in the game — husks, companions, NPCs —
// around the static base pose its builder recorded (FigureRig.pose). The
// Feel wave proved the pattern on the player: clock the stride from
// DISTANCE TRAVELLED, never from wall time, so foot speed and body speed
// cannot disagree (the pre-#6 husk swing ran on a fixed-rate clock and
// glided whenever a kind's real speed left its state's nominal band).
//
// Everything here is pure math over a phase value; the caller owns the
// phase (advance it by the distance the figure actually moved this
// frame) and applies the pose. Joint-continuity law: poses only ever
// rotate the kit's pivots around their authored bases — no offsets, no
// scales — so no seam can open at any extreme the driver can reach
// (max |swing| per gait is table data, pinned by figureAnim tests).

import type { FigureRig } from './figureKit';

export interface GaitParams {
  /** Metres travelled per full left+right cycle. */
  cycleM: number;
  /** Peak leg swing (rad) at full blend. */
  legAmp: number;
  /** Peak arm counter-swing (rad) at full blend. */
  armAmp: number;
  /** Root bob amplitude (m) — two footfall bobs per cycle. */
  bobM: number;
  /** Root roll amplitude (rad). */
  rollAmp: number;
  /** Extra forward torso pitch (rad) at full blend — the prowl/lumber. */
  lean: number;
  /** 0..1 limp asymmetry: phase-shifts and weakens the right leg. */
  asym: number;
  /** Crawler: arms are forelimbs — diagonal pairs move together. */
  quadruped?: boolean;
}

export const GAITS = {
  /** Recruits, NPCs, any human on foot — matched to the player's feel. */
  human: { cycleM: 1.7, legAmp: 0.55, armAmp: 0.4, bobM: 0.045, rollAmp: 0.03, lean: 0.04, asym: 0 },
  /** The shuffle: uneven, dragging, one leg weaker than the other. */
  shambler: { cycleM: 1.25, legAmp: 0.38, armAmp: 0.24, bobM: 0.05, rollAmp: 0.055, lean: 0.05, asym: 0.55 },
  /** Low, long, deliberate — legs scissor wide, arms barely move. */
  stalker: { cycleM: 2.1, legAmp: 0.62, armAmp: 0.14, bobM: 0.03, rollAmp: 0.02, lean: 0.16, asym: 0.1 },
  /** Plate-stiff: short steps, small throws, no grace. */
  armored: { cycleM: 1.1, legAmp: 0.3, armAmp: 0.18, bobM: 0.035, rollAmp: 0.03, lean: 0.03, asym: 0.2 },
  /** Barely walks at all — a sway with occasional steps. */
  screamer: { cycleM: 0.9, legAmp: 0.22, armAmp: 0.3, bobM: 0.04, rollAmp: 0.07, lean: 0.02, asym: 0.3 },
  /** Slow, heavy, wide: long cycle, mass in the roll and the bob. */
  brute: { cycleM: 1.9, legAmp: 0.34, armAmp: 0.3, bobM: 0.075, rollAmp: 0.06, lean: 0.1, asym: 0.15 },
  /** Quadruped scuttle — diagonal pairs (armL+legR / armR+legL). */
  crawler: { cycleM: 0.85, legAmp: 0.5, armAmp: 0.55, bobM: 0.03, rollAmp: 0.05, lean: 0, asym: 0.1, quadruped: true },
  /** Top-heavy waddle — the mass rolls more than the legs stride. */
  bloater: { cycleM: 1.15, legAmp: 0.26, armAmp: 0.2, bobM: 0.055, rollAmp: 0.09, lean: 0.06, asym: 0.25 },
  /** Nervous, quick, twitchy steps. */
  spitter: { cycleM: 1.05, legAmp: 0.4, armAmp: 0.3, bobM: 0.045, rollAmp: 0.04, lean: 0.05, asym: 0.35 },
} as const satisfies Record<string, GaitParams>;

export type GaitId = keyof typeof GAITS;

/** Advance a gait phase by the distance actually travelled. This is the
 *  whole no-glide law: phase is a function of metres, never of time. */
export function gaitPhaseAdvance(phase: number, distanceM: number, cycleM: number): number {
  if (cycleM <= 0) return phase;
  return phase + (Math.max(0, distanceM) / cycleM) * Math.PI * 2;
}

export interface GaitPose {
  /** Rotation.x offsets around the rig's pose bases. */
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  torsoAdd: number;
  /** Root offsets the caller adds over the grounded position. */
  bobY: number;
  rollZ: number;
}

const ZERO_POSE: GaitPose = { legL: 0, legR: 0, armL: 0, armR: 0, torsoAdd: 0, bobY: 0, rollZ: 0 };

/**
 * The pose at a phase. `blend` 0..1 scales every throw — callers drive
 * it from speed (0 at rest, 1 at a full stride) so a figure stopping
 * settles exactly onto its authored base pose instead of freezing
 * mid-swing, and a figure starting moves off smoothly.
 */
export function gaitPose(phase: number, p: GaitParams, blend: number): GaitPose {
  const b = Math.max(0, Math.min(1, blend));
  if (b <= 0) return ZERO_POSE;
  const s = Math.sin(phase);
  // the weak leg: phase-shifted and under-thrown (the limp)
  const sR = Math.sin(phase + p.asym * 0.7) * (1 - p.asym * 0.35);
  const legL = s * p.legAmp * b;
  let legR = -sR * p.legAmp * b;
  let armL: number;
  let armR: number;
  if (p.quadruped) {
    // forelimbs strike with the OPPOSITE hindlimb (diagonal pairs)
    armL = -sR * p.armAmp * b;
    armR = s * p.armAmp * b;
  } else {
    // arms counter-swing the same-side leg
    armL = -s * p.armAmp * b;
    armR = sR * p.armAmp * b;
  }
  // two footfalls per cycle -> the bob runs at twice the stride frequency
  const bobY = Math.abs(Math.sin(phase)) * p.bobM * b;
  const rollZ = Math.sin(phase) * p.rollAmp * b;
  const torsoAdd = p.lean * b;
  return { legL, legR, armL, armR, torsoAdd, bobY, rollZ };
}

/** Write a gait pose onto a rig, around the bases the builder posed. */
export function applyGaitPose(rig: FigureRig, pose: GaitPose): void {
  rig.legL.rotation.x = rig.pose.legLX + pose.legL;
  rig.legR.rotation.x = rig.pose.legRX + pose.legR;
  rig.armL.rotation.x = rig.pose.armLX + pose.armL;
  rig.armR.rotation.x = rig.pose.armRX + pose.armR;
  rig.torso.rotation.x = rig.pose.torsoX + pose.torsoAdd;
}

/** Return every gait-driven pivot to the authored base pose. */
export function relaxToBase(rig: FigureRig): void {
  applyGaitPose(rig, ZERO_POSE);
}

export interface StrikePose {
  armL: number;
  armR: number;
  torsoAdd: number;
  /** 0..1 — the strike's damage moment sits at the chop crossing. */
  chop: number;
}

/**
 * A melee strike arc over t 0..1: wind-up (arms rise forward, torso
 * coils back) for the first 45%, then the chop — both arms slash down
 * through the target. `chop` peaks as the arms cross the body line, so
 * callers can land damage on the visual instead of before it.
 */
export function strikePose(t: number): StrikePose {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.45) {
    const k = x / 0.45;
    const e = k * k; // ease-in: the wind-up gathers
    return { armL: -1.5 * e, armR: -1.7 * e, torsoAdd: -0.14 * e, chop: 0 };
  }
  const k = (x - 0.45) / 0.55;
  const e = 1 - (1 - k) * (1 - k); // ease-out: fast at the crossing
  return {
    armL: -1.5 + 2.1 * e,
    armR: -1.7 + 2.3 * e,
    torsoAdd: -0.14 + 0.36 * e,
    chop: Math.sin(Math.min(1, k * 1.15) * Math.PI),
  };
}

/** Duration (s) of one strike arc — the wind-up is a real dodge window. */
export const STRIKE_SEC = 0.42;
/** Fraction of the arc where the chop crosses and damage lands. */
export const STRIKE_HIT_AT = 0.5;

export interface IdlePose {
  torsoAdd: number;
  armSway: number;
  headYaw: number;
  headPitch: number;
}

/**
 * Idle life: breathing (slow torso swell + arm sway on the same clock)
 * and a wandering gaze. Deterministic in (time, seed) so tests can pin
 * it and two figures sharing a seed offset never sync up.
 */
export function idlePose(timeS: number, seed: number): IdlePose {
  const breath = Math.sin(timeS * 1.9 + seed * 12.9);
  const look = Math.sin(timeS * 0.37 + seed * 41.7) + Math.sin(timeS * 0.83 + seed * 7.3) * 0.5;
  return {
    torsoAdd: breath * 0.018,
    armSway: breath * 0.03,
    headYaw: Math.max(-0.6, Math.min(0.6, look * 0.35)),
    headPitch: Math.sin(timeS * 0.53 + seed * 23.1) * 0.06,
  };
}

/** Write an idle pose onto a rig (arms hang with the breath, head looks). */
export function applyIdlePose(rig: FigureRig, pose: IdlePose): void {
  rig.torso.rotation.x = rig.pose.torsoX + pose.torsoAdd;
  rig.armL.rotation.x = rig.pose.armLX + pose.armSway;
  rig.armR.rotation.x = rig.pose.armRX + pose.armSway;
  rig.head.rotation.y = pose.headYaw;
  rig.head.rotation.x = pose.headPitch;
}
