import { describe, it, expect } from 'vitest';
import {
  FACTIONS, FACTION_FOLDS, LEGACY_REP_ALIAS, STARTING_REP,
  ALLIED_DEEP_GATE, factionById, repTier,
} from '../data/factions';
import { TRADERS, traderAccess, traderForFaction } from '../data/traders';
import { TERRITORY, MAP_MARKERS, territoryAt } from '../data/territory';
import { NPC_PLACEMENTS, ROAD_GRAPH, ENCLAVE_CACHES, ENCLAVE_RADIO_BURST } from '../data/worldWiring';
import { QUESTS } from '../data/quests';
import { ITEMS } from '../data/items';
import { POI_DEFS } from '../game/World';

const poiIds = new Set(POI_DEFS.map((p) => p.id));

describe('canon roster (FACTIONS_CANON §1/§2)', () => {
  it('six easymode factions, exactly the canon set', () => {
    const easy = FACTIONS.filter((f) => f.era === 'easymode').map((f) => f.id).sort();
    expect(easy).toEqual(['drowned', 'lighthouse', 'remnants', 'skulls', 'tollkeepers', 'union']);
  });

  it('plus the Enclave as rumor and the hardmode trio — ten, the ceiling', () => {
    expect(FACTIONS).toHaveLength(10);
    expect(factionById('enclave')?.era).toBe('rumor');
    expect(FACTIONS.filter((f) => f.era === 'hardmode').map((f) => f.id).sort())
      .toEqual(['authority', 'boneyard', 'listeners']);
  });

  it('canon start reps: Remnants −50, Union +25, Skulls −30, Tollkeepers/Drowned 0', () => {
    expect(STARTING_REP).toMatchObject({
      remnants: -50, union: 25, skulls: -30, tollkeepers: 0, drowned: 0, lighthouse: 0,
    });
  });

  it('the folds: Pier/Refuge → Union, Hollow Market → Skulls (people kept)', () => {
    expect(FACTION_FOLDS.pier.into).toBe('union');
    expect(FACTION_FOLDS.refuge.into).toBe('union');
    expect(FACTION_FOLDS.hollow.into).toBe('skulls');
    expect(FACTION_FOLDS.pier.people).toContain('Boudreaux');
    expect(FACTION_FOLDS.refuge.people).toContain('Okonkwo');
    expect(FACTION_FOLDS.hollow.people).toContain('Accountant');
    for (const [oldId, into] of Object.entries(LEGACY_REP_ALIAS)) {
      expect(FACTION_FOLDS[oldId]).toBeDefined();
      expect(factionById(into)).toBeDefined();
    }
    // folded ids are NOT factions anymore
    for (const oldId of Object.keys(FACTION_FOLDS)) expect(factionById(oldId)).toBeUndefined();
  });

  it('repTier ships the sodgame ladder (SYSTEMS_SPEC §0.1) — Ian ruled 2026-10-21; pinned so a silent re-band fails loudly', () => {
    expect(repTier(-100)).toBe('War');
    expect(repTier(-75)).toBe('War');
    expect(repTier(-74)).toBe('Hostile');
    expect(repTier(-50)).toBe('Hostile');
    expect(repTier(-49)).toBe('Wary');
    expect(repTier(-10)).toBe('Wary');
    expect(repTier(-9)).toBe('Neutral');
    expect(repTier(24)).toBe('Neutral');
    expect(repTier(25)).toBe('Friendly');
    expect(repTier(74)).toBe('Friendly');
    expect(repTier(75)).toBe('Allied');
    expect(repTier(100)).toBe('Allied');
  });

  it('ALLIED_DEEP_GATE is 75 — the quartermaster gate, coinciding with the Allied boundary since the 2026-10-21 re-band', () => {
    expect(ALLIED_DEEP_GATE).toBe(75);
  });
});

describe('traders (canon §2)', () => {
  it('the five easymode traders exist; Skulls and Listeners are null BY DESIGN', () => {
    for (const id of ['quartermaster', 'union_medic', 'kowalski_bench', 'toll_exchange', 'chandlery']) {
      expect(TRADERS.find((t) => t.id === id), id).toBeDefined();
    }
    expect(factionById('skulls')?.traderId).toBeNull();
    expect(factionById('listeners')?.traderId).toBeNull();
    expect(traderForFaction('skulls')).toBeUndefined();
    expect(traderForFaction('listeners')).toBeUndefined();
  });

  it('faction traderId links resolve to real traders', () => {
    for (const f of FACTIONS) {
      if (f.traderId) expect(TRADERS.find((t) => t.id === f.traderId), f.id).toBeDefined();
    }
  });

  it('gates are raw-number/flag only: quartermaster 74 no / 75 yes; medic 24 no / 25 yes; bench needs the story flag', () => {
    const qm = TRADERS.find((t) => t.id === 'quartermaster')!;
    expect(traderAccess(qm, { remnants: 74 }, {}).ok).toBe(false);
    expect(traderAccess(qm, { remnants: 75 }, {}).ok).toBe(true);
    const medic = TRADERS.find((t) => t.id === 'union_medic')!;
    expect(traderAccess(medic, { union: 24 }, {}).ok).toBe(false);
    expect(traderAccess(medic, { union: 25 }, {}).ok).toBe(true);
    const bench = TRADERS.find((t) => t.id === 'kowalski_bench')!;
    expect(traderAccess(bench, { lighthouse: 100 }, {}).ok).toBe(false);
    expect(traderAccess(bench, {}, { kowalski_helped: true }).ok).toBe(true);
    for (const id of ['toll_exchange', 'chandlery']) {
      expect(traderAccess(TRADERS.find((t) => t.id === id)!, {}, {}).ok).toBe(true);
    }
  });

  it('every barter offer references items that exist', () => {
    for (const t of TRADERS) {
      for (const o of t.offers) {
        for (const g of o.give) expect(ITEMS[g.itemId], `${t.id} give ${g.itemId}`).toBeDefined();
        expect(ITEMS[o.get.itemId], `${t.id} get ${o.get.itemId}`).toBeDefined();
        expect(o.get.qty).toBeGreaterThan(0);
      }
    }
  });

  it('easymode trader NPCs are placed (Kowalski is the shipped lighthouse NPC)', () => {
    const placed = new Set(NPC_PLACEMENTS.map((n) => n.key));
    for (const t of TRADERS.filter((t) => t.era === 'easymode')) {
      expect(placed.has(t.npcKey) || t.npcKey === 'kowalski', t.id).toBe(true);
    }
  });
});

