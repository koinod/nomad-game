import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { input } from '../game/input';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';
import { sfx } from '../systems/audio';

const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

/** Noise meter: loudest recent sound, decays toward silence (engine-owned). */
function NoiseMeter({ pill }: { pill?: boolean }) {
  const noiseLevel = useGameStore((s) => s.noiseLevel);
  const loud = noiseLevel > 60;
  const audible = noiseLevel > 25;
  const label = loud ? 'LOUD' : audible ? 'audible' : 'quiet';
  const labelColor = loud ? 'text-[#d9534f]' : audible ? 'text-[#e8b34b]' : 'text-[#8a94a3]';
  const fill = loud ? 'bg-[#d9534f]' : audible ? 'bg-[#e8b34b]' : 'bg-[#3b6a8a]';
  if (pill) {
    return (
      <div
        className="flex items-center gap-2 rounded-full border border-[#232b36] bg-[#0b0e12]/85 px-3 py-1.5"
        aria-label={`Noise: ${label}`}
      >
        <span className="text-xs">🔊</span>
        <div className="h-1.5 w-16 overflow-hidden rounded bg-[#232b36]">
          <div className={`h-full rounded ${fill}`} style={{ width: `${Math.round(noiseLevel)}%` }} />
        </div>
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
      </div>
    );
  }
  return (
    <>
      <div className="mb-1 mt-2 flex items-center justify-between text-xs text-[#8a94a3]">
        <span>Noise</span>
        <span className={labelColor}>{label}</span>
      </div>
      <Bar value={noiseLevel} max={100} fill={fill} bg="bg-[#232b36]" />
    </>
  );
}

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
      <div className="mt-2 text-[11px] text-[#8a94a3]">
        {vehicle.kind === 'heli' ? 'WASD cyclic · SPACE climb · C dive · Q/E yaw · F exit' : 'W/S drive · A/D steer · F exit'}
      </div>
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

