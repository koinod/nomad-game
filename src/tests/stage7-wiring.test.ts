// Stage 7 wiring tests (merge train finale): the world-wiring train.
// - item 10: legacy armor recategorized + equipUid armor routing.
// - item 5 (W8 audit): the relay chain pins end-to-end at data level.
// - item 4 (W6): Enclave cache container defs + quest targets.
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ITEMS } from '../data/items';
import { QUESTS } from '../data/quests';
import { ENCLAVE_CACHES, ENCLAVE_RADIO_BURST, ROAD_GRAPH } from '../data/worldWiring';
import { buildContainerDefs } from '../game/Interact';
import { POI_DEFS } from '../game/World';
import { MAP_MARKERS, territoryAt } from '../data/territory';

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
