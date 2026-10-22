// InventoryDeck.tsx — THE inventory surface (inventory v2).
//
// One implementation, two hosts: the phone-free InventoryOverlay and
// the phone's Pack app render this exact component — never two
// inventory UIs again. The model (store/containers.ts + equipment.ts):
//
//   HOME = what you wear. Weapon slots (1/2/3 select; the held weapon
//   is the selected slot) + worn garments (head/jacket/vest/pants/
//   backpack), each garment a container with its own grid, plus the
//   always-present POCKETS grid.
//   DRILL-IN: double-click any container item (backpack, case, can)
//   to open its contents grid, breadcrumb back out. Transfers between
//   grids go through store.transferItem (conservation-checked).
//   NEARBY: vehicle storage + world containers inside the interact
//   radii, listed by name + distance. A vehicle opens its storage
//   grid beside yours (Put/Take through the storage ops); a world
//   container opens through its normal in-world search flow.

import { useEffect, useMemo, useState } from 'react';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import type { GarmentSlotId, InvItem, WeaponSlotId } from '../store/types';
import {
  findCarried, gridSpecForItem, listInDest, LOOSE, looseRoots, POCKETS, specForDest,
  type CarriedDest,
} from '../store/containers';
import {
  equipSlotForDef, GARMENT_SLOTS, heldWeaponUid, WEAPON_SLOTS,
} from '../store/equipment';
import { carryLimitKg, totalWeightKg } from '../store/inventoryUtils';
import { containerGridDims } from '../store/gridUtils';
import GridInventory from './GridInventory';
import { getGame } from '../game/instance';
import { sfx } from '../systems/audio';
import { carryBonusKg } from '../systems/perkEffects';

const WEAPON_LABEL: Record<WeaponSlotId, string> = {
  primary: 'Primary', secondary: 'Secondary', tertiary: 'Tertiary',
};
const GARMENT_LABEL: Record<GarmentSlotId, string> = {
  head: 'Head', jacket: 'Jacket', vest: 'Vest', pants: 'Pants', backpack: 'Backpack',
};

type RootKey = 'pockets' | 'loose' | GarmentSlotId;

function sameDest(a: CarriedDest, b: CarriedDest): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'container' && b.type === 'container') return a.uid === b.uid;
  return true; // pockets / loose are singletons
}

