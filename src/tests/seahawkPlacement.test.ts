import { describe, it, expect } from 'vitest';
import { SEAHAWK_PAD, SEAHAWK_GLB_PATH } from '../game/Vehicles';
import { initTerrainField, heightAt, AIRBASE_CENTER, AIRBASE_GRADE } from '../game/World';

// Stage 5 (Lane 2): the Seahawk is a static landmark, not a vehicle —
// these tests pin the placement contract only: the pad sits on the
// airbase plateau's surveyed grade (gear plane = terrain height, so it
// neither floats nor sinks), inside the plateau's flat core with room
// for the 16.36 m rotor disk, and the asset path matches the merged
// lane's public file.
initTerrainField(1337);

describe('Seahawk staged placement', () => {
  it('serves the merged lane asset', () => {
    expect(SEAHAWK_GLB_PATH).toBe('/seahawk.glb');
  });

  it('pad sits on the surveyed airbase grade', () => {
    expect(heightAt(SEAHAWK_PAD.x, SEAHAWK_PAD.z)).toBeCloseTo(AIRBASE_GRADE, 5);
  });

  it('pad is on the plateau near the hangar apron point', () => {
    const [cx, cz] = AIRBASE_CENTER;
    expect(SEAHAWK_PAD.x).toBe(cx - 18);
    expect(SEAHAWK_PAD.z).toBe(cz - 10);
    // rotor disk radius 8.18 m stays inside the flat core (|dx|<128, |dz|<78)
    expect(Math.abs(SEAHAWK_PAD.x - cx) + 8.18).toBeLessThan(128);
    expect(Math.abs(SEAHAWK_PAD.z - cz) + 8.18).toBeLessThan(78);
  });

  it('ground is flat across the gear triangle (no tilt on the pad)', () => {
    // gear contact points, model space -> world via the pad heading:
    // mains at local x 2.42 / width +-1.42, tail at local x -6.48
    const h = SEAHAWK_PAD.heading;
    const pts: [number, number][] = [
      [2.42, 1.42],
      [2.42, -1.42],
      [-6.48, 0],
    ];
    for (const [lx, lz] of pts) {
      const wx = SEAHAWK_PAD.x + lx * Math.sin(h) + lz * Math.cos(h);
      const wz = SEAHAWK_PAD.z + lx * Math.cos(h) - lz * Math.sin(h);
      expect(heightAt(wx, wz)).toBeCloseTo(AIRBASE_GRADE, 5);
    }
  });
});
