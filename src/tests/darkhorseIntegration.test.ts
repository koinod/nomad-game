import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// The procedural stand-in body needs a DOM canvas (textures); the
// integration machinery under test does not — stub the mesh
// builders (the vehicle-persistence suite's headless pattern).
vi.mock('../game/carModels', () => ({
  buildStallion: () => undefined,
  applyStallionUpgrades: () => undefined,
}));
import { CarPhysics, geomFor, paramsForDef, suspTuneFor } from '../game/CarPhysics';
import {
  VEHICLE_DEFS, VEHICLE_SPAWNS, VehicleManager,
  applyDarkHorseStageMods, collectDarkHorseMods, type Vehicle,
} from '../game/Vehicles';
import {
  DARKHORSE_DEF, DARKHORSE_SPAWN, DARKHORSE_STAGE_MASS_KG,
  DARKHORSE_STAGE_TORQUE_NM, DARKHORSE_TORQUE, DARKHORSE_WHEEL_RIG,
  darkHorseModStage, darkHorseParams, darkHorseStage,
} from '../game/darkhorseDef';
import { estimatePerformance, peakPowerKw, torqueAt, DRIVER_KG, FUEL_KG } from '../game/carSpec';
import { canInstallUpgrade } from '../data/upgrades';
import { padById } from '../game/airbaseSite';
import { captureVehicleSave, restoreVehicleFleet } from '../game/saveMigration';

/**
 * Dark Horse integration (2026-10-21) — the Stallion lane's PRD
 * build (public/darkhorse.glb) lands as the playable hero car on
 * Ian's "if it works, fine". Anchored to the CONTRACT, not the
 * pixels: node names + measured stations from the build report
 * (wheel nodes (±1.359, 0.345, ∓0.791/±0.828) glTF, MT set at the
 * Stage-2 stations, interior built to CAR_SEATS), stage data from
 * the PRD §2 table. The surface pass swaps the file later; these
 * pins are what it must keep satisfying.
 */

describe('registration', () => {
  it('the def joins VEHICLE_DEFS after the spec fleet', () => {
    expect(VEHICLE_DEFS[4]).toBe(DARKHORSE_DEF);
    expect(DARKHORSE_DEF.id).toBe('dark_horse');
    expect(DARKHORSE_DEF.length).toBeCloseTo(4.82, 2); // PRD 4,819 mm
    expect(DARKHORSE_DEF.fuelMax).toBe(61); // S650 tank
    expect(DARKHORSE_DEF.storageKg).toBeGreaterThan(0);
  });

  it('spawn: its painted airbase pad, west of the GT500', () => {
    expect(VEHICLE_SPAWNS[3]).toBe(DARKHORSE_SPAWN);
    expect(DARKHORSE_SPAWN.poi).toBe('airbase');
    expect(DARKHORSE_SPAWN.dx).toBe(-4);
    expect(DARKHORSE_SPAWN.dz).toBe(-9);
    expect(padById('pad_dark_horse').vehicleId).toBe('dark_horse');
  });
});

describe('wheel rig', () => {
  it('eight visual wheels map onto the 4-corner rig: stock + MT sets', () => {
    expect(DARKHORSE_WHEEL_RIG).toHaveLength(8);
    expect(new Set(DARKHORSE_WHEEL_RIG.map((w) => w.name)).size).toBe(8);
    expect(DARKHORSE_WHEEL_RIG.map((w) => [w.name, w.wheelIdx])).toEqual([
      ['WheelFR', 0], ['WheelFL', 1], ['WheelRR', 2], ['WheelRL', 3],
      ['MOD_WheelMTFR', 0], ['MOD_WheelMTFL', 1], ['MOD_WheelMTRR', 2], ['MOD_WheelMTRL', 3],
    ]);
    // both front pairs steer
    expect(DARKHORSE_WHEEL_RIG.filter((w) => w.steer).map((w) => w.name)).toEqual([
      'WheelFR', 'WheelFL', 'MOD_WheelMTFR', 'MOD_WheelMTFL',
    ]);
  });
});