function AmmoCounter() {
  const rangedUid = useGameStore((s) => s.equipped.ranged);
  const inventory = useGameStore((s) => s.inventory);
  const inst = rangedUid ? inventory.find((i) => i.uid === rangedUid) : undefined;
  const def = inst ? ITEMS[inst.itemId] : undefined;
  if (!inst || !def || def.magSize == null || !def.ammoId) return null;
  const cap = Math.round(def.magSize * (inst.mods?.includes('extended_mag') ? 1.5 : 1));
  const loaded = inst.loaded ?? cap;
  const reserve = inventory
    .filter((i) => i.itemId === def.ammoId)
    .reduce((a, i) => a + i.qty, 0);
  const cond = Math.round(inst.condition ?? 100);
  return (
    <div className="absolute bottom-24 right-4 rounded border border-[#232b36] bg-[#0b0e12]/80 px-3 py-1.5 text-right">
      <div className={`font-mono text-lg leading-none ${loaded === 0 ? 'text-[#d9534f]' : 'text-[#d7dde5]'}`}>
        {loaded}<span className="text-xs text-[#8a94a3]"> / {cap}</span>
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#8a94a3]">
        {inst.jammed
          ? <span className="text-[#d9534f]">jammed — R to clear</span>
          : loaded === 0 ? (reserve > 0 ? 'R — reload' : 'no ammo') : `reserve ${reserve}`}
      </div>
      <div className={`mt-0.5 text-[10px] uppercase tracking-wider ${cond < 30 ? 'text-[#d9534f]' : cond < 60 ? 'text-[#e8b34b]' : 'text-[#5c6773]'}`}>
        condition {cond}%
      </div>
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
  const headshot = hitmark?.kind === 'headshot';
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
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-bold ${
            headshot ? 'text-2xl' : 'text-xl'
          } ${kill ? 'text-[#d9534f]' : headshot ? 'text-[#ffd76a]' : 'text-[#e8b34b]'}`}
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
  // touch: compact vertical strip for the right thumb; desktop: bottom-center row
  return (
    <div className={isTouch ? 'flex flex-col gap-2' : 'flex gap-2'}>
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
            className={
              isTouch
                ? 'flex h-11 w-12 flex-col items-center justify-center rounded border border-[#232b36] bg-[#0b0e12]/80 px-1 active:border-[#e8b34b]'
                : 'flex h-14 w-16 flex-col items-center justify-center rounded border border-[#232b36] bg-[#0b0e12]/80 px-1 transition-colors hover:border-[#e8b34b]'
            }
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
  const search = useGameStore((s) => s.search);
  const lowHp = hp / maxHp < 0.3 && hp > 0;
  // engine prompts carry the desktop "[F] " prefix; the key cap is rendered
  // adaptively (F on desktop, USE on touch) so strip it from the text.
  const promptText = interactPrompt?.replace(/^\[F\] /, '') ?? null;
  const promptKey = isTouch ? 'USE' : 'F';
  // "Pick safe (locked)" should read as picking, not searching
  const searchIsPick = search?.label.startsWith('Pick') ?? false;
  const searchSubject = (search?.label ?? '')
    .replace(/^Search /, '')
    .replace(/^Pick /, '');

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* safe-area wrapper so HUD elements clear the notch/home indicator */}
      <div
        className="relative h-full w-full"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
      {lowHp && (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 55%, rgba(217,83,79,0.45) 100%)',
          }}
        />
      )}

      {/* hold-to-search progress + explicit cancel (tap = input.interact edge,
          which the engine now treats as a cancel while searching) */}
      {search && (
        <div className="absolute left-1/2 top-[58%] w-64 -translate-x-1/2">
          <div className="mb-1 text-center text-xs uppercase tracking-wider text-[#d7dde5]">
            {searchIsPick ? 'Picking' : 'Searching'} {searchSubject}…
          </div>
          <div className="h-2 overflow-hidden rounded bg-[#232b36]">
            <div
              className="h-full rounded bg-[#e8b34b]"
              style={{ width: `${Math.round(search.frac * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => {
                input.interact = true;
              }}
              aria-label="Cancel search"
              className="pointer-events-auto rounded border border-[#232b36] bg-[#0b0e12]/85 px-4 py-1.5 text-xs uppercase tracking-wider text-[#8a94a3] active:border-[#d9534f] active:text-[#d9534f]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* crosshair */}
      <Crosshair />

      {/* vitals, top-left — compact on touch (noise lives in its own pill) */}
      <div className={`absolute left-4 top-4 ${isTouch ? 'w-40' : 'w-56'}`}>
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
        {!isTouch && <NoiseMeter />}
      </div>

      {/* noise pill, touch only — top-center, clear of the combat cluster */}
      {isTouch && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2">
          <NoiseMeter pill />
        </div>
      )}

      {/* clock + battery, top-right */}
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <BatteryIcon />
        <Clock />
      </div>

      {/* quest tracker, below clock */}
      <div className="absolute right-4 top-16">
        <QuestTracker />
      </div>

      {/* hotbar: desktop bottom-center row; touch right-edge vertical strip
          for the right thumb (bottom-center is the weapon bar's zone) */}
      {isTouch ? (
        <div className="pointer-events-auto absolute right-3 top-[38%]">
          <Hotbar />
        </div>
      ) : (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
          <Hotbar />
        </div>
      )}
      <VehiclePanel />
      <AmmoCounter />

      {/* controls hint, desktop only */}
      {!('ontouchstart' in window) && (
        <div className="pointer-events-none absolute bottom-4 right-4 hidden text-right text-[11px] leading-relaxed text-[#8a94a3] md:block">
          WASD move · Shift run · Space jump · C crouch · Q/E lean · V 1st/3rd · wheel zoom
          <br />LMB punch · RMB block/fire · F interact · G pack · Tab phone
        </div>
      )}

      {/* interact prompt: desktop bottom-center; touch right side above the
          USE button so it never sits under the weapon bar */}
      {promptText && (
        <div
          className={
            isTouch
              ? 'absolute bottom-[19rem] right-6'
              : 'absolute bottom-24 left-1/2 -translate-x-1/2'
          }
        >
          <div className="flex items-center gap-2 rounded border border-[#232b36] bg-[#0b0e12]/85 px-4 py-2">
            <span className="rounded border border-[#e8b34b] px-2 py-0.5 font-mono text-sm text-[#e8b34b]">
              {promptKey}
            </span>
            <span className="text-sm text-[#d7dde5]">{promptText}</span>
          </div>
        </div>
      )}

      <Toasts />
      </div>
    </div>
  );
}
