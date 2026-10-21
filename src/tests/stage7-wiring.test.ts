// Stage 7 wiring tests (merge train finale): the world-wiring train.
// - item 10: legacy armor recategorized + equipUid armor routing.
// - item 5 (W8 audit): the relay chain pins end-to-end at data level.
// - item 4 (W6): Enclave cache container defs + quest targets.
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';
import { ENCLAVE_CACHES, ENCLAVE_RADIO_BURST, ROAD_GRAPH, NPC_PLACEMENTS } from '../data/worldWiring';
import { NPC_DIALOGUES } from '../narrative/dialogue';
import { NPC_LOOKS } from '../data/survivors';
import { TRADERS } from '../data/traders';
import { buildContainerDefs } from '../game/Interact';
import { POI_DEFS } from '../game/World';
import { MAP_MARKERS, territoryAt } from '../data/territory';
import { STARTING_REP } from '../data/factions';
import { prefabDef } from '../data/base';
import { powerBudget, TURRET_POWER_KW, type BaseInstance } from '../systems/baseClaims';
import { TURRET_DEF, TURRET_GHOST_SPEC } from '../systems/crafting';
import type { SurvivorDef } from '../data/survivors';
import * as THREE from 'three';
import { HuskManager } from '../game/Husks';
import { XP_EVENTS } from '../systems/skills';

describe('stage 7 item 10 — legacy armor', () => {
  it('armored_vest / riot_helmet are armor with body slots and their values intact', () => {
    expect(ITEMS.armored_vest.category).toBe('armor');
    expect(ITEMS.armored_vest.armorSlot).toBe('torso');
    expect(ITEMS.armored_vest.armor).toBe(0.25);
    expect(ITEMS.riot_helmet.category).toBe('armor');
    expect(ITEMS.riot_helmet.armorSlot).toBe('head');
    expect(ITEMS.riot_helmet.armor).toBe(0.15);
  });

  beforeEach(() => {
    useGameStore.setState({
      inventory: [
        { uid: 'v1', itemId: 'armored_vest', qty: 1 },
        { uid: 'h1', itemId: 'riot_helmet', qty: 1 },
        { uid: 'p1', itemId: 'plate_carrier', qty: 1 },
        { uid: 'l1', itemId: 'shin_guards', qty: 1 },
      ],
      equipped: { melee: null, ranged: null, pack: null },
      toasts: [],
    });
  });

  it('equipUid routes armor into its body slot', () => {
    const s = useGameStore.getState();
    s.equipUid('v1');
    expect(useGameStore.getState().equipped.armorTorso).toBe('v1');
    s.equipUid('h1');
    expect(useGameStore.getState().equipped.armorHead).toBe('h1');
    s.equipUid('p1'); // same slot as the vest — replaces it
    expect(useGameStore.getState().equipped.armorTorso).toBe('p1');
    s.equipUid('l1');
    expect(useGameStore.getState().equipped.armorLegs).toBe('l1');
  });

  it('unequipSlot clears a worn armor slot', () => {
    const s = useGameStore.getState();
    s.equipUid('v1');
    s.unequipSlot('armorTorso');
    expect(useGameStore.getState().equipped.armorTorso ?? null).toBeNull();
  });
});

describe('stage 7 item 1 — W1 POIs + W4 markers', () => {
  it('POI_DEFS carries Lane 9\u2019s six sites at the W1 coordinates', () => {
    const want: Record<string, [number, number]> = {
      tollgate: [672, 60], raider_fort: [500, 150], barn: [-40, 120],
      warehouse: [140, -90], gas_station: [-160, -30], strip_mall: [-60, -120],
    };
    for (const [id, [x, z]] of Object.entries(want)) {
      const def = POI_DEFS.find((p) => p.id === id);
      expect(def, id).toBeDefined();
      expect(def!.x).toBe(x);
      expect(def!.zGuess).toBe(z);
    }
  });

  it('every map marker resolves to a real POI, and territory knows its sites', () => {
    const poiIds = new Set(POI_DEFS.map((p) => p.id));
    for (const m of MAP_MARKERS) {
      expect(m.poiId, m.id).toBeDefined();
      expect(poiIds.has(m.poiId!), m.id).toBe(true);
    }
    for (const id of ['tollgate', 'raider_fort', 'barn', 'warehouse', 'gas_station', 'strip_mall']) {
      expect(territoryAt(id)?.poiId).toBe(id);
    }
  });
});

