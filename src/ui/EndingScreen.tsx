import { useGameStore } from '../store/gameStore';
import { ENDING_LINES } from '../narrative/dialogue';
import { QUESTS } from '../data/quests';
import { sfx } from '../systems/audio';

function fmtPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function EndingScreen() {
  const endingChoice = useGameStore((s) => s.endingChoice);
  const setScreen = useGameStore((s) => s.setScreen);
  const playSeconds = useGameStore((s) => s.playSeconds);
  const doneQuests = useGameStore((s) => s.doneQuests);
  const rep = useGameStore((s) => s.rep);

  const title = endingChoice === 'dark' ? 'THE DARK' : 'THE LIGHTHOUSE';
  const recap = ENDING_LINES.slice(-2);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#0b0e12] p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            endingChoice === 'dark'
              ? 'radial-gradient(ellipse 70% 50% at 50% 115%, rgba(60,20,20,0.6), transparent 65%)'
              : 'radial-gradient(ellipse 70% 50% at 50% 115%, rgba(232,179,75,0.16), transparent 65%)',
        }}
      />
      <div className="relative z-10 w-full max-w-xl text-center">
        <h1 className="text-5xl font-bold tracking-[0.25em] text-[#d7dde5] sm:text-6xl">
          {title}
        </h1>

        {recap.length > 0 && (
          <div className="mx-auto mt-8 max-w-lg space-y-3">
            {recap.map((line, i) => (
              <p key={i} className="text-[15px] italic leading-relaxed text-[#8a94a3]">
                {line}
              </p>
            ))}
          </div>
        )}

        <div className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-[#8a94a3]">Time survived</div>
            <div className="mt-1 font-mono text-lg text-[#d7dde5]">{fmtPlaytime(playSeconds)}</div>
          </div>
          <div>
            <div className="text-xs text-[#8a94a3]">Quests done</div>
            <div className="mt-1 font-mono text-lg text-[#d7dde5]">{doneQuests.length}</div>
          </div>
          <div>
            <div className="text-xs text-[#8a94a3]">Lighthouse rep</div>
            <div className="mt-1 font-mono text-lg text-[#d7dde5]">{rep.lighthouse ?? 0}</div>
          </div>
        </div>

        {doneQuests.length > 0 && (
          <div className="mx-auto mt-6 max-w-md">
            <div className="text-xs text-[#8a94a3]">Completed</div>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {doneQuests.map((id) => {
                const def = QUESTS.find((d) => d.id === id);
                return (
                  <span key={id} className="text-xs text-[#5aa469]">
                    {def ? def.title : id}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-10">
          <button
            onClick={() => {
              sfx.play('ui');
              setScreen('title');
            }}
            className="rounded bg-[#e8b34b] px-8 py-3 font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
          >
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
