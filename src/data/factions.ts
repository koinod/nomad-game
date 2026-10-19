import type { FactionDef } from '../store/types';

export const FACTIONS: FactionDef[] = [
  {
    id: 'lighthouse', name: 'Lighthouse Collective', leader: 'Dr. Anya Kowalski',
    role: 'Radio, tech, mods', desc: 'Holdouts at Bodie Light rebuilding the radio net, one tower at a time.',
    inSlice: true,
  },
  {
    id: 'pier', name: 'The Pier', leader: 'Cpt. Idris Boudreaux',
    role: 'Fishing, food, honest trade', desc: 'Hatteras harbor crew. They trade fair and remember who doesn’t.',
    inSlice: true,
  },
  {
    id: 'refuge', name: 'The Refuge', leader: 'Sister Mariah Okonkwo',
    role: 'Medicine, peace', desc: 'Pea Island sanctuary. Beyond the scope of this slice.',
    inSlice: false,
  },
  {
    id: 'tollkeepers', name: 'The Tollkeepers', leader: 'Wraith',
    role: 'Bridge control, tribute', desc: 'They hold the Wright Memorial Bridge. Beyond the scope of this slice.',
    inSlice: false,
  },
  {
    id: 'drowned', name: 'The Drowned', leader: 'Cpt. Selene Vesper',
    role: 'Boats, salvage', desc: 'Pamlico Sound flotilla. Beyond the scope of this slice.',
    inSlice: false,
  },
  {
    id: 'hollow', name: 'Hollow Market', leader: 'The Accountant',
    role: 'Explosives, black trade', desc: 'Ocracoke night market. Beyond the scope of this slice.',
    inSlice: false,
  },
];

export type RepTier = 'Hostile' | 'Wary' | 'Neutral' | 'Friendly' | 'Allied';

export function repTier(rep: number): RepTier {
  if (rep <= -50) return 'Hostile';
  if (rep <= -10) return 'Wary';
  if (rep < 10) return 'Neutral';
  if (rep < 50) return 'Friendly';
  return 'Allied';
}
