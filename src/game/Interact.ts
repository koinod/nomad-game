// Interact.ts — containers, campfires, relay switch, NPCs, beacon.
// E within 3m picks the nearest interactable.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { ITEMS, HUSK_LOOT } from '../data/items';
import { buildGroundMesh } from './weaponMeshes';
import { sfx } from '../systems/audio';

export interface LootEntry {
  id: string;
  min: number;
  max: number;
  chance: number;
}

export interface ContainerDef {
  id: string;
  x: number;
  z: number;
  loot: LootEntry[];
}

export interface InteractHooks {
  resourceMult: number;
  rng: () => number;
  groundY: (x: number, z: number) => number;
  scene: THREE.Scene;
  isLooted: (id: string) => boolean;
  markLooted: (id: string) => void;
  isCleared: (id: string) => boolean;
  markCleared: (id: string) => void;
  setLastSafe: (x: number, z: number) => void;
}

export interface Interactable {
  id: string;
  kind: 'container' | 'campfire' | 'switch' | 'npc' | 'beacon' | 'corpse' | 'pickup';
  pos: THREE.Vector3;
  label: string;
  use: () => void;
}

function personMesh(jacket: number, skin: number): THREE.Group {
  const g = new THREE.Group();
  const jm = new THREE.MeshStandardMaterial({ color: jacket, roughness: 1 });
  const sm = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jm);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), sm);
  head.position.y = 1.72;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.3), new THREE.MeshStandardMaterial({ color: 0x35322c, roughness: 1 }));
  legs.position.y = 0.39;
  g.add(torso, head, legs);
  return g;
}

/** Distinct physical mesh per item — see weaponMeshes.ts. */
function buildPickupMesh(itemId: string, qty: number): THREE.Group {
  const inner = buildGroundMesh(itemId, qty);
  // lay flat on the ground plane, slight lift so it doesn't z-fight
  inner.position.y = 0.06;
  const g = new THREE.Group();
  g.add(inner);
  // soft glow ring so it reads as interactive without floating text
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8b34b, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  return g;
}

export class InteractSystem {
  readonly interactables: Interactable[] = [];
  private crateMeshes = new Map<string, THREE.Mesh>();
  private searchedCorpses = new Set<string>();
  private pickupMeshes = new Map<string, THREE.Group>();
  private hooks: InteractHooks;

