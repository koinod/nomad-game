// Game.ts — engine orchestrator. Owns the renderer, loop, and all subsystems.
// Public API matches INTERFACES.md exactly.

import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { DifficultyId, SaveSnapshot, WorldDiff } from '../store/types';
import { DIFFICULTIES } from '../store/types';
import { QUESTS } from '../data/quests';
import { input, resetEdgeTriggers } from './input';
import { World, heightAt, biomeAt, initTerrainField } from './World';
import { Player } from './Player';
import { HuskManager } from './Husks';
import type { Husk, SpawnZone } from './Husks';
import { InteractSystem, buildContainerDefs } from './Interact';
import { AnimalManager } from './Animals';
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

    // register POIs (contract)
    useGameStore.getState().setPoiPositions(this.world.poiPositions);

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
    this.husks.spawnInitial(this.deadHusks, (x, z) => heightAt(x, z), this.isNight());

    // wildlife: deer + rabbits, huntable for raw meat
    this.animals = new AnimalManager(this.scene, opts.seed);
    this.animals.spawnInitial((x, z) => heightAt(x, z));

    // interactables
    const resourceMult = DIFFICULTIES[s0.difficulty].resourceMult;
    this.interact = new InteractSystem(
      {
        resourceMult,
        rng: this.rng,
        groundY: (x, z) => heightAt(x, z),
        scene: this.scene,
        isLooted: (id) => this.looted.has(id),
        markLooted: (id) => { this.looted.add(id); },
        isCleared: (id) => this.cleared.has(id),
        markCleared: (id) => { this.cleared.add(id); },
        setLastSafe: (x, z) => { this.lastSafe = [x, z]; },
        setCamp: (id) => { this.lastCampId = id; },
      },
      this.world.poiPositions,
      buildContainerDefs(this.world.poiPositions),
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
      if (s.phoneOpen) s.closePhone();
      else {
        s.openPhone();
        // opening the phone without freeing the mouse left the UI unclickable
        if (useGameStore.getState().phoneOpen && document.pointerLockElement) {
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
      s.advanceTime(this.timeT);
      this.timeT = 0;
    }

    // encumbrance gates sprint + slows movement
    const tier = encumbranceTier(
      totalWeightKg(s.inventory),
      carryLimitKg(s.equipped, s.inventory, s.difficulty),
    );
    const speedMul = tier === 'ok' ? 1 : tier === 'heavy' ? 0.75 : 0.55;

    player.update(dt, {
      groundY: (x, z) => heightAt(x, z),
      sprintAllowed: tier === 'ok',
      speedMul,
      husks,
      animals: this.animals!,
      emitNoise: (x, z, r) => {
        husks.emitNoise(x, z, r);
        this.animals?.emitNoise(x, z, r);
      },
      onAnimalKill: (kill) => {
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
    });
    this.world?.updateShadowTarget(player.pos.x, player.pos.z);

    const night = this.isNight();
    husks.update(
      dt,
      {
        playerPos: player.pos,
        isNight: night,
        groundY: (x, z) => heightAt(x, z),
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

    // interact prompt (E within 3m)
    const near = this.interact!.nearest(player.pos.x, player.pos.z, 3);
    s.setInteractPrompt(near ? `[E] ${near.label}` : null);
    if (input.interact && near) {
      near.use();
      // refresh prompt (e.g. container now looted)
      const again = this.interact!.nearest(player.pos.x, player.pos.z, 3);
      s.setInteractPrompt(again ? `[E] ${again.label}` : null);
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
        input.interact = true; // tap: interact (E to open crates stays)
        input.leanRight = true; // held: lean right
        break;
      case 'KeyQ':
        input.leanLeft = true; // held: lean left
        break;
      case 'KeyF':
        input.attackMelee = true;
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

  private handleMouseDown(e: MouseEvent): void {
    const s = useGameStore.getState();
    if (s.screen !== 'game' || s.paused || s.dialogue != null || this.cutscene) return;
    if (document.pointerLockElement !== this.canvas) return;
    if (e.button === 0) input.attackMelee = true;
    else if (e.button === 2) {
      // right click: block with a melee weapon, fire with a ranged one
      const hasMelee = s.equipped.melee != null;
      if (hasMelee) input.blocking = true;
      else input.attackRanged = true;
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
