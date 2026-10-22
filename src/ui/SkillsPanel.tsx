// ui/SkillsPanel.tsx — the §6 skills & archetypes panel.
//
// A standalone, store-driven panel: skill levels + XP bars, perk
// points, and the four archetype trees rendered as REAL TREES —
// nodes positioned by tier with the prerequisite graph drawn as
// paths (ui/skillTreeLayout), inside a scrollable viewport in the
// phone screen. Tap a node for its detail card; Learn calls the
// store's buyPerk, and every gate state / lock reason comes from
// the engine (systems/skills.perkRowState), never re-derived here,
// so what the panel shows is what the rules enforce.
//
// MOUNTED: Phone.tsx Character app renders <SkillsPanel />.
// LightIndicator is the HUD element (§6.3): render it from the
// per-frame exposure — <LightIndicator exposure={vis.exposure} />.

import { useMemo, useState } from 'react';
import { PERKS, SKILLS, TREES, perkById, xpToNext, type TreeId } from '../data/skills';
import { capstoneOwned, perkRowState } from '../systems/skills';
import { NODE_H, NODE_W, edgePath, perkTreeLayout } from './skillTreeLayout';
import { lightIndicator } from '../game/visibility';
import { useGameStore } from '../store/gameStore';
import { sfx } from '../systems/audio';

const AMBER = '#e8b34b';
const DIM = '#8a94a3';
const LINE = '#232b36';
const PANEL = '#0b0e12';
const GOOD = '#5aa469';

