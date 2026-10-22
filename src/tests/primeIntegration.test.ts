import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The procedural stand-in body needs a DOM canvas (textures); the
// integration machinery under test does not — stub the mesh
// builders (the Dark Horse suite's headless pattern).
vi.mock('../game/carModels', () => ({
  buildStallion: () => undefined,
  applyStallionUpgrades: () => undefined,
}));
import { CarPhysics, geomFor, paramsForDef, suspTuneFor } from '../game/CarPhysics';
import { VEHICLE_DEFS, VEHICLE_SPAWNS, VehicleManager, type Vehicle } from '../game/Vehicles';
import {
  PRIME_ANCHORS, PRIME_BASE_MASS_KG, PRIME_DEF, PRIME_FUEL_KG,
  PRIME_KINGPIN_GROUP, PRIME_PARAMS, PRIME_SPAWN, PRIME_TORQUE,
  PRIME_WHEEL_RIG,
} from '../game/primeDef';
import { CAR_SEATS } from '../game/Player';
import { estimatePerformance, peakPowerKw, torqueAt, DRIVER_KG } from '../game/carSpec';
import { DISPATCH_VEHICLE_DATA } from '../data/dispatch';
import { padById, padWorld } from '../game/airbaseSite';
import { captureVehicleSave, restoreVehicleFleet } from '../game/saveMigration';

/**
 * Prime clean-sheet integration (2026-10-22) — the Prime build
 * lane's PRD v3.0 truck (public/models/nomad-prime.glb, 6,032,016 B
 * / 151,870 tris) replaces the retired fleet-sheet model at the
 * same loader path. Anchored to the build report's anchor table
 * (design-refs/proof-prime/BUILD_REPORT.md), measured FROM the
 * finished model — and this suite parses the shipped GLB itself,
 * so the file and the data cannot drift apart silently.
 *
 * AXES: build house axes are Blender (X nose+, Y left+, Z up);
 * the glTF file carries (X nose+, Y up, Z = -house Y). Wheel and
 * marker positions below are glTF space, read from the file.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GLB_PATH = join(HERE, '..', '..', 'public', 'models', 'nomad-prime.glb');

// ------------------------------------------------------------ GLB read

interface GlbNode {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  children?: number[];
}
interface GlbJson {
  nodes: GlbNode[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { count: number; min?: number[]; max?: number[] }[];
}

function readGlb(): { json: GlbJson; bytes: number } {
  const buf = readFileSync(GLB_PATH);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
  const jsonLen = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a); // 'JSON'
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen))) as GlbJson;
  return { json, bytes: buf.byteLength };
}

/** World position of a named node, by translation accumulation.
 *  The build's grouping chain is translation-only from the root
 *  (COL_GEO_* groups sit at the origin) — asserted here so a
 *  future re-export with rotated groups fails loudly instead of
 *  passing on wrong numbers. */
function nodeWorld(json: GlbJson, name: string): [number, number, number] {
  const parentOf = new Map<number, number>();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
  const idx = json.nodes.findIndex((n) => n.name === name);
  expect(idx, `node ${name}`).toBeGreaterThanOrEqual(0);
  const chain: number[] = [];
  let cur: number | undefined = idx;
  while (cur !== undefined) {
    chain.push(cur);
    cur = parentOf.get(cur);
  }
  const out: [number, number, number] = [0, 0, 0];
  for (const i of chain) {
    const n = json.nodes[i];
    expect(n.rotation, `${name}: chain node ${n.name} must not rotate`).toBeUndefined();
    expect(n.scale, `${name}: chain node ${n.name} must not scale`).toBeUndefined();
    const t = n.translation ?? [0, 0, 0];
    out[0] += t[0];
    out[1] += t[1];
    out[2] += t[2];
  }
  return out;
}

function expectPos(actual: [number, number, number], expected: readonly number[], label: string): void {
  for (let k = 0; k < 3; k++) expect(actual[k], `${label}[${k}]`).toBeCloseTo(expected[k], 3);
}

