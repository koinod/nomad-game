import { useEffect, useRef, useState } from 'react';
import { input } from '../game/input';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
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

/** PUBG-style weapon slots: equipped primary/secondary, tap to swing/fire. */
function WeaponBar() {
  const equipped = useGameStore((s) => s.equipped);
  const inventory = useGameStore((s) => s.inventory);
  const melee = equipped.melee ? inventory.find((i) => i.uid === equipped.melee) : undefined;
  const ranged = equipped.ranged ? inventory.find((i) => i.uid === equipped.ranged) : undefined;

  const slot = (
    tag: string,
    name: string | null,
    onFire: () => void,
  ) => (
    <button
      aria-label={`${tag} weapon: ${name ?? 'none'}`}
      className="flex h-14 w-32 flex-col items-start justify-center rounded border border-[#232b36] bg-[#0b0e12]/85 px-3 active:border-[#e8b34b]"
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => {
        e.preventDefault();
        sfx.play('ui');
        onFire();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="text-[10px] uppercase tracking-wide text-[#8a94a3]">{tag}</span>
      <span className="w-full truncate text-left text-sm text-[#d7dde5]">{name ?? '—'}</span>
    </button>
  );

  return (
    <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 gap-2">
      {slot('Primary', ranged ? ITEMS[ranged.itemId]?.name ?? null : null, () => {
        input.attackRanged = true;
      })}
      {slot('Secondary', melee ? ITEMS[melee.itemId]?.name ?? null : null, () => {
        input.attackMelee = true;
      })}
    </div>
  );
}

/** Fullscreen toggle — mobile browsers hide the URL bar only in fullscreen. */
function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };
  return (
    <button
      aria-label={fs ? 'Exit fullscreen' : 'Enter fullscreen'}
      className="absolute left-4 top-32 flex h-11 w-11 items-center justify-center rounded-full border border-[#232b36] bg-[#0b0e12]/80 text-base text-[#d7dde5] active:border-[#e8b34b]"
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => {
        e.preventDefault();
        sfx.play('ui');
        toggle();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {fs ? '🗕' : '⛶'}
    </button>
  );
}

/**
 * Mobile controls, PUBG-style. Left: virtual joystick (push to the edge to
 * sprint). Right: big FIRE button, ATK, interact, phone, backpack clustered.
 * Bottom-center: weapon slots. Renders only on touch devices.
 */
export default function TouchControls() {
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && 'ontouchstart' in window,
  );
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [crouchOn, setCrouchOn] = useState(false);
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
    const rawLen = Math.hypot(dx, dy);
    if (rawLen > JOY_RADIUS) {
      dx = (dx / rawLen) * JOY_RADIUS;
      dy = (dy / rawLen) * JOY_RADIUS;
    }
    input.moveX = dx / JOY_RADIUS;
    input.moveY = -dy / JOY_RADIUS;
    // PUBG-style: stick pushed to the rim = sprint
    input.sprint = rawLen > JOY_RADIUS * 0.92;
    setKnob({ x: dx, y: dy });
  };

  const resetJoy = () => {
    joyId.current = null;
    input.moveX = 0;
    input.moveY = 0;
    input.sprint = false;
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

      {/* combat cluster: right side, PUBG-style big FIRE */}
      <div className="absolute bottom-28 right-6 flex items-end gap-3">
        <div className="flex flex-col gap-3">
          <ControlButton label="JUMP" ariaLabel="Jump" onPress={() => { input.jump = true; }} />
          <ControlButton
            label="CRCH"
            ariaLabel="Toggle crouch"
            className={crouchOn ? 'border-[#e8b34b] text-[#e8b34b]' : undefined}
            onPress={() => {
              const next = !crouchOn;
              setCrouchOn(next);
              input.crouch = next;
            }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <ControlButton label="ATK" ariaLabel="Melee attack" onPress={() => { input.attackMelee = true; }} />
          <ControlButton label="E" ariaLabel="Interact" onPress={() => { input.interact = true; }} />
        </div>
        <div className="flex flex-col items-center gap-3">
          <ControlButton
            label="FIRE"
            ariaLabel="Fire ranged weapon"
            className="h-24 w-24 border-[#d9534f]/70 text-base"
            onPress={() => { input.attackRanged = true; }}
          />
          <div className="flex gap-3">
            <ControlButton label="☎" ariaLabel="Open phone" onPress={() => { input.phone = true; }} />
            <ControlButton label="PACK" ariaLabel="Open backpack" onPress={() => { input.backpack = true; }} />
          </div>
        </div>
      </div>

      {/* weapon slots: bottom-center */}
      <WeaponBar />

      {/* fullscreen toggle */}
      <FullscreenButton />
    </div>
  );
}
