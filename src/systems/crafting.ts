// Crafting depth engine — SYSTEMS_SPEC §4 (Lane 7).
//
// v1 (shipped) crafting is instant via gameStore.craftRecipe. This module is
// the v2 layer the spec calls for, built WITHOUT touching items.ts or
// gameStore.ts:
//  - RECIPE_META overlays time / skill gates / station tiers / blueprint and
//    facility gates onto the shipped FieldRecipe data (keyed by recipe id).
//  - A pure timer engine runs station crafts on GAME time (absolute
//    minutes = daysElapsed*1440 + timeMinutes, the Game.ts clock pattern).
//    Jobs are interruptible by combat (progress banks, resumable) and
//    sleeping through a craft completes it — the SoD2 feel (§4.1).
//  - useCraftQueue is a small zustand store that drives the engine against
//    the game store (consume at start, grant + XP on completion).
//  - Skill gates FEATURE-DETECT Lane 8's substrate: if no skill level can
//    be read, gates are inert (craft allowed, gate reported as inert).
//    When the skills state is present (it already ships in gameStore),
//    gates enforce with no code change here.

import { create } from 'zustand';
import {
  FIELD_RECIPES,
  ITEMS,
  STATION_RECIPES,
  type FieldRecipe,
  type StationId,
} from '../data/items';
import type { SkillId } from '../data/skills';
import {
  hasTurretHost,
  reachableStationTier,
  type CraftStationId,
} from '../data/stations';
import { useGameStore, craftQueueBridge, claimsFromLegacyBase } from '../store/gameStore';
import { facilityPresenceAt, presenceContext } from './facilityPresence';
import { walkCarried } from '../store/containers';
import { craftTimeMult } from './perkEffects';
import { perkById } from '../data/skills';

// ---------------------------------------------------------------------------
// Recipe metadata overlay (§4.1 timers + §4.2/§6.1 gates)
// ---------------------------------------------------------------------------

export interface RecipeMeta {
  /** Game-time seconds the craft takes. 0 = instant (all field crafts). */
  timeSec: number;
  /** Skill gate (§6.1). T1 recipes have none; T2+ always has one. */
  skillReq?: { skill: SkillId; level: number };
  /** Station tier required (facility/world), default 1. Fabrication = 3. */
  stationTier?: number;
  /** Blueprint item that must be owned (gate only, never consumed). */
  blueprintId?: string;
  /** Order #5: a perk that must be owned (Master Fabricator's bench
   *  gun_parts). Enforced by checkCraft from CraftContext.perks. */
  perkReq?: string;
  /** Special facility requirement ('turret_host' = T3 Machine Shop / Garage). */
  facilityReq?: 'turret_host';
}

