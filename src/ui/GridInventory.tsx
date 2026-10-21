// GridInventory.tsx — the shared Tarkov-style grid (wave 3).
// Used by the phone Pack app, the G-key field pack, and the storage panel.
// Pointer-event dragging (mouse + touch), items snap to cells, invalid
// drops glow red and snap back, R rotates (while dragging or with a
// selection), double-click rotates in place, stacks show counts, weapons
// show a condition bar. Placement math lives in store/gridUtils (pure).

import { useEffect, useMemo, useRef, useState } from 'react';
import { ITEMS } from '../data/items';
import type { InvItem } from '../store/types';
import { canPlace, footprintOf, layoutItems, type Placement } from '../store/gridUtils';
import { sfx } from '../systems/audio';

const CAT_TINT: Record<string, string> = {
  'weapon-melee': 'border-[#6b4a3a]',
  'weapon-ranged': 'border-[#7a4a3a]',
  ammo: 'border-[#6b6238]',
  medical: 'border-[#3a6b4f]',
  food: 'border-[#5d6b38]',
  material: 'border-[#3d4756]',
  tool: 'border-[#4a5d6b]',
  pack: 'border-[#5d4a6b]',
  key: 'border-[#e8b34b]',
  mod: 'border-[#4a4a6b]',
};

interface DragState {
  uid: string;
  gx: number;
  gy: number;
  rot: boolean;
  valid: boolean;
  grabDx: number; // px offset of the pointer inside the item at grab time
  grabDy: number;
  moved: boolean;
}

