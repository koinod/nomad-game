// BasePanel — the Sat Phone Base tab screens (SYSTEMS_SPEC §7.1–7.9).
// Props-driven on purpose: Lane 5 owns Phone.tsx + the store, and wires
// this panel to live state at merge. Everything rendered here comes from
// the Lane-10 view models (systems/baseClaims.ts); this file owns no
// state and no store imports. Palette matches Phone.tsx / DESIGN_TOKENS.

import type { SurvivorDef } from '../data/survivors';
import { moraleBand, traitName } from '../data/survivors';
import { HEAT_TIER_LABEL } from '../data/base';
import { claimReady } from '../systems/baseClaims';
import type {
  BaseSummary, ClaimCheck, FacilityCard, StockpileView, JobBoard,
  GarageView, RelocationQuote,
} from '../systems/baseClaims';
import type { ClaimSiteDef } from '../data/base';

export interface BasePanelProps {
  /** §7.1 overview for the selected base. */
  summary: BaseSummary;
  /** Facility rows for §7.4: built facilities + their live status line. */
  facilities: { defId: string; name: string; tier: number; staffId: string | null; status: string }[];
  /** §7.3 build menu cards. */
  buildMenu: FacilityCard[];
  /** §7.5 stockpile. */
  stockpile: StockpileView;
  /** §7.6 roster at this base. */
  survivors: SurvivorDef[];
  /** §7.7 jobs / garrison board. */
  board: JobBoard;
  /** §7.8 garage (omit when the base has no Garage Bay). */
  garage?: GarageView;
  /** §7.2 claim screens for other sites (world claim posts feed this). */
  claims?: { site: ClaimSiteDef; checks: ClaimCheck[] }[];
  /** §7.9 relocation quote (shown when a home exists and another home is targeted). */
  relocation?: RelocationQuote;
  /**
   * §7.5 interactive stockpile moves (systems-completeness lane:
   * deposit/withdraw used to be engine-only — production flowed in,
   * upkeep drew out, and the player could do neither). Presence is
   * enforced by the store; `atBase` here only drives the hint copy.
   */
  stockpileMoves?: {
    atBase: boolean;
    /** Carried stacks that can be deposited (whole stack each). */
    packStacks: { uid: string; name: string; qty: number }[];
    onDeposit: (uid: string) => void;
    onWithdraw: (itemId: string) => void;
  };
  onClaim?: (siteId: string) => void;
  onBuild?: (facilityId: string) => void;
}