  constructor(hooks: InteractHooks, pois: Record<string, [number, number]>, containers: ContainerDef[]) {
    this.hooks = hooks;
    const s = useGameStore.getState();
    const at = (id: string): [number, number] => pois[id] ?? [0, 0];

    // ---- containers ----
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e5a3e, roughness: 1 });
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    for (const c of containers) {
      const y = hooks.groundY(c.x, c.z);
      const pos = new THREE.Vector3(c.x, y, c.z);
      const mesh = new THREE.Mesh(crateGeo, crateMat);
      mesh.position.set(c.x, y + 0.45, c.z);
      mesh.rotation.y = hooks.rng() * Math.PI;
      mesh.visible = !hooks.isLooted(c.id);
      hooks.scene.add(mesh);
      this.crateMeshes.set(c.id, mesh);
      this.interactables.push({
        id: c.id,
        kind: 'container',
        pos,
        label: hooks.isLooted(c.id) ? 'Empty container' : 'Search container',
        use: () => {
          // fresh state: the constructor's `s` snapshot goes stale after any set()
          const st = useGameStore.getState();
          if (hooks.isLooted(c.id)) {
            st.addToast('Nothing left here.');
            return;
          }
          // loot preview: roll once, stash it, show the panel — take what you want
          if (!st.lootStash[c.id]) {
            const rng = hooks.rng;
            const items: { itemId: string; qty: number }[] = [];
            for (const e of c.loot) {
              if (rng() > e.chance) continue;
              const qty = Math.max(1, Math.round((e.min + rng() * (e.max - e.min)) * hooks.resourceMult));
              items.push({ itemId: e.id, qty });
            }
            if (items.length === 0) {
              st.addToast('Nothing useful inside.');
              this.setContainerEmptied(c.id);
              return;
            }
            st.stageContainerLoot(c.id, items);
          }
          st.openStagedLoot(c.id);
          if (document.pointerLockElement) document.exitPointerLock();
          sfx.play('ui', { volume: 0.5 });
        },
      });
    }

    // ---- campfires (safe points + rest) ----
    for (const pid of ['shore_camp', 'jonah_camp', 'lighthouse_base']) {
      const [x, z] = at(pid);
      const pos = new THREE.Vector3(x, hooks.groundY(x, z), z);
      this.interactables.push({
        id: `campfire:${pid}`,
        kind: 'campfire',
        pos,
        label: 'Rest at campfire',
        use: () => {
          hooks.setLastSafe(x, z);
          s.addToast('Safe point marked.');
          s.openSleep();
          if (document.pointerLockElement) document.exitPointerLock();
        },
      });
    }

    // ---- relay switch (one-shot) ----
    {
      const [x, z] = at('relay_switch');
      const pos = new THREE.Vector3(x, hooks.groundY(x, z), z);
      this.interactables.push({
        id: 'relay_switch',
        kind: 'switch',
        pos,
        label: hooks.isCleared('relay_switch') ? 'Relay switch (online)' : 'Throw the relay switch',
        use: () => {
          if (hooks.isCleared('relay_switch')) {
            s.addToast('The relay is already online.');
            return;
          }
          hooks.markCleared('relay_switch');
          s.questEvent('interact', 'poi:relay_switch', 1);
          s.setFlag('relay_online');
          sfx.play('switch', { volume: 1 });
          s.addToast('The relay hums back to life.');
        },
      });
    }

    // ---- NPCs ----
    const npcDefs: { id: string; poiId: string; label: string; jacket: number }[] = [
      { id: 'npc:jonah', poiId: 'jonah_camp', label: 'Talk to Jonah', jacket: 0x5a4632 },
      { id: 'npc:kowalski', poiId: 'lighthouse_base', label: 'Talk to Kowalski', jacket: 0x3c5a6e },
    ];
    for (const n of npcDefs) {
      const [x, z] = at(n.poiId);
      const y = hooks.groundY(x, z);
      const mesh = personMesh(n.jacket, 0xc9a180);
      mesh.position.set(x + 2.2, y, z + 1.5);
      mesh.rotation.y = Math.PI * 0.75;
      hooks.scene.add(mesh);
      const pos = mesh.position.clone();
      this.interactables.push({
        id: n.id,
        kind: 'npc',
        pos,
        label: n.label,
        use: () => {
          const src = n.id as 'npc:jonah' | 'npc:kowalski';
          s.questEvent('talk', n.id, 1);
          s.openDialogue(src, 'start');
          sfx.play('ui', { volume: 0.5 });
        },
      });
    }

    // ---- beacon (lighthouse top choice) ----
    {
      const [x, z] = at('lighthouse_base');
      const pos = new THREE.Vector3(x, hooks.groundY(x, z), z);
      this.interactables.push({
        id: 'beacon',
        kind: 'beacon',
        pos,
        label: 'Climb to the lamp room',
        use: () => {
          const st = useGameStore.getState();
          const rep = st.rep['lighthouse'] ?? 0;
          if (rep >= 50) {
            st.openDialogue('npc:kowalski', 'beacon_choice');
          } else {
            st.addToast(`The beacon needs the Collective's trust (Lighthouse rep 50 — have ${rep}).`);
            sfx.play('ui', { volume: 0.5 });
          }
        },
      });
    }

    // ---- hand-placed weapon pickups: see it on the ground, take it ----
    const pickup = (id: string, itemId: string, qty: number, poiId: string, dx: number, dz: number) => {
      const [px, pz] = at(poiId);
      this.registerPickup(id, itemId, qty, px + dx, pz + dz);
    };
    pickup('pk_machete', 'machete', 1, 'jonah_camp', 3.5, -1.5);
    pickup('pk_hatchet', 'hatchet', 1, 'forest_cache', -3, 2.5);
    pickup('pk_pistol', 'pistol', 1, 'town', 9, -5);
    pickup('pk_flare', 'flare', 2, 'relay_station', 2.5, -2);
    pickup('pk_bandage', 'bandage', 2, 'shore_camp', -2.5, 3);
  }

  /** Mark a container fully looted: hide the crate, relabel the prompt. */
  setContainerEmptied(id: string): void {
    this.hooks.markLooted(id);
    const m = this.crateMeshes.get(id);
    if (m) m.visible = false;
    const it = this.interactables.find((i) => i.id === id);
    if (it) it.label = 'Empty container';
  }

  /** Visible ground pickup with its own mesh. One-shot: taken once. */
  registerPickup(id: string, itemId: string, qty: number, x: number, z: number): void {
    const s = useGameStore.getState();
    const def = ITEMS[itemId];
    if (!def) return;
    const y = this.hooks.groundY(x, z);
    const mesh = buildPickupMesh(itemId, qty);
    mesh.position.set(x, y + 0.32, z);
    mesh.rotation.y = this.hooks.rng() * Math.PI * 2;
    mesh.userData.baseY = y + 0.32;
    mesh.userData.phase = this.hooks.rng() * Math.PI * 2;
    this.hooks.scene.add(mesh);
    this.pickupMeshes.set(id, mesh);
    const entry: Interactable = {
      id: `pickup:${id}`,
      kind: 'pickup',
      pos: new THREE.Vector3(x, y, z),
      label: `Take ${def.name}${qty > 1 ? ` ×${qty}` : ''}`,
      use: () => {
        if (!s.addItem(itemId, qty)) return; // addItem toasts the reason
        this.hooks.scene.remove(mesh);
        this.pickupMeshes.delete(id);
        const ix = this.interactables.indexOf(entry);
        if (ix >= 0) this.interactables.splice(ix, 1);
        sfx.play('pickup', { volume: 0.8 });
      },
    };
    this.interactables.push(entry);
  }

  /** Gentle bob for ground pickups so they read as interactive. */
  update(_dt: number, elapsed: number): void {
    for (const mesh of this.pickupMeshes.values()) {
      mesh.position.y = (mesh.userData.baseY as number) + Math.sin(elapsed * 2 + (mesh.userData.phase as number)) * 0.06;
      mesh.rotation.y += _dt * 0.4;
    }
  }

  /**
   * Register a searchable husk corpse. Loot rolls from the zone's table —
   * what they were is what they carried (Skyrim-style).
   */
  registerCorpse(id: string, x: number, z: number, zoneId: string): void {
    const s = useGameStore.getState();
    const pos = new THREE.Vector3(x, this.hooks.groundY(x, z), z);
    const table = HUSK_LOOT[zoneId] ?? HUSK_LOOT.default;
    const entry: Interactable = {
      id: `corpse:${id}`,
      kind: 'corpse',
      pos,
      label: 'Search husk',
      use: () => {
        if (this.searchedCorpses.has(id)) {
          s.addToast('Nothing else on the body.');
          return;
        }
        const rng = this.hooks.rng;
        const taken: string[] = [];
        for (const e of table) {
          if (rng() > e.chance) continue;
          const qty = Math.max(1, Math.round(e.min + rng() * (e.max - e.min)));
          if (!s.addItem(e.id, qty, true)) {
            s.addToast('Pack full — left the rest on the body.');
            break;
          }
          s.questEvent('collect', e.id, qty);
          taken.push(`${qty > 1 ? `${qty}× ` : ''}${ITEMS[e.id]?.name ?? e.id}`);
        }
        this.searchedCorpses.add(id);
        entry.label = 'Searched husk';
        if (taken.length) s.addToast(`Taken: ${taken.join(', ')}.`);
        else s.addToast('Empty pockets.');
        sfx.play('pickup', { volume: 0.6 });
      },
    };
    this.interactables.push(entry);
  }

  /** Nearest interactable within maxDist of (x,z), or null. */
  nearest(x: number, z: number, maxDist: number): Interactable | null {
    let best: Interactable | null = null;
    let bestD = maxDist;
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - x, it.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }
}