export default function SkillsPanel() {
  const skills = useGameStore((s) => s.skills);
  const perkPoints = useGameStore((s) => s.perkPoints);
  const perks = useGameStore((s) => s.perks);
  const buyPerk = useGameStore((s) => s.buyPerk);
  const capstone = capstoneOwned(perks);
  const [treeId, setTreeId] = useState<TreeId>('scavenger');
  const [selId, setSelId] = useState<string | null>(null);
  const layout = useMemo(() => perkTreeLayout(treeId), [treeId]);
  const tree = TREES.find((t) => t.id === treeId) ?? TREES[0];
  const selPerk = (selId ? perkById(selId) : undefined) ?? layout.nodes[0]?.perk;
  const selRow = selPerk ? perkRowState(perks, perkPoints, selPerk.id) : null;
  const stateOf = (id: string) => perkRowState(perks, perkPoints, id).state;

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold" style={{ color: DIM }}>
          Skills{' '}
          <span style={{ color: AMBER }}>
            {perkPoints} perk point{perkPoints === 1 ? '' : 's'}
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {SKILLS.map((sk) => {
            const st = skills[sk.id] ?? { level: 0, xp: 0 };
            const need = xpToNext(st.level);
            return (
              <div key={sk.id} className="rounded border p-2" style={{ borderColor: LINE, background: PANEL }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#d7dde5]">{sk.name}</span>
                  <span className="font-mono text-xs" style={{ color: AMBER }}>Lv {st.level}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded" style={{ background: LINE }}>
                  <div
                    className="h-full"
                    style={{ background: GOOD, width: `${st.level >= 10 ? 100 : Math.round((st.xp / need) * 100)}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: DIM }}>
                  {st.level >= 10 ? 'maxed' : `${st.xp}/${need} xp`} · {sk.blurb}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {capstone && (
        <p className="rounded border p-2 text-[11px]" style={{ borderColor: GOOD, color: DIM }}>
          Your archetype is set: <span className="text-[#d7dde5]">{capstone.name}</span> — one
          capstone per run (§6.2). The other trees still teach, but they will never define you.
        </p>
      )}

      {/* ---- the TREE: one archetype at a time, nodes + drawn paths ---- */}
      <section>
        <div className="mb-2 flex flex-wrap gap-1">
          {TREES.map((t) => {
            const ownedCount = PERKS.filter((p) => p.tree === t.id && perks.includes(p.id)).length;
            const active = t.id === treeId;
            return (
              <button
                key={t.id}
                onClick={() => { sfx.play('ui'); setTreeId(t.id); setSelId(null); }}
                className="rounded border px-2 py-1 text-[11px] transition-colors"
                style={{
                  borderColor: active ? AMBER : LINE,
                  color: active ? AMBER : DIM,
                  background: active ? '#171208' : PANEL,
                }}
              >
                {t.name} · {ownedCount}/9
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-[11px]" style={{ color: DIM }}>{tree.blurb}</p>

        <div
          className="overflow-auto rounded border"
          style={{ borderColor: LINE, background: '#090c10', maxHeight: 320 }}
        >
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            <svg
              className="absolute inset-0"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {layout.edges.map((e) => {
                const toState = stateOf(e.to);
                const fromState = stateOf(e.from);
                const lit = toState === 'owned';
                const next = !lit && fromState === 'owned' && toState === 'available';
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={edgePath(e)}
                    fill="none"
                    stroke={lit ? GOOD : next ? AMBER : LINE}
                    strokeWidth={lit || next ? 2 : 1.2}
                    strokeOpacity={lit || next ? 0.9 : 0.7}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((n) => {
              const st = stateOf(n.perk.id);
              const selected = selPerk?.id === n.perk.id;
              return (
                <button
                  key={n.perk.id}
                  onClick={() => { sfx.play('ui'); setSelId(n.perk.id); }}
                  className="absolute flex flex-col items-start justify-center rounded border px-1.5 text-left transition-colors"
                  style={{
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    height: NODE_H,
                    borderColor: st === 'owned' ? GOOD : st === 'available' ? AMBER : LINE,
                    background: st === 'owned' ? '#101812' : PANEL,
                    opacity: st === 'locked' ? 0.72 : 1,
                    boxShadow: selected ? `0 0 0 2px ${AMBER}` : undefined,
                  }}
                >
                  <span className="w-full truncate text-[11px] font-medium leading-tight text-[#d7dde5]">
                    {n.perk.tier === 4 ? '★ ' : ''}{n.perk.name}
                  </span>
                  <span className="text-[9px] leading-tight" style={{ color: st === 'owned' ? GOOD : st === 'available' ? AMBER : DIM }}>
                    T{n.perk.tier}{n.perk.tier === 4 ? ' · capstone' : ''} · {st === 'owned' ? 'learned' : st}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- selected node detail + unlock ---- */}
        {selPerk && selRow && (
          <div
            className="mt-2 rounded border p-2.5"
            style={{
              borderColor: selRow.state === 'owned' ? GOOD : LINE,
              background: selRow.state === 'owned' ? '#101812' : PANEL,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-[#d7dde5]">
                  {selPerk.tier === 4 ? '★ ' : ''}{selPerk.name}{' '}
                  <span className="text-[10px]" style={{ color: DIM }}>
                    {tree.name} · T{selPerk.tier}{selPerk.tier === 4 ? ' · capstone' : ''}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: DIM }}>{selPerk.desc}</div>
                {(selPerk.requires ?? []).length > 0 && (
                  <div className="mt-0.5 text-[10px]" style={{ color: DIM }}>
                    Requires: {(selPerk.requires ?? []).map((id) => {
                      const rp = perkById(id);
                      const have = perks.includes(id);
                      return `${have ? '✓' : '✗'} ${rp?.name ?? id}`;
                    }).join('  ·  ')}
                  </div>
                )}
                {selRow.state === 'locked' && (
                  <div className="mt-0.5 text-[10px]" style={{ color: '#d9534f' }}>{selRow.reason}</div>
                )}
              </div>
              {selRow.state === 'owned' ? (
                <span className="shrink-0 text-[11px]" style={{ color: GOOD }}>Learned</span>
              ) : (
                <button
                  onClick={() => { sfx.play('ui'); buyPerk(selPerk.id); }}
                  disabled={selRow.state !== 'available'}
                  className="shrink-0 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ borderColor: LINE, color: AMBER }}
                >
                  Learn (1)
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** §6.3 HUD light indicator (Lane 11 mounts this in HUD.tsx): an eye that
 *  fills as exposure climbs. Purely presentational — the band/fill come
 *  from game/visibility.lightIndicator so display and perception can
 *  never disagree. */
export function LightIndicator({ exposure }: { exposure: number }) {
  const m = lightIndicator(exposure);
  const color =
    m.band === 'spotted' ? '#d9534f' : m.band === 'watched' ? AMBER : m.band === 'dim' ? DIM : GOOD;
  const fillH = Math.round(14 * m.fill);
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Exposure ${Math.round(m.fill * 100)}% — ${m.label}`}
      aria-label={`Visibility: ${m.label}`}
    >
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
        <path
          d="M1 7 C4.5 2.5 8 1 11 1 C14 1 17.5 2.5 21 7 C17.5 11.5 14 13 11 13 C8 13 4.5 11.5 1 7 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.4"
        />
        <clipPath id="li-eye-clip">
          <path d="M1 7 C4.5 2.5 8 1 11 1 C14 1 17.5 2.5 21 7 C17.5 11.5 14 13 11 13 C8 13 4.5 11.5 1 7 Z" />
        </clipPath>
        <g clipPath="url(#li-eye-clip)">
          <rect x="0" y={14 - fillH} width="22" height={fillH} fill={color} opacity="0.45" />
        </g>
        <circle cx="11" cy="7" r={1.2 + m.fill * 1.6} fill={color} />
      </svg>
      <span className="text-[10px] font-medium" style={{ color }}>{m.label}</span>
    </div>
  );
}
