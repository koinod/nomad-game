// DispatchPanel.tsx — Lane 13: the Team tab's dispatch section, rebuilt
// as its own component for Lane 5 to mount in place of Phone.tsx's inline
// DispatchSection. Self-contained (store-driven, no props).
//
// What it does that the wave-3 UI never could:
//  - plans by vehicle INSTANCE id (planDispatch in data/dispatch.ts), so a
//    fleet with two of the same model assigns cleanly;
//  - live preview with parity: the duration / husk risk / fuel figures
//    shown here are computed by the same pure functions the sim resolves
//    with — what you see is what the run costs, fuel included;
//  - honest blockers: every reason the store would refuse the run is
//    listed before the player taps Send.
// FleetEntry.instanceId has landed (Lane 5) and Game's fleet publisher
// stamps it from the live Vehicle uid (== defId while the fleet runs one
// instance per def); the adapter below still falls back to defId for any
// unstamped row — the planner cannot tell the difference, by design.

import { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { DispatchTask, FleetEntry, TrailerFleetEntry } from '../store/types';
import { baseHeat } from '../data/base';
import {
  DISPATCH_TASKS,
  dispatchPoisAvailable,
  dispatchVehicleData,
  fmtClock,
  fmtRunDuration,
  planDispatch,
  poiName,
  riskBand,
  taskName,
  type DispatchPlan,
  type DispatchTrailerOption,
  type DispatchVehicleOption,
} from '../data/dispatch';
import { sfx } from '../systems/audio';

/** Fleet row → planner option. Reads instanceId defensively: the moment
 *  Lane 5 adds it to FleetEntry, this adapter picks it up untouched. */
function vehicleOption(f: FleetEntry, playerVehicleUid: string | null): DispatchVehicleOption {
  const instanceId = (f as FleetEntry & { instanceId?: string }).instanceId ?? f.defId;
  const data = dispatchVehicleData(f.defId);
  return {
    instanceId,
    defId: f.defId,
    name: f.name,
    // Prefer the publisher-stamped absolute (Game stamps live liters);
    // fall back to deriving from fuelPct for unstamped rows.
    fuelLiters: f.fuelLiters ?? Math.round((f.fuelPct / 100) * data.tankLiters * 10) / 10,
    tankLiters: data.tankLiters,
    burnClass: data.burnClass,
    conditionPct: f.condPct,
    freeKg: Math.max(0, f.storageCapKg - f.storageUsedKg),
    playerAboard: playerVehicleUid != null && (playerVehicleUid === f.defId || playerVehicleUid === instanceId),
  };
}

function trailerOption(t: TrailerFleetEntry): DispatchTrailerOption {
  const instanceId = (t as TrailerFleetEntry & { instanceId?: string }).instanceId ?? t.defId;
  return {
    instanceId,
    defId: t.defId,
    name: t.name,
    freeKg: Math.max(0, t.storageCapKg - t.storageUsedKg),
    hitchedToId: t.hitchedTo,
  };
}

const selectCls =
  'w-full rounded border border-[#232b36] bg-[#12161c] px-2 py-1.5 text-sm text-[#d7dde5] disabled:opacity-40';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#8a94a3]';

export default function DispatchPanel() {
  const survivors = useGameStore((s) => s.survivors);
  const fleet = useGameStore((s) => s.fleet);
  const trailerFleet = useGameStore((s) => s.trailerFleet);
  const dispatches = useGameStore((s) => s.dispatches);
  const poiPositions = useGameStore((s) => s.poiPositions);
  const base = useGameStore((s) => s.base);
  const pos = useGameStore((s) => s.pos);
  const playerVehicle = useGameStore((s) => s.vehicle);
  const daysElapsed = useGameStore((s) => s.daysElapsed);
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const startDispatch = useGameStore((s) => s.startDispatch);
  const recallDispatch = useGameStore((s) => s.recallDispatch);

  const now = daysElapsed * 1440 + timeMinutes;

  const [selSurvivorId, setSelSurvivorId] = useState<string | null>(null);
  const [selVehicleId, setSelVehicleId] = useState<string | null>(null);
  const [selTrailerId, setSelTrailerId] = useState<string>('none');
  const [selTask, setSelTask] = useState<DispatchTask>('scavenge');
  const [selDestId, setSelDestId] = useState<string | null>(null);

  const vehicleOptions = useMemo(
    () => fleet.map((f) => vehicleOption(f, playerVehicle?.uid ?? null)),
    [fleet, playerVehicle],
  );
  const trailerOptions = useMemo(() => trailerFleet.map(trailerOption), [trailerFleet]);
  const pois = useMemo(() => dispatchPoisAvailable(poiPositions), [poiPositions]);

  // selections fall back to the first live option (never a stale id)
  const survivor = survivors.find((s) => s.id === selSurvivorId) ?? survivors[0];
  const vehicle = vehicleOptions.find((v) => v.instanceId === selVehicleId) ?? vehicleOptions[0];
  const trailer =
    selTrailerId === 'none' ? null : trailerOptions.find((t) => t.instanceId === selTrailerId) ?? null;
  const dest = pois.find((p) => p.id === selDestId) ?? pois[0];

  const heat = base ? baseHeat(base.facilities, survivors.length, daysElapsed) : 0;

  const plan: DispatchPlan | null = useMemo(() => {
    if (!survivor || !vehicle || !dest) return null;
    const destPos = poiPositions[dest.id];
    const origin = (base && poiPositions[base.poiId]) || [pos[0], pos[2]];
    const distM = destPos
      ? Math.round(Math.hypot(destPos[0] - origin[0], destPos[1] - origin[1]))
      : null;
    return planDispatch({
      survivorId: survivor.id,
      survivorHp: survivor.hp,
      driverSkill: survivor.skills.driver ?? 0,
      vehicle,
      trailer,
      task: selTask,
      destPoiId: dest.id,
      distM,
      heat,
      territory: null, // Lane 9's territory data plugs in here at integration
      active: dispatches,
      nowMin: now,
    });
  }, [survivor, vehicle, trailer, dest, selTask, poiPositions, base, pos, heat, dispatches, now]);

  const busySurvivor = (id: string) => dispatches.some((d) => d.survivorId === id);

  return (
    <section className="rounded border border-[#232b36] bg-[#0b0e12] p-3">
      <h3 className="mb-2 text-xs font-semibold text-[#8a94a3]">Dispatch — crew runs</h3>

      {survivors.length === 0 && (
        <p className="text-sm text-[#8a94a3]">
          No crew yet. Recruit survivors first — Elena at the lighthouse, Mateo near the relay,
          Lina in the dunes.
        </p>
      )}

      {survivors.length > 0 && vehicleOptions.length === 0 && (
        <p className="text-sm text-[#8a94a3]">
          The fleet is empty. Dispatch needs a working vehicle the crew can take out.
        </p>
      )}

      {survivors.length > 0 && vehicleOptions.length > 0 && survivor && vehicle && dest && plan && (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Survivor</label>
              <select
                className={selectCls}
                value={survivor.id}
                onChange={(e) => { sfx.play('ui'); setSelSurvivorId(e.target.value); }}
              >
                {survivors.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                    {busySurvivor(sv.id) ? ' · out' : sv.hp < 30 ? ' · too hurt' : ` · driver ${sv.skills.driver ?? 0}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vehicle</label>
              <select
                className={selectCls}
                value={vehicle.instanceId}
                onChange={(e) => { sfx.play('ui'); setSelVehicleId(e.target.value); }}
              >
                {vehicleOptions.map((v) => (
                  <option key={v.instanceId} value={v.instanceId}>
                    {v.name} · {v.fuelLiters.toFixed(0)}/{v.tankLiters} L · {Math.round(v.conditionPct)}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Trailer</label>
              <select
                className={selectCls}
                value={trailer?.instanceId ?? 'none'}
                onChange={(e) => { sfx.play('ui'); setSelTrailerId(e.target.value); }}
              >
                <option value="none">No trailer</option>
                {trailerOptions.map((t) => {
                  const carrier = trailerFleet.find((x) => x.defId === t.defId);
                  const loaded = carrier?.loadedVehicle != null;
                  return (
                    <option key={t.instanceId} value={t.instanceId} disabled={loaded}>
                      {t.name} · {t.freeKg} kg free{loaded ? ' · car on deck' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className={labelCls}>Task</label>
              <select
                className={selectCls}
                value={selTask}
                onChange={(e) => { sfx.play('ui'); setSelTask(e.target.value as DispatchTask); }}
              >
                {DISPATCH_TASKS.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Destination</label>
              <select
                className={selectCls}
                value={dest.id}
                onChange={(e) => { sfx.play('ui'); setSelDestId(e.target.value); }}
              >
                {pois.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.note ? ` — ${p.note}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#8a94a3]">
                {DISPATCH_TASKS.find((t) => t.id === selTask)?.blurb}
              </p>
            </div>
          </div>

          {/* preview — the same numbers the sim will resolve with */}
          <div className="mt-2 rounded border border-[#232b36] bg-[#12161c] p-2.5 text-[12px] leading-5 text-[#8a94a3]">
            <div className="flex justify-between">
              <span>Route</span>
              <span className="text-[#d7dde5]">
                {plan.durationMin > 0 ? `${fmtRunDuration(plan.durationMin)} · back ${fmtClock(plan.etaMin)}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Husk risk</span>
              <span className={plan.risk >= 0.45 ? 'text-[#d9534f]' : plan.risk >= 0.3 ? 'text-[#e8b34b]' : 'text-[#d7dde5]'}>
                {riskBand(plan.risk)} · {Math.round(plan.risk * 100)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Fuel</span>
              <span className="text-[#d7dde5]">
                ≈{plan.fuelLiters.toFixed(1)} L · tank after ≈{plan.fuelAfterLiters.toFixed(1)} L
              </span>
            </div>
            <div className="flex justify-between">
              <span>Cargo room</span>
              <span className="text-[#d7dde5]">{plan.cargoKg} kg</span>
            </div>
          </div>

          {plan.reasons.length > 0 && (
            <div className="mt-2 rounded border border-[#d9534f]/50 bg-[#d9534f]/10 px-2 py-1.5 text-[11px] text-[#d9534f]">
              {plan.reasons.map((r) => <div key={r}>{r}</div>)}
            </div>
          )}
          {plan.warnings.length > 0 && (
            <div className="mt-2 rounded border border-[#e8b34b]/50 bg-[#e8b34b]/10 px-2 py-1.5 text-[11px] text-[#e8b34b]">
              {plan.warnings.map((w) => <div key={w}>{w}</div>)}
            </div>
          )}

          <button
            disabled={!plan.ok}
            onClick={() => {
              sfx.play('quest', { volume: 0.5 });
              // today's store action is defId-keyed; at Lane 5 integration
              // this call switches to vehicle.instanceId (see lane report)
              startDispatch(survivor.id, vehicle.defId, trailer?.defId ?? null, selTask, dest.id);
            }}
            className="mt-2 w-full rounded border border-[#e8b34b] px-3 py-2 text-sm font-medium text-[#e8b34b] disabled:cursor-not-allowed disabled:border-[#232b36] disabled:text-[#8a94a3]"
          >
            Send {survivor.name.split(' ')[0]} — {taskName(selTask)} · {dest.name}
          </button>
        </div>
      )}

      {/* active runs */}
      {dispatches.map((d) => {
        const who = survivors.find((x) => x.id === d.survivorId);
        const pct = Math.max(0, Math.min(100, Math.round(((now - d.departMin) / Math.max(1, d.etaMin - d.departMin)) * 100)));
        const fuel = (d as typeof d & { fuelLiters?: number }).fuelLiters;
        return (
          <div key={d.id} className="mb-2 mt-2 rounded border border-[#232b36] bg-[#12161c] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#d7dde5]">
                {who?.name ?? 'Crew'} — {taskName(d.task)} · {poiName(d.destPoiId)}
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
            <div className="mt-1 text-[11px] text-[#8a94a3]">
              Back {fmtClock(d.etaMin)} · {d.distM} m each way
              {fuel != null ? ` · ≈${fuel.toFixed(1)} L for the run` : ''}
            </div>
          </div>
        );
      })}
    </section>
  );
}
