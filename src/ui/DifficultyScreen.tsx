import { useGameStore } from '../store/gameStore';
import { DIFFICULTIES } from '../store/types';
import type { DifficultyId } from '../store/types';
import { sfx } from '../systems/audio';

const ORDER: DifficultyId[] = ['story', 'survivor', 'hardcore'];

function diffs(id: DifficultyId): string[] {
  const d = DIFFICULTIES[id];
  const out: string[] = [];
  out.push(d.saveAnywhere ? 'Save anywhere' : 'Save at campfires only');
  out.push(d.permadeath ? 'Death ends the run' : 'Respawn at last campfire');
  out.push(`Husk damage ×${d.huskDamage}`);
  out.push(`Supplies ×${d.resourceMult}`);
  if (d.carryBonus > 0) out.push(`Carry +${Math.round(d.carryBonus * 100)}%`);
  return out;
}

export default function DifficultyScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0e12] p-6">
      <h1 className="mb-2 text-3xl font-semibold text-[#d7dde5]">Choose your run</h1>
      <p className="mb-8 text-sm text-[#8a94a3]">This sets the rules for the whole island.</p>
      <div className="flex w-full max-w-4xl flex-col gap-4 sm:flex-row">
        {ORDER.map((id) => {
          const d = DIFFICULTIES[id];
          return (
            <div
              key={id}
              className="flex flex-1 flex-col rounded border border-[#232b36] bg-[#12161c] p-6 transition-colors hover:border-[#e8b34b]"
            >
              <h2 className="text-xl font-semibold text-[#e8b34b]">{d.label}</h2>
              <p className="mt-2 min-h-16 text-sm leading-relaxed text-[#8a94a3]">{d.tagline}</p>
              <ul className="mb-6 mt-2 flex flex-col gap-1.5">
                {diffs(id).map((line) => (
                  <li key={line} className="text-sm text-[#d7dde5]">
                    <span className="mr-2 text-[#5aa469]">+</span>
                    {line}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  sfx.play('ui');
                  startNewGame(id);
                }}
                className="mt-auto rounded bg-[#e8b34b] px-6 py-2.5 font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
              >
                Start {d.label}
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => {
          sfx.play('ui');
          setScreen('title');
        }}
        className="mt-8 rounded border border-[#232b36] bg-[#12161c] px-6 py-2 text-sm text-[#8a94a3] transition-colors hover:border-[#e8b34b] hover:text-[#d7dde5]"
      >
        Back
      </button>
    </div>
  );
}
