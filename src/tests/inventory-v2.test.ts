// inventory-v2.test.ts — the Unturned × Tarkov hybrid model
// (Ian 2026-10-21): spawn-with-phone, the phone-location rule,
// weapon slots, worn containers, drill-in nesting, nearby storage,
// and transfer conservation. Store-level + pure-function pins.

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped, heldWeaponUid, migrateEquipped } from '../store/equipment';
import {
  findCarried, hasPhoneCarried, itemMultiset, listInDest, nearbyFromSources,
  normalizeCarried, POCKETS, transferCarried, walkCarried,
} from '../store/containers';
import { setGame } from '../game/instance';
import type { Game } from '../game/Game';
import type { InvItem } from '../store/types';

const S = () => useGameStore.getState();

function reset(partial: Partial<ReturnType<typeof useGameStore.getState>>) {
  useGameStore.setState({
    inventory: [], equipped: emptyEquipped(), hotbar: [null, null, null, null],
    phoneOpen: false, phoneUnlocked: false, battery: 100, hp: 100, maxHp: 100,
    storageOpen: null, storageItems: [], toasts: [], nearby: [],
    ...partial,
  });
}

describe('spawn grant — you start with the phone in your pockets', () => {
  it('startNewGame puts the sat phone item in pockets and unlocks the deck', () => {
    S().startNewGame('survivor');
    const st = S();
    const phone = st.inventory.find((i) => i.itemId === 'phone');
    expect(phone).toBeDefined();
    expect(phone!.loc).toBe('pockets');
    expect(listInDest(st.inventory, POCKETS).map((i) => i.itemId)).toContain('phone');
    expect(st.phoneUnlocked).toBe(true);
    expect(hasPhoneCarried(st.inventory)).toBe(true);
  });

  it('openPhone works from spawn', () => {
    S().startNewGame('survivor');
    S().openPhone('pack');
    expect(S().phoneOpen).toBe(true);
  });
});

describe('phone-location rule — the deck follows the item', () => {
  beforeEach(() => setGame(null));

  it('opens while the phone is nested inside a worn backpack', () => {
    reset({
      inventory: [
        { uid: 'pk', itemId: 'pack_t1', qty: 1, contents: [{ uid: 'ph', itemId: 'phone', qty: 1 }] },
      ],
      equipped: { ...emptyEquipped(), backpack: 'pk' },
      phoneUnlocked: true,
    });
    S().openPhone();
    expect(S().phoneOpen).toBe(true);
  });

  it('refuses when the phone is not carried at all', () => {
    reset({ inventory: [], phoneUnlocked: true });
    S().openPhone();
    expect(S().phoneOpen).toBe(false);
  });

  it('dropping the phone closes an open deck', () => {
    reset({
      inventory: [{ uid: 'ph', itemId: 'phone', qty: 1, loc: 'pockets' }],
      phoneUnlocked: true,
    });
    S().openPhone();
    expect(S().phoneOpen).toBe(true);
    S().dropUid('ph');
    expect(S().phoneOpen).toBe(false);
    expect(hasPhoneCarried(S().inventory)).toBe(false);
  });

  it('storing the phone in a vehicle closes the deck and blocks reopening', () => {
    reset({
      inventory: [{ uid: 'ph', itemId: 'phone', qty: 1, loc: 'pockets' }],
      phoneUnlocked: true,
      storageOpen: { kind: 'vehicle', uid: 'gt500', label: 'GT500 — storage' },
    });
    setGame(fakeEngine() as unknown as Game);
    S().openPhone();
    expect(S().phoneOpen).toBe(true);
    S().storagePut('ph');
    expect(hasPhoneCarried(S().inventory)).toBe(false);
    expect(S().phoneOpen).toBe(false);
    S().openPhone();
    expect(S().phoneOpen).toBe(false);
    setGame(null);
  });
});

