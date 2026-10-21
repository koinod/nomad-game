// Lane 6 (items + loot) integrity suite: the catalog is data other lanes
// code against — Lane 7 crafts from these recipes, Lane 9 prices from
// this barter table, traders/caches roll these loot tables. A dangling
// id anywhere is a runtime ghost item, so the whole graph gets swept.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ITEMS, HUSK_LOOT, HUSK_KIND_LOOT, FURNITURE_LOOT, SAFE_LOOT, LOG_LOOT,
  BUSH_LOOT, FIELD_RECIPES, STATION_RECIPES, BARTER_VALUES, barterValueOf,
  BIOME_LOOT_WEIGHT, lootClassFor, weightedChance, rollLoot,
} from '../data/items';
import { respawnDaysFor, respawnEligible } from '../game/Interact';
import { buildFurnitureMesh, applyDisturbed, applyRestored } from '../game/furnitureMeshes';
import { AlarmRegistry, DISARM_SECONDS, DISARM_SKILL_LEVEL } from '../game/alarm';

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
      // §3.2 mods complete the roster (Lane 11 request): spec's
      // mod_scope / mod_choke / mod_flashlight, canonical naming
      'scope', 'choke', 'flashlight',
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

describe('biome loot weighting (§4.5)', () => {
  it('the weight table is the spec table, verbatim', () => {
    expect(BIOME_LOOT_WEIGHT.beach).toEqual({ material: 1.2, food: 0.8, military: 0.3, medical: 0.5 });
    expect(BIOME_LOOT_WEIGHT.forest.food).toBe(1.4);
    expect(BIOME_LOOT_WEIGHT.town.medical).toBe(1.2);
    expect(BIOME_LOOT_WEIGHT.water.military).toBe(0.2);
    expect(BIOME_LOOT_WEIGHT.water.medical).toBe(0.3);
  });

  it('loot class derives: override > item rule > category', () => {
    expect(lootClassFor({ id: 'gun_parts' })).toBe('military'); // material category, military loot
    expect(lootClassFor({ id: 'canned_food' })).toBe('food');
    expect(lootClassFor({ id: 'bandage' })).toBe('medical');
    expect(lootClassFor({ id: 'scrap' })).toBe('material');
    expect(lootClassFor({ id: 'scrap', lootClass: 'food' })).toBe('food'); // explicit wins
  });

  it('weighted chance clamps at certainty and starves off-class loot', () => {
    const ammo = { id: 'ammo_9mm', min: 1, max: 1, chance: 0.9 };
    expect(weightedChance(ammo, 'forest')).toBeCloseTo(0.18); // military 0.2 in the trees
    const feast = { id: 'canned_food', min: 1, max: 1, chance: 0.9 };
    expect(weightedChance(feast, 'forest')).toBe(1); // food 1.4 clamps
  });

  it('rollLoot with a scripted rng is deterministic and biome-aware', () => {
    const table = [{ id: 'ammo_9mm', min: 2, max: 2, chance: 0.5 }];
    const seq = [0.4, 0.5]; // chance roll, qty roll
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    // town military weight 0.6 → effective 0.3; a 0.4 roll misses there…
    expect(rollLoot(table, rng, { biome: 'town' })).toEqual([]);
    i = 0;
    // …but the beach material class isn't ammo's; use no-biome base chance: 0.4 < 0.5 hits
    expect(rollLoot(table, rng)).toEqual([{ itemId: 'ammo_9mm', qty: 2 }]);
  });
});

describe('respawn clocks (§4.5)', () => {
  it('every period sits in sodgame\u2019s 7–21 day band and is deterministic', () => {
    for (const id of ['c_town_1', 'c_wreck_1', 'n_log_3', 'c_parts_marina', 'c_light_1']) {
      const d = respawnDaysFor(id);
      expect(d).toBeGreaterThanOrEqual(7);
      expect(d).toBeLessThanOrEqual(21);
      expect(respawnDaysFor(id)).toBe(d);
    }
  });

  it('locked safes and guaranteed key-item containers never respawn', () => {
    const safe = { id: 's1', x: 0, z: 0, locked: true, loot: [{ id: 'valuables', min: 1, max: 2, chance: 0.9 }] };
    expect(respawnEligible(safe)).toBe(false);
    const phoneCrate = { id: 'c1', x: 0, z: 0, loot: [{ id: 'phone', min: 1, max: 1, chance: 1 }] };
    expect(respawnEligible(phoneCrate)).toBe(false);
    const relayCrate = { id: 'c2', x: 0, z: 0, loot: [{ id: 'relay_part', min: 1, max: 1, chance: 1 }, { id: 'scrap', min: 1, max: 2, chance: 0.7 }] };
    expect(respawnEligible(relayCrate)).toBe(false);
    const pantry = { id: 'c3', x: 0, z: 0, loot: [{ id: 'canned_food', min: 1, max: 2, chance: 0.8 }] };
    expect(respawnEligible(pantry)).toBe(true);
    const logpile = { id: 'c4', x: 0, z: 0, loot: [{ id: 'wood', min: 2, max: 4, chance: 1 }] };
    expect(respawnEligible(logpile)).toBe(true); // guaranteed ≠ key item
  });
});

