import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// The procedural body build needs a DOM canvas (textures); the state
// machinery under test does not — stub the mesh builders.
vi.mock('../game/carModels', () => ({
  buildStallion: () => undefined,
  applyStallionUpgrades: () => undefined,
}));

import { VehicleManager, type Vehicle } from '../game/Vehicles';
import {
  captureVehicleSave,
  restoreVehicleFleet,
} from '../game/saveMigration';
import { migrate, type RawSaveRecord } from '../systems/save';
import type { VehicleSave } from '../store/types';

/**
 * FLEET PERSISTENCE (2026-10-21): every registered vehicle — GT500,
 * Nomad Prime, Sprinter — persists and restores its full state (the
 * old residual: only one car's state survived a save/load). The
 * capture/apply pair lives in saveMigration.ts precisely so this
 * round trip is testable headless; Game.getVehicleStates + Game.init
 * call those same functions, so what is pinned here is what ships.
 */

const POIS: Record<string, [number, number]> = {
  lighthouse_base: [600, 100],
  airbase: [480, -108],
  marina: [-100, 200],
};
const flat = () => 0;

function spawnFleet(): Vehicle[] {
  const m = new VehicleManager();
  m.spawn(new THREE.Scene(), POIS, flat);
  return m.vehicles;
}

function byDef(vehicles: Vehicle[], defId: string): Vehicle {
  const v = vehicles.find((x) => x.def.id === defId);
  if (!v) throw new Error(`no live vehicle ${defId}`);
  return v;
}

/** Put a vehicle somewhere specific with a distinctive full state. */
function park(v: Vehicle, patch: Partial<{
  x: number; y: number; z: number; heading: number; fuel: number;
  condition: number; tiresFlat: number; variant: string;
}> & { storage?: Vehicle['storage']; upgrades?: string[] }): void {
  if (patch.x !== undefined || patch.z !== undefined || patch.y !== undefined) {
    v.group.position.set(patch.x ?? v.group.position.x, patch.y ?? v.group.position.y, patch.z ?? v.group.position.z);
  }
  if (patch.heading !== undefined) { v.heading = patch.heading; v.group.rotation.y = patch.heading; }
  if (patch.fuel !== undefined) v.fuel = patch.fuel;
  if (patch.condition !== undefined) v.condition = patch.condition;
  if (patch.tiresFlat !== undefined) v.tiresFlat = patch.tiresFlat;
  if (patch.variant !== undefined) v.variant = patch.variant;
  if (patch.storage) v.storage = patch.storage;
  if (patch.upgrades) v.upgrades = patch.upgrades;
}