export const RECIPE_META: Record<string, RecipeMeta> = {
  // Field recipes: instant by design (§4.1 "Field craft stays instant").
  r_bandage: { timeSec: 0 },
  r_torch: { timeSec: 0 },
  r_fire_starter: { timeSec: 0 },
  r_flare: { timeSec: 0 },
  r_cooked_meat: { timeSec: 0 },
  r_rock_lure: { timeSec: 0 },
  r_produce_meal: { timeSec: 0 },
  // Weapons Bench
  r_reload_9mm: { timeSec: 60 },
  r_reload_shells: { timeSec: 60 },
  r_reload_9mm_t2: { timeSec: 90 },
  r_reload_shells_t2: { timeSec: 90 },
  r_bat: { timeSec: 120 },
  r_combat_knife: { timeSec: 180 },
  r_shin_guards: { timeSec: 240 },
  r_spear: { timeSec: 240 },
  r_reflex: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_suppressor: { timeSec: 600, skillReq: { skill: 'mechanics', level: 2 } },
  r_extmag: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_foregrip: { timeSec: 240 },
  r_laser: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_choke: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_flashlight: { timeSec: 240 },
  r_scope: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_reload_556: { timeSec: 90 },
  r_reload_rifle: { timeSec: 90 },
  r_bolts: { timeSec: 60 },
  // Bench firearms mirror the skill gates their recipe data declares
  // (items.ts skillReq) so the queue enforces what the data promises.
  r_revolver: { timeSec: 1200, skillReq: { skill: 'mechanics', level: 1 } },
  r_smg: { timeSec: 2400, skillReq: { skill: 'mechanics', level: 2 } },
  r_carbine: { timeSec: 3600, skillReq: { skill: 'mechanics', level: 3 } },
  // Chemistry Station
  r_medkit: { timeSec: 300, skillReq: { skill: 'medicine', level: 1 } },
  r_fuel_can: { timeSec: 240 },
  r_gunpowder: { timeSec: 300 },
  r_molotov: { timeSec: 180 },
  r_smoke_grenade: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_frag: { timeSec: 300, skillReq: { skill: 'mechanics', level: 1 } },
  r_flashbang: { timeSec: 240, skillReq: { skill: 'mechanics', level: 1 } },
  // Machine Shop
  r_tire: { timeSec: 900 },
  r_engine_part: { timeSec: 3600, stationTier: 3 },
  r_car_battery: { timeSec: 1200 },
  r_armor_plate: { timeSec: 2400, stationTier: 3 },
  r_circuit_board: { timeSec: 1200, stationTier: 3 },
  // Master Fabricator capstone (me_masterfab): gun_parts at any
  // Weapons Bench — the recipe data lives in STATION_RECIPES.
  r_gun_parts: { timeSec: 600, perkReq: 'me_masterfab' },
  // Turret (§4.3) — the only blueprint-gated craft in the game.
  r_turret: {
    timeSec: 10 * 3600,
    skillReq: { skill: 'mechanics', level: 5 },
    stationTier: 3,
    blueprintId: 'bp_turret',
    facilityReq: 'turret_host',
  },
};

const DEFAULT_META: RecipeMeta = { timeSec: 120 };

export function recipeMeta(recipe: FieldRecipe): RecipeMeta {
  return RECIPE_META[recipe.id] ?? (recipe.station ? DEFAULT_META : { timeSec: 0 });
}

export function recipeDurationMin(recipe: FieldRecipe): number {
  return recipeMeta(recipe).timeSec / 60;
}

/** Order #5: the duration a player actually waits — Tinkerer speeds
 *  every timed craft, Fabricator speeds Machine Shop fabrication.
 *  The queue starts jobs at this duration; the panel displays it. */
export function effectiveDurationMin(recipe: FieldRecipe, perks: readonly string[]): number {
  return recipeDurationMin(recipe) * craftTimeMult(perks, recipe.station);
}

/** True when the recipe completes instantly (v1 path in gameStore). */
export function isInstant(recipe: FieldRecipe): boolean {
  return recipeMeta(recipe).timeSec <= 0;
}

// ---------------------------------------------------------------------------
// Turret (§4.3) — recipe data lives here until Lane 6 moves it into items.ts
// ---------------------------------------------------------------------------

export interface TurretDef {
  facilityReq: 'garage_t3' | 'machine_shop_t3';
  blueprint: 'bp_turret';
  cost: { itemId: string; qty: number }[];
  buildHours: 10;
  stats: { damage: number; range: number; rpm: number; ammo: string; power: number; mag: number };
}

export const TURRET_DEF: TurretDef = {
  facilityReq: 'machine_shop_t3',
  blueprint: 'bp_turret',
  cost: [
    { itemId: 'gun_parts', qty: 6 },
    { itemId: 'circuit_board', qty: 2 },
    { itemId: 'engine_part', qty: 1 },
  ],
  buildHours: 10,
  stats: { damage: 20, range: 30, rpm: 120, ammo: 'ammo_9mm', power: 0.8, mag: 100 },
};

/** Virtual recipe for the turret — same FieldRecipe shape as items.ts data. */
export const TURRET_RECIPE: FieldRecipe = {
  id: 'r_turret',
  name: 'Turret',
  station: 'industrial',
  components: TURRET_DEF.cost,
  resultId: 'turret',
  resultQty: 1,
};

/**
 * Ghost contract for Lane 10's baseGhosts: a turret deploys as a prefab
 * ghost inside the claim radius (validate with insideAnyClaim from
 * data/stations), draws `powerKw` from the base budget, and feeds from the
 * stockpile ammo below.
 */
