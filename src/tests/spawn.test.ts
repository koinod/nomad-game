// spawn.test.ts — husk spawn placement sanity (map phase): area zones
// overlap the town, and spawn points inside buildings must be vetoed.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HuskManager, type SpawnZone } from '../game/Husks';

describe('husk spawn placement', () => {
  it('never seeds a husk on a vetoed point', () => {
    const zone: SpawnZone = { id: 't', x: 0, z: 0, radius: 10, count: 6, kinds: ['shambler'] };
    const mgr = new HuskManager(new THREE.Scene(), [zone], 42);
    mgr.spawnBlocked = (x) => x < 0; // the west half is "indoors"
    mgr.spawnInitial(new Set(), () => 5, false, 0);
    expect(mgr.husks.length).toBeGreaterThan(0);
    for (const h of mgr.husks) {
      expect(h.group.position.x).toBeGreaterThanOrEqual(0);
    }
  });

  it('seeds normally with no veto wired', () => {
    const zone: SpawnZone = { id: 't', x: 0, z: 0, radius: 10, count: 4, kinds: ['shambler'] };
    const mgr = new HuskManager(new THREE.Scene(), [zone], 7);
    mgr.spawnInitial(new Set(), () => 5, false, 0);
    expect(mgr.husks.length).toBe(4);
  });
});
