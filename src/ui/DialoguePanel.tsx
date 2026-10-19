import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { DialogueChoice, DialogueNode } from '../store/types';
import { sfx } from '../systems/audio';

interface DialoguePanelProps {
  nodes: Record<string, DialogueNode>;
  startId: string;
  onEnd: () => void;
  /** Extra side effects a specific flow needs (prologue boat choice, beacon choice). */
  onPickChoice?: (choice: DialogueChoice) => void;
}

/** Apply the effects of landing on a dialogue node: flags and quest events. */
export function applyNodeEffects(node: DialogueNode): void {
  const { setFlag, questEvent } = useGameStore.getState();
  if (node.setFlags) {
    for (const f of node.setFlags) setFlag(f);
  }
  if (node.questEvent) {
    questEvent(node.questEvent.type, node.questEvent.target, node.questEvent.count ?? 1);
  }
}

/**
 * Generic dialogue renderer. Drives from a nodes record, applies node-level
 * effects (setFlags, questEvent) when landing on a node and choice-level
 * effects (setFlags, rep) when a choice is picked.
 */
export default function DialoguePanel({ nodes, startId, onEnd, onPickChoice }: DialoguePanelProps) {
  const [nodeId, setNodeId] = useState(startId);
  const effectsFor = useRef<string | null>(null);
  const node = nodes[nodeId];

  // Apply the start node's effects once per mount (DialogueOverlay remounts
  // per dialogue via key, so this also covers engine-driven re-opens).
  useEffect(() => {
    if (effectsFor.current !== startId) {
      effectsFor.current = startId;
      const start = nodes[startId];
      if (start) applyNodeEffects(start);
    }
  }, [startId, nodes]);

  const advance = (nextId: string | null | undefined) => {
    if (nextId == null || !nodes[nextId]) {
      onEnd();
      return;
    }
    applyNodeEffects(nodes[nextId]);
    setNodeId(nextId);
  };

  const pick = (choice: DialogueChoice) => {
    sfx.play('ui');
    const { setFlag, addRep } = useGameStore.getState();
    if (choice.setFlags) {
      for (const f of choice.setFlags) setFlag(f);
    }
    if (choice.rep) {
      for (const r of choice.rep) addRep(r.faction, r.amount);
    }
    onPickChoice?.(choice);
    advance(choice.next);
  };

  if (!node) return null;

  return (
    <div className="w-full max-w-2xl rounded-md border border-[#232b36] bg-[#12161c]/95 p-6 shadow-2xl">
      <div className="mb-3 text-sm font-semibold tracking-wide text-[#e8b34b]">
        {node.speaker}
      </div>
      <div className="nomad-scroll mb-6 max-h-64 space-y-3 overflow-y-auto">
        {node.lines.map((line, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-[#d7dde5]">
            {line}
          </p>
        ))}
      </div>
      {node.choices && node.choices.length > 0 ? (
        <div className="flex flex-col gap-2">
          {node.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => pick(choice)}
              className="rounded border border-[#232b36] bg-[#0b0e12] px-4 py-2.5 text-left text-[15px] text-[#d7dde5] transition-colors hover:border-[#e8b34b] hover:bg-[#1a2029]"
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => { sfx.play('ui'); advance(node.next); }}
            className="rounded bg-[#e8b34b] px-6 py-2 text-[15px] font-semibold text-[#0b0e12] transition-colors hover:bg-[#f2c364]"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