describe('stage 7 item 2 — W2 NPC placements', () => {
  it('every placed NPC has a dialogue entry and a figure look', () => {
    for (const p of NPC_PLACEMENTS) {
      expect(NPC_DIALOGUES[`npc:${p.key}`], p.key).toBeDefined();
      expect(NPC_DIALOGUES[`npc:${p.key}`].nodes.start.speaker).toBe(p.name);
      expect(NPC_LOOKS[p.key], p.key).toBeDefined();
    }
  });

  it('placed traders resolve to TRADERS benches by npcKey; non-traders have none', () => {
    for (const p of NPC_PLACEMENTS) {
      const trader = TRADERS.find((t) => t.npcKey === p.key);
      if (p.traderId) {
        expect(trader?.id, p.key).toBe(p.traderId);
      } else {
        expect(trader, p.key).toBeUndefined();
      }
    }
  });

  it('every placement anchor resolves: poiId, the tollgate, or an approx', () => {
    const poiIds = new Set(POI_DEFS.map((d) => d.id));
    for (const p of NPC_PLACEMENTS) {
      const ok = (p.poiId !== undefined && poiIds.has(p.poiId))
        || (p.key === 'wraith' && poiIds.has('tollgate'))
        || p.approx !== undefined;
      expect(ok, p.key).toBe(true);
    }
  });
});

describe('stage 7 item 3 — W5 road graph', () => {
  it('every road-mode edge resolves to real POIs; the doors stay off-island', () => {
    const poiIds = new Set(POI_DEFS.map((p) => p.id));
    for (const e of ROAD_GRAPH.edges) {
      if (e.mode === 'road') {
        expect(poiIds.has(e.from), `${e.from}->${e.to}`).toBe(true);
        expect(poiIds.has(e.to), `${e.from}->${e.to}`).toBe(true);
      } else {
        // bridge/ferry doors: the far node is an OBX node that must NOT exist yet
        expect(poiIds.has(e.to), e.to).toBe(false);
        expect(e.pricedBy).toBeDefined();
      }
    }
    const tollStretch = ROAD_GRAPH.edges.find((e) => e.from === 'relay_station' && e.to === 'dune_cache');
    expect(tollStretch?.note).toContain('toll crews');
  });
});

describe('stage 7 item 8 — claimClaimSite (tiered claims go live)', () => {
  const surv = (id: string): SurvivorDef => ({
    id, name: id, age: 30, background: 'tester',
    skills: { combat: 1, mechanics: 1, medicine: 1, stealth: 1, driver: 1, scavenging: 1, leadership: 1 },
    traits: [], morale: 50, hp: 100, status: 'healthy', job: 'Builder',
  });
  beforeEach(() => {
    useGameStore.setState({
      inventory: [], claims: { home: null, outposts: [] }, base: null,
      survivors: [], rep: { ...STARTING_REP }, flags: {}, toasts: [],
    });
  });

  it('shore_camp claims free: home set, legacy mirror + flag land', () => {
    const s = useGameStore.getState();
    const res = s.claimClaimSite('shore_camp', { husksWithin40m: 0 });
    expect(res.ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.claims.home?.siteId).toBe('shore_camp');
    expect(st.claims.home?.facilities[0].defId).toBe('command_post');
    expect(st.base?.poiId).toBe('shore_camp');
    expect(st.flags['base_claimed']).toBe(true);
  });

  it('hostiles at the post block the claim', () => {
    const res = useGameStore.getState().claimClaimSite('shore_camp', { husksWithin40m: 2 });
    expect(res.ok).toBe(false);
    expect(useGameStore.getState().claims.home).toBeNull();
  });

  it('jonah_camp charges 15 scrap from the pack', () => {
    useGameStore.setState({ inventory: [{ uid: 's1', itemId: 'scrap', qty: 20 }] });
    const res = useGameStore.getState().claimClaimSite('jonah_camp', { husksWithin40m: 0 });
    expect(res.ok).toBe(true);
    expect(useGameStore.getState().countItem('scrap')).toBe(5);
  });

  it('an unpayable cost blocks the claim', () => {
    const res = useGameStore.getState().claimClaimSite('jonah_camp', { husksWithin40m: 0 });
    expect(res.ok).toBe(false);
  });

  it('town needs a door: rep path or the war path (plus crew + cost)', () => {
    useGameStore.setState({
      inventory: [{ uid: 's1', itemId: 'scrap', qty: 40 }],
      survivors: [surv('a'), surv('b'), surv('c')],
      // NB: the Union's startRep IS the path floor (25) — Path A starts
      // open by canon design; drop rep to test the closed-door case.
      rep: { ...STARTING_REP, union: 0 },
    });
    const s = useGameStore.getState();
    expect(s.claimClaimSite('town', { husksWithin40m: 0 }).ok).toBe(false); // neither door
    expect(s.claimClaimSite('town', { husksWithin40m: 0, byForce: true }).ok).toBe(true); // war path
    expect(useGameStore.getState().claims.home?.siteId).toBe('town');
  });

  it('outposts need a home; relay_station then claims as an outpost', () => {
    const s = useGameStore.getState();
    expect(s.claimClaimSite('relay_station', { husksWithin40m: 0 }).ok).toBe(false);
    s.claimClaimSite('shore_camp', { husksWithin40m: 0 });
    useGameStore.setState({
      inventory: [
        { uid: 's1', itemId: 'scrap', qty: 20 },
        { uid: 'w1', itemId: 'wire', qty: 10 },
      ],
    });
    const res = useGameStore.getState().claimClaimSite('relay_station', { husksWithin40m: 0 });
    expect(res.ok).toBe(true);
    expect(useGameStore.getState().claims.outposts.map((o) => o.siteId)).toEqual(['relay_station']);
    // duplicate claim refused
    expect(useGameStore.getState().claimClaimSite('relay_station', { husksWithin40m: 0 }).ok).toBe(false);
  });

  it('relocation: cost can draw on the old stockpile; the rest strands', () => {
    const s = useGameStore.getState();
    s.claimClaimSite('shore_camp', { husksWithin40m: 0 });
    useGameStore.setState((st) => ({
      claims: {
        ...st.claims,
        home: { ...st.claims.home!, stockpile: [{ itemId: 'scrap', qty: 15 }, { itemId: 'water_bottle', qty: 2 }] },
      },
    }));
    const res = useGameStore.getState().claimClaimSite('jonah_camp', { husksWithin40m: 0 });
    expect(res.ok).toBe(true);
    expect(res.relocatedFrom).toBe('shore_camp');
    expect(res.stranded).toEqual([{ itemId: 'water_bottle', qty: 2 }]);
    const st = useGameStore.getState();
    expect(st.claims.home?.siteId).toBe('jonah_camp');
    expect(st.base?.poiId).toBe('jonah_camp');
  });
});

