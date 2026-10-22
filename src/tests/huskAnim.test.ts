// huskAnim.test.ts — ORDER #6 Phase B1 integration pins: the real Husk
// class, driven through update(), must obey the animation laws —
//  1. NO GLIDE: gaitPhase is the integral of distance travelled.
//  2. STILLNESS: a husk that does not move does not stride, and its
//     limbs settle exactly onto the authored pose bases.
//  3. CRAWLER SCUTTLE: the forelimbs animate (they were frozen before
//     #6 — the class glided on its pose).
//  4. STRIKE ARC: entering attack starts a wind-up; the player's HP
//     does not move until the chop crosses (STRIKE_HIT_AT), then lands.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Husk, type HuskCtx } from '../game/Husks';
import { GAITS, STRIKE_SEC } from '../game/figureAnim';
import { mulberry32 } from '../game/rng';
import { useGameStore } from '../store/gameStore';

const groundY = (_x: number, _z: number) => 0;
function ctx(playerPos: THREE.Vector3): HuskCtx {
  return { playerPos, isNight: false, groundY, colliders: [], onHuskKilled: () => undefined, daysElapsed: 0 };
}
const rng = mulberry32(7);
const DT = 1 / 30;

describe('husk gait — distance-clocked (no glide)', () => {
  it('gaitPhase integrates the metres the body actually covered', () => {
    const h = new Husk('g1', 'shambler', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 20)); // inside the 25m sight band
    let path = 0;
    let px = h.group.position.x;
    let pz = h.group.position.z;
    for (let i = 0; i < 60; i++) {
      h.update(DT, c, rng);
      path += Math.hypot(h.group.position.x - px, h.group.position.z - pz);
      px = h.group.position.x;
      pz = h.group.position.z;
    }
    expect(h.state).toBe('hunt');
    expect(path).toBeGreaterThan(2.5); // it really closed distance
    const expected = (path / GAITS.shambler.cycleM) * Math.PI * 2;
    expect(Math.abs(h.gaitPhase - expected)).toBeLessThan(0.05);
    expect(h.gaitBlend).toBeGreaterThan(0.5);
  });

  it('a still husk does not stride and settles onto its pose bases', () => {
    const h = new Husk('g2', 'shambler', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 400)); // far beyond smell/sight
    h.state = 'idle';
    h.stateT = 0; // constructor randomizes stateT — pin it under the wander floor
    h.gaitBlend = 0.85; // pretend it was mid-stride a moment ago
    const rig = h.figureRig!;
    rig.legL.rotation.x = rig.pose.legLX + 0.3; // ...and mid-swing
    for (let i = 0; i < 45; i++) h.update(DT, c, rng); // 1.5s < idle->wander floor
    expect(h.gaitPhase).toBe(0);
    expect(h.gaitBlend).toBe(0);
    expect(rig.legL.rotation.x).toBeCloseTo(rig.pose.legLX, 6);
    expect(rig.legR.rotation.x).toBeCloseTo(rig.pose.legRX, 6);
  });
});

describe('crawler scuttle', () => {
  it('forelimbs and hindlimbs both animate while it closes', () => {
    const h = new Husk('g3', 'crawler', 0, 0, 'test', groundY);
    const c = ctx(new THREE.Vector3(0, 0, 24));
    const rig = h.figureRig!;
    let maxArm = 0;
    let maxLeg = 0;
    for (let i = 0; i < 90; i++) {
      h.update(DT, c, rng);
      maxArm = Math.max(maxArm, Math.abs(rig.armL.rotation.x - rig.pose.armLX));
      maxLeg = Math.max(maxLeg, Math.abs(rig.legL.rotation.x - rig.pose.legLX));
    }
    expect(maxArm).toBeGreaterThan(0.12);
    expect(maxLeg).toBeGreaterThan(0.12);
  });
});

describe('strike arc', () => {
  it('damage waits for the chop: wind-up first, HP moves at the crossing', () => {
    // damagePlayer only acts mid-game (screen gate) — put the store in play
    useGameStore.setState({ screen: 'game', dead: false, hp: 100 });
    const hp0 = useGameStore.getState().hp;
    const h = new Husk('g4', 'shambler', 0, 0, 'test', groundY);
    const pp = new THREE.Vector3(0, 0, 1.6);
    const c = ctx(pp);
    h.state = 'attack';
    h.attackCd = 0;
    h.update(0.02, c, rng); // first frame: the cooldown starts the arc
    expect(h.strikeT).toBeGreaterThan(0); // an arc really started
    let steps = 0;
    // wind-up steps: the arc runs but HP must not have moved yet
    while (h.strikeT > STRIKE_SEC * 0.55 && steps < 40) {
      h.update(0.02, c, rng);
      steps++;
      expect(useGameStore.getState().hp).toBe(hp0);
    }
    // run through the crossing
    for (let i = 0; i < 20 && useGameStore.getState().hp === hp0; i++) h.update(0.02, c, rng);
    expect(useGameStore.getState().hp).toBeLessThan(hp0);
  });

  it('walking out of reach mid-wind-up makes the strike whiff', () => {
    useGameStore.setState({ screen: 'game', dead: false, hp: 100 });
    const hp0 = useGameStore.getState().hp;
    const h = new Husk('g5', 'shambler', 0, 0, 'test', groundY);
    const pp = new THREE.Vector3(0, 0, 1.6);
    const c = ctx(pp);
    h.state = 'attack';
    h.attackCd = 0;
    h.update(0.02, c, rng); // arc starts
    expect(h.strikeT).toBeGreaterThan(0);
    pp.set(0, 0, 30); // gone before the chop
    for (let i = 0; i < 40; i++) h.update(0.02, c, rng);
    expect(useGameStore.getState().hp).toBe(hp0);
  });
});
