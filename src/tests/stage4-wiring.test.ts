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