describe('registration', () => {
  it('the def keeps its fleet slot and carries the clean-sheet dims', () => {
    expect(VEHICLE_DEFS[2]).toBe(PRIME_DEF);
    expect(PRIME_DEF.id).toBe('nomad_prime');
    expect(PRIME_DEF.length).toBeCloseTo(8.94, 2); // report: 8,941 mm
    expect(PRIME_DEF.width).toBeCloseTo(2.62, 2); // report: 2,621 mm body
    expect(PRIME_DEF.fuelMax).toBe(950); // PRD 2 x 475 L
    expect(PRIME_DEF.hitch).toBe('fifth_wheel');
    expect(PRIME_DEF.maxTowKg).toBe(48000);
  });

  it('spawn: the same pad — the 13 x 6.8 m pad swallows the bigger truck', () => {
    expect(VEHICLE_SPAWNS[1]).toBe(PRIME_SPAWN);
    expect(PRIME_SPAWN.poi).toBe('airbase');
    expect(PRIME_SPAWN.dx).toBe(36);
    expect(PRIME_SPAWN.dz).toBe(-12);
    const pad = padById('pad_prime');
    expect(pad.vehicleId).toBe('nomad_prime');
    // footprint with swing room: truck 8.94 long, 3.14 over mirrors
    expect(pad.hx * 2).toBeGreaterThanOrEqual(PRIME_DEF.length + 2);
    expect(pad.hz * 2).toBeGreaterThanOrEqual(3.14 + 2);
    // and it does not reach the Sprinter's pad next door
    const sprinter = padById('pad_sprinter');
    expect(pad.lx - pad.hx).toBeGreaterThan(sprinter.lx + sprinter.hx);
  });
});

