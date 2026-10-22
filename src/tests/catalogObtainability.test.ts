// catalogObtainability.test.ts — the systems-completeness audit, pinned.
//
// Ian (2026-10-22): "crafting, full item list if not finished." The
// audit found the catalog at 87 items with four silent holes: seven
// facility blueprint ids that base.ts gates on but ITEMS never defined
// (unobtainable by construction), pack_t2 (defined, no source anywhere),
// finish_camo / finish_rust (defined, no source), and six craftable-
// intent items with no recipe (scope, frag, flashbang, ammo_556,
// ammo_rifle, bolts). This test recomputes obtainability from the DATA
// sources on every run so a future item can't quietly ship sourceless:
//
//   sources = recipe results + every loot table in data/items.ts
//           + trader barter "get" sides + quest reward items
//           + facility production outputs + enclave cache signatures
//           + the explicit ENGINE_PLACED list below (placed pickups in
//             game/Interact.ts + starter/migration grants + hunting).
//
// An item with no source fails here by name.

import { describe, expect, it } from 'vitest';
import {
  BUSH_LOOT,
  FIELD_RECIPES,
  FURNITURE_LOOT,
  HUSK_KIND_LOOT,
  HUSK_LOOT,
  ITEMS,
  LOG_LOOT,
  SAFE_LOOT,
  STATION_RECIPES,
} from '../data/items';
import { TIERED_FACILITIES } from '../data/base';
import { QUESTS } from '../data/quests';
import { TRADERS } from '../data/traders';
import { ENCLAVE_CACHES } from '../data/worldWiring';

/** Items whose only source lives in engine code, named with the code:
 *  placed ground pickups (game/Interact.ts `pickup('pk_…')`), the
 *  starter/migration grants (store/containers.normalizeCarried), and
 *  animal harvest (game/Animals.ts). Everything else must resolve to a
 *  data source above — if you add a pickup, add the id here AND there. */
const ENGINE_PLACED: Record<string, string> = {
  phone: 'starter item; granted on load when absent (normalizeCarried)',
  raw_meat: 'animal harvest (game/Animals.ts)',
  machete: "Interact pickup pk_machete",
  hatchet: "Interact pickup pk_hatchet",
  pistol: "Interact pickup pk_pistol",
  sledgehammer: "Interact pickup pk_sledge",
  shotgun: "Interact pickup pk_shotgun",
  hunting_rifle: "Interact pickup pk_rifle",
  crowbar: "Interact pickup pk_crowbar",
  fire_axe: "Interact pickup pk_fireaxe",
  riot_baton: "Interact pickup pk_baton",
  flare_gun: "Interact pickup pk_flaregun (+ trader offers)",
  crossbow: "Interact pickup pk_crossbow",
  dmr: "Interact pickup pk_dmr (+ trader offers)",
  boombox: "Interact pickup pk_boombox",
  armored_vest: "Interact pickup pk_vest",
  relay_part: 'relay POI placement (game/Interact.ts) + enclave cache signature',
};

function dataSources(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, source: string) => {
    const list = out.get(id) ?? [];
    list.push(source);
    out.set(id, list);
  };
  for (const r of Object.values({ ...FIELD_RECIPES, ...STATION_RECIPES })) {
    add(r.resultId, `recipe ${r.id}`);
  }
  const tables: Record<string, { id: string }[][]> = {
    HUSK_LOOT: Object.values(HUSK_LOOT),
    HUSK_KIND_LOOT: Object.values(HUSK_KIND_LOOT),
    FURNITURE_LOOT: Object.values(FURNITURE_LOOT).flatMap((t) => Object.values(t)),
    SAFE_LOOT: [SAFE_LOOT],
    LOG_LOOT: [LOG_LOOT],
    BUSH_LOOT: [BUSH_LOOT],
  };
  for (const [name, tableSet] of Object.entries(tables)) {
    for (const table of tableSet) for (const e of table) add(e.id, `loot ${name}`);
  }
  for (const t of TRADERS) for (const o of t.offers) add(o.get.itemId, `trader ${t.id}`);
  for (const q of QUESTS) for (const it of q.rewards?.items ?? []) add(it.id, `quest ${q.id}`);
  for (const f of TIERED_FACILITIES) {
    for (const tier of f.tiers) {
      if (tier.production) add(tier.production.itemId, `facility ${f.id} production`);
      if (tier.production2) add(tier.production2.itemId, `facility ${f.id} production`);
    }
  }
  for (const c of ENCLAVE_CACHES) add(c.signatureItem, `enclave cache ${c.id}`);
  return out;
}

describe('catalog obtainability (systems completeness)', () => {
  const sources = dataSources();

  it('every catalog item has at least one obtainability source', () => {
    const sourceless: string[] = [];
    for (const id of Object.keys(ITEMS)) {
      if (sources.has(id)) continue;
      if (id in ENGINE_PLACED) continue;
      sourceless.push(id);
    }
    expect(sourceless, `items with no way to obtain them: ${sourceless.join(', ')}`).toEqual([]);
  });

  it('the ENGINE_PLACED exceptions are all real catalog items (no stale entries)', () => {
    for (const id of Object.keys(ENGINE_PLACED)) expect(ITEMS[id], id).toBeDefined();
  });

  it('every facility blueprint gate in base.ts names a real, lootable item', () => {
    const gated = new Set<string>();
    for (const f of TIERED_FACILITIES) {
      for (const tier of f.tiers) if (tier.blueprintId) gated.add(tier.blueprintId);
    }
    // the seven T3 facility sheets + the turret's craft blueprint
    expect(gated.size).toBe(7);
    for (const id of gated) {
      expect(ITEMS[id], id).toBeDefined();
      expect(ITEMS[id].category, id).toBe('blueprint');
      expect(sources.get(id)?.some((s) => s.startsWith('loot')), `${id} must drop somewhere`).toBe(true);
    }
    expect(ITEMS.bp_turret, 'bp_turret').toBeDefined();
    expect(sources.get('bp_turret')?.some((s) => s.startsWith('loot'))).toBe(true);
  });

  it('every ammo type has a reload path (no weapon becomes a paperweight)', () => {
    const ammoIds = Object.values(ITEMS)
      .filter((d) => d.category === 'weapon-ranged' && d.ammoId)
      .map((d) => d.ammoId!);
    for (const ammo of new Set(ammoIds)) {
      expect(
        sources.get(ammo)?.some((s) => s.startsWith('recipe')),
        `${ammo} needs a reload recipe`,
      ).toBe(true);
    }
  });
});
