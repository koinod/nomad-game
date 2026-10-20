// Game.ts — engine orchestrator. Owns the renderer, loop, and all subsystems.
// Public API matches INTERFACES.md exactly.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { DifficultyId, SaveSnapshot, WorldDiff } from '../store/types';
import { DIFFICULTIES } from '../store/types';
import { QUESTS } from '../data/quests';
import { input, resetEdgeTriggers } from './input';
import { ITEMS } from '../data/items';
import { World, heightAt, biomeAt, initTerrainField } from './World';
import { Player } from './Player';
import { HuskManager } from './Husks';
import type { Husk, SpawnZone } from './Husks';
import { InteractSystem, buildContainerDefs } from './Interact';
import { AnimalManager } from './Animals';
import { VehicleManager, type Vehicle } from './Vehicles';
import { floorYAt, floorYAtRef, resolveCollisions, type Collider, type FloorRect } from './Colliders';
import { sfx, ambience } from '../systems/audio';
import { ENDING_LINES } from '../narrative/dialogue';
import {
  totalWeightKg, carryLimitKg, encumbranceTier,
} from '../store/inventoryUtils';
import { mulberry32, clamp } from './rng';

function campName(id: string): string {
  switch (id) {
    case 'shore_camp': return 'the shore camp';
    case 'jonah_camp': return "Jonah's camp";
    case 'lighthouse_base': return 'the lighthouse camp';
    default: return id;
  }
}

