import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';
import { FACTIONS, repTier } from '../data/factions';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import { DIFFICULTIES } from '../store/types';
import type { PhoneTab } from '../store/types';
import { getGame } from '../game/instance';
import { sfx } from '../systems/audio';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

/* ---------------- LOADOUT tab ---------------- */

function LoadoutTab() {
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const battery = useGameStore((s) => s.battery);
  const equipUid = useGameStore((s) => s.equipUid);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const useItemUid = useGameStore((s) => s.useItemUid);
  const dropUid = useGameStore((s) => s.dropUid);
  const [selected, setSelected] = useState<string | null>(null);

  const sel = selected ? inventory.find((i) => i.uid === selected) : undefined;
  const selDef = sel ? ITEMS[sel.itemId] : undefined;
  const equippedUids = [equipped.melee, equipped.ranged, equipped.pack];
  const equippedSlot =
    selected === equipped.melee ? 'melee'
    : selected === equipped.ranged ? 'ranged'
    : selected === equipped.pack ? 'pack'
    : null;

  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty);
  const tier = encumbranceTier(weight, limit);
  const tierLabel = { ok: 'Pack light', heavy: 'Heavy', overloaded: 'Overloaded', immobile: 'Immobile' }[tier];
  const tierColor = tier === 'ok' ? 'text-[#5aa469]' : tier === 'heavy' ? 'text-[#e8b34b]' : 'text-[#d9534f]';

  const act = (label: string, fn: () => void, opts?: { danger?: boolean; disabled?: boolean }) => (
    <button
      key={label}
      onClick={() => {
        sfx.play('ui');
        fn();
      }}
      disabled={opts?.disabled}
      className={`rounded border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        opts?.danger
          ? 'border-[#232b36] bg-[#0b0e12] text-[#d9534f] hover:border-[#d9534f]'
          : 'border-[#232b36] bg-[#0b0e12] text-[#d7dde5] hover:border-[#e8b34b]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* weight + battery */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs text-[#8a94a3]">
            <span>Weight</span>
            <span className="font-mono">
              {weight.toFixed(1)}/{limit.toFixed(0)} kg <span className={tierColor}>{tierLabel}</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-[#232b36]">
            <div
              className={`h-full rounded ${tier === 'ok' ? 'bg-[#5aa469]' : tier === 'heavy' ? 'bg-[#e8b34b]' : 'bg-[#d9534f]'}`}
              style={{ width: `${Math.min(100, (weight / limit) * 100)}%` }}
            />
          </div>
        </div>
        <div className="text-right">
          <div className="mb-1 text-xs text-[#8a94a3]">Battery</div>
          <div className="font-mono text-sm text-[#d7dde5]">{Math.round(battery)}%</div>
        </div>
      </div>

      {/* equipped */}
      <div className="rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
        <div className="mb-1.5 text-xs text-[#8a94a3]">Equipped</div>
        <div className="flex flex-col gap-1 text-sm">
          {(['melee', 'ranged', 'pack'] as const).map((slot) => {
            const uid = equipped[slot];
            const it = uid ? inventory.find((i) => i.uid === uid) : undefined;
            return (
              <div key={slot} className="flex justify-between">
                <span className="text-[#8a94a3] capitalize">{slot}</span>
                <span className="text-[#d7dde5]">{it ? ITEMS[it.itemId]?.name : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* inventory */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 text-xs text-[#8a94a3]">Inventory</div>
        <div className="nomad-scroll min-h-0 flex-1 overflow-y-auto rounded border border-[#232b36] bg-[#0b0e12]">
          {inventory.length === 0 && (
            <p className="p-3 text-sm text-[#8a94a3]">Nothing carried.</p>
          )}
          {inventory.map((it) => {
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
                <span>
                  {def.name}
                  {it.qty > 1 && <span className="ml-2 text-[#8a94a3]">×{it.qty}</span>}
                  {isEq && <span className="ml-2 text-xs text-[#5aa469]">equipped</span>}
                </span>
                <span className="font-mono text-xs text-[#8a94a3]">{(def.weight * it.qty).toFixed(1)} kg</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* selection detail + actions */}
      {sel && selDef && (
        <div className="rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
          <div className="mb-1 text-sm font-medium text-[#d7dde5]">
            {selDef.name}
            {sel.qty > 1 && <span className="ml-2 text-[#8a94a3]">×{sel.qty}</span>}
          </div>
          <p className="mb-2 text-xs leading-relaxed text-[#8a94a3]">{selDef.desc}</p>
          <div className="flex flex-wrap gap-2">
            {equippedSlot
              ? act('Unequip', () => {
                  unequipSlot(equippedSlot);
                  useGameStore.getState().addToast(`Unequipped ${selDef.name}.`);
                })
              : act('Equip', () => equipUid(sel.uid), {
                  disabled: selDef.category !== 'weapon-melee' && selDef.category !== 'weapon-ranged' && selDef.category !== 'pack',
                })}
            {act('Use', () => useItemUid(sel.uid))}
            {act('Drop', () => {
              dropUid(sel.uid);
              setSelected(null);
            }, { danger: true })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- WORLD tab (2D map) ---------------- */

const MAP_W = 320;
const MAP_H = 146;
const WORLD_X = 1400; // x in [-700, 700]
const WORLD_Z = 640; // z in [-320, 320]

function biomeBase(biome: string): [number, number, number] {
  switch (biome) {
    case 'water': return [20, 42, 64];
    case 'beach': return [150, 132, 98];
    case 'dune': return [170, 148, 104];
    case 'forest': return [40, 68, 46];
    case 'town': return [86, 90, 98];
    case 'marsh': return [56, 78, 62];
    default: return [44, 48, 56];
  }
}

function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poiPositions = useGameStore((s) => s.poiPositions);
  const pos = useGameStore((s) => s.pos);
  const quests = useGameStore((s) => s.quests);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = getGame();
    if (!canvas || !g) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = ctx.createImageData(MAP_W, MAP_H);
    for (let py = 0; py < MAP_H; py++) {
      for (let px = 0; px < MAP_W; px++) {
        const wx = (px / MAP_W) * WORLD_X - 700;
        const wz = (py / MAP_H) * WORLD_Z - 320;
        const base = biomeBase(g.getBiomeAt(wx, wz));
        const h = g.getHeightAt(wx, wz);
        const shade = Math.max(0.35, Math.min(1.15, 0.72 + h / 50));
        const i = (py * MAP_W + px) * 4;
        img.data[i] = Math.min(255, base[0] * shade);
        img.data[i + 1] = Math.min(255, base[1] * shade);
        img.data[i + 2] = Math.min(255, base[2] * shade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const toPx = (x: number, z: number): [number, number] => [
      ((x + 700) / WORLD_X) * MAP_W,
      ((z + 320) / WORLD_Z) * MAP_H,
    ];
    const st = useGameStore.getState();

    // POIs
    ctx.font = '8px sans-serif';
    for (const [id, [x, z]] of Object.entries(st.poiPositions)) {
      if (id.startsWith('npc:')) continue; // NPCs drawn via their POI
      const [px, py] = toPx(x, z);
      ctx.fillStyle = '#d7dde5';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      ctx.fillStyle = 'rgba(215,221,229,0.85)';
      ctx.fillText(id.replace(/_/g, ' '), px + 4, py + 3);
    }

    // quest target marker
    const q = st.quests[0];
    const def = q ? QUESTS.find((d) => d.id === q.id) : undefined;
    const step = def?.steps[q.stepIndex];
    if (step && (step.target.startsWith('poi:') || step.target.startsWith('npc:'))) {
      const key = step.target.startsWith('poi:') ? step.target.slice(4) : step.target;
      const p = st.poiPositions[key];
      if (p) {
        const [px, py] = toPx(p[0], p[1]);
        ctx.strokeStyle = '#e8b34b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // player triangle (pointing up)
    const [px, py] = toPx(st.pos[0], st.pos[2]);
    ctx.fillStyle = '#e8b34b';
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.lineTo(px - 4.5, py + 4);
    ctx.lineTo(px + 4.5, py + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b0e12';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [poiPositions, pos, quests]);

  const g = getGame();
  return (
    <div className="flex h-full flex-col gap-2">
      {g ? (
        <canvas
          ref={canvasRef}
          width={MAP_W}
          height={MAP_H}
          className="w-full rounded border border-[#232b36]"
        />
      ) : (
        <div className="rounded border border-[#232b36] bg-[#0b0e12] p-4 text-sm text-[#8a94a3]">
          Map boots when the world loads.
        </div>
      )}
      <p className="text-xs leading-relaxed text-[#8a94a3]">
        Amber ring marks your current objective. The triangle is you.
      </p>
    </div>
  );
}

/* ---------------- COMMAND tab ---------------- */

function CommandTab() {
  const quests = useGameStore((s) => s.quests);
  const doneQuests = useGameStore((s) => s.doneQuests);
  const rep = useGameStore((s) => s.rep);
  const difficulty = useGameStore((s) => s.difficulty);
  const battery = useGameStore((s) => s.battery);
  const saveSlots = useGameStore((s) => s.saveSlots);
  const saveToSlot = useGameStore((s) => s.saveToSlot);
  const canSave = DIFFICULTIES[difficulty].saveAnywhere;

  const auto = saveSlots.find((m) => m.slot === 'auto');

  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      {/* quests */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Quests</h3>
        {quests.length === 0 && doneQuests.length === 0 && (
          <p className="text-sm text-[#8a94a3]">No quests yet.</p>
        )}
        {quests.map((q) => {
          const def = QUESTS.find((d) => d.id === q.id);
          if (!def) return null;
          const step = def.steps[q.stepIndex];
          return (
            <div key={q.id} className="mb-2 rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
              <div className="text-sm font-medium text-[#e8b34b]">{def.title}</div>
              {step && (
                <div className="mt-0.5 text-xs text-[#d7dde5]">
                  {step.objective}
                  {step.count > 1 && (
                    <span className="ml-2 font-mono text-[#8a94a3]">
                      {Math.min(q.progress, step.count)}/{step.count}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {doneQuests.map((id) => {
          const def = QUESTS.find((d) => d.id === id);
          return (
            <div key={id} className="mb-1.5 flex items-center gap-2 text-xs text-[#8a94a3]">
              <span className="text-[#5aa469]">✓</span>
              <span>{def ? def.title : id}</span>
            </div>
          );
        })}
      </section>

      {/* factions */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Factions</h3>
        {FACTIONS.filter((f) => f.inSlice).map((f) => {
          const r = rep[f.id] ?? 0;
          return (
            <div key={f.id} className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-[#d7dde5]">{f.name}</span>
              <span className="text-xs text-[#8a94a3]">
                {repTier(r)} <span className="font-mono">({r})</span>
              </span>
            </div>
          );
        })}
      </section>

      {/* save */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Save</h3>
        {canSave ? (
          <div className="flex gap-2">
            {['1', '2', '3'].map((slot) => (
              <button
                key={slot}
                onClick={() => {
                  sfx.play('ui');
                  void saveToSlot(slot);
                }}
                className="flex-1 rounded border border-[#232b36] bg-[#0b0e12] px-3 py-2 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
              >
                Slot {slot}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#8a94a3]">Save at campfires.</p>
        )}
        {auto && (
          <p className="mt-1.5 text-xs text-[#8a94a3]">Auto save: {fmtDate(auto.savedAt)}</p>
        )}
      </section>

      {/* battery */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Battery</h3>
        <div className="mb-1 h-2 w-full overflow-hidden rounded bg-[#232b36]">
          <div
            className="h-full rounded bg-[#5aa469]"
            style={{ width: `${Math.round(battery)}%` }}
          />
        </div>
        <p className="text-xs text-[#8a94a3]">{Math.round(battery)}% — charge at campfires.</p>
      </section>
    </div>
  );
}

/* ---------------- Phone shell ---------------- */

const TABS: { id: PhoneTab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'world', label: 'World' },
  { id: 'command', label: 'Command' },
];

export default function Phone() {
  const phoneOpen = useGameStore((s) => s.phoneOpen);
  const phoneTab = useGameStore((s) => s.phoneTab);
  const setPhoneTab = useGameStore((s) => s.setPhoneTab);
  const closePhone = useGameStore((s) => s.closePhone);

  if (!phoneOpen) return null;

  return (
    <div className="absolute inset-0 z-30">
      {/* scrim: tapping outside closes */}
      <div className="absolute inset-0 bg-black/50" onClick={() => closePhone()} />
      <aside className="absolute right-0 top-0 flex h-full w-[380px] max-w-[92vw] flex-col border-l border-[#232b36] bg-[#12161c]">
        <header className="flex items-center justify-between border-b border-[#232b36] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#d7dde5]">SAT PHONE</div>
            <div className="text-[11px] text-[#8a94a3]">Field terminal</div>
          </div>
          <button
            onClick={() => {
              sfx.play('ui');
              closePhone();
            }}
            aria-label="Close phone"
            className="rounded border border-[#232b36] px-3 py-1.5 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            Close
          </button>
        </header>
        <nav className="flex border-b border-[#232b36]" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={phoneTab === t.id}
              onClick={() => {
                sfx.play('ui');
                setPhoneTab(t.id);
              }}
              className={`flex-1 px-4 py-2.5 text-sm transition-colors ${
                phoneTab === t.id
                  ? 'border-b-2 border-[#e8b34b] text-[#e8b34b]'
                  : 'text-[#8a94a3] hover:text-[#d7dde5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 p-4">
          {phoneTab === 'loadout' && <LoadoutTab />}
          {phoneTab === 'world' && <WorldMap />}
          {phoneTab === 'command' && <CommandTab />}
        </div>
      </aside>
    </div>
  );
}
