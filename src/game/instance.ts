import type { Game } from './Game';

// Singleton handle so React UI and the zustand store can reach the live engine
// without importing it (avoids a module cycle: Game.ts imports the store).
let current: Game | null = null;

export function setGame(g: Game | null): void {
  current = g;
}

export function getGame(): Game | null {
  return current;
}
