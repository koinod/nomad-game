// InventoryOverlay.tsx — the full inventory deck (Lane 5, parallel
// cycle). Ian's standing preference: inventory management WITHOUT the
// sat phone. KeyB opens it anywhere in the field (dead battery, phone
// locked — it's your gear, not an app); the world pauses while it's up
// (opening sets backpackOpen, the flag Game.ts's worldPaused honors).
// Where the G-key field pack (Backpack.tsx) is the quick look, this is
// the management deck: equipped + armor, the true grid with Pack-parity
// search/categories, a quick-use slot row, the condition/repair hooks,
// and — when a container is open — a unified storage mode (pack grid +
// storage grid + Take/Put in one screen, superseding StoragePanel,
// which stands down while this is open).
//
// Hosted from Backpack.tsx's fragment so it mounts wherever the field
// pack does (GameView is not a Lane 5 surface). The KeyB handler is
// registered here, React-side — Game.ts is never touched.

import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import { canPlace, containerGridDims, layoutItems, packGridDims } from '../store/gridUtils';
import type { Equipped } from '../store/types';
import GridInventory from './GridInventory';
import { sfx } from '../systems/audio';

const CATEGORY_LABEL: Record<string, string> = {
  'weapon-melee': 'Melee',
  'weapon-ranged': 'Ranged',
  ammo: 'Ammo',
  medical: 'Medical',
  food: 'Food',
  material: 'Material',
  tool: 'Tool',
  pack: 'Pack',
  key: 'Key items',
  mod: 'Attachments',
  armor: 'Armor',
  blueprint: 'Blueprints',
};

const ARMOR_SLOTS: { key: keyof Equipped; label: string }[] = [
  { key: 'armorHead', label: 'Head' },
  { key: 'armorTorso', label: 'Torso' },
  { key: 'armorLegs', label: 'Legs' },
];