describe('GLB node contract (the shipped file, parsed)', () => {
  const { json, bytes } = readGlb();

  it('is the clean-sheet build: byte size and triangle count', () => {
    expect(bytes).toBe(6032016);
    // counted per NODE instance — the renderer's load, and the
    // build verify pass's method: the one wheel mesh is shared by
    // all ten wheel nodes and is drawn ten times.
    let tris = 0;
    for (const node of json.nodes) {
      if (node.mesh === undefined) continue;
      for (const prim of json.meshes[node.mesh].primitives) {
        const counted = prim.indices !== undefined
          ? json.accessors[prim.indices].count
          : json.accessors[prim.attributes.POSITION].count;
        tris += counted / 3;
      }
    }
    expect(tris).toBe(151870);
  });

  it('all ten rig wheels exist at the anchor-table stations (glTF space)', () => {
    // [name, x (longitudinal), y (axle height), z (lateral)]
    const stations: [string, number, number, number][] = [
      ['Wheel_Steer_Right', 3.8, 0.538, 1.1],
      ['Wheel_Steer_Left', 3.8, 0.538, -1.1],
      ['Wheel_Drive_Axle1_Right_Outer', -1.86, 0.538, 1.1],
      ['Wheel_Drive_Axle1_Right_Inner', -1.86, 0.538, 0.765],
      ['Wheel_Drive_Axle2_Right_Outer', -3.18, 0.538, 1.1],
      ['Wheel_Drive_Axle2_Right_Inner', -3.18, 0.538, 0.765],
      ['Wheel_Drive_Axle1_Left_Outer', -1.86, 0.538, -1.1],
      ['Wheel_Drive_Axle1_Left_Inner', -1.86, 0.538, -0.765],
      ['Wheel_Drive_Axle2_Left_Outer', -3.18, 0.538, -1.1],
      ['Wheel_Drive_Axle2_Left_Inner', -3.18, 0.538, -0.765],
    ];
    for (const [name, x, y, z] of stations) {
      expectPos(nodeWorld(json, name), [x, y, z], name);
    }
    // the rig references exactly these names — no loader remapping
    expect(PRIME_WHEEL_RIG.map((w) => w.name).sort()).toEqual(stations.map((s) => s[0]).sort());
    // wheelbase from the file: steer -> bogie centroid = 6,320
    const centroid = (-1.86 + -3.18) / 2;
    expect(3.8 - centroid).toBeCloseTo(6.32, 3);
  });

  it('the markers the game reads are in the file at the measured spots', () => {
    expectPos(nodeWorld(json, 'driver_seat'), PRIME_ANCHORS.driverSeat, 'driver_seat');
    expectPos(nodeWorld(json, 'passenger_seat'), PRIME_ANCHORS.passengerSeat, 'passenger_seat');
    expectPos(nodeWorld(json, 'headlight_left_projector'), PRIME_ANCHORS.headlightLeft, 'headlight_left');
    expectPos(nodeWorld(json, 'headlight_right_projector'), PRIME_ANCHORS.headlightRight, 'headlight_right');
    expectPos(nodeWorld(json, 'trailer_hitch_fifth_wheel'), PRIME_ANCHORS.kingpin, 'hitch marker');
    expectPos(nodeWorld(json, 'fifth_wheel_kingpin'), PRIME_ANCHORS.kingpin, 'kingpin marker');
    expectPos(nodeWorld(json, 'gladhand_service'), PRIME_ANCHORS.gladhandService, 'gladhand_service');
    expectPos(nodeWorld(json, 'gladhand_emergency'), PRIME_ANCHORS.gladhandEmergency, 'gladhand_emergency');
    expectPos(nodeWorld(json, 'electrical_7pin'), PRIME_ANCHORS.electrical7Pin, 'electrical_7pin');
    // the seat groups the interior was built around are present too
    expect(json.nodes.some((n) => n.name === 'SeatDriver')).toBe(true);
    expect(json.nodes.some((n) => n.name === 'SeatPassenger')).toBe(true);
  });

  it('the kingpin converts to group space on the centreline, behind the cab', () => {
    // group space (nose +Z): lx = -glTF z, lz = glTF x
    const [gx, gy, gz] = nodeWorld(json, 'fifth_wheel_kingpin');
    expect(-gz).toBeCloseTo(PRIME_KINGPIN_GROUP.lx, 3);
    expect(gx).toBeCloseTo(PRIME_KINGPIN_GROUP.lz, 3);
    expect(gy).toBeCloseTo(PRIME_KINGPIN_GROUP.y, 3);
    expect(PRIME_KINGPIN_GROUP.lz).toBe(-2.35); // the PRD socket station
  });

  it('world bounds are the build’s measured envelope (8,941 x 3,140 x 4,120)', () => {
    // full TRS world matrices; each primitive's accessor AABB is
    // carried to world space by its 8 corners (exact for the box)
    type M = number[];
    const compose = (n: GlbNode): M => {
      if (n.matrix) return n.matrix as unknown as M;
      const t = n.translation ?? [0, 0, 0];
      const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
      const s = n.scale ?? [1, 1, 1];
      const m: M = new Array(16).fill(0);
      m[0] = (1 - 2 * (qy * qy + qz * qz)) * s[0]; m[1] = 2 * (qx * qy + qz * qw) * s[0]; m[2] = 2 * (qx * qz - qy * qw) * s[0];
      m[4] = 2 * (qx * qy - qz * qw) * s[1]; m[5] = (1 - 2 * (qx * qx + qz * qz)) * s[1]; m[6] = 2 * (qy * qz + qx * qw) * s[1];
      m[8] = 2 * (qx * qz + qy * qw) * s[2]; m[9] = 2 * (qy * qz - qx * qw) * s[2]; m[10] = (1 - 2 * (qx * qx + qy * qy)) * s[2];
      m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
      return m;
    };
    const mul = (a: M, b: M): M => {
      const o: M = new Array(16).fill(0);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    };
    const parentOf = new Map<number, number>();
    json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
    const cache = new Map<number, M>();
    const worldOf = (i: number): M => {
      if (cache.has(i)) return cache.get(i)!;
      const p = parentOf.get(i);
      const m = p === undefined ? compose(json.nodes[i]) : mul(worldOf(p), compose(json.nodes[i]));
      cache.set(i, m);
      return m;
    };
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    json.nodes.forEach((n, i) => {
      if (n.mesh === undefined) return;
      const m = worldOf(i);
      for (const prim of json.meshes[n.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        if (!acc.min || !acc.max) continue;
        for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]]) for (const cz of [acc.min[2], acc.max[2]]) {
          const w = [
            m[0] * cx + m[4] * cy + m[8] * cz + m[12],
            m[1] * cx + m[5] * cy + m[9] * cz + m[13],
            m[2] * cx + m[6] * cy + m[10] * cz + m[14],
          ];
          for (let k = 0; k < 3; k++) {
            if (w[k] < min[k]) min[k] = w[k];
            if (w[k] > max[k]) max[k] = w[k];
          }
        }
      }
    });
    // the build's verify pass measured the vertices at 8,941 long,
    // 3,140 over mirrors, top at 4,120 (stack elbows), lug tips
    // 30 mm into the ground plane. AABB-of-AABB can only over-read
    // on rotated parts, so the bands sit a hand's breadth wide.
    expect(max[0] - min[0]).toBeGreaterThan(8.85);
    expect(max[0] - min[0]).toBeLessThan(9.05);
    expect(max[2] - min[2]).toBeGreaterThan(3.05);
    expect(max[2] - min[2]).toBeLessThan(3.3);
    expect(max[1]).toBeGreaterThan(4.08);
    expect(max[1]).toBeLessThan(4.2);
    expect(min[1]).toBeGreaterThan(-0.06); // nothing buried under the truck
  });
});

