// StoragePanel.tsx — two-way transfer for vehicle / trailer / crate
// storage. Opened with [T] near a vehicle or trailer (or from the driver's
// seat). Wave 3: both sides are true grids (drag to arrange; positions
// persist in the carrier's own storage list). Transfers stay click-based:
// select a stack, then Take / Put. Weight-capped by the carrier — the
// engine enforces, this just shows the state.

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { containerGridDims } from '../store/gridUtils';
import { findCarried, gridSpecForItem, pocketsSpec } from '../store/containers';
import GridInventory from './GridInventory';
import { sfx } from '../systems/audio';

export default function StoragePanel() {
  const storageOpen = useGameStore((s) => s.storageOpen);
  // the inventory deck's storage mode supersedes this panel while open
  const inventoryOpen = useGameStore((s) => s.inventoryOpen);
  const items = useGameStore((s) => s.storageItems);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const closeStorage = useGameStore((s) => s.closeStorage);
  const storagePut = useGameStore((s) => s.storagePut);
  const storageTake = useGameStore((s) => s.storageTake);
  const moveInvItem = useGameStore((s) => s.moveInvItem);
  const moveStorageItem = useGameStore((s) => s.moveStorageItem);
  const fleet = useGameStore((s) => s.fleet);
  const trailerFleet = useGameStore((s) => s.trailerFleet);
  const [selStored, setSelStored] = useState<string | null>(null);
  const [selPack, setSelPack] = useState<string | null>(null);

  if (!storageOpen || inventoryOpen) return null;

  const usedKg = items.reduce((w, it) => w + (ITEMS[it.itemId]?.weight ?? 0) * it.qty, 0);
  let capKg: number | null = null;
  if (storageOpen.kind === 'vehicle') capKg = fleet.find((f) => f.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen.kind === 'trailer') capKg = trailerFleet.find((t) => t.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen.kind === 'crate') capKg = 150;

  const storeDims = containerGridDims(capKg ?? 150);
  // inventory v2: the put-source is the worn backpack's own grid (the
  // main storage) — or pockets when no backpack is worn. Everything
  // else you carry is reachable through the inventory deck.
  const packHolder = equipped.backpack ? findCarried(inventory, equipped.backpack)?.item : undefined;
  const packItems = packHolder ? (packHolder.contents ?? []) : inventory.filter((i) => i.loc === 'pockets');
  const packDims = packHolder ? gridSpecForItem(packHolder) ?? pocketsSpec() : pocketsSpec();
  const storedSel = selStored ? items.find((it) => it.uid === selStored) : undefined;
  const storedSelIdx = storedSel ? items.indexOf(storedSel) : -1;
  const packSel = selPack ? packItems.find((it) => it.uid === selPack) : undefined;

  const close = () => {
    sfx.play('ui');
    closeStorage();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="max-h-full w-[660px] max-w-full overflow-y-auto rounded border border-[#232b36] bg-[#0b0e12] p-4"
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
          Drag to arrange either side; select a stack to move it across.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-[#8a94a3]">STORED</div>
              <button
                disabled={!storedSel}
                onClick={() => { sfx.play('ui'); storageTake(storedSelIdx); setSelStored(null); }}
                className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Take{storedSel ? ` ${ITEMS[storedSel.itemId]?.name}` : ''}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-[#8a94a3]">Empty.</p>
            ) : (
              <GridInventory
                items={items}
                cols={storeDims.cols}
                rows={storeDims.rows}
                cell={30}
                selectedUid={selStored}
                onSelect={setSelStored}
                onMove={(uid, gx, gy, rot) => {
                  const idx = items.findIndex((it) => it.uid === uid);
                  if (idx >= 0) moveStorageItem(idx, gx, gy, rot);
                }}
              />
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-[#8a94a3]">{packHolder ? `YOUR PACK — ${ITEMS[packHolder.itemId]?.name ?? ''}` : 'YOUR POCKETS'}</div>
              <button
                disabled={!packSel}
                onClick={() => { sfx.play('ui'); storagePut(packSel!.uid); setSelPack(null); }}
                className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Put{packSel ? ` ${ITEMS[packSel.itemId]?.name}` : ''}
              </button>
            </div>
            {packItems.length === 0 ? (
              <p className="text-xs text-[#8a94a3]">Nothing there.</p>
            ) : (
              <GridInventory
                items={packItems}
                cols={packDims.cols}
                rows={packDims.rows}
                cell={30}
                selectedUid={selPack}
                onSelect={setSelPack}
                onMove={moveInvItem}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
