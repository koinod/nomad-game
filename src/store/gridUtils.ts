// Pure grid-placement math for the wave-3 Tarkov-style inventory grid.
// No DOM, no store: given item instances and a grid size, decide where every
// stack sits. Saved placements (gx/gy/rot on the instance) win when still
// legal; everything else is first-fit. Items that cannot fit are reported
// as overflow — the UI shows them in a strip below the grid, never hides them.

import { ITEMS } from '../data/items';
import type { InvItem } from './types';

export interface CellSize {
  w: number;
  h: number;
}

export interface Placement {
  gx: number;
  gy: number;
  rot: boolean;
}

/** Footprint of one stack of an item, optionally rotated 90°. */
export function footprintOf(itemId: string, rot = false): CellSize {
  const def = ITEMS[itemId];
  let w = def?.w;
  let h = def?.h;
  if (!w || !h) {
    // fallback for any def without an authored footprint: derive from slots
    const slots = def?.slots ?? 1;
    if (slots <= 1) { w = 1; h = 1; }
    else if (slots === 2) { w = 2; h = 1; }
    else if (slots === 3) { w = 3; h = 1; }
    else { w = 2; h = 2; }
  }
  return rot ? { w: h, h: w } : { w, h };
}

export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/** Would this placement be legal? `placed` maps uid -> placement for the
 *  items already down; `selfUid` is excluded from the overlap check. */
export function canPlace(
  placed: ReadonlyMap<string, Placement>,
  itemsByUid: ReadonlyMap<string, InvItem>,
  selfUid: string,
  gx: number,
  gy: number,
  rot: boolean,
  cols: number,
  rows: number,
): boolean {
  const self = itemsByUid.get(selfUid);
  if (!self) return false;
  const { w, h } = footprintOf(self.itemId, rot);
  if (gx < 0 || gy < 0 || gx + w > cols || gy + h > rows) return false;
  for (const [uid, p] of placed) {
    if (uid === selfUid) continue;
    const other = itemsByUid.get(uid);
    if (!other) continue;
    const o = footprintOf(other.itemId, p.rot);
    if (rectsOverlap(gx, gy, w, h, p.gx, p.gy, o.w, o.h)) return false;
  }
  return true;
}

/** First-fit scan (rows top-to-bottom, columns left-to-right). Tries the
 *  unrotated footprint first, then rotated. Returns null when nothing fits. */
export function firstFit(
  placed: ReadonlyMap<string, Placement>,
  itemsByUid: ReadonlyMap<string, InvItem>,
  uid: string,
  cols: number,
  rows: number,
): Placement | null {
  const item = itemsByUid.get(uid);
  if (!item) return null;
  const square = footprintOf(item.itemId).w === footprintOf(item.itemId).h;
  for (const rot of square ? [false] : [false, true]) {
    const { w, h } = footprintOf(item.itemId, rot);
    if (w > cols || h > rows) continue;
    for (let gy = 0; gy + h <= rows; gy++) {
      for (let gx = 0; gx + w <= cols; gx++) {
        if (canPlace(placed, itemsByUid, uid, gx, gy, rot, cols, rows)) {
          return { gx, gy, rot };
        }
      }
    }
  }
  return null;
}

export interface LayoutResult {
  placed: Map<string, Placement>;
  overflow: string[]; // uids that did not fit, in input order
}

/**
 * Lay out a container's items. Items carrying a still-legal saved placement
 * keep it (processed in array order); the rest are first-fit in array order.
 */
export function layoutItems(items: InvItem[], cols: number, rows: number): LayoutResult {
  const byUid = new Map(items.map((i) => [i.uid, i]));
  const placed = new Map<string, Placement>();
  const overflow: string[] = [];
  // pass 1: honor saved placements
  for (const it of items) {
    if (it.gx === undefined || it.gy === undefined) continue;
    const rot = it.rot ?? false;
    if (canPlace(placed, byUid, it.uid, it.gx, it.gy, rot, cols, rows)) {
      placed.set(it.uid, { gx: it.gx, gy: it.gy, rot });
    }
  }
  // pass 2: first-fit the rest
  for (const it of items) {
    if (placed.has(it.uid)) continue;
    const p = firstFit(placed, byUid, it.uid, cols, rows);
    if (p) placed.set(it.uid, p);
    else overflow.push(it.uid);
  }
  return { placed, overflow };
}

/**
 * A fresh arrangement from scratch (the Auto-arrange / Sort buttons):
 * largest footprints first ('size') or grouped by category then size
 * ('category'). Deterministic for a given input order.
 */
export function arrangeItems(
  items: InvItem[],
  cols: number,
  rows: number,
  order: 'size' | 'category',
): LayoutResult {
  const area = (i: InvItem) => {
    const f = footprintOf(i.itemId);
    return f.w * f.h;
  };
  const sorted = [...items].sort((a, b) => {
    if (order === 'category') {
      const ca = ITEMS[a.itemId]?.category ?? '';
      const cb = ITEMS[b.itemId]?.category ?? '';
      if (ca !== cb) return ca < cb ? -1 : 1;
    }
    const d = area(b) - area(a);
    if (d !== 0) return d;
    const na = ITEMS[a.itemId]?.name ?? '';
    const nb = ITEMS[b.itemId]?.name ?? '';
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  const byUid = new Map(items.map((i) => [i.uid, i]));
  const placed = new Map<string, Placement>();
  const overflow: string[] = [];
  for (const it of sorted) {
    const p = firstFit(placed, byUid, it.uid, cols, rows);
    if (p) placed.set(it.uid, p);
    else overflow.push(it.uid);
  }
  return { placed, overflow };
}

/** Pack grid dimensions: 8 columns; rows grow with the equipped pack,
 *  mirroring the packSlots ladder (none +0, day pack +2, rigger +4). */
export function packGridDims(packItemId: string | null | undefined): { cols: number; rows: number } {
  const bonus = packItemId ? (ITEMS[packItemId]?.packSlots ?? 0) : 0;
  return { cols: 8, rows: 5 + Math.round(bonus / 2) };
}

/** Container grid dimensions from its weight cap: bigger boxes, more rows. */
export function containerGridDims(capKg: number): { cols: number; rows: number } {
  return { cols: 8, rows: Math.max(3, Math.min(12, Math.ceil(capKg / 30))) };
}