export type BiomeId = 'beach' | 'dune' | 'forest' | 'town' | 'marsh' | 'water';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private world: World | null = null;
  private player: Player | null = null;
  private husks: HuskManager | null = null;
  private animals: AnimalManager | null = null;
  private interact: InteractSystem | null = null;
  // thrown weapons in flight + molotov fire zones
  private throwables: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    fuse: number;
    itemId: string;
  }[] = [];
  private fireZones: { group: THREE.Group; t: number; x: number; z: number }[] = [];
  private decoys: { group: THREE.Group; t: number; tick: number; x: number; z: number }[] = [];
  // hold-to-search state (container / corpse / safe)
  private searching: { id: string; label: string; t: number; dur: number; x: number; z: number; hp: number } | null = null;
  vehicles!: VehicleManager;
  driving: Vehicle | null = null;
  private wasFirstPerson = false;
  private cleanMeters = 0;
  private houseColliders: Collider[] = [];
  private houseFloors: FloorRect[] = [];
  private houseRoofs: { bounds: Collider; group: THREE.Group }[] = [];

  private raf = 0;
  private running = false;
  private lastT = 0;
  private elapsed = 0;
  private initialized = false;
  private rng: () => number = mulberry32(1);

  private keys = new Set<string>();
  private lastSafe: [number, number] = [0, 0];
  private lastCampId: string | null = null; // campfire POI used to open the sleep dialog
  private meatCounter = 0;

  private looted = new Set<string>();
  private deadHusks = new Set<string>();
  private cleared = new Set<string>();

  private syncT = 0;
  private timeT = 0;
  private skyT = 0;
  private dangerT = 0;
  private lastNight = false;
  private cutscene = false;
  private cutT = 0;
  private cutLine = -1;
  private hitstopT = 0; // freeze-frame on melee connect, seconds

  private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
  private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
  private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
  private onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
  private onCanvasClick = () => this.handleCanvasClick();
  private onResize = () => this.handleResize();
  private onPointerLockChange = () => this.handleLockChange();
  private onWheel = (e: WheelEvent) => {
    if (!this.player) return;
    // scroll: pull the third-person camera in/out (2.5m .. 9m)
    this.player.zoomDist = Math.max(2.5, Math.min(9, this.player.zoomDist + e.deltaY * 0.01));
  };
  private onContextMenu = (e: Event) => e.preventDefault();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  // ------------------------------------------------------------------ init

  async init(opts: { seed: number; difficulty: DifficultyId; snapshot?: SaveSnapshot | null }): Promise<void> {
    this.rng = mulberry32(opts.seed ^ 0x5eed);
    initTerrainField(opts.seed);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      (this.canvas.clientWidth || window.innerWidth) / (this.canvas.clientHeight || window.innerHeight),
      0.1,
      3200,
    );
    // in-scene so first-person view-model children render
    this.scene.add(this.camera);

    this.world = new World(this.scene, opts.seed);
    this.world.build();

    // vehicles: the full roster parked around the island
    this.vehicles = new VehicleManager();
    this.vehicles.spawn(this.scene!, this.world.poiPositions, (x, z) => heightAt(x, z));

    // register POIs (contract)
    useGameStore.getState().setPoiPositions(this.world.poiPositions);

    // houses + POI buildings: colliders, floor rects, roofs, containers
    this.houseColliders = [
      ...this.world.houses.colliders,
      ...this.world.poiBuildings.colliders,
      ...this.world.stationColliders,
    ];
    this.houseFloors = [...this.world.houses.floors, ...this.world.poiBuildings.floors];
    this.houseRoofs = [...this.world.houses.roofs, ...this.world.poiBuildings.roofs];

    // snapshot world diff
    const snap = opts.snapshot ?? null;
    if (snap) {
      for (const id of snap.world.looted) this.looted.add(id);
      for (const id of snap.world.deadHusks) this.deadHusks.add(id);
      for (const id of snap.world.cleared) this.cleared.add(id);
    }

    // player
    this.player = new Player(this.scene);
    const s0 = useGameStore.getState();
    const [sx, sz] = this.world.poi('shore_camp');
    this.lastSafe = [sx, sz];
    if (snap) {
      const [px, , pz] = snap.player.pos;
      this.player.setPosition(px, heightAt(px, pz) + 0.5, pz);
      this.player.stamina = s0.stamina;
    } else {
      // spawn a short walk from the shore camp so q_prologue step 2 is earned
      const px = sx - 14;
      const pz = sz + 16;
      this.player.setPosition(px, heightAt(px, pz) + 0.5, pz);
      this.player.camYaw = Math.atan2(sx - px, sz - pz) + Math.PI;
    }
    this.player.camYaw = Math.PI * 0.9;

    // husks
    const zones: SpawnZone[] = [
      { id: 'forest', x: 180, z: 40, radius: 55, count: 3, kinds: ['shambler', 'stalker'] },
      { id: 'town', x: 40, z: 0, radius: 60, count: 4, kinds: ['shambler'] },
      { id: 'relay', x: 330, z: -40, radius: 42, count: 5, kinds: ['shambler', 'stalker'] },
      { id: 'dunes', x: 470, z: 150, radius: 55, count: 2, kinds: ['stalker'], nightOnly: true },
    ];
    this.husks = new HuskManager(this.scene, zones, opts.seed);
    this.husks.spawnInitial(this.deadHusks, (x, z) => this.groundY(x, z), this.isNight());

    // wildlife: deer + rabbits, huntable for raw meat
    this.animals = new AnimalManager(this.scene, opts.seed);
    this.animals.spawnInitial((x, z) => heightAt(x, z));

    // interactables
    const resourceMult = DIFFICULTIES[s0.difficulty].resourceMult;
    this.interact = new InteractSystem(
      {
        resourceMult,
        rng: this.rng,
        groundY: (x, z) => this.groundY(x, z),
        scene: this.scene,
        isLooted: (id) => this.looted.has(id),
        markLooted: (id) => { this.looted.add(id); },
        isCleared: (id) => this.cleared.has(id),
        markCleared: (id) => { this.cleared.add(id); },
        setLastSafe: (x, z) => { this.lastSafe = [x, z]; },
        setCamp: (id) => { this.lastCampId = id; },
        hostilesNear: (x, z, r) => this.husks?.aliveWithin(x, z, r) ?? 0,
      },
      this.world.poiPositions,
      [...buildContainerDefs(this.world.poiPositions), ...this.world.houses.containers, ...this.world.poiBuildings.containers],
    );

    // shadow flags for world + husk + interactable meshes (idempotent)
    this.world.applyShadowFlags();

    // listeners
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });

    this.lastNight = this.isNight();
    ambience.start();
    ambience.setNight(this.lastNight);
    this.world.updateSky(s0.timeMinutes);
    this.initialized = true;
  }

  start(): void {
    if (this.running || !this.initialized) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const rawDt = clamp((t - this.lastT) / 1000, 0, 0.1);
      this.lastT = t;
      // hitstop: freeze the sim for a beat on impact (render still draws)
      let dt = rawDt;
      if (this.hitstopT > 0) {
        this.hitstopT -= rawDt;
        dt = rawDt * 0.06;
      }
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Freeze-frame for impact feel — called by the player controller on hit. */
  requestHitstop(seconds: number): void {
    this.hitstopT = Math.max(this.hitstopT, seconds);
  }

  setPaused(p: boolean): void {
    useGameStore.getState().setPaused(p);
    if (p && document.pointerLockElement) document.exitPointerLock();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
    ambience.stop();
    this.husks?.dispose();
    this.animals?.dispose();
    this.world?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.initialized = false;
  }

  // ------------------------------------------------------------- public API

  getPlayerSnapshot(): { pos: [number, number, number]; hp: number } {
    const s = useGameStore.getState();
    const p = this.player?.pos ?? new THREE.Vector3();
    return { pos: [p.x, p.y, p.z], hp: s.hp };
  }

  getWorldDiff(): WorldDiff {
    return {
      looted: [...this.looted],
      deadHusks: [...this.deadHusks],
      cleared: [...this.cleared],
    };
  }

  getHeightAt(x: number, z: number): number {
    return this.initialized ? heightAt(x, z) : 0;
  }

  getBiomeAt(x: number, z: number): BiomeId {
    return this.initialized ? biomeAt(x, z) : 'beach';
  }

  /** Terrain height, raised by interior floor rects inside houses. */
  groundY(x: number, z: number): number {
    return Math.max(heightAt(x, z), floorYAt(x, z, this.houseFloors));
  }

  /** Height-aware ground: floors above the walker's reach don't count —
   *  the ground floor of a two-story house stays on the ground floor. */
  groundYRef(x: number, z: number, refY: number): number {
    return Math.max(heightAt(x, z), floorYAtRef(x, z, this.houseFloors, refY));
  }

  respawnAtSafePoint(): void {
    if (!this.player) return;
    const [x, z] = this.lastSafe;
    this.player.setPosition(x, heightAt(x, z) + 0.5, z);
    this.player.stamina = 100;
    this.player.camYaw = Math.PI * 0.9;
    sfx.play('quest', { volume: 0.5 });
  }

  /** Fast travel between campfires: the road takes time, like everything else. */
  travelTo(poiId: string): void {
    if (!this.player || !this.world) return;
    const s = useGameStore.getState();
    const [x, z] = this.world.poi(poiId);
    const dist = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
    const minutes = Math.max(30, Math.round((dist / 350) * 60));
    this.player.setPosition(x, heightAt(x, z) + 0.5, z);
    this.player.camYaw = Math.PI * 0.9;
    this.lastSafe = [x, z];
    this.lastCampId = poiId;
    s.advanceTime(minutes);
    s.closeSleep();
    const h = (minutes / 60).toFixed(1);
    s.addToast(`You walk the island's back paths to ${campName(poiId)} — ${h}h pass.`);
    sfx.play('quest', { volume: 0.5 });
    void s.autosave();
  }

  /** Campfires available for fast travel (all three, labeled for the dialog). */
  campOptions(): { id: string; name: string }[] {
    return [
      { id: 'shore_camp', name: 'Shore camp' },
      { id: 'jonah_camp', name: "Jonah's camp" },
      { id: 'lighthouse_base', name: 'Lighthouse camp' },
    ];
  }

  currentCampId(): string | null {
    return this.lastCampId;
  }

  /**
   * Skyrim-style sleep: duration chosen in the sleep dialog. Blocked when
   * husks are close. Longer sleep heals more; a full 8h grants Well Rested.
   */
  trySleep(hours: number): void {
    const s = useGameStore.getState();
    const player = this.player;
    if (!player || !this.husks) return;
    const threat = this.husks.nearestThreat(player.pos.x, player.pos.z);
    if (threat && threat.dist < 28) {
      s.addToast("Can't sleep — something's moving out there.");
      sfx.play('ui', { volume: 0.5 });
      return;
    }
    const missing = s.maxHp - s.hp;
    const healed = Math.round(Math.min(missing, Math.max(20, (hours / 8) * s.maxHp)));
    s.advanceTime(hours * 60);
    if (healed > 0) s.healPlayer(healed);
    player.stamina = 100;
    s.chargeBattery(hours * 12);
    if (hours >= 8) s.setWellRested(6 * 60);
    const t = s.timeMinutes;
    const clock = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    s.addToast(
      `Slept ${hours}h — woke at ${clock}.${healed > 0 ? ` Recovered ${healed} HP.` : ''}${hours >= 8 ? ' Well rested.' : ''}`,
    );
    s.closeSleep();
    sfx.play('quest', { volume: 0.7 });
    void s.autosave();
  }

  async playEndingCutscene(): Promise<void> {
    if (!this.world || !this.camera) return;
    this.cutscene = true;
    this.cutT = 0;
    this.cutLine = -1;
    this.setPaused(false);
    if (document.pointerLockElement) document.exitPointerLock();
    sfx.play('beacon', { volume: 1 });
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!this.cutscene) resolve();
        else setTimeout(check, 250);
      };
      check();
    });
  }

  // ------------------------------------------------------------------ tick

  private isNight(): boolean {
    const t = useGameStore.getState().timeMinutes;
    return t < 360 || t >= 1080;
  }

  private tick(dt: number): void {
    const s = useGameStore.getState();
    this.elapsed += dt;

    // global edge triggers (work even while the world is paused)
    if (input.pause && s.screen === 'game' && !s.dead && !this.cutscene) {
      // Esc closes the loot panel first; it doesn't open the pause menu
      if (s.lootOpenId != null) {
        useGameStore.getState().closeLoot();
      } else {
        this.setPaused(!s.paused);
      }
      sfx.play('ui', { volume: 0.4 });
    }
    if (input.interact && s.lootOpenId != null) {
      // E toggles the loot panel shut (world is paused, so simulate never sees it)
      useGameStore.getState().closeLoot();
      sfx.play('ui', { volume: 0.4 });
    }
    if (input.phone && s.screen === 'game' && !s.dead && !s.dialogue && !this.cutscene) {
      // Tab/P: the phone when it's live; the field pack when the phone is
      // dead or not recovered yet — same fallback G uses
      const phoneLive = s.phoneUnlocked && s.battery > 0;
      if (s.phoneOpen) s.closePhone();
      else if (s.backpackOpen) s.closeBackpack();
      else if (phoneLive) {
        s.openPhone();
        // opening the phone without freeing the mouse left the UI unclickable
        if (useGameStore.getState().phoneOpen && document.pointerLockElement) {
          document.exitPointerLock();
        }
      } else {
        s.openBackpack();
        if (useGameStore.getState().backpackOpen && document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
      sfx.play('phone', { volume: 0.5 });
    }
    if (input.backpack && s.screen === 'game' && !s.dead && !s.dialogue && !this.cutscene) {
      // G = inventory, unified: live phone opens its Loadout (the phone's
      // inventory UI); dead / no phone opens the translucent limited pack.
      const st = useGameStore.getState();
      if (st.backpackOpen) {
        st.closeBackpack();
      } else if (st.phoneOpen) {
        st.closePhone();
      } else if (st.phoneUnlocked && st.battery > 0) {
        st.openPhone('loadout');
        if (useGameStore.getState().phoneOpen && document.pointerLockElement) {
          document.exitPointerLock();
        }
      } else {
        st.openBackpack();
        if (useGameStore.getState().backpackOpen && document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
      sfx.play('ui', { volume: 0.5 });
    }
    if (input.hotbar >= 1 && input.hotbar <= 3 && s.screen === 'game' && !s.dialogue) {
      s.useHotbar(input.hotbar - 1);
    }

    const worldPaused =
      this.cutscene ||
      s.paused ||
      s.dialogue != null ||
      s.phoneOpen ||
      s.backpackOpen ||
      s.sleepOpen ||
      s.lootOpenId != null ||
      s.dead ||
      s.screen !== 'game';

    if (!worldPaused && this.player && this.husks && this.world && this.camera) {
      this.simulate(dt, s);
    } else {
      s.setInteractPrompt(null);
    }

    // cutscene camera path
    if (this.cutscene && this.world && this.camera) this.updateCutscene(dt);

    // sky at ~4Hz (avoids per-frame color allocations)
    this.skyT -= dt;
    if (this.skyT <= 0 && this.world) {
      this.skyT = 0.25;
      const sky = this.world.updateSky(s.timeMinutes);
      if (sky.isNight !== this.lastNight) {
        this.lastNight = sky.isNight;
        ambience.setNight(sky.isNight);
      }
    }
    this.world?.update(dt, this.elapsed);
    this.interact?.update(dt, this.elapsed);

    this.renderer?.render(this.scene!, this.camera!);
    resetEdgeTriggers();
  }

  private simulate(dt: number, s: ReturnType<typeof useGameStore.getState>): void {
    const player = this.player!;
    const husks = this.husks!;
    const camera = this.camera!;

    // clock: 1 real second = 1 game minute
    this.timeT += dt;
    if (this.timeT >= 1) {
      const before = s.timeMinutes;
      s.advanceTime(this.timeT);
      this.timeT = 0;
      // a new day (clock wrapped past midnight): crew morale settles
      if (s.timeMinutes < before) {
        s.advanceDay();
        s.moraleTick();
        s.baseTick();
      }
    }

    // crafting-station proximity: stand within 4.5m of a station to use it
    let foundStation: import('../data/items').StationId | null = null;
    const px = player.pos.x;
    const pz = player.pos.z;
    for (const st of this.world!.stations) {
      const dx = st.x - px;
      const dz = st.z - pz;
      if (dx * dx + dz * dz <= 20.25) {
        foundStation = st.station;
        break;
      }
    }
    s.setNearStation(foundStation);

    // encumbrance gates sprint + slows movement
    const tier = encumbranceTier(
      totalWeightKg(s.inventory),
      carryLimitKg(s.equipped, s.inventory, s.difficulty, s.perks.includes('sc_packmule') ? 8 : 0),
    );
    const speedMul = tier === 'ok' ? 1 : tier === 'heavy' ? 0.75 : 0.55;

    const playerCtx = {
      groundY: (x: number, z: number) => this.groundYRef(x, z, player.pos.y),
      sprintAllowed: tier === 'ok',
      speedMul,
      husks,
      animals: this.animals!,
      emitNoise: (x: number, z: number, r: number) => {
        const eff = useGameStore.getState().perks.includes('gh_soft') ? r * 0.75 : r;
        husks.emitNoise(x, z, eff);
        this.animals?.emitNoise(x, z, eff);
        // the HUD noise meter tracks the loudest sound at the player
        useGameStore.getState().setNoiseLevel(Math.min(100, (eff / 80) * 100));
      },
      onThrow: (itemId: string) => this.throwGrenade(itemId),
      onAnimalKill: (kill: { id: string; kind: string; x: number; z: number; min: number; max: number }) => {
        // gut the kill: raw meat appears where the animal fell
        const qty = kill.min + Math.floor(this.rng() * (kill.max - kill.min + 1));
        this.interact?.registerPickup(
          `meat_${this.meatCounter++}`,
          kill.id,
          qty,
          kill.x + (this.rng() - 0.5) * 1.4,
          kill.z + (this.rng() - 0.5) * 1.4,
        );
        useGameStore.getState().addToast(`Dressed the ${kill.kind} — ${qty}× raw meat.`);
        sfx.play('pickup', { volume: 0.5 });
      },
      camera,
      colliders: this.houseColliders,
    };
    if (this.driving) {
      this.updateDriving(dt, s, playerCtx);
    } else {
      player.update(dt, playerCtx);
    }
    this.world?.updateShadowTarget(player.pos.x, player.pos.z);

    // hide the roof of whatever house the player is inside (see your own rooms)
    for (const r of this.houseRoofs) {
      const b = r.bounds;
      r.group.visible = !(
        player.pos.x > b.x0 - 0.5 && player.pos.x < b.x1 + 0.5 &&
        player.pos.z > b.z0 - 0.5 && player.pos.z < b.z1 + 0.5
      );
    }

    const night = this.isNight();
    husks.update(
      dt,
      {
        playerPos: player.pos,
        isNight: night,
        groundY: (x, z, refY) => this.groundYRef(x, z, refY ?? 0),
        colliders: this.houseColliders,
        onHuskKilled: (h) => this.onHuskKilled(h),
      },
      player.pos,
      night,
    );
    this.animals?.update(dt, player.pos, (x, z) => heightAt(x, z));

    // husk death bookkeeping (kill counted once when the tip-over starts)
    for (const h of husks.husks) {
      if (h.state === 'dead' && !h.killReported) {
        h.killReported = true;
        this.onHuskKilled(h);
      }
    }

    // thrown weapons: arc, bounce lightly off ground, blow on fuse
    for (let i = this.throwables.length - 1; i >= 0; i--) {
      const g = this.throwables[i];
      g.fuse -= dt;
      g.vel.y -= 9.8 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const gy = this.groundY(g.mesh.position.x, g.mesh.position.z);
      if (g.mesh.position.y < gy + 0.1) {
        g.mesh.position.y = gy + 0.1;
        g.vel.y *= -0.35; // cheap bounce
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        this.throwables.splice(i, 1);
        this.detonate(g);
      }
    }
    // molotov fire zones: deny the area, tick damage
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const f = this.fireZones[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.scene!.remove(f.group);
        this.fireZones.splice(i, 1);
        continue;
      }
      (f as { tick?: number }).tick = ((f as { tick?: number }).tick ?? 0) + dt;
      if ((f as { tick?: number }).tick! >= 0.5) {
        (f as { tick?: number }).tick = 0;
        this.husks!.damageInRadius(f.x, f.z, 4, 14);
        this.animals?.damageInRadius(f.x, f.z, 4, 14);
      }
      f.group.scale.setScalar(0.75 + (f.t / 6) * 0.35); // burns down
    }

    // boombox decoys: keep singing until the tape runs out
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t -= dt;
      d.tick += dt;
      if (d.t <= 0) {
        this.scene!.remove(d.group);
        this.decoys.splice(i, 1);
        continue;
      }
      if (d.tick >= 1.5) {
        d.tick = 0;
        this.noiseAt(d.x, d.z, 35);
      }
    }

    // hold-to-search: the timer runs while the player stays close and unhurt.
    // Tapping interact (F on desktop, USE on touch) while searching cancels it —
    // the press is consumed so the prompt block below doesn't restart the search.
    if (this.searching) {
      const q = this.searching;
      if (input.interact) {
        input.interact = false;
        this.searching = null;
        s.setSearch(null);
        s.addToast('Search cancelled.');
      } else {
        const moved = Math.hypot(player.pos.x - q.x, player.pos.z - q.z);
      if (moved > 2 || s.hp < q.hp) {
        this.searching = null;
        s.setSearch(null);
        s.addToast('Search interrupted.');
      } else {
        q.t += dt;
        s.setSearch({ id: q.id, label: q.label, frac: Math.min(1, q.t / q.dur) });
        if (q.t >= q.dur) {
          this.interact!.markSearched(q.id);
          const def = this.interact!.containerDef(q.id);
          if (def?.locked) {
            const lp = s.inventory.find((i) => i.itemId === 'lockpick');
            if (lp && !s.perks.includes('sc_locksmith')) {
              s.removeItem(lp.uid, 1);
              s.addToast('The lockpick turns. One less in the kit.');
            } else if (lp) {
              s.addToast('Picked clean — the pick survives. (Locksmith)');
            }
            s.addSkillXp('scavenging', 10);
          } else if (q.label.startsWith('Gather')) {
            s.addSkillXp('scavenging', 3);
          } else {
            s.addSkillXp('scavenging', 4);
            s.addSkillXp('stealth', 5);
          }
          this.searching = null;
          s.setSearch(null);
          this.interact!.useById(q.id);
        }
      }
      }
    }

    // noise meter decays — silence is the default state
    if (s.noiseLevel > 0) s.setNoiseLevel(s.noiseLevel * Math.pow(0.2, dt));

    // interact prompt (F within 3m) — a vehicle within reach takes priority
    const veh = !this.driving && !this.searching
      ? this.vehicles.nearest(player.pos.x, player.pos.z, 2.9)
      : null;
    if (this.driving) {
      s.setInteractPrompt('[F] Exit vehicle');
    } else if (veh) {
      const fuelNote = veh.fuel <= 0.05 ? ' — TANK EMPTY' : veh.fuel < veh.def.fuelMax * 0.35 ? ' · [R] refuel' : '';
      s.setInteractPrompt(`[F] Drive ${veh.def.name}${fuelNote}`);
      if (input.interact) {
        this.enterVehicle(veh);
        input.interact = false;
      } else if (input.refuel) {
        this.refuelVehicle(veh);
        input.refuel = false;
      }
    } else {
      const near = this.interact!.nearest(player.pos.x, player.pos.z, 3);
      s.setInteractPrompt(near ? `[F] ${near.label}` : null);
      if (input.interact && near && !this.searching) {
        const handled = this.beginSearchIfNeeded(near);
        if (!handled) {
          near.use();
          // refresh prompt (e.g. container now looted)
          const again = this.interact!.nearest(player.pos.x, player.pos.z, 3);
          s.setInteractPrompt(again ? `[F] ${again.label}` : null);
        }
      }
    }

    // reach-type quest steps
    this.checkReachSteps(s, player.pos.x, player.pos.z);

    // battery
    if (s.phoneOpen) s.drainBattery(dt * 0.3);
    else if (!night) s.chargeBattery(dt * 0.05);

    // player mirror @ ~10Hz
    this.syncT += dt;
    if (this.syncT >= 0.1) {
      this.syncT = 0;
      s.syncPlayer([player.pos.x, player.pos.y, player.pos.z], s.hp, player.stamina);
    }

    // ambience danger @ ~2Hz
    this.dangerT -= dt;
    if (this.dangerT <= 0) {
      this.dangerT = 0.5;
      const t = husks.nearestThreat(player.pos.x, player.pos.z);
      ambience.setDanger(t.hunting || t.dist < 25 ? 2 : t.dist < 60 ? 1 : 0);
    }
  }

  private checkReachSteps(s: ReturnType<typeof useGameStore.getState>, px: number, pz: number): void {
    const pois = s.poiPositions;
    for (const q of s.quests) {
      const def = QUESTS.find((d) => d.id === q.id);
      const step = def?.steps[q.stepIndex];
      if (!step || step.type !== 'reach' || !step.target.startsWith('poi:')) continue;
      const p = pois[step.target.slice(4)];
      if (!p) continue;
      if (Math.hypot(p[0] - px, p[1] - pz) < 6) {
        s.questEvent('reach', step.target, 1);
      }
    }
  }

  /** Called by the store when a container's staged loot is fully taken. */
  completeContainerLoot(containerId: string): void {
    this.interact?.setContainerEmptied(containerId);
    const s = useGameStore.getState();
    s.addToast('Container emptied.');
    void s.autosave();
  }

  private onHuskKilled(h: Husk): void {
    this.deadHusks.add(h.id);
    const s = useGameStore.getState();
    s.questEvent('kill', 'husk', 1);
    // the body stays where it fell — search it for zone-tied loot
    this.interact?.registerCorpse(h.id, h.group.position.x, h.group.position.z, h.zoneId);
  }

  private updateCutscene(dt: number): void {
    const DUR = 18;
    this.cutT += dt;
    const t = Math.min(this.cutT, DUR);
    const [lx, lz] = this.world!.poi('lighthouse_base');
    const lampY = heightAt(lx, lz) + 29;
    const ang = (t / DUR) * Math.PI * 2.2 + 0.6;
    const radius = 46;
    const cam = this.camera!;
    cam.position.set(
      lx + Math.cos(ang) * radius,
      lampY + 9 + Math.sin(t * 0.45) * 5,
      lz + Math.sin(ang) * radius,
    );
    cam.lookAt(lx, lampY, lz);
    const line = Math.min(
      ENDING_LINES.length - 1,
      Math.floor((t / DUR) * ENDING_LINES.length),
    );
    if (line !== this.cutLine) {
      this.cutLine = line;
      useGameStore.getState().setCutsceneLine(line);
    }
    if (this.cutT >= DUR) {
      this.cutscene = false;
      useGameStore.getState().setScreen('ending');
    }
  }

  // ----------------------------------------------------------------- input

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        input.sprint = true;
        break;
      case 'Space':
        input.jump = true;
        break;
      case 'KeyC':
      case 'ControlLeft':
      case 'ControlRight':
        input.crouch = true;
        break;
      case 'KeyE':
        input.leanRight = true; // held: lean right (F is interact now)
        break;
      case 'KeyQ':
        input.leanLeft = true; // held: lean left
        break;
      case 'KeyF':
        input.interact = true;
        break;
      case 'KeyR':
        input.refuel = true;
        break;
      case 'Tab':
      case 'KeyP':
        input.phone = true;
        break;
      case 'KeyI':
      case 'KeyG':
        input.backpack = true; // G primary, I legacy
        break;
      case 'KeyV':
        input.fpToggle = true;
        break;
      case 'Escape':
        input.pause = true;
        break;
      case 'Digit1':
        input.hotbar = 1;
        break;
      case 'Digit2':
        input.hotbar = 2;
        break;
      case 'Digit3':
        input.hotbar = 3;
        break;
    }
    this.applyMoveKeys();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      input.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }
    if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
      input.crouch = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    }
    if (e.code === 'KeyQ') input.leanLeft = false;
    if (e.code === 'KeyE') input.leanRight = false;
    this.applyMoveKeys();
  }

  private applyMoveKeys(): void {
    const k = this.keys;
    input.moveY =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    input.moveX =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (document.pointerLockElement === this.canvas) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
    }
  }

  /** Hold-to-search gate: containers/corpses/safes need a search before the
   *  loot panel opens — once searched, they open instantly. Returns true when
   *  the press was consumed (search started, or a lock stopped it). */
  private beginSearchIfNeeded(near: { id: string; kind: string; label: string }): boolean {
    if (near.kind !== 'container' && near.kind !== 'corpse') return false;
    if (this.interact!.isSearched(near.id)) return false;
    const s = useGameStore.getState();
    const def = this.interact!.containerDef(near.id);
    if (def?.locked && !s.inventory.some((i) => i.itemId === 'lockpick')) {
      s.addToast('Locked. You need a lockpick.');
      return true;
    }
    const baseDur = def?.searchTime ?? (near.kind === 'corpse' ? 1 : 2);
    const dur = s.perks.includes('sc_fingers') ? baseDur * 0.75 : baseDur;
    this.searching = {
      id: near.id,
      label: near.label,
      t: 0,
      dur,
      x: this.player!.pos.x,
      z: this.player!.pos.z,
      hp: s.hp,
    };
    return true;
  }

  // ------------------------------------------------------------------
  // vehicles
  // ------------------------------------------------------------------

  private updateDriving(dt: number, s: ReturnType<typeof useGameStore.getState>, playerCtx: import('./Player').PlayerCtx): void {
    const v = this.driving;
    if (!v) return;
    const player = this.player!;
    const husks = this.husks!;
    const condBefore = v.condition;
    const posBefore = v.group.position.clone();
    this.vehicles.drive(dt, v, input.moveY, input.moveX, {
      groundY: (x, z) => this.groundY(x, z),
      colliders: this.houseColliders,
      ram: (x, z, r, dmg) => {
        const killed = husks.damageInRadius(x, z, r, dmg);
        if (killed > 0) {
          sfx.play('hit', { volume: 0.6 });
          this.requestHitstop(0.06);
        }
        husks.emitNoise(x, z, 20);
      },
      noise: (x, z, r) => {
        husks.emitNoise(x, z, r);
        this.animals?.emitNoise(x, z, r);
        s.setNoiseLevel(Math.min(100, (r / 80) * 100));
      },
      time: this.elapsed,
    });
    const pos = v.group.position;
    player.driveUpdate(dt, playerCtx, pos.x, pos.y, pos.z, v.def.length * 0.9 + 4, {
      kind: v.def.kind,
      id: v.def.id,
      length: v.def.length,
      width: v.def.width,
      heading: v.heading,
    });
    // Driver XP: clean miles count — a collision resets the streak
    if (v.condition < condBefore - 0.001) {
      this.cleanMeters = 0;
    } else {
      this.cleanMeters += Math.hypot(pos.x - posBefore.x, pos.z - posBefore.z);
      if (this.cleanMeters >= 100) {
        this.cleanMeters = 0;
        s.addSkillXp('driver', 5);
      }
    }
    s.setVehicle({
      name: v.def.name,
      speedKmh: Math.round(Math.abs(v.speed) * 3.6),
      fuelPct: v.fuel / v.def.fuelMax,
      condPct: v.condition,
    });
    if (input.interact) {
      this.exitVehicle();
      input.interact = false;
    }
  }

  private enterVehicle(v: Vehicle): void {
    this.driving = v;
    this.wasFirstPerson = this.player!.firstPerson;
    if (this.wasFirstPerson) this.player!.forceFirstPerson(false, this.camera!);
    this.player!.camYaw = v.heading;
    const s = useGameStore.getState();
    s.setVehicle({
      name: v.def.name,
      speedKmh: 0,
      fuelPct: v.fuel / v.def.fuelMax,
      condPct: v.condition,
    });
    s.addToast(`Driving the ${v.def.name}. F to get out${v.fuel <= 0.05 ? ' — the tank is dry, find a fuel can.' : ''}`);
    sfx.play('ui', { volume: 0.5 });
  }

  private exitVehicle(): void {
    const v = this.driving;
    if (!v) return;
    const player = this.player!;
    // climb out on the left flank: left vector for heading h is (cos?, -sin?) —
    // local -X after rotation.y = h maps to (-cos h, 0, +sin h) in world
    const ex = v.group.position.x - Math.cos(v.heading) * (v.def.width / 2 + 1.1);
    const ez = v.group.position.z + Math.sin(v.heading) * (v.def.width / 2 + 1.1);
    player.pos.x = ex;
    player.pos.z = ez;
    player.pos.y = this.groundY(ex, ez);
    resolveCollisions(player.pos, 0.45, this.houseColliders);
    v.speed = 0;
    this.driving = null;
    player.endDrive();
    if (this.wasFirstPerson) player.forceFirstPerson(true, this.camera!);
    useGameStore.getState().setVehicle(null);
    sfx.play('ui', { volume: 0.4 });
  }

  private refuelVehicle(v: Vehicle): void {
    const s = useGameStore.getState();
    const need = v.def.fuelMax - v.fuel;
    if (need < 1) {
      s.addToast('The tank is full.');
      return;
    }
    const can = s.inventory.find((it) => it.itemId === 'fuel_can' && it.qty > 0);
    if (!can) {
      s.addToast('No fuel can in the pack.');
      sfx.play('ui', { volume: 0.3 });
      return;
    }
    if (!s.removeItem(can.uid, 1)) return;
    const add = Math.min(20, need);
    v.fuel = Math.min(v.def.fuelMax, v.fuel + add);
    s.addToast(`Poured in ${Math.round(add)}L of fuel.`);
    sfx.play('pickup', { volume: 0.5 });
  }

  /** Grenade leaves the hand: arc it toward where the player is looking. */
  private throwGrenade(itemId: string): void {
    const player = this.player!;
    const dir = new THREE.Vector3();    this.camera!.getWorldDirection(dir);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(itemId === 'molotov' ? 0.14 : 0.1, 8, 6),
      new THREE.MeshStandardMaterial({
        color: itemId === 'frag' ? 0x3a5230 : itemId === 'molotov' ? 0x7a4a22 : 0x9aa0a8,
        roughness: 0.8,
      }),
    );
    mesh.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    mesh.castShadow = true;
    this.scene!.add(mesh);
    const def = ITEMS[itemId];
    this.throwables.push({
      mesh,
      vel: new THREE.Vector3(dir.x * 16, dir.y * 16 + 4, dir.z * 16),
      fuse: def.thrown?.fuse ?? 1.6,
      itemId,
    });
    sfx.play('swing', { volume: 0.7 });
  }

  /** A grenade goes off: frag = damage + noise, molotov = fire zone, flashbang = blind. */
  private detonate(g: (typeof this.throwables)[number]): void {
    const s = useGameStore.getState();
    const husks = this.husks!;
    const def = ITEMS[g.itemId];
    const raw = def.thrown!;
    // Demolitionist: bigger bang, wider blast
    const th = useGameStore.getState().perks.includes('me_demolition')
      ? { ...raw, aoe: raw.aoe + 1, dmg: Math.round(raw.dmg * 1.25) }
      : raw;
    const p = g.mesh.position;
    this.scene!.remove(g.mesh);
    if (th.lure) {
      // a rock clattering down: pure attention, no damage
      this.noiseAt(p.x, p.z, th.lure);
      sfx.play('ui', { volume: 0.5 });
      return;
    }
    if (th.decoySec) {
      const group = new THREE.Group();
      const boxM = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.35, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x2e2e32, roughness: 0.7 }),
      );
      boxM.castShadow = true;
      const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12),
        new THREE.MeshStandardMaterial({ color: 0x8a929a, roughness: 0.4, metalness: 0.6 }),
      );
      dish.position.set(-0.12, 0.2, 0);
      const dish2 = dish.clone();
      dish2.position.x = 0.14;
      group.add(boxM, dish, dish2);
      group.position.set(p.x, this.groundY(p.x, p.z) + 0.18, p.z);
      this.scene!.add(group);
      this.decoys.push({ group, t: th.decoySec, tick: 0, x: p.x, z: p.z });
      this.noiseAt(p.x, p.z, 35);
      s.addToast('The boombox starts playing. Loudly.');
      return;
    }
    if (th.smoke) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(th.aoe * 0.7, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      puff.position.set(p.x, p.y + 1, p.z);
      this.scene!.add(puff);
      const grow = () => {
        puff.scale.multiplyScalar(1.03);
        (puff.material as THREE.MeshBasicMaterial).opacity *= 0.965;
        if ((puff.material as THREE.MeshBasicMaterial).opacity > 0.03) requestAnimationFrame(grow);
        else this.scene!.remove(puff);
      };
      grow();
      husks.stunInRadius(p.x, p.z, th.aoe, th.blind ?? 4);
      this.noiseAt(p.x, p.z, 10);
      s.addToast('Smoke out — move while they\u2019re blind.');
      return;
    }
    if (th.fire) {
      const group = new THREE.Group();
      const flames = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 3.4, 1.2, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xff6a22, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      flames.position.y = 0.6;
      const glow = new THREE.PointLight(0xff7a33, 24, 16);
      glow.position.y = 1.2;
      group.add(flames, glow);
      group.position.set(p.x, this.groundY(p.x, p.z) + 0.05, p.z);
      this.scene!.add(group);
      this.fireZones.push({ group, t: 6, x: p.x, z: p.z });
      this.noiseAt(p.x, p.z, 14);
      return;
    }
    if (th.blind && !th.smoke) {
      husks.stunInRadius(p.x, p.z, th.aoe, th.blind);
      const flash = new THREE.PointLight(0xffffff, 60, 24);
      flash.position.set(p.x, p.y + 1, p.z);
      this.scene!.add(flash);
      setTimeout(() => this.scene!.remove(flash), 300);
      sfx.play('hit', { volume: 1 });
      this.noiseAt(p.x, p.z, 30);
      s.addToast('Flash out — they lost you.');
      return;
    }
    const flash = new THREE.PointLight(0xffd27a, 80, 26);
    flash.position.set(p.x, p.y + 0.5, p.z);
    this.scene!.add(flash);
    setTimeout(() => this.scene!.remove(flash), 250);
    husks.damageInRadius(p.x, p.z, th.aoe, th.dmg);
    this.animals?.damageInRadius(p.x, p.z, th.aoe, th.dmg);
    this.noiseAt(p.x, p.z, 40);
    this.requestHitstop(0.08);
    sfx.play('hit', { volume: 1 });
  }

  /** Noise that doesn't come from the player — explosions, alarms. */
  private noiseAt(x: number, z: number, r: number): void {
    this.husks?.emitNoise(x, z, r);
    this.animals?.emitNoise(x, z, r);
    useGameStore.getState().setNoiseLevel(Math.min(100, (r / 80) * 100));
  }

  private handleMouseDown(e: MouseEvent): void {
    const s = useGameStore.getState();
    if (s.screen !== 'game' || s.paused || s.dialogue != null || this.cutscene) return;
    if (document.pointerLockElement !== this.canvas) return;
    if (e.button === 0) {
      // left click: fire when holding a loaded gun, bash/swing when not
      const rangedIt = s.equipped.ranged
        ? s.inventory.find((i) => i.uid === s.equipped.ranged)
        : undefined;
      if (rangedIt) {
        const def = ITEMS[rangedIt.itemId];
        const hasAmmo =
          def?.ammoId != null &&
          ((rangedIt.loaded ?? 0) > 0 || s.inventory.some((i) => i.itemId === def.ammoId));
        if (hasAmmo) input.attackRanged = true;
        else input.attackMelee = true; // dry gun: bash with it
      } else {
        input.attackMelee = true;
      }
    } else if (e.button === 2) {
      // right click: gun up -> aim cycle (hip/shoulder/ADS); melee -> block
      if (s.equipped.ranged != null) input.aimTap = true;
      else input.blocking = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 2) input.blocking = false;
  }

  private handleCanvasClick(): void {
    if ('ontouchstart' in window) return; // touch: drag-look, no lock
    const s = useGameStore.getState();
    if (s.screen !== 'game' || s.paused || this.cutscene) return;
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  private handleLockChange(): void {
    const s = useGameStore.getState();
    // If the lock was lost via Esc, input.pause is already set and the tick
    // will toggle pause — don't double-toggle here.
    if (input.pause) return;
    if (
      document.pointerLockElement !== this.canvas &&
      s.screen === 'game' &&
      !s.paused &&
      !s.dead &&
      !this.cutscene &&
      s.dialogue == null &&
      !s.phoneOpen &&
      !s.backpackOpen &&
      !s.sleepOpen &&
      s.lootOpenId == null
    ) {
      // lock lost without Esc (alt-tab, click-out) — pause the game
      this.setPaused(true);
    }
  }

  private handleResize(): void {
    if (!this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
