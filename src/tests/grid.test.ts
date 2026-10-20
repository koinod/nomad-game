// Pure unit tests for the wave-3 grid placement math (no DOM).
import { describe, expect, it } from 'vitest';
import {
  arrangeItems,
  canPlace,
  containerGridDims,
  footprintOf,
  layoutItems,
  packGridDims,
} from '../store/gridUtils';
import type { InvItem } from '../store/types';

const it_ = (uid: string, itemId: string, extra?: Partial<InvItem>): InvItem => ({
  uid, itemId, qty: 1, ...extra,
});

describe('footprintOf (wave-3 footprint table)', () => {
  it('long guns are 5x2, handguns 2x2, trauma kit 2x2, ammo 1x1', () => {
    expect(footprintOf('dmr')).toEqual({ w: 5, h: 2 });
    expect(footprintOf('hunting_rifle')).toEqual({ w: 5, h: 2 });
    expect(footprintOf('pistol')).toEqual({ w: 2, h: 2 });
    expect(footprintOf('medkit')).toEqual({ w: 2, h: 2 });
    expect(footprintOf('ammo_9mm')).toEqual({ w: 1, h: 1 });
    expect(footprintOf('tire')).toEqual({ w: 2, h: 2 });
  });

  it('rotation swaps w and h', () => {
    expect(footprintOf('dmr', true)).toEqual({ w: 2, h: 5 });
    expect(footprintOf('ammo_9mm', true)).toEqual({ w: 1, h: 1 });
  });

  it('every catalog item has a positive footprint', async () => {
    const { ITEMS } = await import('../data/items');
    for (const def of Object.values(ITEMS)) {
      const f = footprintOf(def.id);
      expect(f.w).toBeGreaterThanOrEqual(1);
      expect(f.h).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('layoutItems', () => {
  it('first-fits an unplaced item at the origin', () => {
    const { placed, overflow } = layoutItems([it_('a', 'pistol')], 8, 5);
    expect(placed.get('a')).toEqual({ gx: 0, gy: 0, rot: false });
    expect(overflow).toEqual([]);
  });

  it('honors a still-legal saved placement', () => {
    const items = [it_('a', 'pistol', { gx: 4, gy: 2, rot: false }), it_('b', 'bandage')];
    const { placed } = layoutItems(items, 8, 5);
    expect(placed.get('a')).toEqual({ gx: 4, gy: 2, rot: false });
    expect(placed.get('b')).toEqual({ gx: 0, gy: 0, rot: false });
  });

  it('re-fits a saved placement that now collides', () => {
    const items = [
      it_('a', 'medkit', { gx: 0, gy: 0 }),
      it_('b', 'medkit', { gx: 0, gy: 0 }), // same saved spot — second one loses
    ];
    const { placed, overflow } = layoutItems(items, 8, 5);
    expect(placed.get('a')).toEqual({ gx: 0, gy: 0, rot: false });
    expect(placed.get('b')).not.toEqual({ gx: 0, gy: 0, rot: false });
    expect(overflow).toEqual([]);
  });

  it('rotates a long gun to fit a narrow grid', () => {
    // 4-wide grid: a 5x2 rifle only fits rotated (2x5)
    const { placed, overflow } = layoutItems([it_('r', 'dmr')], 4, 6);
    expect(placed.get('r')).toEqual({ gx: 0, gy: 0, rot: true });
    expect(overflow).toEqual([]);
  });

  it('reports overflow instead of dropping items that cannot fit', () => {
    const items = [it_('a', 'medkit'), it_('b', 'medkit')]; // 2x2 grid holds one 2x2
    const { placed, overflow } = layoutItems(items, 2, 2);
    expect(placed.size).toBe(1);
    expect(overflow).toEqual(['b']);
  });
});

describe('canPlace', () => {
  it('rejects out-of-bounds and overlaps, allows legal cells', () => {
    const items = [it_('a', 'medkit'), it_('b', 'bandage')];
    const byUid = new Map(items.map((i) => [i.uid, i]));
    const placed = new Map([['a', { gx: 0, gy: 0, rot: false }]]);
    expect(canPlace(placed, byUid, 'b', 1, 1, false, 8, 5)).toBe(false); // overlaps medkit
    expect(canPlace(placed, byUid, 'b', 2, 0, false, 8, 5)).toBe(true);
    expect(canPlace(placed, byUid, 'b', 8, 0, false, 8, 5)).toBe(false); // out of bounds
    expect(canPlace(placed, byUid, 'b', -1, 0, false, 8, 5)).toBe(false);
    // an item never collides with itself
    expect(canPlace(placed, byUid, 'a', 0, 0, false, 8, 5)).toBe(true);
  });
});

describe('arrangeItems', () => {
  it('packs largest first and is deterministic', () => {
    const items = [it_('s', 'bandage'), it_('big', 'dmr'), it_('m', 'medkit')];
    const a = arrangeItems(items, 8, 5, 'size');
    const b = arrangeItems(items, 8, 5, 'size');
    expect(a.placed.get('big')).toEqual({ gx: 0, gy: 0, rot: false });
    expect([...a.placed.entries()]).toEqual([...b.placed.entries()]);
    expect(a.overflow).toEqual([]);
  });

  it('category order groups weapons before ammo', () => {
    const items = [it_('ammo', 'ammo_9mm'), it_('gun', 'pistol')];
    const { placed } = arrangeItems(items, 8, 5, 'category');
    // 'ammo' category sorts before 'weapon-ranged', so the ammo takes 0,0
    expect(placed.get('ammo')).toEqual({ gx: 0, gy: 0, rot: false });
    expect(placed.get('gun')?.gx).toBe(1);
  });
});

describe('grid dims', () => {
  it('pack rows grow with the equipped pack tier', () => {
    expect(packGridDims(null)).toEqual({ cols: 8, rows: 5 });
    expect(packGridDims('pack_t1').rows).toBe(7);
    expect(packGridDims('pack_t2').rows).toBe(9);
  });

  it('container rows scale with weight cap, clamped 3..12', () => {
    expect(containerGridDims(25)).toEqual({ cols: 8, rows: 3 });
    expect(containerGridDims(150)).toEqual({ cols: 8, rows: 5 });
    expect(containerGridDims(2400)).toEqual({ cols: 8, rows: 12 });
  });
});
