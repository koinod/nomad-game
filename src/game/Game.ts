// Game.ts — engine orchestrator. Owns the renderer, loop, and all subsystems.
// Public API matches INTERFACES.md exactly.

import * as THREE from 'three';
import { useGameStore, claimsFromLegacyBase } from '../store/gameStore';
import { facilityPresenceAt } from '../systems/facilityPresence';
import type { DifficultyId, NearbyEntry, SaveSnapshot, VehicleSave, WorldDiff } from '../store/types';
import { hasPhoneCarried, nearbyFromSources, walkCarried } from '../store/containers';
import { DIFFICULTIES } from '../store/types';
import { QUESTS } from '../data/quests';
import { input, resetEdgeTriggers } from './input';
import { ITEMS } from '../data/items';
import { World, heightAt, biomeAt, CAMPFIRE_SPOTS } from './World';
import { betaHeightAt, betaSlopeAt, betaZoneAt, buildBetaRapierHeightfield } from './betaTerrain';
import { BETA_PLAYER_SPAWN } from '../data/betaLayout';
import { Player } from './Player';
import { Fx } from './Fx';
import { ProjectileManager } from './Projectiles';
import { rangeFalloff, armorMult } from './gunMath';
import { HuskManager } from './Husks';
import type { Husk, SpawnZone } from './Husks';
import { Companions } from './Companions';
import { InteractSystem, buildContainerDefs, INTERACT_RADIUS_M, STORAGE_RADIUS_M } from './Interact';
import { AnimalManager } from './Animals';
import { VehicleManager, applyUpgradeVisuals, attachGt500Glb, attachPrimeGlb, attachSprinterGlb, attachDarkHorseGlb, placeSeahawk, applyGlbVisuals, itemsWeightKg, type Vehicle } from './Vehicles';
import { CarPhysics } from './CarPhysics';
import { WeatherSystem } from './Weather';
import { CloudLayer, updateWindUniforms } from './Clouds';
import { PostFX } from './PostFX';
import { canInstallUpgrade, storageCapKg, ramDamageFactor } from '../data/upgrades';
import type { InvItem, TrailerSave } from '../store/types'; // TrailerSave: legacy snapshot field, always [] now
import { floorYAt, floorYAtRef, resolveCollisions, type Collider, type FloorRect } from './Colliders';
import { captureVehicleSave, restoreVehicleFleet } from './saveMigration';
import { sfx, ambience, audioEngine, isUnderRoof, type RoofBox } from '../systems/audio';
import { useCraftQueue } from '../systems/crafting';
import { XP_EVENTS } from '../systems/skills';
import { carryBonusKg, flashRadiusBonus, forcedEntryNoiseRadius, heavyShiftKg, searchDurationMult, searchNoiseRadius } from '../systems/perkEffects';
import { isSpecialKind } from './Combat';
import { computeVisibility } from './visibility';
import { meterLevel, noiseClassRadius } from './noise';
import { ENDING_LINES } from '../narrative/dialogue';
import { CLAIM_SITES, claimSite } from '../data/base';
import { TurretSystem } from './Turrets';
import {
  computeHeat, siegeForecast, planSiegeWaves, type SiegeWavePlan,
} from '../systems/baseClaims';
import { poiName } from '../data/dispatch';
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
  private fx: Fx | null = null;
  private projectiles: ProjectileManager | null = null;
  private player: Player | null = null;
  private husks: HuskManager | null = null;
  private companions: Companions | null = null; // ORDER #6: the crew, embodied
  private lastAbsMin = -1; // ORDER #6: game-clock baseline for companion needs
  private animals: AnimalManager | null = null;
  private interact: InteractSystem | null = null;
  private turrets: TurretSystem | null = null;
  // siege loop (stage 7): the wave plan is runtime-only — baseExt
  // persists the STATE; a save loaded mid-siege re-arms as a warning.
  private siegeT = 0;
  private siegePlan: { siteId: string; waves: SiegeWavePlan[]; next: number } | null = null;
  private scoutNight = -1;
  private wasDeadSiege = false;
  // thrown weapons in flight + molotov fire zones
  private throwables: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    fuse: number;
    itemId: string;
  }[] = [];
  private fireZones: { group: THREE.Group; t: number; x: number; z: number }[] = [];
  private decoys: { group: THREE.Group; t: number; tick: number; x: number; z: number }[] = [];
  // hold-to-search state (container / corpse / safe); `alerted` tracks
  // whether any husk hunted/attacked during the search — Lane 8's
  // search_undetected award only pays when it stays false
  private searching: { id: string; label: string; t: number; dur: number; x: number; z: number; hp: number; alerted: boolean; forced?: boolean } | null = null;
  vehicles!: VehicleManager;
  private carPhysics: CarPhysics | null = null;
  private weather = new WeatherSystem({ seed: 987654321 });
  // Lane 12 ambience: post chain + cloud deck, built in init, torn
  // down in dispose; sunElev caches the 4Hz sky pass for per-frame use.
  private postfx: PostFX | null = null;
  private clouds: CloudLayer | null = null;
  private sunElev = 0.5;
  private lastClockMin = -1;
  private lastPlayerHp = -1;
  private ramT = 0;
  private buildKey = '';
  driving: Vehicle | null = null;
  private wasFirstPerson = false;
  private cleanMeters = 0;
  private fleetT = 0;
  private houseColliders: Collider[] = [];
  private houseFloors: FloorRect[] = [];

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
  /** Audio pass: kit roof boxes for the interior (muffle) query,
   *  collected once from the world's kits on first use. */
  private audioRoofs: RoofBox[] | null = null;
  private audioDir = new THREE.Vector3();
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
    // (The terrain needs no seed-init anymore: the Beta grid is
    // authored data — betaTerrain.ts — identical for every run.)

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
    this.world.setupEnvironment(this.renderer);

    // Lane 12: the post chain (boot tier classified by GameView's
    // primePostFxBoot, read synchronously by the PostFX constructor)
    // and the weather-driven cloud deck.
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.clouds = new CloudLayer();
    this.scene.add(this.clouds.group);
    this.fx = new Fx(this.scene);
    this.projectiles = new ProjectileManager(this.scene);

    // FLEET RESPAWN (Ian, 2026-10-21): the whole fleet — GT500, Prime,
    // Sprinter — spawns on its marked pads at the revamped airbase;
    // saved positions restore over these (see VEHICLE_SPAWNS /
    // saveMigration). The FX stand-in stays deleted.
    this.vehicles = new VehicleManager();
    this.vehicles.spawn(this.scene!, this.world.poiPositions, (x, z) => heightAt(x, z));

    // register POIs (contract)
    useGameStore.getState().setPoiPositions(this.world.poiPositions);

    // Built-world collision: the lighthouse kit + the REVAMPED AIRBASE
    // kits (Ian un-parked the airbase 2026-10-21) + its apron props +
    // stations. Walls collide, doorways don't — the kits record both.
    this.houseColliders = [
      ...this.world.lighthouseKit.colliders,
      ...this.world.airfieldKits.flatMap((k) => k.colliders),
      ...this.world.airfieldPropColliders,
      ...this.world.sectorKits.flatMap((k) => k.colliders),
      ...this.world.sectorPropColliders,
      ...this.world.stationColliders,
    ];
    this.houseFloors = [
      ...this.world.lighthouseKit.floors,
      ...this.world.airfieldKits.flatMap((k) => k.floors),
      ...this.world.sectorKits.flatMap((k) => k.floors),
    ];
    // snapshot world diff
    const snap = opts.snapshot ?? null;
    let savedLootedAt: Record<string, number> = {};
    if (snap) {
      savedLootedAt = snap.world.lootedAt ?? {};
      for (const id of snap.world.looted) this.looted.add(id);
      for (const id of snap.world.deadHusks) this.deadHusks.add(id);
      for (const id of snap.world.cleared) this.cleared.add(id);
      // Save migration: each live vehicle restores ONLY its own
      // def-id save — see saveMigration.ts (restoreVehicleFleet). A
      // saved Stallion FX is deleted content (Ian, 2026-10-21) and
      // strips silently; it is never stamped onto the GT500. Trailer
      // state is dropped entirely (snap.trailers never read).
      const restoredIds = restoreVehicleFleet(this.vehicles.vehicles, snap.vehicles);
      for (const v of this.vehicles.vehicles) {
        if (restoredIds.includes(v.def.id) && v.upgrades.length) applyUpgradeVisuals(v);
      }
    }

    // player
    this.player = new Player(this.scene);
    const s0 = useGameStore.getState();
    // Fresh spawn: the lighthouse grounds — BETA_PLAYER_SPAWN is the
    // layout's surveyed spot on the Collective's pad (map integration,
    // 2026-10-21). The fleet waits at the airbase motor pool a short
    // drive west (fleet respawn, Ian's order); the shore camp is the
    // prologue's first road goal, east along the coast. Loaded games
    // keep their saved position; only the fresh spawn and the default
    // respawn point (lastSafe) live at the lighthouse.
    const spawnX = BETA_PLAYER_SPAWN.x;
    const spawnZ = BETA_PLAYER_SPAWN.z;
    this.lastSafe = [spawnX, spawnZ];
    if (snap) {
      const [px, , pz] = snap.player.pos;
      this.player.setPosition(px, heightAt(px, pz) + 0.5, pz);
      this.player.stamina = s0.stamina;
      this.player.camYaw = Math.PI * 0.9;
    } else {
      this.player.setPosition(spawnX, heightAt(spawnX, spawnZ) + 0.5, spawnZ);
      // face the tower and the island (the layout's spawn heading)
      this.player.camYaw = BETA_PLAYER_SPAWN.heading;
    }

    // The GT500 GLB replaces its stand-in when it loads; the Rapier
    // rigid body is built at the car's final (possibly save-restored)
    // position. (The Stallion FX's own GLB attach is gone with its
    // spawn — attachMustangGlb stays exported in Vehicles.ts; the
    // Dark Horse below rigs through the shared fleet contract.)
    const firstCar = this.vehicles.vehicles[0];
    const gt500 = this.vehicles.vehicles.find((v) => v.def.id === 'gt500');
    if (gt500) attachGt500Glb(gt500);
    // The fleet GLBs (Ian's specs, approved as-is 2026-10-21): each
    // replaces its procedural stand-in when it loads.
    const prime = this.vehicles.vehicles.find((v) => v.def.id === 'nomad_prime');
    if (prime) attachPrimeGlb(prime);
    const sprinter = this.vehicles.vehicles.find((v) => v.def.id === 'sprinter_van');
    if (sprinter) attachSprinterGlb(sprinter);
    // The Dark Horse (integration, 2026-10-21): the Stallion lane's
    // PRD build on its painted pad — the hero car, playable in Stage
    // 0 with its Stage 1/2 mod ladder as upgrade tiers.
    const darkHorse = this.vehicles.vehicles.find((v) => v.def.id === 'dark_horse');
    if (darkHorse) attachDarkHorseGlb(darkHorse);
    // Lane 2 staged placement: the Seahawk sits on the airbase apron as
    // a static landmark — no flight model yet, and deliberately not a
    // Vehicle instance, so the save shape is untouched
    placeSeahawk(this.scene, (x, z) => heightAt(x, z));
    // vehicle collision is DELETED (Ian, 2026-10-21): CarPhysics gets
    // the terrain field only — no building colliders, no impact
    // callback. The kit/station colliders above still serve the
    // PLAYER's collision (houseColliders), never the car's.
    // The heightfield is the Beta grid VERBATIM (buildBetaRapier-
    // Heightfield) — physics rides the authored nodes, not a resample.
    this.carPhysics = await CarPhysics.create(
      (x, z) => heightAt(x, z),
      buildBetaRapierHeightfield(),
    );
    if (firstCar) {
      this.carPhysics.spawnCar(firstCar, firstCar.upgrades, itemsWeightKg(firstCar.storage));
      // settle the suspension before anyone sees it
      for (let i = 0; i < 30; i++) this.carPhysics.parkBrake();
      applyGlbVisuals(firstCar);
    }

    // husks — zone centers ride their POIs (map integration,
    // 2026-10-21: the old hard-coded centers were old-map ground)
    const [airbaseX, airbaseZ] = this.world.poi('airbase');
    const [forestX, forestZ] = this.world.poi('forest_cache');
    const [townX, townZ] = this.world.poi('town');
    const [relayX, relayZ] = this.world.poi('relay_station');
    const [duneX, duneZ] = this.world.poi('dune_cache');
    const zones: SpawnZone[] = [
      { id: 'forest', x: forestX, z: forestZ, radius: 55, count: 3, kinds: ['shambler', 'stalker', 'crawler'] },
      { id: 'town', x: townX, z: townZ, radius: 60, count: 4, kinds: ['shambler'] },
      { id: 'relay', x: relayX, z: relayZ, radius: 42, count: 5, kinds: ['shambler', 'stalker', 'spitter'] },
      { id: 'dunes', x: duneX, z: duneZ, radius: 55, count: 2, kinds: ['stalker', 'crawler'], nightOnly: true },
      // TOTAL PURGE: the carrier is gone — its guard pack (the wave-4
      // specials) redeploys to the airbase grounds, where the brute
      // already walks. The island's hardest fight now guards open ground.
      { id: 'airbase', x: airbaseX, z: airbaseZ, radius: 52, count: 8, kinds: ['shambler', 'brute', 'spitter', 'stalker', 'armored', 'armored', 'bloater', 'screamer'] },
    ];
    this.husks = new HuskManager(this.scene, zones, opts.seed);
    // spawn sanity (map phase): area zones overlap the town — without a
    // veto, husks seeded inside houses and shops. Points inside any
    // building collider (padded) are rejected and re-rolled.
    this.husks.spawnBlocked = (x, z) => {
      for (const c of this.houseColliders) {
        if (x >= c.x0 - 0.6 && x <= c.x1 + 0.6 && z >= c.z0 - 0.6 && z <= c.z1 + 0.6) return true;
      }
      return false;
    };
    this.husks.spawnInitial(
      this.deadHusks,
      (x, z) => this.groundY(x, z),
      this.isNight(),
      useGameStore.getState().daysElapsed,
    );

    // ORDER #6: recruited survivors embodied — follows the roster in
    // the store (figures spawn/despawn as the crew changes).
    this.companions = new Companions(this.scene);

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
        lampRoomY: this.world.lampRoomY,
        // stage 7: a relocated home's stranded stockpile becomes a real
        // container at the old site — haul it back or lose it.
        onStrandedStockpile: (fromSiteId, items) => {
          if (!this.interact || items.length === 0) return;
          const anchor = this.world!.poiPositions[fromSiteId]
            ?? (fromSiteId === 'military_base' ? this.world!.poiPositions['airbase'] : undefined);
          if (!anchor) return;
          const id = `stranded:${fromSiteId}:${Math.floor(this.elapsed)}`;
          if (this.interact.containerDef(id)) return;
          this.interact.registerContainer({
            id,
            x: anchor[0] + 5,
            z: anchor[1] - 5,
            label: 'Search stranded stockpile',
            loot: items.map((it) => ({ id: it.itemId, min: it.qty, max: it.qty, chance: 1 })),
          });
        },
        deployTurret: (siteId) => this.turrets?.deployAt(siteId),
      },
      this.world.poiPositions,
      [
        ...buildContainerDefs(this.world.poiPositions),
        ...this.world.lighthouseKit.containers,
        ...this.world.airfieldKits.flatMap((k) => k.containers),
        ...this.world.sectorKits.flatMap((k) => k.containers),
      ],
      savedLootedAt,
    );
    this.turrets = new TurretSystem(this.scene, (x, z) => this.groundY(x, z));
    this.turrets.syncFromClaims();

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
    this.sunElev = this.world.updateSky(s0.timeMinutes).sunElevation;
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
    this.companions?.dispose();
    this.companions = null;
    this.animals?.dispose();
    this.postfx?.dispose();
    this.postfx = null;
    this.clouds?.dispose();
    this.clouds = null;
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
      lootedAt: this.interact?.getLootedAt() ?? {},
    };
  }

  /** Every vehicle's live state, for the save snapshot (v3). */
  getVehicleStates(): VehicleSave[] {
    if (!this.vehicles) return [];
    return this.vehicles.vehicles.map(captureVehicleSave);
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
    const [bx, bz] = this.world.poi(poiId);
    const [ox, oz] = CAMPFIRE_SPOTS[poiId] ?? [0, 0];
    const x = bx + ox;
    const z = bz + oz;
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
      } else if (hasPhoneCarried(st.inventory) && st.battery > 0) {
        // the deck follows the phone ITEM (inventory v2) — carried or
        // the plain pack opens instead
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
    if (input.hotbar >= 1 && input.hotbar <= 4 && s.screen === 'game' && !s.dialogue) {
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

    // Weather ticks PER FRAME on a fractional game clock (Item 3):
    // it used to tick inside the 4 Hz sky block off the whole-minute
    // clock, so its eased factors (rain, fog, cloud) advanced in
    // ~15-game-second chunks four times a second — transitions stepped
    // instead of crossfading. The fractional clock (whole minutes +
    // the in-progress minute accumulator) advances continuously, so
    // the same total game time now flows smoothly. The state machine
    // sees identical durations; only the sampling is finer.
    if (this.world) {
      const nowMinF = s.daysElapsed * 1440 + s.timeMinutes + this.timeT;
      if (this.lastClockMin >= 0) {
        this.weather.update(Math.max(0, nowMinF - this.lastClockMin) * 60, s.timeMinutes / 60);
      }
      this.lastClockMin = nowMinF;
    }
    // sky at ~4Hz (avoids per-frame color allocations)
    this.skyT -= dt;
    if (this.skyT <= 0 && this.world) {
      this.skyT = 0.25;
      const wx = this.weather.snapshot();
      const sky = this.world.updateSky(s.timeMinutes, {
        cloudCover: wx.cloudCover,
        fog: wx.fog,
        precipitation: wx.precipitation,
        wetness: wx.wetness,
        windX: Math.cos(wx.windDirRad) * wx.windSpeed * 14,
        windZ: Math.sin(wx.windDirRad) * wx.windSpeed * 14,
      });
      this.sunElev = sky.sunElevation;
      this.carPhysics?.setGripScale(this.weather.gripFactor());
      const wetPct = Math.round(wx.wetness * 20);
      if (s.weatherNow.state !== wx.state || s.weatherNow.wetPct !== wetPct) {
        s.setWeatherNow({ state: wx.state, wetPct });
      }
      if (sky.isNight !== this.lastNight) {
        this.lastNight = sky.isNight;
        ambience.setNight(sky.isNight);
      }
    }
    this.world?.update(dt, this.elapsed, s.pos[0], s.pos[2]);
    this.interact?.update(dt, this.elapsed);

    // Lane 12 ambience, per frame: the cloud deck rides the live weather
    // snapshot + cached sun; wind uniforms feed World's sway-patched
    // foliage; light shafts face the camera; the grade follows the sun.
    if (this.world && this.camera) {
      const wxNow = this.weather.snapshot();
      this.clouds?.update(dt, s.pos[0], s.pos[2], wxNow, this.sunElev);
      updateWindUniforms(wxNow, this.elapsed);
      this.world.lightShafts?.update(this.camera.position, this.sunElev, wxNow);
      this.postfx?.setGradeInputs(this.sunElev, wxNow.precipitation);
    }

    // Render through the PostFX chain when built (the 'off' tier is a
    // plain renderer.render inside the chain; the governor evaluates
    // per render). No focus feed: depth of field was deleted on
    // Ian's 2026-10-21 order ("remove camera blur").
    if (this.postfx) {
      this.postfx.render(dt);
    } else {
      this.renderer?.render(this.scene!, this.camera!);
    }
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
      // a new day (clock wrapped past midnight): crew morale settles —
      // Lane 10's upkeep + morale pass when a tiered home is claimed,
      // the legacy morale abstraction otherwise (baseDailyTick decides)
      if (s.timeMinutes < before) {
        s.advanceDay();
        s.baseDailyTick();
        s.baseTick();
      }
    }

    // timed crafts (Lane 7) run on the game clock: advance the queue —
    // completions grant their result + XP inside the engine's tick
    useCraftQueue.getState().tick();

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

    // ORDER #4 C5: base presence, mirrored beside the station check —
    // which claimed base's ring the player stands in and what it hosts
    // (systems/facilityPresence). Effective claims mirror the phone
    // Base tab's rule: the tiered claims state, with a legacy-only
    // base folded in until the next load migrates it. The setter is
    // signature-guarded, so this costs a store write only on change.
    {
      const claims = s.claims.home || !s.base
        ? s.claims
        : { home: claimsFromLegacyBase(s.base).home, outposts: s.claims.outposts };
      s.setAtBase(facilityPresenceAt(claims, s.poiPositions, px, pz));
    }

    // fleet telemetry for the phone's Vehicles app (~1 Hz)
    this.fleetT += dt;
    if (this.fleetT > 1 && this.vehicles) {
      this.fleetT = 0;
      const poiPos = this.world?.poiPositions ?? {};
      const locOf = (x: number, z: number): string => {
        let bestId: string | null = null;
        let bestD = Infinity;
        for (const [id, p] of Object.entries(poiPos)) {
          if (id.startsWith('npc:')) continue;
          const d = Math.hypot(p[0] - x, p[1] - z);
          if (d < bestD) { bestD = d; bestId = id; }
        }
        if (bestId === 'airbase' && bestD < 130) return 'At the depot';
        if (bestId && bestD < 45) {
          return bestId === 'lighthouse_base' || bestId === 'lighthouse_top'
            ? 'At the lighthouse'
            : `At ${bestId.replace(/_/g, ' ')}`;
        }
        return `${Math.round(x)}, ${Math.round(z)}`;
      };
      {
        // build watcher, per vehicle: a change re-derives the live
        // body's params only for the def that body is bound to
        // (setBuild ignores the rest) — mass follows the car you drive
        if (this.carPhysics) {
          const key = this.vehicles.vehicles
            .map((mv) => `${mv.def.id}:${mv.upgrades.join(',')}:${itemsWeightKg(mv.storage)}:${mv.tiresFlat}`)
            .join('|');
          if (key !== this.buildKey) {
            this.buildKey = key;
            for (const mv of this.vehicles.vehicles) {
              this.carPhysics.setBuild(mv.upgrades, itemsWeightKg(mv.storage), mv.def.id);
            }
          }
        }
      }
      s.setFleet(
        this.vehicles.vehicles.map((v) => ({
          defId: v.def.id,
          name: v.def.name + (v.variant === 'fx' ? ' FX' : ''),
          // Lane 13 field, stamped: instance identity + absolute fuel
          // (the Vehicle tracks liters aboard; uid == defId while the
          // fleet runs one instance per def). BasePanel's garage view
          // and DispatchPanel read these instead of re-deriving.
          instanceId: v.uid,
          fuelLiters: Math.round(v.fuel * 10) / 10,
          tankLiters: v.def.fuelMax,
          burnClass: v.def.burnClass,
          fuelPct: Math.round((v.fuel / v.def.fuelMax) * 100),
          condPct: Math.round(v.condition * 100),
          dist: Math.round(Math.hypot(v.group.position.x - player.pos.x, v.group.position.z - player.pos.z)),
          loc: locOf(v.group.position.x, v.group.position.z),
          storageUsedKg: itemsWeightKg(v.storage),
          storageCapKg: storageCapKg(v.def.storageKg, v.upgrades),
          upgrades: [...v.upgrades],
          tiresFlat: v.tiresFlat,
          hitchedTrailer: null,
          // stage 7 (§7.8): parked inside the home claim's ring — the
          // Base tab's garage view reads stored cars from this stamp.
          atHome: (() => {
            const home = s.claims.home;
            if (!home) return false;
            const anchor = s.poiPositions[home.siteId]
              ?? (home.siteId === 'military_base' ? s.poiPositions['airbase'] : undefined);
            const site = claimSite(home.siteId);
            if (!anchor || !site) return false;
            return Math.hypot(v.group.position.x - anchor[0], v.group.position.z - anchor[1]) <= site.prefabRadiusM;
          })(),
        })),
      );
      s.setTrailerFleet([]); // VEHICLE RESET: no trailers exist
      // stage 7 (§7.2): live husk counts at every claim site for the
      // phone checklist — the world owns husks, the store owns checks.
      {
        const counts: Record<string, number> = {};
        for (const site of CLAIM_SITES) {
          if (site.klass === 'never') continue;
          const anchor = s.poiPositions[site.poiId]
            ?? (site.poiId === 'military_base' ? s.poiPositions['airbase'] : undefined);
          if (!anchor) continue;
          counts[site.poiId] = this.husks?.aliveWithin(anchor[0], anchor[1], 40) ?? 0;
        }
        s.setClaimHostiles(counts);
      }
    }

    // encumbrance gates sprint + slows movement (Pack Mule: +8kg of
    // limit, and the heavy tier starts 10kg later — perkEffects)
    const tier = encumbranceTier(
      totalWeightKg(s.inventory),
      carryLimitKg(s.equipped, s.inventory, s.difficulty, carryBonusKg(s.perks)),
      heavyShiftKg(s.perks),
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
        // the HUD noise meter tracks the loudest sound at the player,
        // on Lane 11's canonical meter curve (gunshot class = full scale)
        useGameStore.getState().setNoiseLevel(meterLevel(eff));
      },
      onThrow: (itemId: string) => this.throwGrenade(itemId),
      onProjectile: (
        origin: THREE.Vector3,
        dir: THREE.Vector3,
        shot: { damage: number; pen: number; weaponId: string },
      ) => {
        const speed = ITEMS[shot.weaponId]?.projectileSpeed ?? 120;
        this.projectiles?.fire(origin, dir, speed, shot);
      },
      fx: this.fx ?? undefined,
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

    this.vehicles.updateDoors(dt);
    if (!this.driving && this.carPhysics) {
      // parked: the handbrake holds the body; visuals follow the settle
      this.carPhysics.parkBrake();
      for (const mv of this.vehicles.vehicles) applyGlbVisuals(mv);
    }

    // ROOFS NEVER DISAPPEAR (Ian's law, 2026-10-20): the old roof-lift
    // rule that hid a building's roof while the player was inside is
    // REMOVED outright. Roof meshes always render in every camera
    // state; interior views are the camera's problem (push-in /
    // collision), never the geometry's. Guarded by tests/roofs.test.ts.

    const night = this.isNight();
    // ---- Lane 8 visibility wiring (stage 3): sample the light at the
    // player from the same sun math World.updateSky renders with
    // (sunrise 06:00 at the horizon), dimmed by weather cloud cover;
    // night is moonlight. Posture/motion come off the Player, perks
    // and stealth level off the store. The computed exposure feeds
    // the store's visibility flag (Lane 11's LightIndicator reads it)
    // and the raw inputs ride the HuskCtx — Husks' perception runs
    // computeVisibility itself so the gh_unseen capstone precedence
    // lives in exactly one place.
    const sunElev = Math.sin(((s.timeMinutes / 1440) - 0.25) * Math.PI * 2);
    const cloudDim = 1 - this.weather.snapshot().cloudCover * 0.45;
    const playerLight = sunElev > 0.02
      ? Math.min(1, (0.35 + sunElev * 1.4) * cloudDim)
      : 0.12;
    const playerCrouched = player.isCrouched;
    const playerMoving = player.isMoving;
    const vis = computeVisibility(
      {
        lightLevel: playerLight,
        isNight: night,
        crouched: playerCrouched,
        moving: playerMoving,
      },
      s.perks,
    );
    s.setVisibility(vis.exposure);
    husks.update(
      dt,
      {
        playerPos: player.pos,
        isNight: night,
        groundY: (x, z, refY) => this.groundYRef(x, z, refY ?? 0),
        colliders: this.houseColliders,
        onHuskKilled: (h) => this.onHuskKilled(h),
        daysElapsed: s.daysElapsed,
        // a bloater burst reads on screen as a heavy dust/flesh impact
        onBurstFx: (x, y, z) => this.fx?.impactDust(new THREE.Vector3(x, y, z)),
        // Lane 8 visibility inputs for the perception model (L8-1)
        playerLight,
        playerCrouched,
        playerMoving,
        playerPerks: s.perks,
        playerStealthLevel: s.skills?.stealth?.level ?? 0,
        // Lane 8 XP hook #10: a hunting husk lost the trail — Lane 4's
        // side fires this exactly once per hunt->investigate transition
        onHuskLost: () => {
          const ev = XP_EVENTS.husk_lost;
          useGameStore.getState().addSkillXp(ev.skill, ev.xp);
        },
      },
      player.pos,
      night,
    );
    // ORDER #6: the crew embodied — formation, seats, needs, combat
    // assist. The game-minute delta comes from the store clock itself,
    // so sleep fast-forwards land on companions too (they slept).
    {
      const absMin = s.daysElapsed * 1440 + s.timeMinutes;
      const gameMinDelta = this.lastAbsMin < 0 ? 0 : Math.max(0, absMin - this.lastAbsMin);
      this.lastAbsMin = absMin;
      const homeAnchor = s.claims.home
        ? (s.poiPositions[s.claims.home.siteId] ?? (s.claims.home.siteId === 'military_base' ? s.poiPositions['airbase'] : undefined))
        : (s.base ? s.poiPositions[s.base.poiId] : undefined);
      const basePos = homeAnchor ? { x: homeAnchor[0], z: homeAnchor[1] } : null;
      const drv = this.driving;
      this.companions?.update(dt, {
        playerPos: player.pos,
        playerHeading: player.group.rotation.y,
        groundY: (x, z, refY) => this.groundYRef(x, z, refY ?? 0),
        colliders: this.houseColliders,
        nearestHusk: (x, z, r) => husks.nearestAlive(x, z, r),
        vehicle: drv
          ? {
              x: drv.group.position.x, y: drv.group.position.y, z: drv.group.position.z,
              quat: drv.group.quaternion,
              defId: drv.def.id, kind: drv.def.kind,
              width: drv.def.width, length: drv.def.length,
              ax: drv.seatAnchor?.lx, az: drv.seatAnchor?.lz,
            }
          : null,
        basePos,
        gameMinDelta,
      });
    }

    this.animals?.update(dt, player.pos, (x, z) => heightAt(x, z));

    // deployed base turrets (stage 7): acquire + fire through the
    // husks' own damage seam; power/ammo enforced inside the system
    this.turrets?.update(dt, husks);

    // the siege loop (stage 7) ticks at 1Hz over BaseExt state
    this.siegeT += dt;
    if (this.siegeT >= 1) {
      this.siegeT = 0;
      this.updateSiege(s, night);
    }

    // husk death bookkeeping (kill counted once when the tip-over starts)
    for (const h of husks.husks) {
      if (h.state === 'dead' && !h.killReported) {
        h.killReported = true;
        this.onHuskKilled(h);
      }
    }

    // combat damage interrupts timed crafts (Lane 7 hook): hp dropped
    // this frame while a husk is actively hunting/attacking — the queue
    // banks every running job's progress, resumable from the Craft tab
    {
      const hpNow = useGameStore.getState().hp;
      if (
        this.lastPlayerHp >= 0 &&
        hpNow < this.lastPlayerHp &&
        husks.husks.some((h) => h.state === 'hunt' || h.state === 'attack')
      ) {
        useCraftQueue.getState().interruptAll();
      }
      this.lastPlayerHp = hpNow;
    }

    // combat feedback particles + tracers ride every frame
    this.fx?.update(dt);

    // long-gun rounds in flight: they land when they land, with the same
    // falloff / headshot / feedback rules the hitscan path uses
    this.projectiles?.update(
      dt,
      husks,
      (x, z) => this.groundY(x, z),
      (hit) => {
        let dmg = rangeFalloff(hit.shot.damage, hit.dist) * armorMult(hit.shot.pen, hit.husk.armorClass);
        if (hit.head) dmg *= 2;
        const dealt = Math.round(dmg);
        const kdir = hit.dir.clone();
        kdir.y = 0;
        if (kdir.lengthSq() < 0.001) kdir.set(0, 0, 1); else kdir.normalize();
        const killed = hit.husk.damage(dealt, kdir, 1.2, false, { head: hit.head, pen: hit.shot.pen });
        hit.husk.shotFrom(player.pos, hit.dist, hit.head);
        this.fx?.impactFlesh(hit.point, dealt, hit.head);
        if (killed) sfx.play('killconfirm', { volume: 0.55 });
        else if (hit.head) sfx.play('headshot', { volume: 0.9 });
        else sfx.play('tick', { volume: 0.35 + Math.min(0.6, dealt / 90) });
        player.registerShotFeedback(killed, hit.head, killed && isSpecialKind(hit.husk.kind));
      },
      (point) => this.fx?.impactDust(point),
    );

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
      if (!q.alerted && husks.husks.some((h) => h.state === 'hunt' || h.state === 'attack')) {
        q.alerted = true;
      }
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
          // Order #5 search noise: a completed search rustles at the
          // radius the search perks shape (Light Fingers / Patient /
          // Loot Ghost — playerCtx.emitNoise applies Soft Steps). A
          // FORCED entry instead bangs the forced_entry class and
          // marks the container so its alarm trip reports the smash.
          if (q.forced) {
            this.interact!.markForced(q.id);
            playerCtx.emitNoise(
              player.pos.x, player.pos.z,
              forcedEntryNoiseRadius(s.perks, noiseClassRadius('forced_entry')),
            );
          } else {
            const r = searchNoiseRadius(s.perks, !!def);
            if (r > 0) playerCtx.emitNoise(player.pos.x, player.pos.z, r);
          }
          if (def?.locked) {
            const lp = walkCarried(s.inventory).find((i) => i.itemId === 'lockpick');
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
            // Lane 8 search_undetected: the stealth award pays only when
            // no husk hunted/attacked at any point during the search
            if (!q.alerted) {
              const ev = XP_EVENTS.search_undetected;
              s.addSkillXp(ev.skill, ev.xp);
            }
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

    // interact prompts: vehicle context (positional) wins, then the
    // vehicle drive prompt, then world interactables
    const veh = !this.driving && !this.searching
      ? this.vehicles.nearest(player.pos.x, player.pos.z, 2.9)
      : null;
    // [T] storage: your ride while driving, else the closest openable box
    if (input.storage && !this.searching) {
      input.storage = false;
      if (this.driving) s.openStorage('vehicle', this.driving.uid, `${this.driving.def.name} storage`);
      else this.openStorageNear(player.pos.x, player.pos.z, s);
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
    this.checkReachSteps(s, player.pos.x, player.pos.z, player.pos.y);
    this.checkTollCrew(s, player.pos.x, player.pos.z);

    // battery
    if (s.phoneOpen) s.drainBattery(dt * 0.3);
    else if (!night) s.chargeBattery(dt * 0.05);

    // player mirror @ ~10Hz
    this.syncT += dt;
    if (this.syncT >= 0.1) {
      this.syncT = 0;
      s.syncPlayer([player.pos.x, player.pos.y, player.pos.z], s.hp, player.stamina);
      this.feedAudioEnvironment(player);
    }

    // ambience danger @ ~2Hz
    this.dangerT -= dt;
    if (this.dangerT <= 0) {
      this.dangerT = 0.5;
      const t = husks.nearestThreat(player.pos.x, player.pos.z);
      ambience.setDanger(t.hunting || t.dist < 25 ? 2 : t.dist < 60 ? 1 : 0);
    }
  }

  /**
   * Audio pass environment feed (~10 Hz): everything the soundscape
   * needs, sampled from the same sources the rest of the game reads —
   * the weather snapshot, the beta terrain field, and the kit roofs.
   * Shoreline distance is estimated as height/slope over the height
   * field (exact at the waterline, soft inland — surf only needs the
   * trend). Interior is a binary under-a-roof test; the engine eases
   * the muffle so doorways don't pop.
   */
  private feedAudioEnvironment(player: import('./Player').Player): void {
    if (!this.audioRoofs) {
      const boxes: RoofBox[] = [];
      const w = this.world;
      if (w) {
        const kits = [w.lighthouseKit, ...(w.airfieldKits ?? []), ...(w.sectorKits ?? [])];
        for (const k of kits) {
          if (!k) continue;
          for (const r of k.roofs) {
            boxes.push({ x0: r.bounds.x0, z0: r.bounds.z0, x1: r.bounds.x1, z1: r.bounds.z1, topY: k.building.topPlateY });
          }
        }
      }
      this.audioRoofs = boxes;
    }
    const px = player.pos.x;
    const pz = player.pos.z;
    const h = betaHeightAt(px, pz);
    let shore = 0;
    if (h > 0) {
      const slope = Math.max(0.02, betaSlopeAt(px, pz));
      shore = Math.min(90, h / slope);
    }
    if (this.camera) {
      this.camera.getWorldDirection(this.audioDir);
      audioEngine.setListener(px, pz, this.audioDir.x, this.audioDir.z);
    } else {
      audioEngine.setListener(px, pz, 0, 1);
    }
    const wx = this.weather.snapshot();
    audioEngine.setEnvironment({
      weather: { state: wx.state, precipitation: wx.precipitation, windSpeed: wx.windSpeed },
      isNight: this.lastNight,
      zone: betaZoneAt(px, pz),
      shoreDistM: shore,
      interior: isUnderRoof(px, player.pos.y, pz, this.audioRoofs) ? 1 : 0,
    });
  }

  private checkReachSteps(s: ReturnType<typeof useGameStore.getState>, px: number, pz: number, py: number): void {
    const pois = s.poiPositions;
    for (const q of s.quests) {
      const def = QUESTS.find((d) => d.id === q.id);
      const step = def?.steps[q.stepIndex];
      if (!step || step.type !== 'reach' || !step.target.startsWith('poi:')) continue;
      const p = pois[step.target.slice(4)];
      if (!p) continue;
      // the lamp room is a place you CLIMB to now: standing at the tower
      // base no longer completes "Reach the lamp room"
      if (step.target === 'poi:lighthouse_top' && py < (this.world?.lampRoomY ?? 0) - 0.5) continue;
      if (Math.hypot(p[0] - px, p[1] - pz) < 6) {
        s.questEvent('reach', step.target, 1);
      }
    }
  }

  /**
   * W5 (stage 7): the Skulls toll-crew hook on the relay→dune road
   * (ROAD_GRAPH marks the stretch; Lane 9 specs a hook, not an
   * encounter). Crossing the stretch's midpoint once lands a journal +
   * toast beat, shaded by Skulls rep — no invented encounter.
   */
  private tollCrewT = 0;
  private checkTollCrew(
    s: ReturnType<typeof useGameStore.getState>,
    px: number,
    pz: number,
  ): void {
    if (s.flags['toll_crew_seen']) return;
    this.tollCrewT += 1 / 60;
    if (this.tollCrewT < 1) return;
    this.tollCrewT = 0;
    const a = s.poiPositions['relay_station'];
    const b = s.poiPositions['dune_cache'];
    if (!a || !b) return;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (Math.hypot(px - mx, pz - mz) > 30) return;
    s.setFlag('toll_crew_seen');
    const friendly = (s.rep.skulls ?? 0) >= 25;
    s.addJournal('The toll road', [
      friendly
        ? 'Skulls colors at the relay-road bend — a nod, not a stop. The toll crew lets you pass. Word travels on this road; today it traveled kindly.'
        : 'Skulls colors at the relay-road bend: riders watching the stretch, counting what rolls through. Nobody stopped you. Not yet. The toll on this road isn\u2019t always money.',
    ]);
    s.addToast(friendly ? 'The Skulls toll crew waves you through.' : 'Skulls toll crew on this stretch — they\u2019re watching the road.');
  }

  /**
   * The siege loop (stage 7, item 7) — Lane 10's §3.7 state machine
   * over BaseExt, ticking at 1Hz:
   *   heat ≥30 → 'scouted' (a scout pair sniffs the perimeter at night)
   *   heat ≥60 → 'warning' (siege scheduled for the NEXT nightfall;
   *              if the player is away when it lands, the warning waits)
   *   nightfall + player near → 'siege': planSiegeWaves spawn through
   *              HuskManager.spawnSiegeWave, one wave at a time.
   *   all waves dead → survived: Lane 8's siege_survived XP event,
   *              §5.4 siegeWin morale, journal + toast.
   *   player death mid-siege → broken: siegeLoss morale, back to
   *              'scouted' (the surviving husks stay in the world).
   */
  private updateSiege(s: ReturnType<typeof useGameStore.getState>, night: boolean): void {
    const ext = s.baseExt;
    const state = ext.siegeState ?? 'calm';
    if (s.dead && !this.wasDeadSiege && state === 'siege') {
      this.siegePlan = null;
      s.setBaseExt({ siegeState: 'scouted', siegeNextMin: undefined });
      s.applyMoraleEvent('siegeLoss');
      s.addJournal('The siege broke', [
        'They came in the dark and the ground didn\u2019t hold. What matters now is who\u2019s still standing — and that the island knows the base can bleed.',
      ]);
      s.addToast('The siege broke the base.');
    }
    this.wasDeadSiege = s.dead;

    const home = s.claims.home;
    if (!home) {
      if (state !== 'calm') s.setBaseExt({ siegeState: 'calm', siegeNextMin: undefined });
      this.siegePlan = null;
      return;
    }
    const anchor = s.poiPositions[home.siteId]
      ?? (home.siteId === 'military_base' ? s.poiPositions['airbase'] : undefined);
    if (!anchor || !this.husks) return;
    const heat = computeHeat(home, s.survivors, s.daysElapsed, ext.localKillsNearBase ?? 0);
    if (ext.heat !== heat.heat) s.setBaseExt({ heat: heat.heat });
    const absNow = s.daysElapsed * 1440 + s.timeMinutes;
    const nextNightfall = (s.timeMinutes < 1080 ? s.daysElapsed : s.daysElapsed + 1) * 1440 + 1080;
    const siteName = poiName(home.siteId);

    if (state === 'calm' || state === 'scouted') {
      if (heat.tier === 'warning' || heat.tier === 'siege') {
        s.setBaseExt({ siegeState: 'warning', siegeNextMin: nextNightfall });
        s.addJournal(`Siege warning — ${siteName}`, [
          siegeForecast(heat.heat).note,
          'They\u2019ve counted the stockpile and the walls. Tomorrow night they come to collect — be home, be armed, or be gone.',
        ]);
        s.addToast(`Siege warning at ${siteName} — tomorrow night.`);
        return;
      }
      if (heat.tier === 'scout' && state === 'calm') {
        s.setBaseExt({ siegeState: 'scouted' });
        s.addJournal(`Scouts at ${siteName}`, [
          'Movement at the perimeter after dark — sniffing, counting. The base is being read. Bank less, wall more, or thin them out.',
        ]);
        s.addToast(`Scout activity at ${siteName}.`);
        return;
      }
      if (heat.tier === 'calm' && state === 'scouted') {
        s.setBaseExt({ siegeState: 'calm' });
        return;
      }
      // scouted + night: one scout pair per night sniffs the perimeter
      if (state === 'scouted' && night && this.scoutNight !== s.daysElapsed) {
        this.scoutNight = s.daysElapsed;
        this.husks.spawnSiegeWave(
          { wave: 0, count: 2, kinds: ['shambler', 'stalker'], siteId: home.siteId, x: anchor[0], z: anchor[1], target: 'gates' },
          (x, z) => this.groundY(x, z),
          { scout: true },
        );
      }
      return;
    }

    if (state === 'warning') {
      if (heat.tier !== 'warning' && heat.tier !== 'siege') {
        // the pressure bled off — stand down to whatever the heat says
        s.setBaseExt({ siegeState: heat.tier === 'scout' ? 'scouted' : 'calm', siegeNextMin: undefined });
        return;
      }
      if (absNow < (ext.siegeNextMin ?? nextNightfall)) return;
      const playerNear = Math.hypot(s.pos[0] - anchor[0], s.pos[2] - anchor[1]) <= 120;
      if (!playerNear) return; // the warning waits for its audience
      const waves = planSiegeWaves(siegeForecast(heat.heat), this.rng);
      if (waves.length === 0) {
        s.setBaseExt({ siegeState: 'scouted', siegeNextMin: undefined });
        return;
      }
      this.siegePlan = { siteId: home.siteId, waves, next: 0 };
      s.setBaseExt({ siegeState: 'siege' });
      s.addJournal(`Siege night — ${siteName}`, [
        'They\u2019re coming in waves, for the gates and the stores. Hold the ground until the last of them is down.',
      ]);
      s.addToast(`Siege at ${siteName} — they\u2019re coming.`);
      this.spawnNextSiegeWave(anchor);
      return;
    }

    // state === 'siege'
    if (!this.siegePlan || this.siegePlan.siteId !== home.siteId) {
      // loaded mid-siege (the plan is runtime-only): re-arm as a warning
      s.setBaseExt({ siegeState: 'warning', siegeNextMin: nextNightfall });
      s.addToast(`The siege at ${siteName} regroups — warning is out again.`);
      return;
    }
    const alive = this.husks.aliveInZone(`siege:${home.siteId}`);
    if (alive > 0) return;
    if (this.siegePlan.next < this.siegePlan.waves.length) {
      this.spawnNextSiegeWave(anchor);
      return;
    }
    // survived
    this.siegePlan = null;
    s.setBaseExt({
      siegeState: heat.tier === 'scout' || heat.tier === 'warning' || heat.tier === 'siege' ? 'scouted' : 'calm',
      siegeNextMin: undefined,
    });
    const ev = XP_EVENTS.siege_survived;
    s.addSkillXp(ev.skill, ev.xp);
    s.applyMoraleEvent('siegeWin');
    s.addJournal(`Siege survived — ${siteName}`, [
      'The last of them is down and the ground is still yours. The crew stands a little taller this morning.',
    ]);
    s.addToast(`${siteName} held. The siege is broken.`);
  }

  private spawnNextSiegeWave(anchor: [number, number]): void {
    const plan = this.siegePlan;
    if (!plan || !this.husks) return;
    const w = plan.waves[plan.next];
    if (!w) return;
    plan.next += 1;
    this.husks.spawnSiegeWave(
      { ...w, siteId: plan.siteId, x: anchor[0], z: anchor[1], target: 'gates' },
      (x, z) => this.groundY(x, z),
    );
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
    // siege heat (§3.7): kills near home feed tomorrow's pressure
    const home = s.claims.home;
    if (home) {
      const anchor = s.poiPositions[home.siteId]
        ?? (home.siteId === 'military_base' ? s.poiPositions['airbase'] : undefined);
      if (anchor && Math.hypot(h.group.position.x - anchor[0], h.group.position.z - anchor[1]) <= 100) {
        s.setBaseExt({ localKillsNearBase: (s.baseExt.localKillsNearBase ?? 0) + 1 });
      }
    }
    // the body stays where it fell — search it for zone + kind loot
    this.interact?.registerCorpse(h.id, h.group.position.x, h.group.position.z, h.zoneId, h.kind);
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
      case 'Digit4':
        input.hotbar = 4;
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
    // Order #5 forced entry: a locked container with no pick anywhere
    // in the carried forest can be SMASHED open — twice the time, and
    // the forced_entry noise class (45m, halved by Locksmith) when it
    // gives. (The pick check walks the forest: a pick nested in a pack
    // counts, same as the completion path always assumed.)
    const hasPick = walkCarried(s.inventory).some((i) => i.itemId === 'lockpick');
    const forced = !!def?.locked && !hasPick;
    if (forced) {
      s.addToast('Locked, and no pick — forcing it. This will be loud.');
    }
    const baseDur = def?.searchTime ?? (near.kind === 'corpse' ? 1 : 2);
    const dur = baseDur * searchDurationMult(s.perks) * (forced ? 2 : 1);
    this.searching = {
      id: near.id,
      label: near.label,
      t: 0,
      dur,
      x: this.player!.pos.x,
      z: this.player!.pos.z,
      hp: s.hp,
      alerted: (this.husks?.husks ?? []).some((h) => h.state === 'hunt' || h.state === 'attack'),
      forced,
    };
    return true;
  }

  // ------------------------------------------------------------------
  // vehicles
  // ------------------------------------------------------------------

  // onCarImpact DELETED (Ian's order, 2026-10-21 — vehicle collision
  // deleted completely): rigid-body impacts no longer cost condition,
  // blow tires, emit the crash noise class, or reset the clean-miles
  // streak. The coupled fields stay parked, not removed: v.condition
  // and v.tiresFlat still exist for the repair/dispatch systems and
  // the phone UI, collisionLossFactor stays as upgrade data, and the
  // 'vehicle_crash' noise class stays defined — none of them fire
  // from collisions anymore because there are none.

  private updateDriving(dt: number, s: ReturnType<typeof useGameStore.getState>, playerCtx: import('./Player').PlayerCtx): void {
    const v = this.driving;
    if (!v) return;
    const player = this.player!;
    const husks = this.husks!;
    const condBefore = v.condition;
    const posBefore = v.group.position.clone();
    // Piece 3: rigid-body step (Rapier raycast vehicle; kinematic
    // carSpec fallback inside CarPhysics if the WASM ever fails)
    this.carPhysics?.step(dt, {
      throttle: input.moveY,
      steer: input.moveX,
      handbrake: !!input.ascend,
      hasFuel: v.fuel > 0.05,
    }, v, (x, z) => this.driveGroundY(x, z));
    applyGlbVisuals(v);
    // engine voice: the powertrain's own numbers, every frame — the
    // oscillator params smooth themselves in the engine.
    if (this.carPhysics) {
      const cp = this.carPhysics;
      const vp = v.group.position;
      audioEngine.engineUpdate({
        rpm: cp.rpm,
        idleRpm: cp.idleRpm,
        redlineRpm: cp.redlineRpm,
        load: cp.throttleLoad,
        speedMps: cp.speed,
        surface: betaZoneAt(vp.x, vp.z),
      });
    }
    if (v.glb) {
      const lamp = this.isNight() ? 55 : 0;
      for (const l of v.glb.headLights) l.intensity = lamp;
    }
    // fuel burn follows engine load — a working engine drinks, an
    // idling one sips
    const load = Math.abs(input.moveY);
    if (load > 0.02 && v.fuel > 0) {
      const speedF = 0.35 + 0.65 * Math.min(1, Math.abs(v.speed) / 28);
      v.fuel = Math.max(0, v.fuel - dt * v.def.burnClass * (0.006 + 0.03 * load * speedF));
    }
    // driving noise + husk rams, from speed and proximity. Rams are
    // proximity combat, NOT physics collision (husks are not physics
    // bodies) — they survive the vehicle-collision deletion untouched
    const spd = Math.abs(v.speed);
    if (spd > 1.5) {
      // at speed: the def's drive radius (the class table's 55m for the
      // Stallion; the Shelby's pipe reads 58) scaled by how fast it's
      // actually moving
      const r = v.def.noiseDrive * Math.min(1, spd / 25);
      husks.emitNoise(v.group.position.x, v.group.position.z, r);
      this.animals?.emitNoise(v.group.position.x, v.group.position.z, r);
      s.setNoiseLevel(meterLevel(r));
    } else if (v.fuel > 0.05) {
      // Lane 11 wiring: a running engine at a standstill is still heard —
      // the idle class (30m). The 0.05 threshold matches the physics
      // hasFuel gate in the step call above.
      const r = noiseClassRadius('vehicle_idle');
      husks.emitNoise(v.group.position.x, v.group.position.z, r);
      this.animals?.emitNoise(v.group.position.x, v.group.position.z, r);
      s.setNoiseLevel(meterLevel(r));
    }
    this.ramT -= dt;
    if (spd > 4 && this.ramT <= 0) {
      this.ramT = 0.18;
      const fx = v.group.position.x + Math.sin(v.heading) * v.def.length * 0.55;
      const fz = v.group.position.z + Math.cos(v.heading) * v.def.length * 0.55;
      const killed = husks.damageInRadius(fx, fz, 1.9, 30 * ramDamageFactor(v.upgrades) * Math.min(1, spd / 12));
      if (killed > 0) {
        sfx.play('hit', { volume: 0.6 });
        this.requestHitstop(0.06);
      }
    }
    const pos = v.group.position;
    player.driveUpdate(dt, playerCtx, pos.x, pos.y, pos.z, v.def.length * 0.9 + 4, {
      kind: v.def.kind,
      id: v.def.id,
      length: v.def.length,
      width: v.def.width,
      heading: v.heading,
      // the seated figure rides the body's true orientation (Item 5)
      quat: v.group.quaternion,
      // the GLB's driver_seat marker anchor, when the model carries
      // one (the Prime + Sprinter do; the GT500 keeps proportions)
      ax: v.seatAnchor?.lx,
      az: v.seatAnchor?.lz,
    });
    // Driver XP: clean miles count. The streak used to reset on
    // collision condition loss; with vehicle collision deleted
    // (2026-10-21) condition no longer drops while driving, so the
    // streak simply accrues — the check stays for any future
    // in-drive condition change.
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
    s.setVehicle({
      uid: v.uid,
      name: v.def.name + (v.variant === 'fx' ? ' FX' : ''),
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
    // wave 3: a vehicle out on a crew dispatch is not here to drive
    const out = useGameStore.getState().dispatches.find(
      (d) => d.status === 'out' && d.vehicleDefId === v.def.id,
    );
    if (out) {
      useGameStore.getState().addToast(`The ${v.def.name} is out on a dispatch — check the Team app.`);
      return;
    }
    this.driving = v;
    // the one live body rebinds to the car being entered when it isn't
    // already that car's (per-def params + geometry ride along); the
    // car it leaves keeps its last synced transform as a parked visual
    if (this.carPhysics && this.carPhysics.boundDefId !== v.def.id) {
      this.carPhysics.spawnCar(v, v.upgrades, itemsWeightKg(v.storage));
    }
    this.carPhysics?.wake();
    this.wasFirstPerson = this.player!.firstPerson;
    // first person stays first person: driveUpdate renders the
    // driver's-eye view (V toggles back to chase in the seat)
    this.player!.camYaw = v.heading;
    const s = useGameStore.getState();
    s.setVehicle({
      uid: v.uid,
      name: v.def.name + (v.variant === 'fx' ? ' FX' : ''),
      speedKmh: 0,
      fuelPct: v.fuel / v.def.fuelMax,
      condPct: v.condition,
      storageUsedKg: itemsWeightKg(v.storage),
      storageCapKg: storageCapKg(v.def.storageKg, v.upgrades),
      tiresFlat: v.tiresFlat,
      upgrades: [...v.upgrades],
      kind: v.def.kind,
    });
    s.addToast(`Driving the ${v.def.name}. F to get out${v.fuel <= 0.05 ? ' — the tank is dry, find a fuel can.' : ''}`);
    sfx.play('ui', { volume: 0.5 });
    audioEngine.engineStart();
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
    audioEngine.engineStop();
    player.endDrive();
    player.forceFirstPerson(this.wasFirstPerson, this.camera!); // restore the pre-drive view mode
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
    const can = walkCarried(s.inventory).find((it) => it.itemId === 'fuel_can' && it.qty > 0);
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

  /** [R] at a tanker: pour a carried fuel can into the trailer's tank. */

  // ------------------------------------------------------------------
  // trailers, storage, freight — the vehicle & trailer wave
  // ------------------------------------------------------------------

  /** Ground for DRIVING: terrain + building floors. */
  private driveGroundY(x: number, z: number): number {
    return this.groundY(x, z);
  }

  /** Ground for WALKING: terrain + building floors, height-aware. */
  private dynGroundYRef(x: number, z: number, refY: number): number {
    return this.groundYRef(x, z, refY);
  }



  /** Park a loaded vehicle in its packed slot on its trailer's deck. */












  /** The F-key context menu: vehicle doors. */
  private contextAction(px: number, pz: number, _s: ReturnType<typeof useGameStore.getState>): { label: string; run: () => void } | null {
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
    return null;
  }


  /** [T] storage target: the nearest vehicle's storage in reach. */
  private openStorageNear(px: number, pz: number, s: ReturnType<typeof useGameStore.getState>): void {
    const v = this.vehicles.nearest(px, pz, STORAGE_RADIUS_M);
    if (v) s.openStorage('vehicle', v.uid, `${v.def.name} — trunk`);
    else s.addToast('Nothing with storage in reach.');
  }

  /** Inventory v2 NEARBY: vehicle storage + world containers within
   *  the interact system's own radii of the player (one source — the
   *  same ranges the world prompts use). The store's deck reads this
   *  through refreshNearby; assembly is containers.nearbyFromSources. */
  getNearbyStorage(): NearbyEntry[] {
    if (!this.player || !this.interact || !this.vehicles) return [];
    const p = this.player.pos;
    const vehicles = this.vehicles.vehicles.map((v) => ({
      uid: v.uid,
      label: `${v.def.name} — storage`,
      x: v.group.position.x,
      z: v.group.position.z,
      usedKg: itemsWeightKg(v.storage),
      capKg: storageCapKg(v.def.storageKg, v.upgrades),
    }));
    const containers = this.interact.containersWithin(p.x, p.z, INTERACT_RADIUS_M);
    return nearbyFromSources(p.x, p.z, vehicles, containers, STORAGE_RADIUS_M, INTERACT_RADIUS_M);
  }

  /** Run a world interactable's use() by id — the NEARBY list opens
   *  world containers through their normal search/open flow. */
  useInteractable(id: string): void {
    this.interact?.useById(id);
  }

  // ---------------------------------------------------------------
  // store-facing API: storage, repair, upgrades, modules, beacons
  // ---------------------------------------------------------------

  /** Every trailer's live state, for the save snapshot (v3). */

  private storageList(kind: 'vehicle' | 'trailer' | 'crate', uid: string): InvItem[] | null {
    // VEHICLE RESET: only the Mustang's trunk exists. Trailer/crate
    // storage kinds resolve to nothing (their owners are deleted).
    if (kind === 'vehicle') return this.vehicles.byId(uid)?.storage ?? null;
    return null;
  }

  private storageCap(kind: 'vehicle' | 'trailer' | 'crate', uid: string): number {
    if (kind === 'vehicle') {
      const v = this.vehicles.byId(uid);
      return v ? storageCapKg(v.def.storageKg, v.upgrades) : 0;
    }
    return 0;
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
    // spread, not a stripped copy: instance state (condition, mods, grid
    // placement) rides along and persists through the save passthrough
    else list.push({ ...item });
    return null;
  }

  /** Replace a stored stack wholesale (wave 3 grid drag write-back: same
   *  stack, new placement). Returns an error string or null. */
  storageSetItem(kind: 'vehicle' | 'trailer' | 'crate', uid: string, index: number, item: InvItem): string | null {
    const list = this.storageList(kind, uid);
    if (!list || index < 0 || index >= list.length) return 'That storage is gone.';
    if (list[index].itemId !== item.itemId || list[index].qty !== item.qty) return 'That stack changed.';
    list[index] = { ...item };
    return null;
  }

  /** Wave 3 dispatch outcomes: wear a vehicle down (condition loss, and a
   *  hard hit can blow a tire). Returns a flavor line or null if missing. */
  damageVehicle(uid: string, frac: number): string | null {
    const v = this.vehicles.byId(uid) ?? this.vehicles.vehicles.find((x) => x.def.id === uid);
    if (!v) return null;
    v.condition = Math.max(0.05, v.condition - frac);
    if (frac >= 0.2 && v.tiresFlat < 2) {
      v.tiresFlat += 1;
      return 'It limped home on a blown tire.';
    }
    return null;
  }

  /** Wave 3 Scout: real container census around a POI (Interact defs carry
   *  true positions; looted state comes from the world diff). */
  scoutPoi(poiId: string): { total: number; looted: number } | null {
    const pos = this.world?.poiPositions[poiId];
    if (!pos || !this.interact) return null;
    return this.interact.containersNear(pos[0], pos[1], 130);
  }

  storageTakeItem(kind: 'vehicle' | 'trailer' | 'crate', uid: string, index: number): InvItem | null {
    const list = this.storageList(kind, uid);
    if (!list || index < 0 || index >= list.length) return null;
    const [taken] = list.splice(index, 1);
    return { ...taken };
  }

  /** Repair one vehicle system. `capFrac` is the condition ceiling for
   *  this repair (Order #5 me_juryrig: field repairs cap at 0.6, 0.8
   *  with the perk; the store passes 1 at a workshop/garage). */
  applyRepair(uid: string, kind: 'tire' | 'engine' | 'battery' | 'scrap', capFrac = 1): string {
    const v = this.vehicles.byId(uid);
    if (!v) return 'Vehicle not found.';
    const capped = (msg: string) =>
      capFrac < 1 && v.condition >= capFrac - 1e-9
        ? `${msg} (Field repair limit — a workshop can finish her.)`
        : msg;
    if (kind === 'tire') {
      v.tiresFlat = Math.max(0, v.tiresFlat - 1);
      v.condition = Math.min(capFrac, v.condition + 0.03);
      return v.tiresFlat > 0 ? `One flat swapped — ${v.tiresFlat} to go.` : 'Fresh rubber all round. She rolls true again.';
    }
    if (kind === 'engine') {
      v.condition = Math.min(capFrac, v.condition + 0.35);
      return capped('Engine work done — timing, seals, the lot.');
    }
    if (kind === 'battery') {
      v.condition = Math.min(capFrac, v.condition + 0.25);
      return capped('Fresh battery in. She cranks strong.');
    }
    v.condition = Math.min(capFrac, v.condition + 0.12);
    return capped('Patched with scrap. It holds.');
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




  /** VEHICLE RESET: trailers are gone, so the snapshot carries none. */
  getTrailerStates(): TrailerSave[] {
    return [];
  }

  /** Parked with the trailers (VEHICLE RESET): buildouts no longer exist. */
  applyModule(_trailerUid: string, _moduleId: string): boolean {
    return false;
  }

  /** Parked with the trailers (VEHICLE RESET). */
  applyBeaconMode(_trailerUid: string, _mode: 'off' | 'sat' | 'horde'): string | null {
    return 'The beacon trailers are gone.';
  }

  /** Parked with the trailers (VEHICLE RESET): no beacon, no drops. */
  callSupplyDrop(_trailerUid: string): string {
    return 'Supply drops are offline — the beacon trailers are gone.';
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
      // gh_vanish: flashbangs blind in a +4m wider radius
      husks.stunInRadius(p.x, p.z, th.aoe + flashRadiusBonus(s.perks), th.blind);
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
    // Lane 11 wiring: a detonation is the explosion class (200m) — the
    // old 40m meant a grenade barely carried past the next street
    this.noiseAt(p.x, p.z, noiseClassRadius('explosion'));
    this.requestHitstop(0.08);
    sfx.play('hit', { volume: 1 });
  }

  /** Noise that doesn't come from the player — explosions, alarms. */
  private noiseAt(x: number, z: number, r: number): void {
    this.husks?.emitNoise(x, z, r);
    this.animals?.emitNoise(x, z, r);
    useGameStore.getState().setNoiseLevel(meterLevel(r));
  }

  private handleMouseDown(e: MouseEvent): void {
    const s = useGameStore.getState();
    if (s.screen !== 'game' || s.paused || s.dialogue != null || this.cutscene) return;
    if (document.pointerLockElement !== this.canvas) return;
    if (e.button === 0) input.attackHeld = true;
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
    if (e.button === 0) input.attackHeld = false;
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