describe('fleet save/load round trip', () => {
  it('every spawned vehicle restores its full state, matched by def id', () => {
    const fleet = spawnFleet();
    expect(fleet.map((v) => v.def.id)).toEqual(['gt500', 'nomad_prime', 'sprinter_van']);
    park(byDef(fleet, 'gt500'), {
      x: 12, y: 3, z: -44, heading: 0.7, fuel: 17.25, condition: 0.42, tiresFlat: 1,
      storage: [{ uid: 'g1', itemId: 'bandage', qty: 3 }], upgrades: ['engine_tune'],
    });
    park(byDef(fleet, 'nomad_prime'), {
      x: -300, y: 4, z: 150, heading: 2.9, fuel: 812.5, condition: 0.88, tiresFlat: 0,
      storage: [{ uid: 'p1', itemId: 'scrap', qty: 9 }], upgrades: [],
    });
    park(byDef(fleet, 'sprinter_van'), {
      x: 233, y: 3, z: 281, heading: -1.2, fuel: 64, condition: 0.67, tiresFlat: 2,
      storage: [], upgrades: ['armor'],
    });
    const saves = fleet.map(captureVehicleSave);

    const fresh = spawnFleet();
    const restored = restoreVehicleFleet(fresh, saves);
    expect(restored).toEqual(['gt500', 'nomad_prime', 'sprinter_van']);

    const g = byDef(fresh, 'gt500');
    expect(g.group.position.toArray()).toEqual([12, 3, -44]);
    expect(g.heading).toBeCloseTo(0.7);
    expect(g.fuel).toBe(17.25);
    expect(g.condition).toBeCloseTo(0.42);
    expect(g.tiresFlat).toBe(1);
    expect(g.storage).toEqual([{ uid: 'g1', itemId: 'bandage', qty: 3 }]);
    expect(g.upgrades).toEqual(['engine_tune']);
    expect(g.speed).toBe(0);

    const p = byDef(fresh, 'nomad_prime');
    expect(p.group.position.toArray()).toEqual([-300, 4, 150]);
    expect(p.heading).toBeCloseTo(2.9);
    expect(p.fuel).toBe(812.5);
    expect(p.condition).toBeCloseTo(0.88);
    expect(p.storage).toEqual([{ uid: 'p1', itemId: 'scrap', qty: 9 }]);

    const s = byDef(fresh, 'sprinter_van');
    expect(s.group.position.toArray()).toEqual([233, 3, 281]);
    expect(s.fuel).toBe(64);
    expect(s.condition).toBeCloseTo(0.67);
    expect(s.tiresFlat).toBe(2);
    expect(s.upgrades).toEqual(['armor']);
  });

  it('capture deep-copies: editing the save does not touch the live vehicle', () => {
    const fleet = spawnFleet();
    const g = byDef(fleet, 'gt500');
    park(g, { storage: [{ uid: 'g1', itemId: 'bandage', qty: 3 }], upgrades: ['armor'] });
    const save = captureVehicleSave(g);
    save.storage![0].qty = 99;
    save.upgrades!.push('engine_tune');
    expect(g.storage[0].qty).toBe(3);
    expect(g.upgrades).toEqual(['armor']);
  });

  it('save while DRIVING the GT500: its driven state is what comes back', () => {
    const fleet = spawnFleet();
    const g = byDef(fleet, 'gt500');
    // mid-drive state: far from the lighthouse spawn, tank burned down,
    // wear taken, trunk loaded — the player snapshot rides at the car
    // while driving (Game.driveUpdate), so on load the player stands
    // beside THIS car in THIS state; the vehicle half is pinned here.
    park(g, {
      x: -512, y: 3, z: 96, heading: 5.1, fuel: 9.4, condition: 0.53,
      storage: [{ uid: 'd1', itemId: 'medkit', qty: 1 }, { uid: 'd2', itemId: 'fuel_can', qty: 2 }],
      upgrades: ['engine_tune', 'armor'], tiresFlat: 0,
    });
    const saves = fleet.map(captureVehicleSave);
    const fresh = spawnFleet();
    restoreVehicleFleet(fresh, saves);
    const back = byDef(fresh, 'gt500');
    expect(back.group.position.toArray()).toEqual([-512, 3, 96]);
    expect(back.heading).toBeCloseTo(5.1);
    expect(back.fuel).toBe(9.4);
    expect(back.condition).toBeCloseTo(0.53);
    expect(back.storage).toHaveLength(2);
    expect(back.upgrades).toEqual(['engine_tune', 'armor']);
  });

  it('a vehicle left across the island stays across the island', () => {
    const fleet = spawnFleet();
    park(byDef(fleet, 'sprinter_van'), { x: -655, y: 5, z: -290, heading: 3.3, fuel: 21, condition: 0.9 });
    const saves = fleet.map(captureVehicleSave);
    const fresh = spawnFleet();
    restoreVehicleFleet(fresh, saves);
    const s = byDef(fresh, 'sprinter_van');
    expect(s.group.position.x).toBe(-655);
    expect(s.group.position.z).toBe(-290);
  });

  it('unknown, deleted, and future def records are skipped — never fatal, never stamped', () => {
    const saves: VehicleSave[] = [
      { defId: 'tank', x: 1, y: 2, z: 3, heading: 0, fuel: 40, condition: 0.9, storage: [], upgrades: [], tiresFlat: 0 },
      // a future def (the Dark Horse placeholder): no live vehicle yet
      { defId: 'dark_horse', x: 7, y: 2, z: 7, heading: 1, fuel: 55, condition: 1, storage: [], upgrades: [], tiresFlat: 0 },
      // deleted content: juicy state that must land NOWHERE
      {
        defId: 'mustang', x: 10, y: 3, z: -20, heading: 2.2, fuel: 33.33, condition: 0.77,
        storage: [{ uid: 'a', itemId: 'bandage', qty: 2 }], upgrades: ['armor'], tiresFlat: 1, variant: 'fx',
      },
      { defId: 'gt500', x: 30, y: 3, z: 40, heading: 0.4, fuel: 48, condition: 0.92, storage: [], upgrades: [], tiresFlat: 0 },
    ];
    const fresh = spawnFleet();
    let restored: string[] = [];
    expect(() => { restored = restoreVehicleFleet(fresh, saves); }).not.toThrow();
    expect(restored).toEqual(['gt500']);
    expect(byDef(fresh, 'gt500').fuel).toBe(48);
    // the deleted Stallion's marker fuel appears on no live vehicle
    for (const v of fresh) expect(v.fuel).not.toBe(33.33);
  });

  it('a live vehicle missing from an old save keeps its fresh spawn state', () => {
    const fresh = spawnFleet();
    const spawnPos = new Map(fresh.map((v) => [v.def.id, v.group.position.toArray()]));
    const spawnHeading = new Map(fresh.map((v) => [v.def.id, v.heading]));
    // an old save that only ever knew the GT500
    const saves: VehicleSave[] = [
      { defId: 'gt500', x: -40, y: 3, z: 300, heading: 1.1, fuel: 50, condition: 0.7, storage: [], upgrades: [], tiresFlat: 0 },
    ];
    const restored = restoreVehicleFleet(fresh, saves);
    expect(restored).toEqual(['gt500']);
    for (const id of ['nomad_prime', 'sprinter_van']) {
      const v = byDef(fresh, id);
      expect(v.group.position.toArray()).toEqual(spawnPos.get(id));
      expect(v.heading).toBe(spawnHeading.get(id));
    }
  });

  it('an absent or empty vehicle list restores nothing and never throws', () => {
    const fresh = spawnFleet();
    expect(restoreVehicleFleet(fresh, [])).toEqual([]);
    expect(restoreVehicleFleet(fresh, undefined)).toEqual([]);
    expect(restoreVehicleFleet(fresh, null)).toEqual([]);
  });

  it('variant round-trips (captured before, silently dropped on restore)', () => {
    const fleet = spawnFleet();
    park(byDef(fleet, 'gt500'), { variant: 'fx' });
    const saves = fleet.map(captureVehicleSave);
    expect(saves.find((s) => s.defId === 'gt500')?.variant).toBe('fx');
    const fresh = spawnFleet();
    restoreVehicleFleet(fresh, saves);
    expect(byDef(fresh, 'gt500').variant).toBe('fx');
    expect(byDef(fresh, 'nomad_prime').variant).toBeUndefined();
  });

  it('storage entries for deleted items drop on restore; real items survive', () => {
    const saves: VehicleSave[] = [
      {
        defId: 'gt500', x: 0, y: 3, z: 0, heading: 0, fuel: 40, condition: 0.8,
        storage: [
          { uid: 'k1', itemId: 'bandage', qty: 2 },
          { uid: 'k2', itemId: 'deleted_item_xyz', qty: 5 },
        ],
        upgrades: [], tiresFlat: 0,
      },
    ];
    const fresh = spawnFleet();
    restoreVehicleFleet(fresh, saves);
    expect(byDef(fresh, 'gt500').storage).toEqual([{ uid: 'k1', itemId: 'bandage', qty: 2 }]);
  });

  it('state readers see restored values: a re-capture reports them verbatim', () => {
    // The store's repair reader and the fleet publisher (fuelLiters)
    // consume live vehicles through getVehicleStates == capture — what
    // a post-restore capture reports IS what those readers see.
    const fleet = spawnFleet();
    park(byDef(fleet, 'nomad_prime'), { fuel: 402.26, condition: 0.35 });
    park(byDef(fleet, 'sprinter_van'), { fuel: 12.75, condition: 0.61 });
    const saves = fleet.map(captureVehicleSave);
    const fresh = spawnFleet();
    restoreVehicleFleet(fresh, saves);
    const prime = captureVehicleSave(byDef(fresh, 'nomad_prime'));
    expect(prime.fuel).toBe(402.26);
    expect(Math.round(prime.fuel * 10) / 10).toBe(402.3); // publisher's fuelLiters rounding
    expect(prime.condition).toBeCloseTo(0.35);
    const sprinter = captureVehicleSave(byDef(fresh, 'sprinter_van'));
    expect(sprinter.fuel).toBe(12.75);
    expect(sprinter.condition).toBeCloseTo(0.61);
  });
});

