import { useRef, useState } from 'react';
import { input } from '../game/input';
import { sfx } from '../systems/audio';

const JOY_RADIUS = 44;

function ControlButton({
  label,
  onPress,
  ariaLabel,
  className,
}: {
  label: string;
  onPress: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex h-16 w-16 items-center justify-center rounded-full border border-[#232b36] bg-[#0b0e12]/80 text-sm font-semibold text-[#d7dde5] active:border-[#e8b34b] active:text-[#e8b34b] ${className ?? ''}`}
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => {
        e.preventDefault();
        sfx.play('ui');
        onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/**
 * Mobile controls. Renders only on touch devices. Left side: virtual joystick
 * writing input.moveX/moveY. Right side: drag area writing look deltas.
 * Buttons set the edge-triggered inputs the controller consumes.
 */
export default function TouchControls() {
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && 'ontouchstart' in window,
  );
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  const moveKnob = (t: React.Touch) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    input.moveX = dx / JOY_RADIUS;
    input.moveY = -dy / JOY_RADIUS;
    setKnob({ x: dx, y: dy });
  };

  const resetJoy = () => {
    joyId.current = null;
    input.moveX = 0;
    input.moveY = 0;
    setKnob({ x: 0, y: 0 });
  };

  if (!isTouch) return null;

  return (
    <div className="absolute inset-0 z-20" style={{ touchAction: 'none', overscrollBehavior: 'contain' }}>
      {/* look area: right half */}
      <div
        className="absolute bottom-0 right-0 top-0 w-1/2"
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          if (lookId.current == null) {
            lookId.current = t.identifier;
            lookLast.current = { x: t.clientX, y: t.clientY };
          }
        }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (t.identifier === lookId.current) {
              input.lookDX += t.clientX - lookLast.current.x;
              input.lookDY += t.clientY - lookLast.current.y;
              lookLast.current = { x: t.clientX, y: t.clientY };
            }
          }
        }}
        onTouchEnd={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (t.identifier === lookId.current) lookId.current = null;
          }
        }}
        onTouchCancel={() => {
          lookId.current = null;
        }}
      />

      {/* joystick: left side */}
      <div className="absolute bottom-28 left-6">
        <div
          ref={joyBaseRef}
          className="relative h-32 w-32 rounded-full border border-[#232b36] bg-[#0b0e12]/60"
          style={{ touchAction: 'none' }}
          onTouchStart={(e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            if (joyId.current == null) {
              joyId.current = t.identifier;
              moveKnob(t);
            }
          }}
          onTouchMove={(e) => {
            for (const t of Array.from(e.changedTouches)) {
              if (t.identifier === joyId.current) moveKnob(t);
            }
          }}
          onTouchEnd={(e) => {
            for (const t of Array.from(e.changedTouches)) {
              if (t.identifier === joyId.current) resetJoy();
            }
          }}
          onTouchCancel={resetJoy}
        >
          <div
            className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-[#e8b34b] bg-[#12161c]/90"
            style={{
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            }}
          />
        </div>
      </div>

      {/* action buttons: right side */}
      <div className="absolute bottom-28 right-6 flex flex-col items-end gap-3">
        <div className="flex gap-3">
          <ControlButton label="ATK" ariaLabel="Melee attack" onPress={() => { input.attackMelee = true; }} />
          <ControlButton label="FIRE" ariaLabel="Fire ranged weapon" onPress={() => { input.attackRanged = true; }} />
        </div>
        <div className="flex gap-3">
          <ControlButton label="E" ariaLabel="Interact" onPress={() => { input.interact = true; }} />
          <ControlButton label="☎" ariaLabel="Open phone" onPress={() => { input.phone = true; }} />
        </div>
      </div>
    </div>
  );
}