export const TURRET_GHOST_SPEC = {
  itemId: 'turret',
  footprintRadiusM: 0.9,
  powerKw: TURRET_DEF.stats.power,
  ammoItemId: TURRET_DEF.stats.ammo,
  magSize: TURRET_DEF.stats.mag,
  rangeM: TURRET_DEF.stats.range,
} as const;

/** Every recipe the crafting UI/engine knows: shipped data + lane virtuals. */
export const ALL_RECIPES: Record<string, FieldRecipe> = {
  ...FIELD_RECIPES,
  ...STATION_RECIPES,
  [TURRET_RECIPE.id]: TURRET_RECIPE,
};

export function getRecipe(recipeId: string): FieldRecipe | undefined {
  return ALL_RECIPES[recipeId];
}

// ---------------------------------------------------------------------------
// Skill-gate feature detection (Lane 8 substrate)
// ---------------------------------------------------------------------------

/** Returns the player's skill level, or undefined when unreadable. */
export type SkillLevelProvider = (skill: SkillId) => number | undefined;

/**
 * Reads Lane 8's skill state from the game store when present. Older saves
 * or a pre-skills build return undefined → gates go inert (see checkCraft).
 */
export const storeSkillLevel: SkillLevelProvider = (skill) => {
  const s = useGameStore.getState() as unknown as {
    skills?: Record<string, { level: number } | undefined>;
  };
  const st = s.skills?.[skill];
  return st ? st.level : undefined;
};

// ---------------------------------------------------------------------------
// Craft gate evaluation (pure)
// ---------------------------------------------------------------------------

export interface CraftContext {
  countItem: (itemId: string) => number;
  /** World station the player stands at, if any. */
  nearStation: StationId | null;
  /** Facility-hosted station context (base crafting), if any. */
  facilityStation?: CraftStationId | null;
  /** Best tier reachable for the recipe's station (see data/stations). */
  nearStationTier: number;
  /** Host ids (FACILITY_STATION_HOSTS space) of the base the player is
   *  standing in — ORDER #4 C5 presence semantics: a base across the
   *  island contributes nothing. Empty away from any claimed base. */
  facilities: readonly string[];
  /** Name of the base the player is standing in, if any (C5) — used
   *  only to make gate reasons say where the player needs to be. */
  atBaseName?: string | null;
  skillLevel: SkillLevelProvider;
  /** Order #5: owned perks — the perk gate (Master Fabricator) and the
   *  turret blueprint waiver read these. Absent = no perks. */
  perks?: readonly string[];
}

export interface CraftCheck {
  ok: boolean;
  missing: { itemId: string; have: number; need: number }[];
  stationOk: boolean;
  tierOk: boolean;
  skillOk: boolean;
  /** Order #5: the Master-Fabricator-style perk gate, when declared. */
  perkOk: boolean;
  /** The skill gate as evaluated; `inert` = substrate absent, gate waived. */
  skillGate: { skill: SkillId; need: number; have: number | null; inert: boolean } | null;
  blueprintOk: boolean;
  facilityOk: boolean;
  /** False until Lane 6 lands the result item's data. */
  resultKnown: boolean;
  reasons: string[];
}

