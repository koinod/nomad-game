// StoragePanel.tsx — two-way transfer for vehicle / trailer / crate
// storage. Opened with [T] near a vehicle or trailer (or from the driver's
// seat). Left: what's stored (Take). Right: your pack (Put). Weight-capped
// by the carrier — the engine enforces, this just shows the state.

import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { sfx } from '../systems/audio';

export default function StoragePanel() {
  const storageOpen = useGameStore((s) => s.storageOpen);
  const items = useGameStore((s) => s.storageItems);
  const inventory = useGameStore((s) => s.inventory);
  const closeStorage = useGameStore((s) => s.closeStorage);
  const storagePut = useGameStore((s) => s.storagePut);
  const storageTake = useGameStore((s) => s.storageTake);
  const fleet = useGameStore((s) => s.fleet);
  const trailerFleet = useGameStore((s) => s.trailerFleet);

  if (!storageOpen) return null;

  const usedKg = items.reduce((w, it) => w + (ITEMS[it.itemId]?.weight ?? 0) * it.qty, 0);
  let capKg: number | null = null;
  if (storageOpen.kind === 'vehicle') capKg = fleet.find((f) => f.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen.kind === 'trailer') capKg = trailerFleet.find((t) => t.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen.kind === 'crate') capKg = 150;

  const close = () => {
    sfx.play('ui');
    closeStorage();
  };

  const row = (
    key: string,
    itemId: string,
    qty: number,
    action: string,
    onClick: () => void,
  ) => {
    const def = ITEMS[itemId];
    if (!def) return null;
    return (
      <div key={key} className="flex items-center justify-between gap-2 rounded border border-[#232b36] bg-[#12161c] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-[#d7dde5]">
            {def.name}
            {qty > 1 && <span className="ml-2 text-[#8a94a3]">×{qty}</span>}
          </div>
          <div className="text-[11px] text-[#8a94a3]">{(def.weight * qty).toFixed(1)} kg</div>
        </div>
        <button
          onClick={onClick}
          className="shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
        >
          {action}
        </button>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="w-[560px] max-w-full rounded border border-[#232b36] bg-[#0b0e12] p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Storage"
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#d7dde5]">{storageOpen.label}</div>
          <button
            onClick={close}
            aria-label="Close storage"
            className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            Close [F]
          </button>
        </div>
        <p className="mb-3 text-xs text-[#8a94a3]">
          {usedKg.toFixed(1)} kg{capKg != null ? ` of ${capKg} kg` : ''} aboard. What rides here stays with it — through saves, too.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
            <div className="text-[11px] font-semibold tracking-wide text-[#8a94a3]">STORED</div>
            {items.length === 0 && <p className="text-xs text-[#8a94a3]">Empty.</p>}
            {items.map((it, i) => row(`s-${it.itemId}-${i}`, it.itemId, it.qty, 'Take', () => storageTake(i)))}
          </div>
          <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
            <div className="text-[11px] font-semibold tracking-wide text-[#8a94a3]">YOUR PACK</div>
            {inventory.length === 0 && <p className="text-xs text-[#8a94a3]">Nothing carried.</p>}
            {inventory.map((it) => row(`p-${it.uid}`, it.itemId, it.qty, 'Put', () => storagePut(it.uid)))}
          </div>
        </div>
      </div>
    </div>
  );
}
