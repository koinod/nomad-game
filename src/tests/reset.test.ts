import { describe, expect, it } from 'vitest';
import { VEHICLE_DEFS, VEHICLE_SPAWNS } from '../game/Vehicles';
import { CLAIMABLE, CLAIM_SITES } from '../data/base';
import { UPGRADES, canInstallUpgrade } from '../data/upgrades';
import {
  DELETED_UPGRADE_IDS,
  DELETED_VEHICLE_IDS,
  sanitizeBase,
  restorableVehicleSave,
} from '../game/saveMigration';
import type { VehicleSave } from '../store/types';

/**
 * VEHICLE RESET + TOTAL PURGE (2026-10-20): the fleet is one Mustang,
 * every other vehicle/building is gone, and pre-reset saves must load
 * stripped — never crash, never resurrect deleted content.
 *
 * SUPERSESSION (2026-10-21, merge stage 2b): the reset law always said
 * vehicles return ONE AT A TIME through the visual gate. The Shelby
 * GT500 passed that gate (Lane 1, the benchmark model), so the fleet
 * is now exactly two — the one-car assertions below were updated
 * deliberately to pin the new roster, not loosened.
 *
 * SUPERSESSION (2026-10-21, merge stage 4): base claiming likewise
 * returns as a system, not a scatter — Lane 10's tiered claims model
 * (CLAIM_SITES in data/base.ts) un-parks claiming as data + logic.
 * The purge-era assertions below still pin the LEGACY surface exactly
 * (CLAIMABLE + sanitizeBase: the old claim posts and old saves), and a
 * new assertion pins the tiered roster that supersedes it. In the
 * tiered model the lighthouse is 'never' — the story home is the
 * legacy claim, migrated into claims by claimsFromLegacyBase.
 *
 * SUPERSESSION (2026-10-21, Vehicle Truth Wave): Ian ordered the
 * procedural Stallion FX deleted ("the FX teal version — delete
 * that"). The GT500 is the sole spawned car; the mustang DEF data
 * stays (build sheet + Dark Horse). A saved Stallion is deleted
 * content: restorableVehicleSave matches strictly by def id, so it
 * strips and can never be stamped onto the GT500. The migration
 * assertions below were rewritten for the new roster deliberately.
 */

describe('the reset fleet', () => {
  it('defs: the Stallion data plus the one gate-approved return', () => {
    expect(VEHICLE_DEFS).toHaveLength(2);
    expect(VEHICLE_DEFS[0].id).toBe('mustang');
    expect(VEHICLE_DEFS[0].kind).toBe('car');
    expect(VEHICLE_DEFS[1].id).toBe('gt500');
    expect(VEHICLE_DEFS[1].kind).toBe('car');
  });

  it('spawns: the GT500 alone at the lighthouse (the FX stand-in is deleted)', () => {
    expect(VEHICLE_SPAWNS).toHaveLength(1);
    expect(VEHICLE_SPAWNS[0].id).toBe('gt500');
    expect(VEHICLE_SPAWNS[0].poi).toBe('lighthouse_base');
    expect(DELETED_VEHICLE_IDS).toContain('mustang');
  });

  it('no upgrade references a deleted vehicle or a deleted upgrade', () => {
    for (const u of UPGRADES) {
      expect(u.kinds).toEqual(['car']);
      expect(u.onlyIds ?? []).not.toContain('goliath');
      expect(u.onlyIds ?? []).not.toContain('tank');
    }
    for (const id of DELETED_UPGRADE_IDS) {
      expect(UPGRADES.some((u) => u.id === id)).toBe(false);
    }
  });
});

