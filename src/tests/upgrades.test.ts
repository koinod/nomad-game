// Pure unit tests for vehicle upgrade data + effect math (no DOM, no three.js).
import { describe, expect, it } from 'vitest';
import {
  UPGRADES,
  accelFactor,
  canInstallUpgrade,
  collisionLossFactor,
  ramDamageFactor,
  sandFactor,
  storageCapKg,
  topSpeedFactor,
  upgradeDef,
  wearFactor,
} from '../data/upgrades';
import { FURNITURE_LOOT, HUSK_LOOT, ITEMS, STATION_RECIPES } from '../data/items';

describe('UPGRADES data', () => {
  it('has 10 unique ids (VEHICLE RESET + physics-native engine tree)', () => {
    expect(UPGRADES).toHaveLength(10);
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('every cost itemId exists as a key in ITEMS', () => {
    for (const upgrade of UPGRADES) {
      for (const cost of upgrade.cost) {
        expect(ITEMS[cost.itemId], `${upgrade.id} cost ${cost.itemId}`).toBeDefined();
      }
    }
  });

  it('upgradeDef resolves known ids and returns undefined for unknown', () => {
    expect(upgradeDef('armor')?.name).toBe('Armor Plating');
    expect(upgradeDef('does_not_exist')).toBeUndefined();
  });
});

describe('armor_plate item + recipe', () => {
  it('ITEMS.armor_plate exists', () => {
    expect(ITEMS.armor_plate).toBeDefined();
    expect(ITEMS.armor_plate.id).toBe('armor_plate');
  });

  it('STATION_RECIPES.r_armor_plate produces armor_plate at station industrial', () => {
    expect(STATION_RECIPES.r_armor_plate).toBeDefined();
    expect(STATION_RECIPES.r_armor_plate.resultId).toBe('armor_plate');
    expect(STATION_RECIPES.r_armor_plate.station).toBe('industrial');
  });

  it('armor_plate appears in toolbox suburban and husk town loot', () => {
    expect(FURNITURE_LOOT.toolbox.suburban.some((e) => e.id === 'armor_plate')).toBe(true);
    expect(FURNITURE_LOOT.toolbox.suburban.some((e) => e.id === 'engine_part')).toBe(true);
    expect(HUSK_LOOT.town.some((e) => e.id === 'armor_plate')).toBe(true);
  });
});

describe('canInstallUpgrade', () => {
  it('armor ok for a car pickup', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'pickup' }, 'armor', [])).toBe(true);
  });

  it('armor false for tank (excluded)', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'tank' }, 'armor', [])).toBe(false);
  });

  it('bullbar installs on the mustang (Combat Edition ram bar), not the tank', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, 'bullbar', [])).toBe(true);
    expect(canInstallUpgrade({ kind: 'car', id: 'tank' }, 'bullbar', [])).toBe(false);
  });

  it('engine_tune false for bike (kind not allowed)', () => {
    expect(canInstallUpgrade({ kind: 'bike', id: 'dirtbike' }, 'engine_tune', [])).toBe(false);
  });

  it('already-owned -> false', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'pickup' }, 'armor', ['armor'])).toBe(false);
  });

  it('cargo_racks ok for the mustang (the atv is deleted)', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, 'cargo_racks', [])).toBe(true);
    expect(canInstallUpgrade({ kind: 'atv', id: 'atv' }, 'cargo_racks', [])).toBe(false);
  });

  it('unknown upgrade -> false', () => {
    expect(canInstallUpgrade({ kind: 'car', id: 'pickup' }, 'does_not_exist', [])).toBe(false);
  });
});

describe('topSpeedFactor', () => {
  it('no upgrades / no tow / no flats = 1', () => {
    expect(topSpeedFactor([], 0, 0)).toBeCloseTo(1, 6);
  });

  it('engine_tune alone = 1.12', () => {
    expect(topSpeedFactor(['engine_tune'], 0, 0)).toBeCloseTo(1.12, 6);
  });

  it('towedKg 12000 -> load factor clamps at 0.55', () => {
    expect(topSpeedFactor([], 12000, 0)).toBeCloseTo(0.55, 6);
  });

  it('flats 2 -> x0.7 with no other factors', () => {
    expect(topSpeedFactor([], 0, 2)).toBeCloseTo(0.7, 6);
  });
});

describe('accelFactor', () => {
  it('towedKg 9000 -> 0.5 floor', () => {
    expect(accelFactor([], 9000)).toBeCloseTo(0.5, 6);
  });

  it('engine_tune + no tow = 1.15', () => {
    expect(accelFactor(['engine_tune'], 0)).toBeCloseTo(1.15, 6);
  });

  it('no upgrades / no tow = 1', () => {
    expect(accelFactor([], 0)).toBeCloseTo(1, 6);
  });
});

describe('sandFactor', () => {
  it('default 0.78', () => {
    expect(sandFactor([])).toBeCloseTo(0.78, 6);
  });

  it('lift_kit 0.92', () => {
    expect(sandFactor(['lift_kit'])).toBeCloseTo(0.92, 6);
  });
});

describe('storageCapKg', () => {
  it('100 base -> 100 without racks', () => {
    expect(storageCapKg(100, [])).toBe(100);
  });

  it('100 base with cargo_racks -> 160', () => {
    expect(storageCapKg(100, ['cargo_racks'])).toBe(160);
  });
});

describe('collisionLossFactor', () => {
  it('none = 1', () => {
    expect(collisionLossFactor([])).toBeCloseTo(1, 6);
  });

  it('armor = 0.4', () => {
    expect(collisionLossFactor(['armor'])).toBeCloseTo(0.4, 6);
  });

  it('bullbar = 0.6', () => {
    expect(collisionLossFactor(['bullbar'])).toBeCloseTo(0.6, 6);
  });

  it('both = 0.25 (floor — 0.4*0.6=0.24 clamps to 0.25)', () => {
    expect(collisionLossFactor(['armor', 'bullbar'])).toBeCloseTo(0.25, 6);
  });
});

describe('ramDamageFactor', () => {
  it('bullbar 1.8', () => {
    expect(ramDamageFactor(['bullbar'])).toBeCloseTo(1.8, 6);
  });

  it('else 1', () => {
    expect(ramDamageFactor([])).toBeCloseTo(1, 6);
  });
});

describe('wearFactor', () => {
  it('armor 0.7', () => {
    expect(wearFactor(['armor'])).toBeCloseTo(0.7, 6);
  });

  it('else 1', () => {
    expect(wearFactor([])).toBeCloseTo(1, 6);
  });
});

describe('VEHICLE RESET deletions', () => {
  it('weapon mounts, tank tiers and the heli line are gone', () => {
    for (const id of ['mg_mount', 'cannon_40', 'tank_coax', 'tank_reactive', 'heli_armor', 'heli_engine', 'heli_racks', 'heli_light']) {
      expect(upgradeDef(id), id).toBeUndefined();
      expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, id, []), id).toBe(false);
    }
  });

  it('the surviving six all fit the one Mustang', () => {
    for (const id of ['armor', 'engine_tune', 'cargo_racks', 'bullbar', 'run_flats']) {
      expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, id, []), id).toBe(true);
    }
    // lift kit stays excluded from the Mustang (it was never a lift candidate)
    expect(canInstallUpgrade({ kind: 'car', id: 'mustang' }, 'lift_kit', [])).toBe(false);
  });
});
