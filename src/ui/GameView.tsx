import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getGame, setGame } from '../game/instance';
import { Game } from '../game/Game';
import { primePostFxBoot } from '../game/PostFX';
import { ambience } from '../systems/audio';
import { ENDING_LINES } from '../narrative/dialogue';
import HUD from './HUD';
import Phone from './Phone';
import Backpack from './Backpack';
import SleepDialog from './SleepDialog';
import LootPanel from './LootPanel';
import StoragePanel from './StoragePanel';
import TouchControls from './TouchControls';
import PauseMenu from './PauseMenu';
import DialogueOverlay from './DialogueOverlay';
import DeathOverlay from './DeathOverlay';

function CutsceneOverlay() {
  const endingChoice = useGameStore((s) => s.endingChoice);
  const cutsceneLine = useGameStore((s) => s.cutsceneLine);
  const screen = useGameStore((s) => s.screen);
  if (endingChoice == null || screen !== 'game') return null;
  const line = ENDING_LINES[Math.max(0, Math.min(cutsceneLine, ENDING_LINES.length - 1))];
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-10">
      <p className="max-w-2xl text-center text-lg leading-relaxed text-[#d7dde5]">{line}</p>
    </div>
  );
}

export default function GameView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paused = useGameStore((s) => s.paused);

  // Lane 12: classify this device for the PostFX quality ladder during
  // render — idempotent, and guaranteed to land before the mount
  // effect below boots the Game, whose init reads the classified tier
  // synchronously (getPostFxBootQuality) when building the post chain.
  primePostFxBoot();

  // Mount the engine once. The async init is guarded against StrictMode's
  // double-mount: a disposed-before-ready boot disposes its own Game and
  // never starts it, and Game.dispose is idempotent-safe by contract.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const game = new Game(canvas);
    setGame(game);
    (async () => {
      const s = useGameStore.getState();
      try {
        await game.init({
          seed: s.seed,
          difficulty: s.difficulty,
          snapshot: s.pendingSnapshot,
        });
      } catch {
        // Engine not implemented yet; the world boots when it is.
      }
      if (!alive) {
        game.dispose();
        return;
      }
      try {
        game.start();
      } catch {
        // Same as above.
      }
      ambience.start();
    })();
    return () => {
      alive = false;
      ambience.stop();
      game.dispose();
      setGame(null);
    };
  }, []);

  // Keep the engine's pause flag in step with the store.
  useEffect(() => {
    getGame()?.setPaused(paused);
  }, [paused]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0e12]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <HUD />
      <Phone />
      <Backpack />
      <SleepDialog />
      <LootPanel />
      <StoragePanel />
      <TouchControls />
      <PauseMenu />
      <DialogueOverlay />
      <DeathOverlay />
      <CutsceneOverlay />
    </div>
  );
}