const card = 'rounded border border-[#232b36] bg-[#0b0e12] p-3';
const h = 'text-[11px] font-semibold uppercase tracking-wider text-[#8a94a3]';
const t = 'text-sm text-[#d7dde5]';
const dim = 'text-xs text-[#8a94a3]';

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-[#1a212c]">
      <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function heatColor(tier: BaseSummary['heatTier']): string {
  return tier === 'siege' ? '#e5484d' : tier === 'warning' ? '#f76b15' : tier === 'scout' ? '#ffb224' : '#46a758';
}

export default function BasePanel(props: BasePanelProps) {
  const { summary: s, stockpile, board } = props;
  return (
    <div className="flex flex-col gap-3">
      {/* ---- §7.1 Overview ---- */}
      <div className={card}>
        <div className="mb-2 flex items-baseline justify-between">
          <div className={t}>{s.name} <span className={dim}>· {s.role}</span></div>
          <div className={dim}>Comfort {s.comfort}/3 · Pop {s.population}/{s.popCap}</div>
        </div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-[#8a94a3]">Heat {s.heat}</span>
          <span style={{ color: heatColor(s.heatTier) }}>{HEAT_TIER_LABEL[s.heatTier]}</span>
        </div>
        <Bar value={s.heat} max={100} color={heatColor(s.heatTier)} />
        <div className={`mt-2 ${dim}`}>
          {s.forecast.note} Heat = stockpile wealth ×1.2 + defense ×0.8 + days ×0.5 —
          banking loot is taxed; carrying it is safe. That tension is the system.
        </div>
        <div className={`mt-2 grid grid-cols-2 gap-2 ${dim}`}>
          <div>Facilities {s.slots.used}/{s.slots.total} slots</div>
          <div>Stockpile {s.stockpileKg}/{s.stockpileCapKg}kg</div>
          <div>Power {s.power.usedKw}/{s.power.capacityKw} kW</div>
          <div>Defense {board.siegeReadiness.defense} · Guards {board.siegeReadiness.guards}</div>
        </div>
        {s.alerts.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {s.alerts.map((a, i) => (
              <div key={i} className="rounded border border-[#5a2d1a] bg-[#2a1408] px-2 py-1 text-xs text-[#ffb224]">{a}</div>
            ))}
          </div>
        )}
      </div>

      {/* ---- §7.3/§7.4 Facilities ---- */}
      <div>
        <div className={`${h} mb-1`}>Facilities</div>
        <div className="flex flex-col gap-2">
          {props.facilities.map((f) => (
            <div key={f.defId} className={card}>
              <div className="flex justify-between">
                <span className={t}>{f.name} <span className={dim}>T{f.tier}</span></span>
                <span className={dim}>{f.staffId ? `staffed` : ''}</span>
              </div>
              <div className={dim}>{f.status}</div>
            </div>
          ))}
          {props.buildMenu.map((c) => (
            <div key={c.facilityId + c.tier} className={`${card} ${c.gateMet ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className={t}>Build: {c.name} T{c.tier}</span>
                <button
                  disabled={!c.gateMet}
                  onClick={() => props.onBuild?.(c.facilityId)}
                  className="rounded border border-[#2e7d4f] px-2 py-0.5 text-xs text-[#7ee2a8] disabled:cursor-not-allowed disabled:border-[#232b36] disabled:text-[#5a6575]"
                >
                  Build
                </button>
              </div>
              <div className={dim}>
                {c.cost.map((x) => `${x.qty} ${x.itemId}`).join(' + ') || 'Free'} · {c.buildHours}h
                {c.gate === 'solo' ? ` (${c.buildHoursSolo}h solo)` : ''}{c.powerKw > 0 ? ` · ${c.powerKw} kW` : ''}
              </div>
              <div className={dim}>{c.effectText}</div>
              <div className="text-xs" style={{ color: c.gateMet ? '#8a94a3' : '#f76b15' }}>{c.gateText}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- §7.5 Stockpile ---- */}
      <div>
        <div className={`${h} mb-1`}>Stockpile — {Math.round(stockpile.usedKg)}/{stockpile.capKg}kg · heat value {stockpile.totalHeatValue}</div>
        <div className={card}>
          {stockpile.categories.length === 0 && <div className={dim}>Empty. Only stored wealth feeds heat — and the crew.</div>}
          {stockpile.categories.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div className={h}>{cat.id}</div>
              {cat.items.map((it) => (
                <div key={it.itemId} className="flex items-center justify-between text-xs text-[#d7dde5]">
                  <span>{it.name} ×{it.qty}</span>
                  <span className="flex items-center gap-2">
                    <span className={dim}>heat {it.heatValue}/ea</span>
                    {props.stockpileMoves && (
                      <button
                        disabled={!props.stockpileMoves.atBase}
                        onClick={() => props.stockpileMoves!.onWithdraw(it.itemId)}
                        className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9] disabled:cursor-not-allowed disabled:opacity-40"
                      >Take</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
          {props.stockpileMoves && (
            <div className="mt-2 border-t border-[#1a212c] pt-2">
              {props.stockpileMoves.atBase ? (
                props.stockpileMoves.packStacks.length === 0 ? (
                  <div className={dim}>Nothing carried to deposit.</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className={h}>Deposit from pack</div>
                    {props.stockpileMoves.packStacks.map((st) => (
                      <div key={st.uid} className="flex items-center justify-between text-xs text-[#d7dde5]">
                        <span>{st.name} ×{st.qty}</span>
                        <button
                          onClick={() => props.stockpileMoves!.onDeposit(st.uid)}
                          className="rounded border border-[#232b36] px-1.5 py-0.5 text-[10px] text-[#d7dde5] hover:border-[#7fb0d9]"
                        >Deposit</button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className={dim}>The pile is physical — travel to this base to move goods in or out.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- §7.6/§7.7 Crew + jobs board ---- */}
      <div>
        <div className={`${h} mb-1`}>Crew — siege readiness: {board.siegeReadiness.verdict.toUpperCase()}
          <span className="normal-case"> (ammo {board.siegeReadiness.ammo}, projected burn ~{board.siegeReadiness.projectedBurn} rds)</span>
        </div>
        <div className="flex flex-col gap-2">
          {props.survivors.map((sv) => (
            <div key={sv.id} className={card}>
              <div className="flex justify-between">
                <span className={t}>{sv.name}</span>
                <span className={dim}>{sv.job ?? 'Idle'} · {sv.status}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1"><Bar value={sv.morale} max={100} color={sv.morale >= 40 ? '#46a758' : sv.morale >= 20 ? '#ffb224' : '#e5484d'} /></div>
                <span className={dim}>{moraleBand(sv.morale)} {sv.morale}</span>
              </div>
              <div className={dim}>
                {sv.traits.map(traitName).join(' · ')} · eats 2 food + 1 water/day
              </div>
            </div>
          ))}
          {board.unassigned > 0 && (
            <div className="rounded border border-[#5a4a1a] bg-[#241c06] px-2 py-1 text-xs text-[#ffb224]">
              {board.unassigned} survivor{board.unassigned > 1 ? 's' : ''} idle — assign jobs.
            </div>
          )}
          {board.guardPosts.map((p) => (
            <div key={p.postId} className={`${card} flex justify-between`}>
              <span className={t}>Guard post</span>
              <span className={dim}>{p.staffed ? 'staffed' : 'UNSTAFFED'} · ammo {p.ammoStock}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- §7.8 Garage ---- */}
      {props.garage && props.garage.bays > 0 && (
        <div>
          <div className={`${h} mb-1`}>Garage — {props.garage.bays} bay{props.garage.bays > 1 ? 's' : ''}{props.garage.heavyBay ? ' + heavy' : ''}</div>
          <div className="flex flex-col gap-2">
            {props.garage.cards.map((c, i) => (
              <div key={i} className={card}>
                {c.vehicle ? (
                  <>
                    <div className="flex justify-between">
                      <span className={t}>{c.vehicle.kind}</span>
                      <span className={dim}>{c.stored ? 'stored — protected' : 'parked — exposed'}</span>
                    </div>
                    <div className={dim}>
                      Condition {Math.round(c.vehicle.condition)}% · Fuel {c.vehicle.fuelL}/{c.vehicle.fuelCap}L ·
                      Trunk {c.vehicle.storageKg}/{c.vehicle.storageCapKg}kg
                      {c.vehicle.upgrades.length > 0 ? ` · ${c.vehicle.upgrades.join(' ')}` : ''}
                    </div>
                  </>
                ) : <span className={dim}>Bay {i + 1} — empty</span>}
              </div>
            ))}
            {props.garage.manufacture && (
              <div className={card}>
                <div className={h}>Manufacture (Machine Shop T2 + Mechanic)</div>
                {props.garage.manufacture.map((r) => (
                  <div key={r.vehicleKind} className="flex justify-between text-xs text-[#d7dde5]">
                    <span>{r.name}</span>
                    <span className={dim}>{r.cost.map((x) => `${x.qty} ${x.itemId}`).join(' + ')} · {r.buildHours}h</span>
                  </div>
                ))}
                <div className={dim}>Box trucks and semis are never manufacturable — found and repaired only.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- §7.2 Claim screens ---- */}
      {props.claims && props.claims.length > 0 && (
        <div>
          <div className={`${h} mb-1`}>Claimable sites</div>
          <div className="flex flex-col gap-2">
            {props.claims.map(({ site, checks }) => {
              const ready = claimReady(checks);
              return (
                <div key={site.poiId} className={card}>
                  <div className="flex items-center justify-between">
                    <span className={t}>{site.name}</span>
                    <button
                      disabled={!ready}
                      onClick={() => props.onClaim?.(site.poiId)}
                      className="rounded border border-[#2e7d4f] px-2 py-0.5 text-xs text-[#7ee2a8] disabled:cursor-not-allowed disabled:border-[#232b36] disabled:text-[#5a6575]"
                    >
                      Hold F — Claim
                    </button>
                  </div>
                  <div className={dim}>{site.note}</div>
                  {checks.map((c) => (
                    <div key={c.id} className="flex gap-2 text-xs">
                      <span style={{ color: c.ok ? '#46a758' : '#e5484d' }}>{c.ok ? '✓' : '✗'}</span>
                      <span className="text-[#d7dde5]">{c.label}</span>
                      <span className={dim}>{c.detail}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- §7.9 Relocation ---- */}
      {props.relocation && (
        <div className={card}>
          <div className={h}>Relocation</div>
          <div className={dim}>
            Salvage refund (70%): {props.relocation.refund.map((r) => `${r.qty} ${r.itemId}`).join(' + ') || 'nothing built yet'}.
            Outposts persist ({props.relocation.outpostsKept}).
          </div>
          <div className="mt-1 rounded border border-[#5a2d1a] bg-[#2a1408] px-2 py-1 text-xs text-[#ffb224]">
            The stockpile does NOT teleport — {Math.round(props.relocation.strandedStockpileKg)}kg stays
            at {props.relocation.strandedAtSiteId ?? 'the old base'}. Haul it, or lose it. Box trucks exist for a reason.
          </div>
        </div>
      )}
    </div>
  );
}