describe('migration chain: old saves restore the fleet they knew', () => {
  it('a v2 save (vehicles predate storage/upgrades) migrates, then restores', () => {
    const record: RawSaveRecord = {
      version: 2,
      slot: '1',
      savedAt: 1729000000000,
      difficulty: 'survivor',
      timeMinutes: 90,
      playSeconds: 1200,
      player: { pos: [10, 2, 10], hp: 90 },
      inventory: [],
      quests: [],
      doneQuests: [],
      flags: {},
      rep: {},
      world: { looted: [], deadHusks: [], cleared: [] },
      vehicles: [
        // v2 shape: no storage / upgrades / tiresFlat fields at all
        { defId: 'gt500', x: 88, y: 3, z: -120, heading: 0.9, fuel: 26, condition: 0.58 },
      ],
    };
    const snap = migrate(record);
    expect(snap.version).toBe(3);
    const fresh = spawnFleet();
    const restored = restoreVehicleFleet(fresh, snap.vehicles);
    expect(restored).toEqual(['gt500']);
    const g = byDef(fresh, 'gt500');
    expect(g.group.position.toArray()).toEqual([88, 3, -120]);
    expect(g.fuel).toBe(26);
    expect(g.condition).toBeCloseTo(0.58);
    expect(g.storage).toEqual([]); // migrate filled the v3 defaults
    expect(g.upgrades).toEqual([]);
    expect(g.tiresFlat).toBe(0);
    // the rest of the fleet was unknown to that save: spawn state stands
    expect(byDef(fresh, 'nomad_prime').group.position.x).not.toBe(88);
  });

  it('a v3 save carrying the whole fleet passes migrate untouched, then restores', () => {
    const vehicles: VehicleSave[] = [
      { defId: 'gt500', x: 1, y: 3, z: 2, heading: 0.1, fuel: 44, condition: 0.9, storage: [], upgrades: [], tiresFlat: 0 },
      { defId: 'nomad_prime', x: -200, y: 4, z: -60, heading: 1.4, fuel: 700, condition: 0.95, storage: [{ uid: 's1', itemId: 'scrap', qty: 4 }], upgrades: [], tiresFlat: 0 },
      { defId: 'sprinter_van', x: 150, y: 3, z: 240, heading: 2.2, fuel: 88, condition: 0.7, storage: [], upgrades: ['armor'], tiresFlat: 1 },
    ];
    const record: RawSaveRecord = {
      version: 3,
      slot: 'auto',
      savedAt: 1729000200000,
      difficulty: 'survivor',
      seed: 7,
      timeMinutes: 400,
      playSeconds: 5400,
      player: { pos: [1, 2, 3], hp: 80 },
      inventory: [],
      equipped: { melee: null, ranged: null, pack: null },
      hotbar: [null, null, null],
      quests: [],
      doneQuests: [],
      flags: {},
      rep: {},
      battery: 90,
      phoneUnlocked: true,
      world: { looted: [], deadHusks: [], cleared: [] },
      daysElapsed: 1,
      skills: {},
      perkPoints: 0,
      perks: [],
      survivors: [],
      base: null,
      vehicles,
      trailers: [],
    };
    const snap = migrate(record);
    expect(snap.vehicles).toEqual(vehicles);
    const fresh = spawnFleet();
    expect(restoreVehicleFleet(fresh, snap.vehicles)).toEqual(['gt500', 'nomad_prime', 'sprinter_van']);
    expect(byDef(fresh, 'nomad_prime').fuel).toBe(700);
    expect(byDef(fresh, 'sprinter_van').upgrades).toEqual(['armor']);
  });
});
