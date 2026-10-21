// Lane 11 (2): mod visual deltas + finish coverage audit, as tests.
// SYSTEMS_SPEC §3.2 — an attached mod must READ on the hand mesh:
// suppressor = tube, reflex = hump, extended mag = longer mag. The mesh
// may only grow a part where the weapon's modSlots offer that slot.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { buildGroundMesh, buildHandMesh } from '../game/weaponMeshes';

function meshCount(g: THREE.Group): number {
  let n = 0;
  g.traverse((o) => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

function materialColors(g: THREE.Group): number[] {
  const out: number[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      if ('color' in m) out.push(m.color.getHex());
    }
  });
  return out;
}

const growsWith = (id: string, mod: string) =>
  meshCount(buildHandMesh(id, undefined, [mod])) > meshCount(buildHandMesh(id));

describe('mod visual deltas (§3.2: the mesh changes with the mods)', () => {
  it('suppressor adds a tube where a muzzle slot exists — and nowhere else', () => {
    for (const id of ['pistol', 'hunting_rifle', 'smg', 'carbine', 'dmr']) {
      expect(growsWith(id, 'suppressor'), `${id} + suppressor`).toBe(true);
    }
    // no muzzle slot in the data: shotgun (mag/under only), revolver
    // (under only), crossbow (optic only) — a tube there would be a lie
    for (const id of ['shotgun', 'revolver', 'crossbow', 'flare_gun']) {
      expect(growsWith(id, 'suppressor'), `${id} + suppressor`).toBe(false);
    }
  });

  it('reflex sight adds a hump where an optic slot exists', () => {
    for (const id of ['pistol', 'smg', 'carbine', 'crossbow']) {
      expect(growsWith(id, 'reflex_sight'), `${id} + reflex`).toBe(true);
    }
    // hunting rifle + DMR model a scope already — no second optic stacked;
    // shotgun/revolver offer no optic slot at all
    for (const id of ['hunting_rifle', 'dmr', 'shotgun', 'revolver']) {
      expect(growsWith(id, 'reflex_sight'), `${id} + reflex`).toBe(false);
    }
  });

  it('extended mag lengthens the mag where a magazine slot exists', () => {
    for (const id of ['pistol', 'shotgun', 'hunting_rifle', 'smg', 'carbine', 'dmr']) {
      expect(growsWith(id, 'extended_mag'), `${id} + ext mag`).toBe(true);
    }
    for (const id of ['revolver', 'crossbow', 'flare_gun']) {
      expect(growsWith(id, 'extended_mag'), `${id} + ext mag`).toBe(false);
    }
  });

  it('underbarrel mods (foregrip, laser) land only where the slot exists', () => {
    for (const mod of ['foregrip', 'laser_sight']) {
      for (const id of ['pistol', 'shotgun', 'hunting_rifle', 'revolver', 'smg', 'carbine', 'dmr']) {
        expect(growsWith(id, mod), `${id} + ${mod}`).toBe(true);
      }
      for (const id of ['crossbow', 'flare_gun']) {
        expect(growsWith(id, mod), `${id} + ${mod}`).toBe(false);
      }
    }
  });

  it('melee weapons never grow gun parts', () => {
    for (const mod of ['suppressor', 'reflex_sight', 'extended_mag', 'foregrip']) {
      expect(growsWith('machete', mod), `machete + ${mod}`).toBe(false);
      expect(growsWith('pipe', mod), `pipe + ${mod}`).toBe(false);
    }
  });
});

describe('finish coverage', () => {
  it('every weapon in the roster has a dedicated hand mesh (never the generic box)', () => {
    const weapons = Object.values(ITEMS).filter(
      (i) => i.category === 'weapon-ranged' || i.category === 'weapon-melee',
    );
    expect(weapons.length).toBeGreaterThan(10);
    for (const w of weapons) {
      const g = buildHandMesh(w.id);
      const only = g.children.length === 1 ? g.children[0] : null;
      const isGenericBox =
        only instanceof THREE.Mesh && only.geometry instanceof THREE.BoxGeometry;
      expect(isGenericBox, `${w.id} fell back to the generic held box`).toBe(false);
    }
  });

  it('a finish refinishes the metal — attachments included', () => {
    const RUST = 0x7a4a2a;
    const plain = buildHandMesh('carbine', undefined, ['suppressor']);
    expect(materialColors(plain)).not.toContain(RUST);
    const rusted = buildHandMesh('carbine', 'finish_rust', ['suppressor']);
    const rustParts = materialColors(rusted).filter((c) => c === RUST).length;
    // receiver/barrel AND the suppressor tube take the finish
    expect(rustParts).toBeGreaterThanOrEqual(2);
  });

  it('every finish id applies without throwing on every ranged weapon', () => {
    for (const w of Object.values(ITEMS).filter((i) => i.category === 'weapon-ranged')) {
      for (const f of ['finish_matte', 'finish_camo', 'finish_rust', 'finish_worn']) {
        expect(() => buildHandMesh(w.id, f), `${w.id} + ${f}`).not.toThrow();
      }
    }
  });
});

describe('throwable meshes (the ground art the reuse list used to shadow)', () => {
  it('a frag on the ground is its modeled sphere, not a box', () => {
    const g = buildGroundMesh('frag');
    let hasSphere = false;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) hasSphere = true;
    });
    expect(hasSphere).toBe(true);
  });

  it('smoke, molotov, flashbang and boombox ground meshes are multi-part', () => {
    for (const id of ['smoke', 'molotov', 'flashbang', 'boombox']) {
      expect(meshCount(buildGroundMesh(id)), id).toBeGreaterThanOrEqual(2);
    }
  });

  it('throwables in hand are modeled too (the throw starts from the mesh)', () => {
    for (const id of ['frag', 'molotov', 'flashbang', 'smoke', 'boombox']) {
      expect(meshCount(buildHandMesh(id)), id).toBeGreaterThanOrEqual(2);
    }
  });
});