/** Container placement. Positions are offsets around their POI. */
export function buildContainerDefs(pois: Record<string, [number, number]>): ContainerDef[] {
  const off = (pid: string, dx: number, dz: number): [number, number] => {
    const [x, z] = pois[pid] ?? [0, 0];
    return [x + dx, z + dz];
  };
  const C = (
    id: string, pid: string, dx: number, dz: number, loot: LootEntry[],
  ): ContainerDef => {
    const [x, z] = off(pid, dx, dz);
    return { id, x, z, loot };
  };
  return [
    C('c_wreck_phone', 'wreck', 3, 2, [{ id: 'phone', min: 1, max: 1, chance: 1 }]),
    C('c_wreck_1', 'wreck', -4, 3, [
      { id: 'scrap', min: 1, max: 3, chance: 0.9 },
      { id: 'cloth', min: 1, max: 2, chance: 0.7 },
      { id: 'canned_food', min: 1, max: 2, chance: 0.6 },
    ]),
    C('c_shore_1', 'shore_camp', 5, -4, [
      { id: 'canned_food', min: 1, max: 2, chance: 0.8 },
      { id: 'water_bottle', min: 1, max: 2, chance: 0.7 },
    ]),
    C('c_town_1', 'town', 12, 8, [
      { id: 'scrap', min: 2, max: 4, chance: 0.9 },
      { id: 'wire', min: 1, max: 2, chance: 0.6 },
    ]),
    C('c_town_2', 'town', -18, 12, [
      { id: 'cloth', min: 1, max: 3, chance: 0.8 },
      { id: 'bandage', min: 1, max: 2, chance: 0.5 },
    ]),
    C('c_town_3', 'town', 22, -14, [
      { id: 'ammo_9mm', min: 4, max: 10, chance: 0.6 },
      { id: 'scrap', min: 1, max: 2, chance: 0.8 },
    ]),
    C('c_town_4', 'town', -8, -20, [
      { id: 'canned_food', min: 1, max: 3, chance: 0.8 },
      { id: 'water_bottle', min: 1, max: 2, chance: 0.6 },
    ]),
    C('c_forest_1', 'forest_cache', 4, 3, [
      { id: 'relay_part', min: 1, max: 1, chance: 1 },
      { id: 'scrap', min: 1, max: 2, chance: 0.7 },
    ]),
    C('c_forest_2', 'forest_cache', -5, -3, [
      { id: 'relay_part', min: 1, max: 1, chance: 1 },
      { id: 'wire', min: 1, max: 3, chance: 0.8 },
    ]),
    C('c_dune_1', 'dune_cache', 3, -4, [
      { id: 'relay_part', min: 1, max: 1, chance: 1 },
      { id: 'cloth', min: 1, max: 2, chance: 0.7 },
    ]),
    C('c_relay_1', 'relay_station', -10, 6, [
      { id: 'scrap', min: 2, max: 4, chance: 0.9 },
      { id: 'ammo_9mm', min: 4, max: 8, chance: 0.6 },
    ]),
    C('c_light_1', 'lighthouse_base', -6, 5, [
      { id: 'bandage', min: 1, max: 2, chance: 0.8 },
      { id: 'medkit', min: 1, max: 1, chance: 0.4 },
    ]),
  ];
}
