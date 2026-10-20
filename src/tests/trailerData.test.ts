import { describe, expect, it } from 'vitest';
import {
  MODULE_DEFS,
  TRAILER_DEFS,
  canHitch,
  trailerDef,
} from '../data/trailerData';

describe('canHitch', () => {
  it('semi pulls t_box', () => {
    expect(canHitch('semi', 't_box')).toBe(true);
  });

  it('goliath pulls t_carrier', () => {
    expect(canHitch('goliath', 't_carrier')).toBe(true);
  });

  it('tank pulls t_tanker', () => {
    expect(canHitch('tank', 't_tanker')).toBe(true);
  });

  it('f250 pulls t_flatbed but NOT t_tanker', () => {
    expect(canHitch('f250', 't_flatbed')).toBe(true);
    expect(canHitch('f250', 't_tanker')).toBe(false);
  });

  it('pickup pulls t_utility but NOT t_flatbed', () => {
    expect(canHitch('pickup', 't_utility')).toBe(true);
    expect(canHitch('pickup', 't_flatbed')).toBe(false);
  });

  it('bronco pulls t_utility', () => {
    expect(canHitch('bronco', 't_utility')).toBe(true);
  });

  it('sedan pulls nothing', () => {
    for (const def of TRAILER_DEFS) {
      expect(canHitch('sedan', def.id)).toBe(false);
    }
  });

  it('unknown vehicle/trailer ids -> false', () => {
    expect(canHitch('unknown_vehicle', 't_utility')).toBe(false);
    expect(canHitch('semi', 'unknown_trailer')).toBe(false);
    expect(canHitch('unknown_vehicle', 'unknown_trailer')).toBe(false);
  });
});

describe('TRAILER_DEFS', () => {
  it('has 5 unique ids', () => {
    expect(TRAILER_DEFS).toHaveLength(5);
    const ids = TRAILER_DEFS.map((def) => def.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('tanker fuelMax is 2000', () => {
    expect(trailerDef('t_tanker')?.fuelMax).toBe(2000);
  });

  it('towClass ordering utility < flatbed < box', () => {
    const utility = trailerDef('t_utility');
    const flatbed = trailerDef('t_flatbed');
    const box = trailerDef('t_box');
    expect(utility).toBeDefined();
    expect(flatbed).toBeDefined();
    expect(box).toBeDefined();
    expect(utility!.towClass).toBeLessThan(flatbed!.towClass);
    expect(flatbed!.towClass).toBeLessThan(box!.towClass);
  });
});

describe('MODULE_DEFS', () => {
  it('has 3 unique ids', () => {
    expect(MODULE_DEFS).toHaveLength(3);
    const ids = MODULE_DEFS.map((def) => def.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('every cost itemId is a non-empty string with qty >= 1', () => {
    for (const def of MODULE_DEFS) {
      expect(def.cost.length).toBeGreaterThan(0);
      for (const entry of def.cost) {
        expect(typeof entry.itemId).toBe('string');
        expect(entry.itemId.length).toBeGreaterThan(0);
        expect(entry.qty).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