export function checkCraft(recipe: FieldRecipe, ctx: CraftContext): CraftCheck {
  const meta = recipeMeta(recipe);
  const reasons: string[] = [];

  const missing = recipe.components
    .map((c) => ({ itemId: c.itemId, have: ctx.countItem(c.itemId), need: c.qty }))
    .filter((m) => m.have < m.need);
  if (missing.length > 0) {
    reasons.push(
      'Missing ' +
        missing.map((m) => `${m.need - m.have}× ${ITEMS[m.itemId]?.name ?? m.itemId}`).join(', ') +
        '.',
    );
  }

  const presentStation = ctx.nearStation ?? ctx.facilityStation ?? null;
  const stationOk = !recipe.station || presentStation === recipe.station;
  if (!stationOk && recipe.station) {
    reasons.push(`Needs a ${recipe.station === 'industrial' ? 'Machine Shop' : recipe.station}.`);
  }

  const tierNeed = meta.stationTier ?? 1;
  const tierOk = !recipe.station || ctx.nearStationTier >= tierNeed;
  if (stationOk && !tierOk) reasons.push(`Needs a tier ${tierNeed} station.`);

  // Order #5 gate unification: the enforced gate is RECIPE_META's,
  // falling back to the recipe data's own skillReq — and the level is
  // read through the caller's provider over the SAME skills map the
  // phone's tree displays (storeSkillLevel reads gameStore.skills).
  const gateReq = meta.skillReq ?? (recipe as { skillReq?: { skill: SkillId; level: number } }).skillReq;
  let skillGate: CraftCheck['skillGate'] = null;
  let skillOk = true;
  if (gateReq) {
    const have = ctx.skillLevel(gateReq.skill);
    const inert = have === undefined;
    skillOk = inert || have >= gateReq.level;
    skillGate = { skill: gateReq.skill, need: gateReq.level, have: have ?? null, inert };
    if (!skillOk) {
      reasons.push(`Needs ${gateReq.skill} ${gateReq.level} (you: ${have}).`);
    }
  }

  const perks = ctx.perks ?? [];
  const perkOk = !meta.perkReq || perks.includes(meta.perkReq);
  if (!perkOk) {
    reasons.push(`Needs the ${perkById(meta.perkReq!)?.name ?? meta.perkReq} perk.`);
  }

  // me_masterfab: the turret needs no blueprint for a Master Fabricator.
  const blueprintOk =
    !meta.blueprintId ||
    ctx.countItem(meta.blueprintId) > 0 ||
    (recipe.id === 'r_turret' && perks.includes('me_masterfab'));
  if (!blueprintOk) reasons.push('Needs the blueprint (loot: military armory, convoy cargo).');

  const facilityOk = meta.facilityReq !== 'turret_host' || hasTurretHost(ctx.facilities);
  if (!facilityOk) {
    reasons.push(
      ctx.atBaseName
        ? `Needs a T3 Machine Shop or Garage at ${ctx.atBaseName} — not built here.`
        : 'Needs a T3 Machine Shop or Garage facility at your base — and you have to be standing there.',
    );
  }

  const resultKnown = ITEMS[recipe.resultId] !== undefined;
  if (!resultKnown) reasons.push('Schematics pending — item data not in the world yet.');

  return {
    ok:
      missing.length === 0 &&
      stationOk &&
      tierOk &&
      skillOk &&
      perkOk &&
      blueprintOk &&
      facilityOk &&
      resultKnown,
    missing,
    stationOk,
    tierOk,
    skillOk,
    perkOk,
    skillGate,
    blueprintOk,
    facilityOk,
    resultKnown,
    reasons,
  };
}

/** Efficient Hands parity with gameStore.craftRecipe (pure; roll injected). */
export function efficientHandsRefund(
  recipe: FieldRecipe,
  perks: readonly string[],
  roll: number,
): string | null {
  if (!perks.includes('me_efficient') || recipe.components.length === 0) return null;
  return roll < 0.2 ? recipe.components[0].itemId : null;
}

/** Station-craft XP per §6.1: 6 mechanics, +4 when the recipe's gate is ≥3. */
export function craftXpAward(recipe: FieldRecipe): number {
  const gate = recipeMeta(recipe).skillReq;
  return 6 + (gate && gate.level >= 3 ? 4 : 0);
}

// ---------------------------------------------------------------------------
// Timer engine (pure, game-time minutes)
// ---------------------------------------------------------------------------

export interface CraftJob {
  uid: string;
  recipeId: string;
  /** Absolute game minute the current run segment started. */
  startedAtMin: number;
  /** Progress banked before this segment (interrupt/resume), in minutes. */
  bankedMin: number;
  durationMin: number;
  status: 'running' | 'interrupted';
}

export function startJob(recipeId: string, durationMin: number, nowMin: number, uid: string): CraftJob {
  return { uid, recipeId, startedAtMin: nowMin, bankedMin: 0, durationMin, status: 'running' };
}

