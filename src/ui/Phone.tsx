import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { FINISHES, MODS } from '../data/mods';
import { QUESTS } from '../data/quests';
import { FACTIONS, repTier } from '../data/factions';
import { SKILLS, TREES, PERKS, xpToNext } from '../data/skills';
import { traitName, moraleBand, type SurvivorJob } from '../data/survivors';
import { FACILITIES, baseHeat, heatBand, buildMinutes } from '../data/base';
import { poiName } from '../data/dispatch';
import { UPGRADES, canInstallUpgrade } from '../data/upgrades';
import { carParams, estimatePerformance, UPGRADE_MASS_KG } from '../game/carSpec';
import { VEHICLE_DEFS } from '../game/Vehicles';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import { packGridDims, canPlace, layoutItems } from '../store/gridUtils';
import GridInventory from './GridInventory';
import { DIFFICULTIES, HAIR_COLORS, SKIN_TONES } from '../store/types';
import type { BuildType, HairStyle } from '../store/types';
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

/** Absolute game minutes -> "Day 3 · 14:20". */
function fmtAbs(absMin: number): string {
  const day = Math.floor(absMin / 1440) + 1;
  const m = Math.floor(absMin % 1440);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
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
  const hotbar = useGameStore((s) => s.hotbar);
  const useHotbar = useGameStore((s) => s.useHotbar);
  const assignHotbar = useGameStore((s) => s.assignHotbar);
  const moveInvItem = useGameStore((s) => s.moveInvItem);
  const arrangeInventory = useGameStore((s) => s.arrangeInventory);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string>('all');

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

      {/* inventory — wave 3: the true grid. Drag to move, R or double-tap
          rotates, red frame = illegal spot. Search/chips dim non-matches. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pack…"
            aria-label="Search inventory"
            className="min-w-0 flex-1 rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1 text-xs text-[#d7dde5] placeholder:text-[#8a94a3] focus:border-[#e8b34b] focus:outline-none"
          />
          <button
            onClick={() => { sfx.play('ui'); arrangeInventory('size'); }}
            className="shrink-0 rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#d7dde5] hover:border-[#e8b34b]"
          >
            Auto-arrange
          </button>
          <button
            onClick={() => { sfx.play('ui'); arrangeInventory('category'); }}
            className="shrink-0 rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#d7dde5] hover:border-[#e8b34b]"
          >
            Sort
          </button>
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {['all', ...new Set(inventory.map((i) => ITEMS[i.itemId]?.category ?? ''))].map((c) => (
            <button
              key={c}
              onClick={() => { sfx.play('ui'); setChip(c); }}
              className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${
                chip === c ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'
              }`}
            >
              {c === 'all' ? 'All' : c.replace('weapon-', '')}
            </button>
          ))}
        </div>
        {/* quick-use row 1-4 */}
        <div className="mb-1.5 flex gap-1.5">
          {hotbar.map((uid, i) => {
            const it = uid ? inventory.find((x) => x.uid === uid) : undefined;
            return (
              <button
                key={i}
                onClick={() => { if (it) { sfx.play('ui'); useHotbar(i); } }}
                className="flex-1 truncate rounded border border-[#232b36] bg-[#0b0e12] px-1.5 py-1 text-left text-[10px] text-[#d7dde5]"
                aria-label={`Quick slot ${i + 1}`}
              >
                <span className="mr-1 font-mono text-[#8a94a3]">{i + 1}</span>
                {it ? ITEMS[it.itemId]?.name : '—'}
              </button>
            );
          })}
        </div>
        <div className="nomad-scroll min-h-0 flex-1 overflow-y-auto">
          {inventory.length === 0 ? (
            <p className="p-3 text-sm text-[#8a94a3]">Nothing carried.</p>
          ) : (
            <GridInventory
              items={inventory}
              cols={packGridDims(equipped.pack ? inventory.find((i) => i.uid === equipped.pack)?.itemId : null).cols}
              rows={packGridDims(equipped.pack ? inventory.find((i) => i.uid === equipped.pack)?.itemId : null).rows}
              cell={40}
              selectedUid={selected}
              onSelect={setSelected}
              onMove={moveInvItem}
              equippedUids={new Set(equippedUids.filter((u): u is string => !!u))}
              dimmedUids={
                query.trim() || chip !== 'all'
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
                  : undefined
              }
            />
          )}
          <p className="mt-1 text-[10px] text-[#5a6472]">Drag to move · R / double-tap rotates · red frame = no fit</p>
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
          {(selDef.category === 'weapon-ranged' || selDef.category === 'weapon-melee' || sel.condition !== undefined) && (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] text-[#8a94a3]">Condition</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#232b36]">
                <div
                  className={`h-full ${(sel.condition ?? 100) < 30 ? 'bg-[#d9534f]' : (sel.condition ?? 100) < 60 ? 'bg-[#e8b34b]' : 'bg-[#7fb069]'}`}
                  style={{ width: `${Math.round(sel.condition ?? 100)}%` }}
                />
              </div>
              <span className={`font-mono text-[11px] ${(sel.condition ?? 100) < 30 ? 'text-[#d9534f]' : 'text-[#d7dde5]'}`}>
                {Math.round(sel.condition ?? 100)}%{sel.jammed ? ' · JAM' : ''}
              </span>
            </div>
          )}
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
            {act('Rotate', () => {
              const dims = packGridDims(equipped.pack ? inventory.find((i) => i.uid === equipped.pack)?.itemId : null);
              const lay = layoutItems(inventory, dims.cols, dims.rows);
              const p = lay.placed.get(sel.uid);
              if (!p) return;
              const byUid = new Map(inventory.map((i) => [i.uid, i]));
              if (canPlace(lay.placed, byUid, sel.uid, p.gx, p.gy, !p.rot, dims.cols, dims.rows)) {
                moveInvItem(sel.uid, p.gx, p.gy, !p.rot);
              }
            })}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px] text-[#8a94a3]">Quick slot:</span>
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                onClick={() => {
                  sfx.play('ui');
                  assignHotbar(i, sel.uid);
                  useGameStore.getState().addToast(`${selDef.name} → quick slot ${i + 1}.`);
                }}
                aria-label={`Assign to quick slot ${i + 1}`}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                  hotbar[i] === sel.uid ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#d7dde5]'
                }`}
              >
                {i + 1}
              </button>
            ))}
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
  const scouted = useGameStore((s) => s.scouted);

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

    // POIs — wave 3: scouted POIs get a ring: gold = rich pickings,
    // orange = picked over, gray = picked clean (from the Scout census)
    ctx.font = '8px sans-serif';
    for (const [id, [x, z]] of Object.entries(st.poiPositions)) {
      if (id.startsWith('npc:')) continue; // NPCs drawn via their POI
      const [px, py] = toPx(x, z);
      const scout = st.scouted[id];
      if (scout) {
        ctx.strokeStyle =
          scout.containers === 0 || scout.looted >= scout.containers
            ? 'rgba(138,148,163,0.9)'
            : scout.looted / scout.containers > 0.5
              ? 'rgba(217,131,79,0.95)'
              : 'rgba(232,179,75,0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#d7dde5';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      ctx.fillStyle = 'rgba(215,221,229,0.85)';
      ctx.fillText(id.replace(/_/g, ' '), px + 4, py + 3);
    }

    // SAT UPLINK: the relay feeds live tracking — the car as an amber diamond
    if (st.flags['sat_uplink']) {
      ctx.font = '7px sans-serif';
      for (const v of g.vehicles.vehicles) {
        const [px, py] = toPx(v.group.position.x, v.group.position.z);
        ctx.fillStyle = '#e8b34b';
        ctx.beginPath();
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px + 3, py);
        ctx.lineTo(px, py + 3);
        ctx.lineTo(px - 3, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(232,179,75,0.85)';
        ctx.fillText(v.def.name, px + 4, py + 2);
      }
    }

    // quest target marker    }

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
  }, [poiPositions, pos, quests, scouted]);

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
        Amber ring marks your current objective. The triangle is you. Scouted places get a ring too:
        gold is rich, orange is picked over, gray is picked clean.
        {useGameStore((s) => s.flags)['sat_uplink'] && (
          <span className="text-[#57c7d4]"> SAT UPLINK LIVE — the car is tracked as an amber diamond.</span>
        )}
      </p>
    </div>
  );
}

/* ---------------- COMMAND tab ---------------- */

/**
 * MERGE SLOT — Lane 10 BasePanel (src/ui/BasePanel.tsx on lane/base,
 * default export). At merge, mount it in place of this section:
 *   import BasePanel from './BasePanel';
 *   <BasePanel {...props} />
 * BasePanel is PROPS-DRIVEN (BasePanelProps in its header): summary /
 * facilities / buildMenu / stockpile / survivors / board / garage view
 * models come from Lane 10's systems/baseClaims.ts functions over the
 * store's `claims` + `moraleRuntime` state (Lane 5 contract) — the
 * wiring builds those props at this call site. The legacy section below
 * (single `base` + flat facilities) is the pre-merge fallback.
 */
function BaseSection() {
  const base = useGameStore((s) => s.base);
  const buildFacility = useGameStore((s) => s.buildFacility);
  const cancelBuild = useGameStore((s) => s.cancelBuild);
  const baseQueue = useGameStore((s) => s.baseQueue);
  const inventory = useGameStore((s) => s.inventory);
  const survivors = useGameStore((s) => s.survivors);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const fleet = useGameStore((s) => s.fleet);

  if (!base) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Base</h3>
        <p className="text-sm text-[#8a94a3]">
          No home base. The island's other camps are rubble now — the one claim post still standing
          is at the Lighthouse Grounds. A base produces daily and gives your crew somewhere to be.
        </p>
      </section>
    );
  }
  const heat = baseHeat(base.facilities, survivors.length, daysElapsed);
  const count = (id: string) => inventory.filter((i) => i.itemId === id).reduce((a, i) => a + i.qty, 0);
  const now = daysElapsed * 1440 + timeMinutes;
  const stockRows = fleet.map((f) => ({ name: f.name, used: f.storageUsedKg, cap: f.storageCapKg, where: f.loc }));
  const stockUsed = stockRows.reduce((a, r) => a + r.used, 0);
  const stockCap = stockRows.reduce((a, r) => a + r.cap, 0);
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
          const queued = baseQueue.find((q) => q.facilityId === f.id);
          const afford = f.cost.every((c) => count(c.itemId) >= c.qty);
          const mins = buildMinutes(f);
          return (
            <div key={f.id} className={`flex items-start justify-between gap-2 rounded border p-2 ${owned ? 'border-[#5aa469] bg-[#101812]' : queued ? 'border-[#e8b34b] bg-[#12161c]' : 'border-[#232b36] bg-[#0b0e12]'}`}>
              <div>
                <div className="text-xs font-medium text-[#d7dde5]">{f.name}</div>
                <div className="text-[11px] text-[#8a94a3]">{f.desc}</div>
                {!owned && !queued && f.cost.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-[#8a94a3]">
                    Cost: {f.cost.map((c) => `${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId} (${count(c.itemId)})`).join(', ')}
                    {' · '}builds in ~{Math.round(mins / 60 * 10) / 10}h
                  </div>
                )}
                {queued && (
                  <div className="mt-0.5 text-[11px] text-[#e8b34b]">
                    Under construction — ready {fmtAbs(queued.readyMin)} ({Math.max(1, Math.round(queued.readyMin - now))} min left)
                  </div>
                )}
              </div>
              {owned ? (
                <span className="shrink-0 text-[11px] text-[#5aa469]">Built</span>
              ) : queued ? (
                <button
                  onClick={() => { sfx.play('ui'); cancelBuild(f.id); }}
                  className="shrink-0 rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#d9534f] transition-colors hover:border-[#d9534f]"
                >
                  Cancel
                </button>
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

      {/* stockpile overview: the base has no shelves of its own yet — its
          stockpile is everything riding in the fleet, wherever it's parked */}
      <h4 className="mb-1.5 mt-4 text-xs font-semibold text-[#8a94a3]">
        Stockpile — the car\u2019s trunk ({stockUsed.toFixed(0)}/{stockCap} kg riding)
      </h4>
      {stockRows.length === 0 && <p className="text-[11px] text-[#8a94a3]">Nothing stashed — the stockpile is the Mustang\u2019s trunk, wherever it\u2019s parked.</p>}
      <div className="flex flex-col gap-1">
        {stockRows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[#d7dde5]">{r.name} <span className="text-[#8a94a3]">· {r.where}</span></span>
            <span className="font-mono text-[#8a94a3]">{r.used.toFixed(0)}/{r.cap} kg</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-[#5a6472]">The base keeps no shelves of its own yet — what the Mustang carries is the stockpile, and heat counts it.</p>
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
  const journal = useGameStore((s) => s.journal);
  const canSave = DIFFICULTIES[difficulty].saveAnywhere;

  const auto = saveSlots.find((m) => m.slot === 'auto');

  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      {/* journal — dispatch reports + the day's record (wave 3) */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Journal</h3>
        {journal.length === 0 && (
          <p className="text-sm text-[#8a94a3]">Nothing written yet. Dispatch reports and each day's record land here.</p>
        )}
        {journal.map((e) => (
          <div key={e.id} className="mb-2 rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-[#d7dde5]">{e.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-[#8a94a3]">{fmtAbs(e.atMin)}</span>
            </div>
            {e.lines.map((ln, i) => (
              <p key={i} className="mt-0.5 text-xs leading-relaxed text-[#8a94a3]">{ln}</p>
            ))}
          </div>
        ))}
      </section>

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
            className={`h-full rounded ${battery > 25 ? 'bg-[#5aa469]' : 'bg-[#d9534f]'}`}
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
  const dispatches = useGameStore((s) => s.dispatches);
  return (
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Crew ({survivors.length})</h3>
        {survivors.length === 0 && (
          <p className="text-sm text-[#8a94a3]">Nobody yet. There are people out there — Elena at the lighthouse, Mateo near the relay, Lina in the dunes.</p>
        )}
        {survivors.map((sv) => {
          const out = dispatches.find((d) => d.survivorId === sv.id);
          return (
          <div key={sv.id} className="mb-2 rounded border border-[#232b36] bg-[#0b0e12] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#d7dde5]">{sv.name}</span>
              <span className="text-[11px] text-[#8a94a3]">{sv.background} · {sv.age}</span>
            </div>
            {out && (
              <div className="mt-1 rounded border border-[#e8b34b]/50 bg-[#e8b34b]/10 px-2 py-1 text-[11px] text-[#e8b34b]">
                Out — {out.task} run to {poiName(out.destPoiId)} · back {fmtAbs(out.etaMin)}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-[#8a94a3]">
              {sv.traits.map(traitName).join(' · ') || 'No notable traits'} · HP {Math.round(sv.hp)}
              {sv.status !== 'healthy' ? ` · ${sv.status}` : ''}
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
                  disabled={!!out}
                  onClick={() => { sfx.play('ui'); assignJob(sv.id, j); }}
                  className={`rounded border px-1.5 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${sv.job === j ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#8a94a3]'}`}
                >
                  {j}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[#8a94a3]">
              Best: {Object.entries(sv.skills).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </div>
          </div>
          );
        })}
      </section>
  );
}

