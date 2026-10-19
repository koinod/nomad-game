import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';
import { sfx } from '../systems/audio';

export default function DeathOverlay() {
  const dead = useGameStore((s) => s.dead);
  const deathCause = useGameStore((s) => s.deathCause);
  const difficulty = useGameStore((s) => s.difficulty);
  const setScreen = useGameStore((s) => s.setScreen);
  const respawn = useGameStore((s) => s.respawn);

  if (!dead) return null;

  const permadeath = DIFFICULTIES[difficulty].permadeath;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-sm rounded border border-[#232b36] bg-[#12161c] p-8 text-center">
        <h2 className="text-3xl font-semibold text-[#d9534f]">You died</h2>
        <p className="mt-2 text-sm text-[#8a94a3]">
          {deathCause ?? 'The island took you.'}
        </p>
        <div className="mt-8">
          {permadeath ? (
            <button
              onClick={() => {
                sfx.play('ui');
                setScreen('title');
              }}
              className="w-full rounded bg-[#d9534f] px-6 py-3 font-semibold text-[#0b0e12] transition-colors hover:bg-[#e06a66]"
            >
              Run over
            </button>
          ) : (
            <button
              onClick={() => {
                sfx.play('ui');
                respawn();
              }}
              className="w-full rounded bg-[#e8b34b] px-6 py-3 font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
            >
              Respawn
            </button>
          )}
        </div>
        {!permadeath && (
          <p className="mt-3 text-xs text-[#8a94a3]">
            You wake at your last campfire with half your strength.
          </p>
        )}
      </div>
    </div>
  );
}
