// containers.ts — the carried-forest engine (pure functions).
//
// INVENTORY V2 MODEL (Ian 2026-10-21 — Unturned × Tarkov hybrid):
// the character's storage is what they wear. The store's flat
// `inventory` list holds TOP-LEVEL instances only:
//   - pockets items (loc: 'pockets') — the small always-present grid;
//   - worn garment instances and slotted weapon instances (referenced
//     from Equipped — they live in their slots, in no grid);
//   - (transiently) loose items, which normalization gives a home.
// Everything else lives INSIDE a container instance's `contents` —
// a worn backpack's contents are the backpack grid; a weapon case in
// the backpack has its own contents, and so on. Contents travel with
// their container (Tarkov rule) wherever the instance goes.
//
// NESTING RULES (stated, pinned by tests):
//   - a container can never contain itself or one of its descendants;
//   - an item may sit inside at most MAX_CONTAINER_DEPTH nested
//     containers (pockets/backpack contents = depth 1, a case inside
//     the backpack = 2, a pouch inside that case = 3 — no deeper);
//   - a destination grid must fit the item's footprint AND the
//     destination's contents-weight cap (def.container.kg) must hold;
//   - slotted/worn items never transfer directly (unequip first).

import { ITEMS } from '../data/items';
import { perkNum } from '../data/skills';
import { layoutItems } from './gridUtils';
import { slotOfUid } from './equipment';
import type { Equipped, InvItem, NearbyEntry } from './types';

export const POCKET_DIMS = { cols: 2, rows: 2 };
export const POCKET_KG = 5;
export const MAX_CONTAINER_DEPTH = 3;

export interface GridSpec { cols: number; rows: number; kg: number }

/** A place an item can be transferred into: the pockets root grid, the
 *  loose "in arms" root grid, or the contents grid of one container
 *  instance (worn or carried). */
export type CarriedDest =
  | { type: 'pockets' }
  | { type: 'loose' }
  | { type: 'container'; uid: string };

export const POCKETS: CarriedDest = { type: 'pockets' };
/**
 * LOOSE — "in arms": the last-resort carry grid (the pre-v2 base grid,
 * 8×5). Worn containers and pockets are tried FIRST, always; loose
 * only takes what fits nowhere worn — loot overflow before the first
 * pack, disassembly yields, quest rewards. It is a real placement
 * grid so the deck can show it honestly, and normalization still
 * folds loose items into a worn backpack on load when one exists.
 */
export const LOOSE: CarriedDest = { type: 'loose' };
export const LOOSE_DIMS = { cols: 8, rows: 5 };

export function isContainerItem(it: InvItem): boolean {
  return !!ITEMS[it.itemId]?.container;
}

export function gridSpecForItem(it: InvItem): GridSpec | null {
  const c = ITEMS[it.itemId]?.container;
  return c ? { cols: c.cols, rows: c.rows, kg: c.kg } : null;
}

export function pocketsSpec(perks?: readonly string[]): GridSpec {
  // sc_pockets (Deep Pockets): +4 slots over the base 2×2 — the grid
  // grows a column pair (4×2 = 8 cells). The effect value is a slot
  // count; two slots per added column at 2 rows.
  const bonusSlots = perks ? perkNum(perks, 'bonusSlots', 0) : 0;
  const cols = POCKET_DIMS.cols + (bonusSlots > 0 ? Math.ceil(bonusSlots / POCKET_DIMS.rows) : 0);
  return { cols, rows: POCKET_DIMS.rows, kg: POCKET_KG };
}

// ---------- walking the forest ----------

/** Every carried instance, depth-first: top-level, then contents. */
export function walkCarried(inv: readonly InvItem[]): InvItem[] {
  const out: InvItem[] = [];
  const visit = (list: readonly InvItem[]) => {
    for (const it of list) {
      out.push(it);
      if (it.contents) visit(it.contents);
    }
  };
  visit(inv);
  return out;
}

/** All uids in an item's subtree, including its own. */
export function subtreeUids(it: InvItem): Set<string> {
  const out = new Set<string>();
  const visit = (x: InvItem) => {
    out.add(x.uid);
    for (const c of x.contents ?? []) visit(c);
  };
  visit(it);
  return out;
}

