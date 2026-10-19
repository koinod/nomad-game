import { useGameStore } from '../store/gameStore';
import { NPC_DIALOGUES } from '../narrative/dialogue';
import type { DialogueChoice } from '../store/types';
import DialoguePanel from './DialoguePanel';

/**
 * Generic NPC dialogue overlay. Applies choice effects, then:
 * - kowalski's beacon_choice picks fire the beacon quest step and the ending.
 * - node-level questEvent/setFlags land via DialoguePanel when advancing.
 */
export default function DialogueOverlay() {
  const dialogue = useGameStore((s) => s.dialogue);

  if (!dialogue || !dialogue.source.startsWith('npc:')) return null;
  const key = dialogue.source as 'npc:jonah' | 'npc:kowalski';
  const entry = NPC_DIALOGUES[key];
  if (!entry) return null;

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
      <DialoguePanel
        key={`${dialogue.source}:${dialogue.nodeId}`}
        nodes={entry.nodes}
        startId={dialogue.nodeId}
        onEnd={() => useGameStore.getState().closeDialogue()}
        onPickChoice={onPickChoice}
      />
    </div>
  );
}
