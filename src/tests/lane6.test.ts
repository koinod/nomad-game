// Lane 6 (items + loot) integrity suite: the catalog is data other lanes
// code against — Lane 7 crafts from these recipes, Lane 9 prices from
// this barter table, traders/caches roll these loot tables. A dangling
// id anywhere is a runtime ghost item, so the whole graph gets swept.
import { describe, it, expect } from 'vitest';
import {
  ITEMS, HUSK_LOOT, HUSK_KIND_LOOT, FURNITURE_LOOT, SAFE_LOOT, LOG_LOOT,
  BUSH_LOOT, FIELD_RECIPES, STATION_RECIPES, BARTER_VALUES, barterValueOf,
} from '../data/items';

const has = (id: string) => Object.prototype.hasOwnProperty.call(ITEMS, id);

describe('catalog integrity', () => {
  it('every loot-table entry references a real item', () => {
    const tables: { id: string }[][] = [
      ...Object.values(HUSK_LOOT),
      ...Object.values(HUSK_KIND_LOOT),
      ...Object.values(FURNITURE_LOOT).flatMap((t) => [t.camp, t.suburban]),
      SAFE_LOOT, LOG_LOOT, BUSH_LOOT,
    ];
    for (const table of tables) {
      for (const e of table) expect(has(e.id), `loot entry ${e.id}`).toBe(true);
    }
  });

  it('every recipe component and result is a real item', () => {
    for (const r of [...Object.values(FIELD_RECIPES), ...Object.values(STATION_RECIPES)]) {
      expect(has(r.resultId), `${r.id} result ${r.resultId}`).toBe(true);
      for (const c of r.components) expect(has(c.itemId), `${r.id} component ${c.itemId}`).toBe(true);
      if (r.requiresItem) expect(has(r.requiresItem), `${r.id} requiresItem`).toBe(true);
    }
  });

  it('every disassembly yield is a real item, on a real item', () => {
    for (const def of Object.values(ITEMS)) {
      if (!def.disassembly) continue;
      for (const y of def.disassembly) expect(has(y.itemId), `${def.id} yields ${y.itemId}`).toBe(true);
    }
  });

  it('every item carries a grid footprint', () => {
    for (const def of Object.values(ITEMS)) {
      expect(def.w, `${def.id} footprint w`).toBeGreaterThan(0);
      expect(def.h, `${def.id} footprint h`).toBeGreaterThan(0);
    }
  });

  it('the §1.4 registry is present (spec ids or their shipped aliases)', () => {
    // shipped aliases: smoke=smoke_grenade, rock=rock_lure,
    // boombox=decoy_boombox, dmr=marksman_rifle — ids stay code-canonical
    for (const id of [
      'crowbar', 'fire_axe', 'spear', 'riot_baton', 'flare_gun', 'revolver',
      'crossbow', 'bolts', 'smg', 'carbine', 'dmr', 'ammo_556', 'smoke',
      'rock', 'boombox', 'circuit_board', 'gunpowder', 'brass', 'lead',
      'plate_carrier', 'shin_guards', 'bp_turret', 'turret',
    ]) expect(has(id), id).toBe(true);
  });
});

describe('spec recipes (Lane 7 data requests, §4)', () => {
  it('r_turret is the blueprint-gated Machine Shop craft', () => {
    const r = STATION_RECIPES.r_turret;
    expect(r.station).toBe('industrial');
    expect(r.requiresItem).toBe('bp_turret');
    expect(r.skillReq).toEqual({ skill: 'mechanics', level: 5 });
    expect(r.resultId).toBe('turret');
  });

  it('T2 component reloads double the scrap yield', () => {
    expect(STATION_RECIPES.r_reload_9mm_t2.resultQty).toBe(12);
    expect(STATION_RECIPES.r_reload_9mm.resultQty).toBe(6);
    expect(STATION_RECIPES.r_reload_shells_t2.resultQty).toBe(8);
  });

  it('gunpowder is a Chemistry product, 2-for-2', () => {
    const r = STATION_RECIPES.r_gunpowder;
    expect(r.station).toBe('chemistry');
    expect(r.resultQty).toBe(2);
  });
});

describe('barter (§3.5 anchors)', () => {
  it('valuables is the 100-unit anchor', () => {
    expect(barterValueOf('valuables')).toBe(100);
  });

  it('every priced id is a real item', () => {
    for (const id of Object.keys(BARTER_VALUES)) expect(has(id), id).toBe(true);
  });

  it('quest/key items are not tradable', () => {
    expect(barterValueOf('phone')).toBe(0);
    expect(barterValueOf('relay_part')).toBe(0);
    expect(barterValueOf('beacon_cell')).toBe(0);
  });

  it('prices respect the tier ladder (a carbine beats a pistol beats a pipe)', () => {
    expect(barterValueOf('carbine')).toBeGreaterThan(barterValueOf('pistol'));
    expect(barterValueOf('pistol')).toBeGreaterThan(barterValueOf('pipe'));
  });
});
