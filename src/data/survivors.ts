// Survivors — generation, traits, morale, designed recruits.
// Spec: SYSTEMS_SPEC.md §5.

import type { SkillId } from './skills';

export type SurvivorJob =
  | 'Builder' | 'Mechanic' | 'Medic' | 'Farmer' | 'Scavenger' | 'Guard' | 'Operator' | 'Idle';

export interface SurvivorDef {
  id: string;
  name: string;
  age: number;
  background: string;
  skills: Record<SkillId, number>;
  traits: string[];
  morale: number; // 0–100
  hp: number;
  status: 'healthy' | 'injured' | 'sick';
  job: SurvivorJob | null;
}

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  moraleDrift?: number; // per day
  exclusiveWith?: string[];
}

export const TRAITS: TraitDef[] = [
  { id: 'optimist', name: 'Optimist', desc: 'Morale drifts up.', moraleDrift: 1, exclusiveWith: ['pessimist'] },
  { id: 'pessimist', name: 'Pessimist', desc: 'Morale drifts down.', moraleDrift: -1, exclusiveWith: ['optimist'] },
  { id: 'cowardly', name: 'Cowardly', desc: 'Fights at 70% — but never gets hurt fleeing.', exclusiveWith: ['brave'] },
  { id: 'brave', name: 'Brave', desc: 'Fights at 130%. A won siege lifts them.', exclusiveWith: ['cowardly'] },
  { id: 'night_owl', name: 'Night Owl', desc: 'Works better on night shifts.', exclusiveWith: ['early_bird'] },
  { id: 'early_bird', name: 'Early Bird', desc: 'Works better on day shifts.', exclusiveWith: ['night_owl'] },
  { id: 'ex_military', name: 'Ex-Military', desc: 'Guard duty at 130%. Fights at 140%.' },
  { id: 'strong_back', name: 'Strong Back', desc: 'Scavenging yields +25%. Eats +20%.' },
  { id: 'quick_hands', name: 'Quick Hands', desc: 'Mechanic output +25%, repairs faster.' },
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Farming output +30%.' },
  { id: 'iron_stomach', name: 'Iron Stomach', desc: 'Eats 25% less. Rarely sick.' },
  { id: 'clumsy', name: 'Clumsy', desc: 'The loud one. 50% more noise.' },
  { id: 'quiet', name: 'Quiet', desc: '30% less noise on stealth work.' },
  { id: 'loner', name: 'Loner', desc: 'Happier in small crews.', exclusiveWith: ['social'] },
  { id: 'social', name: 'Social', desc: 'Happier in big crews.', exclusiveWith: ['loner'] },
  { id: 'sickly', name: 'Sickly', desc: 'Gets sick twice as often, heals slower.' },
  { id: 'tough', name: 'Tough', desc: '130 HP. Recovers fast.' },
];

const FIRST_M = ['Elias', 'Marcus', 'Tommy', 'Ray', 'Deacon', 'Wade', 'Silas', 'Cole', 'Beau', 'Grady', 'Hank', 'Miles', 'Jasper', 'Theo', 'Nate', 'Otis', 'Rufus', 'Cal', 'Dane', 'Ellis', 'Ford', 'Gus', 'Harlan', 'Ike', 'Judd', 'Knox', 'Levi', 'Mack', 'Nolan', 'Pierce', 'Reed', 'Seth', 'Tate', 'Virgil', 'Wesley', 'Zeke', 'Abel', 'Boone'];
const FIRST_F = ['Mara', 'June', 'Wren', 'Sadie', 'Nora', 'Iris', 'Hazel', 'Ruby', 'Pearl', 'Opal', 'Della', 'Cora', 'Maeve', 'Tilly', 'Rosa', 'Ada', 'Bea', 'Clara', 'Dora', 'Effie', 'Flora', 'Greta', 'Hattie', 'Ida', 'Josie', 'Kit', 'Lena', 'Mabel', 'Nell', 'Olive', 'Penny', 'Ruth', 'Sylvie', 'Tess', 'Una', 'Vera', 'Winnie', 'Yara'];
const LAST = ['Meeks', 'Banks', 'Drift', 'Salter', 'Wanchese', 'Manteo', 'Hatteras', 'Kinnakeet', 'Rodanthe', 'Avon', 'Buxton', 'Frisco', 'Ocracoke', 'Nags', 'Kitty', 'Duck', 'Corolla', 'Colington', 'Scarborough', 'Etheridge', 'Midgett', 'O\u2019Neal', 'Tillett', 'Daniels', 'Gray', 'Forbes', 'Perry', 'Hooper', 'Mann', 'Hayman', 'Creef', 'Basnight', 'Twiford', 'Meekins', 'Austin', 'Parker', 'Dowdy'];

