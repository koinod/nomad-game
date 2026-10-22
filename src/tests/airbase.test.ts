// airbase.test.ts — the gate for the REVAMPED AIRBASE + FLEET RESPAWN
// (Ian's order, 2026-10-21: "respawn all vehicles at a revamped airbase
// properly made"). Supersedes airfield.test.ts (the environment-wave
// gate for the unwired kit): the kit is wired into World.build now, the
// depot is rebuilt as the ops building, a fuel point joins, and the
// fleet's spawns derive from marked pads.
//
// The airbase is a PORTABLE kit: everything below runs off the site
// data (airbaseSite.ts), sited on the Beta Island airbase sector pad
// (the map integration's one-edit re-site, 2026-10-21). These
// assertions are written against the site transform, not hard-coded
// world numbers (the few world numbers asserted are the standing
// contracts: the sector pad grade and the Seahawk pad).

import { describe, expect, it } from 'vitest';
import { buildWorld, expectGate } from './buildings.test';
import { buildAirfield } from '../game/Airfield';
import { buildAirbaseSite, APRON_LOCAL } from '../game/airbase';
import {
  AIRBASE_PADS, AIRBASE_SITE, padById, padWorld,
} from '../game/airbaseSite';
import { auditDaylight, type QaFailure } from '../game/kitQa';
import { heightAt } from '../game/World';
import { BETA_POI_PLACEMENTS, betaSector } from '../data/betaLayout';

/** The airbase sector pad's surveyed grade (betaLayout — the source
 *  of truth since the map integration, 2026-10-21). */
const AIRBASE_GRADE = betaSector('airbase').padY;
import { SEAHAWK_PAD, VEHICLE_DEFS, VEHICLE_SPAWNS } from '../game/Vehicles';
import { NPC_PLACEMENTS } from '../data/worldWiring';

/** The Prime's overall height from Ian's spec sheet (fleet canon) —
 *  the tallest vehicle the hangar mouth and fuel canopy must clear. */
const PRIME_HEIGHT_M = 3.92;

function expectDaylight(buildings: Parameters<typeof auditDaylight>[0][]): void {
  const out: QaFailure[] = [];
  for (const b of buildings) auditDaylight(b, out);
  const summary = out.map((f) => `[${f.audit}] ${f.building}: ${f.msg}`).join('\n');
  expect(out, `daylight failures:\n${summary}`).toEqual([]);
}

