// Interact.ts — containers, campfires, relay switch, NPCs, beacon.
// E within 3m picks the nearest interactable.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { ITEMS, HUSK_LOOT, HUSK_KIND_LOOT, LOG_LOOT, BUSH_LOOT, rollLoot, weightedChance } from '../data/items';
import { DESIGNED_RECRUITS, SURVIVOR_LOOKS, NPC_LOOKS, type SurvivorLook } from '../data/survivors';
import { buildHumanFigure } from './figureKit';
import { CLAIMABLE } from '../data/base';
import { buildGroundMesh } from './weaponMeshes';
import { buildItemModel } from './itemModels';
import { buildFurnitureMesh, applyDisturbed, applyRestored, FURNITURE_LABEL, type FurnitureKind } from './furnitureMeshes';
import { sfx } from '../systems/audio';
import { AlarmRegistry, type AlarmDef } from './alarm';
import { CAMPFIRE_SPOTS, biomeAt, findLandZ } from './World';
import { ENCLAVE_CACHES, NPC_PLACEMENTS } from '../data/worldWiring';

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
  /** Alarm wiring (§4.4): this container stands at an alarmed POI, and
   *  if `major`, opening it crosses the tripwire (unless disarmed). */
  alarmPoiId?: string;
  major?: boolean;
  /** Seconds of hold-to-search before the loot panel opens. */
  searchTime?: number;
  /** Explicit placement height (upstairs furniture in two-story houses);
   *  when set, the container ignores terrain/floor inference. */
  y?: number;
  /** Stage 7 (W6): quest target fired once when the container is first
   *  opened (the Enclave caches' `cache:<id>` interacts). */
  questTarget?: string;
  /** Stage 7 (W6): a line toasted the first time the container opens. */
  flavor?: string;
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
  /** World Y of the lighthouse lamp room floor — the beacon lives there now. */
  lampRoomY?: number;
  /** Extra alarm definitions (§4.4) beyond the spec's flagged set. */
  alarmDefs?: AlarmDef[];
}

export interface Interactable {
  id: string;
  kind: 'container' | 'campfire' | 'switch' | 'npc' | 'beacon' | 'corpse' | 'pickup';
  pos: THREE.Vector3;
  label: string;
  use: () => void;
}

/**
 * A standing person — LANE 4 (stage 3): delegates to the figureKit rig,
 * the same parametric humanoid that builds the player avatar and every
 * husk. The old box-stacked builder is deleted; looks (skin / jacket /
 * pants / build / hair) come from SURVIVOR_LOOKS / NPC_LOOKS data.
 */
function personMesh(
  look: Pick<SurvivorLook, 'skin' | 'jacket'> & Partial<Omit<SurvivorLook, 'skin' | 'jacket'>>,
): THREE.Group {
  return buildHumanFigure({
    palette: {
      skin: look.skin,
      jacket: look.jacket,
      pants: look.pants ?? 0x35322c,
      hair: look.hair,
    },
    build: look.build,
    hairStyle: look.hairStyle,
  }).group;
}

