import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';
import { sfx } from '../systems/audio';

function Bar({
  value,
  max,
  fill,
  bg,
}: {
  value: number;
  max: number;
  fill: string;
  bg: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded ${bg}`}>
      <div className={`h-full rounded transition-all duration-200 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function VehiclePanel() {
  const vehicle = useGameStore((s) => s.vehicle);
  if (!vehicle) return null;
  return (
    <div className="absolute bottom-4 left-4 w-52 rounded bg-[#141a21]/85 p-3 backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8b34b]">{vehicle.name}</span>
        <span className="font-mono text-lg text-[#d7dde5]">{vehicle.speedKmh}<span className="text-xs text-[#8a94a3]"> km/h</span></span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-[#8a94a3]">
        <span>Fuel</span>
        <span>{Math.round(vehicle.fuelPct * 100)}%</span>
      </div>
      <Bar value={vehicle.fuelPct} max={1} fill={vehicle.fuelPct < 0.15 ? 'bg-[#d9534f]' : 'bg-[#c9a44a]'} bg="bg-[#232b36]" />
      <div className="mb-1 mt-2 flex items-center justify-between text-[11px] text-[#8a94a3]">
        <span>Condition</span>
        <span>{Math.round(vehicle.condPct * 100)}%</span>
      </div>
      <Bar value={vehicle.condPct} max={1} fill={vehicle.condPct < 0.3 ? 'bg-[#d9534f]' : 'bg-[#5aa469]'} bg="bg-[#232b36]" />
      <div className="mt-2 text-[11px] text-[#8a94a3]">W/S drive · A/D steer · F exit</div>
    </div>
  );
}

function Clock() {
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const hh = String(Math.floor(timeMinutes / 60)).padStart(2, '0');
  const mm = String(Math.floor(timeMinutes % 60)).padStart(2, '0');
  const night = timeMinutes >= 1080 || timeMinutes < 360;
  return (
    <div className="flex items-center gap-2 rounded border border-[#232b36] bg-[#0b0e12]/80 px-3 py-1.5">
      <span className="text-sm" aria-label={night ? 'night' : 'day'}>
        {night ? '☾' : '☀'}
      </span>
      <span className="font-mono text-sm text-[#d7dde5]">
        {hh}:{mm}
      </span>
    </div>
  );
}

function Crosshair() {
  const meleeTarget = useGameStore((s) => s.meleeTarget);
  const hitmark = useGameStore((s) => s.hitmark);
  const [, setTick] = useState(0);
  // fade the hitmarker out after ~180ms
  useEffect(() => {
    if (!hitmark) return;
    const t = setTimeout(() => setTick((n) => n + 1), 190);
    return () => clearTimeout(t);
  }, [hitmark]);
  const showMark = hitmark && Date.now() - hitmark.at < 190;
  const kill = hitmark?.kind === 'kill';
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
      {/* center dot */}
      <div
        className={`absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-100 ${
          meleeTarget ? 'bg-[#e8b34b]' : 'bg-[#d7dde5]/80'
        }`}
      />
      {/* brackets: tight when idle, splayed when a husk is in melee reach */}
      {([-1, -1, 1, 1] as const).map((sx, i) => (
        <div
          key={i}
          className={`absolute h-0.5 w-2 rounded transition-all duration-100 ${
            meleeTarget ? 'bg-[#e8b34b]' : 'bg-[#d7dde5]/50'
          }`}
          style={{
            left: `calc(50% + ${sx * (meleeTarget ? 10 : 6)}px)`,
            top: i < 2 ? `calc(50% - ${(meleeTarget ? 10 : 6) + 1}px)` : `calc(50% + ${meleeTarget ? 9 : 5}px)`,
          }}
        />
      ))}
      {/* hitmarker X flash */}
      {showMark && (
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold ${
            kill ? 'text-[#d9534f]' : 'text-[#e8b34b]'
          }`}
          style={{ textShadow: '0 0 6px rgba(0,0,0,0.8)' }}
        >
          ✕
        </div>
      )}
    </div>
  );
}

function Hotbar() {
  const hotbar = useGameStore((s) => s.hotbar);
  const inventory = useGameStore((s) => s.inventory);
  const useHotbar = useGameStore((s) => s.useHotbar);
  return (
    <div className="flex gap-2">
      {hotbar.map((uid, i) => {
        const item = uid ? inventory.find((x) => x.uid === uid) : undefined;
        const def = item ? ITEMS[item.itemId] : undefined;
        return (
          <button
            key={i}
            onClick={() => {
              sfx.play('ui');
              useHotbar(i);
            }}
            aria-label={`Hotbar ${i + 1}${def ? `: use ${def.name}` : ''}`}
            className="flex h-14 w-16 flex-col items-center justify-center rounded border border-[#232b36] bg-[#0b0e12]/80 px-1 transition-colors hover:border-[#e8b34b]"
          >
            <span className="text-[10px] text-[#8a94a3]">{i + 1}</span>
            <span className="w-full truncate text-center text-xs text-[#d7dde5]">
              {def ? def.name : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuestTracker() {
  const quest = useGameStore((s) => s.quests[0]);
  if (!quest) {
    return (
      <div className="rounded border border-[#232b36] bg-[#0b0e12]/80 px-3 py-2 text-xs text-[#8a94a3]">
        No active quests
      </div>
    );
  }
  const def = QUESTS.find((d) => d.id === quest.id);
  if (!def) return null;
  const step = def.steps[quest.stepIndex];
  return (
    <div className="max-w-64 rounded border border-[#232b36] bg-[#0b0e12]/80 px-3 py-2">
      <div className="text-xs font-semibold text-[#e8b34b]">{def.title}</div>
      {step ? (
        <div className="mt-1 text-xs text-[#d7dde5]">
          {step.objective}
          {step.count > 1 && (
            <span className="ml-2 font-mono text-[#8a94a3]">
              {Math.min(quest.progress, step.count)}/{step.count}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#8a94a3]">Wrapping up…</div>
      )}
    </div>
  );
}

function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const dismissToast = useGameStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none absolute bottom-24 left-4 z-30 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="pointer-events-auto max-w-72 rounded border border-[#232b36] bg-[#12161c]/95 px-3 py-2 text-left text-sm text-[#d7dde5] shadow-lg"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

function BatteryIcon() {
  const battery = useGameStore((s) => s.battery);
  const phoneUnlocked = useGameStore((s) => s.phoneUnlocked);
  if (!phoneUnlocked) return null;
  const pct = Math.round(battery);
  const color = pct > 50 ? 'bg-[#5aa469]' : pct > 20 ? 'bg-[#e8b34b]' : 'bg-[#d9534f]';
  return (
    <div className="flex items-center gap-1.5" aria-label={`Phone battery ${pct}%`}>
      <div className="h-3.5 w-7 rounded-sm border border-[#232b36] p-0.5">
        <div className={`h-full rounded-sm ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-[#8a94a3]">{pct}</span>
    </div>
  );
}

export default function HUD() {
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const stamina = useGameStore((s) => s.stamina);
  const maxStamina = useGameStore((s) => s.maxStamina);
  const interactPrompt = useGameStore((s) => s.interactPrompt);
  const noiseLevel = useGameStore((s) => s.noiseLevel);
  const search = useGameStore((s) => s.search);
  const lowHp = hp / maxHp < 0.3 && hp > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {lowHp && (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 55%, rgba(217,83,79,0.45) 100%)',
          }}
        />
      )}

      {/* hold-to-search progress */}
      {search && (
        <div className="absolute left-1/2 top-[58%] w-64 -translate-x-1/2">
          <div className="mb-1 text-center text-xs uppercase tracking-wider text-[#d7dde5]">
            Searching {search.label.replace(/^Search /, '').replace(/^Pick /, '')}…
          </div>
          <div className="h-2 overflow-hidden rounded bg-[#232b36]">
            <div
              className="h-full rounded bg-[#e8b34b]"
              style={{ width: `${Math.round(search.frac * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* crosshair */}
      <Crosshair />

      {/* vitals, top-left */}
      <div className="absolute left-4 top-4 w-56">
        <div className="mb-1 flex items-center justify-between text-xs text-[#8a94a3]">
          <span>Health</span>
          <span className="font-mono">
            {Math.ceil(hp)}/{maxHp}
          </span>
        </div>
        <Bar value={hp} max={maxHp} fill={lowHp ? 'bg-[#d9534f]' : 'bg-[#5aa469]'} bg="bg-[#232b36]" />
        <div className="mb-1 mt-2 flex items-center justify-between text-xs text-[#8a94a3]">
          <span>Stamina</span>
        </div>
        <Bar value={stamina} max={maxStamina} fill="bg-[#e8b34b]" bg="bg-[#232b36]" />
        <div className="mb-1 mt-2 flex items-center justify-between text-xs text-[#8a94a3]">
          <span>Noise</span>
          <span className={noiseLevel > 60 ? 'text-[#d9534f]' : noiseLevel > 25 ? 'text-[#e8b34b]' : ''}>
            {noiseLevel > 60 ? 'LOUD' : noiseLevel > 25 ? 'audible' : 'quiet'}
          </span>
        </div>
        <Bar
          value={noiseLevel}
          max={100}
          fill={noiseLevel > 60 ? 'bg-[#d9534f]' : noiseLevel > 25 ? 'bg-[#e8b34b]' : 'bg-[#3b6a8a]'}
          bg="bg-[#232b36]"
        />
      </div>

      {/* clock + battery, top-right */}
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <BatteryIcon />
        <Clock />
      </div>

      {/* quest tracker, below clock */}
      <div className="absolute right-4 top-16">
        <QuestTracker />
      </div>

      {/* hotbar, bottom-center */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
        <Hotbar />
      </div>
      <VehiclePanel />

      {/* controls hint, desktop only */}
      {!('ontouchstart' in window) && (
        <div className="pointer-events-none absolute bottom-4 right-4 hidden text-right text-[11px] leading-relaxed text-[#8a94a3] md:block">
          WASD move · Shift run · Space jump · C crouch · Q/E lean · V 1st/3rd · wheel zoom
          <br />LMB punch · RMB block/fire · F interact · G pack · Tab phone
        </div>
      )}

      {/* interact prompt, above hotbar */}
      {interactPrompt && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded border border-[#232b36] bg-[#0b0e12]/85 px-4 py-2">
            <span className="rounded border border-[#e8b34b] px-2 py-0.5 font-mono text-sm text-[#e8b34b]">
              F
            </span>
            <span className="text-sm text-[#d7dde5]">{interactPrompt}</span>
          </div>
        </div>
      )}

      <Toasts />
    </div>
  );
}
