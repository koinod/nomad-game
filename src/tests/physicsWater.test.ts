import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CarPhysics, waterStateAt } from '../game/CarPhysics';
import { VEHICLE_DEFS, type Vehicle } from '../game/Vehicles';

/**
 * WATER IS REAL (Ian playtest, 2026-10-21): driving into the sea fell
 * through / the water was fake. The seabed is the ground field
 * (continuous with the terrain, plus the safety slab past the map
 * edge), and the car now meets a medium: hydrodynamic drag,
 * buoyancy-lite at a sill float line, and a drowned engine in deep
 * water. On foot the player already wades (Player clamps ground to
 * -0.5 in water) — the hole was vehicular, and it is closed here.
 */

describe('waterStateAt — the medium, computed from the seabed', () => {
  it('dry land: no depth, no submersion, no stall', () => {
    const ws = waterStateAt(2.4, 2.4);
    expect(ws.depth).toBe(0);
    expect(ws.submerged).toBe(0);
    expect(ws.floats).toBe(false);
    expect(ws.stalled).toBe(false);
  });

  it('ankle water: wheels wet, some drag, engine alive, no float', () => {
    const ws = waterStateAt(-0.3, -0.3);
    expect(ws.depth).toBeCloseTo(0.3, 5);
    expect(ws.submerged).toBeGreaterThan(0.2);
    expect(ws.submerged).toBeLessThan(0.5);
    expect(ws.floats).toBe(false);
    expect(ws.stalled).toBe(false);
  });

  it('deep water: floats at the sill line; sunk means stalled', () => {
    const ws = waterStateAt(-3, -3);
    expect(ws.depth).toBe(3);
    expect(ws.floats).toBe(true);
    expect(ws.floatGroupY).toBeCloseTo(-0.43, 5);
    expect(ws.submerged).toBe(1);
    expect(ws.stalled).toBe(true);
    // at the float line itself the hull is half under — the stall
    // releases there, but with no bottom under the wheels there is
    // still no drive (the integration test below proves the outcome)
    const afloat = waterStateAt(-3, ws.floatGroupY);
    expect(afloat.submerged).toBeGreaterThan(0.4);
    expect(afloat.submerged).toBeLessThan(0.65);
  });

  it('the stall line is a depth, not a switch: ~0.61 m of water over the ground plane', () => {
    expect(waterStateAt(-0.55, -0.55).stalled).toBe(false);
    expect(waterStateAt(-0.7, -0.7).stalled).toBe(true);
  });
});

// ------------------------------------------------------------ integration

function fakeVehicle(defId: string, x: number, z: number, groundY: (x: number, z: number) => number): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);
  return {
    uid: def.id, def, group, heading: Math.PI / 2, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.343,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as unknown as Vehicle;
}

describe('driving into the sea', () => {
  // beach at y=2 until x=100, then a seabed ramp down to -3.2
  const seabed = (x: number): number => (x < 100 ? 2 : Math.max(-3.2, 2 - (x - 100) * 0.045));
  const ramp = (x: number, _z: number): number => seabed(x);
  const flat = (): number => 2;

  async function drive(groundY: (x: number, z: number) => number, steps: number) {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, groundY, []);
    const v = fakeVehicle('gt500', 40, 0, groundY);
    cp.spawnCar(v, [], 0);
    let sawStall = false;
    let minY = Infinity;
    for (let i = 0; i < steps; i++) {
      cp.step(1 / 60, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, groundY);
      if (cp.stalled) sawStall = true;
      if (i > steps - 120) minY = Math.min(minY, v.group.position.y);
    }
    return { cp, v, sawStall, minY };
  }

  it('the car floats at the sill line instead of sinking to the seabed', async () => {
    const { v, sawStall, minY } = await drive(ramp, 1500);
    const endX = v.group.position.x;
    // it got out into water deep enough to float in (no bottom within
    // wheel reach of the float line) and stopped there, drowned
    expect(endX).toBeGreaterThan(150);
    expect(seabed(endX)).toBeLessThan(-1.1);
    // ...yet rides at the float line, not on the bottom
    expect(v.group.position.y).toBeGreaterThan(-0.85);
    expect(v.group.position.y).toBeLessThan(0.1);
    expect(minY).toBeGreaterThan(-0.95);
    // and the engine drowned on the way in
    expect(sawStall).toBe(true);
  }, 120000);

  it('water drag robs the run: the sea crossing is far shorter than the dry run', async () => {
    const dry = await drive(flat, 1500);
    const wet = await drive(ramp, 1500);
    expect(dry.v.group.position.x).toBeGreaterThan(400);
    expect(wet.v.group.position.x).toBeLessThan(dry.v.group.position.x * 0.55);
  }, 120000);
});