export default function InventoryDeck({ compact = false }: { compact?: boolean }) {
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const perks = useGameStore((s) => s.perks);
  const hotbar = useGameStore((s) => s.hotbar);
  const storageOpen = useGameStore((s) => s.storageOpen);
  const storageItems = useGameStore((s) => s.storageItems);
  const nearby = useGameStore((s) => s.nearby);
  const refreshNearby = useGameStore((s) => s.refreshNearby);
  const fleet = useGameStore((s) => s.fleet);
  const closeInventory = useGameStore((s) => s.closeInventory);
  const closePhone = useGameStore((s) => s.closePhone);
  const phoneOpen = useGameStore((s) => s.phoneOpen);
  const openPhone = useGameStore((s) => s.openPhone);

  const equipUid = useGameStore((s) => s.equipUid);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const selectWeaponSlot = useGameStore((s) => s.selectWeaponSlot);
  const useItemUid = useGameStore((s) => s.useItemUid);
  const dropUid = useGameStore((s) => s.dropUid);
  const transferItem = useGameStore((s) => s.transferItem);
  const transferItemQty = useGameStore((s) => s.transferItemQty);
  const splitStack = useGameStore((s) => s.splitStack);
  const moveInvItem = useGameStore((s) => s.moveInvItem);
  const moveStorageItem = useGameStore((s) => s.moveStorageItem);
  const arrangeContainer = useGameStore((s) => s.arrangeContainer);
  const arrangeStorage = useGameStore((s) => s.arrangeStorage);
  const openStorage = useGameStore((s) => s.openStorage);
  const closeStorage = useGameStore((s) => s.closeStorage);
  const storagePut = useGameStore((s) => s.storagePut);
  const storagePutQty = useGameStore((s) => s.storagePutQty);
  const storageTakeQty = useGameStore((s) => s.storageTakeQty);
  const storageTakeAll = useGameStore((s) => s.storageTakeAll);
  const storagePutAll = useGameStore((s) => s.storagePutAll);
  const assignHotbar = useGameStore((s) => s.assignHotbar);
  const nearStation = useGameStore((s) => s.nearStation);
  const repairWeapon = useGameStore((s) => s.repairWeapon);
  const disassemble = useGameStore((s) => s.disassemble);

  const [root, setRoot] = useState<RootKey>(equipped.backpack ? 'backpack' : 'pockets');
  const [trail, setTrail] = useState<string[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [storageSel, setStorageSel] = useState<number | null>(null);
  // quantity stepper for the inspected stack: how many units the
  // Split / Send / Put actions move. null = the whole stack.
  const [moveQty, setMoveQty] = useState<number | null>(null);
  useEffect(() => { setMoveQty(null); }, [selectedUid]);

  useEffect(() => { refreshNearby(); }, [refreshNearby]);

  const cell = compact ? 30 : 34;

  // ---- resolve the grid being viewed: root → drill trail ----
  const rootDest: CarriedDest = useMemo(() => {
    if (root === 'pockets') return POCKETS;
    if (root === 'loose') return LOOSE;
    const uid = equipped[root];
    return uid ? { type: 'container', uid } : POCKETS;
  }, [root, equipped]);

  const { currentList, currentDest, crumbs } = useMemo(() => {
    let list = listInDest(inventory, rootDest, equipped);
    let dest = rootDest;
    const labels: { label: string; depth: number }[] = [{
      label: root === 'pockets' ? 'Pockets' : root === 'loose' ? 'Loose — in arms' : GARMENT_LABEL[root as GarmentSlotId],
      depth: 0,
    }];
    for (let d = 0; d < trail.length; d++) {
      const holder = list.find((i) => i.uid === trail[d]);
      if (!holder) break;
      list = [...(holder.contents ?? [])];
      dest = { type: 'container', uid: holder.uid };
      labels.push({ label: ITEMS[holder.itemId]?.name ?? 'Container', depth: d + 1 });
    }
    return { currentList: list, currentDest: dest, crumbs: labels };
  }, [inventory, rootDest, trail, root]);

  const currentSpec = specForDest(inventory, currentDest, perks) ?? { cols: 4, rows: 2, kg: 0 };
  const selected = selectedUid ? currentList.find((i) => i.uid === selectedUid) ?? null : null;
  const selectedDef = selected ? ITEMS[selected.itemId] : undefined;

  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty, carryBonusKg(perks));

  const openContainer = (uid: string) => {
    setTrail((t) => [...t, uid]);
    setSelectedUid(null);
    sfx.play('ui', { volume: 0.4 });
  };

  const jumpToCrumb = (depth: number) => {
    setTrail((t) => t.slice(0, depth));
    setSelectedUid(null);
  };

  const pickRoot = (r: RootKey) => {
    setRoot(r);
    setTrail([]);
    setSelectedUid(null);
  };

  // send-to targets for the selected item: pockets, worn garment
  // grids, and every container on the drill path (never the current
  // grid itself, never the item's own subtree — the store refuses
  // cycles/depth/fit with toasts regardless)
  const sendTargets: { label: string; dest: CarriedDest }[] = useMemo(() => {
    const out: { label: string; dest: CarriedDest }[] = [];
    const push = (label: string, dest: CarriedDest) => {
      if (sameDest(dest, currentDest)) return;
      if (out.some((o) => sameDest(o.dest, dest))) return;
      out.push({ label, dest });
    };
    push('Pockets', POCKETS);
    push('Loose — in arms', LOOSE);
    for (const slot of GARMENT_SLOTS) {
      const uid = equipped[slot];
      if (!uid) continue;
      const it = findCarried(inventory, uid)?.item;
      if (it && gridSpecForItem(it)) push(GARMENT_LABEL[slot], { type: 'container', uid });
    }
    for (const uid of trail) {
      const it = findCarried(inventory, uid)?.item;
      if (it) push(ITEMS[it.itemId]?.name ?? 'Container', { type: 'container', uid });
    }
    return out;
  }, [equipped, inventory, trail, currentDest]);

  const storageCapKg = storageOpen?.kind === 'vehicle'
    ? fleet.find((f) => f.instanceId === storageOpen.uid || f.defId === storageOpen.uid)?.storageCapKg ?? 150
    : 150;
  const storageDims = containerGridDims(storageCapKg);

  const itemByUid = (uid: string | null): InvItem | undefined =>
    uid ? findCarried(inventory, uid)?.item : undefined;

  return (
    <div className={`${compact ? 'flex flex-col gap-3' : 'flex gap-3'} text-[#d7dde5]`}>
      {/* ── WEAR: weapon slots + worn garments. A column beside the
          grid on the overlay; a wrapping strip above it in the phone. ── */}
      <div className={compact ? 'grid grid-cols-4 gap-1.5' : 'w-[150px] shrink-0 space-y-2'}>
        <div className={`text-[10px] font-semibold uppercase tracking-wider text-[#8a94a3] ${compact ? 'col-span-full' : ''}`}>Weapons</div>
        {WEAPON_SLOTS.map((slot, i) => {
          const it = itemByUid(equipped[slot]);
          const held = equipped.activeWeapon === slot;
          return (
            <div
              key={slot}
              onClick={() => selectWeaponSlot(slot)}
              className={`cursor-pointer rounded border px-2 py-1.5 ${
                held ? 'border-[#e8b34b] bg-[#1a2230]' : 'border-[#232b36] bg-[#12161d]'
              }`}
              title={`Key ${i + 1} — select ${WEAPON_LABEL[slot]}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wide text-[#8a94a3]">
                  {i + 1} · {WEAPON_LABEL[slot]}
                </span>
                {it && (
                  <button
                    className="text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                    title="Unequip"
                    onClick={(e) => { e.stopPropagation(); unequipSlot(slot); }}
                  >✕</button>
                )}
              </div>
              <div className={`truncate text-[11px] font-medium ${held ? 'text-[#e8b34b]' : ''}`}>
                {it ? ITEMS[it.itemId]?.name : '— empty —'}
              </div>
              {held && <div className="text-[9px] text-[#e8b34b]">IN HAND</div>}
            </div>
          );
        })}
        <div className={`pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a94a3] ${compact ? 'col-span-full' : ''}`}>Worn</div>
        {GARMENT_SLOTS.map((slot) => {
          const it = itemByUid(equipped[slot]);
          const isRoot = root === slot;
          return (
            <div
              key={slot}
              onClick={() => it && gridSpecForItem(it) && pickRoot(slot)}
              className={`rounded border px-2 py-1.5 ${
                isRoot ? 'border-[#7fb0d9] bg-[#1a2230]' : 'border-[#232b36] bg-[#12161d]'
              } ${it && gridSpecForItem(it) ? 'cursor-pointer' : ''}`}
              title={it && gridSpecForItem(it) ? `Open the ${GARMENT_LABEL[slot]} grid` : GARMENT_LABEL[slot]}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wide text-[#8a94a3]">{GARMENT_LABEL[slot]}</span>
                {it && (
                  <button
                    className="text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                    title="Take off"
                    onClick={(e) => { e.stopPropagation(); unequipSlot(slot); if (isRoot) pickRoot('pockets'); }}
                  >✕</button>
                )}
              </div>
              <div className="truncate text-[11px] font-medium">
                {it ? ITEMS[it.itemId]?.name : '— none —'}
              </div>
              {it && gridSpecForItem(it) && (
                <div className="text-[9px] text-[#8a94a3]">{it.contents?.length ?? 0} inside</div>
              )}
            </div>
          );
        })}
        <div className={`rounded border border-[#232b36] bg-[#12161d] px-2 py-1.5 ${compact ? 'col-span-2' : ''}`}>
          <div className="text-[9px] uppercase tracking-wide text-[#8a94a3]">Carried</div>
          <div className={`text-[11px] font-semibold ${weight > limit ? 'text-[#d9534f]' : ''}`}>
            {weight.toFixed(1)} / {limit.toFixed(0)} kg
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-[#0b0e12]">
            <div
              className={`h-full ${weight > limit ? 'bg-[#d9534f]' : 'bg-[#5aa469]'}`}
              style={{ width: `${Math.min(100, (weight / Math.max(limit, 1)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── GRID column ── */}
      <div className="min-w-0">
        {/* location chips */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <button
            onClick={() => pickRoot('pockets')}
            className={`rounded border px-2 py-0.5 text-[10px] ${
              root === 'pockets' && trail.length === 0 ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'
            }`}
          >Pockets</button>
          {looseRoots(inventory, equipped).length > 0 && (
            <button
              onClick={() => pickRoot('loose')}
              className={`rounded border px-2 py-0.5 text-[10px] ${
                root === 'loose' && trail.length === 0 ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'
              }`}
            >Loose — in arms</button>
          )}
          {GARMENT_SLOTS.map((slot) => {
            const it = itemByUid(equipped[slot]);
            if (!it || !gridSpecForItem(it)) return null;
            return (
              <button
                key={slot}
                onClick={() => pickRoot(slot)}
                className={`rounded border px-2 py-0.5 text-[10px] ${
                  root === slot && trail.length === 0 ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'
                }`}
              >{GARMENT_LABEL[slot]}</button>
            );
          })}
          <span className="ml-auto flex gap-1">
            <button
              onClick={() => arrangeContainer(currentDest, 'size')}
              className="rounded border border-[#232b36] px-2 py-0.5 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
            >Arrange</button>
            <button
              onClick={() => arrangeContainer(currentDest, 'category')}
              className="rounded border border-[#232b36] px-2 py-0.5 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
            >Sort</button>
          </span>
        </div>
        {/* breadcrumb */}
        {trail.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px] text-[#8a94a3]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>›</span>}
                <button
                  onClick={() => jumpToCrumb(i)}
                  className={i === crumbs.length - 1 ? 'font-semibold text-[#e8b34b]' : 'hover:text-[#f2f5f8]'}
                >{c.label}</button>
              </span>
            ))}
            <button onClick={() => jumpToCrumb(trail.length - 1)} className="ml-1 rounded border border-[#232b36] px-1.5 py-0.5 hover:text-[#f2f5f8]">
              ← Back
            </button>
          </div>
        )}
        <GridInventory
          items={currentList}
          cols={currentSpec.cols}
          rows={currentSpec.rows}
          cell={cell}
          selectedUid={selectedUid}
          onSelect={setSelectedUid}
          onMove={moveInvItem}
          onOpenContainer={openContainer}
          equippedUids={new Set([heldWeaponUid(equipped)].filter((u): u is string => !!u))}
        />
        <div className="mt-1 text-[10px] text-[#8a94a3]">
          Drag to move · R / double-click rotates · double-click a ▣ container opens it · keys 1/2/3 draw weapons
        </div>

        {/* INSPECT */}
        {selected && selectedDef && (
          <div className="mt-2 rounded border border-[#232b36] bg-[#12161d] p-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[12px] font-semibold text-[#f2f5f8]">
                {selectedDef.name}
                {selected.qty > 1 ? ` ×${selected.qty}` : ''}
              </div>
              <div className="text-[10px] text-[#8a94a3]">{(selectedDef.weight * selected.qty).toFixed(1)} kg</div>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[#8a94a3]">{selectedDef.desc}</div>
            {selected.condition !== undefined && (
              <div className="mt-0.5 text-[10px] text-[#8a94a3]">Condition {Math.round(selected.condition)}%</div>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {equipSlotForDef(selectedDef) && (
                <button
                  onClick={() => equipUid(selected.uid)}
                  className="rounded bg-[#5aa469] px-2 py-1 text-[10px] font-semibold text-[#0b0e12]"
                >{selectedDef.category.startsWith('weapon') ? 'Equip' : 'Wear'}</button>
              )}
              {(selectedDef.category === 'food' || selectedDef.category === 'medical' || selected.itemId === 'cleaning_kit' || selected.itemId === 'gun_oil') && (
                <button
                  onClick={() => useItemUid(selected.uid)}
                  className="rounded bg-[#5aa469] px-2 py-1 text-[10px] font-semibold text-[#0b0e12]"
                >Use</button>
              )}
              {selectedDef.container && (
                <button
                  onClick={() => openContainer(selected.uid)}
                  className="rounded border border-[#7fb0d9] px-2 py-1 text-[10px] font-semibold text-[#7fb0d9]"
                >Open ▣</button>
              )}
              {selected.itemId === 'phone' && !phoneOpen && (
                <button
                  onClick={() => { closeInventory(); openPhone('pack'); }}
                  className="rounded bg-[#e8b34b] px-2 py-1 text-[10px] font-semibold text-[#0b0e12]"
                >Open phone</button>
              )}
              {hotbar[3] === selected.uid ? (
                <button
                  onClick={() => assignHotbar(3, null)}
                  className="rounded border border-[#e8b34b] px-2 py-1 text-[10px] text-[#e8b34b]"
                >Quick 4 ✓</button>
              ) : (
                <button
                  onClick={() => assignHotbar(3, selected.uid)}
                  className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                >Quick 4</button>
              )}
              <button
                onClick={() => { dropUid(selected.uid); setSelectedUid(null); }}
                className="rounded border border-[#6b3a3a] px-2 py-1 text-[10px] text-[#d98a8a]"
              >Drop</button>
              {nearStation === 'workbench' && (selectedDef.category === 'weapon-melee' || selectedDef.category === 'weapon-ranged') && (selected.condition ?? 100) < 99.5 && (
                <button
                  onClick={() => repairWeapon(selected.uid)}
                  className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                >Repair (bench)</button>
              )}
              {nearStation === 'workbench' && selectedDef.disassembly && (
                <button
                  onClick={() => { disassemble(selected.uid); setSelectedUid(null); }}
                  className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                >Strip (bench)</button>
              )}
            </div>
            {selected.qty > 1 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-[#8a94a3]">Move</span>
                <button
                  onClick={() => setMoveQty(Math.max(1, (moveQty ?? selected.qty) - 1))}
                  className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9]"
                >−</button>
                <span className="min-w-[3ch] text-center font-mono text-[11px] text-[#e8b34b]">
                  {moveQty ?? selected.qty}
                </span>
                <button
                  onClick={() => setMoveQty(Math.min(selected.qty, (moveQty ?? selected.qty) + 1))}
                  className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9]"
                >+</button>
                <span className="text-[9px] text-[#8a94a3]">of {selected.qty}</span>
                <button
                  disabled={(moveQty ?? selected.qty) >= selected.qty}
                  onClick={() => { splitStack(selected.uid, moveQty ?? 1); }}
                  className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9] disabled:cursor-not-allowed disabled:opacity-40"
                  title="Split this many off into their own stack, here"
                >Split</button>
                <button
                  onClick={() => setMoveQty(Math.max(1, Math.floor(selected.qty / 2)))}
                  className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                >½</button>
                <button
                  onClick={() => setMoveQty(null)}
                  className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
                >All</button>
              </div>
            )}
            {sendTargets.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-[#8a94a3]">Send to</span>
                {sendTargets.map((t) => (
                  <button
                    key={t.label + (t.dest.type === 'container' ? t.dest.uid : 'p')}
                    onClick={() => {
                      const q = moveQty ?? selected.qty;
                      if (q >= selected.qty) transferItem(selected.uid, t.dest);
                      else transferItemQty(selected.uid, t.dest, q);
                    }}
                    className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9]"
                  >{t.label}</button>
                ))}
                {storageOpen && (
                  <button
                    onClick={() => {
                      const q = moveQty ?? selected.qty;
                      if (q >= selected.qty) storagePut(selected.uid);
                      else storagePutQty(selected.uid, q);
                    }}
                    className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9]"
                  >{storageOpen.label}</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SIDE column: storage grid or NEARBY ── */}
      <div className={`${compact ? 'w-full' : 'w-[264px] shrink-0'}`}>
        {storageOpen ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94a3]">
                {storageOpen.label}
              </div>
              <button onClick={closeStorage} className="text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]">✕ close</button>
            </div>
            <GridInventory
              items={storageItems}
              cols={storageDims.cols}
              rows={storageDims.rows}
              cell={cell}
              selectedUid={storageSel !== null ? storageItems[storageSel]?.uid ?? null : null}
              onSelect={(uid) => setStorageSel(uid ? storageItems.findIndex((i) => i.uid === uid) : null)}
              onMove={(uid, gx, gy, rot) => {
                const idx = storageItems.findIndex((i) => i.uid === uid);
                if (idx >= 0) moveStorageItem(idx, gx, gy, rot);
              }}
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                disabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  const q = moveQty ?? selected.qty;
                  if (q >= selected.qty) storagePut(selected.uid);
                  else storagePutQty(selected.uid, q);
                }}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#d7dde5] disabled:opacity-40"
              >Put selected →</button>
              <button
                disabled={storageSel === null}
                onClick={() => {
                  if (storageSel === null) return;
                  const st = storageItems[storageSel];
                  if (!st) return;
                  // the deck stepper belongs to the pack selection;
                  // storage takes move the whole stack unless the
                  // stepper was set against this exact stack size
                  storageTakeQty(storageSel, st.qty);
                }}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#d7dde5] disabled:opacity-40"
              >← Take</button>
              <button
                onClick={() => storageTakeAll()}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#d7dde5]"
              >Take all</button>
              <button
                onClick={() => storagePutAll()}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#d7dde5]"
              >Put all</button>
              <button
                onClick={() => arrangeStorage('size')}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
              >Arrange</button>
              <button
                onClick={() => arrangeStorage('category')}
                className="rounded border border-[#232b36] px-2 py-1 text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]"
              >Sort</button>
            </div>
            <div className="mt-1 text-[10px] text-[#8a94a3]">
              {storageItems.reduce((a, i) => a + (ITEMS[i.itemId]?.weight ?? 0) * i.qty, 0).toFixed(1)} kg stored
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8a94a3]">Nearby</div>
              <button onClick={refreshNearby} className="text-[10px] text-[#8a94a3] hover:text-[#f2f5f8]">↻</button>
            </div>
            {nearby.length === 0 && (
              <div className="rounded border border-[#232b36] bg-[#12161d] px-2 py-2 text-[10px] text-[#8a94a3]">
                Nothing in reach. Storage and containers appear here within arm’s reach.
              </div>
            )}
            <div className="space-y-1">
              {nearby.map((n) => (
                <div
                  key={`${n.kind}:${n.uid}`}
                  onClick={() => {
                    if (n.kind === 'vehicle') {
                      openStorage('vehicle', n.uid, n.label);
                      sfx.play('ui', { volume: 0.4 });
                    } else {
                      // world containers open through their normal
                      // search flow — close the deck, run the interact
                      if (phoneOpen) closePhone();
                      closeInventory();
                      getGame()?.useInteractable(n.uid);
                    }
                  }}
                  className="cursor-pointer rounded border border-[#232b36] bg-[#12161d] px-2 py-1.5 hover:border-[#7fb0d9]"
                  title={n.kind === 'vehicle' ? 'Open storage' : 'Search'}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-[#f2f5f8]">{n.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[#8a94a3]">{n.dist.toFixed(1)} m</span>
                  </div>
                  <div className="text-[9px] text-[#8a94a3]">
                    {n.kind === 'vehicle'
                      ? `storage ${(n.usedKg ?? 0).toFixed(0)}/${(n.capKg ?? 0).toFixed(0)} kg — click to open`
                      : n.looted
                        ? 'container — emptied'
                        : n.locked
                          ? 'container — locked'
                          : 'container — click to search'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
