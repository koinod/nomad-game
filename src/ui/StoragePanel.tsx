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
  const perks = useGameStore((s) => s.perks);
  const closeStorage = useGameStore((s) => s.closeStorage);
  const storagePut = useGameStore((s) => s.storagePut);
  const storageTake = useGameStore((s) => s.storageTake);
  const storagePutQty = useGameStore((s) => s.storagePutQty);
  const storageTakeQty = useGameStore((s) => s.storageTakeQty);
  const storageTakeAll = useGameStore((s) => s.storageTakeAll);
  const storagePutAll = useGameStore((s) => s.storagePutAll);
  const arrangeStorage = useGameStore((s) => s.arrangeStorage);
  const moveInvItem = useGameStore((s) => s.moveInvItem);
  const moveStorageItem = useGameStore((s) => s.moveStorageItem);
  const fleet = useGameStore((s) => s.fleet);
  const trailerFleet = useGameStore((s) => s.trailerFleet);
  const [selStored, setSelStored] = useState<string | null>(null);
  const [selPack, setSelPack] = useState<string | null>(null);
  // per-side quantity steppers (null = the whole selected stack)
  const [takeQty, setTakeQty] = useState<number | null>(null);
  const [putQty, setPutQty] = useState<number | null>(null);

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
  const packDims = packHolder ? gridSpecForItem(packHolder) ?? pocketsSpec(perks) : pocketsSpec(perks);
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
              <span className="flex gap-1">
                <button
                  onClick={() => { sfx.play('ui'); arrangeStorage('size'); }}
                  className="rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#8a94a3] transition-colors hover:text-[#f2f5f8]"
                >
                  Arrange
                </button>
                <button
                  onClick={() => { sfx.play('ui'); storageTakeAll(); setSelStored(null); setTakeQty(null); }}
                  className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                >
                  Take all
                </button>
                <button
                  disabled={!storedSel}
                  onClick={() => {
                    sfx.play('ui');
                    const q = takeQty ?? storedSel!.qty;
                    if (q >= storedSel!.qty) storageTake(storedSelIdx);
                    else storageTakeQty(storedSelIdx, q);
                    setSelStored(null); setTakeQty(null);
                  }}
                  className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Take{storedSel ? ` ${ITEMS[storedSel.itemId]?.name}` : ''}
                </button>
              </span>
            </div>
            {storedSel && storedSel.qty > 1 && (
              <div className="mb-1 flex items-center gap-1 text-[11px] text-[#8a94a3]">
                <span>Take</span>
                <button onClick={() => setTakeQty(Math.max(1, (takeQty ?? storedSel.qty) - 1))} className="rounded border border-[#232b36] px-1.5 py-0.5 text-[#d7dde5]">−</button>
                <span className="min-w-[3ch] text-center font-mono text-[#e8b34b]">{takeQty ?? storedSel.qty}</span>
                <button onClick={() => setTakeQty(Math.min(storedSel.qty, (takeQty ?? storedSel.qty) + 1))} className="rounded border border-[#232b36] px-1.5 py-0.5 text-[#d7dde5]">+</button>
                <span>of {storedSel.qty}</span>
              </div>
            )}
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
              <span className="flex gap-1">
                <button
                  onClick={() => { sfx.play('ui'); storagePutAll(); setSelPack(null); setPutQty(null); }}
                  className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                >
                  Put all
                </button>
                <button
                  disabled={!packSel}
                  onClick={() => {
                    sfx.play('ui');
                    const q = putQty ?? packSel!.qty;
                    if (q >= packSel!.qty) storagePut(packSel!.uid);
                    else storagePutQty(packSel!.uid, q);
                    setSelPack(null); setPutQty(null);
                  }}
                  className="rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Put{packSel ? ` ${ITEMS[packSel.itemId]?.name}` : ''}
                </button>
              </span>
            </div>
            {packSel && packSel.qty > 1 && (
              <div className="mb-1 flex items-center gap-1 text-[11px] text-[#8a94a3]">
                <span>Put</span>
                <button onClick={() => setPutQty(Math.max(1, (putQty ?? packSel.qty) - 1))} className="rounded border border-[#232b36] px-1.5 py-0.5 text-[#d7dde5]">−</button>
                <span className="min-w-[3ch] text-center font-mono text-[#e8b34b]">{putQty ?? packSel.qty}</span>
                <button onClick={() => setPutQty(Math.min(packSel.qty, (putQty ?? packSel.qty) + 1))} className="rounded border border-[#232b36] px-1.5 py-0.5 text-[#d7dde5]">+</button>
                <span>of {packSel.qty}</span>
              </div>
            )}
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