describe('disturbed furniture (§4.5 visual)', () => {
  it('applyDisturbed moves openers + darkens; applyRestored undoes both', () => {
    const fridge = buildFurnitureMesh('fridge');
    const doorOf = () => fridge.children.find((c) => c.name === 'opener')!;
    const closedY = doorOf().rotation.y;
    applyDisturbed(fridge);
    expect(doorOf().rotation.y).not.toBe(closedY);
    const mesh = fridge.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const dark = (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    applyRestored(fridge);
    expect(doorOf().rotation.y).toBe(closedY);
    const fresh = buildFurnitureMesh('fridge');
    const freshMesh = fresh.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const freshHex = (freshMesh.material as THREE.MeshStandardMaterial).color.getHex();
    expect(freshHex).not.toBe(dark); // disturbing really did darken it
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(freshHex); // restored == pristine
    // idempotent: disturbing twice doesn't double-swing
    applyDisturbed(fridge);
    const once = doorOf().rotation.y;
    applyDisturbed(fridge);
    expect(doorOf().rotation.y).toBe(once);
  });
});

describe('alarm engine (§4.4)', () => {
  it('an active armed alarm trips once, with the spec\u2019s full effect', () => {
    const r = new AlarmRegistry();
    r.register({ poiId: 'military_checkpoint', mode: 'active', faction: 'remnants' });
    const ev = r.trip('military_checkpoint', 'container_trip');
    expect(ev).not.toBeNull();
    expect(ev!.effect.noiseRadius).toBe(60);
    expect(ev!.effect.spawn).toBe('scout_pair');
    expect(ev!.effect.factionRep).toEqual({ faction: 'remnants', delta: -5 });
    expect(r.state('military_checkpoint')).toBe('tripped');
    expect(r.events).toHaveLength(1);
    expect(r.trip('military_checkpoint', 'forced_entry')).toBeNull(); // never twice
  });

  it('silent POIs and factionless POIs trip without a rep hit', () => {
    const r = new AlarmRegistry();
    r.register({ poiId: 'strip_mall', mode: 'active' });
    r.register({ poiId: 'quiet_place', mode: 'silent' });
    expect(r.trip('quiet_place', 'container_trip')).toBeNull();
    expect(r.state('quiet_place')).toBe('armed');
    const ev = r.trip('strip_mall', 'forced_entry');
    expect(ev!.effect.factionRep).toBeUndefined();
    expect(r.trip('nowhere', 'container_trip')).toBeNull();
  });

  it('disarm demands the kit and the skill, before the trip only', () => {
    const r = new AlarmRegistry();
    r.register({ poiId: 'outpost', mode: 'active' });
    expect(DISARM_SECONDS).toBe(30);
    expect(DISARM_SKILL_LEVEL).toBe(2);
    expect(r.canDisarm('outpost', false, 5)).toEqual({ ok: false, reason: 'no_toolkit' });
    expect(r.canDisarm('outpost', true, 1)).toEqual({ ok: false, reason: 'low_skill' });
    expect(r.canDisarm('outpost', true, 2)).toEqual({ ok: true });
    expect(r.disarm('outpost')).toBe(true);
    expect(r.trip('outpost', 'container_trip')).toBeNull(); // dark stays dark
    expect(r.canDisarm('outpost', true, 5)).toEqual({ ok: false, reason: 'not_armed' });
    r.reset('outpost');
    expect(r.state('outpost')).toBe('armed');
    r.trip('outpost', 'container_trip');
    expect(r.disarm('outpost')).toBe(false); // a blown alarm can't be un-blown
  });
});
