// stackOps.test.ts — systems completeness, inventory/storage piece.
//
// The audit found the management layer had whole-stack moves only:
// no splitting, no partial transfers, no take-all/put-all for storage,
// no storage sort, no partial loot takes, and NO player deposit or
// withdraw for the base stockpile at all. These tests pin the new
// state math: conservation above all (units are never created or
// destroyed), merge-first partial moves, honest partial results, and
// the stockpile's presence gate.

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import {
  countCarried,
  destOfCarried,
  findCarried,
  itemMultiset,
  listInDest,
  POCKETS,
  splitCarriedStack,
  transferCarriedQty,
  type CarriedDest,
} from '../store/containers';
import { applyClaim, newClaimsState } from '../systems/baseClaims';
import { setGame } from '../game/instance';
import type { InvItem } from '../store/types';

const S = () => useGameStore.getState();
const POIS: Record<string, [number, number]> = { shore_camp: [100, 200] };

function reset(partial: Parameters<typeof useGameStore.setState>[0] = {}) {
  useGameStore.setState({
    inventory: [], equipped: emptyEquipped(), hotbar: [null, null, null, null],
    storageOpen: null, storageItems: [], lootStash: {}, lootOpenId: null,
    claims: { home: null, outposts: [] }, base: null, toasts: [],
    poiPositions: { ...POIS }, pos: [0, 0, 0],
    hp: 100, maxHp: 100, difficulty: 'survivor',
    ...partial,
  });
}

const PACK: CarriedDest = { type: 'container', uid: 'pk' };
const VEST: CarriedDest = { type: 'container', uid: 'v1' };

function forestWithPack(contents: InvItem[]): InvItem[] {
  return [{ uid: 'pk', itemId: 'pack_t2', qty: 1, contents }];
}
const eqWithPack = () => ({ ...emptyEquipped(), backpack: 'pk' });

describe('destOfCarried', () => {
  it('resolves pockets, loose, container contents; slotted resolves null', () => {
    const inv: InvItem[] = [
      { uid: 'a', itemId: 'bandage', qty: 2, loc: 'pockets' },
      { uid: 'b', itemId: 'scrap', qty: 3 },
      ...forestWithPack([{ uid: 'c', itemId: 'wire', qty: 2 }]),
      { uid: 'w', itemId: 'pistol', qty: 1 },
    ];
    const eq = { ...eqWithPack(), primary: 'w' as const };
    expect(destOfCarried(inv, eq, 'a')).toEqual(POCKETS);
    expect(destOfCarried(inv, eq, 'b')?.type).toBe('loose');
    expect(destOfCarried(inv, eq, 'c')).toEqual(PACK);
    expect(destOfCarried(inv, eq, 'w')).toBeNull();
    expect(destOfCarried(inv, eq, 'nope')).toBeNull();
  });
});

