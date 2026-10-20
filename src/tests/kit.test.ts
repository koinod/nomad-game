// kit.test.ts — the BUILDING_STRATEGY kit + QA gate.
// A synthetic two-story house assembled from kit pieces must pass every
// audit; sabotaged variants must fail the specific audit they break.

import { describe, expect, it } from 'vitest';
import { Kit, KIT } from '../game/kit';
import { auditBuilding } from '../game/kitQa';

const FLAT = () => 2;

function syntheticHouse(withHole = true): Kit {
  const k = new Kit('test_house', 100, 50, 0, 1.92, 10, 9, 2);
  k.foundation();
  k.floorSlab(0);
  k.perimeter({
    story: 0, color: 0x9fb4a4, trim: 0x4a3826,
    door: { face: 'S', at: 0 },
    windows: [{ face: 'N', at: -2 }, { face: 'N', at: 2 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.divider({ axis: 'z', at: 0.5, from: -4.2, to: 4.2, color: 0x9fb4a4, doorAt: 0 });
  k.stairs({ x: 4.0, z: 2.4, dir: 'nz', story: 0, runLen: 4.8 });
  if (withHole) {
    k.floorSlabStairwell(1, [{ x0: 3.3, z0: -2.5, x1: 4.75, z1: 2.5 }]);
  } else {
    k.floorSlab(1);
  }
  k.perimeter({
    story: 1, color: 0x9fb4a4, trim: 0x4a3826,
    windows: [{ face: 'N', at: 0 }, { face: 'S', at: -2.5 }, { face: 'E', at: 0 }, { face: 'W', at: 0 }],
  });
  k.roofGable(1.6, 0x4a3a30, 0x9fb4a4);
  k.furnish({ kind: 'fridge', lx: -4.2, lz: -3.6, id: 't_fridge', loot: [] });
  k.furnish({ kind: 'dresser', lx: 3.4, lz: -3.8, story: 1, id: 't_dresser', loot: [] });
  k.roomPoint(-2.5, 0, 'west room');
  k.roomPoint(2.0, 3.5, 'east room');
  k.roomPoint(-2.5, 0.5, 'upstairs loft');
  return k;
}

describe('the kit', () => {
  it('keeps the strategy constants', () => {
    expect(KIT.WALL_H).toBe(3.0);
    expect(KIT.DOOR_W).toBe(0.95);
    expect(KIT.DOOR_H).toBe(2.1);
    expect(KIT.WALL_H - KIT.SLAB_T).toBeGreaterThanOrEqual(2.7);
    expect(KIT.RISER_MAX).toBeLessThanOrEqual(0.19);
    expect(KIT.TREAD_MIN).toBeGreaterThanOrEqual(0.28);
  });

  it('assembles a two-story house that passes the whole QA gate', () => {
    const res = syntheticHouse().finalize();
    const failures = auditBuilding(res.building, FLAT);
    expect(failures).toEqual([]);
  });

  it('fails the stair audit when the slab has no stairwell hole', () => {
    const res = syntheticHouse(false).finalize();
    const failures = auditBuilding(res.building, FLAT);
    expect(failures.some((f) => f.audit === 'stairs')).toBe(true);
  });

  it('fails the collider audit when a collider blocks the door opening', () => {
    const res = syntheticHouse().finalize();
    const b = res.building;
    const door = b.doors.find((d) => d.kind === 'door' && !d.interior)!;
    b.colliders.push({ x0: door.cx - 0.4, z0: door.cz - 0.15, x1: door.cx + 0.4, z1: door.cz + 0.15 });
    const failures = auditBuilding(b, FLAT);
    expect(failures.some((f) => f.audit === 'colliders')).toBe(true);
  });

  it('fails connectivity for a floating piece', () => {
    const res = syntheticHouse().finalize();
    const b = res.building;
    b.pieces.push({
      kind: 'beam', structural: true,
      x0: b.cx - 1, x1: b.cx + 1, y0: b.baseY + 40, y1: b.baseY + 40.3, z0: b.cz - 0.1, z1: b.cz + 0.1,
    });
    const failures = auditBuilding(b, FLAT);
    expect(failures.some((f) => f.audit === 'connectivity')).toBe(true);
  });

  it('fails reachability when the only door is walled off in plan', () => {
    const res = syntheticHouse().finalize();
    const b = res.building;
    // remove every exterior wall record's door opening: pretend the front
    // wall shipped solid by walling the doorway with a furniture collider
    const door = b.doors.find((d) => d.kind === 'door' && !d.interior)!;
    b.colliders.push({ x0: door.cx - 0.5, z0: door.cz - 0.4, x1: door.cx + 0.5, z1: door.cz + 0.4 });
    const failures = auditBuilding(b, FLAT);
    expect(failures.some((f) => f.audit === 'reachability')).toBe(true);
  });
});
