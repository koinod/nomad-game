// ui/SkillsPanel.tsx — the §6 skills & archetypes panel (Lane 8).
//
// A standalone, store-driven panel: skill levels + XP bars, perk points,
// and the four archetype trees with REAL gate states — every lock reason
// comes from the engine (systems/skills.canBuyPerk), never re-derived
// here, so what the panel shows is what the rules enforce. Learn buttons
// call the store's buyPerk (the live action) until Lane 5 re-implements
// it over the engine (see systems/skills.ts header).
//
// MOUNTING (Lane 5 / integration): Phone.tsx already has a compact
// SkillsTab in the Character app; this panel is the full §6.2 surface
// (tier chains, capstone exclusivity, lock reasons). Mount it in the
// Character app in place of / alongside SkillsTab:
//   import SkillsPanel, { LightIndicator } from './SkillsPanel';
//   <SkillsPanel />
// LightIndicator is Lane 11's HUD element (§6.3): render it from the
// per-frame exposure — <LightIndicator exposure={vis.exposure} />.

import { PERKS, SKILLS, TREES, perkById, xpToNext } from '../data/skills';
import { canBuyPerk, capstoneOwned } from '../systems/skills';
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

      {TREES.map((tree) => (
        <section key={tree.id}>
          <h3 className="mb-1 text-xs font-semibold" style={{ color: DIM }}>{tree.name}</h3>
          <p className="mb-2 text-[11px]" style={{ color: DIM }}>{tree.blurb}</p>
          <div className="flex flex-col gap-1.5">
            {PERKS.filter((p) => p.tree === tree.id).map((p) => {
              const owned = perks.includes(p.id);
              const check = owned ? null : canBuyPerk(perks, perkPoints, p.id);
              const reqNames = (p.requires ?? [])
                .map((id) => perkById(id)?.name ?? id)
                .join(' + ');
              return (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 rounded border p-2"
                  style={{
                    borderColor: owned ? GOOD : LINE,
                    background: owned ? '#101812' : PANEL,
                    opacity: !owned && check && !check.ok && perkPoints > 0 ? 0.75 : 1,
                  }}
                >
                  <div>
                    <div className="text-xs font-medium text-[#d7dde5]">
                      {p.tier === 4 ? '★ ' : ''}{p.name}{' '}
                      <span className="text-[10px]" style={{ color: DIM }}>
                        T{p.tier}{p.tier === 4 ? ' · capstone' : ''}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: DIM }}>{p.desc}</div>
                    {!owned && reqNames && (
                      <div className="text-[10px]" style={{ color: DIM }}>Requires: {reqNames}</div>
                    )}
                    {!owned && check && !check.ok && (
                      <div className="text-[10px]" style={{ color: '#d9534f' }}>{check.reason}</div>
                    )}
                  </div>
                  {!owned && (
                    <button
                      onClick={() => { sfx.play('ui'); buyPerk(p.id); }}
                      disabled={!check?.ok}
                      className="shrink-0 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ borderColor: LINE, color: AMBER }}
                    >
                      Learn (1)
                    </button>
                  )}
                  {owned && <span className="shrink-0 text-[11px]" style={{ color: GOOD }}>Learned</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
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
