// SleepDialog.tsx — Skyrim-style rest at campfires. Choose how long to sleep;
// the engine blocks it when husks are near and applies heal/rested effects.

import { useGameStore } from '../store/gameStore';
import { getGame } from '../game/instance';
import { sfx } from '../systems/audio';

const OPTIONS = [1, 2, 4, 8];

function fmt(minutes: number): string {
  const t = minutes % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

export default function SleepDialog() {
  const open = useGameStore((s) => s.sleepOpen);
  const closeSleep = useGameStore((s) => s.closeSleep);
  const timeMinutes = useGameStore((s) => s.timeMinutes);

  if (!open) return null;

  const close = () => {
    sfx.play('ui');
    closeSleep();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        className="w-[340px] rounded border border-[#232b36] bg-[#0b0e12] p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sleep"
      >
        <div className="mb-1 text-sm font-semibold text-[#d7dde5]">Rest at the campfire</div>
        <p className="mb-3 text-xs text-[#8a94a3]">
          It's {fmt(timeMinutes)}. Sleeping heals and restores stamina — a full 8 hours leaves you well rested. Husks
          nearby will keep you awake.
        </p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => {
                sfx.play('ui');
                getGame()?.trySleep(h);
              }}
              className="flex items-center justify-between rounded border border-[#232b36] bg-[#12161c] px-3 py-2 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
            >
              <span>
                Sleep {h} hour{h === 1 ? '' : 's'}
                {h === 8 && <span className="ml-2 text-xs text-[#5aa469]">well rested</span>}
              </span>
              <span className="font-mono text-xs text-[#8a94a3]">wake {fmt(timeMinutes + h * 60)}</span>
            </button>
          ))}
          <button
            onClick={close}
            className="mt-1 rounded border border-[#232b36] px-3 py-2 text-sm text-[#8a94a3] transition-colors hover:border-[#d7dde5] hover:text-[#d7dde5]"
          >
            Stay awake
          </button>
        </div>

        {/* fast travel: walk the island's back paths between camps — time passes */}
        <TravelSection />
      </div>
    </div>
  );
}

function TravelSection() {
  const timeMinutes = useGameStore((s) => s.timeMinutes);
  const camps = getGame()?.campOptions() ?? [];
  const here = getGame()?.currentCampId();
  const others = camps.filter((c) => c.id !== here);
  if (others.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[#232b36] pt-3">
      <div className="mb-2 text-xs text-[#8a94a3]">Travel the island's back paths</div>
      <div className="flex flex-col gap-2">
        {others.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              sfx.play('ui');
              getGame()?.travelTo(c.id);
            }}
            className="flex items-center justify-between rounded border border-[#232b36] bg-[#12161c] px-3 py-2 text-sm text-[#d7dde5] transition-colors hover:border-[#5aa469]"
          >
            <span>{c.name}</span>
            <span className="font-mono text-xs text-[#8a94a3]">leave {fmt(timeMinutes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