/** Distinct physical mesh per item — see weaponMeshes.ts. */
function buildPickupMesh(itemId: string, qty: number): THREE.Group {
  // stage 7: Lane 6's itemModels take the seam (43 modeled items render
  // their real silhouettes); everything else keeps weaponMeshes' mesh.
  const inner = buildItemModel(itemId, qty) ?? buildGroundMesh(itemId, qty);
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
  /** POI alarm engine (§4.4): trips queue events here for Game to
   *  execute (noise burst + scout pair); flags mirror each trip for
   *  consumers that only read the store. */
  readonly alarms = new AlarmRegistry();
  private crateMeshes = new Map<string, THREE.Object3D>();
  private emptyLabels = new Map<string, string>();
  private furnitureIds = new Set<string>(); // furniture stays visible when empty
  private searchedCorpses = new Set<string>();
  private pickupMeshes = new Map<string, THREE.Group>();
  private hooks: InteractHooks;
  // hold-to-search bookkeeping (Game drives the timer)
  private containersById = new Map<string, ContainerDef>();
  private searchedContainers = new Set<string>();
  // respawn clocks (§4.5): when an eligible container was emptied (abs
  // game minutes) and which have since restocked. Persisted across
  // sessions via WorldDiff.lootedAt (harvested by getLootedAt, seeded
  // from the constructor's savedLootedAt); a looted container with no
  // saved timestamp starts its clock at world build, as before.
  private lootedAtMin = new Map<string, number>();
  private respawnedIds = new Set<string>();
  private freshLabels = new Map<string, string>();
  private respawnSweep = 0;

  private absMinutes(): number {
    const st = useGameStore.getState();
    return st.daysElapsed * 1440 + st.timeMinutes;
  }

  containerDef(id: string): ContainerDef | undefined {
    return this.containersById.get(id);
  }

  /** Respawn clocks for the save snapshot (WorldDiff.lootedAt): abs game
   *  minutes when each eligible container was emptied and not yet
   *  restocked. Game.getWorldDiff harvests this on save. */
  getLootedAt(): Record<string, number> {
    return Object.fromEntries(this.lootedAtMin);
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
      if (this.hooks.isLooted(c.id) && !this.respawnedIds.has(c.id)) looted++;
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

  constructor(hooks: InteractHooks, pois: Record<string, [number, number]>, containers: ContainerDef[], savedLootedAt?: Record<string, number>) {
    this.hooks = hooks;
    const s = useGameStore.getState();
    const at = (id: string): [number, number] => pois[id] ?? [0, 0];
    // the alarm registry starts with the spec's flagged set; world
    // wiring can register more (or re-register to override) via hooks
    this.alarms.registerAll(AlarmRegistry.specDefs());
    if (hooks.alarmDefs) this.alarms.registerAll(hooks.alarmDefs);

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
      this.freshLabels.set(c.id, c.label ?? 'Search container');
      // a container a previous session emptied resumes its respawn clock
      // from the saved timestamp; with none saved it starts now — the
      // island forgets slowly, and this is when you showed up
      if (hooks.isLooted(c.id) && respawnEligible(c)) {
        const saved = savedLootedAt?.[c.id];
        this.lootedAtMin.set(c.id, typeof saved === 'number' && Number.isFinite(saved) ? saved : this.absMinutes());
      }
      if (c.meshKind) this.furnitureIds.add(c.id);
      this.interactables.push({
        id: c.id,
        kind: 'container',
        pos,
        label: hooks.isLooted(c.id) ? 'Empty container' : (c.label ?? 'Search container'),
        use: () => {
          // fresh state: the constructor's `s` snapshot goes stale after any set()
          const st = useGameStore.getState();
          // a restocked container bypasses the save's looted flag and
          // re-rolls fresh — the respawn clock already vouched for it
          const restocked = this.respawnedIds.has(c.id);
          if (restocked) this.respawnedIds.delete(c.id);
          if (hooks.isLooted(c.id) && !restocked) {
            st.addToast('Nothing left here.');
            return;
          }
          // §4.4 tripwire: opening the POI's major container crosses it.
          // A lockpick doesn't help you here — only the disarm box does.
          // Interact applies the toast/rep/flag; the 60m noise burst and
          // the scout pair are Game's to fire (registry event queue).
          if (c.alarmPoiId && c.major) {
            const ev = this.alarms.trip(c.alarmPoiId, 'container_trip');
            if (ev) {
              st.addToast(ev.effect.toast);
              sfx.play('beacon', { volume: 0.8 });
              if (ev.effect.factionRep) st.addRep(ev.effect.factionRep.faction, ev.effect.factionRep.delta);
              st.setFlag(`alarm_tripped:${c.alarmPoiId}`);
            }
          }
          // W6 (stage 7): quest containers report their interact once,
          // on first open (the isLooted early-return above keeps it
          // one-shot; locked containers never respawn either).
          if (c.questTarget) {
            st.questEvent('interact', c.questTarget, 1);
            if (c.flavor) st.addToast(c.flavor);
          }
          // loot preview: roll once, stash it, show the panel — take what you want.
          // §4.5: the container's biome weights each entry's class, so the
          // same crate table plays differently in the forest vs in town.
          if (restocked || !st.lootStash[c.id]) {
            const items = rollLoot(c.loot, hooks.rng, {
              resourceMult: hooks.resourceMult,
              biome: biomeAt(c.x, c.z),
            });
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

    // ---- alarm boxes (§4.4): one per alarmed POI, by its first wired
    // container. The 30s disarm timer is a hold interaction Game routes
    // (DISARM_SECONDS in alarm.ts); the requirements + state are the
    // engine's, checked here at the box.
    {
      const boxAt = new Map<string, ContainerDef>();
      for (const c of containers) {
        if (c.alarmPoiId && !boxAt.has(c.alarmPoiId)) boxAt.set(c.alarmPoiId, c);
      }
      for (const [poiId, c] of boxAt) {
        const pos = new THREE.Vector3(c.x + 0.9, hooks.groundY(c.x + 0.9, c.z + 0.9), c.z + 0.9);
        this.interactables.push({
          id: `alarmbox:${poiId}`,
          kind: 'switch',
          pos,
          label: 'Alarm box',
          use: () => {
            const st = useGameStore.getState();
            const check = this.alarms.canDisarm(
              poiId,
              st.countItem('tool_kit') > 0,
              st.skills?.mechanics?.level ?? 0,
            );
            if (!check.ok) {
              st.addToast(
                check.reason === 'no_toolkit' ? 'You need a tool kit to open the alarm box.'
                : check.reason === 'low_skill' ? 'Disarming this needs Mechanics 2.'
                : check.reason === 'not_armed' && this.alarms.state(poiId) === 'tripped' ? 'Too late — it\u2019s already blown.'
                : 'The alarm is already dark.',
              );
              sfx.play('ui', { volume: 0.5 });
              return;
            }
            if (this.alarms.disarm(poiId)) {
              st.addToast('Alarm disarmed. The POI stays quiet.');
              st.setFlag(`alarm_disarmed:${poiId}`);
              sfx.play('switch', { volume: 0.8 });
            }
          },
        });
      }
    }

    // ---- campfires (safe points + rest) ----
    for (const pid of ['shore_camp', 'jonah_camp', 'lighthouse_base']) {
      const [bx, bz] = at(pid);
      const [ox, oz] = CAMPFIRE_SPOTS[pid] ?? [0, 0];
      const x = bx + ox;
      const z = bz + oz;
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
    interface RecruitDef {
      key: string; poiId: string; dx: number; dz: number; jacket: number; line: string;
      /** wave 4 encounter gates: an item to hand over, or a world flag. */
      requiresItem?: { itemId: string; label: string };
      requiresFlag?: string;
      lockedLine?: string; // spoken while the gate is unmet
    }
    const recruitDefs: RecruitDef[] = [
      { key: 'elena', poiId: 'lighthouse_base', dx: -5.5, dz: 5.5, jacket: 0xd8d8d0, line: 'Elena: "I ran an ER before the silence. Patch me a place to work and I\u2019m yours."' },
      { key: 'mateo', poiId: 'relay_station', dx: -14, dz: 8, jacket: 0x7a4a2a, line: 'Mateo: "Truck died two miles back. Nobody\u2019s coming. Say the word and I\u2019ll walk with you."' },
      { key: 'lina', poiId: 'dune_cache', dx: 2, dz: -3, jacket: 0x4a5a3a, line: 'Lina: "I\u2019ve been watching the road from the dunes. You walk loud — I can fix that. Take me with you."' },
      {
        // wave 4: stranded at the marina, leg wrecked — he drives anything
        // afloat or rolling, but he cannot walk out on his own
        key: 'dez', poiId: 'marina', dx: 6, dz: -4, jacket: 0xb8562e,
        requiresItem: { itemId: 'bandage', label: 'a bandage' },
        lockedLine: 'Dez: "Leg\u2019s torn up on the rocks. Wrap it — a bandage, anything — and I can move. I drive boats, trucks, whatever floats or rolls."',
        line: 'Dez: "That\u2019ll hold. Twenty years pulling people out of the water, and I end up the cargo. Let\u2019s fix that — point me at a wheel."',
      },
      {
        // wave 4: camped on the wreck with her radio — she moves only once
        // the relay (the interactable north of here) proves a world answers
        key: 'priya', poiId: 'wreck', dx: -3, dz: 5, jacket: 0x87551f,
        requiresFlag: 'relay_online',
        lockedLine: 'Priya: "I\u2019ve called into the static for nine days. Nobody calls back. Get that relay breathing, stranger — then I\u2019ll know this island isn\u2019t a grave with good weather."',
        line: 'Priya: "You HEARD that? A carrier wave — an actual voice-shaped thing. Okay. Okay. I\u2019m in. Radios, engines, night watches — I\u2019m yours."',
      },
    ];
    for (const r of recruitDefs) {
      const def = DESIGNED_RECRUITS[r.key];
      if (!def) continue;
      const [px, pz] = at(r.poiId);
      const x = px + r.dx;
      const z = pz + r.dz;
      const y = hooks.groundY(x, z);
      const look = SURVIVOR_LOOKS[r.key];
      const mesh = look
        ? personMesh(look)
        : personMesh({ jacket: r.jacket, skin: 0xa8785a });
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.PI * 0.3;
      hooks.scene.add(mesh);
      this.interactables.push({
        id: `recruit:${r.key}`,
        kind: 'npc',
        pos: mesh.position.clone(),
        label: `Recruit ${def.name}`,
        use: () => {
          // fresh state, not the build-time capture: the crew list moves
          if (useGameStore.getState().survivors.some((sv) => sv.id === def.id)) {
            s.addToast(`${def.name} is already with your crew.`);
            return;
          }
          // wave 4 encounter gates: the encounter resolves before the join
          if (r.requiresFlag && !useGameStore.getState().flags[r.requiresFlag]) {
            if (r.lockedLine) s.addToast(r.lockedLine);
            return;
          }
          if (r.requiresItem) {
            const st = useGameStore.getState();
            if (st.countItem(r.requiresItem.itemId) < 1) {
              if (r.lockedLine) s.addToast(r.lockedLine);
              return;
            }
            const stack = st.inventory.find((i) => i.itemId === r.requiresItem!.itemId && i.qty > 0);
            if (stack) st.removeItem(stack.uid, 1); // the bandage goes on the leg, not back in the bag
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
    type NpcDef = {
      id: string; poiId?: string; label: string; jacket: number;
      dx?: number; dz?: number; ax?: number; az?: number;
    };
    const npcDefs: NpcDef[] = [
      { id: 'npc:jonah', poiId: 'jonah_camp', label: 'Talk to Jonah', jacket: 0x5a4632 },
      // Kowalski stands in the lighthouse watch room now (finished,
      // door-reachable — the kit building's npcPoint matches this spot)
      { id: 'npc:kowalski', poiId: 'lighthouse_base', label: 'Talk to Kowalski', jacket: 0x3c5a6e, dx: -1.8, dz: 1.0 },
    ];
    // W2 (stage 7): Lane 9's placements. POI-anchored where the data
    // gives a poiId; Wraith anchors to the tollgate POI W1 landed (his
    // approx IS the tollgate); the Accountant stands free at his dune
    // approx, z resolved by the same land scan the POIs use.
    for (const p of NPC_PLACEMENTS) {
      const def: NpcDef = {
        id: `npc:${p.key}`,
        label: `Talk to ${p.name}`,
        jacket: 0x4a4438,
        dx: p.dx,
        dz: p.dz,
      };
      if (p.poiId) def.poiId = p.poiId;
      else if (p.key === 'wraith') def.poiId = 'tollgate';
      else if (p.approx) {
        def.ax = p.approx[0];
        def.az = findLandZ(p.approx[0], p.approx[1]);
      }
      npcDefs.push(def);
    }
    for (const n of npcDefs) {
      const [x, z] = n.ax !== undefined && n.az !== undefined ? [n.ax, n.az] : at(n.poiId!);
      const mx = x + (n.dx ?? 2.2);
      const mz = z + (n.dz ?? 1.5);
      const y = hooks.groundY(mx, mz);
      const nLook = NPC_LOOKS[n.id.replace('npc:', '')];
      const mesh = nLook
        ? personMesh(nLook)
        : personMesh({ jacket: n.jacket, skin: 0xc9a180 });
      mesh.position.set(mx, y, mz);
      mesh.rotation.y = Math.PI * 0.75;
      hooks.scene.add(mesh);
      const pos = mesh.position.clone();
      this.interactables.push({
        id: n.id,
        kind: 'npc',
        pos,
        label: n.label,
        use: () => {
          s.questEvent('talk', n.id, 1);
          s.openDialogue(n.id, 'start');
          sfx.play('ui', { volume: 0.5 });
        },
      });
    }

    // ---- beacon (lighthouse top choice) ----
    {
      const [x, z] = at('lighthouse_base');
      const pos = new THREE.Vector3(x, hooks.lampRoomY ?? hooks.groundY(x, z), z);
      this.interactables.push({
        id: 'beacon',
        kind: 'beacon',
        pos,
        label: 'Climb to the lamp room',
        use: () => {
          const st = useGameStore.getState();
          // the beacon is up the tower now — using it from the ground
          // just tells you where it lives; the rep gate below is the
          // original one, unchanged
          if (hooks.lampRoomY !== undefined && st.pos[1] < hooks.lampRoomY - 1.5) {
            st.addToast('The beacon waits in the lamp room — six flights up the tower stair.');
            sfx.play('ui', { volume: 0.5 });
            return;
          }
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
    pickup('pk_shotgun', 'shotgun', 1, 'lighthouse_base', 5.5, 3.0);
    pickup('pk_frag', 'frag', 2, 'relay_station', -4, 4);
    pickup('pk_molotov', 'molotov', 2, 'jonah_camp', 4, -3);
    pickup('pk_flashbang', 'flashbang', 2, 'relay_station', 5, 2);
    pickup('pk_vest', 'armored_vest', 1, 'lighthouse_base', -5.5, 2.0);
    pickup('pk_helmet', 'riot_helmet', 1, 'relay_station', 2, -4);
    pickup('pk_lockpick', 'lockpick', 2, 'town', 10, -8);
    pickup('pk_toolkit', 'tool_kit', 1, 'town', -14, 6);
    // full roster spawns: every weapon findable on the beta island
    pickup('pk_crowbar', 'crowbar', 1, 'town', 100, 50);
    pickup('pk_fireaxe', 'fire_axe', 1, 'town', 72, 26);
    pickup('pk_spear', 'spear', 1, 'forest_cache', 3, -2);
    pickup('pk_baton', 'riot_baton', 1, 'relay_station', -3, 3);
    pickup('pk_flaregun', 'flare_gun', 1, 'lighthouse_base', -5.5, -3.5);
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
   *  stays, but shows its disturbed state), relabel the prompt, and start
   *  the container's respawn clock if it has one. */
  setContainerEmptied(id: string): void {
    this.hooks.markLooted(id);
    const def = this.containersById.get(id);
    if (def && respawnEligible(def)) {
      this.lootedAtMin.set(id, this.absMinutes());
    }
    if (!this.furnitureIds.has(id)) {
      const m = this.crateMeshes.get(id);
      if (m) m.visible = false;
    } else {
      const m = this.crateMeshes.get(id);
      if (m) applyDisturbed(m); // searched-out furniture reads searched-out
    }
    const it = this.interactables.find((i) => i.id === id);
    if (it) it.label = this.emptyLabels.get(id) ?? 'Empty container';
  }

  /** Respawn sweep: restock every container whose clock has run out —
   *  mesh back, furniture restored, fresh label, loot re-rolls on open. */
  private sweepRespawns(): void {
    const now = this.absMinutes();
    for (const [id, at] of this.lootedAtMin) {
      if (now - at < respawnDaysFor(id) * 1440) continue;
      this.lootedAtMin.delete(id);
      this.respawnedIds.add(id);
      const mesh = this.crateMeshes.get(id);
      if (mesh) {
        if (this.furnitureIds.has(id)) applyRestored(mesh);
        mesh.visible = true;
      }
      const it = this.interactables.find((i) => i.id === id);
      if (it) it.label = this.freshLabels.get(id) ?? 'Search container';
    }
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
    // respawn clocks tick on game time; a 2s real-time sweep is plenty
    this.respawnSweep += _dt;
    if (this.respawnSweep >= 2) {
      this.respawnSweep = 0;
      this.sweepRespawns();
    }
  }

  /**
   * Register a searchable husk corpse. Loot rolls from the zone's table —
   * what they were is what they carried (Skyrim-style).
   */
  registerCorpse(id: string, x: number, z: number, zoneId: string, kind?: string): void {
    const s = useGameStore.getState();
    const pos = new THREE.Vector3(x, this.hooks.groundY(x, z), z);
    // zone table (what the place was) + kind table (what the thing was)
    const table = [
      ...(HUSK_LOOT[zoneId] ?? HUSK_LOOT.default),
      ...(kind ? (HUSK_KIND_LOOT[kind] ?? []) : []),
    ];
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
        const biome = biomeAt(x, z); // §4.5 weighting applies to corpses too
        const taken: string[] = [];
        for (const e of table) {
          if (rng() > weightedChance(e, biome)) continue;
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

/**
 * Respawn period in game days for a container — sodgame's 7–21d band
 * (POIS_FACTIONS_VEHICLES / GAP_AUDIT), hashed per id so the island
 * forgets unevenly: one crate is back in a week, its twin takes three.
 */
export function respawnDaysFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 7 + (h % 15);
}

/**
 * Which containers get a respawn clock at all. Locked one-shots (safes)
 * never restock — their permanence is the reward structure — and a
 * container carrying a guaranteed key item (the phone, relay parts)
 * must never duplicate its quest item.
 */
export function respawnEligible(c: ContainerDef): boolean {
  if (c.locked) return false;
  return !c.loot.some((e) => e.chance >= 1 && ITEMS[e.id]?.category === 'key');
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
    // W6 (stage 7): the Enclave's three dead drops (worldWiring
    // ENCLAVE_CACHES) — lockpick-gated and one-shot (locked containers
    // never respawn), each carrying its signature item + generic tech,
    // each firing its `cache:<id>` interact so q_enclave_burst — already
    // startable since stage 4's radio burst — can complete end-to-end.
    ...ENCLAVE_CACHES.map((cache): ContainerDef => {
      const p = pois[cache.poiId!] ?? [0, 0];
      return {
        id: cache.id,
        x: p[0] + cache.dx,
        z: p[1] + cache.dz,
        label: 'Search dead drop',
        locked: true,
        questTarget: `cache:${cache.id}`,
        flavor: cache.flavor,
        loot: [
          { id: cache.signatureItem, min: 1, max: 1, chance: 1 },
          { id: 'wire', min: 2, max: 4, chance: 0.9 },
          { id: 'circuit_board', min: 1, max: 1, chance: 0.4 },
          { id: 'scrap', min: 2, max: 4, chance: 0.8 },
        ],
      };
    }),
  ];
}