describe('MOD stage classification (the GLB anchor contract)', () => {
  it('classifies the shipped node names by family', () => {
    // Stage 1 — Highway Interceptor hardware
    for (const n of ['MOD_RamCentre', 'MOD_Winch', 'MOD_Fairlead', 'MOD_HubSpike', 'MOD_LouverSlat.003', 'MOD_DoorPlate.001', 'MOD_DoorBolt.017', 'MOD_QuarterPlate', 'MOD_QuarterSlot.002', 'MOD_RearBarLeg', 'MOD_DRing.001', 'MOD_Receiver', 'MOD_Skidplate']) {
      expect(darkHorseModStage(n), n).toBe(1);
    }
    // Stage 2 — Apex Dust hardware
    for (const n of ['MOD_TurretRing', 'MOD_PintleYoke', 'MOD_MGBarrel', 'MOD_AmmoCan', 'MOD_FeedChute', 'MOD_Coilover.002', 'MOD_Reservoir', 'MOD_SnorkelHead', 'MOD_SuperCowlMouth', 'MOD_CageMain', 'MOD_WheelMTFL']) {
      expect(darkHorseModStage(n), n).toBe(2);
    }
    // Stage 0 body is not a mod
    for (const n of ['WheelFL', 'Band0_R', 'TailPanel', 'SeatDriverBase', '']) {
      expect(darkHorseModStage(n), n).toBe(0);
    }
    // an unclassified future MOD hides until the top tier, never leaks
    expect(darkHorseModStage('MOD_SomethingNew')).toBe(2);
  });
});

describe('stage params (PRD §2 through the performance law)', () => {
  it('stage masses are exact: car + driver + full tank', () => {
    const crewed = DRIVER_KG + FUEL_KG;
    expect(paramsForDef('dark_horse', [], 0).massKg).toBe(DARKHORSE_STAGE_MASS_KG[0] + crewed);
    expect(paramsForDef('dark_horse', ['dh_stage1'], 0).massKg).toBe(DARKHORSE_STAGE_MASS_KG[1] + crewed);
    expect(paramsForDef('dark_horse', ['dh_stage1', 'dh_stage2'], 0).massKg).toBe(DARKHORSE_STAGE_MASS_KG[2] + crewed);
    expect(DARKHORSE_STAGE_MASS_KG).toEqual([1795, 2180, 2390]);
    // cargo is real mass on top, at every stage
    expect(paramsForDef('dark_horse', ['dh_stage1'], 120).massKg).toBe(2180 + crewed + 120);
  });

  it('torque peaks are the stage table; gearing is the PRD Tremec at every stage', () => {
    for (const [ups, peak] of [
      [[], 567], [['dh_stage1'], 610], [['dh_stage1', 'dh_stage2'], 840],
    ] as [string[], number][]) {
      const p = paramsForDef('dark_horse', ups, 0);
      let max = 0;
      for (let rpm = 900; rpm <= p.redlineRpm; rpm += 50) max = Math.max(max, torqueAt(p.torqueCurve, rpm));
      expect(max).toBeCloseTo(peak, 0);
      expect(p.gears).toEqual([3.25, 2.23, 1.61, 1.24, 1.0, 0.63]);
      expect(p.finalDrive).toBe(3.73);
      expect(p.redlineRpm).toBe(7500);
    }
    expect(DARKHORSE_STAGE_TORQUE_NM).toEqual([567, 610, 840]);
    // Stage 0 power reads in class: the 500 hp Dark Horse
    expect(peakPowerKw(DARKHORSE_TORQUE, 7500)).toBeGreaterThan(355);
    expect(peakPowerKw(DARKHORSE_TORQUE, 7500)).toBeLessThan(385);
  });

  it('Stage 2 is a different physical car: MT radius, lift, knob grip', () => {
    const s0 = darkHorseParams([], 0);
    const s2 = darkHorseParams(['dh_stage1', 'dh_stage2'], 0);
    expect(s0.wheelRadiusM).toBe(0.345);
    expect(s0.lifted).toBe(false);
    expect(s2.wheelRadiusM).toBe(0.419);
    expect(s2.lifted).toBe(true);
    expect(s2.tireMu).toBeLessThan(s0.tireMu);
    expect(s2.rollingCoef).toBeGreaterThan(s0.rollingCoef);
  });

  it('the FX upgrade tree does not restamp the Dark Horse', () => {
    const p = paramsForDef('dark_horse', ['supercharger', 'engine_tune', 'weight_reduction', 'final_drive'], 0);
    const stock = darkHorseParams([], 0);
    expect(p.massKg).toBe(stock.massKg);
    expect(p.torqueCurve).toEqual(stock.torqueCurve);
    expect(p.finalDrive).toBe(3.73);
  });

  it('performance law holds: stock ≥ 220 km/h, the ladder lives in the 260 class', () => {
    const e0 = estimatePerformance(darkHorseParams([], 0));
    expect(e0.topSpeedKmh).toBeGreaterThanOrEqual(220); // the law
    expect(e0.topSpeedKmh).toBeGreaterThan(250);
    expect(e0.topSpeedKmh).toBeLessThan(272);
    expect(e0.zeroToHundredSec).toBeGreaterThan(4.4);
    expect(e0.zeroToHundredSec).toBeLessThan(5.4);
    const e1 = estimatePerformance(darkHorseParams(['dh_stage1'], 0));
    expect(e1.topSpeedKmh).toBeGreaterThan(248);
    expect(e1.topSpeedKmh).toBeLessThan(268);
    const e2 = estimatePerformance(darkHorseParams(['dh_stage1', 'dh_stage2'], 0));
    expect(e2.topSpeedKmh).toBeGreaterThan(255);
    expect(e2.topSpeedKmh).toBeLessThan(278);
    expect(e2.powerKw).toBeGreaterThan(520); // the blown 720 hp class
    expect(e2.powerKw).toBeLessThan(580);
  });

  it('chassis geometry + arch invariant for the stock rolling set', () => {
    expect(geomFor('dark_horse')).toEqual({ half: [0.96, 0.32, 2.41], wheelX: 0.81, wheelZ: 1.359 });
    const tune = suspTuneFor('dark_horse');
    const r = darkHorseParams([], 0).wheelRadiusM;
    expect(2 * r + tune.archTravelM).toBeLessThanOrEqual(tune.archTopM + 1e-9);
    // suspension-force cap sized ~3x the static corner load
    // (vehicle-physics lane 2026-10-22: Rapier's DEFAULT cap
    // saturates under a full brake stop — the front suspension
    // sank until the chassis collider grounded out; probed)
    expect(tune.maxForceN).toBe(18500);
  });
});

