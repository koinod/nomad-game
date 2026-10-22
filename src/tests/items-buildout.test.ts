// Order #4 — item build-out + crafting tables: catalog completeness pins
// (every item modeled, every footprint authored, every recipe stationed
// and meta'd, required station sites placed, proximity gating) and a
// carried-forest conservation test through the timed craft queue.
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FIELD_RECIPES, FOOTPRINTS, ITEMS, STATION_RECIPES } from '../data/items';
import { STATION_RADIUS_M, WORLD_STATION_PLACEMENTS } from '../data/stations';
import { BETA_POI_PLACEMENTS, BETA_SECTORS } from '../data/betaLayout';
import { buildItemModel, ITEM_MODEL_IDS } from '../game/itemModels';
import { buildGroundMesh, GROUND_MODEL_IDS } from '../game/weaponMeshes';
import { footprintOf } from '../store/gridUtils';
import { weaponSlotForDef } from '../store/equipment';
import { RECIPE_META, useCraftQueue, type CraftContext } from '../systems/crafting';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import { walkCarried } from '../store/containers';

const ALL_ITEM_IDS = Object.keys(ITEMS);

// ---------------------------------------------------------------------------
// world-model coverage
// ---------------------------------------------------------------------------

function meshSignatures(g: THREE.Object3D): { type: string; w?: number; h?: number; d?: number }[] {
  const out: { type: string; w?: number; h?: number; d?: number }[] = [];
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BoxGeometry;
    const p = (geo as unknown as { parameters?: Record<string, number> }).parameters;
    out.push({ type: geo.type, w: p?.width, h: p?.height, d: p?.depth });
  });
  return out;
}

/** The buildGroundMesh default: one tan box, 0.34 × 0.24 × 0.34. */
function isDefaultBox(g: THREE.Group): boolean {
  const sigs = meshSignatures(g);
  return sigs.length === 1 && sigs[0].type === 'BoxGeometry'
    && sigs[0].w === 0.34 && sigs[0].h === 0.24 && sigs[0].d === 0.34;
}