describe('DD16 spec (PRD through the performance law)', () => {
  it('mass is the armored datum: 11,250 + driver + fuel = 12,133', () => {
    expect(PRIME_BASE_MASS_KG).toBe(11250);
    expect(PRIME_FUEL_KG).toBe(808);
    expect(PRIME_PARAMS.massKg).toBe(11250 + DRIVER_KG + 808);
    expect(paramsForDef('nomad_prime', [], 0).massKg).toBe(12133);
    // cargo is real mass on top
    expect(paramsForDef('nomad_prime', [], 500).massKg).toBe(12133 + 500);
  });

  it('torque peaks at the DD16’s 2,780 Nm; power peaks at the 600 hp mark', () => {
    let max = 0;
    for (let rpm = 650; rpm <= 2100; rpm += 25) max = Math.max(max, torqueAt(PRIME_TORQUE, rpm));
    expect(max).toBeCloseTo(2780, 0);
    const kw = peakPowerKw(PRIME_TORQUE, 2100);
    expect(kw).toBeGreaterThan(435);
    expect(kw).toBeLessThan(460); // 447 kW measured — 600 hp, not a watt of fantasy above class
  });

  it('the box is the PRD 18-speed on a 4.10 axle at 92% driveline efficiency', () => {
    const p = PRIME_PARAMS;
    expect(p.gears).toHaveLength(18);
    expect(p.gears[0]).toBeCloseTo(14.4, 2);
    expect(p.gears[17]).toBeCloseTo(0.73, 2);
    for (let i = 1; i < p.gears.length; i++) expect(p.gears[i]).toBeLessThan(p.gears[i - 1]);
    expect(p.finalDrive).toBe(4.1);
    expect(p.drivetrainEff).toBe(0.92);
    expect(p.idleRpm).toBe(650);
    expect(p.redlineRpm).toBe(2100);
    expect(p.wheelRadiusM).toBe(0.538); // the anchor table's carcass radius
  });

  it('estimates land stately: Class-8 top, heavy-truck legs, never above class', () => {
    const e = estimatePerformance(PRIME_PARAMS);
    expect(e.topSpeedKmh).toBeGreaterThan(138);
    expect(e.topSpeedKmh).toBeLessThan(152); // ~145 measured; gearing-capped class
    expect(e.topSpeedKmh).toBeLessThan(155); // NOT above its real class
    expect(e.zeroToHundredSec).toBeGreaterThan(15);
    expect(e.zeroToHundredSec).toBeLessThan(23); // ~18.8 measured at 12.1 t
  });

  it('the Stallion upgrade tree does not restamp the diesel spec', () => {
    const p = paramsForDef('nomad_prime', ['supercharger', 'engine_tune', 'armor'], 0);
    expect(p.massKg).toBe(PRIME_PARAMS.massKg);
    expect(p.torqueCurve).toEqual(PRIME_TORQUE);
    expect(p.finalDrive).toBe(4.1);
  });
});

