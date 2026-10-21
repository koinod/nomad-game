import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { NPC_DIALOGUES } from '../narrative/dialogue';
import { TRADERS } from '../data/traders';
import type { DialogueChoice } from '../store/types';
import DialoguePanel from './DialoguePanel';
import TraderPanel from './TraderPanel';
import { sfx } from '../systems/audio';

/**
 * Generic NPC dialogue overlay. Applies choice effects, then:
 * - kowalski's beacon_choice picks fire the beacon quest step and the ending.
 * - node-level questEvent/setFlags land via DialoguePanel when advancing.
 * - Lane 9 W3: an NPC whose placement fronts a trader (data/traders.ts
 *   npcKey) offers their bench from the talk surface — the panel opens
 *   over the dialogue and enforces its own rep/flag gate.
 */
export default function DialogueOverlay() {
  const dialogue = useGameStore((s) => s.dialogue);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);

  if (!dialogue || !dialogue.source.startsWith('npc:')) return null;
  const key = dialogue.source as 'npc:jonah' | 'npc:kowalski';
  const entry = NPC_DIALOGUES[key];
  if (!entry) return null;

  const trader = TRADERS.find((t) => t.npcKey === key.replace('npc:', ''));

  const onPickChoice = (choice: DialogueChoice) => {
    const st = useGameStore.getState();
    if (key === 'npc:kowalski') {
      if (choice.id === 'light_beacon') {
        st.questEvent('choice', 'beacon_choice', 1);
        st.triggerEnding('light');
      } else if (choice.id === 'dark_beacon') {
        st.questEvent('choice', 'beacon_choice', 1);
        st.triggerEnding('dark');
      }
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-4 pb-10 sm:items-center sm:pb-4">
      {selectedTraderId ? (
        <TraderPanel traderId={selectedTraderId} onClose={() => setSelectedTraderId(null)} />
      ) : (
        <div className="flex w-full max-w-2xl flex-col items-stretch gap-2">
          <DialoguePanel
            key={`${dialogue.source}:${dialogue.nodeId}`}
            nodes={entry.nodes}
            startId={dialogue.nodeId}
            onEnd={() => useGameStore.getState().closeDialogue()}
            onPickChoice={onPickChoice}
          />
          {trader && (
            <button
              onClick={() => { sfx.play('ui'); setSelectedTraderId(trader.id); }}
              className="self-end rounded border border-[#232b36] bg-[#12161c]/95 px-4 py-2 text-[14px] text-[#e8b34b] shadow-2xl transition-colors hover:border-[#e8b34b]"
            >
              Trade — {trader.name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