describe('territory + wiring data (canon §6)', () => {
  it('every territory poiId and map marker resolves to a real POI', () => {
    for (const t of TERRITORY) if (t.poiId) expect(poiIds.has(t.poiId), t.site).toBe(true);
    for (const m of MAP_MARKERS) if (m.poiId) expect(poiIds.has(m.poiId), m.id).toBe(true);
  });

  it('canon ownership: town/marina/relay/fort/airbase/lighthouse/tollgate', () => {
    expect(territoryAt('town')?.owner).toBe('union');
    expect(territoryAt('marina')?.owner).toBe('drowned');
    expect(territoryAt('relay_station')?.owner).toBe('remnants');
    expect(territoryAt('airbase')?.owner).toBe('remnants');
    expect(territoryAt('lighthouse_base')?.owner).toBe('lighthouse');
    expect(TERRITORY.find((t) => t.site === 'raider fort')?.owner).toBe('skulls');
    expect(TERRITORY.find((t) => t.site === 'eastern tollgate')?.owner).toBe('tollkeepers');
    // the lighthouse is never claimable, ever
    expect(territoryAt('lighthouse_base')?.claim).toBe('never');
  });

  it('NPC placements anchor to real POIs or carry free-standing approx coords', () => {
    for (const n of NPC_PLACEMENTS) {
      if (n.poiId) expect(poiIds.has(n.poiId), n.key).toBe(true);
      else expect(n.approx, n.key).toBeDefined();
    }
  });

  it('road graph: every edge endpoint is a node (the two OBX doors excepted)', () => {
    const nodes = new Set(ROAD_GRAPH.nodes);
    for (const e of ROAD_GRAPH.edges) {
      expect(nodes.has(e.from), `from ${e.from}`).toBe(true);
      expect(nodes.has(e.to) || e.to.startsWith('obx_'), `to ${e.to}`).toBe(true);
    }
    const doors = ROAD_GRAPH.edges.filter((e) => e.pricedBy);
    expect(doors.map((d) => d.pricedBy).sort()).toEqual(['drowned', 'tollkeepers']);
  });

  it('enclave caches carry real signature items; the burst needs the relay', () => {
    expect(ENCLAVE_CACHES).toHaveLength(3);
    for (const c of ENCLAVE_CACHES) {
      expect(ITEMS[c.signatureItem], c.id).toBeDefined();
      if (c.poiId) expect(poiIds.has(c.poiId), c.id).toBe(true);
    }
    expect(ENCLAVE_RADIO_BURST.requiresFlag).toBe('relay_online');
    expect(ENCLAVE_RADIO_BURST.flag).toBe('enclave_burst_heard');
  });
});

describe('story chain (audit regression)', () => {
  it('quest chain links resolve: every startsWhen.questDone is a real quest', () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    for (const q of QUESTS) {
      if (q.startsWhen?.questDone) expect(ids.has(q.startsWhen.questDone), q.id).toBe(true);
    }
    // the spine, in order
    expect(ids.has('q_prologue')).toBe(true);
    expect(QUESTS.find((q) => q.id === 'q5_beacon')?.startsWhen?.questDone).toBe('q4_parts');
  });

  it('poi: step targets resolve to real POIs; reward items exist', () => {
    for (const q of QUESTS) {
      for (const s of q.steps) {
        if (s.target.startsWith('poi:')) expect(poiIds.has(s.target.slice(4)), `${q.id} ${s.target}`).toBe(true);
      }
      for (const r of q.rewards.items ?? []) expect(ITEMS[r.id], `${q.id} reward ${r.id}`).toBeDefined();
      for (const r of q.rewards.rep ?? []) expect(factionById(r.faction), `${q.id} rep ${r.faction}`).toBeDefined();
    }
  });

  it('the Enclave quest starts on the burst flag and targets the three caches', () => {
    const q = QUESTS.find((x) => x.id === 'q_enclave_burst');
    expect(q).toBeDefined();
    expect(q!.startsWhen?.flag).toBe('enclave_burst_heard');
    const targets = q!.steps.map((s) => s.target).sort();
    expect(targets).toEqual(ENCLAVE_CACHES.map((c) => `cache:${c.id}`).sort());
    expect(q!.rewards.flags).toContain('enclave_evidence');
  });

  it('the beacon quest still ends the chain with the beacon_choice step (hardmode seed)', () => {
    const q5 = QUESTS.find((q) => q.id === 'q5_beacon')!;
    expect(q5.steps.some((s) => s.type === 'choice' && s.target === 'beacon_choice')).toBe(true);
    expect(q5.rewards.flags).toContain('ending_ready');
  });
});