/* ---------------- CHARACTER app: vitals + skills/perks ---------------- */

function CharacterTab() {
  const appearance = useGameStore((s) => s.appearance);
  const setAppearance = useGameStore((s) => s.setAppearance);
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const stamina = useGameStore((s) => s.stamina);
  const maxStamina = useGameStore((s) => s.maxStamina);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const perks = useGameStore((s) => s.perks);
  const survivors = useGameStore((s) => s.survivors);
  const useItemUid = useGameStore((s) => s.useItemUid);
  const treatSurvivor = useGameStore((s) => s.treatSurvivor);
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

      {/* wave 4: appearance — the figure in the world IS this, driver included */}
      <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Appearance</h3>
        <div className="flex flex-col gap-2.5 text-xs">
          <div>
            <div className="mb-1 text-[11px] text-[#8a94a3]">Skin tone</div>
            <div className="flex gap-1.5">
              {SKIN_TONES.map((c, i) => (
                <button
                  key={i}
                  aria-label={`Skin tone ${i + 1}`}
                  onClick={() => setAppearance({ skinTone: i })}
                  className={`h-6 w-6 rounded-full border-2 ${appearance.skinTone === i ? 'border-[#e8b34b]' : 'border-[#232b36]'}`}
                  style={{ backgroundColor: `#${c.toString(16).padStart(6, '0')}` }}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-[#8a94a3]">Hair</div>
            <div className="flex flex-wrap gap-1.5">
              {(['crop', 'long', 'hawk', 'bald'] as HairStyle[]).map((h) => (
                <button
                  key={h}
                  onClick={() => setAppearance({ hairStyle: h })}
                  className={`rounded border px-2 py-1 text-[11px] capitalize ${appearance.hairStyle === h ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#d7dde5]'}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {HAIR_COLORS.map((c, i) => (
                <button
                  key={i}
                  aria-label={`Hair color ${i + 1}`}
                  onClick={() => setAppearance({ hairColor: i })}
                  className={`h-5 w-5 rounded border-2 ${appearance.hairColor === i ? 'border-[#e8b34b]' : 'border-[#232b36]'}`}
                  style={{ backgroundColor: `#${c.toString(16).padStart(6, '0')}` }}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-[#8a94a3]">Build</div>
            <div className="flex gap-1.5">
              {(['slim', 'standard', 'heavy'] as BuildType[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setAppearance({ build: b })}
                  className={`rounded border px-2 py-1 text-[11px] capitalize ${appearance.build === b ? 'border-[#e8b34b] text-[#e8b34b]' : 'border-[#232b36] text-[#d7dde5]'}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#8a94a3]">
          Worn gear shows on the figure: your pack rides your back, a carried vest bulks the torso,
          a riot helmet sits on the head — in third person and in the driver's seat alike.
        </p>
      </section>

      {/* wave 3: treatment — work on yourself or the crew, straight from the pack */}
      <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Treatment</h3>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-[#8a94a3]">You</span>
          <span className={hp >= 90 ? 'text-[#5aa469]' : hp >= 55 ? 'text-[#e8b34b]' : hp >= 25 ? 'text-[#d9534f]' : 'text-[#d9534f]'}>
            {hp >= 90 ? 'Uninjured' : hp >= 55 ? 'Hurt' : hp >= 25 ? 'Badly hurt' : 'Critical'} · {Math.ceil(hp)}/{maxHp}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {inventory.filter((i) => (ITEMS[i.itemId]?.heal ?? 0) > 0 || ITEMS[i.itemId]?.category === 'food').length === 0 && (
            <span className="text-[11px] text-[#8a94a3]">Nothing in the pack to treat or eat.</span>
          )}
          {inventory
            .filter((i) => (ITEMS[i.itemId]?.heal ?? 0) > 0 || ITEMS[i.itemId]?.category === 'food')
            .map((i) => {
              const def = ITEMS[i.itemId];
              return (
                <button
                  key={i.uid}
                  onClick={() => { sfx.play('ui'); useItemUid(i.uid); }}
                  className="rounded border border-[#232b36] px-2 py-1 text-[11px] text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                >
                  {def?.name} ×{i.qty}
                  {def?.heal ? <span className="text-[#5aa469]"> +{def.heal} HP</span> : ''}
                </button>
              );
            })}
        </div>
        {survivors.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-[#232b36] pt-2">
            {survivors.map((sv) => {
              const max = sv.traits.includes('tough') ? 130 : 100;
              return (
                <div key={sv.id} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-[#d7dde5]">{sv.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#232b36]">
                    <div className={`h-full ${sv.hp >= 60 ? 'bg-[#5aa469]' : 'bg-[#d9534f]'}`} style={{ width: `${Math.min(100, (sv.hp / max) * 100)}%` }} />
                  </div>
                  <span className="w-16 font-mono text-[11px] text-[#8a94a3]">{Math.round(sv.hp)}/{max}{sv.status !== 'healthy' ? ` ${sv.status}` : ''}</span>
                  <button
                    onClick={() => { sfx.play('ui'); treatSurvivor(sv.id); }}
                    className="shrink-0 rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                  >
                    Treat
                  </button>
                </div>
              );
            })}
            <p className="text-[10px] text-[#5a6472]">Treatment draws bandages/med kits from your pack. An infirmary at base heals the crew daily.</p>
          </div>
        )}
      </section>
      {/* MERGE SLOT — Lane 8 SkillsPanel (src/ui/SkillsPanel.tsx on
          lane/skills, default export, store-driven, no props). At merge:
          import SkillsPanel from './SkillsPanel'; and render
          <SkillsPanel /> here — the full §6.2 surface (tier chains,
          capstone exclusivity, engine lock reasons). The compact
          SkillsTab above stays as the summary strip per Lane 8's plan.
          Its LightIndicator named export is Lane 11's HUD piece, fed by
          the store's `visibility` flag (Lane 5 contract). */}
      <SkillsTab />
    </div>
  );
}

/* ---------------- TEAM app ---------------- */

function DispatchSection() {
  const survivors = useGameStore((s) => s.survivors);
  const dispatches = useGameStore((s) => s.dispatches);
  const recallDispatch = useGameStore((s) => s.recallDispatch);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const now = daysElapsed * 1440 + timeMinutes;

  return (
    <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
      <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Dispatch — crew runs</h3>
      <p className="text-sm text-[#8a94a3]">
        Dispatch is offline. There is exactly one car left on the island — the Stallion FX — and it
        goes where its driver takes it. Crew runs return when there's a fleet to send.
      </p>
      {dispatches.map((d) => {
        const who = survivors.find((x) => x.id === d.survivorId);
        const pct = Math.max(0, Math.min(100, Math.round(((now - d.departMin) / Math.max(1, d.etaMin - d.departMin)) * 100)));
        return (
          <div key={d.id} className="mb-2 mt-2 rounded border border-[#232b36] bg-[#12161c] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#d7dde5]">
                {who?.name ?? 'Crew'} — {d.task} · {poiName(d.destPoiId)} (sent before the purge)
              </span>
              <button
                onClick={() => { sfx.play('ui'); recallDispatch(d.id); }}
                className="shrink-0 rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#d9534f] hover:border-[#d9534f]"
              >
                Recall
              </button>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[#232b36]">
              <div className="h-full bg-[#e8b34b]" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-[#8a94a3]">Back {fmtAbs(d.etaMin)} · {d.distM} m each way</div>
          </div>
        );
      })}
    </section>
  );
}

function TeamTab() {
  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <CrewSection />
      {/* MERGE SLOT — Lane 13 DispatchPanel (src/ui/DispatchPanel.tsx on
          lane/dispatch, default export, self-contained, no props). At
          merge: import DispatchPanel from './DispatchPanel'; render
          <DispatchPanel /> here and DELETE DispatchSection below —
          including its "Dispatch is offline" copy. The panel plans by
          vehicle instance id; FleetEntry.instanceId + the instance-keyed
          startDispatch overload land with the same merge step. */}
      <DispatchSection />
    </div>
  );
}

/* ---------------- CRAFT app: the tree + weapon/clothing modification ---------------- */

/** Wave 4: finish kits at the bench — shows the weapon's current coat and
 *  a button per kit in the pack. The kit is consumed on application. */
function FinishRow({ weaponUid, current }: { weaponUid: string; current?: string }) {
  const inventory = useGameStore((s) => s.inventory);
  const nearStation = useGameStore((s) => s.nearStation);
  const applyFinish = useGameStore((s) => s.applyFinish);
  const atBench = nearStation === 'workbench';
  const kits = inventory.filter((i) => i.itemId in FINISHES);
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-[#232b36] pt-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-24 text-[11px] uppercase tracking-wide text-[#8a94a3]">finish</span>
        <span className="flex-1 text-[#d7dde5]">
          {current ? (FINISHES[current]?.name ?? current) : 'Factory / field-worn'}
        </span>
      </div>
      {atBench && kits.length === 0 && (
        <span className="text-[11px] text-[#8a94a3]">No finish kits carried — they turn up in town and on the carrier.</span>
      )}
      {atBench &&
        kits.map((k) => (
          <button
            key={k.uid}
            disabled={current === k.itemId}
            onClick={() => { sfx.play('ui'); applyFinish(weaponUid, k.uid); }}
            className="rounded border border-[#232b36] px-2 py-1 text-left text-xs text-[#e8b34b] hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply {FINISHES[k.itemId]?.name} (uses the kit)
          </button>
        ))}
    </div>
  );
}

/**
 * MERGE SLOT — Lane 7 CraftPanel (src/ui/CraftPanel.tsx on lane/crafting).
 * At merge, replace this tab's body with the panel:
 *   import { CraftPanel } from './CraftPanel';
 *   function CraftTab() { return <CraftPanel />; }
 * CraftPanel is self-contained (timed queue via systems/crafting +
 * craftQueue persistence through gameStore's craftQueueBridge) and is a
 * drop-in per its file header. The hand-rolled instant-craft body below
 * is the pre-merge fallback — delete it at the swap.
 */
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
  const meleeWeapon = inventory.find((i) => i.uid === equipped.melee);
  const meleeDef = meleeWeapon ? ITEMS[meleeWeapon.itemId] : undefined;
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
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-[#8a94a3]">{weaponDef.name} takes no attachments — but it takes a finish.</p>
            <FinishRow weaponUid={weapon.uid} current={weapon.finish} />
          </div>
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
            <FinishRow weaponUid={weapon.uid} current={weapon.finish} />
          </div>
        )}
        {meleeWeapon && meleeDef && (
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="text-sm text-[#d7dde5]">{meleeDef.name} <span className="text-[11px] text-[#8a94a3]">(melee)</span></div>
            <FinishRow weaponUid={meleeWeapon.uid} current={meleeWeapon.finish} />
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
  const dispatches = useGameStore((s) => s.dispatches);
  const survivors = useGameStore((s) => s.survivors);
  const inventory = useGameStore((s) => s.inventory);
  const repairVehicle = useGameStore((s) => s.repairVehicle);
  const installUpgrade = useGameStore((s) => s.installUpgrade);
  const atWorkshopFn = useGameStore((s) => s.atWorkshop);
  const [selId, setSelId] = useState<string | null>(null);
  const atShop = atWorkshopFn();
  const sel = fleet.find((f) => f.defId === (selId ?? vehicle?.uid)) ?? fleet[0];
  const count = (itemId: string) => inventory.reduce((n, i) => n + (i.itemId === itemId ? i.qty : 0), 0);
  const afford = (cost: { itemId: string; qty: number }[]) => cost.every((c) => count(c.itemId) >= c.qty);
  const meter = (pct: number, color: string) => (
    <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#232b36]">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
  const costLine = (cost: { itemId: string; qty: number }[]) => (
    <span className="font-mono text-[11px] text-[#8a94a3]">
      {cost.map((c) => (
        <span key={c.itemId} className={count(c.itemId) >= c.qty ? 'text-[#5aa469]' : 'text-[#d9534f]'}>
          {ITEMS[c.itemId]?.name ?? c.itemId} {count(c.itemId)}/{c.qty}{'  '}
        </span>
      ))}
    </span>
  );
  const btn = 'shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#232b36]';

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
              {meter(Math.round(vehicle.fuelPct * 100), 'bg-[#e8b34b]')}
              <span className="w-10 text-right font-mono text-[#d7dde5]">{Math.round(vehicle.fuelPct * 100)}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[#8a94a3]">Condition</span>
              {meter(Math.round(vehicle.condPct * 100), vehicle.condPct > 0.4 ? 'bg-[#5aa469]' : 'bg-[#d9534f]')}
              <span className="w-10 text-right font-mono text-[#d7dde5]">{Math.round(vehicle.condPct * 100)}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 text-[#8a94a3]">Storage</span>
              {meter(vehicle.storageCapKg ? (vehicle.storageUsedKg / vehicle.storageCapKg) * 100 : 0, 'bg-[#5a7a9e]')}
              <span className="w-10 text-right font-mono text-[#d7dde5]">{vehicle.storageUsedKg}/{vehicle.storageCapKg}kg</span>
            </div>
            {vehicle.tiresFlat > 0 && (
              <p className="text-xs text-[#d9534f]">⚠ {vehicle.tiresFlat} flat tire{vehicle.tiresFlat > 1 ? 's' : ''} — she pulls and drags. Repair below.</p>
            )}
            <p className="mt-1 text-[11px] text-[#8a94a3]">
              [T] opens the trunk.
              {vehicle.upgrades.length > 0 && <> Fitted: {vehicle.upgrades.map((u) => UPGRADES.find((x) => x.id === u)?.name ?? u).join(', ')}.</>}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#8a94a3]">On foot. The car is listed below — walk up to it and drive.</p>
        )}
      </section>

      {/* wave 3: fleet-wide summary + one-tap scrap repair for everything in reach */}
      {fleet.length > 0 && (
        <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
          <h3 className="mb-1.5 text-xs font-semibold text-[#8a94a3]">Fleet summary</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8a94a3]">
            <span><span className="text-[#d7dde5]">{fleet.length}</span> vehicles</span>
            <span>avg condition <span className="text-[#d7dde5]">{Math.round(fleet.reduce((a, f) => a + f.condPct, 0) / fleet.length)}%</span></span>
            <span><span className="text-[#d7dde5]">{fleet.reduce((a, f) => a + f.upgrades.length, 0)}</span> upgrades fitted</span>
            <span>cargo <span className="text-[#d7dde5]">{fleet.reduce((a, f) => a + f.storageUsedKg, 0).toFixed(0)}/{fleet.reduce((a, f) => a + f.storageCapKg, 0)} kg</span></span>
            <span><span className={fleet.some((f) => f.condPct < 60 || f.tiresFlat > 0) ? 'text-[#d9534f]' : 'text-[#d7dde5]'}>{fleet.filter((f) => f.condPct < 60 || f.tiresFlat > 0).length}</span> need work</span>
            <span><span className="text-[#d7dde5]">{dispatches.length}</span> out on dispatch</span>
          </div>
          <button
            className={`${btn} mt-2`}
            disabled={!fleet.some((f) => f.dist <= 9 && f.condPct < 100) || count('scrap') < 1}
            onClick={() => {
              sfx.play('ui');
              // scrap-patch every vehicle in reach toward 100%, one scrap
              // per call, until the pile or the damage runs out
              for (let i = 0; i < 40; i++) {
                const st = useGameStore.getState();
                const target = st.fleet.find((f) => f.dist <= 9 && f.condPct < 100);
                if (!target || st.countItem('scrap') < 1) break;
                st.repairVehicle(target.defId, 'scrap');
              }
            }}
          >
            Repair all in reach (scrap patches)
          </button>
          <span className="ml-2 text-[10px] text-[#5a6472]">Flats, engines and batteries are per-vehicle jobs, below.</span>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">The car — tap it to work on it</h3>
        <div className="flex flex-col gap-1.5">
          {fleet.map((f) => {
            const out = dispatches.find((d) => d.vehicleDefId === f.defId);
            const outWho = out ? survivors.find((x) => x.id === out.survivorId) : undefined;
            return (
            <button
              key={f.defId}
              onClick={() => setSelId(f.defId)}
              className={`rounded border px-2.5 py-2 text-left text-sm ${sel?.defId === f.defId ? 'border-[#e8b34b] bg-[#12161c]' : 'border-[#232b36] bg-[#0b0e12]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#d7dde5]">{f.name}</span>
                <span className="font-mono text-[11px] text-[#8a94a3]">{f.dist}m</span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-[#8a94a3]">
                fuel {f.fuelPct}% · cond {f.condPct}% · cargo {f.storageUsedKg}/{f.storageCapKg}kg
                {f.tiresFlat > 0 && <span className="text-[#d9534f]"> · ⚠ {f.tiresFlat} flat</span>}
                {f.upgrades.length > 0 && <> · {f.upgrades.length} upgrade{f.upgrades.length > 1 ? 's' : ''}</>}
                {' '}· {f.loc}
              </div>
              {out && (
                <div className="mt-0.5 text-[11px] text-[#e8b34b]">
                  Out — {out.task} to {poiName(out.destPoiId)} with {outWho?.name ?? 'crew'} · back {fmtAbs(out.etaMin)}
                </div>
              )}
            </button>
            );
          })}
          {fleet.length === 0 && <p className="text-sm text-[#8a94a3]">No car found — it should be parked by the lighthouse.</p>}
        </div>
      </section>

      {sel && (
        <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
          <h3 className="mb-1 text-xs font-semibold text-[#8a94a3]">Work on the {sel.name} {sel.dist > 9 && <span className="text-[#d9534f]">(too far — {sel.dist}m)</span>}</h3>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button className={btn} disabled={sel.tiresFlat <= 0 || sel.dist > 9} onClick={() => repairVehicle(sel.defId, 'tire')}>
              Swap flat (1× Tire)
            </button>
            <button className={btn} disabled={sel.dist > 9 || count('engine_part') < 1} onClick={() => repairVehicle(sel.defId, 'engine')}>
              Engine work (1× Engine part)
            </button>
            <button className={btn} disabled={sel.dist > 9 || count('car_battery') < 1} onClick={() => repairVehicle(sel.defId, 'battery')}>
              Battery (1× Car battery)
            </button>
            <button className={btn} disabled={sel.dist > 9 || count('scrap') < 1} onClick={() => repairVehicle(sel.defId, 'scrap')}>
              Scrap patch (Scrap)
            </button>
          </div>
          {(() => {
            // BUILD SHEET: the sim's own math, shown. Same parameters the
            // rigid body runs (game/carSpec) — weight, power-to-weight,
            // and the estimated figures for THIS build state.
            const est = estimatePerformance(carParams(sel.upgrades, sel.storageUsedKg));
            return (
              <div className="mb-2 rounded border border-[#232b36] bg-[#12161c] px-2.5 py-2">
                <div className="mb-1 text-[11px] font-semibold text-[#8a94a3]">BUILD SHEET — as she sits</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#d7dde5]">
                  <span>{est.massKg.toFixed(0)} kg</span>
                  <span>{Math.round(est.powerKw * 1.341)} hp</span>
                  <span>{est.powerToWeightKwPerTonne.toFixed(0)} kW/t</span>
                  <span>0–100 ≈ {est.zeroToHundredSec.toFixed(1)}s</span>
                  <span>top ≈ {Math.round(est.topSpeedKmh)} km/h</span>
                </div>
                <div className="mt-0.5 text-[10px] text-[#5a6472]">
                  Computed from the same torque curve, gearing, grip and mass the car actually
                  runs on. Kilograms are the tradeoff: everything you bolt on shows up here.
                </div>
              </div>
            );
          })()}
          <h4 className="mb-1 text-[11px] font-semibold text-[#8a94a3]">
            UPGRADES {atShop ? '— workshop in reach' : '— need the marina Machine Shop or a base Garage Bay'}
          </h4>
          <div className="flex flex-col gap-1.5">
            {UPGRADES.map((u) => {
              const owned = sel.upgrades.includes(u.id);
              const def = VEHICLE_DEFS.find((d) => d.id === sel.defId);
              const fits = def ? canInstallUpgrade({ kind: def.kind, id: def.id }, u.id, sel.upgrades) : false;
              return (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded border border-[#232b36] bg-[#12161c] px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="text-xs text-[#d7dde5]">{u.name}{owned && <span className="ml-2 text-[#5aa469]">FITTED</span>}</div>
                    <div className="truncate text-[11px] text-[#8a94a3]">{u.desc}</div>
                    {!owned && (() => {
                      const withU = estimatePerformance(carParams([...sel.upgrades, u.id], sel.storageUsedKg));
                      const dKg = UPGRADE_MASS_KG[u.id] ?? 0;
                      return (
                        <div className="font-mono text-[10px] text-[#57c7d4]">
                          fitted: 0–100 ≈ {withU.zeroToHundredSec.toFixed(1)}s · top ≈ {Math.round(withU.topSpeedKmh)} km/h · {dKg > 0 ? `+${dKg}` : dKg} kg
                        </div>
                      );
                    })()}
                    {!owned && costLine(u.cost)}
                  </div>
                  {!owned && (
                    <button className={btn} disabled={!atShop || !fits || !afford(u.cost)} onClick={() => installUpgrade(sel.defId, u.id)}>
                      Install
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
        {vehicle ? `In the ${vehicle.name} · fuel ${Math.round(vehicle.fuelPct * 100)}%` : 'On foot · Outer Banks relay in range'}
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