describe('save migration', () => {
  const oldFleet: VehicleSave[] = [
    { defId: 'tank', x: 1, y: 2, z: 3, heading: 0, fuel: 40, condition: 0.9, storage: [], upgrades: ['tank_coax'], tiresFlat: 0 },
    { defId: 'seahawk', x: 4, y: 5, z: 6, heading: 1, fuel: 80, condition: 1, storage: [], upgrades: ['heli_armor'], tiresFlat: 0 },
    {
      defId: 'mustang', x: 10, y: 3, z: -20, heading: 2.2, fuel: 33, condition: 0.77,
      storage: [{ uid: 'a', itemId: 'bandage', qty: 2 }],
      upgrades: ['armor', 'mg_mount', 'engine_tune'], tiresFlat: 1, variant: 'fx',
    },
    {
      defId: 'gt500', x: 30, y: 3, z: 40, heading: 0.4, fuel: 48, condition: 0.92,
      storage: [{ uid: 'b', itemId: 'medkit', qty: 1 }],
      upgrades: ['armor', 'mg_mount'], tiresFlat: 0,
    },
    { defId: 'goliath', x: 0, y: 0, z: 0, heading: 0, fuel: 10, condition: 0.5, storage: [], upgrades: [], tiresFlat: 0 },
  ];

  it('the deleted Stallion strips — and is never stamped onto the GT500', () => {
    // matching is by def id: asking for the mustang's save is asking
    // for deleted content; asking for the GT500 returns ONLY its own
    expect(restorableVehicleSave(oldFleet, 'mustang')).toBeNull();
    const vs = restorableVehicleSave(oldFleet, 'gt500');
    expect(vs).not.toBeNull();
    expect(vs!.defId).toBe('gt500');
    expect(vs!.fuel).toBe(48);
    expect(vs!.condition).toBeCloseTo(0.92);
    expect(vs!.x).toBe(30);
    expect(vs!.storage).toHaveLength(1);
  });

  it('strips deleted upgrade ids from the restored car', () => {
    const vs = restorableVehicleSave(oldFleet, 'gt500');
    expect(vs!.upgrades ?? []).toEqual(['armor']);
  });

  it('unknown/absent defs and empty saves migrate to nothing (fresh spawn stands)', () => {
    // matching is exact by def id — a def with no save gets nothing,
    // and only LIVE vehicles ever ask (a 'tank' record can sit in an
    // old save forever; no tank exists to receive it)
    expect(restorableVehicleSave(oldFleet, 'nonexistent')).toBeNull();
    expect(restorableVehicleSave([oldFleet[0], oldFleet[1]], 'gt500')).toBeNull();
    expect(restorableVehicleSave([], 'gt500')).toBeNull();
    expect(restorableVehicleSave(undefined, 'gt500')).toBeNull();
    expect(restorableVehicleSave(null, 'gt500')).toBeNull();
  });

  it('every restored upgrade still installs on the GT500', () => {
    const vs = restorableVehicleSave(oldFleet, 'gt500')!;
    for (const u of vs.upgrades ?? []) {
      expect(canInstallUpgrade({ kind: 'car', id: 'gt500' }, u, [])).toBe(true);
    }
  });
});

describe('base claim migration (total purge)', () => {
  it('only the lighthouse grounds claim survives (legacy CLAIMABLE — the purge list)', () => {
    expect(CLAIMABLE).toEqual([{ poiId: 'lighthouse_base', name: 'Lighthouse Grounds' }]);
  });

  it('the tiered claims roster (Lane 10) is the deliberate supersession', () => {
    const byClass = (k: string) => CLAIM_SITES.filter((s) => s.klass === k).map((s) => s.poiId);
    expect(byClass('home')).toEqual(['shore_camp', 'jonah_camp', 'town', 'military_base']);
    expect(byClass('outpost')).toEqual(['relay_station']);
    expect(byClass('field')).toEqual(['forest_cache', 'dune_cache']);
    expect(byClass('never')).toEqual(['lighthouse_base', 'wreck']);
  });

  it('claims at demolished POIs clear safely to null', () => {
    for (const poiId of ['shore_camp', 'jonah_camp', 'carrier', 'airbase']) {
      expect(sanitizeBase({ poiId, facilities: ['command_post'] })).toBeNull();
    }
    expect(sanitizeBase(null)).toBeNull();
    expect(sanitizeBase(undefined)).toBeNull();
  });

  it('a lighthouse claim survives untouched', () => {
    const b = { poiId: 'lighthouse_base', facilities: ['command_post', 'watchtower'] };
    expect(sanitizeBase(b)).toEqual(b);
  });
});
