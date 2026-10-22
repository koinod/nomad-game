import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';
import { sfx } from '../systems/audio';

export default function PauseMenu() {
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const setScreen = useGameStore((s) => s.setScreen);
  const saveToSlot = useGameStore((s) => s.saveToSlot);
  const difficulty = useGameStore((s) => s.difficulty);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const audioVolume = useGameStore((s) => s.audioVolume);
  const setAudioMuted = useGameStore((s) => s.setAudioMuted);
  const setAudioVolume = useGameStore((s) => s.setAudioVolume);
  const canSave = DIFFICULTIES[difficulty].saveAnywhere;

  if (!paused) return null;

  const tap = (fn: () => void) => () => {
    sfx.play('ui');
    fn();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-xs rounded border border-[#232b36] bg-[#12161c] p-6">
        <h2 className="mb-6 text-center text-xl font-semibold text-[#d7dde5]">Paused</h2>
        <div className="flex flex-col gap-3">
          <button
            onClick={tap(() => setPaused(false))}
            className="rounded bg-[#e8b34b] px-6 py-2.5 font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
          >
            Resume
          </button>
          {canSave ? (
            <div className="flex flex-col gap-2">
              <div className="text-center text-xs text-[#8a94a3]">Save to slot</div>
              <div className="flex gap-2">
                {['1', '2', '3'].map((slot) => (
                  <button
                    key={slot}
                    onClick={tap(() => void saveToSlot(slot))}
                    className="flex-1 rounded border border-[#232b36] bg-[#0b0e12] px-3 py-2 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
                  >
                    Slot {slot}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-[#8a94a3]">Save at campfires.</p>
          )}
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs text-[#8a94a3]">Sound</div>
            <div className="flex items-center gap-3">
              <button
                onClick={tap(() => setAudioMuted(!audioMuted))}
                className="flex-1 rounded border border-[#232b36] bg-[#0b0e12] px-3 py-2 text-sm text-[#d7dde5] transition-colors hover:border-[#e8b34b]"
              >
                {audioMuted ? 'Unmute' : 'Mute'}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audioVolume * 100)}
                disabled={audioMuted}
                onChange={(e) => setAudioVolume(Number(e.target.value) / 100)}
                className="flex-1 accent-[#e8b34b] disabled:opacity-40"
                aria-label="Master volume"
              />
              <span className="w-10 text-right text-xs text-[#8a94a3]">
                {audioMuted ? 'off' : `${Math.round(audioVolume * 100)}%`}
              </span>
            </div>
          </div>
          <button
            onClick={tap(() => setScreen('title'))}
            className="rounded border border-[#232b36] bg-[#0b0e12] px-6 py-2.5 text-sm text-[#d9534f] transition-colors hover:border-[#d9534f]"
          >
            Quit to title
          </button>
        </div>
      </div>
    </div>
  );
}