describe('garage gating (data/upgrades)', () => {
  const dh = { kind: 'car', id: 'dark_horse' };

  it('the stages fit only the Dark Horse, in order', () => {
    expect(canInstallUpgrade(dh, 'dh_stage1', [])).toBe(true);
    expect(canInstallUpgrade(dh, 'dh_stage2', [])).toBe(false); // needs Stage 1 first
    expect(canInstallUpgrade(dh, 'dh_stage2', ['dh_stage1'])).toBe(true);
    expect(canInstallUpgrade(dh, 'dh_stage1', ['dh_stage1'])).toBe(false); // already fitted
    expect(canInstallUpgrade({ kind: 'car', id: 'gt500' }, 'dh_stage1', [])).toBe(false);
    expect(canInstallUpgrade({ kind: 'car', id: 'nomad_prime' }, 'dh_stage1', [])).toBe(false);
  });

  it('the FX carSpec line is closed to the Dark Horse; generic kit stays open', () => {
    for (const id of ['supercharger', 'engine_tune', 'final_drive', 'grip_tires', 'weight_reduction', 'lift_kit']) {
      expect(canInstallUpgrade(dh, id, []), id).toBe(false);
    }
    expect(canInstallUpgrade(dh, 'armor', [])).toBe(true);
    expect(canInstallUpgrade(dh, 'cargo_racks', [])).toBe(true);
  });

  it('stage derivation: dh_stage2 alone still reads stage 2', () => {
    expect(darkHorseStage([])).toBe(0);
    expect(darkHorseStage(['dh_stage1'])).toBe(1);
    expect(darkHorseStage(['dh_stage1', 'dh_stage2'])).toBe(2);
    expect(darkHorseStage(['dh_stage2'])).toBe(2);
    expect(darkHorseStage(['armor'])).toBe(0);
  });
});

describe('MOD visibility by tier', () => {
  function fakeModel(): THREE.Group {
    const model = new THREE.Group();
    for (const name of [
      'Band0_R', 'WheelFL', 'WheelFR', 'MOD_WheelMTFL', 'MOD_WheelMTRR',
      'MOD_RamCentre', 'MOD_LouverSlat', 'MOD_TurretRing', 'MOD_Snorkel', 'MOD_FutureGizmo',
    ]) {
      const o = new THREE.Group();
      o.name = name;
      model.add(o);
    }
    return model;
  }
  function fakeVehicle(upgrades: string[]): Vehicle {
    return {
      uid: 'dark_horse', def: DARKHORSE_DEF, upgrades,
      group: new THREE.Group(),
    } as unknown as Vehicle;
  }
  const find = (m: THREE.Group, name: string) => m.getObjectByName(name)!;

  it('collects the sets and toggles them by owned stage', () => {
    const model = fakeModel();
    const v = fakeVehicle([]);
    v.stageMods = collectDarkHorseMods(model);
    expect(v.stageMods.stage1.map((o) => o.name).sort()).toEqual(['MOD_LouverSlat', 'MOD_RamCentre']);
    expect(v.stageMods.stage2.map((o) => o.name).sort()).toEqual(['MOD_FutureGizmo', 'MOD_Snorkel', 'MOD_TurretRing']);
    expect(v.stageMods.stockWheels.map((o) => o.name).sort()).toEqual(['WheelFL', 'WheelFR']);
    expect(v.stageMods.mtWheels.map((o) => o.name).sort()).toEqual(['MOD_WheelMTFL', 'MOD_WheelMTRR']);

    applyDarkHorseStageMods(v); // stage 0: factory car, clean
    expect(find(model, 'MOD_RamCentre').visible).toBe(false);
    expect(find(model, 'MOD_TurretRing').visible).toBe(false);
    expect(find(model, 'WheelFL').visible).toBe(true);
    expect(find(model, 'MOD_WheelMTFL').visible).toBe(false);

    v.upgrades = ['dh_stage1'];
    applyDarkHorseStageMods(v);
    expect(find(model, 'MOD_RamCentre').visible).toBe(true);
    expect(find(model, 'MOD_LouverSlat').visible).toBe(true);
    expect(find(model, 'MOD_TurretRing').visible).toBe(false);
    expect(find(model, 'WheelFL').visible).toBe(true); // still on stock wheels
    expect(find(model, 'MOD_WheelMTFL').visible).toBe(false);

    v.upgrades = ['dh_stage1', 'dh_stage2'];
    applyDarkHorseStageMods(v);
    expect(find(model, 'MOD_RamCentre').visible).toBe(true); // Stage 1 hardware stays
    expect(find(model, 'MOD_TurretRing').visible).toBe(true);
    expect(find(model, 'MOD_Snorkel').visible).toBe(true);
    expect(find(model, 'WheelFL').visible).toBe(false); // the rolling set swapped
    expect(find(model, 'MOD_WheelMTFL').visible).toBe(true);
    expect(find(model, 'MOD_WheelMTRR').visible).toBe(true);
  });
});

