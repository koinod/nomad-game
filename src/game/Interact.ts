// Interact.ts — containers, campfires, relay switch, NPCs, beacon.
// E within 3m picks the nearest interactable.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { ITEMS, HUSK_LOOT, LOG_LOOT, BUSH_LOOT } from '../data/items';
import { DESIGNED_RECRUITS } from '../data/survivors';
import { CLAIMABLE } from '../data/base';
import { buildGroundMesh } from './weaponMeshes';
import { buildFurnitureMesh, FURNITURE_LABEL, type FurnitureKind } from './furnitureMeshes';
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
  /** Furniture: distinct mesh + prompt label instead of a crate. */
  label?: string;
  meshKind?: FurnitureKind;
  rotY?: number;
  /** Locked (safes): needs a lockpick to start searching. */
  locked?: boolean;
  /** Seconds of hold-to-search before the loot panel opens. */
  searchTime?: number;
  /** Explicit placement height (upstairs furniture in two-story houses);
   *  when set, the container ignores terrain/floor inference. */
  y?: number;
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
  setCamp?: (poiId: string) => void; // which campfire opened the sleep dialog
  hostilesNear?: (x: number, z: number, r: number) => number; // base-claim gate
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
  private crateMeshes = new Map<string, THREE.Object3D>();
  private emptyLabels = new Map<string, string>();
  private furnitureIds = new Set<string>(); // furniture stays visible when empty
  private searchedCorpses = new Set<string>();
  private pickupMeshes = new Map<string, THREE.Group>();
  private hooks: InteractHooks;
  // hold-to-search bookkeeping (Game drives the timer)
  private containersById = new Map<string, ContainerDef>();
  private searchedContainers = new Set<string>();

  containerDef(id: string): ContainerDef | undefined {
    return this.containersById.get(id);
  }

  /** Wave 3 Scout intel: real container census around a point — how many
   *  searchable containers stand within r meters and how many are emptied. */
  containersNear(x: number, z: number, r: number): { total: number; looted: number } {
    let total = 0;
    let looted = 0;
    for (const c of this.containersById.values()) {
      const dx = c.x - x;
      const dz = c.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      total++;
      if (this.hooks.isLooted(c.id)) looted++;
    }
    return { total, looted };
  }

  isSearched(id: string): boolean {
    return this.searchedContainers.has(id) || this.searchedCorpses.has(id.replace(/^corpse:/, ''));
  }

  markSearched(id: string): void {
    this.searchedContainers.add(id);
  }

  useById(id: string): void {
    const it = this.interactables.find((i) => i.id === id);
    it?.use();
  }

  constructor(hooks: InteractHooks, pois: Record<string, [number, number]>, containers: ContainerDef[]) {
    this.hooks = hooks;
    const s = useGameStore.getState();
    const at = (id: string): [number, number] => pois[id] ?? [0, 0];

    // ---- containers ----
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6e5a3e, roughness: 1 });
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    for (const c of containers) {
      const y = c.y ?? hooks.groundY(c.x, c.z);
      const pos = new THREE.Vector3(c.x, y, c.z);
      let mesh: THREE.Object3D;
      if (c.meshKind) {
        // furniture: distinct mesh, sits on the interior floor
        mesh = buildFurnitureMesh(c.meshKind);
        mesh.position.set(c.x, y, c.z);
        mesh.rotation.y = c.rotY ?? 0;
      } else {
        const cm = new THREE.Mesh(crateGeo, crateMat);
        cm.position.set(c.x, y + 0.45, c.z);
        cm.rotation.y = hooks.rng() * Math.PI;
        mesh = cm;
      }
      mesh.visible = !hooks.isLooted(c.id);
      hooks.scene.add(mesh);
      this.crateMeshes.set(c.id, mesh);
      this.containersById.set(c.id, c);
      this.emptyLabels.set(c.id, c.label ? c.label.replace('Search', 'Empty') : 'Empty container');
      if (c.meshKind) this.furnitureIds.add(c.id);
      this.interactables.push({
        id: c.id,
        kind: 'container',
        pos,
        label: hooks.isLooted(c.id) ? 'Empty container' : (c.label ?? 'Search container'),
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
          hooks.setCamp?.(pid);
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

    // ---- designed recruits: talk them into joining the crew ----
    const recruitDefs: { key: string; poiId: string; dx: number; dz: number; jacket: number; line: string }[] = [
      { key: 'elena', poiId: 'lighthouse_base', dx: -3, dz: 4, jacket: 0xd8d8d0, line: 'Elena: "I ran an ER before the silence. Patch me a place to work and I\u2019m yours."' },
      { key: 'mateo', poiId: 'relay_station', dx: -14, dz: 8, jacket: 0x7a4a2a, line: 'Mateo: "Truck died two miles back. Nobody\u2019s coming. Say the word and I\u2019ll walk with you."' },
      { key: 'lina', poiId: 'dune_cache', dx: 2, dz: -3, jacket: 0x4a5a3a, line: 'Lina: "I\u2019ve been watching the road from the dunes. You walk loud — I can fix that. Take me with you."' },
    ];
    for (const r of recruitDefs) {
      const def = DESIGNED_RECRUITS[r.key];
      if (!def) continue;
      const [px, pz] = at(r.poiId);
      const x = px + r.dx;
      const z = pz + r.dz;
      const y = hooks.groundY(x, z);
      const mesh = personMesh(r.jacket, 0xa8785a);
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.PI * 0.3;
      hooks.scene.add(mesh);
      this.interactables.push({
        id: `recruit:${r.key}`,
        kind: 'npc',
        pos: mesh.position.clone(),
        label: `Recruit ${def.name}`,
        use: () => {
          if (s.survivors.some((sv) => sv.id === def.id)) {
            s.addToast(`${def.name} is already with your crew.`);
            return;
          }
          s.addToast(r.line);
          s.recruitSurvivor({ ...def });
          sfx.play('quest', { volume: 0.5 });
        },
      });
    }

    // ---- claim posts: take a camp as your home base (BASE_DESIGN) ----
    for (const c of CLAIMABLE) {
      const [px, pz] = at(c.poiId);
      const x = px - 4;
      const z = pz + 6;
      const y = hooks.groundY(x, z);
      const post = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a5136, roughness: 0.9 }),
      );
      pole.position.y = 1.3;
      post.add(pole);
      const banner = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xe8b34b, roughness: 0.7, emissive: 0x442e08 }),
      );
      banner.position.set(0.45, 2.2, 0);
      post.add(banner);
      post.position.set(x, y, z);
      hooks.scene.add(post);
      this.interactables.push({
        id: `claim:${c.poiId}`,
        kind: 'switch',
        pos: post.position.clone(),
        label: `Claim ${c.name} as home base`,
        use: () => {
          if (s.base) {
            s.addToast(`Your home base is already claimed.`);
            return;
          }
          const hostiles = hooks.hostilesNear?.(x, z, 40) ?? 0;
          if (hostiles > 0) {
            s.addToast(`Clear the camp first — ${hostiles} husk${hostiles > 1 ? 's' : ''} nearby.`);
            return;
          }
          s.claimBase(c.poiId);
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
    pickup('pk_bat', 'baseball_bat', 1, 'town', -6, 4);
    pickup('pk_knife', 'combat_knife', 1, 'wreck', 1.5, -1);
    pickup('pk_sledge', 'sledgehammer', 1, 'relay_station', -3, 2.5);
    pickup('pk_shotgun', 'shotgun', 1, 'lighthouse_base', 2.5, 3.5);
    pickup('pk_frag', 'frag', 2, 'relay_station', -4, 4);
    pickup('pk_molotov', 'molotov', 2, 'jonah_camp', 4, -3);
    pickup('pk_flashbang', 'flashbang', 2, 'relay_station', 5, 2);
    pickup('pk_vest', 'armored_vest', 1, 'lighthouse_base', -2.5, 2.5);
    pickup('pk_helmet', 'riot_helmet', 1, 'relay_station', 2, -4);
    pickup('pk_lockpick', 'lockpick', 2, 'town', 10, -8);
    pickup('pk_toolkit', 'tool_kit', 1, 'town', -14, 6);
    // full roster spawns: every weapon findable on the beta island
    pickup('pk_crowbar', 'crowbar', 1, 'town', 100, 50);
    pickup('pk_fireaxe', 'fire_axe', 1, 'town', 72, 26);
    pickup('pk_spear', 'spear', 1, 'forest_cache', 3, -2);
    pickup('pk_baton', 'riot_baton', 1, 'relay_station', -3, 3);
    pickup('pk_flaregun', 'flare_gun', 1, 'lighthouse_base', -4, -3);
    pickup('pk_revolver', 'revolver', 1, 'town', 52, -26);
    pickup('pk_crossbow', 'crossbow', 1, 'jonah_camp', -13, -7);
    pickup('pk_bolts', 'bolts', 12, 'forest_cache', -2, 3);
    pickup('pk_smg', 'smg', 1, 'relay_station', 6, -2);
    pickup('pk_carbine', 'carbine', 1, 'wreck', 3, 2);
    pickup('pk_556', 'ammo_556', 40, 'wreck', -3, -2);
    pickup('pk_dmr', 'dmr', 1, 'lighthouse_base', 5, -4);
    pickup('pk_smoke', 'smoke', 2, 'relay_station', -6, -3);
    pickup('pk_boombox', 'boombox', 1, 'town', 48, -24);
    pickup('pk_rocks', 'rock', 3, 'shore_camp', 3, 5);
    pickup('pk_shells', 'shells', 6, 'town', 4, 1.5);
    pickup('pk_rifle', 'hunting_rifle', 1, 'jonah_camp', -3.5, 3.5);
    pickup('pk_rifle_ammo', 'ammo_rifle', 8, 'relay_station', 3.5, -3);
  }

  /** Mark a container fully looted: hide the mesh (crates only — furniture
   *  stays), relabel the prompt. */
  setContainerEmptied(id: string): void {
    this.hooks.markLooted(id);
    if (!this.furnitureIds.has(id)) {
      const m = this.crateMeshes.get(id);
      if (m) m.visible = false;
    }
    const it = this.interactables.find((i) => i.id === id);
    if (it) it.label = this.emptyLabels.get(id) ?? 'Empty container';
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
        if (!s.addItem(itemId, qty, false, { found: true })) return; // addItem toasts the reason
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
          if (!s.addItem(e.id, qty, true, { found: true })) {
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
    kind?: 'logpile' | 'berrybush',
  ): ContainerDef => {
    const [x, z] = off(pid, dx, dz);
    const def: ContainerDef = { id, x, z, loot };
    if (kind) {
      def.meshKind = kind;
      def.label = FURNITURE_LABEL[kind];
      def.searchTime = 1.2; // gathering is quick work
    }
    return def;
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
    // vehicle-part caches: every upgrade/repair input is findable in the
    // world (and craftable at the Machine Shop) — logistics + military spots
    C('c_parts_warehouse', 'town', 100, 50, [
      { id: 'tire', min: 1, max: 1, chance: 0.9 },
      { id: 'engine_part', min: 1, max: 1, chance: 0.8 },
      { id: 'armor_plate', min: 1, max: 2, chance: 0.6 },
      { id: 'scrap', min: 2, max: 4, chance: 0.9 },
    ]),
    C('c_parts_garage', 'town', -36, -18, [
      { id: 'tire', min: 1, max: 1, chance: 0.8 },
      { id: 'car_battery', min: 1, max: 1, chance: 0.6 },
      { id: 'scrap', min: 1, max: 3, chance: 0.9 },
    ]),
    C('c_parts_gas', 'town', 72, 26, [
      { id: 'fuel_can', min: 1, max: 1, chance: 0.7 },
      { id: 'tire', min: 1, max: 1, chance: 0.5 },
      { id: 'engine_part', min: 1, max: 1, chance: 0.4 },
    ]),
    C('c_parts_wreck', 'wreck', -9, -7, [
      { id: 'engine_part', min: 1, max: 1, chance: 0.7 },
      { id: 'tire', min: 1, max: 1, chance: 0.6 },
      { id: 'car_battery', min: 1, max: 1, chance: 0.5 },
    ]),
    C('c_parts_relay', 'relay_station', 8, 3, [
      { id: 'car_battery', min: 1, max: 1, chance: 0.8 },
      { id: 'armor_plate', min: 1, max: 1, chance: 0.5 },
      { id: 'wire', min: 2, max: 3, chance: 0.8 },
    ]),
    C('c_parts_light', 'lighthouse_base', 9, -3, [
      { id: 'armor_plate', min: 1, max: 2, chance: 0.6 },
      { id: 'engine_part', min: 1, max: 1, chance: 0.6 },
      { id: 'gun_parts', min: 1, max: 2, chance: 0.6 },
    ]),
    C('c_parts_marina', 'marina', 7, -3, [
      { id: 'tire', min: 1, max: 1, chance: 0.7 },
      { id: 'car_battery', min: 1, max: 1, chance: 0.6 },
      { id: 'tool_kit', min: 1, max: 1, chance: 0.3 },
    ]),
    // harvest nodes: fallen logs give wood, berry bushes give produce
    C('n_log_1', 'forest_cache', -14, 6, LOG_LOOT, 'logpile'),
    C('n_log_2', 'forest_cache', 16, -10, LOG_LOOT, 'logpile'),
    C('n_log_3', 'shore_camp', -12, 10, LOG_LOOT, 'logpile'),
    C('n_log_4', 'jonah_camp', 14, 12, LOG_LOOT, 'logpile'),
    C('n_bush_1', 'forest_cache', 8, -14, BUSH_LOOT, 'berrybush'),
    C('n_bush_2', 'forest_cache', -8, 14, BUSH_LOOT, 'berrybush'),
    C('n_bush_3', 'jonah_camp', -16, -8, BUSH_LOOT, 'berrybush'),
    C('n_bush_4', 'dune_cache', -10, 8, BUSH_LOOT, 'berrybush'),
  ];
}
