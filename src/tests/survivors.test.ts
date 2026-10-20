// Wave 4: designed-recruit data integrity — every recruit is fully
// specified (skills in range, real traits, a designed look) so content
// bugs fail here instead of at a POI in front of the player.
import { describe, expect, it } from 'vitest';
import { DESIGNED_RECRUITS, SURVIVOR_LOOKS, TRAITS } from '../data/survivors';

const SKILLS = ['combat', 'mechanics', 'medicine', 'stealth', 'driver', 'scavenging', 'leadership'] as const;

describe('designed recruits', () => {
  it('the roster is five: the original three + Dez + Priya', () => {
    expect(Object.keys(DESIGNED_RECRUITS).sort()).toEqual(['dez', 'elena', 'lina', 'mateo', 'priya']);
  });

  it('ids are unique and match their keys', () => {
    const ids = Object.values(DESIGNED_RECRUITS).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [key, def] of Object.entries(DESIGNED_RECRUITS)) expect(def.id).toBe(key);
  });

  it('every skill is present and in a sane 0..10 range', () => {
    for (const def of Object.values(DESIGNED_RECRUITS)) {
      for (const sk of SKILLS) {
        const v = def.skills[sk];
        expect(v, `${def.id}.${sk}`).toBeGreaterThanOrEqual(0);
        expect(v, `${def.id}.${sk}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('every trait exists in the TRAITS table', () => {
    const known = new Set(TRAITS.map((t) => t.id));
    for (const def of Object.values(DESIGNED_RECRUITS)) {
      for (const t of def.traits) expect(known.has(t), `${def.id} trait ${t}`).toBe(true);
    }
  });

  it('every designed recruit has a designed look (no clones)', () => {
    for (const def of Object.values(DESIGNED_RECRUITS)) {
      expect(SURVIVOR_LOOKS[def.id], `${def.id} look`).toBeDefined();
    }
    // no two recruits share the full palette+build
    const sigs = Object.values(SURVIVOR_LOOKS).map((l) => `${l.skin}|${l.jacket}|${l.pants}|${l.build}`);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('the wave-4 pair carry their encounter design in the data', () => {
    // Dez joins hurt — the bandage gate in Interact matches an injured start
    expect(DESIGNED_RECRUITS.dez.status).toBe('injured');
    expect(DESIGNED_RECRUITS.dez.hp).toBeLessThan(100);
    expect(DESIGNED_RECRUITS.dez.traits).toContain('tough');
    // Priya is the radio hand: mechanics + leadership are her value
    expect(DESIGNED_RECRUITS.priya.skills.mechanics).toBeGreaterThanOrEqual(5);
    expect(DESIGNED_RECRUITS.priya.skills.leadership).toBeGreaterThanOrEqual(4);
  });
});