describe('persistence', () => {
  function spawnFleet(): Vehicle[] {
    const mgr = new VehicleManager();
    const scene = new THREE.Scene();
    mgr.spawn(scene, { airbase: [468, -128] }, () => 2.7);
    return mgr.vehicles;
  }

  it('spawns on its pad, on the ground', () => {
    const fleet = spawnFleet();
    const dh = fleet.find((v) => v.def.id === 'dark_horse')!;
    expect(dh).toBeDefined();
    expect(dh.group.position.x).toBeCloseTo(468 - 4, 5);
    expect(dh.group.position.z).toBeCloseTo(-128 - 9, 5);
    expect(dh.group.position.y).toBeCloseTo(2.7, 5);
  });

  it('round-trips through the save with its stage tiers', () => {
    const fleet = spawnFleet();
    const dh = fleet.find((v) => v.def.id === 'dark_horse')!;
    dh.upgrades = ['dh_stage1', 'dh_stage2'];
    dh.fuel = 41.5;
    dh.group.position.set(120, 3, -60);
    const saves = fleet.map(captureVehicleSave);
    const fresh = spawnFleet();
    const restored = restoreVehicleFleet(fresh, saves);
    expect(restored).toContain('dark_horse');
    const back = fresh.find((v) => v.def.id === 'dark_horse')!;
    expect(back.upgrades).toEqual(['dh_stage1', 'dh_stage2']);
    expect(darkHorseStage(back.upgrades)).toBe(2);
    expect(back.fuel).toBe(41.5);
    expect(back.group.position.x).toBe(120);
    // and the restored tier drives the restored car's physics + sheet
    expect(paramsForDef('dark_horse', back.upgrades, 0).massKg).toBe(2390 + DRIVER_KG + FUEL_KG);
  });
});

// ------------------------------------------------------------ rigid body

function fakeVehicle(defId: string): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  return {
    uid: def.id, def, group, heading: 0, speed: 0, fuel: def.fuelMax, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.345,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

describe('rigid body', () => {
  it('settles on its suspension and holds a full-throttle line in class', async () => {
    const flat = () => 0;
    const cp = await CarPhysics.create(flat);
    const v = fakeVehicle('dark_horse');
    cp.spawnCar(v, [], 0);
    expect(cp.boundDefId).toBe('dark_horse');
    expect(cp.isRigidBody).toBe(true);
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    }
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    for (const s of cp.rawSuspension) {
      expect(s).toBeGreaterThan(0.15);
      expect(s).toBeLessThan(0.33);
    }
    // full throttle: a 260-class car — fast, near its estimate
    const dt = 1 / 60;
    let top = 0;
    let t100 = Infinity;
    const steps = Math.round(40 / dt);
    for (let i = 0; i < steps; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
      const kmh = cp.speed * 3.6;
      if (kmh > top) top = kmh;
      if (t100 === Infinity && kmh >= 100) t100 = i * dt;
    }
    expect(top).toBeGreaterThan(220); // the law, in the body
    expect(top).toBeLessThan(290);
    expect(t100).toBeGreaterThan(3.5);
    expect(t100).toBeLessThan(7);
  }, 90000);
});
