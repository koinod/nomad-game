// Skills & archetypes — XP-by-use substrate (7 skills) + 4 perk trees.
// Spec: SYSTEMS_SPEC.md §6. Perk effects are wired progressively; each perk's
// `effect` record is the contract the game systems read.

export type SkillId =
  | 'combat' | 'mechanics' | 'medicine' | 'stealth' | 'driver' | 'scavenging' | 'leadership';

export const SKILLS: { id: SkillId; name: string; blurb: string }[] = [
  { id: 'combat', name: 'Combat', blurb: 'Earned in fights — melee and ranged kills.' },
  { id: 'mechanics', name: 'Mechanics', blurb: 'Earned at benches — crafting and repair.' },
  { id: 'medicine', name: 'Medicine', blurb: 'Earned patching yourself and others.' },
  { id: 'stealth', name: 'Stealth', blurb: 'Earned searching unseen and losing pursuers.' },
  { id: 'driver', name: 'Driver', blurb: 'Earned behind the wheel, clean miles.' },
  { id: 'scavenging', name: 'Scavenging', blurb: 'Earned looting, picking, and harvesting.' },
  { id: 'leadership', name: 'Leadership', blurb: 'Earned leading people — recruits and orders.' },
];

export function xpToNext(level: number): number {
  return 80 + 40 * level;
}

export type TreeId = 'scavenger' | 'brawler' | 'mechanic' | 'ghost';

export interface PerkDef {
  id: string;
  tree: TreeId;
  tier: 1 | 2 | 3 | 4; // 4 = capstone
  name: string;
  desc: string;
  effect: Record<string, number | boolean>;
}

export const TREES: { id: TreeId; name: string; blurb: string }[] = [
  { id: 'scavenger', name: 'Scavenger', blurb: 'The economy tree — find more, carry more, waste nothing.' },
  { id: 'brawler', name: 'Brawler', blurb: 'The melee tree — hit harder, stand longer.' },
  { id: 'mechanic', name: 'Mechanic', blurb: 'The maker tree — craft better, fix anything.' },
  { id: 'ghost', name: 'Ghost', blurb: 'The stealth tree — be quieter than the world.' },
];

