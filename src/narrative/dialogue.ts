import type { DialogueNode } from '../store/types';

// STUB — replaced by the systems agent with full authored content.
// Shapes must stay exact (see INTERFACES.md).

export const PROLOGUE_START = 'start';

export const PROLOGUE_SCRIPT: Record<string, DialogueNode> = {
  start: {
    id: 'start', speaker: 'Narrator',
    lines: ['Placeholder prologue.'],
    next: null,
  },
};

export const NPC_DIALOGUES: Record<'npc:jonah' | 'npc:kowalski', { start: string; nodes: Record<string, DialogueNode> }> = {
  'npc:jonah': { start: 'start', nodes: { start: { id: 'start', speaker: 'Jonah', lines: ['...'], next: null } } },
  'npc:kowalski': { start: 'start', nodes: { start: { id: 'start', speaker: 'Kowalski', lines: ['...'], next: null } } },
};

export const ENDING_LINES: string[] = ['Placeholder ending.'];