describe('splitCarriedStack (pure)', () => {
  it('splits a stack inside its own grid; quantity is conserved', () => {
    const inv = forestWithPack([{ uid: 'am', itemId: 'ammo_9mm', qty: 40 }]);
    const before = itemMultiset(inv);
    const res = splitCarriedStack(inv, eqWithPack(), 'am', 15, 'am2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(itemMultiset(res.inventory)).toEqual(before);
    const stacks = listInDest(res.inventory, PACK).filter((i) => i.itemId === 'ammo_9mm');
    expect(stacks.map((s) => s.qty).sort((a, b) => a - b)).toEqual([15, 25]);
  });

  it('refuses bad quantities, unstackables, and full pockets', () => {
    const inv = forestWithPack([{ uid: 'am', itemId: 'ammo_9mm', qty: 40 }]);
    expect(splitCarriedStack(inv, eqWithPack(), 'am', 40, 'x').ok).toBe(false);
    expect(splitCarriedStack(inv, eqWithPack(), 'am', 0, 'x').ok).toBe(false);
    const knife = forestWithPack([{ uid: 'k', itemId: 'combat_knife', qty: 1 }]);
    expect(splitCarriedStack(knife, eqWithPack(), 'k', 1, 'x').ok).toBe(false);
    // pockets are 2×2: four 1×1 stacks leave no cell for a split-off
    const pockets: InvItem[] = [
      { uid: 'p1', itemId: 'ammo_9mm', qty: 10, loc: 'pockets' },
      { uid: 'p2', itemId: 'scrap', qty: 5, loc: 'pockets' },
      { uid: 'p3', itemId: 'wire', qty: 5, loc: 'pockets' },
      { uid: 'p4', itemId: 'cloth', qty: 5, loc: 'pockets' },
    ];
    const res = splitCarriedStack(pockets, emptyEquipped(), 'p1', 4, 'p5');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no-fit');
  });
});

describe('transferCarriedQty (pure)', () => {
  it('merges first into the destination stack, remainder as a fresh stack', () => {
    const inv: InvItem[] = [
      { uid: 'am', itemId: 'ammo_9mm', qty: 30, loc: 'pockets' },
      ...forestWithPack([{ uid: 'bp', itemId: 'ammo_9mm', qty: 50 }]),
    ];
    const before = itemMultiset(inv);
    const res = transferCarriedQty(inv, eqWithPack(), 'am', PACK, 20, 'fresh');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.moved).toBe(20);
    expect(itemMultiset(res.inventory)).toEqual(before);
    const inPack = listInDest(res.inventory, PACK).filter((i) => i.itemId === 'ammo_9mm');
    // 50 + 10 merge = 60 (cap), remaining 10 as a fresh stack
    expect(inPack.map((s) => s.qty).sort((a, b) => a - b)).toEqual([10, 60]);
    expect(findCarried(res.inventory, 'am')?.item.qty).toBe(10);
  });

  it('moves only what the destination weight cap allows and reports it', () => {
    // armored_vest grid: 3×2, 5kg. Already holding 8 lead (4.0kg);
    // 10 more lead requested (0.5kg ea) — room for exactly 2.
    const inv: InvItem[] = [
      { uid: 'v1', itemId: 'armored_vest', qty: 1, contents: [{ uid: 'ld0', itemId: 'lead', qty: 8 }] },
      ...forestWithPack([{ uid: 'ld', itemId: 'lead', qty: 10 }]),
    ];
    const eq = { ...eqWithPack(), vest: 'v1' as const };
    const res = transferCarriedQty(inv, eq, 'ld', VEST, 10, 'fresh');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.moved).toBe(2);
    expect(findCarried(res.inventory, 'ld')?.item.qty).toBe(8);
    expect(countCarried(res.inventory, 'lead')).toBe(18);
  });

  it('a full-quantity move keeps the instance identity (whole-move semantics)', () => {
    const inv: InvItem[] = [
      { uid: 'am', itemId: 'ammo_9mm', qty: 30, loc: 'pockets' },
      ...forestWithPack([]),
    ];
    const res = transferCarriedQty(inv, eqWithPack(), 'am', PACK, 30, 'fresh');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.moved).toBe(30);
    expect(findCarried(res.inventory, 'am')?.containerUid).toBe('pk');
  });

  it('same-destination partial move is a split', () => {
    const inv = forestWithPack([{ uid: 'am', itemId: 'ammo_9mm', qty: 40 }]);
    const res = transferCarriedQty(inv, eqWithPack(), 'am', PACK, 15, 'am2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stacks = listInDest(res.inventory, PACK).filter((i) => i.itemId === 'ammo_9mm');
    expect(stacks.map((s) => s.qty).sort((a, b) => a - b)).toEqual([15, 25]);
  });
});

// ---- a faithful in-memory stand-in for the engine storage surface ----
// Mirrors Game.ts: put merges by itemId under a weight cap and returns
// an error string; take removes the whole entry; set replaces a stack.
function fakeEngine(capKg: number) {
  const lists = new Map<string, InvItem[]>();
  const key = (kind: string, uid: string) => `${kind}:${uid}`;
  lists.set(key('vehicle', 'car1'), []);
  return {
    lists,
    getStorageItems: (kind: string, uid: string) => lists.get(key(kind, uid)) ?? null,
    storagePutItem: (kind: string, uid: string, item: InvItem) => {
      const list = lists.get(key(kind, uid));
      if (!list) return 'That storage is gone.';
      const w = list.reduce((a, i) => a + (({ scrap: 0.3, ammo_9mm: 0.02 } as Record<string, number>)[i.itemId] ?? 0) * i.qty, 0);
      const add = (({ scrap: 0.3, ammo_9mm: 0.02 } as Record<string, number>)[item.itemId] ?? 0) * item.qty;
      if (w + add > capKg) return 'No room — that would overload it.';
      const ex = list.find((i) => i.itemId === item.itemId);
      if (ex) ex.qty += item.qty;
      else list.push({ ...item });
      return null;
    },
    storageTakeItem: (kind: string, uid: string, index: number) => {
      const list = lists.get(key(kind, uid));
      if (!list || index < 0 || index >= list.length) return null;
      const [taken] = list.splice(index, 1);
      return { ...taken };
    },
    storageSetItem: (kind: string, uid: string, index: number, item: InvItem) => {
      const list = lists.get(key(kind, uid));
      if (!list || index < 0 || index >= list.length) return 'That storage is gone.';
      list[index] = { ...item };
      return null;
    },
    completeContainerLoot: () => {},
  };
}

