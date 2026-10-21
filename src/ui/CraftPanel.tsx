// CraftPanel — the v2 Craft tab (Lane 7, SYSTEMS_SPEC §4).
//
// Drop-in replacement for Phone.tsx's CraftTab: Lane 5 imports this from the
// Phone Craft tab at merge (`import { CraftPanel } from './CraftPanel'`).
//
// Behavior:
//  - Field recipes stay on the shipped instant path (gameStore.craftRecipe).
//  - Station recipes run on the timed queue (systems/crafting): components
//    are consumed at start, progress runs on game time, combat interrupts
//    bank progress, sleeping through a craft completes it.
//  - Every row is gate-checked live (components / station / tier / skill /
//    blueprint / facility) and shows the first blocking reason, Phone-style.
//  - Skill gates feature-detect Lane 8's substrate via storeSkillLevel —
//    inert (waived, noted) when no skill state can be read.

import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  FIELD_RECIPES,
  ITEMS,
  STATION_LABEL,
  STATION_RECIPES,
  type FieldRecipe,
  type StationId,
} from '../data/items';
import { reachableStationTier } from '../data/stations';
import {
  checkCraft,
  formatDurationMin,
  getRecipe,
  isInstant,
  jobProgress,
  recipeDurationMin,
  recipeMeta,
  storeSkillLevel,
  TURRET_RECIPE,
  useCraftQueue,
  type CraftContext,
} from '../systems/crafting';
import { sfx } from '../systems/audio';

const STATION_ORDER: StationId[] = ['workbench', 'chemistry', 'industrial'];

function stationRecipes(station: StationId): FieldRecipe[] {
  const list = Object.values(STATION_RECIPES).filter((r) => r.station === station);
  if (station === 'industrial') list.push(TURRET_RECIPE);
  return list;
}

export function CraftPanel() {
  const inventory = useGameStore((s) => s.inventory);
  const nearStation = useGameStore((s) => s.nearStation);
  const base = useGameStore((s) => s.base);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const jobs = useCraftQueue((s) => s.jobs);
  const enqueue = useCraftQueue((s) => s.enqueue);
  const cancelJob = useCraftQueue((s) => s.cancel);
  const resumeJobAction = useCraftQueue((s) => s.resume);
  const tick = useCraftQueue((s) => s.tick);

  // Drive the queue while the panel is open (Game.ts also ticks post-merge —
  // see the lane report's integration steps).
  const [, setPulse] = useState(0);
  useEffect(() => {
    tick();
    const id = setInterval(() => {
      tick();
      setPulse((p) => p + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const facilities = base?.facilities ?? [];
  const countItem = (id: string) => inventory.reduce((a, i) => a + (i.itemId === id ? i.qty : 0), 0);

  const ctxFor = (station: StationId | null): CraftContext => ({
    countItem,
    nearStation,
    facilityStation: null,
    nearStationTier: station
      ? reachableStationTier(station, {
          atWorldStation: nearStation === station,
          facilities,
        })
      : 0,
    facilities,
    skillLevel: storeSkillLevel,
  });

  const nowMin = useGameStore.getState().daysElapsed * 1440 + useGameStore.getState().timeMinutes;

  const metaLine = (r: FieldRecipe): string => {
    const meta = recipeMeta(r);
    const bits: string[] = [];
    if (!isInstant(r)) bits.push(`⏱ ${formatDurationMin(recipeDurationMin(r))}`);
    if (meta.skillReq) bits.push(`${meta.skillReq.skill} ${meta.skillReq.level}+`);
    if ((meta.stationTier ?? 1) > 1) bits.push(`tier ${meta.stationTier} station`);
    if (meta.blueprintId) bits.push('blueprint');
    if (meta.facilityReq === 'turret_host') bits.push('T3 facility');
    return bits.join(' · ');
  };

  const componentsLine = (r: FieldRecipe) =>
    r.components
      .map((c) => `${countItem(c.itemId)}/${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`)
      .join(' · ');

  const recipeRow = (r: FieldRecipe) => {
    const timed = !isInstant(r);
    const check = checkCraft(r, ctxFor(r.station ?? null));
    const note = check.ok ? componentsLine(r) : (check.reasons[0] ?? componentsLine(r));
    return (
      <div key={r.id} className={`flex items-center justify-between gap-2 text-sm ${check.ok ? '' : 'opacity-60'}`}>
        <div className="min-w-0">
          <div className="text-[#d7dde5]">{r.name}</div>
          <div className="truncate text-[11px] text-[#8a94a3]">{note}</div>
          {metaLine(r) && <div className="truncate text-[11px] text-[#e8b34b]">{metaLine(r)}</div>}
        </div>
        <button
          onClick={() => {
            sfx.play('ui');
            if (!timed) {
              craftRecipe(r.id);
              return;
            }
            const refusal = enqueue(r.id, ctxFor(r.station ?? null));
            if (refusal) useGameStore.getState().addToast(refusal);
          }}
          disabled={!check.ok}
          className="shrink-0 rounded border border-[#232b36] px-2.5 py-1 text-xs text-[#d7dde5] transition-colors hover:border-[#e8b34b] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {timed ? 'Start' : 'Craft'}
        </button>
      </div>
    );
  };

  return (
    <div className="nomad-scroll flex h-full flex-col gap-4 overflow-y-auto">
      {jobs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">On the bench — in progress</h3>
          <div className="flex flex-col gap-2">
            {jobs.map((job) => {
              const recipe = getRecipe(job.recipeId);
              const pct = Math.round(jobProgress(job, nowMin) * 100);
              return (
                <div key={job.uid} className="rounded border border-[#232b36] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[#d7dde5]">{recipe?.name ?? job.recipeId}</span>
                    <span className="text-[11px] text-[#8a94a3]">
                      {job.status === 'interrupted' ? 'Interrupted — progress banked' : `${pct}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[#232b36]">
                    <div
                      className={`h-full ${job.status === 'interrupted' ? 'bg-[#8a94a3]' : 'bg-[#e8b34b]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {job.status === 'interrupted' && (
                      <button
                        onClick={() => { sfx.play('ui'); resumeJobAction(job.uid); }}
                        className="rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => { sfx.play('ui'); cancelJob(job.uid); }}
                      className="rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#8a94a3] transition-colors hover:border-[#e8b34b]"
                    >
                      Cancel (refund)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Field craft — anywhere</h3>
        <div className="flex flex-col gap-1.5">
          {Object.values(FIELD_RECIPES).filter((r) => !r.station).map((r) => recipeRow(r))}
        </div>
      </section>

      {STATION_ORDER.map((st) => (
        <section key={st}>
          <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">
            {STATION_LABEL[st]}
            {nearStation === st ? ' — in reach' : ' — visit to craft'}
          </h3>
          <div className="flex flex-col gap-1.5">{stationRecipes(st).map((r) => recipeRow(r))}</div>
        </section>
      ))}
    </div>
  );
}

export default CraftPanel;
