import { describe, expect, it } from 'vitest';
import { carSeatPose, CAR_SEATS } from '../game/Player';

/**
 * ITEM 5 (Ian playtest, 2026-10-21): "my legs were falling thru the
 * car" — the seated avatar used a hand-sunk feet offset (gy −0.66)
 * that put the hip 0.35 m UNDER the cushion and, with a fixed −1.25
 * thigh angle, speared the boots through the floorboard. The pose is
 * now solved from the rig's proportions + the car's interior. These
 * are the no-clip invariants, for both cars and both body heights.
 */
describe('carSeatPose — solved from the interior, not sunk by hand', () => {
  for (const [id, spec] of Object.entries(CAR_SEATS)) {
    for (const H of [1.8, 1.73]) {
      it(`${id} @ H=${H}: hip in the bucket, feet on the floorboard, head under the roof`, () => {
        const p = carSeatPose(H, spec);
        // hip rests IN the bucket: at or just below the cushion top
        expect(p.hipY).toBeLessThanOrEqual(spec.cushionY + 0.001);
        expect(p.hipY).toBeGreaterThanOrEqual(spec.cushionY - 0.18);
        // feet ON the floorboard — not through it, not floating
        expect(p.footY).toBeGreaterThanOrEqual(spec.floorY - 0.005);
        expect(p.footY).toBeLessThanOrEqual(spec.floorY + 0.03);
        // head clears the inner roof line
        expect(p.headTop).toBeLessThanOrEqual(spec.roofY + 0.01);
        // eyes inside the cabin, above the dash line
        expect(p.eyeY).toBeLessThan(spec.roofY);
        expect(p.eyeY).toBeGreaterThan(spec.cushionY + 0.5);
        // a believable seated thigh angle — the cars solve ~-1.25;
        // the Nomad Prime's high cab solves steeper (~-1.43): legs
        // drop from a captain's chair to a floorboard 0.26 m under
        // the cushion, so the band runs to -1.5, not the cars' -1.4
        expect(p.thighX).toBeLessThan(-1.0);
        expect(p.thighX).toBeGreaterThan(-1.5);
      });
    }
  }

  it('the old failure mode is measurably gone (vs the hand-sunk gy −0.66)', () => {
    // with gy −0.66 and thigh −1.25, the hip sat at −0.66+0.864 = 0.20
    // (0.36 under the GT500 cushion) and the foot at ~ −0.06 (0.22
    // BELOW its floorboard). The solved pose puts both on their
    // surfaces (asserted above); pin the deltas so the regression
    // is a number, not a vibe.
    const p = carSeatPose(1.8, CAR_SEATS.gt500);
    expect(p.hipY).toBeGreaterThan(0.2 + 0.15);
    expect(p.footY).toBeGreaterThan(-0.06 + 0.15);
  });
});