/** How many further container levels nest inside this item
 *  (0 = not a container / empty container). */
export function subtreeHeight(it: InvItem): number {
  if (!it.contents || it.contents.length === 0) return 0;
  return 1 + Math.max(0, ...it.contents.map((c) => (isContainerItem(c) ? subtreeHeight(c) : 0)));
}

export interface FoundItem {
  item: InvItem;
  /** uid of the container instance holding it; null = top level. */
  containerUid: string | null;
  /** how many containers enclose it (0 = top level). */
  depth: number;
}

export function findCarried(inv: readonly InvItem[], uid: string): FoundItem | null {
  const visit = (list: readonly InvItem[], containerUid: string | null, depth: number): FoundItem | null => {
    for (const it of list) {
      if (it.uid === uid) return { item: it, containerUid, depth };
      if (it.contents) {
        const hit = visit(it.contents, it.uid, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return visit(inv, null, 0);
}

/** Total carried count of an itemId, across every grid and container. */
export function countCarried(inv: readonly InvItem[], itemId: string): number {
  return walkCarried(inv).reduce((a, i) => a + (i.itemId === itemId ? i.qty : 0), 0);
}

/** Recursive weight: an instance weighs its own units plus everything
 *  inside it. This is the number the carry limit reads. */
export function itemWeightKg(it: InvItem): number {
  const own = (ITEMS[it.itemId]?.weight ?? 0) * it.qty;
  return own + (it.contents ?? []).reduce((a, c) => a + itemWeightKg(c), 0);
}

export function weightCarried(inv: readonly InvItem[]): number {
  return inv.reduce((a, i) => a + itemWeightKg(i), 0);
}

/** itemId -> total qty over the whole forest (conservation checks). */
export function itemMultiset(inv: readonly InvItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of walkCarried(inv)) out.set(it.itemId, (out.get(it.itemId) ?? 0) + it.qty);
  return out;
}

export function hasPhoneCarried(inv: readonly InvItem[]): boolean {
  return walkCarried(inv).some((i) => i.itemId === 'phone');
}

// ---------- immutable forest surgery ----------

function mapList(list: InvItem[], uid: string, fn: (it: InvItem) => InvItem): InvItem[] {
  let changed = false;
  const next = list.map((it) => {
    if (it.uid === uid) {
      changed = true;
      return fn(it);
    }
    if (it.contents) {
      const inner = mapList(it.contents, uid, fn);
      if (inner !== it.contents) {
        changed = true;
        return { ...it, contents: inner };
      }
    }
    return it;
  });
  return changed ? next : list;
}

/** Replace one carried instance (wherever it lives) with fn(item). */
export function updateCarried(inv: InvItem[], uid: string, fn: (it: InvItem) => InvItem): InvItem[] {
  return mapList(inv, uid, fn);
}

function removeFromList(list: InvItem[], uid: string): { list: InvItem[]; removed: InvItem | null } {
  const idx = list.findIndex((i) => i.uid === uid);
  if (idx >= 0) {
    return { list: [...list.slice(0, idx), ...list.slice(idx + 1)], removed: list[idx] };
  }
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it.contents) continue;
    const sub = removeFromList(it.contents, uid);
    if (sub.removed) {
      const next = [...list];
      next[i] = { ...it, contents: sub.list };
      return { list: next, removed: sub.removed };
    }
  }
  return { list, removed: null };
}

export type RemoveResult =
  | { ok: true; inventory: InvItem[]; removed: InvItem }
  | { ok: false; inventory: InvItem[]; reason: string };

/**
 * Remove qty units of one instance from wherever it lives.
 * A NON-EMPTY container is never partially consumed away: removing its
 * last unit is refused unless allowContents (drop semantics — the
 * whole bag, contents and all, leaves the carried set together).
 */
export function removeCarried(
  inv: InvItem[],
  uid: string,
  qty: number,
  opts?: { allowContents?: boolean },
): RemoveResult {
  const found = findCarried(inv, uid);
  if (!found) return { ok: false, inventory: inv, reason: 'not-carried' };
  const { item } = found;
  if (qty < item.qty) {
    return {
      ok: true,
      inventory: updateCarried(inv, uid, (i) => ({ ...i, qty: i.qty - qty })),
      removed: { ...item, qty },
    };
  }
  if ((item.contents?.length ?? 0) > 0 && !opts?.allowContents) {
    return { ok: false, inventory: inv, reason: 'container-not-empty' };
  }
  const { list, removed } = removeFromList(inv, uid);
  if (!removed) return { ok: false, inventory: inv, reason: 'not-carried' };
  return { ok: true, inventory: list, removed };
}

// ---------- destination grids ----------

/** Top-level items carried loose: not slotted, not worn, not pockets. */
export function looseRoots(inv: readonly InvItem[], eq: Equipped): InvItem[] {
  const held = new Set(
    (['primary', 'secondary', 'tertiary', 'head', 'jacket', 'vest', 'pants', 'backpack'] as const)
      .map((s) => eq[s]).filter((u): u is string => !!u),
  );
  return inv.filter((i) => !held.has(i.uid) && i.loc !== 'pockets');
}

/** The items currently rendered in a destination grid. */
export function listInDest(inv: readonly InvItem[], dest: CarriedDest, eq?: Equipped): InvItem[] {
  if (dest.type === 'pockets') {
    return inv.filter((i) => i.loc === 'pockets');
  }
  if (dest.type === 'loose') {
    return eq ? looseRoots(inv, eq) : inv.filter((i) => i.loc !== 'pockets');
  }
  const holder = findCarried(inv, dest.uid);
  return holder ? [...(holder.item.contents ?? [])] : [];
}

export function specForDest(inv: readonly InvItem[], dest: CarriedDest, perks?: readonly string[]): GridSpec | null {
  if (dest.type === 'pockets') return pocketsSpec(perks);
  if (dest.type === 'loose') return { ...LOOSE_DIMS, kg: Number.POSITIVE_INFINITY };
  const holder = findCarried(inv, dest.uid);
  return holder ? gridSpecForItem(holder.item) : null;
}

/** Would `item` fit in the destination grid (footprint + kg cap)?
 *  Returns the first-fit placement when it fits. */
export function fitInDest(
  inv: readonly InvItem[],
  dest: CarriedDest,
  item: InvItem,
  eq?: Equipped,
  perks?: readonly string[],
): { gx: number; gy: number; rot: boolean } | null {
  const spec = specForDest(inv, dest, perks);
  if (!spec) return null;
  const current = listInDest(inv, dest, eq).filter((i) => i.uid !== item.uid);
  const contentsKg = current.reduce((a, i) => a + itemWeightKg(i), 0);
  if (contentsKg + itemWeightKg(item) > spec.kg + 1e-9) return null;
  const candidate: InvItem = { ...item, gx: undefined, gy: undefined, rot: undefined };
  const layout = layoutItems([...current, candidate], spec.cols, spec.rows);
  if (layout.overflow.includes(item.uid)) return null;
  return layout.placed.get(item.uid) ?? null;
}

/** Insert an instance into a destination grid (placement assigned).
 *  Assumes fitInDest passed. Returns the new forest. */
export function insertIntoDest(inv: InvItem[], dest: CarriedDest, item: InvItem, eq?: Equipped, perks?: readonly string[]): InvItem[] {
  const placement = fitInDest(inv, dest, item, eq, perks);
  const placed: InvItem = placement
    ? { ...item, gx: placement.gx, gy: placement.gy, rot: placement.rot }
    : { ...item, gx: undefined, gy: undefined, rot: undefined };
  if (dest.type === 'pockets') {
    return [...inv, { ...placed, loc: 'pockets' as const }];
  }
  if (dest.type === 'loose') {
    return [...inv, { ...placed, loc: undefined }];
  }
  return updateCarried(inv, dest.uid, (holder) => ({
    ...holder,
    contents: [...(holder.contents ?? []), { ...placed, loc: undefined }],
  }));
}

// ---------- transfers ----------

export type TransferResult =
  | { ok: true; inventory: InvItem[] }
  | { ok: false; inventory: InvItem[]; reason: string };

/**
 * Move one whole instance between carried grids — the single op every
 * inventory transfer is built on (drill-in, garment grids, pockets).
 * Conservation: the instance (with its whole subtree) leaves one list
 * and enters the other; nothing is created, merged, or dropped.
 */
export function transferCarried(
  inv: InvItem[],
  eq: Equipped,
  uid: string,
  dest: CarriedDest,
  perks?: readonly string[],
): TransferResult {
  const found = findCarried(inv, uid);
  if (!found) return { ok: false, inventory: inv, reason: 'not-carried' };
  if (slotOfUid(eq, uid)) return { ok: false, inventory: inv, reason: 'slotted' };
  const { item } = found;

  // already there?
  const inDest = dest.type === 'pockets'
    ? found.containerUid === null && item.loc === 'pockets'
    : dest.type === 'loose'
      ? found.containerUid === null && item.loc !== 'pockets'
      : found.containerUid === dest.uid;
  if (inDest) return { ok: true, inventory: inv };

  if (dest.type === 'container') {
    const holder = findCarried(inv, dest.uid);
    if (!holder) return { ok: false, inventory: inv, reason: 'no-such-container' };
    if (!gridSpecForItem(holder.item)) return { ok: false, inventory: inv, reason: 'not-a-container' };
    // cycle rule: never into itself or one of its own descendants
    if (dest.uid === uid || subtreeUids(item).has(dest.uid)) {
      return { ok: false, inventory: inv, reason: 'cycle' };
    }
    // depth rule: the item lands one level below the holder; its own
    // subtree extends subtreeHeight further.
    const landingDepth = holder.depth + 1;
    if (landingDepth + subtreeHeight(item) > MAX_CONTAINER_DEPTH) {
      return { ok: false, inventory: inv, reason: 'too-deep' };
    }
  }

  if (!fitInDest(inv, dest, item, eq, perks)) return { ok: false, inventory: inv, reason: 'no-fit' };

  const removed = removeFromList(inv, uid);
  if (!removed.removed) return { ok: false, inventory: inv, reason: 'not-carried' };
  return { ok: true, inventory: insertIntoDest(removed.list, dest, removed.removed, eq, perks) };
}

/** Where new pickups land, in order: the worn backpack first (it is
 *  the main storage), then pockets, then the other worn garments —
 *  and LOOSE ("in arms") only when nothing worn can take it. */
export function receiveDests(inv: readonly InvItem[], eq: Equipped): CarriedDest[] {
  const out: CarriedDest[] = [];
  const worn = (slot: 'backpack' | 'jacket' | 'vest' | 'pants') => {
    const uid = eq[slot];
    if (!uid) return;
    const found = findCarried(inv, uid);
    if (found && gridSpecForItem(found.item)) out.push({ type: 'container', uid });
  };
  worn('backpack');
  out.push(POCKETS);
  worn('jacket');
  worn('vest');
  worn('pants');
  out.push(LOOSE);
  return out;
}

/** Place a fresh instance into the first receive grid it fits. */
export function addToCarried(inv: InvItem[], eq: Equipped, item: InvItem, perks?: readonly string[]): InvItem[] | null {
  for (const dest of receiveDests(inv, eq)) {
    if (fitInDest(inv, dest, item, eq, perks)) return insertIntoDest(inv, dest, item, eq, perks);
  }
  return null;
}

/** First grid (receive order) an existing stack of itemId can top up. */
export function stackRoomInCarried(inv: readonly InvItem[], itemId: string): number {
  const def = ITEMS[itemId];
  if (!def) return 0;
  return walkCarried(inv)
    .filter((i) => i.itemId === itemId)
    .reduce((a, i) => a + Math.max(0, def.stack - i.qty), 0);
}

// ---------- load normalization + migration ----------

export interface NormalizeResult {
  inventory: InvItem[];
  equipped: Equipped;
  /** true when the sat phone had to be granted (absent everywhere). */
  phoneGranted: boolean;
  /** true when a starter day pack was granted so legacy loose items
   *  had a backpack to land in. */
  packGranted: boolean;
}

/**
 * Give every carried item a home under the v2 model, on load:
 *  - loose top-level items (pre-v2 saves: the whole flat pack) move
 *    into the worn backpack's contents — the addendum's migration;
 *  - if loose items exist but no backpack exists anywhere, a Day pack
 *    is granted and worn so the contents have somewhere to land;
 *  - the sat phone is granted into pockets when absent everywhere
 *    (Ian: existing saves get the phone on load).
 * Idempotent: a v2-shaped inventory passes through unchanged.
 */
export function normalizeCarried(
  rawInv: readonly InvItem[],
  eq: Equipped,
  newUid: () => string,
): NormalizeResult {
  let inv: InvItem[] = rawInv.map((i) => ({ ...i, contents: i.contents?.map((c) => ({ ...c })) }));
  let equipped: Equipped = { ...eq };
  let packGranted = false;

  const referenced = new Set(
    (['primary', 'secondary', 'tertiary', 'head', 'jacket', 'vest', 'pants', 'backpack'] as const)
      .map((s) => equipped[s]).filter((u): u is string => !!u),
  );
  const loose = inv.filter((i) => !referenced.has(i.uid) && i.loc !== 'pockets');

  if (loose.length > 0) {
    // find or create the backpack
    let pack = equipped.backpack ? findCarried(inv, equipped.backpack)?.item : undefined;
    if (!pack) {
      pack = walkCarried(inv).find((i) => ITEMS[i.itemId]?.garmentSlot === 'backpack'
        || ITEMS[i.itemId]?.category === 'pack');
    }
    if (!pack) {
      pack = { uid: newUid(), itemId: 'pack_t1', qty: 1, contents: [] };
      inv = [...inv, pack];
      packGranted = true;
    }
    if (equipped.backpack !== pack.uid) equipped = { ...equipped, backpack: pack.uid };
    const dest: CarriedDest = { type: 'container', uid: pack.uid };
    for (const item of loose) {
      if (!fitInDest(inv, dest, item)) continue; // stays loose; renders as overflow, never lost
      const removed = removeFromList(inv, item.uid);
      if (removed.removed) inv = insertIntoDest(removed.list, dest, removed.removed);
    }
  }

  let phoneGranted = false;
  if (!hasPhoneCarried(inv)) {
    inv = [...inv, { uid: newUid(), itemId: 'phone', qty: 1, loc: 'pockets' as const }];
    phoneGranted = true;
  }
  return { inventory: inv, equipped, phoneGranted, packGranted };
}

// ---------- nearby storage (pure list builder) ----------

export interface NearbyVehicleSource { uid: string; label: string; x: number; z: number; usedKg: number; capKg: number }
export interface NearbyContainerSource { id: string; label: string; x: number; z: number; looted: boolean; locked: boolean }

/**
 * The NEARBY list: vehicles within the vehicle-storage radius and
 * world containers within the interact radius of the player, nearest
 * first. The radii come from the interact system (one source — the
 * same ranges the world prompts use); Game feeds live positions in.
 */
export function nearbyFromSources(
  px: number,
  pz: number,
  vehicles: readonly NearbyVehicleSource[],
  containers: readonly NearbyContainerSource[],
  vehicleRadius: number,
  containerRadius: number,
): NearbyEntry[] {
  const out: NearbyEntry[] = [];
  for (const v of vehicles) {
    const d = Math.hypot(v.x - px, v.z - pz);
    if (d <= vehicleRadius) {
      out.push({
        kind: 'vehicle', uid: v.uid, label: v.label,
        dist: Math.round(d * 10) / 10, usedKg: v.usedKg, capKg: v.capKg,
      });
    }
  }
  for (const c of containers) {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d <= containerRadius) {
      out.push({
        kind: 'container', uid: c.id, label: c.label,
        dist: Math.round(d * 10) / 10, looted: c.looted, locked: c.locked,
      });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}
