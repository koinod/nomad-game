import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { MODS } from '../data/mods';
import { QUESTS } from '../data/quests';
import { FACTIONS, repTier } from '../data/factions';
import { SKILLS, TREES, PERKS, xpToNext } from '../data/skills';
import { traitName, moraleBand, type SurvivorJob } from '../data/survivors';
import { FACILITIES, baseHeat, heatBand } from '../data/base';
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

function BaseSection() {
  const base = useGameStore((s) => s.base);
  const buildFacility = useGameStore((s) => s.buildFacility);
  const inventory = useGameStore((s) => s.inventory);
  const survivors = useGameStore((s) => s.survivors);
  const daysElapsed = useGameStore((s) => s.daysElapsed);

  if (!base) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Base</h3>
        <p className="text-sm text-[#8a94a3]">
          No home base. Clear a camp and use its gold claim post — Shore Camp, Jonah's Camp, or the
          Lighthouse Grounds. A base produces daily and gives your crew somewhere to be.
        </p>
      </section>
    );
  }
  const heat = baseHeat(base.facilities, survivors.length, daysElapsed);
  const count = (id: string) => inventory.filter((i) => i.itemId === id).reduce((a, i) => a + i.qty, 0);
  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold text-[#8a94a3]">
        Base — {base.poiId.replace(/_/g, ' ')}
        <span className={heat >= 60 ? 'text-[#d9534f]' : heat >= 30 ? 'text-[#e8b34b]' : 'text-[#5aa469]'}>
          Heat {heat} · {heatBand(heat)}
        </span>
      </h3>
      <p className="mb-2 text-[11px] text-[#8a94a3]">
        Heat = stockpile + crew + time, minus defenses. At 30/60 the island starts paying attention —
        sieges are still coming (Phase 3), so build walls before you need them.
      </p>
      <div className="flex flex-col gap-1.5">
        {FACILITIES.map((f) => {
          const owned = base.facilities.includes(f.id);
          const afford = f.cost.every((c) => count(c.itemId) >= c.qty);
          return (
            <div key={f.id} className={`flex items-start justify-between gap-2 rounded border p-2 ${owned ? 'border-[#5aa469] bg-[#101812]' : 'border-[#232b36] bg-[#0b0e12]'}`}>
              <div>
                <div className="text-xs font-medium text-[#d7dde5]">{f.name}</div>
                <div className="text-[11px] text-[#8a94a3]">{f.desc}</div>
                {!owned && f.cost.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-[#8a94a3]">
                    Cost: {f.cost.map((c) => `${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId} (${count(c.itemId)})`).join(', ')}
                  </div>
                )}
              </div>
              {owned ? (
                <span className="shrink-0 text-[11px] text-[#5aa469]">Built</span>
              ) : (
                <button
                  onClick={() => { sfx.play('ui'); buildFacility(f.id); }}
                  disabled={!afford}
                  className="shrink-0 rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#e8b34b] transition-colors hover:border-[#e8b34b] disabled:opacity-40"
                >
                  Build
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LogTab() {
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

/* ---------------- SKILLS & CREW tab ---------------- */

const JOBS: SurvivorJob[] = ['Idle', 'Builder', 'Mechanic', 'Medic', 'Farmer', 'Scavenger', 'Guard', 'Operator'];

function SkillsTab() {
  const skills = useGameStore((s) => s.skills);
  const perkPoints = useGameStore((s) => s.perkPoints);
  const perks = useGameStore((s) => s.perks);
  const buyPerk = useGameStore((s) => s.buyPerk);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold text-[#8a94a3]">
          Skills <span className="text-[#e8b34b]">{perkPoints} perk point{perkPoints === 1 ? '' : 's'}</span>
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {SKILLS.map((sk) => {
            const st = skills[sk.id];
            const need = xpToNext(st.level);
            return (
              <div key={sk.id} className="rounded border border-[#232b36] bg-[#0b0e12] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#d7dde5]">{sk.name}</span>
                  <span className="font-mono text-xs text-[#e8b34b]">Lv {st.level}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-[#232b36]">
                  <div className="h-full bg-[#5aa469]" style={{ width: `${st.level >= 10 ? 100 : Math.round((st.xp / need) * 100)}%` }} />
                </div>
                <div className="mt-0.5 text-[10px] text-[#8a94a3]">
                  {st.level >= 10 ? 'maxed' : `${st.xp}/${need} xp`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {TREES.map((tree) => (
        <section key={tree.id}>
          <h3 className="mb-1 text-xs font-semibold text-[#8a94a3]">{tree.name}</h3>
          <p className="mb-2 text-[11px] text-[#8a94a3]">{tree.blurb}</p>
          <div className="flex flex-col gap-1.5">
            {PERKS.filter((p) => p.tree === tree.id).map((p) => {
              const owned = perks.includes(p.id);
              return (
                <div key={p.id} className={`flex items-start justify-between gap-2 rounded border p-2 ${owned ? 'border-[#5aa469] bg-[#101812]' : 'border-[#232b36] bg-[#0b0e12]'}`}>
                  <div>
                    <div className="text-xs font-medium text-[#d7dde5]">
                      {p.tier === 4 ? '★ ' : ''}{p.name} <span className="text-[10px] text-[#8a94a3]">T{p.tier}</span>
                    </div>
                    <div className="text-[11px] text-[#8a94a3]">{p.desc}</div>
                  </div>
                  {!owned && (
                    <button
                      onClick={() => { sfx.play('ui'); buyPerk(p.id); }}
                      className="shrink-0 rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#e8b34b] transition-colors hover:border-[#e8b34b]"
                    >
                      Learn (1)
                    </button>
                  )}
                  {owned && <span className="shrink-0 text-[11px] text-[#5aa469]">Learned</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}


    </div>
  );
}


/* ---------------- CREW (Team app) ---------------- */

function CrewSection() {
  const survivors = useGameStore((s) => s.survivors);
  const assignJob = useGameStore((s) => s.assignJob);
  return (
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Crew ({survivors.length})</h3>
        {survivors.length === 0 && (
          <p className="text-sm text-[#8a94a3]">Nobody yet. There are people out there — Elena at the lighthouse, Mateo near the relay, Lina in the dunes.</p>
        )}
        {survivors.map((sv) => (
          <div key={sv.id} className="mb-2 rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#d7dde5]">{sv.name}</span>
              <span className="text-[11px] text-[#8a94a3]">{sv.background} · {sv.age}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[#8a94a3]">
              {sv.traits.map(traitName).join(' · ') || 'No notable traits'} · HP {sv.hp}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] text-[#8a94a3]">Morale {sv.morale} ({moraleBand(sv.morale)})</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#232b36]">
                <div className={`h-full ${sv.morale >= 40 ? 'bg-[#5aa469]' : 'bg-[#d9534f]'}`} style={{ width: `${sv.morale}%` }} />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {JOBS.map((j) => (
                <button
                  key={j}
                  onClick={() => { sfx.play('ui'); assignJob(sv.id, j); }}
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${sv.job === j ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'}`}
                >
                  {j}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[#8a94a3]">
              Best: {Object.entries(sv.skills).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </div>
          </div>
        ))}
      </section>
  );
}

/* ---------------- CHARACTER app: vitals + skills/perks ---------------- */

function CharacterTab() {
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const stamina = useGameStore((s) => s.stamina);
  const maxStamina = useGameStore((s) => s.maxStamina);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const perks = useGameStore((s) => s.perks);
  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty, perks.includes('sc_packmule') ? 8 : 0);
  const tier = encumbranceTier(weight, limit);
  const armorPct = Math.min(
    50,
    Math.round(100 * inventory.reduce((a, i) => a + (ITEMS[i.itemId]?.armor ?? 0) * i.qty, 0)) +
      (perks.includes('br_thickskin') ? 5 : 0),
  );
  const bar = (v: number, max: number, color: string) => (
    <div className="h-2 flex-1 overflow-hidden rounded bg-[#232b36]">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
    </div>
  );
  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[#d7dde5]">Field status</span>
          <span className="text-[11px] text-[#8a94a3]">Day {daysElapsed + 1} · {DIFFICULTIES[difficulty].label}</span>
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-16 text-[#8a94a3]">Health</span>
            {bar(hp, maxHp, 'bg-[#d9534f]')}
            <span className="w-14 text-right font-mono text-[#d7dde5]">{Math.ceil(hp)}/{maxHp}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[#8a94a3]">Stamina</span>
            {bar(stamina, maxStamina, 'bg-[#5aa469]')}
            <span className="w-14 text-right font-mono text-[#d7dde5]">{Math.ceil(stamina)}/{maxStamina}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[#8a94a3]">Armor</span>
            <span className="text-[#d7dde5]">{armorPct}% damage reduction (worn + carried rated gear)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[#8a94a3]">Load</span>
            <span className={tier === 'ok' ? 'text-[#d7dde5]' : 'text-[#d9534f]'}>
              {weight.toFixed(1)} / {limit.toFixed(0)} kg{tier !== 'ok' ? ` — ${tier}` : ''}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#8a94a3]">
          Heal from the Pack (bandages, medkits). Rest at campfires or in a claimed base to recover.
        </p>
      </section>
      <SkillsTab />
    </div>
  );
}

/* ---------------- TEAM app ---------------- */

function TeamTab() {
  const base = useGameStore((s) => s.base);
  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <CrewSection />
      <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
        <h3 className="mb-1 text-xs font-semibold text-[#8a94a3]">Dispatch</h3>
        <p className="text-sm text-[#8a94a3]">
          {base
            ? 'Crew run their jobs at base each day. Sending equipped survivors out on vehicle expeditions is the next system on the board (P5) — gear, a vehicle, a task, and whatever they bring back. Or don\u2019t.'
            : 'Claim a home base (Shore Camp, Jonah\u2019s Camp, or the lighthouse) to give the crew a home to work from. Expedition dispatch — survivors out in vehicles with real gear — lands with the trailer & cargo pass.'}
        </p>
      </section>
    </div>
  );
}

/* ---------------- CRAFT app: the tree + weapon/clothing modification ---------------- */

function CraftTab() {
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const nearStation = useGameStore((s) => s.nearStation);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const attachMod = useGameStore((s) => s.attachMod);
  const detachMod = useGameStore((s) => s.detachMod);
  const countItem = (id: string) => inventory.reduce((a, i) => a + (i.itemId === id ? i.qty : 0), 0);
  const weapon = inventory.find((i) => i.uid === equipped.ranged);
  const weaponDef = weapon ? ITEMS[weapon.itemId] : undefined;
  const atBench = nearStation === 'workbench';
  const armorPieces = inventory.filter((i) => (ITEMS[i.itemId]?.armor ?? 0) > 0);

  const recipeRow = (r: (typeof FIELD_RECIPES)[string], lockedNote?: string) => {
    const can = !lockedNote && r.components.every((c) => countItem(c.itemId) >= c.qty);
    return (
      <div key={r.id} className={`flex items-center justify-between gap-2 text-sm ${lockedNote ? 'opacity-50' : ''}`}>
        <div className="min-w-0">
          <div className="text-[#d7dde5]">{r.name}</div>
          <div className="truncate text-[11px] text-[#8a94a3]">
            {lockedNote ??
              r.components
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
  };

  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Field craft — anywhere</h3>
        <div className="flex flex-col gap-1.5">
          {Object.values(FIELD_RECIPES).filter((r) => !r.station).map((r) => recipeRow(r))}
        </div>
      </section>
      {(['workbench', 'chemistry', 'industrial'] as const).map((st) => (
        <section key={st}>
          <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">
            {STATION_LABEL[st]}
            {nearStation === st && <span className="ml-1 text-[#e8b34b]">— in range</span>}
          </h3>
          <div className="flex flex-col gap-1.5">
            {Object.values(STATION_RECIPES)
              .filter((r) => r.station === st)
              .map((r) =>
                recipeRow(
                  r,
                  nearStation === st
                    ? undefined
                    : `Needs a ${STATION_LABEL[st]} — ${st === 'industrial' ? 'at the marina Machine Shop' : st === 'chemistry' ? 'one at the relay station' : 'at Jonah\u2019s camp or in town'}`,
                ),
              )}
          </div>
        </section>
      ))}

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Modify — weapon</h3>
        {!weapon || !weaponDef ? (
          <p className="text-sm text-[#8a94a3]">No ranged weapon equipped. Equip one from the Pack.</p>
        ) : !weaponDef.modSlots || weaponDef.modSlots.length === 0 ? (
          <p className="text-sm text-[#8a94a3]">{weaponDef.name} takes no attachments.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="text-sm text-[#d7dde5]">
              {weaponDef.name}
              {!atBench && <span className="ml-2 text-[11px] text-[#8a94a3]">fitting needs a Weapons Bench</span>}
            </div>
            {weaponDef.modSlots.map((slot) => {
              const attached = (weapon.mods ?? []).find((id) => MODS[id]?.slot === slot);
              return (
                <div key={slot} className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-[11px] uppercase tracking-wide text-[#8a94a3]">{slot}</span>
                  {attached ? (
                    <>
                      <span className="flex-1 text-[#d7dde5]">{MODS[attached]?.name ?? attached}</span>
                      {atBench && (
                        <button
                          onClick={() => { sfx.play('ui'); detachMod(weapon.uid, attached); }}
                          className="rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#d7dde5] hover:border-[#e8b34b]"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="flex-1 text-[11px] text-[#8a94a3]">empty</span>
                  )}
                </div>
              );
            })}
            {atBench &&
              inventory
                .filter((i) => i.itemId in MODS)
                .map((mi) => (
                  <button
                    key={mi.uid}
                    onClick={() => { sfx.play('ui'); attachMod(weapon.uid, mi.uid); }}
                    className="rounded border border-[#232b36] px-2 py-1 text-left text-xs text-[#e8b34b] hover:border-[#e8b34b]"
                  >
                    Fit {MODS[mi.itemId]?.name} ({MODS[mi.itemId]?.gunPartsCost} parts)
                  </button>
                ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Modify — clothing & armor</h3>
        {armorPieces.length === 0 ? (
          <p className="text-sm text-[#8a94a3]">No rated armor carried. Vests and helmets cut the damage you take, up to 50%.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {armorPieces.map((i) => (
              <div key={i.uid} className="flex items-center justify-between text-sm">
                <span className="text-[#d7dde5]">{ITEMS[i.itemId]?.name} ×{i.qty}</span>
                <span className="text-xs text-[#8a94a3]">{Math.round((ITEMS[i.itemId]?.armor ?? 0) * 100)}% each</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- VEHICLES app ---------------- */

function VehiclesTab() {
  const vehicle = useGameStore((s) => s.vehicle);
  const fleet = useGameStore((s) => s.fleet);
  const meter = (pct: number, color: string) => (
    <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#232b36]">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Current vehicle</h3>
        {vehicle ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-[#d7dde5]">{vehicle.name}</span>
              <span className="font-mono text-xs text-[#8a94a3]">{vehicle.speedKmh} km/h</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[#8a94a3]">Fuel</span>
              {meter(vehicle.fuelPct, 'bg-[#e8b34b]')}
              <span className="w-10 text-right font-mono text-[#d7dde5]">{vehicle.fuelPct}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[#8a94a3]">Condition</span>
              {meter(vehicle.condPct, vehicle.condPct > 40 ? 'bg-[#5aa469]' : 'bg-[#d9534f]')}
              <span className="w-10 text-right font-mono text-[#d7dde5]">{vehicle.condPct}%</span>
            </div>
            <p className="mt-1 text-[11px] text-[#8a94a3]">
              Storage: trunks and cargo beds land with the cargo pass (P3) — fuel cans ride in the Pack until then. Sleep-in-vehicle comes with the same pass.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#8a94a3]">On foot. Your fleet is listed below — walk up to one and drive.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Fleet ({fleet.length})</h3>
        <div className="flex flex-col gap-1.5">
          {fleet.map((f) => (
            <div key={f.defId} className="flex items-center justify-between rounded border border-[#232b36] bg-[#0b0e12] px-2.5 py-2 text-sm">
              <span className="text-[#d7dde5]">{f.name}</span>
              <span className="font-mono text-[11px] text-[#8a94a3]">
                {f.dist}m · fuel {f.fuelPct}% · cond {f.condPct}%
              </span>
            </div>
          ))}
          {fleet.length === 0 && <p className="text-sm text-[#8a94a3]">No vehicles found yet.</p>}
        </div>
      </section>
    </div>
  );
}

/* ---------------- HOME: the app grid ---------------- */

const APPS: { id: PhoneTab; glyph: string; label: string }[] = [
  { id: 'pack', glyph: '🎒', label: 'Pack' },
  { id: 'character', glyph: '🧍', label: 'Character' },
  { id: 'craft', glyph: '🛠️', label: 'Craft' },
  { id: 'world', glyph: '🗺️', label: 'Map' },
  { id: 'base', glyph: '🏠', label: 'Base' },
  { id: 'team', glyph: '👥', label: 'Team' },
  { id: 'vehicles', glyph: '🚙', label: 'Vehicles' },
  { id: 'log', glyph: '📋', label: 'Log' },
];

function HomeScreen() {
  const setPhoneTab = useGameStore((s) => s.setPhoneTab);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const vehicle = useGameStore((s) => s.vehicle);
  const nearStation = useGameStore((s) => s.nearStation);
  const survivors = useGameStore((s) => s.survivors);
  const base = useGameStore((s) => s.base);
  const badge = (id: PhoneTab): string | null => {
    if (id === 'vehicles' && vehicle) return vehicle.name;
    if (id === 'craft' && nearStation) return STATION_LABEL[nearStation];
    if (id === 'team' && survivors.length > 0) return `${survivors.length} crew`;
    if (id === 'base' && base) return 'claimed';
    return null;
  };
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-1 text-lg font-semibold text-[#d7dde5]">Day {daysElapsed + 1}</div>
      <div className="mb-4 text-xs text-[#8a94a3]">
        {vehicle ? `In the ${vehicle.name} · fuel ${vehicle.fuelPct}%` : 'On foot · Outer Banks relay in range'}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {APPS.map((a) => (
          <button
            key={a.id}
            onClick={() => { sfx.play('ui'); setPhoneTab(a.id); }}
            className="flex flex-col items-center gap-1"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2b3442] bg-gradient-to-b from-[#1b222c] to-[#12161c] text-[26px] shadow-inner transition-colors hover:border-[#e8b34b]">
              {a.glyph}
            </span>
            <span className="text-[10px] text-[#d7dde5]">{a.label}</span>
            {badge(a.id) && (
              <span className="max-w-[72px] truncate text-[9px] text-[#e8b34b]">{badge(a.id)}</span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-auto text-center text-[10px] text-[#5d6875]">
        Sat link encrypted · apps run offline-first
      </div>
    </div>
  );
}

/* ---------------- Phone shell: a device, mid-screen ---------------- */

const APP_TITLES: Record<PhoneTab, string> = {
  home: 'SAT PHONE',
  pack: 'Pack',
  character: 'Character',
  craft: 'Craft & Modify',
  world: 'Map',
  base: 'Base',
  team: 'Team',
  vehicles: 'Vehicles',
  log: 'Log',
};

export default function Phone() {
  const phoneOpen = useGameStore((s) => s.phoneOpen);
  const phoneTab = useGameStore((s) => s.phoneTab);
  const setPhoneTab = useGameStore((s) => s.setPhoneTab);
  const closePhone = useGameStore((s) => s.closePhone);
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const battery = useGameStore((s) => s.battery);

  if (!phoneOpen) return null;

  const hh = Math.floor(timeMinutes / 60) % 24;
  const mm = Math.floor(timeMinutes % 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      {/* scrim: tapping outside the device closes it */}
      <div className="absolute inset-0 bg-black/60" onClick={() => closePhone()} />
      {/* the device: rugged sat phone, bezel + notch + side buttons */}
      <div className="relative flex h-[min(780px,94dvh)] w-[400px] max-w-[94vw] flex-col rounded-[2.4rem] border border-[#2c333d] bg-[#08090b] p-2 shadow-[0_30px_80px_rgba(0,0,0,0.85)]">
        <div className="absolute -right-[3px] top-28 h-16 w-[3px] rounded bg-[#2c333d]" />
        <div className="absolute -left-[3px] top-24 h-10 w-[3px] rounded bg-[#2c333d]" />
        <div className="absolute -left-[3px] top-40 h-10 w-[3px] rounded bg-[#2c333d]" />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.9rem] bg-[#10141a]">
          {/* notch */}
          <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-[18px] w-24 -translate-x-1/2 rounded-full bg-black" />
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-2 text-[11px] text-[#aeb8c4]">
            <span className="font-mono">{clock}</span>
            <span className="flex items-center gap-2">
              <span className="tracking-widest text-[#5aa469]">SAT LINK</span>
              <span className="flex items-end gap-[2px]">
                <span className="w-[3px] rounded bg-[#5aa469]" style={{ height: 4 }} />
                <span className="w-[3px] rounded bg-[#5aa469]" style={{ height: 6 }} />
                <span className="w-[3px] rounded bg-[#5aa469]" style={{ height: 8 }} />
                <span className="w-[3px] rounded bg-[#39424e]" style={{ height: 10 }} />
              </span>
              <span className="flex items-center gap-1">
                <span className="flex h-[10px] w-[22px] items-center rounded-[3px] border border-[#5d6875] p-[1px]">
                  <span
                    className={`h-full rounded-[2px] ${battery > 25 ? 'bg-[#5aa469]' : 'bg-[#d9534f]'}`}
                    style={{ width: `${Math.max(4, Math.round(battery))}%` }}
                  />
                </span>
                <span className="font-mono">{Math.round(battery)}%</span>
              </span>
            </span>
          </div>
          {/* app header */}
          {phoneTab !== 'home' && (
            <header className="flex items-center justify-between border-b border-[#232b36] px-3 py-2">
              <button
                onClick={() => { sfx.play('ui'); setPhoneTab('home'); }}
                className="rounded px-2 py-1 text-sm text-[#8a94a3] transition-colors hover:text-[#e8b34b]"
              >
                ‹ Apps
              </button>
              <div className="text-sm font-semibold text-[#d7dde5]">{APP_TITLES[phoneTab]}</div>
              <button
                onClick={() => { sfx.play('ui'); closePhone(); }}
                aria-label="Close phone"
                className="rounded px-2 py-1 text-sm text-[#8a94a3] transition-colors hover:text-[#e8b34b]"
              >
                ✕
              </button>
            </header>
          )}
          {phoneTab === 'home' && (
            <header className="flex items-center justify-between px-4 pb-1 pt-1">
              <div className="text-[11px] font-semibold tracking-widest text-[#8a94a3]">SAT PHONE</div>
              <button
                onClick={() => { sfx.play('ui'); closePhone(); }}
                aria-label="Close phone"
                className="rounded px-2 py-0.5 text-sm text-[#8a94a3] transition-colors hover:text-[#e8b34b]"
              >
                ✕
              </button>
            </header>
          )}
          {/* app body */}
          <div className="min-h-0 flex-1 p-3">
            {phoneTab === 'home' && <HomeScreen />}
            {phoneTab === 'pack' && <LoadoutTab />}
            {phoneTab === 'character' && <CharacterTab />}
            {phoneTab === 'craft' && <CraftTab />}
            {phoneTab === 'world' && <WorldMap />}
            {phoneTab === 'base' && (
              <div className="nomad-scroll h-full overflow-y-auto">
                <BaseSection />
              </div>
            )}
            {phoneTab === 'team' && <TeamTab />}
            {phoneTab === 'vehicles' && <VehiclesTab />}
            {phoneTab === 'log' && <LogTab />}
          </div>
          {/* home indicator */}
          <div className="mx-auto mb-1.5 mt-1 h-1 w-24 shrink-0 rounded bg-[#39424e]" />
        </div>
      </div>
    </div>
  );
}
