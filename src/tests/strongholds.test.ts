// strongholds.test.ts — the gate for the SECTOR STRONGHOLD KITS
// (Spec §3.2 build-out, design-refs/world-specs/beta-island-spec-v1.md).
//
// Six strongholds, one discipline: every enclosed structure is a kit
// building that passes the kitQa gate (connectivity, colliders, doors,
// stairs, scale, roofs, reachability) and the daylight audit; every
// named structure the spec calls for EXISTS as data (a kit building
// id in sectorSites.ts or a tagged SectorFeature from the ground
// works); and the whole build respects the map's standing law —
// footprints on their surveyed pads, clear of the road corridors and
// the world crafting stations, and nothing in the water except the
// harbor works that are water structures by design.

import { describe, expect, it } from 'vitest';
import { buildWorld, expectGate } from './buildings.test';
import { buildSectors, type SectorFeature } from '../game/Sectors';
import { SECTOR_BUILDINGS, resolveSpotWorld, spotSectorId } from '../game/sectorSites';
import { auditDaylight, type QaFailure } from '../game/kitQa';
import { heightAt } from '../game/World';
import { betaRoadDistance } from '../game/betaTerrain';
import {
  BETA_EXTRA_PADS, BETA_POI_PLACEMENTS, BETA_SECTORS, betaSector,
} from '../data/betaLayout';
import { WORLD_STATION_PLACEMENTS } from '../data/stations';
import type { KitBuilding } from '../game/kit';

// buildWorld() first: it installs the headless canvas stub the kit
// decals need, and gives the wiring test its world in the same pass.
const world = buildWorld();
const built = buildSectors((x, z) => heightAt(x, z));
const kitsById = new Map(built.kits.map((r) => [r.building.id, r]));
const featuresById = new Map(built.features.map((f) => [f.id, f]));

const EXPECTED_KITS: Record<string, string[]> = {
  ridge: ['ridge_bunker', 'ridge_tower', 'ridge_ops'],
  citadel: [
    'citadel_gate_w', 'citadel_gate_e', 'citadel_container_office',
    'citadel_container_store', 'citadel_truck_hall',
  ],
  lighthouse: ['lighthouse_radar', 'lighthouse_lab_a', 'lighthouse_lab_b', 'lighthouse_shed'],
  refuge: ['refuge_chapel', 'refuge_greenhouse_a', 'refuge_greenhouse_b'],
  pier_hq: ['pier_icehouse', 'pier_shed', 'pier_boardwalk'],
  tern_rock: [
    'tern_cottage_a', 'tern_cottage_b', 'tern_cottage_c',
    'tern_store', 'tern_garage', 'tern_fuel_dock',
  ],
};

const EXPECTED_FEATURES: Record<string, string[]> = {
  ridge: ['ridge_helipad', 'ridge_mast', 'ridge_sandbags_a', 'ridge_sandbags_b', 'ridge_revetment', 'ridge_hardstand'],
  citadel: [
    'citadel_fortress_t1', 'citadel_fortress_t2', 'citadel_fortress_t3',
    'citadel_gantry', 'citadel_refinery', 'citadel_floodlight_a', 'citadel_floodlight_b',
  ],
  refuge: ['refuge_palisade_n', 'refuge_palisade_s', 'refuge_palisade_w', 'refuge_palisade_e', 'refuge_filtration'],
  pier_hq: ['pier_slip_a', 'pier_slip_b', 'pier_palisade'],
};

/** Open-air decks: floored, railed, walkable — but not interiors, so
 *  the daylight audit (an enclosed-room instrument) does not apply. */
const OPEN_AIR = new Set(['pier_boardwalk', 'tern_fuel_dock']);
/** Structures that stand over water BY DESIGN (harbor works). */
const WATER_STRUCTURES = new Set(['pier_boardwalk', 'tern_fuel_dock']);
/** The gate towers flank the causeway on purpose. */
const GATE_TOWERS = new Set(['citadel_gate_w', 'citadel_gate_e']);

