// Game.ts — engine orchestrator. Owns the renderer, loop, and all subsystems.
// Public API matches INTERFACES.md exactly.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { DifficultyId, SaveSnapshot, VehicleSave, WorldDiff } from '../store/types';
import { DIFFICULTIES } from '../store/types';
import { QUESTS } from '../data/quests';
import { input, resetEdgeTriggers } from './input';
import { ITEMS } from '../data/items';
import { World, heightAt, biomeAt, initTerrainField } from './World';
import { CARRIER_DECK_Y } from './Airbase';
import { Player } from './Player';
import { HuskManager } from './Husks';
import type { Husk, SpawnZone } from './Husks';
import { InteractSystem, buildContainerDefs } from './Interact';
import { AnimalManager } from './Animals';
import { VehicleManager, applyUpgradeVisuals, itemsWeightKg, refreshCargoVisuals, type Vehicle } from './Vehicles';
import {
  TrailerManager, CrateManager, applyModuleVisuals, refreshTrailerCargoVisuals,
  trailerStorageCapKg, tongueDist, axleDist, tongueWorld, loadedUids, deckTopY, type Trailer,
} from './Trailers';
import { canHitch, isDeckKind, deckBayCount } from '../data/trailerData';
import { stepTrailer, wrapAngle, packDeckSlots } from './trailerPhysics';
import { canInstallUpgrade, storageCapKg } from '../data/upgrades';
import type { InvItem, TrailerSave } from '../store/types';
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
  trailers!: TrailerManager;
  crates!: CrateManager;
  driving: Vehicle | null = null;
  private beaconT = 0;
  private mouseHeld = false;
  private wasFirstPerson = false;
  private cleanMeters = 0;
  private fleetT = 0;
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

    // trailers: hitched freight — box, flatbed, tanker, carrier, utility
    this.trailers = new TrailerManager();
    this.trailers.spawn(this.scene!, this.world.poiPositions, (x, z) => heightAt(x, z));

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
      // vehicles back where the run left them (fuel + condition included);
      // v1 saves migrate with an empty list and keep their fresh spawns.
      // Matching consumes instances in spawn order — the fleet now has
      // duplicate hulls of a def (carrier deck spawns), so a plain find
      // would stack every save entry onto the first hull.
      const usedVeh = new Set<string>();
      for (const vs of snap.vehicles ?? []) {
        const v = this.vehicles.vehicles.find((x) => !usedVeh.has(x.uid) && x.def.id === (vs.defId === 'apc' ? 'goliath' : vs.defId));
        if (!v) continue;
        usedVeh.add(v.uid);
        v.group.position.set(vs.x, vs.y, vs.z);
        // a helicopter never restores mid-air: a save written in flight
        // comes back parked on the ground under where it was
        if (v.def.kind === 'heli') {
          v.group.position.y = this.groundY(vs.x, vs.z) + 0.02;
          if (v.heliState) { v.heliState.vy = 0; v.heliState.vx = 0; v.heliState.vz = 0; }
        }
        v.group.rotation.y = vs.heading;
        v.heading = vs.heading;
        v.fuel = vs.fuel;
        v.condition = vs.condition;
        v.speed = 0;
        // v3 state: storage, upgrades, flats, paint (v2 saves migrate with defaults)
        v.storage = (vs.storage ?? []).filter((it) => ITEMS[it.itemId]);
        v.upgrades = vs.upgrades ?? [];
        v.tiresFlat = vs.tiresFlat ?? 0;
        v.colorPick = vs.colorPick ?? v.colorPick;
        v.cargoCrates = vs.cargoCrates ?? 0;
        if (v.upgrades.length) applyUpgradeVisuals(v);
        if (v.cargoCrates) refreshCargoVisuals(v);
      }
      // trailers back where they were left: hitched, loaded, built out
      for (const ts of snap.trailers ?? []) {
        const t = this.trailers.byId(ts.defId);
        if (!t) continue;
        t.group.position.set(ts.x, ts.y, ts.z);
        t.group.rotation.y = ts.heading;
        t.heading = ts.heading;
        t.hitchedTo = ts.hitchedTo;
        t.module = (ts.module as Trailer['module']) ?? 'none';
        t.storage = (ts.storage ?? []).filter((it) => ITEMS[it.itemId]);
        t.fuelLiters = ts.fuelLiters ?? 0;
        t.doorOpen = !!ts.doorOpen;
        t.beaconMode = ts.beaconMode ?? 'off';
        t.loadedVehicleUid = ts.loadedVehicleDefId ?? null;
        t.extraLoadedUids = [...(ts.extraLoadedDefIds ?? [])];
        t.cargoCrates = ts.cargoCrates ?? 0;
        t.rampDown = !!ts.rampDown;
        for (const d of t.doors) {
          const want = d.kind === 'ramp' ? (t.rampDown ? 1 : 0) : (t.doorOpen ? 1 : 0);
          d.t = want;
          d.target = want;
        }
        if (t.module !== 'none') applyModuleVisuals(t);
        if (t.cargoCrates) refreshTrailerCargoVisuals(t);
        if (t.loadedVehicleUid || t.extraLoadedUids.length) {
          const keep: string[] = [];
          for (const uid of loadedUids(t)) {
            const lv = this.vehicles.byId(uid);
            if (lv) {
              lv.loadedOn = t.uid;
              keep.push(uid);
            }
          }
          t.loadedVehicleUid = keep[0] ?? null;
          t.extraLoadedUids = keep.slice(1);
          for (const uid of keep) {
            const lv = this.vehicles.byId(uid);
            if (lv) this.placeLoadedVehicle(t, lv);
          }
        }
      }
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
    const [carrierX, carrierZ] = this.world.poi('carrier');
    const zones: SpawnZone[] = [
      { id: 'forest', x: 180, z: 40, radius: 55, count: 3, kinds: ['shambler', 'stalker'] },
      { id: 'town', x: 40, z: 0, radius: 60, count: 4, kinds: ['shambler'] },
      { id: 'relay', x: 330, z: -40, radius: 42, count: 5, kinds: ['shambler', 'stalker'] },
      { id: 'dunes', x: 470, z: 150, radius: 55, count: 2, kinds: ['stalker'], nightOnly: true },
      // the carrier's guard pack: six armored husks on that deck — the
      // richest loot on the island is a fight, not a shopping trip
      { id: 'carrier', x: carrierX, z: carrierZ, radius: 15, count: 6, kinds: ['armored', 'armored', 'stalker'] },
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

    // physical freight: supply / parts crates that can be loaded into beds
    // and onto decks, hauled, and opened where they land
    this.crates = new CrateManager();
    {
      let cn = 1;
      const mk = (entries: [string, number][]): InvItem[] =>
        entries.map(([itemId, qty]) => ({ uid: `seed${cn++}`, itemId, qty }));
      const crateAt = (poi: string, dx: number, dz: number, contents: InvItem[], label: string, band: number) => {
        const p = this.world!.poiPositions[poi] ?? [0, 0];
        this.crates.spawnCrate(this.scene!, p[0] + dx, p[1] + dz, this.rng() * 3, (x, z) => heightAt(x, z), contents, label, band);
      };
      crateAt('marina', 12, 2, mk([['bandage', 3], ['canned_food', 2], ['water_bottle', 2]]), 'Supply crate', 0x6a7a4a);
      crateAt('town', 100, 44, mk([['engine_part', 1], ['tire', 1], ['scrap', 4]]), 'Parts crate', 0x707880);
      crateAt('lighthouse_base', 6, -14, mk([['ammo_rifle', 3], ['bandage', 2], ['canned_food', 2]]), 'Supply crate', 0x565e4c);
      crateAt('wreck', -6, 12, mk([['car_battery', 1], ['scrap', 3], ['wire', 2]]), 'Salvage crate', 0x8a6d3b);
      // aboard the carrier: physical freight on the well deck, riding at
      // deck height rather than terrain height
      const deckCrate = (dx: number, dz: number, contents: InvItem[], label: string, band: number) => {
        this.crates.spawnCrate(this.scene!, carrierX + dx, carrierZ + dz, this.rng() * 3, () => CARRIER_DECK_Y, contents, label, band);
      };
      deckCrate(6, -5.5, mk([['reflex_sight', 1], ['extended_mag', 1], ['ammo_556', 2]]), 'Carrier supply crate', 0x4c5e54);
      deckCrate(-14, 5, mk([['armor_plate', 2], ['gun_parts', 2], ['engine_part', 1]]), 'Carrier parts crate', 0x707880);
    }

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

  /** Every vehicle's live state, for the save snapshot (v3). */
  getVehicleStates(): VehicleSave[] {
    if (!this.vehicles) return [];
    return this.vehicles.vehicles.map((v) => ({
      defId: v.def.id,
      x: v.group.position.x,
      y: v.group.position.y,
      z: v.group.position.z,
      heading: v.heading,
      fuel: v.fuel,
      condition: v.condition,
      storage: v.storage.map((it) => ({ ...it })),
      upgrades: [...v.upgrades],
      tiresFlat: v.tiresFlat,
      colorPick: v.colorPick,
      cargoCrates: v.cargoCrates,
    }));
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
      // Esc closes an open panel first; it doesn't open the pause menu
      if (s.lootOpenId != null) {
        useGameStore.getState().closeLoot();
      } else if (s.storageOpen != null) {
        useGameStore.getState().closeStorage();
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
    if (input.interact && s.storageOpen != null) {
      useGameStore.getState().closeStorage();
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
        st.openPhone('pack');
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
      s.storageOpen != null ||
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

    // fleet telemetry for the phone's Vehicles app (~1 Hz)
    this.fleetT += dt;
    if (this.fleetT > 1 && this.vehicles) {
      this.fleetT = 0;
      s.setFleet(
        this.vehicles.vehicles.map((v) => ({
          defId: v.def.id,
          name: v.def.name,
          fuelPct: Math.round((v.fuel / v.def.fuelMax) * 100),
          condPct: Math.round(v.condition * 100),
          dist: Math.round(Math.hypot(v.group.position.x - player.pos.x, v.group.position.z - player.pos.z)),
          storageUsedKg: itemsWeightKg(v.storage),
          storageCapKg: storageCapKg(v.def.storageKg, v.upgrades),
          upgrades: [...v.upgrades],
          tiresFlat: v.tiresFlat,
          hitchedTrailer: this.trailers.trailerTowedBy(v.uid)?.def.id ?? null,
        })),
      );
      s.setTrailerFleet(
        this.trailers.trailers.map((t) => ({
          defId: t.uid,
          name: t.def.name,
          dist: Math.round(Math.hypot(t.group.position.x - player.pos.x, t.group.position.z - player.pos.z)),
          hitchedTo: t.hitchedTo,
          module: t.module,
          storageUsedKg: itemsWeightKg(t.storage),
          storageCapKg: trailerStorageCapKg(t),
          fuelLiters: Math.round(t.fuelLiters),
          beaconMode: t.beaconMode,
          loadedVehicle: (() => {
            const uids = loadedUids(t);
            if (!uids.length) return null;
            const first = this.vehicles.byId(uids[0])?.def.name ?? null;
            return uids.length > 1 ? `${first} +${uids.length - 1} more` : first;
          })(),
        })),
      );
    }

    // encumbrance gates sprint + slows movement
    const tier = encumbranceTier(
      totalWeightKg(s.inventory),
      carryLimitKg(s.equipped, s.inventory, s.difficulty, s.perks.includes('sc_packmule') ? 8 : 0),
    );
    const speedMul = tier === 'ok' ? 1 : tier === 'heavy' ? 0.75 : 0.55;

    const playerCtx = {
      groundY: (x: number, z: number) => this.dynGroundYRef(x, z, player.pos.y),
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

    // ---- trailers, doors, freight (the vehicle & trailer wave) ----
    this.trailers.update(dt, this.vehicles, {
      groundY: (x, z) => heightAt(x, z),
      ram: (x, z, r, dmg) => { husks.damageInRadius(x, z, r, dmg); },
      noise: (x, z, r) => this.noiseAt(x, z, r),
      time: this.elapsed,
    });
    this.vehicles.updateDoors(dt);
    this.vehicles.updateRotors(dt, this.driving?.uid);
    // any vehicle not towing sheds last frame's trailer mass
    for (const v of this.vehicles.vehicles) {
      if (!this.trailers.trailerTowedBy(v.uid)) v.towedMassKg = 0;
    }
    // loaded vehicles ride their decks; loaded crates ride their carriers
    for (const t of this.trailers.trailers) {
      for (const uid of loadedUids(t)) {
        const lv = this.vehicles.byId(uid);
        if (lv) this.placeLoadedVehicle(t, lv);
      }
    }
    this.followCrates();
    this.resolveInteriors();
    if (!this.driving) this.checkAutoHitch(s);
    this.tickBeacons(dt);
    // driving onto a deck: roll up the ramp, stop, and you're cargo
    if (this.driving && !this.driving.loadedOn) this.checkDeckLock(s);

    // hide the roof of whatever house the player is inside (see your own rooms)
    for (const r of this.houseRoofs) {
      const b = r.bounds;
      const playerIn =
        player.pos.x > b.x0 - 0.5 && player.pos.x < b.x1 + 0.5 &&
        player.pos.z > b.z0 - 0.5 && player.pos.z < b.z1 + 0.5;
      // if the CAMERA is inside the building, the building stays whole —
      // you're indoors, you should see the room and its ceiling. The roof
      // only lifts when you're inside and the camera is outside/above.
      const cam = this.camera?.position ?? player.pos;
      const camIn =
        cam.x > b.x0 - 0.3 && cam.x < b.x1 + 0.3 &&
        cam.z > b.z0 - 0.3 && cam.z < b.z1 + 0.3;
      r.group.visible = !(playerIn && !camIn);
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

    // interact prompts: trailer / door / crate context (positional) wins,
    // then the vehicle drive prompt, then world interactables
    const veh = !this.driving && !this.searching
      ? this.vehicles.nearest(player.pos.x, player.pos.z, 2.9)
      : null;
    // [T] storage: your ride while driving, else the closest openable box
    if (input.storage && !this.searching) {
      input.storage = false;
      if (this.driving) s.openStorage('vehicle', this.driving.uid, `${this.driving.def.name} storage`);
      else this.openStorageNear(player.pos.x, player.pos.z, s);
    }
    // [R] at a tanker on foot pours a fuel can INTO the tanker
    if (input.refuel && !this.driving && !this.searching && !veh) {
      const tk = this.trailers.nearest(player.pos.x, player.pos.z, 3.6);
      if (tk && tk.def.kind === 'tanker') {
        this.pourIntoTanker(tk, s);
        input.refuel = false;
      }
    }
    if (this.driving) {
      s.setInteractPrompt('[F] Exit vehicle');
    } else if (!this.searching) {
      const ctx = this.contextAction(player.pos.x, player.pos.z, s);
      if (ctx) {
        s.setInteractPrompt(ctx.label);
        if (input.interact) {
          ctx.run();
          input.interact = false;
        }
      } else if (veh) {
        const fuelNote = veh.fuel <= 0.05 ? ' — TANK EMPTY' : veh.fuel < veh.def.fuelMax * 0.35 ? ' · [R] refuel' : '';
        const flatNote = veh.tiresFlat > 0 ? ` · ⚠ ${veh.tiresFlat} flat` : '';
        s.setInteractPrompt(`[F] Drive ${veh.def.name}${fuelNote}${flatNote} · [T] storage`);
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
        if (input.interact && near) {
          const handled = this.beginSearchIfNeeded(near);
          if (!handled) {
            near.use();
            // refresh prompt (e.g. container now looted)
            const again = this.interact!.nearest(player.pos.x, player.pos.z, 3);
            s.setInteractPrompt(again ? `[F] ${again.label}` : null);
          }
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
        input.ascend = true; // held state for the helicopter collective
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
      case 'KeyT':
        input.storage = true;
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
    if (e.code === 'Space') input.ascend = this.keys.has('Space');
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
      groundY: (x, z) => this.driveGroundY(x, z),
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
      lift: v.def.kind === 'heli' ? (input.ascend ? 1 : 0) - (input.crouch ? 1 : 0) : undefined,
      yawIn: v.def.kind === 'heli' ? (input.leanRight ? 1 : 0) - (input.leanLeft ? 1 : 0) : undefined,
    });
    if (v.hardLanding) {
      s.addToast(
        v.hardLanding === 'crash'
          ? 'CRASH LANDING — the airframe is barely holding together'
          : 'Hard landing — the airframe took damage',
      );
      v.hardLanding = undefined;
    }
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
    if (v.blewTire) {
      v.blewTire = false;
      s.addToast('Tire blown! She pulls and drags — swap it from the phone\u2019s Vehicles app (needs a tire).');
      sfx.play('hit', { volume: 0.7 });
    }
    // turret follows the camera; mounted weapons fire on the attack input
    if (v.turret) v.turret.rotation.y = wrapAngle(player.camYaw - v.heading);
    this.updateVehicleWeapons(dt, v, s);
    s.setVehicle({
      uid: v.uid,
      name: v.def.name,
      speedKmh: Math.round(Math.abs(v.speed) * 3.6),
      fuelPct: v.fuel / v.def.fuelMax,
      condPct: v.condition,
      storageUsedKg: itemsWeightKg(v.storage),
      storageCapKg: storageCapKg(v.def.storageKg, v.upgrades),
      tiresFlat: v.tiresFlat,
      upgrades: [...v.upgrades],
      kind: v.def.kind,
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
      uid: v.uid,
      name: v.def.name,
      speedKmh: 0,
      fuelPct: v.fuel / v.def.fuelMax,
      condPct: v.condition,
      storageUsedKg: itemsWeightKg(v.storage),
      storageCapKg: storageCapKg(v.def.storageKg, v.upgrades),
      tiresFlat: v.tiresFlat,
      upgrades: [...v.upgrades],
      kind: v.def.kind,
    });
    s.addToast(
      v.def.kind === 'heli'
        ? `Flying the ${v.def.name}. Hold SPACE to climb, C to descend, Q/E to yaw, WASD is the cyclic. F to get out.`
        : `Driving the ${v.def.name}. F to get out${v.fuel <= 0.05 ? ' — the tank is dry, find a fuel can.' : ''}`,
    );
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
    resolveCollisions(player.pos, 0.45, this.houseColliders, player.pos.y);
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
      // no can? a tanker trailer alongside will share its load
      const tk = this.trailers?.trailers.find((t) =>
        t.def.kind === 'tanker' && t.fuelLiters >= 1 &&
        Math.hypot(t.group.position.x - v.group.position.x, t.group.position.z - v.group.position.z) < 9);
      if (tk) {
        const add = Math.min(20, tk.fuelLiters, need);
        tk.fuelLiters -= add;
        v.fuel += add;
        s.addToast(`Drew ${Math.round(add)}L from the tanker (${Math.round(tk.fuelLiters)}L left in it).`);
        sfx.play('pickup', { volume: 0.5 });
        return;
      }
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

  /** [R] at a tanker: pour a carried fuel can into the trailer's tank. */
  private pourIntoTanker(t: Trailer, s: ReturnType<typeof useGameStore.getState>): void {
    const cap = t.def.fuelMax ?? 2000;
    if (t.fuelLiters >= cap - 1) {
      s.addToast('The tanker is full.');
      return;
    }
    const can = s.inventory.find((it) => it.itemId === 'fuel_can' && it.qty > 0);
    if (!can) {
      s.addToast(`Tanker holds ${Math.round(t.fuelLiters)}L of ${cap}L. Bring a fuel can to add more.`);
      return;
    }
    if (!s.removeItem(can.uid, 1)) return;
    const add = Math.min(20, cap - t.fuelLiters);
    t.fuelLiters += add;
    s.addToast(`Poured ${Math.round(add)}L into the tanker — ${Math.round(t.fuelLiters)}L aboard.`);
    sfx.play('pickup', { volume: 0.5 });
  }

  // ------------------------------------------------------------------
  // trailers, storage, freight — the vehicle & trailer wave
  // ------------------------------------------------------------------

  /** Ground for DRIVING: terrain + house floors + trailer decks/ramps. */
  private driveGroundY(x: number, z: number): number {
    let y = this.groundY(x, z);
    if (this.trailers) {
      for (const t of this.trailers.trailers) {
        const d = this.trailers.deckHeightAt(t, x, z);
        if (d > y) y = d;
      }
    }
    return y;
  }

  /** Ground for WALKING: house floors + trailer interiors + decks, with a
   *  climb allowance so stepping up into a trailer reads as a step, not a wall.
   *  Interior floors only count when the doors are open — or when the walker
   *  is already up at floor height (inside, doors closed behind them). */
  private dynGroundYRef(x: number, z: number, refY: number): number {
    let y = this.groundYRef(x, z, refY);
    if (this.trailers) {
      for (const t of this.trailers.trailers) {
        if (t.interior) {
          const inside = refY > t.group.position.y + t.interior.floorY - 0.5;
          if (t.doorOpen || inside) {
            const f = this.trailers.interiorFloorAt(t, x, z);
            if (f > y && f <= refY + 1.15) y = f;
          }
        }
        const d = this.trailers.deckHeightAt(t, x, z);
        if (d > y && d <= refY + 1.15) y = d;
      }
    }
    if (this.vehicles) {
      for (const v of this.vehicles.vehicles) {
        if (!v.interior) continue;
        const inside = refY > v.group.position.y + v.interior.floorY - 0.5;
        if (!inside && !v.doors.some((d) => d.t > 0.5)) continue;
        const f = this.entityFloorAt(v.group.position, v.heading, v.interior, x, z);
        if (f > y && f <= refY + 1.15) y = f;
      }
    }
    return y;
  }

  private entityLocal(pos: THREE.Vector3, heading: number, x: number, z: number): { lx: number; lz: number } {
    const dx = x - pos.x;
    const dz = z - pos.z;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    return { lx: dx * fz - dz * fx, lz: dx * fx + dz * fz };
  }

  private entityFloorAt(pos: THREE.Vector3, heading: number, interior: import('./Vehicles').InteriorSpec, x: number, z: number): number {
    const { lx, lz } = this.entityLocal(pos, heading, x, z);
    if (Math.abs(lx) <= interior.halfW + 0.3 && lz >= interior.zRear - 0.3 && lz <= interior.zFront + 0.3) {
      return pos.y + interior.floorY;
    }
    return -Infinity;
  }

  /** Pack zone for a deck trailer: vehicles nose up to the front stop. */
  private deckPackZone(t: Trailer): { frontZ: number; rearZ: number } {
    const L = t.def.length;
    return t.def.kind === 'lowboy'
      ? { frontZ: L * 0.39, rearZ: -L / 2 + 0.7 }
      : { frontZ: L / 2 - 0.5, rearZ: -L / 2 + 0.6 };
  }

  /** Park a loaded vehicle in its packed slot on its trailer's deck. */
  private placeLoadedVehicle(t: Trailer, v: Vehicle): void {
    const uids = loadedUids(t);
    const lengths = uids.map((uid) => this.vehicles.byId(uid)?.def.length ?? 4.8);
    const { frontZ, rearZ } = this.deckPackZone(t);
    const slots = packDeckSlots(lengths, frontZ, rearZ);
    const idx = uids.indexOf(v.uid);
    const lz = slots && idx >= 0 ? slots[idx] : 0.2;
    const w = this.trailers.worldOf(t, 0, lz);
    v.group.position.set(w.x, t.group.position.y + deckTopY(t) + 0.02, w.z);
    v.heading = t.heading;
    v.group.rotation.set(0, t.heading, 0);
    v.speed = 0;
  }

  /** Loaded crates stick to their carriers as they move. */
  private followCrates(): void {
    for (const c of this.crates.crates) {
      if (!c.loadedInto) continue;
      if (c.loadedInto.kind === 'trailer') {
        const t = this.trailers.byId(c.loadedInto.uid);
        if (!t) { c.loadedInto = null; continue; }
        const floorY = t.def.kind === 'utility' ? 0.66 : t.def.kind === 'box' ? 1.05 : t.def.kind === 'lowboy' ? 0.57 : 0.99;
        const lx = (c.slot % 2 === 0 ? -0.42 : 0.42) * (t.def.width / 2);
        const lz = t.def.length * 0.22 - Math.floor(c.slot / 2) * 0.78;
        this.crates.placeOnCarrier(c, t.group.position, t.heading, lx, floorY, lz);
      } else {
        const v = this.vehicles.byId(c.loadedInto.uid);
        if (!v) { c.loadedInto = null; continue; }
        const floorY = v.def.id === 'sprinter' ? 0.6 : v.def.id === 'bronco' ? 1.0 : 0.9;
        const lx = (c.slot % 2 === 0 ? -0.42 : 0.42) * (v.def.width / 2);
        const lz = -v.def.length * 0.3 - Math.floor(c.slot / 2) * 0.78;
        this.crates.placeOnCarrier(c, v.group.position, v.heading, lx, floorY, lz);
      }
    }
  }

  /** Interior walls for walk-in spaces (box trailer, sprinter) + the
   *  houses' camera-inside roof rule applied to trailer/vehicle roofs. */
  private resolveInteriors(): void {
    const player = this.player!;
    if (this.driving) return;
    const cam = this.camera!.position;
    type Ent = { pos: THREE.Vector3; heading: number; interior: import('./Vehicles').InteriorSpec; open: boolean; roof?: THREE.Object3D };
    const ents: Ent[] = [];
    for (const t of this.trailers.trailers) {
      if (t.interior) ents.push({ pos: t.group.position, heading: t.heading, interior: t.interior, open: t.doorOpen, roof: t.roofObj });
    }
    for (const v of this.vehicles.vehicles) {
      if (v.interior) ents.push({ pos: v.group.position, heading: v.heading, interior: v.interior, open: v.doors.some((d) => d.t > 0.5), roof: v.roofObj });
    }
    for (const e of ents) {
      const spec = e.interior;
      const pl = this.entityLocal(e.pos, e.heading, player.pos.x, player.pos.z);
      const playerIn = Math.abs(pl.lx) <= spec.halfW + 0.3 && pl.lz >= spec.zRear - 0.3 && pl.lz <= spec.zFront + 0.3
        && player.pos.y > e.pos.y + spec.floorY - 0.5;
      if (e.roof) {
        const cl = this.entityLocal(e.pos, e.heading, cam.x, cam.z);
        const camIn = Math.abs(cl.lx) <= spec.halfW + 0.4 && cl.lz >= spec.zRear - 0.4 && cl.lz <= spec.zFront + 0.4;
        e.roof.visible = !(playerIn && !camIn);
      }
      if (!playerIn) continue;
      const R = 0.35;
      let { lx, lz } = pl;
      lx = clamp(lx, -(spec.halfW - R), spec.halfW - R);
      if (lz > spec.zFront - R) lz = spec.zFront - R;
      if (lz < spec.zRear + R && !(e.open && Math.abs(pl.lx) < spec.doorHalfW)) lz = spec.zRear + R;
      if (lx !== pl.lx || lz !== pl.lz) {
        const fx = Math.sin(e.heading);
        const fz = Math.cos(e.heading);
        player.pos.x = e.pos.x + lx * fz + lz * fx;
        player.pos.z = e.pos.z - lx * fx + lz * fz;
      }
    }
  }

  /** Back-up auto-snap: tongue meets hitch, aligned — it couples itself. */
  private checkAutoHitch(s: ReturnType<typeof useGameStore.getState>): void {
    for (const t of this.trailers.trailers) {
      if (t.hitchedTo) continue;
      const tw = tongueWorld(t);
      for (const v of this.vehicles.vehicles) {
        if (v.loadedOn || this.trailers.trailerTowedBy(v.uid)) continue;
        if (!canHitch(v.def.id, t.def.id)) continue;
        const h = this.vehicles.hitchWorld(v);
        if (Math.hypot(h.x - tw.x, h.z - tw.z) < 1.7 && Math.abs(wrapAngle(v.heading - t.heading)) < 0.7) {
          t.hitchedTo = v.uid;
          s.addToast(`Hitched the ${t.def.name} to the ${v.def.name}.`);
          sfx.play('switch', { volume: 0.6 });
          break;
        }
      }
    }
  }

  /** Beacon trailers at work: horde mode sings, sat mode holds the uplink. */
  private tickBeacons(dt: number): void {
    this.beaconT += dt;
    if (this.beaconT < 2) return;
    this.beaconT = 0;
    let satUp = false;
    for (const t of this.trailers.trailers) {
      if (t.module !== 'beacon' || t.hitchedTo) continue;
      if (t.beaconMode === 'sat') satUp = true;
      if (t.beaconMode === 'horde') this.noiseAt(t.group.position.x, t.group.position.z, 55);
    }
    const st = useGameStore.getState();
    if (!!st.flags['sat_uplink'] !== satUp) {
      useGameStore.setState({ flags: { ...st.flags, sat_uplink: satUp } });
    }
  }

  /** Can this vehicle still be locked onto this deck? (bays + tank rule) */
  private deckHasRoom(t: Trailer, v: Vehicle): boolean {
    const uids = loadedUids(t);
    if (uids.length >= deckBayCount(t.def)) return false;
    // the HET-70 hauls ONE tank, alone — or up to three lesser vehicles
    if (v.def.id === 'tank' && uids.length > 0) return false;
    if (uids.some((uid) => this.vehicles.byId(uid)?.def.id === 'tank')) return false;
    const lengths = [...uids.map((uid) => this.vehicles.byId(uid)?.def.length ?? 4.8), v.def.length];
    const { frontZ, rearZ } = this.deckPackZone(t);
    return packDeckSlots(lengths, frontZ, rearZ) !== null;
  }

  /** The drive-on lock: a car stopped squarely on a ramp-down deck is cargo. */
  private checkDeckLock(s: ReturnType<typeof useGameStore.getState>): void {
    const v = this.driving!;
    for (const t of this.trailers.trailers) {
      if (!isDeckKind(t.def.kind) || !t.rampDown || !this.deckHasRoom(t, v)) continue;
      const { lx, lz } = this.trailers.localOf(t, v.group.position.x, v.group.position.z);
      const deckY = t.group.position.y + deckTopY(t);
      const halfClear = Math.max(0.2, (t.def.width - v.def.width) / 2 + 0.25);
      const frontLim = t.def.kind === 'lowboy' ? t.def.length * 0.42 : t.def.length / 2 - 0.4;
      if (Math.abs(lx) < halfClear && lz > -t.def.length / 2 + 0.6 && lz < frontLim
        && Math.abs(v.group.position.y - deckY) < 0.5 && Math.abs(v.speed) < 1.0) {
        this.lockVehicleOnDeck(t, v, s);
        return;
      }
    }
  }

  private lockVehicleOnDeck(t: Trailer, v: Vehicle, s: ReturnType<typeof useGameStore.getState>): void {
    const wasDriving = this.driving === v;
    v.loadedOn = t.uid;
    if (!t.loadedVehicleUid) t.loadedVehicleUid = v.uid;
    else if (!t.extraLoadedUids.includes(v.uid)) t.extraLoadedUids.push(v.uid);
    this.placeLoadedVehicle(t, v);
    if (wasDriving) {
      // the driver climbs down behind the trailer
      const player = this.player!;
      const w = this.trailers.worldOf(t, 0, -t.def.length / 2 - 2.6);
      this.driving = null;
      player.endDrive();
      if (this.wasFirstPerson) player.forceFirstPerson(true, this.camera!);
      player.pos.x = w.x;
      player.pos.z = w.z;
      player.pos.y = this.groundY(w.x, w.z);
      resolveCollisions(player.pos, 0.45, this.houseColliders, player.pos.y);
      s.setVehicle(null);
    }
    s.addToast(`${v.def.name} locked down on the ${t.def.name}. It rides.`);
    sfx.play('switch', { volume: 0.6 });
  }

  private unloadVehicle(t: Trailer, s: ReturnType<typeof useGameStore.getState>): void {
    // LIFO: the last vehicle loaded is the one at the ramps
    const uid = t.extraLoadedUids.length ? t.extraLoadedUids[t.extraLoadedUids.length - 1] : t.loadedVehicleUid;
    const lv = uid ? this.vehicles.byId(uid) : null;
    if (t.extraLoadedUids.length) t.extraLoadedUids.pop();
    else t.loadedVehicleUid = null;
    if (!lv) return;
    if (!t.rampDown) this.toggleRamp(t);
    const w = this.trailers.worldOf(t, 0, -t.def.length / 2 - 3.4);
    lv.loadedOn = null;
    lv.group.position.set(w.x, this.driveGroundY(w.x, w.z), w.z);
    lv.heading = t.heading;
    lv.group.rotation.set(0, t.heading, 0);
    lv.speed = 0;
    s.addToast(`${lv.def.name} unloaded.`);
    sfx.play('switch', { volume: 0.5 });
  }

  private toggleTrailerDoors(t: Trailer): void {
    t.doorOpen = !t.doorOpen;
    for (const d of t.doors) {
      if (d.kind !== 'ramp') d.target = t.doorOpen ? 1 : 0;
    }
    sfx.play('switch', { volume: 0.5 });
  }

  private toggleRamp(t: Trailer): void {
    t.rampDown = !t.rampDown;
    for (const d of t.doors) {
      if (d.kind === 'ramp') d.target = t.rampDown ? 1 : 0;
    }
    sfx.play('switch', { volume: 0.5 });
  }

  private bestTowVehicle(t: Trailer): Vehicle | null {
    const tw = tongueWorld(t);
    let best: Vehicle | null = null;
    let bd = 6.5;
    for (const v of this.vehicles.vehicles) {
      if (v.loadedOn || this.trailers.trailerTowedBy(v.uid)) continue;
      if (!canHitch(v.def.id, t.def.id)) continue;
      const d = Math.hypot(v.group.position.x - tw.x, v.group.position.z - tw.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private connectTrailer(t: Trailer, v: Vehicle, s: ReturnType<typeof useGameStore.getState>): void {
    // snap: one physics step drags the tongue onto the hitch, then it holds
    const hitch = this.vehicles.hitchWorld(v);
    const pos = t.group.position;
    const next = stepTrailer({ x: pos.x, z: pos.z, heading: t.heading }, hitch, tongueDist(t), axleDist(t), 1.15, v.heading);
    pos.x = next.x;
    pos.z = next.z;
    t.heading = next.heading;
    t.hitchedTo = v.uid;
    s.addToast(`Hitched the ${t.def.name} to the ${v.def.name}.`);
    sfx.play('switch', { volume: 0.6 });
  }

  /** The F-key context menu: doors, hitches, ramps, crates, beacons, beds. */
  private contextAction(px: number, pz: number, s: ReturnType<typeof useGameStore.getState>): { label: string; run: () => void } | null {
    const T = this.trailers;
    const t = T.nearest(px, pz, 8);
    if (t) {
      const L = t.def.length;
      const rear = T.worldOf(t, 0, -L / 2);
      const dRear = Math.hypot(rear.x - px, rear.z - pz);
      const tw = tongueWorld(t);
      const dTongue = Math.hypot(tw.x - px, tw.z - pz);
      const { lx, lz } = T.localOf(t, px, pz);
      // inside a hab trailer, the bed is the point of the room
      if (t.module === 'hab' && t.interior && Math.abs(lx) < t.interior.halfW && lz > t.interior.zRear && lz < t.interior.zFront) {
        return {
          label: '[F] Sleep in the hab trailer',
          run: () => { this.lastSafe = [px, pz]; this.lastCampId = null; s.openSleep(); },
        };
      }
      if (dRear < 2.5) {
        if (loadedUids(t).length && isDeckKind(t.def.kind)) {
          const lastUid = t.extraLoadedUids.length ? t.extraLoadedUids[t.extraLoadedUids.length - 1] : t.loadedVehicleUid;
          const lv = lastUid ? this.vehicles.byId(lastUid) : null;
          return { label: `[F] Unload the ${lv?.def.name ?? 'vehicle'}`, run: () => this.unloadVehicle(t, s) };
        }
        if (t.cargoCrates > 0) {
          return { label: `[F] Unload a crate from the ${t.def.name}`, run: () => this.unloadCrate({ kind: 'trailer', uid: t.uid }, s) };
        }
        if (isDeckKind(t.def.kind)) {
          return { label: `[F] ${t.rampDown ? 'Raise' : 'Lower'} the ramp`, run: () => this.toggleRamp(t) };
        }
        if (t.doors.length) {
          return { label: `[F] ${t.doorOpen ? 'Close' : 'Open'} the ${t.def.name} doors`, run: () => this.toggleTrailerDoors(t) };
        }
      }
      if (dTongue < 2.8) {
        if (t.hitchedTo) {
          const tow = this.vehicles.byId(t.hitchedTo);
          return {
            label: `[F] Unhitch the ${t.def.name}`,
            run: () => {
              t.hitchedTo = null;
              if (tow) tow.towedMassKg = 0;
              s.addToast(`Unhitched the ${t.def.name}. It stays where it lies.`);
              sfx.play('switch', { volume: 0.5 });
            },
          };
        }
        const cand = this.bestTowVehicle(t);
        if (cand) {
          return { label: `[F] Hitch the ${t.def.name} to the ${cand.def.name}`, run: () => this.connectTrailer(t, cand, s) };
        }
        return {
          label: `[F] ${t.def.name} — back a truck up to the tongue`,
          run: () => s.addToast('No compatible truck in reach. Semi-class trailers need a semi, the Goliath, or a tank; the F-250 dually takes mid-size; pickups take the utility trailer.'),
        };
      }
      if (t.module === 'beacon' && Math.hypot(t.group.position.x - px, t.group.position.z - pz) < 3.6) {
        const next = t.beaconMode === 'off' ? 'sat' : t.beaconMode === 'sat' ? 'horde' : 'off';
        return {
          label: `[F] Beacon mode: ${t.beaconMode.toUpperCase()} → ${next.toUpperCase()}`,
          run: () => { const msg = this.applyBeaconMode(t.uid, next); if (msg) s.addToast(msg); },
        };
      }
      // winch a parked car onto a ramp-down deck that still has a bay
      if (isDeckKind(t.def.kind) && t.rampDown && dRear < 5) {
        const lv = this.winchCandidate(t);
        if (lv) return { label: `[F] Winch the ${lv.def.name} aboard`, run: () => this.lockVehicleOnDeck(t, lv, s) };
      }
      // the box trailer's personnel door (front quarter) toggles its doors
      // too — reachable even with crates stacked at the rear
      if (t.def.kind === 'box' && t.doors.length) {
        const quarter = T.worldOf(t, t.def.width / 2, L / 2 - 1);
        if (Math.hypot(quarter.x - px, quarter.z - pz) < 2.2) {
          return { label: `[F] ${t.doorOpen ? 'Close' : 'Open'} the ${t.def.name} doors`, run: () => this.toggleTrailerDoors(t) };
        }
      }
    }
    // the carrier's bunk room: a sleep point aboard the ship
    {
      const cp = this.world ? this.world.poi('carrier') : null;
      if (cp && Math.hypot(px - (cp[0] - 36), pz - (cp[1] - 4)) < 4.5 && this.player!.pos.y > 2) {
        return {
          label: '[F] Sleep in the carrier bunk',
          run: () => { this.lastSafe = [px, pz]; this.lastCampId = null; s.openSleep(); },
        };
      }
    }
    // vehicle doors (box-truck roll door, sprinter rear doors)
    const veh = this.vehicles.nearest(px, pz, 6.5);
    if (veh && veh.doors.length && Math.abs(veh.speed) < 0.1) {
      const rear = {
        x: veh.group.position.x - Math.sin(veh.heading) * (veh.def.length / 2),
        z: veh.group.position.z - Math.cos(veh.heading) * (veh.def.length / 2),
      };
      if (Math.hypot(rear.x - px, rear.z - pz) < 2.4) {
        const open = veh.doors.some((d) => d.target > 0.5);
        return {
          label: `[F] ${open ? 'Close' : 'Open'} the ${veh.def.name} door`,
          run: () => {
            for (const d of veh.doors) d.target = open ? 0 : 1;
            sfx.play('switch', { volume: 0.5 });
          },
        };
      }
    }
    // a loose crate: load it into whatever bed is alongside
    const crate = this.crates.nearestFree(px, pz, 2.3);
    if (crate) {
      const carrier = this.bestCarrierFor(crate.group.position.x, crate.group.position.z);
      if (carrier) {
        return { label: `[F] Load the ${crate.label.toLowerCase()} into the ${carrier.name}`, run: () => this.loadCrate(crate, carrier, s) };
      }
      return {
        label: `[F] ${crate.label} — no bed or trailer alongside`,
        run: () => s.addToast('Bring a truck bed or trailer alongside, then load it. [T] opens it here.'),
      };
    }
    // unload a crate off a vehicle bed you're standing behind
    if (veh && veh.cargoCrates > 0) {
      const rear = {
        x: veh.group.position.x - Math.sin(veh.heading) * (veh.def.length / 2),
        z: veh.group.position.z - Math.cos(veh.heading) * (veh.def.length / 2),
      };
      if (Math.hypot(rear.x - px, rear.z - pz) < 2.6) {
        return { label: `[F] Unload a crate from the ${veh.def.name}`, run: () => this.unloadCrate({ kind: 'vehicle', uid: veh.uid }, s) };
      }
    }
    return null;
  }

  private winchCandidate(t: Trailer): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = Infinity;
    for (const v of this.vehicles.vehicles) {
      if (v.loadedOn || v === this.driving) continue;
      if (v.def.kind === 'skiff' || v.def.width > t.def.width - 0.1) continue;
      if (!this.deckHasRoom(t, v)) continue;
      const { lx, lz } = this.trailers.localOf(t, v.group.position.x, v.group.position.z);
      if (lz > -t.def.length / 2 - 1 || lz < -t.def.length / 2 - 9.5 || Math.abs(lx) > 3.4) continue;
      const d = Math.abs(lz);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private bestCarrierFor(x: number, z: number): { kind: 'vehicle' | 'trailer'; uid: string; name: string } | null {
    const LOADABLE = ['pickup', 'f250', 'sprinter', 'van', 'v03_hauler', 'boxtruck', 'bronco', 'goliath'];
    let best: { kind: 'vehicle' | 'trailer'; uid: string; name: string } | null = null;
    let bd = 5.5;
    for (const v of this.vehicles.vehicles) {
      if (!LOADABLE.includes(v.def.id) || v.cargoCrates >= 6 || v.loadedOn) continue;
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < bd) { bd = d; best = { kind: 'vehicle', uid: v.uid, name: v.def.name }; }
    }
    for (const t of this.trailers.trailers) {
      if (t.def.kind === 'tanker' || t.cargoCrates >= 6) continue;
      const d = Math.hypot(t.group.position.x - x, t.group.position.z - z);
      if (d < bd) { bd = d; best = { kind: 'trailer', uid: t.uid, name: t.def.name }; }
    }
    return best;
  }

  private loadCrate(crate: import('./Trailers').CargoCrate, carrier: { kind: 'vehicle' | 'trailer'; uid: string; name: string }, s: ReturnType<typeof useGameStore.getState>): void {
    const host = carrier.kind === 'vehicle' ? this.vehicles.byId(carrier.uid) : this.trailers.byId(carrier.uid);
    if (!host) return;
    crate.loadedInto = { kind: carrier.kind, uid: carrier.uid };
    crate.slot = host.cargoCrates;
    host.cargoCrates += 1;
    if (carrier.kind === 'vehicle') refreshCargoVisuals(host as Vehicle);
    else refreshTrailerCargoVisuals(host as Trailer);
    this.followCrates();
    s.addToast(`${crate.label} loaded into the ${carrier.name}.`);
    sfx.play('pickup', { volume: 0.6 });
  }

  private unloadCrate(carrier: { kind: 'vehicle' | 'trailer'; uid: string }, s: ReturnType<typeof useGameStore.getState>): void {
    const host = carrier.kind === 'vehicle' ? this.vehicles.byId(carrier.uid) : this.trailers.byId(carrier.uid);
    if (!host || host.cargoCrates <= 0) return;
    const crate = this.crates.crates
      .filter((c) => c.loadedInto?.kind === carrier.kind && c.loadedInto?.uid === carrier.uid)
      .sort((a, b) => b.slot - a.slot)[0];
    if (!crate) { host.cargoCrates = 0; return; }
    const hp = host.group.position;
    const heading = (host as Vehicle).heading ?? (host as Trailer).heading;
    const L = (host as Vehicle).def?.length ?? (host as Trailer).def.length;
    const bx = hp.x - Math.sin(heading) * (L / 2 + 1.6);
    const bz = hp.z - Math.cos(heading) * (L / 2 + 1.6);
    crate.loadedInto = null;
    crate.group.position.set(bx, this.groundY(bx, bz), bz);
    crate.group.rotation.set(0, heading, 0);
    host.cargoCrates = Math.max(0, host.cargoCrates - 1);
    // re-slot the crates still aboard
    let slot = 0;
    for (const c of this.crates.crates) {
      if (c.loadedInto?.kind === carrier.kind && c.loadedInto?.uid === carrier.uid) c.slot = slot++;
    }
    if (carrier.kind === 'vehicle') refreshCargoVisuals(host as Vehicle);
    else refreshTrailerCargoVisuals(host as Trailer);
    s.addToast(`${crate.label} unloaded.`);
    sfx.play('pickup', { volume: 0.5 });
  }

  /** [T] storage target: the closest openable vehicle / trailer / crate. */
  private openStorageNear(px: number, pz: number, s: ReturnType<typeof useGameStore.getState>): void {
    let best: { kind: 'vehicle' | 'trailer' | 'crate'; uid: string; label: string; d: number } | null = null;
    const crate = this.crates.nearestFree(px, pz, 2.4);
    if (crate) best = { kind: 'crate', uid: crate.uid, label: crate.label, d: 0 };
    const t = this.trailers.nearest(px, pz, 4.6);
    if (t) {
      const d = Math.hypot(t.group.position.x - px, t.group.position.z - pz);
      if (!best || d < best.d) best = { kind: 'trailer', uid: t.uid, label: `${t.def.name} storage`, d };
    }
    const v = this.vehicles.nearest(px, pz, 3.6);
    if (v) {
      const d = Math.hypot(v.group.position.x - px, v.group.position.z - pz);
      if (!best || d < best.d) best = { kind: 'vehicle', uid: v.uid, label: `${v.def.name} storage`, d };
    }
    if (best) s.openStorage(best.kind, best.uid, best.label);
    else s.addToast('Nothing with storage in reach.');
  }

  // ---------------------------------------------------------------
  // vehicle weapons: tank cannon (integral), Goliath MG / 40mm mounts,
  // tank coax. Aimed by the chase camera, fired on the attack input.
  // ---------------------------------------------------------------

  private updateVehicleWeapons(dt: number, v: Vehicle, s: ReturnType<typeof useGameStore.getState>): void {
    const player = this.player!;
    const husks = this.husks!;
    const isTank = v.def.id === 'tank';
    const cannon = isTank || v.upgrades.includes('cannon_40');
    // the Sea Hawk's pintle door gun is integral; the Little Bird's skid
    // rocket pods are live on the cannon pattern (unguided, splash)
    const mg = v.upgrades.includes('mg_mount') || (isTank && v.upgrades.includes('tank_coax')) || v.def.id === 'seahawk';
    const rockets = v.def.id === 'little_bird';
    if (!cannon && !mg && !rockets) return;
    const w = v as unknown as { mgT?: number; cannonT?: number };
    w.mgT = Math.max(0, (w.mgT ?? 0) - dt);
    w.cannonT = Math.max(0, (w.cannonT ?? 0) - dt);
    if (!this.mouseHeld && !input.attackRanged && !input.attackMelee) return;
    const cp = Math.cos(player.camPitch);
    const dir = {
      x: Math.sin(player.camYaw) * cp,
      y: Math.sin(player.camPitch),
      z: Math.cos(player.camYaw) * cp,
    };
    const origin = v.def.id === 'seahawk'
      ? {
          // the door gun sits on the starboard cabin door, not the roofline
          x: v.group.position.x - Math.cos(v.heading) * 1.8 + dir.x * 0.4,
          y: v.group.position.y + 1.55,
          z: v.group.position.z + Math.sin(v.heading) * 1.8 + dir.z * 0.4,
        }
      : {
          x: v.group.position.x + dir.x * 1.6,
          y: v.group.position.y + (isTank ? 2.0 : 2.7),
          z: v.group.position.z + dir.z * 1.6,
        };
    // first husk the aim line passes close to (arcade hitscan)
    const aimHit = (slop: number, range: number): { x: number; z: number; along: number } | null => {
      let bestA = Infinity;
      let hit: { x: number; z: number; along: number } | null = null;
      for (const h of husks.husks) {
        if (h.state === 'dead') continue;
        const rx = h.group.position.x - origin.x;
        const rz = h.group.position.z - origin.z;
        const along = rx * dir.x + rz * dir.z;
        if (along < 2 || along > range) continue;
        const perp2 = rx * rx + rz * rz - along * along;
        if (perp2 < slop * slop && along < bestA) {
          bestA = along;
          hit = { x: h.group.position.x, z: h.group.position.z, along };
        }
      }
      return hit;
    };
    if (rockets && w.cannonT <= 0) {
      w.cannonT = 0.85;
      const hit = aimHit(2.2, 110);
      const ix = hit ? hit.x : origin.x + dir.x * 60;
      const iz = hit ? hit.z : origin.z + dir.z * 60;
      husks.damageInRadius(ix, iz, 3.2, 62);
      this.animals?.damageInRadius(ix, iz, 3.2, 62);
      this.noiseAt(ix, iz, 45);
      const flash = new THREE.PointLight(0xffc27a, 60, 20);
      flash.position.set(ix, this.groundY(ix, iz) + 1.4, iz);
      this.scene!.add(flash);
      setTimeout(() => this.scene!.remove(flash), 180);
      sfx.play('hit', { volume: 0.8 });
      s.addSkillXp('combat', 1);
      return;
    }
    if (cannon && w.cannonT <= 0) {
      w.cannonT = 1.7;
      const hit = aimHit(2.6, 90);
      const ix = hit ? hit.x : origin.x + dir.x * 55;
      const iz = hit ? hit.z : origin.z + dir.z * 55;
      husks.damageInRadius(ix, iz, 4.5, 120);
      this.animals?.damageInRadius(ix, iz, 4.5, 120);
      this.noiseAt(ix, iz, 70);
      const flash = new THREE.PointLight(0xffd27a, 90, 28);
      flash.position.set(ix, this.groundY(ix, iz) + 1.6, iz);
      this.scene!.add(flash);
      setTimeout(() => this.scene!.remove(flash), 220);
      this.requestHitstop(0.07);
      sfx.play('hit', { volume: 1 });
      s.addSkillXp('combat', 2);
      return;
    }
    if (mg && w.mgT <= 0) {
      w.mgT = 0.11;
      const hit = aimHit(1.25, 75);
      if (hit) husks.damageInRadius(hit.x, hit.z, 1.0, 36);
      husks.emitNoise(v.group.position.x, v.group.position.z, 20);
      sfx.play('shot', { volume: 0.45 });
    }
  }

  // ---------------------------------------------------------------
  // store-facing API: storage, repair, upgrades, modules, beacons
  // ---------------------------------------------------------------

  /** Every trailer's live state, for the save snapshot (v3). */
  getTrailerStates(): TrailerSave[] {
    if (!this.trailers) return [];
    return this.trailers.trailers.map((t) => ({
      defId: t.def.id,
      x: t.group.position.x,
      y: t.group.position.y,
      z: t.group.position.z,
      heading: t.heading,
      hitchedTo: t.hitchedTo,
      module: t.module,
      storage: t.storage.map((it) => ({ ...it })),
      fuelLiters: Math.round(t.fuelLiters),
      doorOpen: t.doorOpen,
      loadedVehicleDefId: t.loadedVehicleUid,
      extraLoadedDefIds: [...t.extraLoadedUids],
      beaconMode: t.beaconMode,
      cargoCrates: t.cargoCrates,
      rampDown: t.rampDown,
    }));
  }

  private storageList(kind: 'vehicle' | 'trailer' | 'crate', uid: string): InvItem[] | null {
    if (kind === 'vehicle') return this.vehicles.byId(uid)?.storage ?? null;
    if (kind === 'trailer') return this.trailers.byId(uid)?.storage ?? null;
    return this.crates.byId(uid)?.storage ?? null;
  }

  private storageCap(kind: 'vehicle' | 'trailer' | 'crate', uid: string): number {
    if (kind === 'vehicle') {
      const v = this.vehicles.byId(uid);
      return v ? storageCapKg(v.def.storageKg, v.upgrades) : 0;
    }
    if (kind === 'trailer') {
      const t = this.trailers.byId(uid);
      return t ? trailerStorageCapKg(t) : 0;
    }
    return 150; // a freight crate's practical limit
  }

  getStorageItems(kind: 'vehicle' | 'trailer' | 'crate', uid: string): InvItem[] | null {
    const list = this.storageList(kind, uid);
    return list ? list.map((it) => ({ ...it })) : null;
  }

  /** Move a pack stack into a vehicle/trailer/crate. Returns an error or null. */
  storagePutItem(kind: 'vehicle' | 'trailer' | 'crate', uid: string, item: InvItem): string | null {
    const list = this.storageList(kind, uid);
    if (!list) return 'That storage is gone.';
    const w = (ITEMS[item.itemId]?.weight ?? 0) * item.qty;
    if (itemsWeightKg(list) + w > this.storageCap(kind, uid)) return 'No room — that would overload it.';
    const existing = list.find((it) => it.itemId === item.itemId);
    if (existing) existing.qty += item.qty;
    else list.push({ uid: item.uid, itemId: item.itemId, qty: item.qty });
    return null;
  }

  storageTakeItem(kind: 'vehicle' | 'trailer' | 'crate', uid: string, index: number): InvItem | null {
    const list = this.storageList(kind, uid);
    if (!list || index < 0 || index >= list.length) return null;
    const [taken] = list.splice(index, 1);
    return { ...taken };
  }

  applyRepair(uid: string, kind: 'tire' | 'engine' | 'battery' | 'scrap'): string {
    const v = this.vehicles.byId(uid);
    if (!v) return 'Vehicle not found.';
    if (kind === 'tire') {
      v.tiresFlat = Math.max(0, v.tiresFlat - 1);
      v.condition = Math.min(1, v.condition + 0.03);
      return v.tiresFlat > 0 ? `One flat swapped — ${v.tiresFlat} to go.` : 'Fresh rubber all round. She rolls true again.';
    }
    if (kind === 'engine') {
      v.condition = Math.min(1, v.condition + 0.35);
      return 'Engine work done — timing, seals, the lot.';
    }
    if (kind === 'battery') {
      v.condition = Math.min(1, v.condition + 0.25);
      return 'Fresh battery in. She cranks strong.';
    }
    v.condition = Math.min(1, v.condition + 0.12);
    return 'Patched with scrap. It holds.';
  }

  canTakeUpgrade(uid: string, upgradeId: string): boolean {
    const v = this.vehicles.byId(uid);
    if (!v) return false;
    return canInstallUpgrade({ kind: v.def.kind, id: v.def.id }, upgradeId, v.upgrades);
  }

  applyUpgrade(uid: string, upgradeId: string): boolean {
    const v = this.vehicles.byId(uid);
    if (!v || v.upgrades.includes(upgradeId)) return false;
    v.upgrades.push(upgradeId);
    applyUpgradeVisuals(v);
    return true;
  }

  applyModule(trailerUid: string, moduleId: string): boolean {
    const t = this.trailers.byId(trailerUid);
    if (!t || t.def.kind !== 'box' || t.module === moduleId) return false;
    t.module = moduleId as Trailer['module'];
    applyModuleVisuals(t);
    return true;
  }

  applyBeaconMode(trailerUid: string, mode: 'off' | 'sat' | 'horde'): string | null {
    const t = this.trailers.byId(trailerUid);
    if (!t || t.module !== 'beacon') return 'That trailer has no beacon buildout.';
    if (mode !== 'off' && t.hitchedTo) return 'The beacon only deploys parked — unhitch the trailer first.';
    t.beaconMode = mode;
    if (mode === 'sat') return 'Sat uplink live: fleet tracking on the map, supply drops armed (phone → Vehicles).';
    if (mode === 'horde') return 'HORDE BEACON LIVE. Everything within 55m can hear it.';
    return 'Beacon off.';
  }

  callSupplyDrop(trailerUid: string): string {
    const s = useGameStore.getState();
    const t = this.trailers.byId(trailerUid);
    if (!t || t.module !== 'beacon') return 'No beacon buildout on that trailer.';
    if (t.beaconMode !== 'sat') return 'Switch the beacon to SAT mode first.';
    if (t.hitchedTo) return 'Deploy (unhitch) the trailer first.';
    const key = `drop_day_${s.daysElapsed}`;
    if (s.flags[key]) return 'Already called a drop today — the next bird comes tomorrow.';
    s.setFlag(key);
    const ang = this.rng() * Math.PI * 2;
    const dist = 10 + this.rng() * 5;
    const x = t.group.position.x + Math.sin(ang) * dist;
    const z = t.group.position.z + Math.cos(ang) * dist;
    let cn = 900 + Math.floor(this.rng() * 90);
    const mk = (entries: [string, number][]): InvItem[] =>
      entries.map(([itemId, qty]) => ({ uid: `drop${cn++}`, itemId, qty }));
    const pool: [string, number][][] = [
      [['bandage', 3], ['canned_food', 3], ['water_bottle', 2]],
      [['medkit', 1], ['ammo_rifle', 3], ['canned_food', 2]],
      [['fuel_can', 1], ['bandage', 2], ['ammo_rifle', 2]],
      [['scrap', 4], ['engine_part', 1], ['canned_food', 2]],
    ];
    const contents = mk(pool[Math.floor(this.rng() * pool.length)]);
    this.crates.spawnCrate(this.scene!, x, z, this.rng() * 3, (cx, cz) => heightAt(cx, cz), contents, 'Supply drop', 0x8a2f2f);
    sfx.play('beacon', { volume: 0.7 });
    return 'Supply drop away — a marked crate just came down near the trailer.';
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
    if (e.button === 0) this.mouseHeld = true;
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
    if (e.button === 0) this.mouseHeld = false;
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
      s.lootOpenId == null &&
      s.storageOpen == null
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
