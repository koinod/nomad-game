import type { SaveMeta, SaveSnapshot } from '../store/types';

// STUB — replaced by the systems agent. Signatures must stay exact.
export async function saveGameToSlot(_slot: string, _snap: SaveSnapshot): Promise<void> {
  throw new Error('save not implemented');
}
export async function loadGameFromSlot(_slot: string): Promise<SaveSnapshot | null> {
  return null;
}
export async function listSaveSlots(): Promise<SaveMeta[]> {
  return [];
}
export async function deleteSaveSlot(_slot: string): Promise<void> {
  /* stub */
}
