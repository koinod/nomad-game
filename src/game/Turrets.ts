// Turrets.ts — stage 7 (item 6): deployed base turrets.
//
// Lane 7 specced the turret (TURRET_DEF / TURRET_GHOST_SPEC in
// systems/crafting.ts): a crafted item that deploys as a prefab ghost
// inside a claim radius, draws 0.8 kW against Lane 10's powerBudget,
// and feeds 9mm from the base stockpile. Lane 10's planPrefabRing
// decides where interior prefabs stand. This system is the live wire:
//
//   deploy flow — the claim's turret hardpoint (Interact) calls
//   deployAt(siteId): first press raises a translucent ghost at the
//   ring plan's next interior spot; second press confirms through the
//   store (consumes the crafted item, appends the {defId:'turret'}
//   prefab — which is also how it persists in the save).
//
//   combat — each placed turret acquires the nearest live husk inside
//   TURRET_GHOST_SPEC.rangeM and fires at TURRET_DEF rpm through the
//   husk's own damage() seam. A turret whose base is over its power
//   budget stays dark; an empty magazine reloads from the stockpile
//   (store.takeFromStockpile) and stays silent when the base is dry.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { planPrefabRing, type GhostPlacement } from './baseGhosts';
import { TURRET_DEF, TURRET_GHOST_SPEC } from '../systems/crafting';
import { powerBudget, type BaseInstance } from '../systems/baseClaims';
import { claimSite } from '../data/base';
import { sfx } from '../systems/audio';
import type { HuskManager } from './Husks';

interface PlacedTurret {
  key: string;
  siteId: string;
  group: THREE.Group;
  head: THREE.Group;
  x: number;
  z: number;
  mag: number;
  cooldown: number;
}

function buildTurretMesh(ghost = false): { group: THREE.Group; head: THREE.Group } {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0x4a4e54, roughness: 0.45, metalness: 0.6,
    transparent: ghost, opacity: ghost ? 0.45 : 1,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x23262a, roughness: 0.6, metalness: 0.4,
    transparent: ghost, opacity: ghost ? 0.45 : 1,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.22, 12), dark);
  base.position.y = 0.11;
  base.castShadow = true;
  group.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), steel);
  post.position.y = 0.48;
  group.add(post);
  const head = new THREE.Group();
  head.position.y = 0.86;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.62), steel);
  body.castShadow = true;
  head.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.55, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.55);
  head.add(barrel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), dark);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0.24, -0.08, -0.05);
  head.add(drum);
  group.add(head);
  return { group, head };
}

export class TurretSystem {
  private scene: THREE.Scene;
  private groundY: (x: number, z: number) => number;
  private placed: PlacedTurret[] = [];
  private ghost: THREE.Group | null = null;
  private ghostSite: string | null = null;
  private syncKey = '';

  constructor(scene: THREE.Scene, groundY: (x: number, z: number) => number) {
    this.scene = scene;
    this.groundY = groundY;
  }

  private bases(): BaseInstance[] {
    const c = useGameStore.getState().claims;
    const out: BaseInstance[] = [];
    if (c.home) out.push(c.home as BaseInstance);
    for (const o of c.outposts) out.push(o as BaseInstance);
    return out;
  }

  private anchorFor(siteId: string): { x: number; z: number; radiusM: number } | null {
    const st = useGameStore.getState();
    const p = st.poiPositions[siteId] ?? (siteId === 'military_base' ? st.poiPositions['airbase'] : undefined);
    const site = claimSite(siteId);
    if (!p || !site) return null;
    return { x: p[0], z: p[1], radiusM: site.prefabRadiusM };
  }

  /** The ring-plan slot the NEXT turret at this base would occupy. */
  private nextSpot(base: BaseInstance): GhostPlacement | null {
    const anchor = this.anchorFor(base.siteId);
    if (!anchor) return null;
    const ids = base.prefabs.map((p) => p.defId);
    const plan = planPrefabRing(anchor, [...ids, 'turret'], 0);
    return plan[plan.length - 1] ?? null;
  }

