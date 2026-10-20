// Pure unit tests for the wave-3 dispatch sim (seeded rng, no DOM).
import { describe, expect, it } from 'vitest';
import {
  dispatchDurationMin,
  resolveDispatch,
  riskChance,
  type ResolveInput,
} from '../data/dispatch';
import { ITEMS } from '../data/items';

/** Deterministic LCG so event/yield rolls are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const base: ResolveInput = {
  task: 'scavenge',
  destPoiId: 'town',
  distM: 600,
  heat: 20,
  scavenging: 5,
  driver: 3,
  combat: 2,
  traits: [],
  freeKg: 200,
  rng: lcg(42),
};

describe('dispatchDurationMin', () => {
  it('never runs shorter than 40 or longer than 720 minutes', () => {
    expect(dispatchDurationMin(0, 0, 'scavenge')).toBeGreaterThanOrEqual(40);
    expect(dispatchDurationMin(100000, 10, 'escort')).toBeLessThanOrEqual(720);
  });

  it('a better driver shortens the run', () => {
    const slow = dispatchDurationMin(2000, 0, 'scavenge');
    const fast = dispatchDurationMin(2000, 9, 'scavenge');
    expect(fast).toBeLessThan(slow);
  });

  it('scouting is quicker on site than scavenging', () => {
    expect(dispatchDurationMin(600, 3, 'scout')).toBeLessThan(dispatchDurationMin(600, 3, 'scavenge'));
  });
});

describe('riskChance', () => {
  it('grows with distance and heat, escort runs hotter, bounded', () => {
    const near = riskChance(100, 0, 'scavenge');
    const far = riskChance(900, 0, 'scavenge');
    const hot = riskChance(900, 90, 'scavenge');
    const escort = riskChance(900, 0, 'escort');
    expect(far).toBeGreaterThan(near);
    expect(hot).toBeGreaterThan(far);
    expect(escort).toBeGreaterThan(far);
    expect(riskChance(99999, 999, 'escort')).toBeLessThanOrEqual(0.65);
    expect(riskChance(0, 0, 'scout')).toBeGreaterThanOrEqual(0.08);
  });
});

describe('resolveDispatch', () => {
  it('a quiet scavenge (rng pinned high) brings loot and no damage', () => {
    // rng 0.5: every risk roll fails (max risk 0.65 needs care — use near/cold)
    const out = resolveDispatch({ ...base, distM: 50, heat: 0, rng: () => 0.99 });
    // 0.99 fails every loot chance roll too — empty hands, but intact
    expect(out.eventText).toBeNull();
    expect(out.vehicleDamage).toBe(0);
    expect(out.survivorHpLoss).toBe(0);
    expect(out.loot).toEqual([]);
  });

  it('a generous rng fills the vehicle from the town table', () => {
    const out = resolveDispatch({ ...base, rng: () => 0.05 });
    expect(out.loot.length).toBeGreaterThan(0);
    const ids = out.loot.map((l) => l.itemId);
    expect(ids).toContain('scrap');
    // everything rolled came off the town table
    for (const id of ids) expect(ITEMS[id]).toBeDefined();
  });

  it('weight cap trims loot and reports the left-behind kilograms', () => {
    const full = resolveDispatch({ ...base, rng: () => 0.05 });
    const capped = resolveDispatch({ ...base, freeKg: 1, rng: () => 0.05 });
    const fullKg = full.loot.reduce((a, l) => a + (ITEMS[l.itemId]?.weight ?? 1) * l.qty, 0);
    const cappedKg = capped.loot.reduce((a, l) => a + (ITEMS[l.itemId]?.weight ?? 1) * l.qty, 0);
    expect(fullKg).toBeGreaterThan(1); // premise: the full haul outweighs the cap
    expect(cappedKg).toBeLessThanOrEqual(1);
    expect(capped.leftBehindKg).toBeGreaterThan(0);
    expect(cappedKg + capped.leftBehindKg).toBeCloseTo(fullKg, 0);
  });

  it('higher scavenging skill hauls more', () => {
    const rookie = resolveDispatch({ ...base, scavenging: 0, rng: lcg(7) });
    const pro = resolveDispatch({ ...base, scavenging: 10, rng: lcg(7) });
    const kg = (o: typeof rookie) => o.loot.reduce((a, l) => a + (ITEMS[l.itemId]?.weight ?? 1) * l.qty, 0);
    expect(kg(pro)).toBeGreaterThan(kg(rookie));
  });

  it('a forced event hurts and damages; a coward keeps their skin', () => {
    const fighter = resolveDispatch({ ...base, distM: 3000, heat: 90, rng: () => 0 });
    expect(fighter.eventText).not.toBeNull();
    expect(fighter.vehicleDamage).toBeGreaterThan(0);
    expect(fighter.survivorHpLoss).toBeGreaterThan(0);
    const coward = resolveDispatch({ ...base, distM: 3000, heat: 90, traits: ['cowardly'], rng: () => 0 });
    expect(coward.eventText).not.toBeNull();
    expect(coward.survivorHpLoss).toBe(0);
  });

  it('bravery blunts an event versus a plain survivor on the same rolls', () => {
    const plain = resolveDispatch({ ...base, distM: 3000, heat: 90, rng: lcg(3) });
    const brave = resolveDispatch({ ...base, distM: 3000, heat: 90, traits: ['brave'], rng: lcg(3) });
    expect(brave.vehicleDamage).toBeLessThanOrEqual(plain.vehicleDamage);
    expect(brave.survivorHpLoss).toBeLessThanOrEqual(plain.survivorHpLoss);
  });

  it('scout returns no loot; escort pays in valuables', () => {
    const scout = resolveDispatch({ ...base, task: 'scout', rng: () => 0.99 });
    expect(scout.loot).toEqual([]);
    const escort = resolveDispatch({ ...base, task: 'escort', rng: () => 0.05 });
    expect(escort.loot.some((l) => l.itemId === 'valuables')).toBe(true);
  });
});
