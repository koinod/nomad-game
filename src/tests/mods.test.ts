// Wave 4: mod-slot coverage across the ranged roster + the finish system.
// Data-driven guards: a weapon that claims a slot no mod fills, or a finish
// with no kit item, fails here instead of in the player's hands.
import { beforeEach, describe, expect, it } from 'vitest';
import { FINISHES, MODS, finishDef, type ModSlot } from '../data/mods';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';

const SLOTS: ModSlot[] = ['optic', 'muzzle', 'magazine', 'underbarrel'];
const ranged = Object.values(ITEMS).filter((i) => i.category === 'weapon-ranged');

describe('mod slot coverage', () => {
  it('every declared slot is a real slot with at least one mod that fills it', () => {
    for (const w of ranged) {
      for (const slot of w.modSlots ?? []) {
        expect(SLOTS, `${w.id} slot ${slot}`).toContain(slot);
        const filler = Object.values(MODS).find((m) => m.slot === slot);
        expect(filler, `${w.id} declares ${slot} but no mod fills it`).toBeDefined();
      }
    }
  });

  it('every ranged weapon takes at least one sensible mount — except the flare gun, a signal pistol by design', () => {
    for (const w of ranged) {
      if (w.id === 'flare_gun') {
        expect(w.modSlots ?? []).toHaveLength(0);
        continue;
      }
      expect((w.modSlots ?? []).length, w.id).toBeGreaterThan(0);
    }
  });

  it('every mod is a carryable item and fits a slot some weapon offers', () => {
    const offered = new Set(ranged.flatMap((w) => w.modSlots ?? []));
    for (const m of Object.values(MODS)) {
      expect(ITEMS[m.id], `mod item ${m.id}`).toBeDefined();
      expect(offered.has(m.slot), `mod ${m.id} slot ${m.slot} offered by no weapon`).toBe(true);
    }
  });

  it('the wave-4 coverage fixes landed: pistol optic, crossbow optic, revolver underbarrel', () => {
    expect(ITEMS.pistol.modSlots).toContain('optic');
    expect(ITEMS.crossbow.modSlots).toContain('optic');
    expect(ITEMS.revolver.modSlots).toContain('underbarrel');
  });
});

describe('finishes', () => {
  it('every finish has a lootable kit item of the same id, and vice versa', () => {
    for (const f of Object.values(FINISHES)) {
      const item = ITEMS[f.id];
      expect(item, `kit item ${f.id}`).toBeDefined();
      expect(item.category).toBe('mod');
      expect(finishDef(f.id)).toBe(f);
    }
    const kitIds = Object.values(ITEMS)
      .filter((i) => i.id.startsWith('finish_'))
      .map((i) => i.id);
    expect(kitIds.sort()).toEqual(Object.keys(FINISHES).sort());
  });

  it('finish material rules are sane', () => {
    for (const f of Object.values(FINISHES)) {
      expect(f.rough).toBeGreaterThan(0);
      expect(f.rough).toBeLessThanOrEqual(1);
      expect(f.metalness).toBeGreaterThanOrEqual(0);
      expect(f.metalness).toBeLessThanOrEqual(1);
    }
    // camo is the only two-tone finish
    expect(FINISHES.finish_camo.camoTones).toHaveLength(2);
    expect(FINISHES.finish_matte.camoTones).toBeUndefined();
  });

  it('finishDef tolerates junk', () => {
    expect(finishDef(undefined)).toBeUndefined();
    expect(finishDef('nope')).toBeUndefined();
  });
});

// The restored Craft-tab Finishes UI (src/ui/FinishRow.tsx) is a thin view
// over this action — pin the contract it relies on: bench gate, kit
// consumed, coat replaced.
describe('applyFinish (store)', () => {
  function give(itemId: string, qty = 1): string {
    const s = useGameStore.getState();
    s.addItem(itemId, qty, true);
    const inv = useGameStore.getState().inventory;
    return inv[inv.length - 1].uid;
  }

  beforeEach(() => {
    useGameStore.setState({
      inventory: [],
      equipped: emptyEquipped(),
      nearStation: null,
      toasts: [],
    });
  });

  it('does nothing away from a Weapons Bench', () => {
    const s = useGameStore.getState();
    const gun = give('pistol');
    const kit = give('finish_matte');
    s.applyFinish(gun, kit);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === gun)?.finish).toBeUndefined();
    expect(st.countItem('finish_matte')).toBe(1);
  });

  it('at the bench: sets the coat and consumes the kit', () => {
    const s = useGameStore.getState();
    const gun = give('pistol');
    const kit = give('finish_matte');
    useGameStore.setState({ nearStation: 'workbench' });
    s.applyFinish(gun, kit);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === gun)?.finish).toBe('finish_matte');
    expect(st.countItem('finish_matte')).toBe(0);
  });

  it('re-coating replaces the old finish; re-applying the same one keeps the kit', () => {
    const s = useGameStore.getState();
    const gun = give('machete');
    const kit1 = give('finish_rust');
    useGameStore.setState({ nearStation: 'workbench' });
    s.applyFinish(gun, kit1);
    expect(useGameStore.getState().inventory.find((i) => i.uid === gun)?.finish).toBe('finish_rust');
    const kit2 = give('finish_rust');
    s.applyFinish(gun, kit2);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === gun)?.finish).toBe('finish_rust');
    expect(st.countItem('finish_rust')).toBe(1);
  });

  it('refuses non-weapon targets', () => {
    const s = useGameStore.getState();
    const food = give('canned_food');
    const kit = give('finish_camo');
    useGameStore.setState({ nearStation: 'workbench' });
    s.applyFinish(food, kit);
    const st = useGameStore.getState();
    expect(st.inventory.find((i) => i.uid === food)?.finish).toBeUndefined();
    expect(st.countItem('finish_camo')).toBe(1);
  });
});
