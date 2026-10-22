// figureAnim.test.ts — ORDER #6 Phase B1 pins for the shared gait driver.
//
// The laws under test:
//  1. NO GLIDE — phase advances from metres travelled only; zero
//     distance means zero phase, whatever the clock says.
//  2. COHERENCE — one full cycle per cycleM metres, for every gait.
//  3. SETTLE — blend 0 is exactly the authored base pose (a stopping
//     figure lands on its stance, never frozen mid-swing).
//  4. OPPOSITION — biped legs counter-swing; the crawler's diagonal
//     pairs (armL+legR / armR+legL) move together instead.
//  5. JOINT EXTREMES — at every phase, every pivot offset stays inside
//     the gait's rated throws (the joint-continuity budget: poses rotate
//     around authored bases and nothing exceeds the table).
//  6. STRIKE — the chop crosses after the wind-up, never before.

import { describe, expect, it } from 'vitest';
import {
  GAITS, gaitPhaseAdvance, gaitPose, strikePose, idlePose,
  STRIKE_HIT_AT, type GaitParams,
} from '../game/figureAnim';

const ALL_GAITS = Object.entries(GAITS) as [string, GaitParams][];

describe('gait phase — the no-glide law', () => {
  it('zero distance advances zero phase, for every gait', () => {
    for (const [, p] of ALL_GAITS) {
      expect(gaitPhaseAdvance(1.23, 0, p.cycleM)).toBe(1.23);
    }
  });

  it('one cycleM of travel is exactly one full cycle, for every gait', () => {
    for (const [, p] of ALL_GAITS) {
      const end = gaitPhaseAdvance(0, p.cycleM, p.cycleM);
      expect(end).toBeCloseTo(Math.PI * 2, 9);
    }
  });

  it('phase is linear in distance (no time term can sneak in)', () => {
    const p = GAITS.shambler;
    const a = gaitPhaseAdvance(0, 0.4, p.cycleM);
    const b = gaitPhaseAdvance(a, 0.4, p.cycleM);
    expect(b).toBeCloseTo(gaitPhaseAdvance(0, 0.8, p.cycleM), 9);
  });

  it('negative distance never rewinds the stride', () => {
    expect(gaitPhaseAdvance(2, -5, GAITS.human.cycleM)).toBe(2);
  });
});

describe('gait pose', () => {
  it('blend 0 is the zero pose — figures settle onto their stance', () => {
    for (const [, p] of ALL_GAITS) {
      for (const phase of [0, 0.7, 2.4, 5.9]) {
        expect(gaitPose(phase, p, 0)).toEqual({
          legL: 0, legR: 0, armL: 0, armR: 0, torsoAdd: 0, bobY: 0, rollZ: 0,
        });
      }
    }
  });

  it('biped legs counter-swing: opposite signs at mid-stride', () => {
    for (const [id, p] of ALL_GAITS) {
      if (p.quadruped) continue;
      const pose = gaitPose(Math.PI / 2, p, 1);
      expect(Math.sign(pose.legL), id).toBe(1);
      expect(Math.sign(pose.legR), id).toBe(-1);
      // arms counter-swing the same-side leg
      expect(Math.sign(pose.armL), id).toBe(-1);
      expect(Math.sign(pose.armR), id).toBe(1);
    }
  });

  it('crawler moves in diagonal pairs (armL with legR, armR with legL)', () => {
    const p = GAITS.crawler;
    for (const phase of [0.4, 1.8, 3.3, 5.1]) {
      const pose = gaitPose(phase, p, 1);
      expect(Math.sign(pose.armL)).toBe(Math.sign(pose.legR));
      expect(Math.sign(pose.armR)).toBe(Math.sign(pose.legL));
      expect(Math.abs(pose.armL)).toBeGreaterThan(0);
    }
  });

  it('joint extremes stay inside the rated throws at every phase', () => {
    for (const [id, p] of ALL_GAITS) {
      for (let i = 0; i < 64; i++) {
        const pose = gaitPose((i / 64) * Math.PI * 2, p, 1);
        expect(Math.abs(pose.legL), id).toBeLessThanOrEqual(p.legAmp + 1e-9);
        expect(Math.abs(pose.legR), id).toBeLessThanOrEqual(p.legAmp + 1e-9);
        expect(Math.abs(pose.armL), id).toBeLessThanOrEqual(p.armAmp + 1e-9);
        expect(Math.abs(pose.armR), id).toBeLessThanOrEqual(p.armAmp + 1e-9);
        expect(pose.bobY, id).toBeGreaterThanOrEqual(0);
        expect(pose.bobY, id).toBeLessThanOrEqual(p.bobM + 1e-9);
        expect(Math.abs(pose.rollZ), id).toBeLessThanOrEqual(p.rollAmp + 1e-9);
      }
    }
  });

  it('the limp is real: the shambler right leg under-throws the left', () => {
    const p = GAITS.shambler;
    let maxL = 0;
    let maxR = 0;
    for (let i = 0; i < 128; i++) {
      const pose = gaitPose((i / 128) * Math.PI * 2, p, 1);
      maxL = Math.max(maxL, Math.abs(pose.legL));
      maxR = Math.max(maxR, Math.abs(pose.legR));
    }
    expect(maxR).toBeLessThan(maxL * 0.85);
  });

  it('bob runs at two footfalls per cycle', () => {
    const p = GAITS.human;
    // peaks at phase π/2 and 3π/2, zero at 0 and π
    expect(gaitPose(0, p, 1).bobY).toBeCloseTo(0, 9);
    expect(gaitPose(Math.PI / 2, p, 1).bobY).toBeCloseTo(p.bobM, 9);
    expect(gaitPose(Math.PI, p, 1).bobY).toBeCloseTo(0, 9);
    expect(gaitPose((3 * Math.PI) / 2, p, 1).bobY).toBeCloseTo(p.bobM, 9);
  });
});

describe('strike arc', () => {
  it('wind-up first: arms rise (negative) before the chop crosses', () => {
    const early = strikePose(0.2);
    expect(early.armR).toBeLessThan(0);
    expect(early.chop).toBe(0);
    const late = strikePose(0.95);
    expect(late.armR).toBeGreaterThan(0.3);
  });

  it('the chop peaks at the rated hit moment, not at the ends', () => {
    const atHit = strikePose(STRIKE_HIT_AT).chop;
    expect(atHit).toBeGreaterThan(strikePose(0.46).chop);
    expect(atHit).toBeGreaterThanOrEqual(strikePose(1).chop);
  });

  it('t clamps outside 0..1', () => {
    expect(strikePose(-1)).toEqual(strikePose(0));
    expect(strikePose(2)).toEqual(strikePose(1));
  });
});

describe('idle life', () => {
  it('breathing is bounded and seed-separated figures never sync', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const a = idlePose(t, 0.13);
      const b = idlePose(t, 0.71);
      expect(Math.abs(a.torsoAdd)).toBeLessThanOrEqual(0.018 + 1e-9);
      expect(Math.abs(a.headYaw)).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(a.torsoAdd).not.toBeCloseTo(b.torsoAdd, 3);
    }
  });
});
