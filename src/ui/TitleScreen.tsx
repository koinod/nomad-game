import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { sfx } from '../systems/audio';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

const CONTROLS: [string, string][] = [
  ['Move', 'WASD or arrow keys'],
  ['Sprint', 'Hold Shift'],
  ['Jump', 'Space'],
  ['Crouch (quiet)', 'C or Ctrl'],
  ['Lean', 'Hold Q / E'],
  ['Look', 'Click the world to capture the mouse'],
  ['Interact', 'Tap E'],
  ['Melee', 'F or left click'],
  ['Block (melee) / Fire', 'Hold right click to block · tap to fire'],
  ['Pack / inventory', 'G'],
  ['Phone', 'Tab or P'],
  ['Hotbar', '1, 2, 3'],
  ['Pause', 'Esc'],
];

export default function TitleScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const refreshSlots = useGameStore((s) => s.refreshSlots);
  const loadFromSlot = useGameStore((s) => s.loadFromSlot);
  const deleteSlot = useGameStore((s) => s.deleteSlot);
  const saveSlots = useGameStore((s) => s.saveSlots);
  const [showSlots, setShowSlots] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);

  const tap = (fn: () => void) => () => {
    sfx.play('ui');
    fn();
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#0b0e12]">
      {/* backdrop: subtle radial glow + horizon line */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 110%, rgba(232,179,75,0.14), transparent 60%), radial-gradient(ellipse 60% 40% at 50% -10%, rgba(35,43,54,0.5), transparent 70%)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center px-6">
        <h1 className="text-7xl font-bold tracking-[0.35em] text-[#d7dde5] sm:text-8xl">
          NOMAD
        </h1>
        <p className="mt-3 text-sm text-[#8a94a3]">
          A survival story on the outer banks
        </p>
        <div className="mt-10 flex w-64 flex-col gap-3">
          <button
            onClick={tap(() => setScreen('difficulty'))}
            className="rounded border border-[#e8b34b] bg-[#e8b34b] px-6 py-3 text-base font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
          >
            New game
          </button>
          <button
            onClick={tap(async () => {
              await refreshSlots();
              setShowSlots((v) => !v);
            })}
            className="rounded border border-[#232b36] bg-[#12161c] px-6 py-3 text-base text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            Continue
          </button>
          <button
            onClick={tap(() => setShowHelp(true))}
            className="rounded border border-[#232b36] bg-[#12161c] px-6 py-3 text-base text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
          >
            How to play
          </button>
        </div>

        {showSlots && (
          <div className="mt-6 w-80 rounded border border-[#232b36] bg-[#12161c] p-4">
            <div className="mb-3 text-sm font-semibold text-[#d7dde5]">Save slots</div>
            {saveSlots.length === 0 && (
              <p className="text-sm text-[#8a94a3]">No saves yet. Start a new game.</p>
            )}
            <div className="flex flex-col gap-2">
              {saveSlots.map((meta) => (
                <div
                  key={meta.slot}
                  className="flex items-center justify-between gap-2 rounded border border-[#232b36] bg-[#0b0e12] px-3 py-2"
                >
                  <button
                    onClick={tap(() => void loadFromSlot(meta.slot))}
                    className="flex-1 text-left"
                  >
                    <div className="text-sm font-medium text-[#d7dde5]">
                      {meta.label}
                      {meta.slot === 'auto' && (
                        <span className="ml-2 text-xs text-[#8a94a3]">auto</span>
                      )}
                    </div>
                    <div className="text-xs text-[#8a94a3]">
                      {fmtDate(meta.savedAt)} — {meta.playMinutes} min — {meta.difficulty}
                    </div>
                  </button>
                  {meta.slot !== 'auto' && (
                    <button
                      onClick={tap(() => void deleteSlot(meta.slot))}
                      aria-label={`Delete ${meta.label}`}
                      className="rounded px-2 py-1 text-sm text-[#8a94a3] hover:text-[#d9534f]"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showHelp && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="nomad-scroll w-full max-w-md rounded border border-[#232b36] bg-[#12161c] p-6">
            <h2 className="mb-4 text-xl font-semibold text-[#d7dde5]">How to play</h2>
            <p className="mb-4 text-sm leading-relaxed text-[#8a94a3]">
              The island went dark. Scavenge, stay quiet, keep the light in sight.
              Your phone is your lifeline — charge it at campfires.
            </p>
            <div className="mb-6 flex flex-col gap-2">
              {CONTROLS.map(([action, keys]) => (
                <div key={action} className="flex items-center justify-between text-sm">
                  <span className="text-[#d7dde5]">{action}</span>
                  <span className="rounded border border-[#232b36] bg-[#0b0e12] px-2 py-0.5 text-xs text-[#8a94a3]">
                    {keys}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={tap(() => setShowHelp(false))}
              className="w-full rounded bg-[#e8b34b] px-6 py-2.5 font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