describe('catalog world models', () => {
  it('every item has a dedicated world model (itemModels or weaponMeshes)', () => {
    for (const id of ALL_ITEM_IDS) {
      expect(ITEM_MODEL_IDS.has(id) || GROUND_MODEL_IDS.has(id), id).toBe(true);
    }
  });

  it('the declared model sets are honest against the builders', () => {
    for (const id of ITEM_MODEL_IDS) expect(buildItemModel(id), id).not.toBeNull();
    for (const id of GROUND_MODEL_IDS) expect(isDefaultBox(buildGroundMesh(id)), id).toBe(false);
    // and the fallback really is the default box for unmodeled ids
    expect(buildItemModel('no_such_item')).toBeNull();
    expect(isDefaultBox(buildGroundMesh('no_such_item'))).toBe(true);
  });

  it('the four Order #4 models are multi-part builds, not boxes', () => {
    for (const id of ['field_jacket', 'cargo_pants', 'hard_case', 'ammo_can']) {
      const g = buildItemModel(id);
      expect(g, id).not.toBeNull();
      expect(meshSignatures(g!).length, id).toBeGreaterThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// footprints + weapon-slot routing
// ---------------------------------------------------------------------------

describe('authored footprints', () => {
  it('FOOTPRINTS covers every item and footprintOf agrees with it', () => {
    for (const id of ALL_ITEM_IDS) {
      const fp = FOOTPRINTS[id];
      expect(fp, id).toBeDefined();
      const [w, h] = fp;
      expect(ITEMS[id].w, id).toBe(w);
      expect(ITEMS[id].h, id).toBe(h);
      expect(footprintOf(id), id).toEqual({ w, h });
      expect(footprintOf(id, true), id).toEqual({ w: h, h: w });
    }
    // and the table carries no ids the catalog doesn't know
    for (const id of Object.keys(FOOTPRINTS)) expect(ITEMS[id], id).toBeDefined();
  });

  it('long guns route primary, sidearms secondary, melee tertiary', () => {
    for (const id of ['shotgun', 'hunting_rifle', 'smg', 'carbine', 'dmr', 'crossbow']) {
      expect(weaponSlotForDef(ITEMS[id]), id).toBe('primary');
    }
    for (const id of ['pistol', 'revolver', 'flare_gun']) {
      expect(weaponSlotForDef(ITEMS[id]), id).toBe('secondary');
    }
    expect(weaponSlotForDef(ITEMS.machete)).toBe('tertiary');
  });
});

// ---------------------------------------------------------------------------
// recipes: stationed, meta'd, resolvable
// ---------------------------------------------------------------------------

describe('recipe completeness', () => {
  const recipes = [...Object.values(FIELD_RECIPES), ...Object.values(STATION_RECIPES)];

  it('every recipe has an explicit RECIPE_META entry', () => {
    for (const r of recipes) {
      expect(Object.prototype.hasOwnProperty.call(RECIPE_META, r.id), r.id).toBe(true);
    }
  });

  it('every component and result resolves to a catalog item', () => {
    for (const r of recipes) {
      expect(ITEMS[r.resultId], `${r.id} result`).toBeDefined();
      for (const c of r.components) expect(ITEMS[c.itemId], `${r.id} component`).toBeDefined();
    }
  });

  it('every station a recipe needs has at least one world placement', () => {
    const needed = new Set(recipes.map((r) => r.station).filter(Boolean));
    const placed = new Set(WORLD_STATION_PLACEMENTS.map((p) => p.station));
    for (const st of needed) expect(placed.has(st!), st).toBe(true);
  });

  it('required sites host stations: airbase depot, Citadel yard, Refuge', () => {
    const at = (key: 'poiId' | 'sectorId', v: string) =>
      WORLD_STATION_PLACEMENTS.filter((p) => p[key] === v).map((p) => p.station);
    expect(at('poiId', 'airbase')).toEqual(expect.arrayContaining(['workbench', 'industrial']));
    expect(at('poiId', 'warehouse')).toEqual(expect.arrayContaining(['workbench', 'industrial']));
    expect(at('sectorId', 'refuge')).toEqual(expect.arrayContaining(['workbench', 'chemistry']));
  });
});

// ---------------------------------------------------------------------------
// station proximity gating (the math Game.ts runs per frame)
// ---------------------------------------------------------------------------

describe('station proximity gating', () => {
  function resolve(p: (typeof WORLD_STATION_PLACEMENTS)[number]): [number, number] {
    if (p.poiId) {
      const poi = BETA_POI_PLACEMENTS.find((q) => q.poiId === p.poiId);
      expect(poi, p.poiId).toBeDefined();
      return [poi!.x + p.dx, poi!.z + p.dz];
    }
    const sector = BETA_SECTORS.find((s) => s.id === p.sectorId);
    expect(sector, p.sectorId).toBeDefined();
    return [sector!.x + p.dx, sector!.z + p.dz];
  }

  it('every placement resolves to a finite point inside the world extent', () => {
    for (const p of WORLD_STATION_PLACEMENTS) {
      const [x, z] = resolve(p);
      expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(700);
      expect(Math.abs(z)).toBeLessThanOrEqual(320);
    }
  });

  it('standing at a station is in reach; 20 m away is not', () => {
    expect(STATION_RADIUS_M).toBe(4.5);
    for (const p of WORLD_STATION_PLACEMENTS) {
      const [x, z] = resolve(p);
      const distSq = (px: number, pz: number) => (px - x) ** 2 + (pz - z) ** 2;
      expect(distSq(x, z)).toBeLessThanOrEqual(STATION_RADIUS_M * STATION_RADIUS_M);
      expect(distSq(x + 20, z)).toBeGreaterThan(STATION_RADIUS_M * STATION_RADIUS_M);
    }
  });
});

// ---------------------------------------------------------------------------
// conservation: queue crafts consume through the carried forest
// ---------------------------------------------------------------------------

describe('craft queue × carried forest', () => {
  beforeEach(() => {
    useGameStore.setState({
      inventory: [],
      equipped: emptyEquipped(),
      nearStation: null,
      toasts: [],
      daysElapsed: 0,
      timeMinutes: 600,
      dayStats: { kills: 0, crafts: 0, pickups: 0 },
    });
    useCraftQueue.setState({ jobs: [] });
  });

  function storeCtx(): CraftContext {
    const s = useGameStore.getState();
    return {
      countItem: (id) => s.countItem(id),
      nearStation: s.nearStation,
      nearStationTier: s.nearStation === 'industrial' ? 3 : 1,
      facilities: [],
      skillLevel: () => undefined,
    };
  }

  function totalQty(): number {
    return walkCarried(useGameStore.getState().inventory).reduce((a, i) => a + i.qty, 0);
  }

  it('components nested in a worn pack are consumed; the result lands in the forest', () => {
    useGameStore.setState({
      inventory: [
        {
          uid: 'pk', itemId: 'pack_t1', qty: 1,
          contents: [
            { uid: 'sc', itemId: 'scrap', qty: 2 },
            { uid: 'wr', itemId: 'wire', qty: 1 },
          ],
        },
      ],
      nearStation: 'workbench',
    });
    const s = useGameStore.getState();
    expect(s.countItem('scrap')).toBe(2); // the gate counts the forest
    const before = totalQty(); // pack + 2 scrap + 1 wire = 4

    const refusal = useCraftQueue.getState().enqueue('r_reload_9mm', storeCtx());
    expect(refusal).toBeNull();
    expect(s.countItem('scrap')).toBe(0);
    expect(s.countItem('wire')).toBe(0);
    // consumed from inside the pack — its contents are actually empty
    const pack = useGameStore.getState().inventory.find((i) => i.uid === 'pk');
    expect(pack?.contents ?? []).toHaveLength(0);

    useGameStore.setState({ timeMinutes: 601 }); // r_reload_9mm = 60 s
    useCraftQueue.getState().tick();
    expect(useGameStore.getState().countItem('ammo_9mm')).toBe(6);
    // conservation: 4 before − 3 components + 6 rounds = 7
    expect(totalQty()).toBe(before - 3 + 6);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
  });

  it('cancelling a nested-components job refunds everything', () => {
    useGameStore.setState({
      inventory: [
        {
          uid: 'pk', itemId: 'pack_t1', qty: 1,
          contents: [
            { uid: 'sc', itemId: 'scrap', qty: 1 },
            { uid: 'cl', itemId: 'cloth', qty: 1 },
          ],
        },
      ],
      nearStation: 'workbench',
    });
    const refusal = useCraftQueue.getState().enqueue('r_bat', storeCtx());
    expect(refusal).toBeNull();
    const job = useCraftQueue.getState().jobs[0];
    useCraftQueue.getState().cancel(job.uid);
    const s = useGameStore.getState();
    expect(s.countItem('scrap')).toBe(1);
    expect(s.countItem('cloth')).toBe(1);
    expect(totalQty()).toBe(3); // pack + both components, nothing lost
  });
});
