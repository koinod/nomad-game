// Backpack.tsx — standalone inventory overlay (Tarkov/Unturned-style).
// Independent of the sat phone: works with a dead battery, before the
// phone is unlocked, anywhere. I toggles, world pauses while open.

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import { sfx } from '../systems/audio';

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
};

export default function Backpack() {
  const open = useGameStore((s) => s.backpackOpen);
  const closeBackpack = useGameStore((s) => s.closeBackpack);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const phoneUnlocked = useGameStore((s) => s.phoneUnlocked);
  const battery = useGameStore((s) => s.battery);
  // limited mode: no live phone (dead battery or no phone) — a
  // semi-translucent stripped pack, no field crafting
  const limited = !phoneUnlocked || battery <= 0;
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const rested = useGameStore((s) => s.restedMinutesLeft);
  const equipUid = useGameStore((s) => s.equipUid);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const useItemUid = useGameStore((s) => s.useItemUid);
  const dropUid = useGameStore((s) => s.dropUid);
  const assignHotbar = useGameStore((s) => s.assignHotbar);
  const sortInventory = useGameStore((s) => s.sortInventory);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const nearStation = useGameStore((s) => s.nearStation);
  const countItem = useGameStore((s) => s.countItem);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  if (!open) return null;

  const sel = selected ? inventory.find((i) => i.uid === selected) : undefined;
  const selDef = sel ? ITEMS[sel.itemId] : undefined;
  const equippedUids = [equipped.melee, equipped.ranged, equipped.pack];
  const equippedSlot =
    selected === equipped.melee
      ? 'melee'
      : selected === equipped.ranged
        ? 'ranged'
        : selected === equipped.pack
          ? 'pack'
          : null;

  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty);
  const tier = encumbranceTier(weight, limit);
  const tierLabel = { ok: 'Pack light', heavy: 'Heavy', overloaded: 'Overloaded', immobile: 'Immobile' }[tier];
  const tierColor = tier === 'ok' ? 'text-[#5aa469]' : tier === 'heavy' ? 'text-[#e8b34b]' : 'text-[#d9534f]';

  const q = query.trim().toLowerCase();
  const shown = q
    ? inventory.filter((it) => (ITEMS[it.itemId]?.name ?? '').toLowerCase().includes(q))
    : inventory;

  const close = () => {
    sfx.play('ui');
    closeBackpack();
  };

  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center p-4 ${
        limited ? 'bg-black/35' : 'bg-black/60'
      }`}
      onClick={close}
    >
      <div
        className={`flex max-h-full w-[880px] max-w-full flex-col rounded border ${
          limited
            ? 'border-[#2c3644]/80 bg-[#0b0e12]/70 backdrop-blur-sm'
            : 'border-[#232b36] bg-[#0b0e12]'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Backpack"
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-[#232b36] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#d7dde5]">
              Backpack
              {limited && <span className="ml-2 text-[10px] font-normal text-[#8a94a3]">— field pack (no phone)</span>}
            </div>
            <div className="text-[11px] text-[#8a94a3]">
              {limited ? 'Phone offline — essentials only' : 'Your bag — no phone needed'}
              {rested > 0 ? ' · Well rested' : ''}
            </div>
          </div>
          <div className="flex items-center gap-3">
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
            <button
              onClick={close}
              aria-label="Close backpack"
              className="rounded border border-[#232b36] px-3 py-1.5 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
            >
              Close [G]
            </button>
          </div>
        </div>

        {/* body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-[200px_1fr_240px]">
          {/* equipped + vitals */}
          <div className="flex flex-col gap-3">
            <div className="rounded border border-[#232b36] bg-[#12161c] p-2.5">
              <div className="mb-1.5 text-xs text-[#8a94a3]">Equipped</div>
              <div className="flex flex-col gap-1 text-sm">
                {(['melee', 'ranged', 'pack'] as const).map((slot) => {
                  const uid = equipped[slot];
                  const it = uid ? inventory.find((i) => i.uid === uid) : undefined;
                  return (
                    <div key={slot} className="flex justify-between gap-2">
                      <span className="capitalize text-[#8a94a3]">{slot}</span>
                      <span className="truncate text-[#d7dde5]">{it ? ITEMS[it.itemId]?.name : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded border border-[#232b36] bg-[#12161c] p-2.5">
              <div className="mb-1 flex justify-between text-xs text-[#8a94a3]">
                <span>Health</span>
                <span className="font-mono text-[#d7dde5]">
                  {Math.round(hp)}/{maxHp}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-[#232b36]">
                <div className="h-full rounded bg-[#d9534f]" style={{ width: `${(hp / maxHp) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* inventory list */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pack…"
                aria-label="Search inventory"
                className="min-w-0 flex-1 rounded border border-[#232b36] bg-[#12161c] px-3 py-1.5 text-sm text-[#d7dde5] placeholder:text-[#8a94a3] focus:border-[#e8b34b] focus:outline-none"
              />
              <Act label="Organize" fn={() => sortInventory()} />
            </div>
            <div className="nomad-scroll min-h-[200px] flex-1 overflow-y-auto rounded border border-[#232b36] bg-[#12161c]">
              {shown.length === 0 && <p className="p-3 text-sm text-[#8a94a3]">{q ? 'No matches.' : 'Nothing carried.'}</p>}
              {shown.map((it) => {
                const def = ITEMS[it.itemId];
                if (!def) return null;
                const isEq = equippedUids.includes(it.uid);
                return (
                  <button
                    key={it.uid}
                    onClick={() => {
                      sfx.play('ui');
                      setSelected(it.uid);
                    }}
                    className={`flex w-full items-center justify-between border-b border-[#1a2029] px-3 py-2 text-left text-sm transition-colors hover:bg-[#1a2029] ${
                      selected === it.uid ? 'bg-[#1a2029] text-[#e8b34b]' : 'text-[#d7dde5]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="mr-2 text-[10px] uppercase tracking-wide text-[#8a94a3]">
                        {CATEGORY_LABEL[def.category] ?? def.category}
                      </span>
                      {def.name}
                      {it.qty > 1 && <span className="ml-2 text-[#8a94a3]">×{it.qty}</span>}
                      {isEq && <span className="ml-2 text-xs text-[#5aa469]">equipped</span>}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-[#8a94a3]">{(def.weight * it.qty).toFixed(1)} kg</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* detail + actions */}
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
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                        disabled={selDef.category !== 'weapon-melee' && selDef.category !== 'weapon-ranged' && selDef.category !== 'pack'}
                      />
                    )}
                    <Act label="Use" fn={() => useItemUid(sel.uid)} />
                    <Act
                      label="Drop"
                      danger
                      fn={() => {
                        dropUid(sel.uid);
                        setSelected(null);
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-[#8a94a3]">Hotbar:</span>
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        onClick={() => {
                          sfx.play('ui');
                          assignHotbar(i, sel.uid);
                          useGameStore.getState().addToast(`${selDef.name} → hotbar ${i + 1}.`);
                        }}
                        aria-label={`Assign to hotbar ${i + 1}`}
                        className="rounded border border-[#232b36] px-2 py-1 font-mono text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* crafting: field recipes from the sat phone; station recipes when
                standing at the matching workstation (nearStation from the game) */}
            {!limited && (
            <div className="rounded border border-[#232b36] bg-[#12161c] p-2.5">
              <div className="mb-1.5 text-xs text-[#8a94a3]">Field craft — sat phone</div>
              <div className="flex flex-col gap-1.5">
                {Object.values(FIELD_RECIPES).filter((r) => !r.station).map((r) => {
                  const can = r.components.every((c) => countItem(c.itemId) >= c.qty);
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="text-[#d7dde5]">{r.name}</div>
                        <div className="truncate text-[11px] text-[#8a94a3]">
                          {r.components
                            .map((c) => {
                              const have = countItem(c.itemId);
                              return `${have}/${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`;
                            })
                            .join(' · ')}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          sfx.play('ui');
                          craftRecipe(r.id);
                        }}
                        disabled={!can}
                        className="shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Craft
                      </button>
                    </div>
                  );
                })}
              </div>
              {(['workbench', 'chemistry', 'industrial'] as const).map((st) => (
                <div key={st} className="mt-3">
                  <div className="mb-1.5 text-xs text-[#8a94a3]">
                    {STATION_LABEL[st]}
                    {nearStation === st && <span className="ml-1 text-[#e8b34b]">— in range</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {Object.values(STATION_RECIPES)
                      .filter((r) => r.station === st)
                      .map((r) => {
                        const inRange = nearStation === st;
                        const can = inRange && r.components.every((c) => countItem(c.itemId) >= c.qty);
                        return (
                          <div key={r.id} className={`flex items-center justify-between gap-2 text-sm ${inRange ? '' : 'opacity-50'}`}>
                            <div className="min-w-0">
                              <div className="text-[#d7dde5]">{r.name}</div>
                              <div className="truncate text-[11px] text-[#8a94a3]">
                                {inRange
                                  ? r.components
                                      .map((c) => {
                                        const have = countItem(c.itemId);
                                        return `${have}/${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`;
                                      })
                                      .join(' · ')
                                  : `Needs a ${STATION_LABEL[st]} — ${st === 'industrial' ? 'at the marina Machine Shop' : st === 'chemistry' ? 'one at the relay station' : 'at Jonah\u2019s camp or in town'}`}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                sfx.play('ui');
                                craftRecipe(r.id);
                              }}
                              disabled={!can}
                              className="shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Craft
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