function piecesAabb(b: KitBuilding): { x0: number; x1: number; z0: number; z1: number } {
  return {
    x0: Math.min(...b.pieces.map((p) => p.x0)),
    x1: Math.max(...b.pieces.map((p) => p.x1)),
    z0: Math.min(...b.pieces.map((p) => p.z0)),
    z1: Math.max(...b.pieces.map((p) => p.z1)),
  };
}

function padRect(sectorId: string): { x0: number; x1: number; z0: number; z1: number } {
  if (sectorId === 'citadel') {
    // the truck hall stands on the yard pad — handled by caller
  }
  const s = betaSector(sectorId);
  return { x0: s.x - s.padHalf[0], x1: s.x + s.padHalf[0], z0: s.z - s.padHalf[1], z1: s.z + s.padHalf[1] };
}

describe('sector stronghold kits (Spec §3.2)', () => {
  it('every named kit structure exists in the site data, per sector', () => {
    for (const [sector, ids] of Object.entries(EXPECTED_KITS)) {
      const spots = SECTOR_BUILDINGS.filter((s) => spotSectorId(s) === sector).map((s) => s.id);
      expect(spots, `${sector} kit spots`).toEqual(expect.arrayContaining(ids));
      for (const id of ids) expect(kitsById.has(id), `${id} built`).toBe(true);
    }
    expect(built.kits).toHaveLength(24);
  });

  it('every named ground-works structure exists as a tagged feature', () => {
    for (const [sector, ids] of Object.entries(EXPECTED_FEATURES)) {
      for (const id of ids) {
        const f = featuresById.get(id);
        expect(f, `${id} feature`).toBeDefined();
        expect(f!.sector, `${id} sector`).toBe(sector);
      }
    }
  });

  it('passes every kitQa audit over all 24 buildings', () => {
    expectGate(built.kits.map((r) => r.building), 'strongholds');
  });

  it('passes the daylight audit — no pitch-black interiors', () => {
    const out: QaFailure[] = [];
    for (const r of built.kits) {
      if (OPEN_AIR.has(r.building.id)) continue;
      auditDaylight(r.building, out);
    }
    const summary = out.map((f) => `[${f.audit}] ${f.building}: ${f.msg}`).join('\n');
    expect(out, `daylight failures:\n${summary}`).toEqual([]);
  });

  it('the fortress stacks three tiers in a U', () => {
    const t1 = featuresById.get('citadel_fortress_t1')!;
    const t2 = featuresById.get('citadel_fortress_t2')!;
    const t3 = featuresById.get('citadel_fortress_t3')!;
    // each higher tier stands within the ground tier's plan (feature
    // boxes round unit extents to the decimeter; 0.6 m of slack)
    for (const t of [t2, t3]) {
      expect(t.x - t.hx).toBeGreaterThanOrEqual(t1.x - t1.hx - 0.6);
      expect(t.x + t.hx).toBeLessThanOrEqual(t1.x + t1.hx + 0.6);
      expect(t.z - t.hz).toBeGreaterThanOrEqual(t1.z - t1.hz - 0.6);
      expect(t.z + t.hz).toBeLessThanOrEqual(t1.z + t1.hz + 0.6);
    }
    // the ground tier's seven units collide (footprints in prop colliders)
    const inFortress = built.propColliders.filter((c) =>
      c.x0 >= t1.x - t1.hx - 0.1 && c.x1 <= t1.x + t1.hx + 0.1 &&
      c.z0 >= t1.z - t1.hz - 0.1 && c.z1 <= t1.z + t1.hz + 0.1);
    expect(inFortress.length).toBeGreaterThanOrEqual(7);
  });

  it('named structures carry their defining records', () => {
    // the truck hall's drive-in mouth: a 12 m+ open entrance record
    const hall = kitsById.get('citadel_truck_hall')!.building;
    const mouth = hall.doors.find((d) => d.kind === 'open');
    expect(mouth).toBeDefined();
    expect(mouth!.w).toBeGreaterThanOrEqual(12);
    expect(mouth!.h).toBeGreaterThanOrEqual(4);
    // the chapel is two rooms: sanctuary + infirmary
    const chapel = kitsById.get('refuge_chapel')!.building;
    const labels = chapel.roomPoints.map((p) => p.label);
    expect(labels).toContain('chapel sanctuary');
    expect(labels).toContain('infirmary');
    // the greenhouses are glazed on every face
    for (const id of ['refuge_greenhouse_a', 'refuge_greenhouse_b']) {
      expect(kitsById.get(id)!.building.windows!.length).toBeGreaterThanOrEqual(8);
    }
    // the boardwalk's floor is a real walking deck over the shallows
    const bw = kitsById.get('pier_boardwalk')!.building;
    expect(bw.floors).toHaveLength(1);
    expect(bw.floors[0].y).toBeGreaterThan(2.2);
    expect(bw.floors[0].y).toBeLessThan(2.4);
  });

  it('kit footprints stand on their surveyed pads', () => {
    const yard = BETA_EXTRA_PADS.find((p) => p.id === 'citadel_yard')!;
    for (const spot of SECTOR_BUILDINGS) {
      if (WATER_STRUCTURES.has(spot.id)) continue;
      const b = kitsById.get(spot.id)!.building;
      const a = piecesAabb(b);
      const pad = spot.id === 'citadel_truck_hall'
        ? { x0: yard.x - yard.half[0], x1: yard.x + yard.half[0], z0: yard.z - yard.half[1], z1: yard.z + yard.half[1] }
        : padRect(spotSectorId(spot));
      const m = 1.0; // foundation overhang + detail tolerance
      expect(a.x0, `${spot.id} west edge`).toBeGreaterThanOrEqual(pad.x0 - m);
      expect(a.x1, `${spot.id} east edge`).toBeLessThanOrEqual(pad.x1 + m);
      expect(a.z0, `${spot.id} north edge`).toBeGreaterThanOrEqual(pad.z0 - m);
      expect(a.z1, `${spot.id} south edge`).toBeLessThanOrEqual(pad.z1 + m);
    }
  });

  it('ground-works features stand on their pads (helipad on its own)', () => {
    const extra = (id: string) => {
      const p = BETA_EXTRA_PADS.find((q) => q.id === id)!;
      return { x0: p.x - p.half[0], x1: p.x + p.half[0], z0: p.z - p.half[1], z1: p.z + p.half[1] };
    };
    for (const f of built.features) {
      if (f.kind === 'boat_slip') continue; // water by design, pinned below
      // the helipad dresses its own pad; the refinery, the yard
      // floodlights and the greeble yard clutter stand in the
      // citadel yard, not the fortress pad
      const inYard = f.id === 'citadel_refinery' || f.id.startsWith('citadel_floodlight') || f.id.startsWith('citadel_yard');
      const pad = f.id === 'ridge_helipad' || f.id === 'ridge_pad_wear' ? extra('helipad')
        : inYard ? extra('citadel_yard')
        : padRect(f.sector);
      const m = 2.0;
      expect(f.x - f.hx, `${f.id} west`).toBeGreaterThanOrEqual(pad.x0 - m);
      expect(f.x + f.hx, `${f.id} east`).toBeLessThanOrEqual(pad.x1 + m);
      expect(f.z - f.hz, `${f.id} north`).toBeGreaterThanOrEqual(pad.z0 - m);
      expect(f.z + f.hz, `${f.id} south`).toBeLessThanOrEqual(pad.z1 + m);
    }
  });

  it('road clearance: buildings keep off the corridors; the gate towers flank the causeway', () => {
    for (const spot of SECTOR_BUILDINGS) {
      if (WATER_STRUCTURES.has(spot.id) || GATE_TOWERS.has(spot.id)) continue;
      const [cx, cz] = resolveSpotWorld(spot);
      expect(betaRoadDistance(cx, cz), `${spot.id} road distance`).toBeGreaterThanOrEqual(10);
    }
    const w = kitsById.get('citadel_gate_w')!.building;
    const e = kitsById.get('citadel_gate_e')!.building;
    expect(w.cx).toBeLessThan(268);
    expect(e.cx).toBeGreaterThan(268);
    expect(w.cz).toBe(e.cz);
    for (const t of [w, e]) {
      const d = betaRoadDistance(t.cx, t.cz);
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(12);
    }
    // the gantry feature spans the causeway centerline
    const g = featuresById.get('citadel_gantry')!;
    expect(g.x - g.hx).toBeLessThan(268);
    expect(g.x + g.hx).toBeGreaterThan(268);
  });

  it('nothing stands in the water except the harbor works, by design', () => {
    for (const spot of SECTOR_BUILDINGS) {
      if (WATER_STRUCTURES.has(spot.id)) continue;
      const [cx, cz] = resolveSpotWorld(spot);
      expect(heightAt(cx, cz), `${spot.id} on dry land`).toBeGreaterThan(1.0);
    }
    // the boardwalk: shore end on the pad, west end over the channel
    const bw = kitsById.get('pier_boardwalk')!.building;
    expect(heightAt(bw.cx + 21, bw.cz)).toBeGreaterThan(1.5);
    expect(heightAt(bw.cx - 21, bw.cz)).toBeLessThan(0.5);
    // the fuel dock: walks from the beach into the sound
    const dock = kitsById.get('tern_fuel_dock')!.building;
    expect(heightAt(dock.cx - 15, dock.cz)).toBeGreaterThan(1.5);
    expect(heightAt(dock.cx + 15, dock.cz)).toBeLessThan(1.2);
    // the slips stand in the shallows
    for (const id of ['pier_slip_a', 'pier_slip_b']) {
      const f: SectorFeature = featuresById.get(id)!;
      expect(heightAt(f.x, f.z), `${id} in the water`).toBeLessThan(0);
    }
  });

  it('the world crafting stations stay clear of kit collision', () => {
    const kitColliders = built.kits.flatMap((r) => r.colliders);
    const anchorOf = (p: (typeof WORLD_STATION_PLACEMENTS)[number]): [number, number] => {
      if (p.poiId) {
        const poi = BETA_POI_PLACEMENTS.find((q) => q.poiId === p.poiId)!;
        return [poi.x + p.dx, poi.z + p.dz];
      }
      const s = BETA_SECTORS.find((q) => q.id === p.sectorId)!;
      return [s.x + p.dx, s.z + p.dz];
    };
    for (const p of WORLD_STATION_PLACEMENTS) {
      const [sx, sz] = anchorOf(p);
      for (const c of kitColliders) {
        // the station's own footprint box (World.buildStations: ±0.95/±0.5)
        const overlap = sx + 0.95 > c.x0 && sx - 0.95 < c.x1 && sz + 0.5 > c.z0 && sz - 0.5 < c.z1;
        expect(overlap, `${p.station} station at (${sx},${sz}) inside a kit collider`).toBe(false);
      }
    }
  });

  it('piece counts: the kits are real assemblies, per sector', () => {
    const perSector = new Map<string, number>();
    for (const spot of SECTOR_BUILDINGS) {
      const n = kitsById.get(spot.id)!.building.pieces.length;
      perSector.set(spotSectorId(spot), (perSector.get(spotSectorId(spot)) ?? 0) + n);
    }
    let total = 0;
    for (const [sector, n] of perSector) {
      expect(n, `${sector} pieces`).toBeGreaterThanOrEqual(40);
      total += n;
    }
    expect(total).toBeGreaterThanOrEqual(500);
  });

  it('wires into the world: kits, prop colliders, unique loot ids', () => {
    expect(world.sectorKits).toHaveLength(24);
    expect(world.sectorPropColliders.length).toBeGreaterThanOrEqual(40);
    const ids = [
      ...world.lighthouseKit.containers,
      ...world.airfieldKits.flatMap((k) => k.containers),
      ...world.sectorKits.flatMap((k) => k.containers),
    ].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(60);
  });
});
