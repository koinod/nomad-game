// Order #5 Phase B: store-level wiring pins — the perk derivations in
// systems/perkEffects.ts actually change live store behavior (damage,
// second wind, survival XP), not just pure math.
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import { input } from '../game/input';
import { FIELD_RECIPES, STATION_RECIPES } from '../data/items';
import {
  RECIPE_META, checkCraft, effectiveDurationMin, getRecipe, storeSkillLevel,
  useCraftQueue, type CraftContext,
} from '../systems/crafting';
import { xpToNext } from '../data/skills';

const S = () => useGameStore.getState();

function reset(partial: Record<string, unknown> = {}) {
  useGameStore.setState({
    inventory: [], equipped: emptyEquipped(), hp: 100, maxHp: 100,
    screen: 'game', dead: false, perks: [], perkPoints: 0,
    secondWindDay: -1, daysElapsed: 0, difficulty: 'survivor',
    vehicle: null, toasts: [],
    dayStats: { kills: 0, crafts: 0, pickups: 0 }, journal: [],
    skills: {
      combat: { level: 0, xp: 0 }, mechanics: { level: 0, xp: 0 },
      medicine: { level: 0, xp: 0 }, stealth: { level: 0, xp: 0 },
      driver: { level: 0, xp: 0 }, scavenging: { level: 0, xp: 0 },
      leadership: { level: 0, xp: 0 },
    },
    ...partial,
  } as never);
  input.blocking = false;
}

beforeEach(() => reset());

describe('damagePlayer — block perks', () => {
  it('base block stops 75% of a husk hit', () => {
    input.blocking = true;
    S().damagePlayer(40, 'husk');
    expect(S().hp).toBeCloseTo(90); // 40 × 0.25
  });

  it('br_blocker deepens the block to 85% stopped', () => {
    reset({ perks: ['br_blocker'] });
    input.blocking = true;
    S().damagePlayer(40, 'husk');
    expect(S().hp).toBeCloseTo(94); // 40 × 0.15
  });

  it('a brute hit (blockBreak) ignores a normal block entirely', () => {
    input.blocking = true;
    S().damagePlayer(40, 'husk', { blockBreak: true });
    expect(S().hp).toBeCloseTo(60);
  });

  it('br_juggernaut holds the block against a brute', () => {
    reset({ perks: ['br_juggernaut'] });
    input.blocking = true;
    S().damagePlayer(40, 'husk', { blockBreak: true });
    expect(S().hp).toBeCloseTo(90); // blocked normally: 40 × 0.25
  });

  it('unblocked hits are untouched by the block perks', () => {
    reset({ perks: ['br_blocker', 'br_juggernaut'] });
    S().damagePlayer(40, 'husk', { blockBreak: true });
    expect(S().hp).toBeCloseTo(60);
  });
});

describe('damagePlayer — br_secondwind', () => {
  it('a lethal hit leaves you at 1 HP, once per day', () => {
    reset({ perks: ['br_secondwind'], hp: 30 });
    S().damagePlayer(100, 'husk');
    expect(S().hp).toBe(1);
    expect(S().dead).toBe(false);
    expect(S().secondWindDay).toBe(0);
    // second lethal hit the same day: no save left
    S().damagePlayer(100, 'husk');
    expect(S().hp).toBe(0);
    expect(S().dead).toBe(true);
  });

  it('the save re-arms on a new day', () => {
    reset({ perks: ['br_secondwind'], hp: 30, secondWindDay: 0, daysElapsed: 1 });
    S().damagePlayer(100, 'husk');
    expect(S().hp).toBe(1);
    expect(S().secondWindDay).toBe(1);
  });

  it('without the perk a lethal hit kills', () => {
    reset({ hp: 30 });
    S().damagePlayer(100, 'husk');
    expect(S().dead).toBe(true);
  });
});

describe('disassembly — Salvager / Scrounger at the bench', () => {
  function benchWith(perks: string[]) {
    reset({
      perks,
      nearStation: 'workbench',
      inventory: [{ uid: 'w1', itemId: 'pistol', qty: 1 }],
    });
  }

  it('base yields for a pistol: 2 gun_parts, 1 scrap', () => {
    benchWith([]);
    S().disassemble('w1');
    expect(S().countItem('gun_parts')).toBe(2);
    expect(S().countItem('scrap')).toBe(1);
  });

  it('sc_salvager adds +1 to the first material (gun_parts 3)', () => {
    benchWith(['sc_salvager']);
    S().disassemble('w1');
    expect(S().countItem('gun_parts')).toBe(3);
    expect(S().countItem('scrap')).toBe(1);
  });

  it('me_scrounger adds +1 gun_parts on top', () => {
    benchWith(['sc_salvager', 'me_scrounger']);
    S().disassemble('w1');
    expect(S().countItem('gun_parts')).toBe(4);
  });
});