describe('load migration — legacy saves unify', () => {
  const legacyInv: InvItem[] = [
    { uid: 'rifle', itemId: 'hunting_rifle', qty: 1 },
    { uid: 'bat', itemId: 'baseball_bat', qty: 1 },
    { uid: 'pk', itemId: 'pack_t1', qty: 1 },
    { uid: 'vest', itemId: 'armored_vest', qty: 1 },
    { uid: 'helm', itemId: 'riot_helmet', qty: 1 },
    { uid: 'legs', itemId: 'shin_guards', qty: 1 },
    { uid: 'bd', itemId: 'bandage', qty: 3 },
  ];

  it('migrateEquipped maps the old slots onto weapon slots + garments', () => {
    const eq = migrateEquipped(
      { melee: 'bat', ranged: 'rifle', pack: 'pk', armorTorso: 'vest', armorHead: 'helm', armorLegs: 'legs' },
      legacyInv,
    );
    expect(eq.primary).toBe('rifle'); // long gun -> primary
    expect(eq.tertiary).toBe('bat'); // melee -> tertiary
    expect(eq.backpack).toBe('pk');
    expect(eq.vest).toBe('vest'); // armor IS the vest garment now
    expect(eq.head).toBe('helm');
    expect(eq.pants).toBe('legs');
    expect(eq.activeWeapon).toBe('primary');
    // engine projections re-derived
    expect(eq.ranged).toBe('rifle');
    expect(eq.melee).toBe('bat');
  });

  it('a legacy sidearm lands in secondary and becomes the held weapon', () => {
    const inv: InvItem[] = [{ uid: 'p', itemId: 'pistol', qty: 1 }];
    const eq = migrateEquipped({ ranged: 'p' }, inv);
    expect(eq.secondary).toBe('p');
    expect(eq.activeWeapon).toBe('secondary');
    expect(heldWeaponUid(eq)).toBe('p');
  });

  it('normalizeCarried lands the legacy flat pack in the backpack and grants the phone', () => {
    const eq0 = migrateEquipped({ pack: 'pk' }, legacyInv);
    let n = 0;
    const norm = normalizeCarried(legacyInv, eq0, () => `new${n++}`);
    expect(norm.packGranted).toBe(false); // a pack already existed
    expect(norm.phoneGranted).toBe(true);
    const pack = findCarried(norm.inventory, 'pk')!.item;
    const inside = (pack.contents ?? []).map((i) => i.uid);
    // everything loose landed in the backpack (rifle/bat/vest/etc.)
    for (const uid of ['rifle', 'bat', 'vest', 'helm', 'legs', 'bd']) {
      expect(inside, uid).toContain(uid);
    }
    // the phone is in pockets at top level
    const phone = norm.inventory.find((i) => i.itemId === 'phone');
    expect(phone?.loc).toBe('pockets');
    // idempotent: a v2-shaped inventory passes through untouched
    const again = normalizeCarried(norm.inventory, norm.equipped, () => 'zz');
    expect(again.phoneGranted).toBe(false);
    expect(itemMultiset(again.inventory)).toEqual(itemMultiset(norm.inventory));
  });

  it('normalizeCarried grants a worn day pack when a legacy save has none', () => {
    const inv: InvItem[] = [{ uid: 'bd', itemId: 'bandage', qty: 2 }];
    const norm = normalizeCarried(inv, emptyEquipped(), () => 'granted1');
    expect(norm.packGranted).toBe(true);
    expect(norm.equipped.backpack).toBe('granted1');
    const pack = findCarried(norm.inventory, 'granted1')!.item;
    expect(pack.itemId).toBe('pack_t1');
    expect((pack.contents ?? []).map((i) => i.uid)).toContain('bd');
  });
});