export const PERKS: PerkDef[] = [
  // ---- Scavenger ----
  { id: 'sc_keen', tree: 'scavenger', tier: 1, name: 'Keen Eye', desc: 'Loot chance +10% on searched containers.', effect: { lootChanceMult: 1.1 } },
  { id: 'sc_pockets', tree: 'scavenger', tier: 1, name: 'Deep Pockets', desc: '+4 pack slots.', effect: { bonusSlots: 4 } },
  { id: 'sc_fingers', tree: 'scavenger', tier: 1, name: 'Light Fingers', desc: 'Hold-to-search −25% time.', effect: { searchTimeMult: 0.75 } },
  { id: 'sc_salvager', tree: 'scavenger', tier: 2, name: 'Salvager', desc: 'Disassembly yields +1 item.', effect: { disasmBonus: 1 } },
  { id: 'sc_locksmith', tree: 'scavenger', tier: 2, name: 'Locksmith', desc: 'A successful pick never consumes the lockpick.', effect: { lockpickKept: 1 } },
  { id: 'sc_appraiser', tree: 'scavenger', tier: 2, name: 'Appraiser', desc: 'Barter values +20%.', effect: { barterMult: 1.2 } },
  { id: 'sc_nightharvest', tree: 'scavenger', tier: 3, name: 'Night Harvest', desc: 'Night loot chance +15%.', effect: { nightLootMult: 1.15 } },
  { id: 'sc_packmule', tree: 'scavenger', tier: 3, name: 'Pack Mule', desc: 'Carry capacity +8kg.', effect: { bonusCarryKg: 8 } },
  { id: 'sc_remembers', tree: 'scavenger', tier: 4, name: 'The Island Remembers', desc: 'Capstone — POI respawn clocks −25%; rare loot +10% everywhere.', effect: { respawnMult: 0.75, rareLootMult: 1.1 } },
  // ---- Brawler ----
  { id: 'br_heavy', tree: 'brawler', tier: 1, name: 'Heavy Swings', desc: 'Melee damage +15%.', effect: { meleeDmgMult: 1.15 } },
  { id: 'br_blocker', tree: 'brawler', tier: 1, name: 'Blocker', desc: 'Blocking costs 40% less stamina.', effect: { blockCostMult: 0.6 } },
  { id: 'br_adrenaline', tree: 'brawler', tier: 1, name: 'Adrenaline', desc: 'A kill speeds your swings +20% for 5s.', effect: { killSwingMult: 1.2 } },
  { id: 'br_cleaver', tree: 'brawler', tier: 2, name: 'Cleaver', desc: 'Melee cleave +1 target.', effect: { cleaveBonus: 1 } },
  { id: 'br_executioner', tree: 'brawler', tier: 2, name: 'Executioner', desc: '+50% damage to stunned or staggered husks.', effect: { executeMult: 1.5 } },
  { id: 'br_thickskin', tree: 'brawler', tier: 2, name: 'Thick Skin', desc: 'Armor mitigation +5% (stacks with worn gear).', effect: { armorBonus: 0.05 } },
  { id: 'br_secondwind', tree: 'brawler', tier: 3, name: 'Second Wind', desc: 'Once per day, a lethal hit leaves you at 1 HP.', effect: { secondWind: 1 } },
  { id: 'br_unstoppable', tree: 'brawler', tier: 3, name: 'Unstoppable', desc: 'Swings can\u2019t be interrupted.', effect: { uninterruptible: 1 } },
  { id: 'br_juggernaut', tree: 'brawler', tier: 4, name: 'Juggernaut', desc: 'Capstone — +30% melee damage below 50% HP.', effect: { lowHpDmgMult: 1.3 } },
  // ---- Mechanic ----
  { id: 'me_tinkerer', tree: 'mechanic', tier: 1, name: 'Tinkerer', desc: 'Crafting feels instant — parts just fit.', effect: { craftSpeedMult: 1.25 } },
  { id: 'me_grease', tree: 'mechanic', tier: 1, name: 'Grease Monkey', desc: 'Vehicle repairs cost 1 fewer part (min 1).', effect: { repairCostBonus: -1 } },
  { id: 'me_efficient', tree: 'mechanic', tier: 1, name: 'Efficient Hands', desc: '20% chance to refund one component on any craft.', effect: { refundChance: 0.2 } },
  { id: 'me_gunsmith', tree: 'mechanic', tier: 2, name: 'Gunsmith', desc: 'Mod attach costs halved; detach returns the cost.', effect: { modCostMult: 0.5 } },
  { id: 'me_juryrig', tree: 'mechanic', tier: 2, name: 'Jury-Rig', desc: 'Field vehicle repair cap rises to 80%.', effect: { fieldRepairCap: 0.8 } },
  { id: 'me_demolition', tree: 'mechanic', tier: 2, name: 'Demolitionist', desc: 'Grenade damage +25%, blast radius +1m.', effect: { grenadeDmgMult: 1.25, grenadeAoeBonus: 1 } },
  { id: 'me_fabricator', tree: 'mechanic', tier: 3, name: 'Fabricator', desc: 'Machine Shop work costs 40% fewer parts.', effect: { fabCostMult: 0.6 } },
  { id: 'me_scrounger', tree: 'mechanic', tier: 3, name: 'Scrounger', desc: 'Disassembly yields +1 gun part.', effect: { gunPartsBonus: 1 } },
  { id: 'me_masterfab', tree: 'mechanic', tier: 4, name: 'Master Fabricator', desc: 'Capstone — craft gun_parts at any Weapons Bench.', effect: { benchGunParts: 1 } },
  // ---- Ghost ----
  { id: 'gh_soft', tree: 'ghost', tier: 1, name: 'Soft Steps', desc: 'All your noise radii −25%.', effect: { noiseMult: 0.75 } },
  { id: 'gh_shadow', tree: 'ghost', tier: 1, name: 'Shadow', desc: 'Crouched visibility −30%.', effect: { crouchVisMult: 0.7 } },
  { id: 'gh_patient', tree: 'ghost', tier: 1, name: 'Patient', desc: 'Searching makes no extra noise.', effect: { quietSearch: 1 } },
  { id: 'gh_backstab', tree: 'ghost', tier: 2, name: 'Backstab', desc: 'Melee ×3 from behind or against unaware husks.', effect: { backstabMult: 3 } },
  { id: 'gh_vanish', tree: 'ghost', tier: 2, name: 'Vanish', desc: 'Flashbang blind radius +4m.', effect: { flashRadiusBonus: 4 } },
  { id: 'gh_nightowl', tree: 'ghost', tier: 2, name: 'Night Owl', desc: 'Night stealth +20%.', effect: { nightStealthMult: 0.8 } },
  { id: 'gh_lootghost', tree: 'ghost', tier: 3, name: 'Loot Ghost', desc: 'Alarms trip half as often against you.', effect: { alarmMult: 0.5 } },
  { id: 'gh_coldblood', tree: 'ghost', tier: 3, name: 'Cold Blood', desc: 'Screamer calls miss you.', effect: { screamImmune: 1 } },
  { id: 'gh_unseen', tree: 'ghost', tier: 4, name: 'Unseen', desc: 'Capstone — crouched, still, and shadowed: husks can\u2019t see you past 3m.', effect: { unseen: 1 } },
];

export function perkById(id: string): PerkDef | undefined {
  return PERKS.find((p) => p.id === id);
}

/** Numeric effect lookup for game systems: sum/override from owned perks. */
export function perkNum(owned: readonly string[], key: string, fallback: number): number {
  let v = fallback;
  for (const id of owned) {
    const p = perkById(id);
    const e = p?.effect[key];
    if (typeof e === 'number') v = e;
  }
  return v;
}