describe('skill gates — one state, every path', () => {
  const carbineComponents = [
    { uid: 'c1', itemId: 'gun_parts', qty: 4 },
    { uid: 'c2', itemId: 'scrap', qty: 6 },
    { uid: 'c3', itemId: 'wire', qty: 3 },
  ];

  function ctxFor(bag: Record<string, number>): CraftContext {
    return {
      countItem: (id) => bag[id] ?? 0,
      nearStation: 'workbench',
      nearStationTier: 1,
      facilities: [],
      skillLevel: storeSkillLevel,
      perks: S().perks,
    };
  }

  it('the two gate declarations never disagree where both declare', () => {
    for (const r of [...Object.values(FIELD_RECIPES), ...Object.values(STATION_RECIPES)]) {
      const meta = RECIPE_META[r.id];
      if (r.skillReq && meta?.skillReq) {
        expect(meta.skillReq, r.id).toEqual(r.skillReq);
      }
    }
  });

  it('queue path (checkCraft) refuses r_carbine at Mechanics 2, allows at 3 — reading store skills', () => {
    reset({ skills: { ...S().skills, mechanics: { level: 2, xp: 0 } } });
    const bag = { gun_parts: 4, scrap: 6, wire: 3 };
    const denied = checkCraft(STATION_RECIPES.r_carbine, ctxFor(bag));
    expect(denied.skillOk).toBe(false);
    expect(denied.ok).toBe(false);
    reset({ skills: { ...S().skills, mechanics: { level: 3, xp: 0 } } });
    const allowed = checkCraft(STATION_RECIPES.r_carbine, ctxFor(bag));
    expect(allowed.skillOk).toBe(true);
    expect(allowed.ok).toBe(true);
  });

  it('instant path (craftRecipe) enforces the same gate from the same skills map', () => {
    // r_smoke_grenade is instant-reachable through craftRecipe data-wise
    // only if timed routing is bypassed; use a gated recipe directly:
    // r_revolver (Mechanics 1) with full components at the bench.
    reset({
      nearStation: 'workbench',
      inventory: [
        { uid: 'c1', itemId: 'gun_parts', qty: 2 },
        { uid: 'c2', itemId: 'scrap', qty: 3 },
      ],
    });
    S().craftRecipe('r_revolver');
    expect(S().countItem('revolver')).toBe(0); // refused at Mechanics 0
    expect(S().countItem('gun_parts')).toBe(2); // nothing consumed
    S().addSkillXp('mechanics', xpToNext(0)); // → Mechanics 1
    expect(S().skills.mechanics.level).toBe(1);
    S().craftRecipe('r_revolver');
    expect(S().countItem('revolver')).toBe(1);
    void carbineComponents;
  });
});

describe('Master Fabricator — gun_parts recipe + turret blueprint waiver', () => {
  function ctxFor(bag: Record<string, number>, perks: string[]): CraftContext {
    return {
      countItem: (id) => bag[id] ?? 0,
      nearStation: 'workbench',
      nearStationTier: 1,
      facilities: [],
      skillLevel: () => 10,
      perks,
    };
  }

  it('r_gun_parts exists as a timed workbench recipe', () => {
    const r = getRecipe('r_gun_parts');
    expect(r).toBeDefined();
    expect(r!.station).toBe('workbench');
    expect(r!.resultId).toBe('gun_parts');
  });

  it('the perk gate refuses without me_masterfab and passes with it', () => {
    const r = getRecipe('r_gun_parts')!;
    const bag = { scrap: 3, wire: 1 };
    const denied = checkCraft(r, ctxFor(bag, []));
    expect(denied.perkOk).toBe(false);
    expect(denied.ok).toBe(false);
    const allowed = checkCraft(r, ctxFor(bag, ['me_masterfab']));
    expect(allowed.perkOk).toBe(true);
    expect(allowed.ok).toBe(true);
  });

  it('the turret needs its blueprint — unless you are a Master Fabricator', () => {
    const turret = getRecipe('r_turret')!;
    const bag: Record<string, number> = { gun_parts: 6, circuit_board: 2, engine_part: 1 };
    const base: CraftContext = {
      countItem: (id) => bag[id] ?? 0,
      nearStation: 'industrial',
      nearStationTier: 3,
      facilities: ['machine_shop'],
      skillLevel: () => 10,
      perks: [],
    };
    expect(checkCraft(turret, base).blueprintOk).toBe(false);
    expect(checkCraft(turret, { ...base, perks: ['me_masterfab'] }).blueprintOk).toBe(true);
    expect(checkCraft(turret, { ...base, countItem: (id) => (id === 'bp_turret' ? 1 : bag[id] ?? 0) }).blueprintOk).toBe(true);
  });
});

describe('craft durations — Tinkerer / Fabricator reach the queue', () => {
  it('effectiveDurationMin scales the base duration', () => {
    const suppressor = STATION_RECIPES.r_suppressor; // 600s = 10m
    expect(effectiveDurationMin(suppressor, [])).toBe(10);
    expect(effectiveDurationMin(suppressor, ['me_tinkerer'])).toBeCloseTo(8);
    const enginePart = STATION_RECIPES.r_engine_part; // industrial, 3600s = 60m
    expect(effectiveDurationMin(enginePart, ['me_fabricator'])).toBeCloseTo(36);
    expect(effectiveDurationMin(enginePart, ['me_tinkerer', 'me_fabricator'])).toBeCloseTo(28.8);
  });

  it('an enqueued job carries the shortened duration', () => {
    reset({
      perks: ['me_tinkerer'],
      inventory: [{ uid: 'g1', itemId: 'gun_parts', qty: 3 }],
    });
    useCraftQueue.setState({ jobs: [] });
    const refusal = useCraftQueue.getState().enqueue('r_suppressor', {
      countItem: (id) => (id === 'gun_parts' ? 3 : 0),
      nearStation: 'workbench',
      nearStationTier: 1,
      facilities: [],
      skillLevel: () => 10,
      perks: ['me_tinkerer'],
    });
    expect(refusal).toBeNull();
    const jobs = useCraftQueue.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].durationMin).toBeCloseTo(8);
    useCraftQueue.setState({ jobs: [] });
  });
});

describe('advanceDay — day_survived XP', () => {
  it('a day rollover pays scavenging XP from the event table', () => {
    const before = S().skills.scavenging.xp;
    S().advanceDay();
    expect(S().daysElapsed).toBe(1);
    expect(S().skills.scavenging.xp).toBe(before + 8);
  });
});