export function jobElapsedMin(job: CraftJob, nowMin: number): number {
  const live = job.status === 'running' ? Math.max(0, nowMin - job.startedAtMin) : 0;
  return Math.min(job.durationMin, job.bankedMin + live);
}

export function jobProgress(job: CraftJob, nowMin: number): number {
  if (job.durationMin <= 0) return 1;
  return jobElapsedMin(job, nowMin) / job.durationMin;
}

export function isJobDone(job: CraftJob, nowMin: number): boolean {
  return jobElapsedMin(job, nowMin) >= job.durationMin;
}

/** Combat interrupt: bank progress and freeze. Resuming loses nothing. */
export function interruptJob(job: CraftJob, nowMin: number): CraftJob {
  if (job.status !== 'running') return job;
  return { ...job, bankedMin: jobElapsedMin(job, nowMin), status: 'interrupted' };
}

export function resumeJob(job: CraftJob, nowMin: number): CraftJob {
  if (job.status !== 'interrupted') return job;
  return { ...job, startedAtMin: nowMin, status: 'running' };
}

export function tickJobs(
  jobs: readonly CraftJob[],
  nowMin: number,
): { active: CraftJob[]; completed: CraftJob[] } {
  const active: CraftJob[] = [];
  const completed: CraftJob[] = [];
  for (const job of jobs) {
    (isJobDone(job, nowMin) ? completed : active).push(job);
  }
  return { active, completed };
}