describe('weapon slots — slotted guns leave the grid', () => {
  beforeEach(() => {
    reset({
      inventory: [
        {
          uid: 'pk', itemId: 'pack_t2', qty: 1,
          contents: [
            { uid: 'rifle', itemId: 'hunting_rifle', qty: 1 },
            { uid: 'pistol', itemId: 'pistol', qty: 1 },
            { uid: 'bat', itemId: 'baseball_bat', qty: 1 },
          ],
        },
      ],
      equipped: { ...emptyEquipped(), backpack: 'pk' },
    });
  });

  it('equipUid routes long gun / sidearm / melee to primary / secondary / tertiary', () => {
    S().equipUid('rifle');
    expect(S().equipped.primary).toBe('rifle');
    expect(S().equipped.activeWeapon).toBe('primary');
    expect(S().equipped.ranged).toBe('rifle'); // projection
    S().equipUid('pistol');
    expect(S().equipped.secondary).toBe('pistol');
    expect(S().equipped.activeWeapon).toBe('secondary');
    S().equipUid('bat');
    expect(S().equipped.tertiary).toBe('bat');
    expect(S().equipped.melee).toBe('bat'); // projection
    // slotted weapons live at top level, in NO grid
    for (const uid of ['rifle', 'pistol', 'bat']) {
      const f = findCarried(S().inventory, uid)!;
      expect(f.containerUid).toBeNull();
      expect(f.item.loc).toBeUndefined();
    }
    expect(listInDest(S().inventory, { type: 'container', uid: 'pk' })).toHaveLength(0);
  });

  it('keys 1/2/3 select the slot — the held weapon follows', () => {
    S().equipUid('rifle');
    S().equipUid('pistol');
    S().equipUid('bat');
    S().useHotbar(0);
    expect(S().equipped.activeWeapon).toBe('primary');
    expect(heldWeaponUid(S().equipped)).toBe('rifle');
    S().useHotbar(1);
    expect(heldWeaponUid(S().equipped)).toBe('pistol');
    S().useHotbar(2);
    expect(heldWeaponUid(S().equipped)).toBe('bat');
  });

  it('key 4 still uses the quick item', () => {
    reset({
      inventory: [{ uid: 'fd', itemId: 'canned_food', qty: 1, loc: 'pockets' }],
      hotbar: [null, null, null, 'fd'],
      hp: 40,
    });
    S().useHotbar(3);
    expect(S().countItem('canned_food')).toBe(0);
    expect(S().hp).toBeGreaterThan(40);
  });

  it('slot ↔ grid SWAP is conservative: the occupant takes the grid slot', () => {
    const before = itemMultiset(S().inventory);
    S().equipUid('rifle'); // primary = hunting rifle
    // a second long gun arrives in the pack
    S().addItem('carbine', 1, true);
    const carbine = walkCarried(S().inventory).find((i) => i.itemId === 'carbine')!;
    S().equipUid(carbine.uid); // swap
    expect(S().equipped.primary).toBe(carbine.uid);
    // the rifle is back inside the backpack, nothing lost or duplicated
    const backIn = findCarried(S().inventory, 'rifle')!;
    expect(backIn.containerUid).toBe('pk');
    const mid = itemMultiset(S().inventory);
    expect(mid.get('hunting_rifle')).toBe(1);
    expect(mid.get('carbine')).toBe(1);
    expect(before.get('hunting_rifle')).toBe(1);
  });

  it('swap is refused (nothing moves) when the occupant fits nowhere', () => {
    // The crossbow (4x2) lives in a plate carrier (4x2 grid). The
    // slotted hunting rifle (5x2) cannot return to that carrier;
    // pockets are full (a pistol), the loose grid is tiled full, and
    // no backpack is worn. Nothing can move.
    const fillers: InvItem[] = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        fillers.push({ uid: `f${r}${c}`, itemId: 'pistol', qty: 1, gx: c * 2, gy: r * 2 });
      }
    }
    for (let c = 0; c < 8; c++) {
      fillers.push({ uid: `fb${c}`, itemId: 'bandage', qty: 1, gx: c, gy: 4 });
    }
    reset({
      inventory: [
        { uid: 'pc', itemId: 'plate_carrier', qty: 1, contents: [{ uid: 'xb', itemId: 'crossbow', qty: 1 }] },
        { uid: 'rf', itemId: 'hunting_rifle', qty: 1 },
        { uid: 'pk2', itemId: 'pistol', qty: 1, loc: 'pockets' },
        ...fillers,
      ],
    });
    useGameStore.setState({
      equipped: { ...emptyEquipped(), primary: 'rf', ranged: 'rf', activeWeapon: 'primary' },
    });
    const before = itemMultiset(S().inventory);
    S().equipUid('xb');
    expect(S().equipped.primary).toBe('rf');
    expect(findCarried(S().inventory, 'xb')!.containerUid).toBe('pc');
    expect(itemMultiset(S().inventory)).toEqual(before);
  });

  it('swap lands the occupant in the loose grid when only loose has room', () => {
    reset({
      inventory: [
        { uid: 'pc', itemId: 'plate_carrier', qty: 1, contents: [{ uid: 'xb', itemId: 'crossbow', qty: 1 }] },
        { uid: 'rf', itemId: 'hunting_rifle', qty: 1 },
      ],
    });
    useGameStore.setState({
      equipped: { ...emptyEquipped(), primary: 'rf', ranged: 'rf', activeWeapon: 'primary' },
    });
    S().equipUid('xb'); // crossbow takes the slot; the 5x2 rifle can't re-enter the 4x2 carrier
    expect(S().equipped.primary).toBe('xb');
    const rf = findCarried(S().inventory, 'rf')!;
    expect(rf.containerUid).toBeNull();
    expect(rf.item.loc).toBeUndefined(); // loose — in arms
    expect(S().countItem('hunting_rifle')).toBe(1);
    expect(S().countItem('crossbow')).toBe(1);
  });
});

