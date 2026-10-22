// Order #5 Phase B: store-level wiring pins — the perk derivations in
// systems/perkEffects.ts actually change live store behavior (damage,
// second wind, survival XP), not just pure math.
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import { input } from '../game/input';

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

describe('advanceDay — day_survived XP', () => {
  it('a day rollover pays scavenging XP from the event table', () => {
    const before = S().skills.scavenging.xp;
    S().advanceDay();
    expect(S().daysElapsed).toBe(1);
    expect(S().skills.scavenging.xp).toBe(before + 8);
  });
});
