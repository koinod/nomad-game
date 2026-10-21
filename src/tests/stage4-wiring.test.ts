// Stage 4 wiring tests (merge train): Lane 9 code wiring at store level.
// - 2a: STARTING_REP / LEGACY_REP_ALIAS are single-sourced from
//   data/factions (the store re-exports the canonical objects; behavior
//   pinned by the Lane 5 suites, identity pinned here).
// - 2c: the Enclave radio burst (worldWiring W7) — relay_online flipping
//   true journals the burst once and sets enclave_burst_heard, which
//   starts q_enclave_burst.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STARTING_REP as STORE_STARTING_REP,
  LEGACY_REP_ALIAS as STORE_ALIAS,
  foldLegacyRep,
  useGameStore,
} from '../store/gameStore';
import { STARTING_REP, LEGACY_REP_ALIAS } from '../data/factions';
import { ENCLAVE_RADIO_BURST } from '../data/worldWiring';
import type { SurvivorDef } from '../data/survivors';
import type { BaseInstance } from '../systems/baseClaims';

function surv(id: string, over: Partial<SurvivorDef> = {}): SurvivorDef {
  return {
    id, name: id, age: 30, background: 'tester',
    skills: { combat: 1, mechanics: 1, medicine: 1, stealth: 1, driver: 1, scavenging: 1, leadership: 1 },
    traits: [], morale: 50, hp: 100, status: 'healthy', job: 'Builder', ...over,
  };
}

function home(over: Partial<BaseInstance> = {}): BaseInstance {
  return {
    siteId: 'shore_camp', role: 'home',
    facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
    prefabs: [], stockpile: [], ...over,
  };
}

describe('stage 4 step 2a — rep single source', () => {
  it('the store re-exports the canonical factions objects (same reference)', () => {
    expect(STORE_STARTING_REP).toBe(STARTING_REP);
    expect(STORE_ALIAS).toBe(LEGACY_REP_ALIAS);
  });

  it('canon values are the shipped seeds (behavior unchanged by the swap)', () => {
    expect(STARTING_REP).toEqual({
      lighthouse: 0, remnants: -50, union: 25, skulls: -30, tollkeepers: 0, drowned: 0,
    });
    expect(LEGACY_REP_ALIAS).toEqual({ pier: 'union', refuge: 'union', hollow: 'skulls' });
    expect(foldLegacyRep({})).toEqual(STARTING_REP);
  });
});

describe('stage 4 step 2c — Enclave radio burst (W7)', () => {
  beforeEach(() => {
    useGameStore.setState({ flags: {}, journal: [], quests: [], doneQuests: [], toasts: [] });
  });

  it('relay_online flipping true journals the burst and starts q_enclave_burst', () => {
    const s = useGameStore.getState();
    s.setFlag('relay_online');
    const st = useGameStore.getState();
    expect(st.flags[ENCLAVE_RADIO_BURST.flag]).toBe(true);
    const burst = st.journal.filter((e) => e.title === ENCLAVE_RADIO_BURST.speaker);
    expect(burst).toHaveLength(1);
    expect(burst[0].lines).toEqual([...ENCLAVE_RADIO_BURST.lines]);
    expect(st.quests.some((q) => q.id === 'q_enclave_burst')).toBe(true);
  });

  it('the burst fires once — a repeated relay_online set is a no-op', () => {
    const s = useGameStore.getState();
    s.setFlag('relay_online');
    s.setFlag('relay_online');
    const st = useGameStore.getState();
    expect(st.journal.filter((e) => e.title === ENCLAVE_RADIO_BURST.speaker)).toHaveLength(1);
  });

  it('unrelated flags do not trigger the burst', () => {
    useGameStore.getState().setFlag('met_jonah');
    const st = useGameStore.getState();
    expect(st.flags[ENCLAVE_RADIO_BURST.flag]).toBeUndefined();
    expect(st.journal).toHaveLength(0);
  });
});

describe('stage 4 step 4b — baseDailyTick (Lane 10 upkeep/morale pass)', () => {
  beforeEach(() => {
    useGameStore.setState({
      claims: { home: null, outposts: [] },
      moraleRuntime: { idleDays: {}, breakingDays: {} },
      survivors: [], inventory: [], journal: [], toasts: [],
    });
  });

  it('no tiered home: falls back to the legacy morale abstraction (+2 fed baseline)', () => {
    useGameStore.setState({ survivors: [surv('a')] });
    useGameStore.getState().baseDailyTick();
    expect(useGameStore.getState().survivors[0].morale).toBe(52);
  });

  it('home claimed: the crew eats the stockpile first and it depletes', () => {
    useGameStore.setState({
      claims: { home: home({ stockpile: [{ itemId: 'canned_food', qty: 2 }, { itemId: 'water_bottle', qty: 1 }] }), outposts: [] },
      survivors: [surv('a')],
      inventory: [{ uid: 'p1', itemId: 'canned_food', qty: 5 }],
    });
    useGameStore.getState().baseDailyTick();
    const st = useGameStore.getState();
    expect(st.claims.home?.stockpile).toEqual([]);
    expect(st.survivors[0].morale).toBe(52); // fed +2, comfort 0
    // pack untouched — the pile fed them
    expect(st.inventory).toEqual([{ uid: 'p1', itemId: 'canned_food', qty: 5 }]);
  });

  it('empty stockpile: the pack is the fallback larder and is consumed', () => {
    useGameStore.setState({
      claims: { home: home(), outposts: [] },
      survivors: [surv('a')],
      inventory: [
        { uid: 'p1', itemId: 'canned_food', qty: 2 },
        { uid: 'p2', itemId: 'water_bottle', qty: 1 },
        { uid: 'p3', itemId: 'scrap', qty: 4 },
      ],
    });
    useGameStore.getState().baseDailyTick();
    const st = useGameStore.getState();
    expect(st.survivors[0].morale).toBe(52);
    expect(st.inventory.map((i) => i.itemId)).toEqual(['scrap']);
  });

  it('nothing anywhere: the survivor goes hungry (−4) and the Breaking fuse starts', () => {
    useGameStore.setState({
      claims: { home: home(), outposts: [] },
      survivors: [surv('a', { morale: 15 })],
    });
    useGameStore.getState().baseDailyTick();
    const st = useGameStore.getState();
    expect(st.survivors[0].morale).toBe(11);
    expect(st.moraleRuntime.breakingDays['a']).toBe(1);
    expect(st.journal.some((e) => e.title === 'Base upkeep')).toBe(true);
  });
});