describe('revamped airbase (portable kit, Beta siting)', () => {
  const world = buildWorld();
  const af = buildAirfield((x, z) => heightAt(x, z));
  const site = buildAirbaseSite((x, z) => heightAt(x, z));
  const byId = new Map(af.results.map((r) => [r.building.id, r]));

  it('builds hangar + ops/depot + tower + fuel point', () => {
    expect(af.ids).toEqual(['airfield_hangar', 'airfield_depot', 'airfield_tower', 'airbase_fuel']);
    expect(site.kits.map((k) => k.building.id)).toEqual(af.ids);
    expect(world.airfieldKits).toHaveLength(4);
    expect(world.airfieldPropColliders.length).toBeGreaterThanOrEqual(5);
  });

  it('passes every kitQa audit (connectivity, colliders, stairs, roofs, reachability)', () => {
    expectGate(af.results.map((r) => r.building), 'airbase');
  });

  it('passes the daylight audit — no pitch-black interiors', () => {
    expectDaylight(af.results.map((r) => r.building));
  });

  it('the site IS the Beta airbase POI, on its sector pad', () => {
    const placement = BETA_POI_PLACEMENTS.find((p) => p.poiId === 'airbase')!;
    expect(AIRBASE_SITE.origin).toEqual([placement.x, placement.z]);
    expect(world.poiPositions['airbase']).toEqual(AIRBASE_SITE.origin);
  });

  it('every footprint sits on the sector pad at grade', () => {
    const [cx, cz] = AIRBASE_SITE.origin;
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

  it('ground floors are single slabs (the striped-floor class stays dead)', () => {
    for (const id of ['airfield_hangar', 'airfield_depot', 'airfield_tower']) {
      const b = byId.get(id)!.building;
      const slabs = b.pieces.filter((p) => p.kind === 'floor' && p.y0 < b.baseY + 1);
      expect(slabs, id).toHaveLength(1);
    }
  });

  it('loot containers exist across the airbase, ids unique with the lighthouse merge', () => {
    const airIds = af.results.flatMap((r) => r.containers.map((c) => c.id));
    expect(airIds.length).toBeGreaterThanOrEqual(8);
    const all = [...airIds, ...world.lighthouseKit.containers.map((c) => c.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  describe('the hangar drive-in', () => {
    const hangar = byId.get('airfield_hangar')!.building;

    it('the mouth is a true 20 m clear span at real clear height', () => {
      const mouth = hangar.doors.find((d) => d.kind === 'open');
      expect(mouth).toBeDefined();
      expect(mouth!.w).toBe(20);
      // the record states the physical aperture: beam underside 5.5 m —
      // clears the tallest vehicle in the fleet with margin
      expect(mouth!.h).toBeCloseTo(5.5, 5);
      expect(mouth!.h).toBeGreaterThanOrEqual(PRIME_HEIGHT_M + 0.5);
      const prime = VEHICLE_DEFS.find((d) => d.id === 'nomad_prime')!;
      expect(mouth!.w).toBeGreaterThanOrEqual(prime.width + 2);
    });

    it('no post stands in the mouth: the recorded span is collision-clear', () => {
      const mouth = hangar.doors.find((d) => d.kind === 'open')!;
      // the span the record claims, on the front plane: nothing may
      // collide inside it (posts moved to ±10/±17.6 — OUTSIDE the span)
      for (const c of hangar.colliders) {
        const inSpanX = c.x1 > mouth.cx - mouth.w / 2 + 0.05 && c.x0 < mouth.cx + mouth.w / 2 - 0.05;
        const onPlane = Math.abs((c.z0 + c.z1) / 2 - mouth.cz) < 1.2;
        expect(inSpanX && onPlane, `collider [${c.x0},${c.z0}]-[${c.x1},${c.z1}] in the mouth`).toBe(false);
      }
    });

    it('the interior drive lane is furniture-free, back wall to mouth', () => {
      const lane = {
        x0: hangar.cx - 5, x1: hangar.cx + 5,
        z0: hangar.cz - hangar.d / 2 + 0.3, z1: hangar.cz + hangar.d / 2,
      };
      for (const c of hangar.colliders) {
        const ox = Math.min(lane.x1, c.x1) - Math.max(lane.x0, c.x0);
        const oz = Math.min(lane.z1, c.z1) - Math.max(lane.z0, c.z0);
        expect(ox > 0.02 && oz > 0.02, `collider in the drive lane: [${c.x0},${c.z0}]-[${c.x1},${c.z1}]`).toBe(false);
      }
    });
  });

  describe('the ops building + quartermaster', () => {
    const ops = byId.get('airfield_depot')!.building;

    it('the quartermaster stands at the armory counter (NPC placement == kit npcPoint)', () => {
      expect(ops.npcPoints).toHaveLength(1);
      const qm = NPC_PLACEMENTS.find((p) => p.key === 'quartermaster')!;
      const [ox, oz] = AIRBASE_SITE.origin;
      expect(Math.abs(ox + qm.dx - ops.npcPoints[0].x)).toBeLessThan(0.05);
      expect(Math.abs(oz + qm.dz - ops.npcPoints[0].z)).toBeLessThan(0.05);
      // and the point is inside the building he works in
      expect(Math.abs(ops.npcPoints[0].x - ops.cx)).toBeLessThan(ops.w / 2);
      expect(Math.abs(ops.npcPoints[0].z - ops.cz)).toBeLessThan(ops.d / 2);
    });

    it('a worked interior: workshop bay open, armory shutter shut, both halves furnished', () => {
      const bays = ops.doors.filter((d) => d.kind === 'bay');
      expect(bays).toHaveLength(1); // the open bay; the shut one records no door — it is a wall
      const ids = ops.containers.map((c) => c.id);
      expect(ids).toContain('depot_toolbox_1');
      expect(ids).toContain('depot_cabinet');
    });
  });

  describe('the fuel point', () => {
    const fuel = byId.get('airbase_fuel')!.building;

    it('canopy clear height clears the Prime', () => {
      expect(fuel.roofSeatY).toBeDefined();
      expect(fuel.roofSeatY! - fuel.baseY).toBeCloseTo(4.7, 5);
      expect(fuel.roofSeatY! - fuel.baseY).toBeGreaterThan(PRIME_HEIGHT_M + 0.5);
    });

    it('the drum cache stocks fuel', () => {
      const drums = fuel.containers.find((c) => c.id === 'fuel_drums');
      expect(drums).toBeDefined();
      expect(drums!.loot.some((l) => l.id === 'fuel_can')).toBe(true);
    });

    it('sits on the apron', () => {
      const [lx, lz] = [fuel.cx - AIRBASE_SITE.origin[0], fuel.cz - AIRBASE_SITE.origin[1]];
      expect(Math.abs(lx - APRON_LOCAL.cx) + fuel.w / 2).toBeLessThanOrEqual(APRON_LOCAL.w / 2 + 0.01);
      expect(Math.abs(lz - APRON_LOCAL.cz) + fuel.d / 2).toBeLessThanOrEqual(APRON_LOCAL.d / 2 + 0.01);
    });
  });
});

describe('fleet respawn — the pads (Ian, 2026-10-21)', () => {
  const world = buildWorld();
  void world;
  const poi = AIRBASE_SITE.origin;

  it('every pad sits on the grade, on the apron, clear of every building', () => {
    const af = buildAirfield((x, z) => heightAt(x, z));
    const footprints = af.results.map((r) => r.building);
    for (const pad of AIRBASE_PADS) {
      const { x, z } = padWorld(pad.id);
      expect(Math.abs(heightAt(x, z) - AIRBASE_GRADE), pad.id).toBeLessThan(0.05);
      // on the apron (pad coords are site-local, the apron rect is too)
      expect(Math.abs(pad.lx - APRON_LOCAL.cx) + pad.hx).toBeLessThanOrEqual(APRON_LOCAL.w / 2 + 0.01);
      expect(Math.abs(pad.lz - APRON_LOCAL.cz) + pad.hz).toBeLessThanOrEqual(APRON_LOCAL.d / 2 + 0.01);
      // clear of buildings
      for (const b of footprints) {
        const overlap = x - pad.hx < b.cx + b.w / 2 && b.cx - b.w / 2 < x + pad.hx
          && z - pad.hz < b.cz + b.d / 2 && b.cz - b.d / 2 < z + pad.hz;
        expect(overlap, `${pad.id} x ${b.id}`).toBe(false);
      }
    }
  });

  it('pads do not overlap each other', () => {
    for (let i = 0; i < AIRBASE_PADS.length; i++) {
      for (let j = i + 1; j < AIRBASE_PADS.length; j++) {
        const a = AIRBASE_PADS[i]; const c = AIRBASE_PADS[j];
        const overlap = Math.abs(a.lx - c.lx) < a.hx + c.hx && Math.abs(a.lz - c.lz) < a.hz + c.hz;
        expect(overlap, `${a.id} x ${c.id}`).toBe(false);
      }
    }
  });

  it('each vehicle fits its pad with swing margin', () => {
    for (const pad of AIRBASE_PADS) {
      if (!pad.vehicleId) continue;
      const def = VEHICLE_DEFS.find((d) => d.id === pad.vehicleId)!;
      expect(pad.hx * 2, pad.id).toBeGreaterThanOrEqual(def.length + 1.5);
      expect(pad.hz * 2, pad.id).toBeGreaterThanOrEqual(def.width + 1.5);
    }
  });

  it('the Seahawk pad keeps its contract exactly', () => {
    const w = padWorld('pad_seahawk');
    expect(w.x).toBe(SEAHAWK_PAD.x);
    expect(w.z).toBe(SEAHAWK_PAD.z);
    expect(w.heading).toBe(SEAHAWK_PAD.heading);
  });

  it('every spawn is an airbase pad: fresh starts put the fleet on its marks', () => {
    expect(VEHICLE_SPAWNS).toHaveLength(3);
    for (const s of VEHICLE_SPAWNS) {
      expect(s.poi, s.id).toBe('airbase');
      const pad = AIRBASE_PADS.find((p) => p.vehicleId === s.id)!;
      expect(pad, s.id).toBeDefined();
      const w = padWorld(pad.id);
      expect(poi[0] + s.dx).toBeCloseTo(w.x, 5);
      expect(poi[1] + s.dz).toBeCloseTo(w.z, 5);
      expect(s.heading).toBe(w.heading);
      // the pad name is painted on the apron (the pad table is the paint list)
      expect(padById(pad.id).label.length).toBeGreaterThan(0);
    }
  });

  it('the Dark Horse pad is marked and honestly empty', () => {
    const dh = padById('pad_dark_horse');
    expect(dh.vehicleId).toBeUndefined();
    expect(VEHICLE_SPAWNS.some((s) => s.id === 'dark_horse')).toBe(false);
  });
});