function Act({
  label,
  fn,
  danger,
  disabled,
}: {
  label: string;
  fn: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => {
        sfx.play('ui');
        fn();
      }}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-[#232b36] bg-[#0b0e12] text-[#d9534f] hover:border-[#d9534f]'
          : 'border-[#232b36] bg-[#0b0e12] text-[#d7dde5] hover:border-[#e8b34b]'
      }`}
    >
      {label}
    </button>
  );
}

export default function InventoryOverlay() {
  const inventoryOpen = useGameStore((s) => s.inventoryOpen);
  const screen = useGameStore((s) => s.screen);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const hotbar = useGameStore((s) => s.hotbar);
  const difficulty = useGameStore((s) => s.difficulty);
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const storageOpen = useGameStore((s) => s.storageOpen);
  const storageItems = useGameStore((s) => s.storageItems);
  const fleet = useGameStore((s) => s.fleet);
  const trailerFleet = useGameStore((s) => s.trailerFleet);
  const nearStation = useGameStore((s) => s.nearStation);
  const closeInventory = useGameStore((s) => s.closeInventory);
  const moveInvItem = useGameStore((s) => s.moveInvItem);
  const moveStorageItem = useGameStore((s) => s.moveStorageItem);
  const storageTake = useGameStore((s) => s.storageTake);
  const storagePut = useGameStore((s) => s.storagePut);
  const equipUid = useGameStore((s) => s.equipUid);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const useItemUid = useGameStore((s) => s.useItemUid);
  const useHotbar = useGameStore((s) => s.useHotbar);
  const dropUid = useGameStore((s) => s.dropUid);
  const assignHotbar = useGameStore((s) => s.assignHotbar);
  const arrangeInventory = useGameStore((s) => s.arrangeInventory);
  const sortInventory = useGameStore((s) => s.sortInventory);
  const repairWeapon = useGameStore((s) => s.repairWeapon);
  const disassemble = useGameStore((s) => s.disassemble);
  const atBench = nearStation === 'workbench';

  const [selected, setSelected] = useState<string | null>(null);
  const [selStored, setSelStored] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string>('all');

  // KeyB toggles the deck; Escape closes it. Registered unconditionally
  // (this component stays mounted via Backpack's fragment even while
  // closed) and reads the store directly so it never goes stale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = useGameStore.getState();
      if (e.code === 'Escape' && s.inventoryOpen) {
        s.closeInventory();
        sfx.play('ui');
        return;
      }
      if (e.code !== 'KeyB') return;
      if (s.inventoryOpen) {
        s.closeInventory();
        sfx.play('ui');
        return;
      }
      if (s.screen !== 'game' || s.dead || s.dialogue || s.phoneOpen || s.sleepOpen) return;
      document.exitPointerLock?.();
      s.openInventory();
      sfx.play('ui');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // programmatic opens (tests, future callers) get the same cursor release
  useEffect(() => {
    if (inventoryOpen) document.exitPointerLock?.();
  }, [inventoryOpen]);

  if (!inventoryOpen || screen !== 'game') return null;

  const sel = selected ? inventory.find((i) => i.uid === selected) : undefined;
  const selDef = sel ? ITEMS[sel.itemId] : undefined;
  const slotKeys: (keyof Equipped)[] = ['melee', 'ranged', 'pack', 'armorHead', 'armorTorso', 'armorLegs'];
  const equippedSlot: keyof Equipped | null =
    slotKeys.find((k) => equipped[k] != null && equipped[k] === selected) ?? null;
  const equippedUids = new Set(
    slotKeys.map((k) => equipped[k]).filter((u): u is string => !!u),
  );

  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty);
  const tier = encumbranceTier(weight, limit);
  const tierLabel = { ok: 'Pack light', heavy: 'Heavy', overloaded: 'Overloaded', immobile: 'Immobile' }[tier];
  const tierColor = tier === 'ok' ? 'text-[#5aa469]' : tier === 'heavy' ? 'text-[#e8b34b]' : 'text-[#d9534f]';

  const packDims = packGridDims(equipped.pack ? inventory.find((i) => i.uid === equipped.pack)?.itemId : null);
  const filtering = query.trim().length > 0 || chip !== 'all';
  const dimmedUids = filtering
    ? new Set(
        inventory
          .filter((it) => {
            const def = ITEMS[it.itemId];
            if (!def) return true;
            if (chip !== 'all' && def.category !== chip) return true;
            return !def.name.toLowerCase().includes(query.trim().toLowerCase());
          })
          .map((it) => it.uid),
      )
    : undefined;

  // storage mode (a container is open): dims + capacity mirror StoragePanel
  const storedSel = selStored ? storageItems.find((it) => it.uid === selStored) : undefined;
  const storedSelIdx = storedSel ? storageItems.indexOf(storedSel) : -1;
  let storeCapKg: number | null = null;
  if (storageOpen?.kind === 'vehicle') storeCapKg = fleet.find((f) => f.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen?.kind === 'trailer') storeCapKg = trailerFleet.find((t) => t.defId === storageOpen.uid)?.storageCapKg ?? null;
  if (storageOpen?.kind === 'crate') storeCapKg = 150;
  const storeDims = containerGridDims(storeCapKg ?? 150);
  const storedKg = storageItems.reduce((w, it) => w + (ITEMS[it.itemId]?.weight ?? 0) * it.qty, 0);

  const close = () => {
    sfx.play('ui');
    closeInventory();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4" onClick={close}>
      <div
        className="flex max-h-full w-[1180px] max-w-full flex-col rounded border border-[#232b36] bg-[#0b0e12]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Inventory"
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-[#232b36] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#d7dde5]">Inventory</div>
            <div className="text-[11px] text-[#8a94a3]">No phone needed — this is your gear, on you</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-sm text-[#d7dde5]">
                {weight.toFixed(1)}/{limit.toFixed(0)} kg <span className={tierColor}>{tierLabel}</span>
              </div>
              <div className="mt-1 h-1.5 w-36 overflow-hidden rounded bg-[#232b36]">
                <div
                  className={`h-full rounded ${tier === 'ok' ? 'bg-[#5aa469]' : tier === 'heavy' ? 'bg-[#e8b34b]' : 'bg-[#d9534f]'}`}
                  style={{ width: `${Math.min(100, (weight / limit) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-[#d7dde5]">
                {Math.round(hp)}/{maxHp} HP
              </div>
              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-[#232b36]">
                <div className="h-full rounded bg-[#d9534f]" style={{ width: `${(hp / maxHp) * 100}%` }} />
              </div>
            </div>
            <button
              onClick={close}
              aria-label="Close inventory"
              className="rounded border border-[#232b36] px-3 py-1.5 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
            >
              Close [B]
            </button>
          </div>
        </div>

        {/* quick-use row: tap a filled slot to use it (keys 1–4 in the field) */}
        <div className="flex items-center gap-2 border-b border-[#232b36] px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8a94a3]">Quick</span>
          {[0, 1, 2, 3].map((i) => {
            const uid = hotbar[i];
            const it = uid ? inventory.find((x) => x.uid === uid) : undefined;
            const def = it ? ITEMS[it.itemId] : undefined;
            return (
              <button
                key={i}
                disabled={!it}
                onClick={() => {
                  sfx.play('ui');
                  useHotbar(i);
                }}
                className="flex min-w-0 items-center gap-2 rounded border border-[#232b36] bg-[#12161c] px-2.5 py-1.5 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="font-mono text-[#e8b34b]">{i + 1}</span>
                <span className="max-w-[140px] truncate">{def ? def.name : 'empty'}</span>
                {it && it.qty > 1 ? <span className="font-mono text-[#8a94a3]">×{it.qty}</span> : null}
              </button>
            );
          })}
          <span className="ml-auto hidden text-[10px] text-[#5a6472] md:block">
            Assign from Inspect · drag to move · R / double-click rotates
          </span>
        </div>

        {/* body */}
        <div
          className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 ${
            storageOpen
              ? 'md:grid-cols-[180px_1fr_1fr_240px]'
              : 'md:grid-cols-[180px_1fr_240px]'
          }`}
        >
          {/* equipped + armor */}
          <div className="flex flex-col gap-3">
            <div className="rounded border border-[#232b36] bg-[#12161c] p-2.5">
              <div className="mb-1.5 text-xs text-[#8a94a3]">Equipped</div>
              <div className="flex flex-col gap-1 text-sm">
                {(['melee', 'ranged', 'pack'] as const).map((slot) => {
                  const uid = equipped[slot];
                  const it = uid ? inventory.find((i) => i.uid === uid) : undefined;
                  return (
                    <button
                      key={slot}
                      disabled={!it}
                      onClick={() => it && setSelected(it.uid)}
                      className="flex justify-between gap-2 text-left disabled:cursor-default"
                    >
                      <span className="capitalize text-[#8a94a3]">{slot}</span>
                      <span className="truncate text-[#d7dde5]">{it ? ITEMS[it.itemId]?.name : '—'}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mb-1.5 mt-3 text-xs text-[#8a94a3]">Armor</div>
              <div className="flex flex-col gap-1 text-sm">
                {ARMOR_SLOTS.map(({ key, label }) => {
                  const uid = equipped[key];
                  const it = uid ? inventory.find((i) => i.uid === uid) : undefined;
                  return (
                    <button
                      key={key}
                      disabled={!it}
                      onClick={() => it && setSelected(it.uid)}
                      className="flex justify-between gap-2 text-left disabled:cursor-default"
                    >
                      <span className="text-[#8a94a3]">{label}</span>
                      <span className="truncate text-[#d7dde5]">{it ? ITEMS[it.itemId]?.name : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* pack grid — search + category parity with the phone Pack app */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pack…"
                aria-label="Search inventory"
                className="min-w-0 flex-1 rounded border border-[#232b36] bg-[#12161c] px-3 py-1.5 text-sm text-[#d7dde5] placeholder:text-[#8a94a3] focus:border-[#e8b34b] focus:outline-none"
              />
              <Act label="Auto-arrange" fn={() => arrangeInventory('size')} />
              <Act label="Organize" fn={() => sortInventory()} />
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {['all', ...new Set(inventory.map((i) => ITEMS[i.itemId]?.category ?? ''))].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    sfx.play('ui');
                    setChip(c);
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                    chip === c ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'
                  }`}
                >
                  {c === 'all' ? 'All' : (CATEGORY_LABEL[c] ?? c)}
                </button>
              ))}
            </div>
            <div className="nomad-scroll min-h-[200px] flex-1 overflow-y-auto">
              {inventory.length === 0 ? (
                <p className="p-3 text-sm text-[#8a94a3]">Nothing carried.</p>
              ) : (
                <GridInventory
                  items={inventory}
                  cols={packDims.cols}
                  rows={packDims.rows}
                  cell={38}
                  selectedUid={selected}
                  onSelect={setSelected}
                  onMove={moveInvItem}
                  equippedUids={equippedUids}
                  dimmedUids={dimmedUids}
                />
              )}
            </div>
            {storageOpen && (
              <div className="mt-2">
                <Act
                  label={sel ? `Put ${selDef?.name ?? 'item'} in ${storageOpen.label}` : 'Put selected'}
                  disabled={!sel}
                  fn={() => {
                    if (sel) {
                      storagePut(sel.uid);
                      setSelected(null);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* storage mode: the open container, same transfer rules as StoragePanel */}
          {storageOpen && (
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8a94a3]">
                  {storageOpen.label} — {storedKg.toFixed(1)} kg{storeCapKg != null ? ` / ${storeCapKg} kg` : ''}
                </div>
                <Act
                  label={storedSel ? `Take ${ITEMS[storedSel.itemId]?.name ?? ''}` : 'Take'}
                  disabled={!storedSel}
                  fn={() => {
                    storageTake(storedSelIdx);
                    setSelStored(null);
                  }}
                />
              </div>
              <div className="nomad-scroll min-h-[200px] flex-1 overflow-y-auto">
                {storageItems.length === 0 ? (
                  <p className="p-3 text-sm text-[#8a94a3]">Empty.</p>
                ) : (
                  <GridInventory
                    items={storageItems}
                    cols={storeDims.cols}
                    rows={storeDims.rows}
                    cell={32}
                    selectedUid={selStored}
                    onSelect={setSelStored}
                    onMove={(uid, gx, gy, rot) => {
                      const idx = storageItems.findIndex((it) => it.uid === uid);
                      if (idx >= 0) moveStorageItem(idx, gx, gy, rot);
                    }}
                  />
                )}
              </div>
              <p className="mt-1 text-[10px] text-[#5a6472]">What rides here stays with it — through saves, too.</p>
            </div>
          )}

          {/* inspect + condition/repair hooks (Lane 6's condition shape:
              InvItem.condition 0..100, undefined = pristine; jammed flag) */}
          <div className="flex flex-col gap-3">
            <div className="rounded border border-[#232b36] bg-[#12161c] p-2.5">
              <div className="mb-1 text-xs text-[#8a94a3]">Inspect</div>
              {!sel || !selDef ? (
                <p className="text-sm text-[#8a94a3]">Select an item to inspect it.</p>
              ) : (
                <>
                  <div className="mb-1 text-sm font-medium text-[#d7dde5]">
                    {selDef.name}
                    {sel.qty > 1 && <span className="ml-2 text-[#8a94a3]">×{sel.qty}</span>}
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-[#8a94a3]">{selDef.desc}</p>
                  <div className="mb-2 font-mono text-xs text-[#8a94a3]">
                    {(selDef.weight * sel.qty).toFixed(1)} kg
                    {selDef.damage ? ` · ${selDef.damage} dmg` : ''}
                    {selDef.heal ? ` · +${selDef.heal} HP` : ''}
                    {selDef.carryBonus ? ` · +${selDef.carryBonus} kg` : ''}
                    {selDef.blockPct ? ` · blocks ${selDef.blockPct}%` : ''}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* armor-category items wear via equipUid's armor
                        routing (stage 7: head/torso/legs slots); Unequip
                        covers every routed slot. */}
                    {equippedSlot ? (
                      <Act
                        label="Unequip"
                        fn={() => {
                          unequipSlot(equippedSlot);
                          useGameStore.getState().addToast(`Unequipped ${selDef.name}.`);
                        }}
                      />
                    ) : (
                      <Act
                        label="Equip"
                        fn={() => equipUid(sel.uid)}
                        disabled={
                          selDef.category !== 'weapon-melee' &&
                          selDef.category !== 'weapon-ranged' &&
                          selDef.category !== 'pack' &&
                          selDef.category !== 'armor'
                        }
                      />
                    )}
                    <Act label="Use" fn={() => useItemUid(sel.uid)} />
                    <Act
                      label="Rotate"
                      fn={() => {
                        const lay = layoutItems(inventory, packDims.cols, packDims.rows);
                        const p = lay.placed.get(sel.uid);
                        if (!p) return;
                        const byUid = new Map(inventory.map((i) => [i.uid, i]));
                        if (canPlace(lay.placed, byUid, sel.uid, p.gx, p.gy, !p.rot, packDims.cols, packDims.rows)) {
                          moveInvItem(sel.uid, p.gx, p.gy, !p.rot);
                        }
                      }}
                    />
                    <Act
                      label="Drop"
                      danger
                      fn={() => {
                        dropUid(sel.uid);
                        setSelected(null);
                      }}
                    />
                  </div>
                  {(selDef.category === 'weapon-ranged' || selDef.category === 'weapon-melee' || selDef.disassembly) && (
                    <div className="mt-3 border-t border-[#232b36] pt-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8a94a3]">
                        Condition{' '}
                        <span className={(sel.condition ?? 100) < 30 ? 'text-[#d9534f]' : 'text-[#d7dde5]'}>
                          {Math.round(sel.condition ?? 100)}%
                        </span>
                        {sel.jammed && <span className="text-[#d9534f]"> · JAMMED</span>}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded bg-[#131a22]">
                        <div
                          className={`h-full ${(sel.condition ?? 100) < 30 ? 'bg-[#d9534f]' : (sel.condition ?? 100) < 60 ? 'bg-[#e8b34b]' : 'bg-[#7fb069]'}`}
                          style={{ width: `${Math.round(sel.condition ?? 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {atBench && (selDef.category === 'weapon-ranged' || selDef.category === 'weapon-melee') && (
                          <Act
                            label={`Repair (${Math.max(1, Math.ceil((100 - (sel.condition ?? 100)) / 40))}× ${selDef.category === 'weapon-ranged' ? 'gun parts' : 'scrap'})`}
                            fn={() => repairWeapon(sel.uid)}
                          />
                        )}
                        {atBench && selDef.disassembly && (
                          <Act
                            label="Strip for parts"
                            danger
                            fn={() => {
                              disassemble(sel.uid);
                              setSelected(null);
                            }}
                          />
                        )}
                        {!atBench && (
                          <span className="text-[11px] text-[#5a6472]">
                            Bench work needs a Weapons Bench — oil & kits work anywhere.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-[#8a94a3]">Hotbar:</span>
                    {[0, 1, 2, 3].map((i) => (
                      <button
                        key={i}
                        onClick={() => {
                          sfx.play('ui');
                          assignHotbar(i, sel.uid);
                          useGameStore.getState().addToast(`${selDef.name} → hotbar ${i + 1}.`);
                        }}
                        aria-label={`Assign to hotbar ${i + 1}`}
                        className={`rounded border px-2 py-1 font-mono text-xs transition-colors hover:border-[#e8b34b] ${
                          hotbar[i] === sel.uid ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#d7dde5]'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