const BACKGROUNDS: { name: string; spike: SkillId }[] = [
  { name: 'ex-firefighter', spike: 'combat' },
  { name: 'ferry mechanic', spike: 'mechanics' },
  { name: 'ER nurse', spike: 'medicine' },
  { name: 'park ranger', spike: 'stealth' },
  { name: 'tow-truck driver', spike: 'driver' },
  { name: 'antique picker', spike: 'scavenging' },
  { name: 'church deacon', spike: 'leadership' },
  { name: 'charter captain', spike: 'driver' },
  { name: 'line cook', spike: 'scavenging' },
  { name: 'schoolteacher', spike: 'leadership' },
];

const SKILL_IDS: SkillId[] = ['combat', 'mechanics', 'medicine', 'stealth', 'driver', 'scavenging', 'leadership'];

let survCounter = 0;

export function generateSurvivor(rng: () => number, moraleStart = 50): SurvivorDef {
  const female = rng() < 0.5;
  const first = female ? FIRST_F[Math.floor(rng() * FIRST_F.length)] : FIRST_M[Math.floor(rng() * FIRST_M.length)];
  const last = LAST[Math.floor(rng() * LAST.length)];
  const bg = BACKGROUNDS[Math.floor(rng() * BACKGROUNDS.length)];
  const skills = Object.fromEntries(SKILL_IDS.map((k) => [k, 0])) as Record<SkillId, number>;
  skills[bg.spike] = 6 + Math.floor(rng() * 2);
  let pool = 6 + Math.floor(rng() * 7); // 12–20 total-ish with spike
  let guard = 40;
  while (pool > 0 && guard-- > 0) {
    const k = SKILL_IDS[Math.floor(rng() * SKILL_IDS.length)];
    if (skills[k] < 10) {
      skills[k]++;
      pool--;
    }
  }
  const traits: string[] = [];
  const nTraits = 2 + (rng() < 0.4 ? 1 : 0);
  let tGuard = 30;
  while (traits.length < nTraits && tGuard-- > 0) {
    const t = TRAITS[Math.floor(rng() * TRAITS.length)];
    if (traits.includes(t.id)) continue;
    if (t.exclusiveWith?.some((x) => traits.includes(x))) continue;
    traits.push(t.id);
  }
  const tough = traits.includes('tough');
  return {
    id: `surv_${Date.now().toString(36)}_${survCounter++}`,
    name: `${first} ${last}`,
    age: 19 + Math.floor(rng() * 40),
    background: bg.name,
    skills,
    traits,
    morale: moraleStart,
    hp: tough ? 130 : 100,
    status: 'healthy',
    job: null,
  };
}

/** The designed recruits — sodgame's starting roster, homed per the spec. */
export const DESIGNED_RECRUITS: Record<string, SurvivorDef> = {
  elena: {
    id: 'elena', name: 'Elena Marsh', age: 34, background: 'ER nurse',
    skills: { combat: 2, mechanics: 1, medicine: 7, stealth: 2, driver: 3, scavenging: 3, leadership: 2 },
    traits: ['iron_stomach', 'optimist'], morale: 55, hp: 100, status: 'healthy', job: 'Medic',
  },
  mateo: {
    id: 'mateo', name: 'Mateo Reyes', age: 29, background: 'tow-truck driver',
    skills: { combat: 3, mechanics: 7, medicine: 0, stealth: 1, driver: 6, scavenging: 4, leadership: 1 },
    traits: ['quick_hands'], morale: 50, hp: 100, status: 'healthy', job: 'Mechanic',
  },
  lina: {
    id: 'lina', name: 'Lina Voss', age: 26, background: 'park ranger',
    skills: { combat: 4, mechanics: 1, medicine: 2, stealth: 7, driver: 2, scavenging: 5, leadership: 0 },
    traits: ['quiet', 'night_owl'], morale: 50, hp: 100, status: 'healthy', job: 'Scavenger',
  },
};

export function traitName(id: string): string {
  return TRAITS.find((t) => t.id === id)?.name ?? id;
}

export function moraleBand(m: number): 'Content' | 'Neutral' | 'Unhappy' | 'Breaking' {
  if (m >= 75) return 'Content';
  if (m >= 40) return 'Neutral';
  if (m >= 20) return 'Unhappy';
  return 'Breaking';
}
