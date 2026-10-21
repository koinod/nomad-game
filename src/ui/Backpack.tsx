// Backpack.tsx — the G-key field pack host.
// Independent of the sat phone: works with a dead battery, with the
// phone in a trunk, anywhere. G toggles, world pauses while open.
//
// Inventory v2: the body is InventoryDeck — the SAME shared surface
// the KeyB overlay and the phone Pack app render (one inventory
// implementation). This host keeps what is field-pack-specific: the
// header (weight/vitals), the limited mode (no live phone → a
// translucent quick pack, no field crafting), the field-craft panel,
// and hosting InventoryOverlay so its KeyB listener stays mounted.

import { useGameStore } from '../store/gameStore';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import { hasPhoneCarried } from '../store/containers';
import InventoryDeck from './InventoryDeck';
import InventoryOverlay from './InventoryOverlay';
import { sfx } from '../systems/audio';

export default function Backpack() {
  const open = useGameStore((s) => s.backpackOpen);
  // the full inventory deck (KeyB) supersedes the field pack while open;
  // this component hosts it so GameView mounts it with no changes there
  const inventoryOpen = useGameStore((s) => s.inventoryOpen);
  const closeBackpack = useGameStore((s) => s.closeBackpack);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const battery = useGameStore((s) => s.battery);
  // limited mode: no live phone on you (or a dead one) — a
  // semi-translucent stripped pack, no field crafting
  const limited = !hasPhoneCarried(inventory) || battery <= 0;
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const rested = useGameStore((s) => s.restedMinutesLeft);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const nearStation = useGameStore((s) => s.nearStation);
  const countItem = useGameStore((s) => s.countItem);

  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty);
  const tier = encumbranceTier(weight, limit);
  const tierLabel = { ok: 'Pack light', heavy: 'Heavy', overloaded: 'Overloaded', immobile: 'Immobile' }[tier];
  const tierColor = tier === 'ok' ? 'text-[#5aa469]' : tier === 'heavy' ? 'text-[#e8b34b]' : 'text-[#d9534f]';

  const close = () => {
    sfx.play('ui');
    closeBackpack();
  };

  return (
    <>
      {open && !inventoryOpen && (
        <div
          className={`absolute inset-0 z-30 flex items-center justify-center p-4 ${
            limited ? 'bg-black/35' : 'bg-black/60'
          }`}
          onClick={close}
        >
          <div
            className={`flex max-h-full w-[920px] max-w-full flex-col rounded border ${
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
                  {' · '}
                  HP {Math.round(hp)}/{maxHp}
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

            {/* body: the shared deck + (with a live phone) field craft */}
            <div className="nomad-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <InventoryDeck />
              {!limited && (
                <div className="mt-4 rounded border border-[#232b36] bg-[#12161c] p-2.5">
                  <div className="mb-1.5 text-xs text-[#8a94a3]">Field craft — sat phone</div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
                    {Object.values(FIELD_RECIPES).filter((r) => !r.station).map((r) => {
                      const can = r.components.every((c) => countItem(c.itemId) >= c.qty);
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="text-[#d7dde5]">{r.name}</div>
                            <div className="truncate text-[11px] text-[#8a94a3]">
                              {r.components
                                .map((c) => `${countItem(c.itemId)}/${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`)
                                .join(' · ')}
                            </div>
                          </div>
                          <button
                            onClick={() => { sfx.play('ui'); craftRecipe(r.id); }}
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
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
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
                                          .map((c) => `${countItem(c.itemId)}/${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`)
                                          .join(' · ')
                                      : `Needs a ${STATION_LABEL[st]}`}
                                  </div>
                                </div>
                                <button
                                  onClick={() => { sfx.play('ui'); craftRecipe(r.id); }}
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
      )}
      <InventoryOverlay />
    </>
  );
}