describe('chassis geometry + seats (re-anchored)', () => {
  it('geom derives from the anchor stations', () => {
    const g = geomFor('nomad_prime');
    expect(g.half).toEqual([1.31, 0.45, 4.47]); // 2,621 wide / 8,941 long
    expect(g.wheelZ * 2).toBeCloseTo(6.32, 2); // the 6,320 wheelbase, symmetric split
    expect(g.wheelX).toBeCloseTo(1.02, 2); // mean(steer 1.100, dual centroid 0.9325)
    const tune = suspTuneFor('nomad_prime');
    const r = PRIME_PARAMS.wheelRadiusM;
    // the arch invariant against the NEW GLB's lip (ArchLip tops 1.17)
    expect(2 * r + tune.archTravelM).toBeLessThanOrEqual(tune.archTopM + 1e-9);
    expect(tune.archTopM).toBe(1.17);
    // heavy-def force cap: headroom over the static corner load
    const cornerN = (PRIME_PARAMS.massKg * 9.81) / 4;
    expect(tune.maxForceN).toBeGreaterThan(cornerN * 2);
  });

  it('CAR_SEATS matches the new cab: cushion/floor datum, headliner roof', () => {
    expect(CAR_SEATS.nomad_prime).toEqual({ cushionY: 1.4, floorY: 1.14, roofY: 2.92 });
  });

  it('the driver_seat marker lands where the seat fit expects it (group space)', () => {
    const { json } = readGlb();
    const [gx, , gz] = nodeWorld(json, 'driver_seat');
    // wrapper yaw -90 deg: group lx = -glTF z, group lz = glTF x
    expect(-gz).toBeCloseTo(0.58, 3); // driver's side, off the centreline
    expect(gx).toBeCloseTo(1.3, 3); // ahead of the group origin, in the cab
  });
});

describe('dispatch sync', () => {
  it('the dispatch row matches the def (the Dark Horse lesson, pre-paid)', () => {
    const row = DISPATCH_VEHICLE_DATA['nomad_prime'];
    expect(row).toBeDefined();
    expect(row.tankLiters).toBe(PRIME_DEF.fuelMax);
    expect(row.burnClass).toBe(PRIME_DEF.burnClass);
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
    const prime = fleet.find((v) => v.def.id === 'nomad_prime')!;
    expect(prime).toBeDefined();
    const pad = padWorld('pad_prime');
    expect(prime.group.position.x).toBeCloseTo(pad.x, 5);
    expect(prime.group.position.z).toBeCloseTo(pad.z, 5);
    expect(prime.group.position.y).toBeCloseTo(2.7, 5);
  });

  it('an existing save round-trips onto the NEW def unchanged in identity', () => {
    const fleet = spawnFleet();
    const prime = fleet.find((v) => v.def.id === 'nomad_prime')!;
    prime.fuel = 402.26;
    prime.group.position.set(-88, 4, 140);
    const saves = fleet.map(captureVehicleSave);
    const fresh = spawnFleet();
    const restored = restoreVehicleFleet(fresh, saves);
    expect(restored).toContain('nomad_prime');
    const back = fresh.find((v) => v.def.id === 'nomad_prime')!;
    expect(back.def).toBe(PRIME_DEF); // same def id — the new sheet answers
    expect(back.fuel).toBe(402.26);
    expect(back.group.position.x).toBe(-88);
    expect(paramsForDef('nomad_prime', back.upgrades, 0).massKg).toBe(12133);
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
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.538,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

describe('rigid body', () => {
  it('settles laden on its suspension at 12.1 t — composed, not bottomed', async () => {
    const flat = () => 0;
    const cp = await CarPhysics.create(flat);
    const v = fakeVehicle('nomad_prime');
    cp.spawnCar(v, [], 0);
    expect(cp.boundDefId).toBe('nomad_prime');
    expect(cp.isRigidBody).toBe(true);
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    }
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    // the RAW lengths are the real assertion: at the engine's
    // default force cap this truck reads ~0.02, fully bottomed
    for (const s of cp.rawSuspension) {
      expect(s).toBeGreaterThan(0.24);
      expect(s).toBeLessThan(0.33);
    }
    expect(Math.max(...cp.rawSuspension) - Math.min(...cp.rawSuspension)).toBeLessThan(0.02);
  }, 30000);

  it('hauls to highway speed like 12 t of diesel should — stately, in class', async () => {
    const flat = () => 0;
    const cp = await CarPhysics.create(flat);
    const v = fakeVehicle('nomad_prime');
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    let t100 = Infinity;
    let top = 0;
    const steps = Math.round(60 / dt);
    for (let i = 0; i < steps; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
      const kmh = cp.speed * 3.6;
      if (kmh > top) top = kmh;
      if (t100 === Infinity && kmh >= 100) t100 = i * dt;
    }
    const est = estimatePerformance(PRIME_PARAMS);
    expect(t100).toBeGreaterThan(12);
    expect(t100).toBeLessThan(28);
    expect(top).toBeGreaterThan(120);
    expect(top).toBeLessThan(est.topSpeedKmh + 25);
    expect(top).toBeLessThan(160); // in the body too: never above class
  }, 120000);
});
