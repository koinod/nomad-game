// LootPanel.tsx — container loot preview. E opens a box and shows what's
// inside; take what you want, leave the rest for later.

import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { sfx } from '../systems/audio';

export default function LootPanel() {
  const lootOpenId = useGameStore((s) => s.lootOpenId);
  const items = useGameStore((s) => (s.lootOpenId ? s.lootStash[s.lootOpenId] : undefined));
  const closeLoot = useGameStore((s) => s.closeLoot);
  const takeLootIndex = useGameStore((s) => s.takeLootIndex);
  const takeAllLoot = useGameStore((s) => s.takeAllLoot);

  if (!lootOpenId || !items) return null;

  const close = () => {
    sfx.play('ui');
    closeLoot();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="w-[360px] rounded border border-[#232b36] bg-[#0b0e12] p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Container loot"
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#d7dde5]">Container</div>
          <button
            onClick={close}
            aria-label="Close container"
            className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            Close [E]
          </button>
        </div>
        <p className="mb-3 text-xs text-[#8a94a3]">What's inside. Take what you need — the rest stays here.</p>
        <div className="flex flex-col gap-1.5">
          {items.map((it, i) => {
            const def = ITEMS[it.itemId];
            if (!def) return null;
            return (
              <div
                key={`${it.itemId}-${i}`}
                className="flex items-center justify-between gap-2 rounded border border-[#232b36] bg-[#12161c] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-[#d7dde5]">
                    {def.name}
                    {it.qty > 1 && <span className="ml-2 text-[#8a94a3]">×{it.qty}</span>}
                  </div>
                  <div className="text-[11px] text-[#8a94a3]">
                    {(def.weight * it.qty).toFixed(1)} kg
                    {def.damage ? ` · ${def.damage} dmg` : ''}
                    {def.heal ? ` · +${def.heal} HP` : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    sfx.play('pickup', { volume: 0.6 });
                    takeLootIndex(lootOpenId, i);
                  }}
                  className="shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                >
                  Take
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => {
            sfx.play('pickup', { volume: 0.8 });
            takeAllLoot(lootOpenId);
          }}
          className="mt-3 w-full rounded border border-[#e8b34b] px-3 py-2 text-sm text-[#e8b34b] transition-colors hover:bg-[#e8b34b]/10"
        >
          Take all
        </button>
      </div>
    </div>
  );
}