describe('store storage quantity ops', () => {
  beforeEach(() => reset());

  function openCarWith(items: InvItem[], packContents: InvItem[]) {
    const eng = fakeEngine(150);
    eng.lists.set('vehicle:car1', items.map((i) => ({ ...i })));
    setGame(eng as never);
    reset({
      inventory: forestWithPack(packContents),
      equipped: eqWithPack(),
      storageOpen: { kind: 'vehicle', uid: 'car1', label: 'Test car' },
      storageItems: items.map((i) => ({ ...i })),
      fleet: [{ defId: 'car1', storageCapKg: 150 } as never],
    });
    return eng;
  }

  it('storagePutQty stores part of a stack; the rest stays packed', () => {
    const eng = openCarWith([], [{ uid: 'sc', itemId: 'scrap', qty: 20 }]);
    S().storagePutQty('sc', 7);
    expect(findCarried(S().inventory, 'sc')?.item.qty).toBe(13);
    expect(eng.lists.get('vehicle:car1')).toEqual([{ uid: 'sc', itemId: 'scrap', qty: 7 }]);
  });

  it('storageTakeQty takes part; the remainder returns to storage', () => {
    const eng = openCarWith([{ uid: 's1', itemId: 'ammo_9mm', qty: 50 }], []);
    S().storageTakeQty(0, 20);
    expect(countCarried(S().inventory, 'ammo_9mm')).toBe(20);
    expect(eng.lists.get('vehicle:car1')?.[0]?.qty).toBe(30);
  });

  it('storageTakeAll empties the trunk into the pack', () => {
    const eng = openCarWith(
      [{ uid: 's1', itemId: 'ammo_9mm', qty: 10 }, { uid: 's2', itemId: 'scrap', qty: 5 }],
      [],
    );
    S().storageTakeAll();
    expect(eng.lists.get('vehicle:car1')).toEqual([]);
    expect(countCarried(S().inventory, 'ammo_9mm')).toBe(10);
    expect(countCarried(S().inventory, 'scrap')).toBe(5);
  });

  it('storagePutAll sweeps the pack into the trunk', () => {
    const eng = openCarWith([], [
      { uid: 'a', itemId: 'ammo_9mm', qty: 10 },
      { uid: 'b', itemId: 'scrap', qty: 5 },
    ]);
    S().storagePutAll();
    expect(listInDest(S().inventory, PACK)).toEqual([]);
    const stored = eng.lists.get('vehicle:car1') ?? [];
    expect(stored.reduce((a, i) => a + i.qty, 0)).toBe(15);
  });
});

describe('store split + partial take + stockpile', () => {
  beforeEach(() => {
    setGame(null);
    reset();
  });

  it('splitStack action splits a carried stack in place', () => {
    reset({ inventory: forestWithPack([{ uid: 'am', itemId: 'ammo_9mm', qty: 40 }]), equipped: eqWithPack() });
    S().splitStack('am', 15);
    const stacks = listInDest(S().inventory, PACK).filter((i) => i.itemId === 'ammo_9mm');
    expect(stacks.map((s) => s.qty).sort((a, b) => a - b)).toEqual([15, 25]);
  });

  it('takeLootQty takes part of a loot stack and keeps the rest staged', () => {
    reset({ lootStash: { c1: [{ itemId: 'ammo_9mm', qty: 30 }] }, lootOpenId: 'c1' });
    S().takeLootQty('c1', 0, 12);
    expect(S().lootStash.c1).toEqual([{ itemId: 'ammo_9mm', qty: 18 }]);
    expect(countCarried(S().inventory, 'ammo_9mm')).toBe(12);
  });

  it('deposit/withdraw move goods at the base — and only at the base', () => {
    reset({
      inventory: [{ uid: 'sc', itemId: 'scrap', qty: 20 }],
      equipped: emptyEquipped(),
    });
    S().setClaims(applyClaim(newClaimsState(), 'shore_camp'));
    // standing at the claim anchor: deposit 12 of 20
    useGameStore.setState({ pos: [100, 0, 200] });
    expect(S().depositToStockpile('shore_camp', 'sc', 12)).toBe(12);
    expect(S().claims.home?.stockpile).toEqual([{ itemId: 'scrap', qty: 12 }]);
    expect(findCarried(S().inventory, 'sc')?.item.qty).toBe(8);
    // withdraw 5 back
    expect(S().withdrawFromStockpile('shore_camp', 'scrap', 5)).toBe(5);
    expect(S().claims.home?.stockpile).toEqual([{ itemId: 'scrap', qty: 7 }]);
    expect(countCarried(S().inventory, 'scrap')).toBe(13);
    // walk away: the pile is physical — both directions refuse
    useGameStore.setState({ pos: [0, 0, 0] });
    expect(S().depositToStockpile('shore_camp', 'sc', 1)).toBe(0);
    expect(S().withdrawFromStockpile('shore_camp', 'scrap', 1)).toBe(0);
    expect(S().claims.home?.stockpile).toEqual([{ itemId: 'scrap', qty: 7 }]);
  });
});