  /** Rebuild placed meshes from claims state (idempotent; keyed). */
  syncFromClaims(): void {
    const bases = this.bases();
    const key = bases
      .map((b) => `${b.siteId}:${b.prefabs.map((p) => p.defId).join(',')}`)
      .join('|');
    if (key === this.syncKey) return;
    this.syncKey = key;
    for (const t of this.placed) this.scene.remove(t.group);
    this.placed = [];
    for (const base of bases) {
      const anchor = this.anchorFor(base.siteId);
      if (!anchor) continue;
      const plan = planPrefabRing(anchor, base.prefabs.map((p) => p.defId), 0);
      let n = 0;
      for (const spot of plan) {
        if (spot.prefabId !== 'turret') continue;
        const { group, head } = buildTurretMesh();
        const y = this.groundY(spot.x, spot.z);
        group.position.set(spot.x, y, spot.z);
        group.rotation.y = spot.rotY;
        this.scene.add(group);
        this.placed.push({
          key: `${base.siteId}#${n++}`,
          siteId: base.siteId,
          group, head,
          x: spot.x, z: spot.z,
          mag: TURRET_GHOST_SPEC.magSize,
          cooldown: 0,
        });
      }
    }
  }

  /** The hardpoint flow: ghost first, confirm on the second press. */
  deployAt(siteId: string): void {
    const s = useGameStore.getState();
    const base = this.bases().find((b) => b.siteId === siteId);
    if (!base) {
      s.addToast('Turrets deploy at a base you hold — claim this ground first.');
      this.clearGhost();
      return;
    }
    if (this.ghostSite === siteId && this.ghost) {
      this.clearGhost();
      if (s.deployTurret(siteId)) this.syncFromClaims();
      return;
    }
    if (s.countItem(TURRET_GHOST_SPEC.itemId) < 1) {
      s.addToast('No crafted turret in your pack. The Machine Shop builds them (blueprint: bp_turret).');
      return;
    }
    const spot = this.nextSpot(base);
    if (!spot) return;
    this.clearGhost();
    const { group } = buildTurretMesh(true);
    group.position.set(spot.x, this.groundY(spot.x, spot.z), spot.z);
    group.rotation.y = spot.rotY;
    this.scene.add(group);
    this.ghost = group;
    this.ghostSite = siteId;
    s.addToast('Turret ghost set — use the hardpoint again to emplace it.');
  }

  private clearGhost(): void {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostSite = null;
  }

  update(dt: number, husks: HuskManager): void {
    this.syncFromClaims();
    if (this.placed.length === 0) return;
    const s = useGameStore.getState();
    const basesBySite = new Map(this.bases().map((b) => [b.siteId, b]));
    const fireInterval = 60 / TURRET_DEF.stats.rpm;
    const range2 = TURRET_GHOST_SPEC.rangeM * TURRET_GHOST_SPEC.rangeM;
    for (const t of this.placed) {
      const base = basesBySite.get(t.siteId);
      if (!base) continue;
      // over budget = dark turret (the budget already counts every
      // deployed turret's draw, this one included)
      if (!powerBudget(base).ok) continue;
      if (t.mag <= 0) {
        t.mag = s.takeFromStockpile(t.siteId, TURRET_GHOST_SPEC.ammoItemId, TURRET_GHOST_SPEC.magSize);
        if (t.mag <= 0) continue; // the base is dry — silent
      }
      // nearest live husk in range
      let best: (typeof husks.husks)[number] | null = null;
      let bestD2 = range2;
      for (const husk of husks.husks) {
        if (!husk.alive) continue;
        const dx = husk.group.position.x - t.x;
        const dz = husk.group.position.z - t.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = husk; }
      }
      if (!best) continue;
      const tp = best.group.position;
      t.head.rotation.y = Math.atan2(tp.x - t.x, tp.z - t.z) - t.group.rotation.y;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      t.cooldown = fireInterval;
      t.mag -= 1;
      const dir = new THREE.Vector3(tp.x - t.x, 0, tp.z - t.z).normalize();
      best.damage(TURRET_DEF.stats.damage, dir, 1.2);
      // positional: the distance law replaces the old flat 0.12 hack
      sfx.gunshot('carbine', { at: { x: t.x, z: t.z } });
    }
  }
}
