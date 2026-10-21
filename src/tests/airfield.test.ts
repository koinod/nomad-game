// airfield.test.ts — the ENVIRONMENT WAVE gate for the rebuilt airfield:
// the three kit buildings must pass the same kitQa audits as the
// lighthouse, sit ON their surveyed plateau, and not collide with each
// other. Integration into World.build waits for the render-gate verdict;
// this file proves the construction is sound before that call is made.

import { describe, expect, it } from 'vitest';
import { buildWorld, expectGate } from './buildings.test';
import { buildAirfield, AIRFIELD_LAYOUT } from '../game/Airfield';
import { heightAt, AIRBASE_CENTER, AIRBASE_GRADE } from '../game/World';

describe('airfield rebuild (kit, from scratch)', () => {
  const world = buildWorld();
  void world;
  const af = buildAirfield((x, z) => heightAt(x, z));

  it('builds hangar + depot + tower', () => {
    expect(af.ids).toEqual(['airfield_hangar', 'airfield_depot', 'airfield_tower']);
  });

  it('passes every kitQa audit (connectivity, colliders, stairs, roofs)', () => {
    expectGate(af.results.map((r) => r.building), 'airfield');
  });

  it('every footprint sits on the plateau at grade', () => {
    const [cx, cz] = AIRBASE_CENTER;
    for (const r of af.results) {
      const b = r.building;
      for (const [px, pz] of [
        [b.cx - b.w / 2, b.cz - b.d / 2], [b.cx + b.w / 2, b.cz - b.d / 2],
        [b.cx - b.w / 2, b.cz + b.d / 2], [b.cx + b.w / 2, b.cz + b.d / 2],
      ] as const) {
        expect(Math.abs(heightAt(px, pz) - AIRBASE_GRADE)).toBeLessThan(0.35);
      }
      expect(Math.abs(b.cx - cx)).toBeLessThan(120);
      expect(Math.abs(b.cz - cz)).toBeLessThan(75);
      void b;
    }
  });

  it('buildings do not overlap each other', () => {
    const boxes = af.results.map((r) => {
      const b = r.building;
      return { x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2, id: b.id };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]; const c = boxes[j];
        const overlap = a.x0 < c.x1 && c.x0 < a.x1 && a.z0 < c.z1 && c.z0 < a.z1;
        expect(overlap, `${a.id} x ${c.id}`).toBe(false);
      }
    }
  });

  it('the hangar front is a real entrance (open, passable, wide)', () => {
    const hangar = af.results[0].building;
    const entrances = hangar.doors.filter((d) => !d.interior);
    expect(entrances.length).toBeGreaterThanOrEqual(1);
    const widest = Math.max(...entrances.map((d) => d.w));
    expect(widest).toBeGreaterThanOrEqual(15); // aircraft-scale opening
    void AIRFIELD_LAYOUT;
  });

  it('loot containers exist in all three buildings', () => {
    for (const r of af.results) {
      expect(r.containers.length, r.building.id).toBeGreaterThanOrEqual(1);
    }
  });
});
