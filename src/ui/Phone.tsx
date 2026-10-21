import { useEffect, useRef, useState } from 'react';
import { useGameStore, claimsFromLegacyBase } from '../store/gameStore';
import { ITEMS, STATION_LABEL } from '../data/items';
import { QUESTS } from '../data/quests';
import { FACTIONS, repTier } from '../data/factions';
import { MAP_MARKERS } from '../data/territory';
import { SKILLS, TREES, PERKS, xpToNext } from '../data/skills';
import { traitName, moraleBand, type SurvivorJob } from '../data/survivors';
import { FACILITIES, baseHeat, heatBand, buildMinutes, tieredFacility, CLAIM_SITES } from '../data/base';
import {
  baseSummary, buildMenu, claimChecklist, computeHeat, facilityStatus, garageView, jobBoard,
  relocationQuote, stockpileView, facilityTier,
} from '../systems/baseClaims';
import BasePanel from './BasePanel';
import { poiName } from '../data/dispatch';
import { TRADERS } from '../data/traders';
import TraderPanel from './TraderPanel';
import { UPGRADES, canInstallUpgrade } from '../data/upgrades';
import { carParams, estimatePerformance, UPGRADE_MASS_KG } from '../game/carSpec';
import { VEHICLE_DEFS } from '../game/Vehicles';
import { carryLimitKg, encumbranceTier, totalWeightKg } from '../store/inventoryUtils';
import InventoryDeck from './InventoryDeck';
import SkillsPanel from './SkillsPanel';
import { CraftPanel } from './CraftPanel';
import DispatchPanel from './DispatchPanel';
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
  // Inventory v2: the Pack app IS the inventory deck — the same
  // shared surface the phone-free overlay renders (InventoryDeck).
  // The phone keeps only its own chrome (weight + battery strip).
  const inventory = useGameStore((s) => s.inventory);
  const equipped = useGameStore((s) => s.equipped);
  const difficulty = useGameStore((s) => s.difficulty);
  const battery = useGameStore((s) => s.battery);
  const weight = totalWeightKg(inventory);
  const limit = carryLimitKg(equipped, inventory, difficulty);
  const tier = encumbranceTier(weight, limit);
  const tierLabel = { ok: 'Pack light', heavy: 'Heavy', overloaded: 'Overloaded', immobile: 'Immobile' }[tier];
  const tierColor = tier === 'ok' ? 'text-[#5aa469]' : tier === 'heavy' ? 'text-[#e8b34b]' : 'text-[#d9534f]';

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
      <div className="nomad-scroll min-h-0 flex-1 overflow-y-auto">
        <InventoryDeck compact />
      </div>
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

    // W4 (stage 7): territory markers — owner-colored pins with the
    // site's faction label, resolved through the live POI positions.
    const OWNER_COLORS: Record<string, string> = {
      player: '#5aa469', union: '#7ab0c9', skulls: '#d9534f',
      tollkeepers: '#e8b34b', remnants: '#b8b0a4', drowned: '#4a7a9c',
      lighthouse: '#e8e0cc', enclave: '#9a6ac9', neutral: '#8a94a3',
      contested: '#d7834f',
    };
    ctx.font = '7px sans-serif';
    for (const m of MAP_MARKERS) {
      if (!m.poiId) continue;
      const p = st.poiPositions[m.poiId];
      if (!p) continue;
      const [px, py] = toPx(p[0], p[1]);
      ctx.fillStyle = OWNER_COLORS[m.owner] ?? '#8a94a3';
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(11,14,18,0.8)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(215,221,229,0.75)';
      ctx.fillText(m.label, px + 4, py - 4);
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
 * MERGE SLOT — Lane 10 BasePanel: MOUNTED (Stage 4). BaseTab below feeds
 * the props-driven panel from Lane 10's systems/baseClaims.ts view models
 * over the store's `claims` state (falling back to the legacy base,
 * migrated read-only with the loader's own claimsFromLegacyBase, so a
 * base claimed this session shows before the next save/load). The legacy
 * section (BaseSection) remains the no-base fallback.
 * Stage 7 landed the deferred props: §7.2 claims (the 'area clear'
 * check reads Game's published claimHostiles counts; onClaim runs the
 * store's claimClaimSite) and §7.8 garage (over Lane 13's stamped
 * fleet fuel absolutes + the atHome stamp).
 * onBuild routes shared facility ids through the shipped legacy build
 * queue; tier-only facilities (workbench, machine shop…) have no phone
 * order path yet — the claims build queue is a later step.
 */
