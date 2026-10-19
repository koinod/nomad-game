import { useGameStore } from '../store/gameStore';
import { PROLOGUE_SCRIPT, PROLOGUE_START } from '../narrative/dialogue';
import DialoguePanel from './DialoguePanel';

/**
 * Prologue flow: renders the prologue script from the store's dialogue state.
 * The boat choice fires the q_prologue choice step; the dialogue data also
 * carries questEvent on the follow-up node, so either path completes the step.
 */
export default function PrologueScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0e12] p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 120%, rgba(22,40,58,0.8), transparent 65%)',
        }}
      />
      <div className="relative z-10 mb-6 text-center">
        <h1 className="text-2xl font-semibold text-[#d7dde5]">Tern Rock</h1>
        <p className="mt-1 text-sm text-[#8a94a3]">The static took everything.</p>
      </div>
      <div className="relative z-10 w-full max-w-2xl">
        <DialoguePanel
          nodes={PROLOGUE_SCRIPT}
          startId={PROLOGUE_START}
          onEnd={() => setScreen('game')}
          onPickChoice={(choice) => {
            if (choice.id === 'sacrifice_cal' || choice.id === 'leave_cal') {
              useGameStore.getState().questEvent('choice', 'boat_choice', 1);
            }
          }}
        />
      </div>
    </div>
  );
}