export default function GridInventory({
  items,
  cols,
  rows,
  cell = 36,
  selectedUid,
  onSelect,
  onMove,
  equippedUids,
  dimmedUids,
  onOpenContainer,
}: {
  items: InvItem[];
  cols: number;
  rows: number;
  cell?: number;
  selectedUid?: string | null;
  onSelect?: (uid: string | null) => void;
  onMove: (uid: string, gx: number, gy: number, rot: boolean) => void;
  equippedUids?: Set<string>;
  dimmedUids?: Set<string>;
  /** Inventory v2 drill-in: double-clicking a CONTAINER item opens it
   *  (its own contents grid) instead of rotating. Double-click still
   *  rotates every non-container item, and R rotates anything — the
   *  existing interaction map is otherwise untouched. */
  onOpenContainer?: (uid: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const byUid = useMemo(() => new Map(items.map((i) => [i.uid, i])), [items]);
  const layout = useMemo(() => layoutItems(items, cols, rows), [items, cols, rows]);
  // while dragging, the dragged item's home cell frees up for validity checks
  const placedShown = useMemo(() => {
    const m = new Map(layout.placed);
    if (drag) m.delete(drag.uid);
    return m;
  }, [layout, drag]);

  const setDragBoth = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const candidateFromEvent = (d: DragState, e: React.PointerEvent): DragState => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return d;
    const item = byUid.get(d.uid);
    if (!item) return d;
    const gx = Math.round((e.clientX - rect.left - d.grabDx) / cell);
    const gy = Math.round((e.clientY - rect.top - d.grabDy) / cell);
    const valid = canPlace(placedShown, byUid, d.uid, gx, gy, d.rot, cols, rows);
    const moved = d.moved || gx !== d.gx || gy !== d.gy;
    return { ...d, gx, gy, valid, moved };
  };

  // R rotates: mid-drag flips the ghost; with a selection it rotates in place
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const d = dragRef.current;
      if (d) {
        const item = byUid.get(d.uid);
        if (!item) return;
        const rot = !d.rot;
        const valid = canPlace(placedShown, byUid, d.uid, d.gx, d.gy, rot, cols, rows);
        setDragBoth({ ...d, rot, valid });
        e.preventDefault();
        return;
      }
      if (selectedUid) {
        const p = layout.placed.get(selectedUid);
        const item = byUid.get(selectedUid);
        if (!p || !item) return;
        const rot = !p.rot;
        if (canPlace(layout.placed, byUid, selectedUid, p.gx, p.gy, rot, cols, rows)) {
          onMove(selectedUid, p.gx, p.gy, rot);
          sfx.play('ui', { volume: 0.4 });
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [byUid, placedShown, layout, selectedUid, cols, rows, onMove]);

  const beginDrag = (uid: string, p: Placement) => (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragBoth({
      uid,
      gx: p.gx,
      gy: p.gy,
      rot: p.rot,
      valid: true,
      grabDx: e.clientX - rect.left - p.gx * cell,
      grabDy: e.clientY - rect.top - p.gy * cell,
      moved: false,
    });
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDragBoth(candidateFromEvent(d, e));
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    setDragBoth(null);
    if (!d.moved) {
      onSelect?.(d.uid);
      return;
    }
    if (d.valid) {
      onMove(d.uid, d.gx, d.gy, d.rot);
      sfx.play('ui', { volume: 0.35 });
    }
    onSelect?.(d.uid);
  };

  const rotateInPlace = (uid: string) => {
    const p = layout.placed.get(uid);
    if (!p) return;
    const rot = !p.rot;
    if (canPlace(layout.placed, byUid, uid, p.gx, p.gy, rot, cols, rows)) {
      onMove(uid, p.gx, p.gy, rot);
      sfx.play('ui', { volume: 0.4 });
    }
  };

  const renderItem = (it: InvItem, p: Placement, ghost = false) => {
    const def = ITEMS[it.itemId];
    if (!def) return null;
    const { w, h } = footprintOf(it.itemId, p.rot);
    const isSel = selectedUid === it.uid;
    const dim = dimmedUids?.has(it.uid);
    const cond = it.condition;
    return (
      <div
        key={`${it.uid}${ghost ? '-ghost' : ''}`}
        onPointerDown={ghost ? undefined : beginDrag(it.uid, p)}
        onPointerMove={ghost ? undefined : moveDrag}
        onPointerUp={ghost ? undefined : endDrag}
        onPointerCancel={ghost ? undefined : () => setDragBoth(null)}
        onDoubleClick={ghost ? undefined : () => {
          if (onOpenContainer && ITEMS[it.itemId]?.container) onOpenContainer(it.uid);
          else rotateInPlace(it.uid);
        }}
        className={`absolute touch-none select-none overflow-hidden rounded-[4px] border bg-[#171d26] px-1 py-0.5 ${
          CAT_TINT[def.category] ?? 'border-[#2c3644]'
        } ${isSel ? 'ring-1 ring-[#e8b34b]' : ''} ${dim ? 'opacity-35' : ''} ${
          ghost ? 'pointer-events-none z-20 opacity-90' : 'z-10 cursor-grab active:cursor-grabbing'
        } ${drag?.uid === it.uid && !ghost ? 'opacity-40' : ''}`}
        style={{
          left: p.gx * cell + 1,
          top: p.gy * cell + 1,
          width: w * cell - 2,
          height: h * cell - 2,
        }}
        role="button"
        aria-label={def.name}
      >
        <div className="pointer-events-none truncate text-[10px] font-medium leading-tight text-[#d7dde5]">
          {def.name}
        </div>
        <div className="pointer-events-none text-[9px] leading-tight text-[#8a94a3]">
          {(def.weight * it.qty).toFixed(1)} kg
          {equippedUids?.has(it.uid) ? <span className="ml-1 text-[#5aa469]">EQ</span> : null}
          {it.jammed ? <span className="ml-1 text-[#d9534f]">JAM</span> : null}
          {def.container ? (
            <span className="ml-1 text-[#7fb0d9]">▣ {it.contents?.length ?? 0}</span>
          ) : null}
        </div>
        {it.qty > 1 && (
          <div className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[10px] font-semibold text-[#e8b34b]">
            ×{it.qty}
          </div>
        )}
        {cond !== undefined && (def.category === 'weapon-ranged' || def.category === 'weapon-melee') && (
          <div className="pointer-events-none absolute bottom-0.5 left-1 right-1 h-[3px] overflow-hidden rounded bg-[#0b0e12]">
            <div
              className={`h-full ${cond < 30 ? 'bg-[#d9534f]' : cond < 60 ? 'bg-[#e8b34b]' : 'bg-[#7fb069]'}`}
              style={{ width: `${Math.round(cond)}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  const dragItem = drag ? byUid.get(drag.uid) : undefined;

  return (
    <div>
      <div
        ref={gridRef}
        className="relative rounded border border-[#232b36]"
        style={{
          width: cols * cell,
          height: rows * cell,
          backgroundImage:
            'linear-gradient(to right, rgba(35,43,54,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(35,43,54,0.55) 1px, transparent 1px)',
          backgroundSize: `${cell}px ${cell}px`,
          backgroundColor: '#0d1117',
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect?.(null);
        }}
      >
        {[...layout.placed.entries()].map(([uid, p]) => {
          const it = byUid.get(uid);
          return it ? renderItem(it, p) : null;
        })}
        {drag && dragItem && (
          <div
            className={`pointer-events-none absolute z-30 rounded-[4px] border-2 ${
              drag.valid ? 'border-[#5aa469]' : 'border-[#d9534f]'
            }`}
            style={{
              left: drag.gx * cell,
              top: drag.gy * cell,
              width: footprintOf(dragItem.itemId, drag.rot).w * cell,
              height: footprintOf(dragItem.itemId, drag.rot).h * cell,
            }}
          >
            {renderItem(dragItem, { gx: 0, gy: 0, rot: drag.rot }, true)}
          </div>
        )}
      </div>
      {layout.overflow.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#d9534f]">No grid room:</span>
          {layout.overflow.map((uid) => {
            const it = byUid.get(uid);
            if (!it) return null;
            return (
              <button
                key={uid}
                onClick={() => onSelect?.(uid)}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  selectedUid === uid
                    ? 'border-[#e8b34b] text-[#e8b34b]'
                    : 'border-[#232b36] text-[#d7dde5]'
                }`}
              >
                {ITEMS[it.itemId]?.name ?? it.itemId}
                {it.qty > 1 ? ` ×${it.qty}` : ''}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
