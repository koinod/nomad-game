// Store-level tests for the wave-2 durability system: condition rolls on
// found weapons, bench repair pricing, disassembly yields, field kits,
// and condition surviving the save migration path untouched.
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import { migrate, type RawSaveRecord } from '../systems/save';

function resetStore() {
  useGameStore.setState({
    inventory: [],
    equipped: emptyEquipped(),
    nearStation: null,
    toasts: [],
  });
}

function give(itemId: string, qty = 1): string {
  const s = useGameStore.getState();
  s.addItem(itemId, qty, true);
  const inv = useGameStore.getState().inventory;
  return inv[inv.length - 1].uid;
}

beforeEach(resetStore);

describe('found weapon condition', () => {
  it('world-found weapons roll 35–85; granted ones stay pristine', () => {
    const s = useGameStore.getState();
    for (let i = 0; i < 6; i++) {
      s.addItem('pistol', 1, true, { found: true });
    }
    const found = useGameStore.getState().inventory.filter((i) => i.itemId === 'pistol');
    expect(found.length).toBe(6);
    for (const w of found) {
      expect(w.condition).toBeGreaterThanOrEqual(35);
      expect(w.condition).toBeLessThanOrEqual(85);
    }
    resetStore();
    give('pistol');
    const granted = useGameStore.getState().inventory[0];
    expect(granted.condition).toBeUndefined(); // undefined = pristine 100
  });
});

describe('bench repair', () => {
  it('prices 1 gun_part per 40 missing condition and restores 100', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    give('gun_parts', 2);
    s.setCondition(uid, 25); // 75 missing -> 2 parts
    useGameStore.setState({ nearStation: 'workbench' });
    s.repairWeapon(uid);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === uid)?.condition).toBe(100);
    expect(st.countItem('gun_parts')).toBe(0);
  });
  it('refuses away from the bench and when parts are short', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    s.setCondition(uid, 10);
    s.repairWeapon(uid); // not at a bench
    expect(useGameStore.getState().inventory.find((i) => i.uid === uid)?.condition).toBe(10);
    useGameStore.setState({ nearStation: 'workbench' });
    s.repairWeapon(uid); // at the bench, but no gun_parts in the pack
    expect(useGameStore.getState().inventory.find((i) => i.uid === uid)?.condition).toBe(10);
  });
  it('melee repair burns scrap, not gun parts', () => {
    const s = useGameStore.getState();
    const uid = give('machete');
    give('scrap', 1);
    s.setCondition(uid, 70); // 30 missing -> 1 scrap
    useGameStore.setState({ nearStation: 'workbench' });
    s.repairWeapon(uid);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === uid)?.condition).toBe(100);
    expect(st.countItem('scrap')).toBe(0);
  });
});

describe('disassembly', () => {
  it('strips a pistol into gun_parts + scrap and returns its loaded rounds', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    s.setLoaded(uid, 5);
    useGameStore.setState({ nearStation: 'workbench' });
    s.disassemble(uid);
    const st = useGameStore.getState();
    expect(st.inventory.some((i) => i.uid === uid)).toBe(false);
    expect(st.countItem('gun_parts')).toBe(2);
    expect(st.countItem('scrap')).toBe(1);
    expect(st.countItem('ammo_9mm')).toBe(5);
  });
  it('does nothing away from the bench', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    s.disassemble(uid);
    expect(useGameStore.getState().inventory.some((i) => i.uid === uid)).toBe(true);
  });
});

describe('field care', () => {
  it('a cleaning kit brings the equipped gun to 60 and is consumed', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    give('cleaning_kit');
    s.equipUid(uid);
    s.setCondition(uid, 20);
    const kitUid = useGameStore.getState().inventory.find((i) => i.itemId === 'cleaning_kit')!.uid;
    s.useItemUid(kitUid);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === uid)?.condition).toBe(60);
    expect(st.countItem('cleaning_kit')).toBe(0);
  });
  it('gun oil adds 25 anywhere and will not waste on a clean gun', () => {
    const s = useGameStore.getState();
    const uid = give('pistol');
    give('gun_oil');
    s.equipUid(uid);
    s.setCondition(uid, 90);
    const oilUid = useGameStore.getState().inventory.find((i) => i.itemId === 'gun_oil')!.uid;
    s.useItemUid(oilUid);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === uid)?.condition).toBe(100);
    expect(st.countItem('gun_oil')).toBe(0);
    give('gun_oil');
    const oil2 = useGameStore.getState().inventory.find((i) => i.itemId === 'gun_oil')!.uid;
    s.useItemUid(oil2); // gun already at 100 — must not consume
    expect(useGameStore.getState().countItem('gun_oil')).toBe(1);
  });
});

describe('save persistence', () => {
  it('condition + jammed ride a v3 snapshot through migration untouched', () => {
    const rec: RawSaveRecord = {
      version: 3,
      slot: '1',
      inventory: [{ uid: 'w1', itemId: 'pistol', qty: 1, condition: 42, jammed: true, loaded: 7 }],
    };
    const snap = migrate(rec);
    const w = snap.inventory.find((i) => i.uid === 'w1');
    expect(w?.condition).toBe(42);
    expect(w?.jammed).toBe(true);
    expect(w?.loaded).toBe(7);
  });
});
