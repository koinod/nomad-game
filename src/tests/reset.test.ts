import { describe, expect, it } from 'vitest';
import { VEHICLE_DEFS, VEHICLE_SPAWNS } from '../game/Vehicles';
import { CLAIMABLE } from '../data/base';
import { UPGRADES, canInstallUpgrade } from '../data/upgrades';
import {
  DELETED_UPGRADE_IDS,
  sanitizeBase,
  survivingVehicleSave,
} from '../game/saveMigration';
import type { VehicleSave } from '../store/types';

/**
 * VEHICLE RESET + TOTAL PURGE (2026-10-20): the fleet is one Mustang,
 * every other vehicle/building is gone, and pre-reset saves must load
 * stripped — never crash, never resurrect deleted content.
 */

describe('the reset fleet', () => {
  it('has exactly one vehicle def: the Stallion FX Mustang', () => {
    expect(VEHICLE_DEFS).toHaveLength(1);
    expect(VEHICLE_DEFS[0].id).toBe('mustang');
    expect(VEHICLE_DEFS[0].kind).toBe('car');
  });

  it('spawns exactly one vehicle, at the lighthouse', () => {
    expect(VEHICLE_SPAWNS).toHaveLength(1);
    expect(VEHICLE_SPAWNS[0].id).toBe('mustang');
    expect(VEHICLE_SPAWNS[0].poi).toBe('lighthouse_base');
    expect(VEHICLE_SPAWNS[0].variant).toBe('fx');
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
    { defId: 'goliath', x: 0, y: 0, z: 0, heading: 0, fuel: 10, condition: 0.5, storage: [], upgrades: [], tiresFlat: 0 },
  ];

  it('strips a pre-reset fleet to the Mustang, keeping its state', () => {
    const vs = survivingVehicleSave(oldFleet);
    expect(vs).not.toBeNull();
    expect(vs!.defId).toBe('mustang');
    expect(vs!.fuel).toBe(33);
    expect(vs!.condition).toBeCloseTo(0.77);
    expect(vs!.storage).toHaveLength(1);
    expect(vs!.variant).toBe('fx');
  });

  it('strips deleted upgrade ids from the surviving car', () => {
    const vs = survivingVehicleSave(oldFleet);
    expect(vs!.upgrades ?? []).toEqual(['armor', 'engine_tune']);
  });

  it('a fleet with no Mustang migrates to nothing (fresh spawn stands)', () => {
    expect(survivingVehicleSave([oldFleet[0], oldFleet[1]])).toBeNull();
    expect(survivingVehicleSave([])).toBeNull();
    expect(survivingVehicleSave(undefined)).toBeNull();
    expect(survivingVehicleSave(null)).toBeNull();
  });

  it('every surviving upgrade still installs on the Mustang', () => {
    const vs = survivingVehicleSave(oldFleet)!;
    for (const u of vs.upgrades ?? []) {
      expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, u, [])).toBe(true);
    }
  });
});

describe('base claim migration (total purge)', () => {
  it('only the lighthouse grounds claim survives', () => {
    expect(CLAIMABLE).toEqual([{ poiId: 'lighthouse_base', name: 'Lighthouse Grounds' }]);
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
