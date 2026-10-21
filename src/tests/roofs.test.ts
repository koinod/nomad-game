// roofs.test.ts — Ian's law: ROOFS NEVER DISAPPEAR.
//
// The field-fixes-era roof-lift rule (hide a roof while the player is
// inside and the camera is outside) was removed outright on 2026-10-20.
// This guard scans the source so the system cannot quietly come back:
// no code path may assign visibility on a roof-named object, and Game.ts
// must not resurrect the houseRoofs registry or the playerIn toggle.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function* tsFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) yield p;
  }
}

describe('roofs never disappear', () => {
  it('no source file toggles visibility on a roof', () => {
    const offenders: string[] = [];
    for (const f of tsFiles(SRC)) {
      if (f.includes('tests')) continue;
      const text = readFileSync(f, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (/roof/i.test(line) && /\.visible\s*=/.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        }
        if (/\.visible\s*=\s*!\(playerIn/.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Game.ts has no house-roof visibility registry left', () => {
    const game = readFileSync(join(SRC, 'game', 'Game.ts'), 'utf8');
    expect(game).not.toContain('houseRoofs');
    expect(game).not.toMatch(/\.visible\s*=\s*!\(/);
  });
});
