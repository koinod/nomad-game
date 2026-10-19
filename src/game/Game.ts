import type { DifficultyId, SaveSnapshot, WorldDiff } from '../store/types';

export type BiomeId = 'beach' | 'dune' | 'forest' | 'town' | 'marsh' | 'water';

// STUB — replaced by the engine agent with the full implementation.
// Public API must keep these exact signatures (see INTERFACES.md).
export class Game {
  constructor(_canvas: HTMLCanvasElement) { /* stub */ }
  async init(_opts: { seed: number; difficulty: DifficultyId; snapshot?: SaveSnapshot | null }): Promise<void> {
    throw new Error('Game not implemented');
  }
  start(): void { throw new Error('Game not implemented'); }
  setPaused(_p: boolean): void { /* stub */ }
  dispose(): void { /* stub */ }
  getPlayerSnapshot(): { pos: [number, number, number]; hp: number } {
    return { pos: [0, 0, 0], hp: 100 };
  }
  getWorldDiff(): WorldDiff {
    return { looted: [], deadHusks: [], cleared: [] };
  }
  getHeightAt(_x: number, _z: number): number { return 0; }
  getBiomeAt(_x: number, _z: number): BiomeId { return 'beach'; }
  respawnAtSafePoint(): void { /* stub */ }
  rest(): void { /* stub */ }
  async playEndingCutscene(): Promise<void> { /* stub */ }
}
