// FinishRow + FinishesSection — weapon finish kits at the bench (Wave 4).
//
// Restored 2026-10-21: the hand-rolled Phone CraftTab carried the only
// finish UI; the stage-2a swap to Lane 7's CraftPanel deleted it, leaving
// finishes with no reachable UI. The row below is the original component,
// unchanged; FinishesSection re-homes it in the Craft tab over every owned
// weapon (the old tab showed it under the equipped ranged + melee weapons).
// Store side is gameStore.applyFinish — it bench-gates, consumes the kit,
// and replaces the old coat.

import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { FINISHES } from '../data/mods';
import { sfx } from '../systems/audio';

/** Finish kits at the bench — shows the weapon's current coat and
 *  a button per kit in the pack. The kit is consumed on application. */
export function FinishRow({ weaponUid, current }: { weaponUid: string; current?: string }) {
  const inventory = useGameStore((s) => s.inventory);
  const nearStation = useGameStore((s) => s.nearStation);
  const applyFinish = useGameStore((s) => s.applyFinish);
  const atBench = nearStation === 'workbench';
  const kits = inventory.filter((i) => i.itemId in FINISHES);
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-[#232b36] pt-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-24 text-[11px] uppercase tracking-wide text-[#8a94a3]">finish</span>
        <span className="flex-1 text-[#d7dde5]">
          {current ? (FINISHES[current]?.name ?? current) : 'Factory / field-worn'}
        </span>
      </div>
      {atBench && kits.length === 0 && (
        <span className="text-[11px] text-[#8a94a3]">No finish kits carried — they turn up in town and on the carrier.</span>
      )}
      {atBench &&
        kits.map((k) => (
          <button
            key={k.uid}
            disabled={current === k.itemId}
            onClick={() => { sfx.play('ui'); applyFinish(weaponUid, k.uid); }}
            className="rounded border border-[#232b36] px-2 py-1 text-left text-xs text-[#e8b34b] hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply {FINISHES[k.itemId]?.name} (uses the kit)
          </button>
        ))}
    </div>
  );
}

/** The Craft tab's Finishes section: every owned weapon with its coat. */
export function FinishesSection() {
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const weapons = inventory.filter((i) => {
    const cat = ITEMS[i.itemId]?.category;
    return cat === 'weapon-ranged' || cat === 'weapon-melee';
  });
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Finishes — applied at a Weapons Bench</h3>
      {weapons.length === 0 ? (
        <p className="text-sm text-[#8a94a3]">No weapons carried.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {weapons.map((w) => {
            const def = ITEMS[w.itemId];
            const slot = w.uid === equipped.ranged ? 'equipped' : w.uid === equipped.melee ? 'equipped · melee' : null;
            return (
              <div key={w.uid} className="flex flex-col gap-1.5">
                <div className="text-sm text-[#d7dde5]">
                  {def?.name ?? w.itemId}
                  {slot && <span className="ml-2 text-[11px] text-[#8a94a3]">({slot})</span>}
                </div>
                <FinishRow weaponUid={w.uid} current={w.finish} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default FinishesSection;