describe('stage 7 item 6 — turrets: budget, deploy, stockpile feed', () => {
  it('the budget constant matches Lane 7\u2019s ghost spec', () => {
    expect(TURRET_POWER_KW).toBe(TURRET_GHOST_SPEC.powerKw);
    expect(TURRET_GHOST_SPEC.ammoItemId).toBe('ammo_9mm');
    expect(prefabDef('turret')?.cost).toEqual(TURRET_DEF.cost.map((c) => ({ itemId: c.itemId, qty: c.qty })));
  });

  it('powerBudget charges 0.8 kW per deployed turret prefab', () => {
    const base: BaseInstance = {
      siteId: 'shore_camp', role: 'home',
      facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
      prefabs: [{ defId: 'turret' }, { defId: 'turret' }], stockpile: [],
    };
    const b = powerBudget(base);
    expect(b.usedKw).toBeCloseTo(1.6, 6);
    expect(b.ok).toBe(false); // no generator: emplaced but dark
  });

  beforeEach(() => {
    useGameStore.setState({
      inventory: [{ uid: 't1', itemId: 'turret', qty: 1 }],
      claims: {
        home: {
          siteId: 'shore_camp', role: 'home',
          facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
          prefabs: [], stockpile: [{ itemId: 'ammo_9mm', qty: 250 }],
        },
        outposts: [],
      },
      toasts: [],
    });
  });

  it('deployTurret consumes the crafted item and persists the prefab', () => {
    const s = useGameStore.getState();
    expect(s.deployTurret('shore_camp')).toBe(true);
    const st = useGameStore.getState();
    expect(st.countItem('turret')).toBe(0);
    expect(st.claims.home?.prefabs).toEqual([{ defId: 'turret' }]);
    // a second deploy with no item left refuses
    expect(st.deployTurret('shore_camp')).toBe(false);
  });

  it('deployTurret refuses ground you do not hold', () => {
    expect(useGameStore.getState().deployTurret('town')).toBe(false);
  });

  it('takeFromStockpile draws down and reports partial takes', () => {
    const s = useGameStore.getState();
    expect(s.takeFromStockpile('shore_camp', 'ammo_9mm', 100)).toBe(100);
    expect(s.takeFromStockpile('shore_camp', 'ammo_9mm', 200)).toBe(150);
    expect(s.takeFromStockpile('shore_camp', 'ammo_9mm', 10)).toBe(0);
    expect(useGameStore.getState().claims.home?.stockpile).toEqual([]);
  });
});