const TIERED_TO_FLAT_FACILITY: Record<string, string> = {
  water: 'rain_collector',
  garage: 'garage_bay',
};

function BaseTab() {
  const claims = useGameStore((s) => s.claims);
  const base = useGameStore((s) => s.base);
  const survivors = useGameStore((s) => s.survivors);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const baseExt = useGameStore((s) => s.baseExt);
  const inventory = useGameStore((s) => s.inventory);
  const baseQueue = useGameStore((s) => s.baseQueue);
  const cancelBuild = useGameStore((s) => s.cancelBuild);
  const buildFacility = useGameStore((s) => s.buildFacility);
  const addToast = useGameStore((s) => s.addToast);
  const rep = useGameStore((s) => s.rep);
  const claimHostiles = useGameStore((s) => s.claimHostiles);
  const claimClaimSite = useGameStore((s) => s.claimClaimSite);
  const fleet = useGameStore((s) => s.fleet);

  const home = claims.home ?? (base ? claimsFromLegacyBase(base).home : null);
  if (!home) return <BaseSection />;
  const effectiveClaims = claims.home ? claims : { home, outposts: claims.outposts };
  // §7.2 (stage 7): every claimable site with live checks — the area
  // clear count is Game's published husk census at the site.
  const walletMap = new Map<string, number>();
  for (const it of inventory) walletMap.set(it.itemId, (walletMap.get(it.itemId) ?? 0) + it.qty);
  for (const st of home.stockpile) walletMap.set(st.itemId, (walletMap.get(st.itemId) ?? 0) + st.qty);
  const wallet = [...walletMap.entries()].map(([itemId, qty]) => ({ itemId, qty }));
  const claimsProp = CLAIM_SITES.filter((site) => site.klass !== 'never').map((site) => ({
    site,
    checks: claimChecklist(site, effectiveClaims, {
      recruits: survivors.length,
      rep: { ...rep },
      husksWithin40m: claimHostiles[site.poiId] ?? 0,
      wallet,
      byForce: site.warPath === true && (claimHostiles[site.poiId] ?? 0) === 0,
    }),
  }));
  const onClaim = (siteId: string) => {
    sfx.play('ui');
    claimClaimSite(siteId, {
      husksWithin40m: claimHostiles[siteId] ?? 0,
      byForce: CLAIM_SITES.find((x) => x.poiId === siteId)?.warPath === true
        && (claimHostiles[siteId] ?? 0) === 0,
    });
  };
  // §7.8 (stage 7): the garage over the fleet publisher's stamps.
  const garage = facilityTier(home, 'garage') >= 1
    ? garageView(
        home,
        fleet.map((f) => ({
          id: f.instanceId ?? f.defId,
          kind: f.name,
          condition: f.condPct,
          fuelL: f.fuelLiters ?? Math.round((f.fuelPct / 100) * (f.tankLiters ?? 0)),
          fuelCap: f.tankLiters ?? 0,
          upgrades: f.upgrades,
          trailerId: f.hitchedTrailer,
          storageKg: f.storageUsedKg,
          storageCapKg: f.storageCapKg,
        })),
        fleet.filter((f) => f.atHome).map((f) => f.instanceId ?? f.defId),
      )
    : undefined;
  const localKills = baseExt.localKillsNearBase ?? 0;
  const heat = computeHeat(home, survivors, daysElapsed, localKills);
  const crew = {
    builders: survivors.filter((sv) => sv.job === 'Builder').length,
    jobsPresent: [...new Set(survivors.map((sv) => sv.job ?? 'Idle'))],
    blueprints: [...new Set(inventory.filter((i) => i.itemId.startsWith('bp_')).map((i) => i.itemId))],
  };
  const onBuild = (facilityId: string) => {
    const flatId = TIERED_TO_FLAT_FACILITY[facilityId] ?? facilityId;
    if (FACILITIES.some((f) => f.id === flatId)) {
      sfx.play('ui');
      buildFacility(flatId);
    } else {
      addToast('That facility is built on site, not from the phone — yet.');
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <BasePanel
        summary={baseSummary(home, survivors, daysElapsed, localKills)}
        facilities={home.facilities.map((f) => ({
          defId: f.defId,
          name: tieredFacility(f.defId)?.name ?? f.defId,
          tier: f.tier,
          staffId: f.staffId,
          status: facilityStatus(home, f.defId, survivors),
        }))}
        buildMenu={buildMenu(home.siteId, home, crew)}
        stockpile={stockpileView(home)}
        survivors={survivors}
        board={jobBoard(home, survivors, heat)}
        relocation={relocationQuote(effectiveClaims)}
        claims={claimsProp}
        garage={garage && garage.bays > 0 ? garage : undefined}
        onClaim={onClaim}
        onBuild={onBuild}
      />
      {baseQueue.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Build orders in progress</h3>
          {baseQueue.map((q) => (
            <div key={q.facilityId} className="mb-1.5 flex items-center justify-between rounded border border-[#e8b34b] bg-[#12161c] px-2.5 py-2 text-sm">
              <span className="text-[#d7dde5]">
                {FACILITIES.find((f) => f.id === q.facilityId)?.name ?? q.facilityId}
                <span className="ml-2 font-mono text-[11px] text-[#8a94a3]">ready {fmtAbs(q.readyMin)}</span>
              </span>
              <button
                onClick={() => { sfx.play('ui'); cancelBuild(q.facilityId); }}
                className="rounded border border-[#232b36] bg-[#0b0e12] px-2 py-1 text-[12px] text-[#d7dde5] transition-colors hover:border-[#e5484d]"
              >
                Cancel
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

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

/**
 * NPCs standing in the purged world who front a trader (data/traders.ts
 * npcKey). Only Kowalski is placed today (lighthouse watch room); Jonah
 * fronts no bench. Lane 9's W2 placements (Okonkwo, Quartermaster,
 * Vesper, Wraith) extend this list when the wiring train lands them.
 */
const WORLD_TRADER_NPC_KEYS = ['kowalski', 'okonkwo', 'quartermaster', 'wraith', 'vesper'];

function LogTab() {
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
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

      {/* traders — Lane 9 W3 mount: benches whose NPCs stand in the world.
          The panel enforces its own rep/flag gates. */}
      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Traders</h3>
        {TRADERS.filter((t) => WORLD_TRADER_NPC_KEYS.includes(t.npcKey)).map((t) => (
          <div key={t.id} className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-[#d7dde5]">
              {t.name} <span className="text-xs text-[#8a94a3]">· {FACTIONS.find((f) => f.id === t.faction)?.name ?? t.faction}</span>
            </span>
            <button
              onClick={() => { sfx.play('ui'); setSelectedTraderId(t.id); }}
              className="rounded border border-[#232b36] bg-[#0b0e12] px-3 py-1 text-[13px] text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
            >
              Trade
            </button>
          </div>
        ))}
        <p className="text-xs leading-relaxed text-[#8a94a3]">
          Barter only — no currency on the island. Other benches open as their people reach the island.
        </p>
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

      {selectedTraderId && (
        <TraderPanel traderId={selectedTraderId} onClose={() => setSelectedTraderId(null)} />
      )}
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
      {/* Lane 8 SkillsPanel (merged stage 2a): the full §6.2 surface —
          tier chains, capstone exclusivity, engine lock reasons — under
          the compact SkillsTab summary strip. Its LightIndicator named
          export is Lane 11's HUD piece, fed by the store's `visibility`
          flag (Lane 5 contract). */}
      <SkillsTab />
      <SkillsPanel />
    </div>
  );
}

/* ---------------- TEAM app ---------------- */

function TeamTab() {
  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <CrewSection />
      {/* MERGE SLOT — Lane 13 DispatchPanel: MOUNTED (Stage 6). The panel
          is self-contained (store-driven, no props) and plans by vehicle
          instance id (FleetEntry.instanceId, stamped by Game's fleet
          publisher; defId until then). It carries its own active-run
          progress + recall rows, replacing the old DispatchSection —
          deleted below with its "Dispatch is offline" copy. */}
      <DispatchPanel />
    </div>
  );
}

/* ---------------- CRAFT app: the tree + weapon/clothing modification ---------------- */

/** The Craft tab is Lane 7's CraftPanel (merged stage 2a): field recipes
 *  stay instant via gameStore.craftRecipe; station recipes run on the
 *  timed queue (systems/crafting) with full gate checks. The pre-merge
 *  hand-rolled tab (incl. FinishRow) was deleted at the swap per Lane 5's
 *  merge slot; weapon mods remain available at the bench in the Backpack. */
function CraftTab() {
  return <CraftPanel />;
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
                <BaseTab />
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
