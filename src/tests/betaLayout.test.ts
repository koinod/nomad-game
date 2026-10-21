import { describe, it, expect } from 'vitest';
import { POI_DEFS } from '../game/World';
import {
  BETA_SECTORS, BETA_EXTRA_PADS, BETA_ROADS, BETA_SOUND_CHANNEL,
  BETA_CHANNEL_DEPTH, BETA_DAYMARKERS, BETA_FLEET_HOMES, BETA_PLAYER_SPAWN,
  BETA_POI_PLACEMENTS, BETA_RESERVED_SITES, BETA_STRUCTURE_SETS, BETA_SCATTER,
  betaSector,
} from '../data/betaLayout';
import { betaHeightAt, betaChannelDistance, BETA_ZONE_COLORS } from '../game/betaTerrain';

// ─── BETA LAYOUT — placement canon checks ───────────────────────────────────
// Every shipped POI has exactly one Beta home (spec sector or stated
// biome logic), the spec's infrastructure (roads, channel, daymarkers,
// fleet-home candidates) is internally consistent, and placements sit
// on ground that suits them — read off the one authored grid.

const placementOf = (id: string) => {
  const p = BETA_POI_PLACEMENTS.find((v) => v.poiId === id);
  if (!p) throw new Error(`no beta placement for ${id}`);
  return p;
};
const distToRect = (x: number, z: number, cx: number, cz: number, hw: number, hd: number): number => {
  const dx = Math.max(Math.abs(x - cx) - hw, 0);
  const dz = Math.max(Math.abs(z - cz) - hd, 0);
  return Math.hypot(dx, dz);
};
const roadDist = (roadId: string, x: number, z: number): number => {
  const road = BETA_ROADS.find((r) => r.id === roadId);
  if (!road) throw new Error(`no road ${roadId}`);
  let d = Infinity;
  for (let s = 0; s + 1 < road.points.length; s++) {
    const [ax, az] = road.points[s];
    const [bx, bz] = road.points[s + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return d;
};

describe('POI census — nothing dropped, nothing doubled', () => {
  it('every POI_DEFS id appears exactly once', () => {
    const placed = BETA_POI_PLACEMENTS.map((p) => p.poiId);
    expect(new Set(placed).size).toBe(placed.length);
    for (const def of POI_DEFS) {
      expect(placed.filter((id) => id === def.id)).toHaveLength(1);
    }
  });

  it("the claim-only id 'military_base' is placed once, on the airbase", () => {
    const mb = BETA_POI_PLACEMENTS.filter((p) => p.poiId === 'military_base');
    expect(mb).toHaveLength(1);
    const ab = placementOf('airbase');
    expect([mb[0].x, mb[0].z]).toEqual([ab.x, ab.z]);
  });

  it('lighthouse_top shares lighthouse_base ground (vertical, not a second site)', () => {
    const b = placementOf('lighthouse_base');
    const t = placementOf('lighthouse_top');
    expect([t.x, t.z]).toEqual([b.x, b.z]);
    expect([t.x, t.z]).toEqual([betaSector('lighthouse').x, betaSector('lighthouse').z]);
  });

  it('every placement names a sector that exists (named sector or placement region)', () => {
    const sectorIds = new Set(BETA_SECTORS.map((s) => s.id));
    const regions = new Set(['eastern_dunes', 'forest_spine', 'west_sound', 'north_coast']);
    for (const p of BETA_POI_PLACEMENTS) {
      expect(sectorIds.has(p.sector) || regions.has(p.sector)).toBe(true);
      expect(p.note.length).toBeGreaterThan(10);
    }
  });
});

describe('placements sit on sensible ground (read off the one grid)', () => {
  it('land POIs are dry', () => {
    for (const p of BETA_POI_PLACEMENTS) {
      if (p.poiId === 'carrier' || p.poiId === 'wreck') continue;
      expect(betaHeightAt(p.x, p.z)).toBeGreaterThan(0.5);
    }
  });

  it('the wreck is beached at the marsh edge; the carrier rides the dredged channel', () => {
    const w = placementOf('wreck');
    const hw = betaHeightAt(w.x, w.z);
    expect(hw).toBeGreaterThan(-0.3);
    expect(hw).toBeLessThan(1.6);
    const c = placementOf('carrier');
    const hc = betaHeightAt(c.x, c.z);
    expect(hc).toBeLessThan(BETA_CHANNEL_DEPTH + 0.6);
    expect(hc).toBeGreaterThan(BETA_CHANNEL_DEPTH - 0.8);
    expect(betaChannelDistance(c.x, c.z)).toBeLessThan(8);
  });

  it('sector-heart POIs sit on their sector pads', () => {
    for (const [poi, sector] of [
      ['lighthouse_base', 'lighthouse'], ['town', 'tern_rock'], ['marina', 'pier_hq'],
    ] as const) {
      const p = placementOf(poi);
      const s = betaSector(sector);
      expect([p.x, p.z]).toEqual([s.x, s.z]);
    }
  });
});

describe('spec §2 road topology', () => {
  it('roads are well-formed', () => {
    for (const r of BETA_ROADS) {
      expect(r.points.length).toBeGreaterThanOrEqual(2);
      expect(r.maxGrade).toBeGreaterThan(0);
      expect(r.maxGrade).toBeLessThanOrEqual(0.15);
      expect(r.halfWidth).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('the Northern Span joins Citadel and Lighthouse', () => {
    const cit = betaSector('citadel');
    const lig = betaSector('lighthouse');
    expect(roadDist('northern_span', cit.x, cit.z)).toBeLessThan(5);
    expect(roadDist('northern_span', lig.x, lig.z)).toBeLessThan(25);
  });

  it('the NC-12 corridor runs Citadel → Refuge edge → Tern Rock', () => {
    const cit = betaSector('citadel');
    const ref = betaSector('refuge');
    const tern = betaSector('tern_rock');
    expect(roadDist('nc12_corridor', cit.x, cit.z)).toBeLessThan(5);
    expect(roadDist('nc12_corridor', tern.x, tern.z)).toBeLessThan(25);
    // The corridor passes the Refuge's east side: within 40 m of its pad.
    let dPad = Infinity;
    const road = BETA_ROADS.find((r) => r.id === 'nc12_corridor')!;
    for (const [x, z] of road.points) {
      dPad = Math.min(dPad, distToRect(x, z, ref.x, ref.z, ref.padHalf[0], ref.padHalf[1]));
    }
    expect(dPad).toBeLessThan(40);
  });

  it('the west fork ties the Refuge pad to the Pier HQ', () => {
    const ref = betaSector('refuge');
    const pier = betaSector('pier_hq');
    const road = BETA_ROADS.find((r) => r.id === 'nc12_west_fork')!;
    const [sx, sz] = road.points[0];
    expect(distToRect(sx, sz, ref.x, ref.z, ref.padHalf[0], ref.padHalf[1])).toBeLessThan(5);
    expect(roadDist('nc12_west_fork', pier.x, pier.z)).toBeLessThan(45);
  });

  it('the inland spur climbs to the Ridge pad', () => {
    const ridge = betaSector('ridge');
    expect(roadDist('inland_spur', ridge.x, ridge.z)).toBeLessThan(40);
  });

  it('the causeway leaves the Citadel north, off the map edge', () => {
    const road = BETA_ROADS.find((r) => r.id === 'causeway')!;
    expect(road.points[0][1]).toBeLessThanOrEqual(-320);
    expect(roadDist('causeway', betaSector('citadel').x, betaSector('citadel').z)).toBeLessThan(40);
  });
});

describe('spec §3.3 channel + daymarkers', () => {
  it('the channel runs the west sound, north bay to below the Pier', () => {
    expect(BETA_SOUND_CHANNEL.length).toBeGreaterThanOrEqual(6);
    expect(BETA_SOUND_CHANNEL[0][1]).toBeLessThan(-280);
    const last = BETA_SOUND_CHANNEL[BETA_SOUND_CHANNEL.length - 1];
    expect(last[1]).toBeGreaterThan(250);
    expect(BETA_CHANNEL_DEPTH).toBeLessThanOrEqual(-4);
  });

  it('daymarkers line the channel, alternating banks — water posts or shore dayboards', () => {
    expect(BETA_DAYMARKERS.length).toBeGreaterThanOrEqual(8);
    for (let n = 0; n < BETA_DAYMARKERS.length; n++) {
      const m = BETA_DAYMARKERS[n];
      const d = betaChannelDistance(m.x, m.z);
      const h = betaHeightAt(m.x, m.z);
      expect(d).toBeLessThan(34);
      // A marker is either a post standing in the water at the dredge
      // edge, or a dayboard on the channel-side bank — never inland.
      expect(h < 0.2 || (d <= 27 && h < 1.8)).toBe(true);
      if (n > 0) expect(m.side).not.toBe(BETA_DAYMARKERS[n - 1].side);
    }
  });
});

describe('fleet-home candidates (spec §2 logic)', () => {
  it('all three candidates name real sectors and cover the fleet', () => {
    const ids = BETA_FLEET_HOMES.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['citadel_yard', 'ridge_ops', 'airbase_ne']));
    const vehicles = new Set(BETA_FLEET_HOMES.flatMap((h) => h.pads.map((p) => p.vehicle)));
    for (const v of ['gt500', 'semi_prime', 'sprinter_van', 'seahawk']) {
      expect(vehicles.has(v)).toBe(true);
    }
    for (const h of BETA_FLEET_HOMES) expect(() => betaSector(h.sector)).not.toThrow();
  });

  it('candidate pads sit on their surveyed flats', () => {
    const yard = BETA_EXTRA_PADS.find((p) => p.id === 'citadel_yard')!;
    const heli = BETA_EXTRA_PADS.find((p) => p.id === 'helipad')!;
    const ridge = betaSector('ridge');
    const airbase = betaSector('airbase');
    for (const home of BETA_FLEET_HOMES) {
      for (const pad of home.pads) {
        if (home.id === 'citadel_yard') {
          expect(distToRect(pad.x, pad.z, yard.x, yard.z, yard.half[0], yard.half[1])).toBeLessThan(2);
          expect(betaHeightAt(pad.x, pad.z)).toBeCloseTo(yard.y, 1);
        } else if (home.id === 'ridge_ops' && pad.vehicle === 'seahawk') {
          expect([pad.x, pad.z]).toEqual([heli.x, heli.z]);
        } else if (home.id === 'ridge_ops') {
          expect(distToRect(pad.x, pad.z, ridge.x, ridge.z, ridge.padHalf[0], ridge.padHalf[1])).toBeLessThan(2);
        } else {
          expect(distToRect(pad.x, pad.z, airbase.x, airbase.z, airbase.padHalf[0], airbase.padHalf[1])).toBeLessThan(2);
        }
      }
    }
  });
});

describe('high-poly standard data (Ian, 2026-10-21)', () => {
  it('every sector carries a modeled structure set', () => {
    for (const s of BETA_SECTORS) {
      const set = BETA_STRUCTURE_SETS.find((v) => v.sector === s.id);
      expect(set).toBeDefined();
      expect(set!.structures.length).toBeGreaterThanOrEqual(3);
    }
    // The airbase kit is on record as visually provisional.
    const ab = BETA_STRUCTURE_SETS.find((v) => v.sector === 'airbase')!;
    expect(ab.note).toContain('PROVISIONAL');
  });

  it('scatter covers exactly the terrain zones, modeled assets only', () => {
    const zones = BETA_SCATTER.map((s) => s.zone).sort();
    expect(zones).toEqual(Object.keys(BETA_ZONE_COLORS).sort());
    for (const s of BETA_SCATTER) expect(s.assets.length).toBeGreaterThanOrEqual(1);
  });
});

describe('spawn + reserved sites', () => {
  it('the player spawns on the lighthouse grounds, dry', () => {
    const lig = betaSector('lighthouse');
    expect(Math.hypot(BETA_PLAYER_SPAWN.x - lig.x, BETA_PLAYER_SPAWN.z - lig.z)).toBeLessThan(40);
    expect(betaHeightAt(BETA_PLAYER_SPAWN.x, BETA_PLAYER_SPAWN.z)).toBeGreaterThan(2);
  });

  it('reserved sites coincide with their sectors', () => {
    for (const r of BETA_RESERVED_SITES) {
      const s = betaSector(r.sector);
      expect([r.x, r.z]).toEqual([s.x, s.z]);
    }
  });
});