describe('stage 7 item 7 — HuskManager.spawnSiegeWave (Lane 10\u2019s SiegeSpawner)', () => {
  const flatLand = () => 5;
  const req = {
    wave: 1, count: 4, kinds: ['shambler', 'stalker'] as never[],
    siteId: 'shore_camp', x: 0, z: 0, target: 'gates' as const,
  };

  it('spawns the planned count on the perimeter ring, zoned as a siege', () => {
    const mgr = new HuskManager(new THREE.Scene(), [], 42);
    const spawned = mgr.spawnSiegeWave(req, flatLand);
    expect(spawned).toBe(4);
    expect(mgr.aliveInZone('siege:shore_camp')).toBe(4);
    for (const h of mgr.husks) {
      const d = Math.hypot(h.group.position.x, h.group.position.z);
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(60);
    }
  });

  it('scouts zone separately so wave bookkeeping never counts them', () => {
    const mgr = new HuskManager(new THREE.Scene(), [], 7);
    mgr.spawnSiegeWave({ ...req, count: 2 }, flatLand, { scout: true });
    expect(mgr.aliveInZone('scout:shore_camp')).toBe(2);
    expect(mgr.aliveInZone('siege:shore_camp')).toBe(0);
  });

  it('open water vetoes every spawn point', () => {
    const mgr = new HuskManager(new THREE.Scene(), [], 3);
    expect(mgr.spawnSiegeWave(req, () => 0)).toBe(0);
    expect(mgr.husks.length).toBe(0);
  });

  it('the XP event the loop pays is Lane 8\u2019s siege_survived', () => {
    expect(XP_EVENTS.siege_survived).toEqual({ skill: 'leadership', xp: 12, label: 'Siege survived (present)' });
  });
});

describe('stage 7 item 5 — W8 relay audit (data level)', () => {
  it('q3 relay step targets poi:relay_switch and the burst requires relay_online', () => {
    const q3 = QUESTS.find((q) => q.id === 'q3_clear_relay');
    expect(q3?.steps.some((st) => st.type === 'interact' && st.target === 'poi:relay_switch')).toBe(true);
    expect(ENCLAVE_RADIO_BURST.requiresFlag).toBe('relay_online');
    expect(ENCLAVE_RADIO_BURST.flag).toBe('enclave_burst_heard');
  });

  it('q_enclave_burst steps target exactly the placed cache ids', () => {
    const q = QUESTS.find((x) => x.id === 'q_enclave_burst');
    const targets = (q?.steps ?? []).map((st) => st.target.replace(/^cache:/, '')).sort();
    expect(targets).toEqual(ENCLAVE_CACHES.map((c) => c.id).sort());
  });
});

describe('stage 7 item 4 — W6 Enclave cache containers', () => {
  const pois: Record<string, [number, number]> = {
    forest_cache: [180, 40], wreck: [-220, 150], dune_cache: [470, 150],
  };
  const defs = buildContainerDefs(pois);
  const caches = defs.filter((d) => d.id.startsWith('enclave_cache_'));

  it('one locked container per ENCLAVE_CACHES entry, at the POI + offset', () => {
    expect(caches.length).toBe(ENCLAVE_CACHES.length);
    for (const c of ENCLAVE_CACHES) {
      const def = caches.find((d) => d.id === c.id);
      expect(def, c.id).toBeDefined();
      expect(def!.locked).toBe(true);
      const [px, pz] = pois[c.poiId!];
      expect(def!.x).toBe(px + c.dx);
      expect(def!.z).toBe(pz + c.dz);
    }
  });

  it('each cache carries its signature item guaranteed plus generic tech', () => {
    for (const c of ENCLAVE_CACHES) {
      const def = caches.find((d) => d.id === c.id)!;
      const sig = def.loot.find((e) => e.id === c.signatureItem);
      expect(sig, `${c.id} signature`).toBeDefined();
      expect(sig!.chance).toBe(1);
      expect(def.loot.length).toBeGreaterThan(1);
    }
  });

  it('each cache fires its quest target and carries its flavor', () => {
    for (const c of ENCLAVE_CACHES) {
      const def = caches.find((d) => d.id === c.id)!;
      expect(def.questTarget).toBe(`cache:${c.id}`);
      expect(def.flavor).toBe(c.flavor);
    }
  });
});
