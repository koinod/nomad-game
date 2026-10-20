import { describe, expect, it } from 'vitest';
import {
  MODULE_DEFS,
  TRAILER_DEFS,
  canHitch,
  deckBayCount,
  isDeckKind,
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
  it('has 6 unique ids', () => {
    expect(TRAILER_DEFS).toHaveLength(6);
    const ids = TRAILER_DEFS.map((def) => def.id);
    expect(new Set(ids).size).toBe(6);
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

describe('HET-70 lowboy (gooseneck)', () => {
  it('is a gooseneck class-3 deck trailer with 3 bays', () => {
    const lowboy = trailerDef('t_lowboy');
    expect(lowboy).toBeDefined();
    expect(lowboy!.kind).toBe('lowboy');
    expect(lowboy!.gooseneck).toBe(true);
    expect(lowboy!.towClass).toBe(3);
    expect(isDeckKind(lowboy!.kind)).toBe(true);
    expect(deckBayCount(lowboy!)).toBe(3);
    // wider than the tank it hauls (tank def width 3.3)
    expect(lowboy!.width).toBeGreaterThan(3.3);
  });

  it('only fifth-wheel-class rigs can hitch it', () => {
    for (const v of ['semi', 'semi_day', 'goliath', 'tank']) {
      expect(canHitch(v, 't_lowboy')).toBe(true);
    }
    // rating alone is not enough, and lesser trucks are out entirely
    for (const v of ['f250', 'pickup', 'van', 'bronco', 'sedan']) {
      expect(canHitch(v, 't_lowboy')).toBe(false);
    }
  });

  it('other deck trailers keep 1 bay; non-decks have none', () => {
    expect(deckBayCount(trailerDef('t_carrier')!)).toBe(1);
    expect(deckBayCount(trailerDef('t_flatbed')!)).toBe(1);
    expect(deckBayCount(trailerDef('t_box')!)).toBe(0);
    expect(isDeckKind('box')).toBe(false);
    expect(isDeckKind('tanker')).toBe(false);
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