describe('loose carry — the last-resort grid', () => {
  it('grants land loose when nothing worn can take them (no pack, pockets full)', () => {
    reset({
      inventory: [{ uid: 'pk2', itemId: 'pistol', qty: 1, loc: 'pockets' }], // pockets full (2x2)
    });
    expect(S().addItem('hunting_rifle', 1, true)).toBe(true);
    const rifle = walkCarried(S().inventory).find((i) => i.itemId === 'hunting_rifle')!;
    expect(rifle.loc).toBeUndefined();
    expect(findCarried(S().inventory, rifle.uid)!.containerUid).toBeNull();
  });

  it('worn storage wins over loose: with a pack worn, grants land in the pack', () => {
    reset({
      inventory: [{ uid: 'pk', itemId: 'pack_t1', qty: 1, contents: [] }],
      equipped: { ...emptyEquipped(), backpack: 'pk' },
    });
    expect(S().addItem('hunting_rifle', 1, true)).toBe(true);
    const rifle = walkCarried(S().inventory).find((i) => i.itemId === 'hunting_rifle')!;
    expect(findCarried(S().inventory, rifle.uid)!.containerUid).toBe('pk');
  });
});

describe('worn containers — the grids travel with the garment', () => {
  beforeEach(() => {
    reset({
      inventory: [
        { uid: 'pk', itemId: 'pack_t1', qty: 1, contents: [{ uid: 'bd', itemId: 'bandage', qty: 2 }] },
        { uid: 'jk', itemId: 'field_jacket', qty: 1 },
      ],
    });
  });

  it('contents travel: unequipping the pack keeps its contents inside it', () => {
    S().equipUid('pk');
    expect(S().equipped.backpack).toBe('pk');
    S().transferItem('bd', POCKETS); // bandages ride in the pack grid meanwhile
    S().transferItem('bd', { type: 'container', uid: 'pk' });
    S().unequipSlot('backpack');
    expect(S().equipped.backpack).toBeNull();
    const pack = findCarried(S().inventory, 'pk')!.item;
    expect((pack.contents ?? []).map((i) => i.uid)).toContain('bd');
  });

  it('garment grids enforce their own kg cap', () => {
    S().equipUid('jk'); // jacket: 4x3 grid, 6kg of contents
    // the worn jacket itself never transfers (unequip first)
    const worn = transferCarried(S().inventory, S().equipped, 'jk', POCKETS);
    expect(worn.ok).toBe(false);
    if (!worn.ok) expect(worn.reason).toBe('slotted');
    // two armor plates = 8kg of contents > the jacket's 6kg cap
    useGameStore.setState({
      inventory: [
        ...S().inventory,
        { uid: 'ap1', itemId: 'armor_plate', qty: 1, loc: 'pockets' },
        { uid: 'ap2', itemId: 'armor_plate', qty: 1, loc: 'pockets' },
      ],
    });
    S().transferItem('ap1', { type: 'container', uid: 'jk' });
    expect(findCarried(S().inventory, 'ap1')!.containerUid).toBe('jk');
    S().transferItem('ap2', { type: 'container', uid: 'jk' });
    expect(findCarried(S().inventory, 'ap2')!.containerUid).toBeNull(); // refused — stayed in pockets
  });

  it('a slotted/worn item cannot be transferred directly', () => {
    S().equipUid('pk');
    const res = transferCarried(S().inventory, S().equipped, 'pk', POCKETS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('slotted');
  });
});

describe('drill-in nesting rules', () => {
  const forest = (): InvItem[] => [
    {
      uid: 'pk', itemId: 'pack_t2', qty: 1,
      contents: [
        { uid: 'case', itemId: 'hard_case', qty: 1, contents: [
          { uid: 'can', itemId: 'ammo_can', qty: 1, contents: [] },
        ] },
        { uid: 'bd', itemId: 'bandage', qty: 1 },
      ],
    },
  ];

  it('a container cannot go inside itself', () => {
    const res = transferCarried(forest(), emptyEquipped(), 'case', { type: 'container', uid: 'case' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('cycle');
  });

  it('a container cannot go inside its own descendant', () => {
    const res = transferCarried(forest(), emptyEquipped(), 'pk', { type: 'container', uid: 'can' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('cycle');
  });

  it('depth cap: three container levels hold, the fourth is refused', () => {
    // pk (level 0 holder) -> case (contents at 1) -> can (contents at 2)
    // -> a case inside the can puts ITS contents at 3: allowed.
    const inv: InvItem[] = [
      ...forest(),
      { uid: 'case2', itemId: 'hard_case', qty: 1, loc: 'pockets' },
    ];
    const deep = transferCarried(inv, emptyEquipped(), 'case2', { type: 'container', uid: 'can' });
    expect(deep.ok).toBe(true);
    // now a third case inside case2 would put contents at depth 4
    const inv2: InvItem[] = [
      ...deep.inventory,
      { uid: 'can2', itemId: 'ammo_can', qty: 1, loc: 'pockets' },
    ];
    const tooDeep = transferCarried(inv2, emptyEquipped(), 'can2', { type: 'container', uid: 'case2' });
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.reason).toBe('too-deep');
  });

  it('removeItem refuses a non-empty container; dropUid drops the whole bag', () => {
    reset({ inventory: forest(), equipped: { ...emptyEquipped(), backpack: 'pk' } });
    expect(S().removeItem('case', 1)).toBe(false);
    expect(findCarried(S().inventory, 'can')).not.toBeNull(); // contents intact
    S().dropUid('case');
    expect(findCarried(S().inventory, 'case')).toBeNull();
    expect(findCarried(S().inventory, 'can')).toBeNull(); // subtree went with it
    expect(S().countItem('bandage')).toBe(1); // the pack's own bandage survives
  });
});

describe('transfer conservation — property-style', () => {
  it('200 seeded random transfers never create or destroy items', () => {
    let inv: InvItem[] = [
      {
        uid: 'pk', itemId: 'pack_t2', qty: 1,
        contents: [
          { uid: 'case', itemId: 'hard_case', qty: 1, contents: [{ uid: 'am', itemId: 'ammo_9mm', qty: 30 }] },
          { uid: 'bd', itemId: 'bandage', qty: 4 },
          { uid: 'sc', itemId: 'scrap', qty: 7 },
        ],
      },
      { uid: 'jk', itemId: 'field_jacket', qty: 1, contents: [{ uid: 'cb', itemId: 'canned_food', qty: 2 }] },
      { uid: 'ph', itemId: 'phone', qty: 1, loc: 'pockets' },
      { uid: 'wr', itemId: 'wire', qty: 3, loc: 'pockets' },
    ];
    const eq = { ...emptyEquipped(), backpack: 'pk', jacket: 'jk' };
    const before = itemMultiset(inv);
    // mulberry32 — deterministic across runs
    let seed = 42;
    const rnd = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const dests = [
      POCKETS,
      { type: 'container', uid: 'pk' } as const,
      { type: 'container', uid: 'case' } as const,
      { type: 'container', uid: 'jk' } as const,
    ];
    for (let n = 0; n < 200; n++) {
      const all = walkCarried(inv).filter((i) => i.uid !== 'pk' && i.uid !== 'jk');
      const pick = all[Math.floor(rnd() * all.length)];
      const dest = dests[Math.floor(rnd() * dests.length)];
      const res = transferCarried(inv, eq, pick.uid, dest);
      if (res.ok) inv = res.inventory;
      expect(itemMultiset(inv)).toEqual(before);
    }
  });
});

describe('nearby list — population by distance', () => {
  it('vehicles use the storage radius, containers the interact radius, nearest first', () => {
    const entries = nearbyFromSources(
      0, 0,
      [
        { uid: 'gt500', label: 'GT500 — storage', x: 2, z: 0, usedKg: 10, capKg: 120 }, // 2m — in
        { uid: 'prime', label: 'Prime — storage', x: 5, z: 0, usedKg: 0, capKg: 400 }, // 5m — out
      ],
      [
        { id: 'c1', label: 'Crate', x: 0, z: 2.9, looted: false, locked: false }, // 2.9m — in
        { id: 'c2', label: 'Cache', x: 0, z: 3.1, looted: true, locked: true }, // 3.1m — out
      ],
      3.6, 3,
    );
    expect(entries.map((e) => e.uid)).toEqual(['gt500', 'c1']);
    expect(entries[0].kind).toBe('vehicle');
    expect(entries[0].capKg).toBe(120);
    expect(entries[1].kind).toBe('container');
    expect(entries[1].dist).toBe(2.9);
  });
});

// ---- fake engine for store<->vehicle storage conservation ----
function fakeEngine() {
  const lists = new Map<string, InvItem[]>();
  return {
    lists,
    getStorageItems: (_kind: string, uid: string) => (lists.get(uid) ?? []).map((i) => ({ ...i })),
    storagePutItem: (_kind: string, uid: string, item: InvItem) => {
      const list = lists.get(uid) ?? [];
      const ex = list.find((i) => i.itemId === item.itemId);
      if (ex) ex.qty += item.qty;
      else list.push({ ...item });
      lists.set(uid, list);
      return null;
    },
    storageTakeItem: (_kind: string, uid: string, index: number) => {
      const list = lists.get(uid) ?? [];
      const [taken] = list.splice(index, 1);
      return taken ?? null;
    },
    getNearbyStorage: () => [],
  };
}

describe('vehicle storage transfers — conservation across the seam', () => {
  beforeEach(() => {
    reset({
      inventory: [
        { uid: 'pk', itemId: 'pack_t1', qty: 1, contents: [{ uid: 'bd', itemId: 'bandage', qty: 5 }] },
        { uid: 'case', itemId: 'hard_case', qty: 1, loc: 'pockets', contents: [{ uid: 'wr', itemId: 'wire', qty: 1 }] },
      ],
      equipped: { ...emptyEquipped(), backpack: 'pk' },
      storageOpen: { kind: 'vehicle', uid: 'gt500', label: 'GT500 — storage' },
    });
  });

  it('put then take returns every unit; totals across both worlds are constant', () => {
    const eng = fakeEngine();
    setGame(eng as unknown as Game);
    const carriedBefore = itemMultiset(S().inventory);
    S().storagePut('bd'); // 5 bandages, from inside the backpack
    expect(S().countItem('bandage')).toBe(0);
    expect(eng.lists.get('gt500')).toHaveLength(1);
    S().storageTake(0);
    expect(S().countItem('bandage')).toBe(5);
    expect(itemMultiset(S().inventory)).toEqual(carriedBefore);
    setGame(null);
  });

  it('a container WITH contents cannot be vehicle-stored (its contents would merge away)', () => {
    const eng = fakeEngine();
    setGame(eng as unknown as Game);
    S().storagePut('case');
    expect(findCarried(S().inventory, 'case')).not.toBeNull();
    expect(eng.lists.get('gt500') ?? []).toHaveLength(0);
    // empty it and the same put succeeds
    S().transferItem('wr', POCKETS);
    // wire (1x1) went to... pockets is where the case sits; move it into the pack instead
    if (findCarried(S().inventory, 'wr')!.containerUid === 'case') {
      S().transferItem('wr', { type: 'container', uid: 'pk' });
    }
    S().storagePut('case');
    expect(findCarried(S().inventory, 'case')).toBeNull();
    setGame(null);
  });
});
