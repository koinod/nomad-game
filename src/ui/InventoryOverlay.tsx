// InventoryOverlay.tsx — the phone-free inventory deck (shell).
//
// Ian's standing preference: inventory management WITHOUT the sat
// phone. KeyB opens it anywhere in the field (dead battery, phone in
// a trunk — it's your gear, not an app); the world pauses while it's
// up (opening sets backpackOpen, the flag Game.ts's worldPaused
// honors).
//
// Inventory v2: the body is InventoryDeck — the SAME surface the
// phone's Pack app renders (one implementation). This file is only
// the host: the KeyB/Escape handling, the backdrop, and the frame.
// Hosted from Backpack.tsx's fragment so it mounts wherever the
// field pack does. The KeyB handler is React-side — Game.ts is
// never touched for it.

import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import InventoryDeck from './InventoryDeck';
import { sfx } from '../systems/audio';

export default function InventoryOverlay() {
  const inventoryOpen = useGameStore((s) => s.inventoryOpen);
  const screen = useGameStore((s) => s.screen);
  const closeInventory = useGameStore((s) => s.closeInventory);

  // KeyB toggles the deck; Escape closes it. Registered unconditionally
  // (this component stays mounted via Backpack's fragment even while
  // closed) and reads the store directly so it never goes stale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = useGameStore.getState();
      if (e.code === 'Escape' && s.inventoryOpen) {
        s.closeInventory();
        sfx.play('ui');
        return;
      }
      if (e.code !== 'KeyB') return;
      if (s.inventoryOpen) {
        s.closeInventory();
        sfx.play('ui');
        return;
      }
      if (s.screen !== 'game' || s.dead || s.dialogue || s.phoneOpen || s.sleepOpen) return;
      document.exitPointerLock?.();
      s.openInventory();
      sfx.play('ui');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // programmatic opens (tests, future callers) get the same cursor release
  useEffect(() => {
    if (inventoryOpen) document.exitPointerLock?.();
  }, [inventoryOpen]);

  if (!inventoryOpen || screen !== 'game') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={closeInventory}
    >
      <div
        className="max-h-full overflow-auto rounded-lg border border-[#232b36] bg-[#0d1117] p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-6">
          <div className="text-[12px] font-bold uppercase tracking-widest text-[#f2f5f8]">
            Inventory
          </div>
          <div className="text-[10px] text-[#8a94a3]">
            B / Esc to close · what you wear is what you carry
          </div>
          <button
            onClick={closeInventory}
            className="rounded border border-[#232b36] px-2 py-0.5 text-[11px] text-[#8a94a3] hover:text-[#f2f5f8]"
          >✕</button>
        </div>
        <InventoryDeck />
      </div>
    </div>
  );
}
