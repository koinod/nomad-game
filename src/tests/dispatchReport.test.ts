// Lane 13 — journal voice tests: departure / report / recall formatters
// and the shared clock/duration formats the panel and journal both use.
import { describe, expect, it } from 'vitest';
import {
  fmtClock,
  fmtRunDuration,
  formatDispatchDeparture,
  formatDispatchRecall,
  formatDispatchReport,
  riskBand,
  type DispatchPlan,
  type ResolveOutcome,
} from '../data/dispatch';
import { ITEMS } from '../data/items';

describe('fmtClock / fmtRunDuration / riskBand', () => {
  it('formats absolute minutes the phone way', () => {
    expect(fmtClock(0)).toBe('Day 1 · 00:00');
    expect(fmtClock(1440 + 6 * 60 + 40)).toBe('Day 2 · 06:40');
  });

  it('speaks run lengths in words', () => {
    expect(fmtRunDuration(45)).toBe('45 min');
    expect(fmtRunDuration(125)).toBe('2 h 05 min');
  });

  it('bands risk at the documented thresholds', () => {
    expect(riskBand(0.1)).toBe('low');
    expect(riskBand(0.25)).toBe('moderate');
    expect(riskBand(0.4)).toBe('high');
    expect(riskBand(0.6)).toBe('severe');
  });
});

const plan: Pick<DispatchPlan, 'etaMin' | 'fuelLiters' | 'risk'> = {
  etaMin: 1440 + 380, fuelLiters: 1.6, risk: 0.35,
};

describe('formatDispatchDeparture', () => {
  it('names crew, vehicle, trailer, route, return time and tank math', () => {
    const { title, lines } = formatDispatchDeparture({
      survivorName: 'Mara', vehicleName: 'Stallion FX', trailerName: 'Box Trailer',
      task: 'scavenge', destPoiId: 'town', distM: 612, plan,
    });
    expect(title).toBe('Dispatch — Scavenge to Town');
    expect(lines[0]).toContain('Mara rolled out in the Stallion FX');
    expect(lines[0]).toContain('Box Trailer in tow');
    expect(lines[0]).toContain('612 m each way');
    expect(lines[0]).toContain(fmtClock(plan.etaMin));
    expect(lines[1]).toContain('≈1.6 L');
    expect(lines[1]).toContain('35%');
  });

  it('omits the trailer clause when there is none', () => {
    const { lines } = formatDispatchDeparture({
      survivorName: 'Mara', vehicleName: 'Stallion FX', trailerName: null,
      task: 'scout', destPoiId: 'wreck', distM: 300, plan,
    });
    expect(lines[0]).not.toContain('in tow');
  });
});

const quietOutcome: ResolveOutcome = {
  loot: [{ itemId: 'scrap', qty: 3 }],
  leftBehindKg: 0, eventText: null, vehicleDamage: 0,
  survivorHpLoss: 0, moraleDelta: 3, fuelBurnedLiters: 1.2,
};

describe('formatDispatchReport', () => {
  it('a quiet haul reports the manifest with weights, total and fuel', () => {
    const { title, lines } = formatDispatchReport({
      survivorName: 'Mara', vehicleName: 'Stallion FX', task: 'scavenge',
      destPoiId: 'town', elapsedMin: 125, outcome: quietOutcome,
      placedLoot: [{ itemId: 'scrap', qty: 3 }, { itemId: 'canned_food', qty: 2 }],
      unplacedKg: 0,
    });
    expect(title).toBe('Dispatch report — Scavenge · Town');
    const manifest = lines.find((l) => l.startsWith('Brought back:'));
    expect(manifest).toBeDefined();
    expect(manifest).toContain(`3× ${ITEMS.scrap.name} (${(ITEMS.scrap.weight * 3).toFixed(1)} kg)`);
    expect(manifest).toContain('loaded into the Stallion FX');
    expect(lines[0]).toContain('≈1.2 L burned');
    expect(lines[0]).toContain('2 h 05 min');
    expect(lines.join(' ')).toContain('morale is up');
  });

  it('contact is flagged in the title and narrated with damage and injury', () => {
    const out: ResolveOutcome = {
      ...quietOutcome,
      eventText: 'Husks on the road out. A short, ugly fight and they were through.',
      vehicleDamage: 0.18, survivorHpLoss: 14, moraleDelta: -6,
    };
    const { title, lines } = formatDispatchReport({
      survivorName: 'Mara', vehicleName: 'Stallion FX', task: 'scavenge',
      destPoiId: 'town', elapsedMin: 130, outcome: out,
      placedLoot: [{ itemId: 'scrap', qty: 1 }], unplacedKg: 2.5, tireNote: 'A tire is flat.',
    });
    expect(title).toContain('(contact)');
    const all = lines.join('\n');
    expect(all).toContain('short, ugly fight');
    expect(all).toContain('−18% condition');
    expect(all).toContain('A tire is flat.');
    expect(all).toContain('−14 HP');
    expect(all).toContain('Left behind ≈2.5 kg');
    expect(all).toContain("morale took a hit");
  });

  it('an empty-handed quiet run says so plainly', () => {
    const { lines } = formatDispatchReport({
      survivorName: 'Mara', vehicleName: 'Stallion FX', task: 'scavenge',
      destPoiId: 'dune_cache', elapsedMin: 90,
      outcome: { ...quietOutcome, moraleDelta: 2, fuelBurnedLiters: 0 },
      placedLoot: [], unplacedKg: 0,
    });
    expect(lines).toContain('Came back empty-handed.');
    expect(lines[0]).not.toContain('burned');
  });

  it('scout verdicts follow the census', () => {
    const mk = (total: number, looted: number) =>
      formatDispatchReport({
        survivorName: 'Mara', vehicleName: 'Stallion FX', task: 'scout',
        destPoiId: 'marina', elapsedMin: 60, outcome: { ...quietOutcome, loot: [], moraleDelta: 1 },
        placedLoot: [], unplacedKg: 0, scoutCensus: { total, looted },
      }).lines.join(' ');
    expect(mk(0, 0)).toContain('Nothing searchable stands there.');
    expect(mk(4, 4)).toContain('Picked clean');
    expect(mk(4, 3)).toContain('Picked over');
    expect(mk(4, 1)).toContain('Rich pickings');
    expect(mk(4, 1)).toContain('4 containers standing, 1 already emptied');
    const garbled = formatDispatchReport({
      survivorName: 'Mara', vehicleName: 'Stallion FX', task: 'scout',
      destPoiId: 'marina', elapsedMin: 60, outcome: { ...quietOutcome, loot: [], moraleDelta: 1 },
      placedLoot: [], unplacedKg: 0, scoutCensus: null,
    });
    expect(garbled.lines.join(' ')).toContain('garbled');
  });
});

describe('formatDispatchRecall', () => {
  it('with fuel tracking, the recall admits what the road cost', () => {
    const { title, lines } = formatDispatchRecall({
      survivorName: 'Mara', vehicleName: 'Stallion FX', destPoiId: 'town', fuelBurnedLiters: 0.8,
    });
    expect(title).toBe('Recalled — Town');
    expect(lines[1]).toContain('≈0.8 L burned for nothing but road.');
  });

  it('legacy rows without fuel data keep the generic line', () => {
    const { lines } = formatDispatchRecall({
      survivorName: 'Mara', vehicleName: 'Stallion FX', destPoiId: 'town', fuelBurnedLiters: null,
    });
    expect(lines[1]).toBe('Nothing to show for the fuel.');
  });
});