/** Human duration for the UI: game-time, e.g. "45s", "12m", "1.5h", "10h". */
export function formatDurationMin(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Queue store — drives the engine against the game store
// ---------------------------------------------------------------------------

/** Absolute game minutes — the Game.ts clock pattern. */
export function nowGameMin(): number {
  const s = useGameStore.getState();
  return s.daysElapsed * 1440 + s.timeMinutes;
}

function consumeComponents(recipe: FieldRecipe): boolean {
  const s = useGameStore.getState();
  for (const c of recipe.components) {
    if (s.countItem(c.itemId) < c.qty) return false;
  }
  for (const c of recipe.components) {
    let left = c.qty;
    while (left > 0) {
      // Carried forest, not just the top level: components nested in a
      // worn pack's contents count toward the craft (checkCraft counts
      // them via countItem) — consuming only s.inventory here made the
      // queue refuse/under-consume exactly those crafts (Order #4 C1).
      // Same reverse-walk the instant path (gameStore.craftRecipe) uses.
      const it = [...walkCarried(s.inventory)].reverse().find((i) => i.itemId === c.itemId);
      if (!it) break;
      const take = Math.min(it.qty, left);
      s.removeItem(it.uid, take);
      left -= take;
    }
  }
  return true;
}

function refundComponents(recipe: FieldRecipe): void {
  const s = useGameStore.getState();
  for (const c of recipe.components) s.addItem(c.itemId, c.qty, true);
}

/**
 * ORDER #4 C5 — execution-time presence enforcement. The caller's ctx
 * is a UI snapshot; the queue re-derives every world-derived field
 * (world-station mirror, base presence, hosted tiers) from live store
 * state before gating, so a stale or hand-built ctx cannot start a
 * facility craft from outside the base ring — the same lesson as
 * order #5's instant-craft gate hole. Caller-owned fields (countItem,
 * skillLevel, perks) pass through untouched.
 */
export function liveCraftContext(recipe: FieldRecipe, ctx: CraftContext): CraftContext {
  const s = useGameStore.getState();
  const claims = s.claims.home || !s.base
    ? s.claims
    : { home: claimsFromLegacyBase(s.base).home, outposts: s.claims.outposts };
  const presence = facilityPresenceAt(claims, s.poiPositions, s.pos[0], s.pos[2]);
  const station = (recipe.station ?? null) as CraftStationId | null;
  const pc = presenceContext(presence, station);
  return {
    ...ctx,
    nearStation: s.nearStation,
    facilityStation: pc.facilityStation,
    nearStationTier: station
      ? reachableStationTier(station, {
          atWorldStation: s.nearStation === station,
          facilities: pc.facilityIds,
        })
      : ctx.nearStationTier,
    facilities: pc.facilityIds,
    atBaseName: presence?.siteName ?? null,
  };
}

let jobSeq = 0;

export interface CraftQueueState {
  jobs: CraftJob[];
  /** Start a timed craft. Returns a refusal reason, or null on success. */
  enqueue: (recipeId: string, ctx: CraftContext) => string | null;
  /** Cancel a job; components are refunded in full. */
  cancel: (uid: string) => void;
  resume: (uid: string) => void;
  /** Combat hook: freeze every running job (progress banks). */
  interruptAll: () => void;
  /** Advance the queue to the store clock; grant finished crafts. */
  tick: () => void;
}

export const useCraftQueue = create<CraftQueueState>()((set, get) => ({
  jobs: [],

  enqueue: (recipeId, ctx) => {
    const recipe = getRecipe(recipeId);
    if (!recipe) return 'Unknown recipe.';
    if (isInstant(recipe)) return 'Instant recipe — use the regular craft action.';
    const check = checkCraft(recipe, liveCraftContext(recipe, ctx));
    if (!check.ok) return check.reasons[0] ?? 'Cannot craft that yet.';
    if (!consumeComponents(recipe)) return 'Missing components.';
    const uid = `job_${++jobSeq}_${recipeId}`;
    // Order #5: Tinkerer / Fabricator shorten the actual job duration.
    const job = startJob(recipeId, effectiveDurationMin(recipe, ctx.perks ?? []), nowGameMin(), uid);
    set({ jobs: [...get().jobs, job] });
    useGameStore.getState().addToast(`Started ${recipe.name} — ${formatDurationMin(job.durationMin)}.`);
    return null;
  },

  cancel: (uid) => {
    const job = get().jobs.find((j) => j.uid === uid);
    if (!job) return;
    const recipe = getRecipe(job.recipeId);
    if (recipe) refundComponents(recipe);
    set({ jobs: get().jobs.filter((j) => j.uid !== uid) });
  },

  resume: (uid) => {
    const now = nowGameMin();
    set({ jobs: get().jobs.map((j) => (j.uid === uid ? resumeJob(j, now) : j)) });
    get().tick();
  },

  interruptAll: () => {
    const now = nowGameMin();
    set({ jobs: get().jobs.map((j) => interruptJob(j, now)) });
  },

  tick: () => {
    const now = nowGameMin();
    const { active, completed } = tickJobs(get().jobs, now);
    if (completed.length === 0) return;
    const s = useGameStore.getState();
    const undelivered: CraftJob[] = [];
    for (const job of completed) {
      const recipe = getRecipe(job.recipeId);
      if (!recipe) continue;
      if (!s.addItem(recipe.resultId, recipe.resultQty, true)) {
        // Pack is full: hold the finished job at 100% and retry next tick.
        undelivered.push({ ...job, bankedMin: job.durationMin, status: 'interrupted' });
        continue;
      }
      s.addToast(
        `Crafted ${recipe.resultQty > 1 ? `${recipe.resultQty}× ` : ''}${ITEMS[recipe.resultId]?.name ?? recipe.resultId}.`,
      );
      const cur = useGameStore.getState();
      useGameStore.setState({
        dayStats: { ...cur.dayStats, crafts: cur.dayStats.crafts + 1 },
      });
      if (typeof s.addSkillXp === 'function') s.addSkillXp('mechanics', craftXpAward(recipe));
      const refund = efficientHandsRefund(recipe, s.perks, Math.random());
      if (refund) {
        s.addItem(refund, 1, true);
        s.addToast('Efficient hands — one component came back.');
      }
    }
    set({ jobs: [...active, ...undelivered] });
  },
}));

// ---------------------------------------------------------------------------
// Merge wiring — persistence bridge registration (Lane 5 field contract).
// gameStore must not import this module (it would close a cycle), so the
// queue registers itself here: saves harvest the live jobs bridge-first,
// loads and new games push the restored/cleared array back through write.
// ---------------------------------------------------------------------------
craftQueueBridge.read = () => useCraftQueue.getState().jobs;
craftQueueBridge.write = (jobs) => useCraftQueue.setState({ jobs: [...jobs] });
