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
  /** Same-tree prerequisites (perk ids) — §6.2 tier chains: each tier-2
   *  perk hangs off a tier-1, tier-3 off tier-2, the capstone off both
   *  tier-3s. Enforced by systems/skills.canBuyPerk. */
  requires?: string[];
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
  { id: 'sc_fingers', tree: 'scavenger', tier: 1, name: 'Light Fingers', desc: 'Hold-to-search −25% time, −25% noise.', effect: { searchTimeMult: 0.75, searchNoiseMult: 0.75 } },
  { id: 'sc_salvager', tree: 'scavenger', tier: 2, name: 'Salvager', desc: 'Disassembly yields +1 item.', requires: ['sc_keen'], effect: { disasmBonus: 1 } },
  { id: 'sc_locksmith', tree: 'scavenger', tier: 2, name: 'Locksmith', desc: 'A successful pick never consumes the lockpick; forced entry −50% noise.', requires: ['sc_pockets'], effect: { lockpickKept: 1, forcedEntryNoiseMult: 0.5 } },
  { id: 'sc_appraiser', tree: 'scavenger', tier: 2, name: 'Appraiser', desc: 'Barter values +20%.', requires: ['sc_fingers'], effect: { barterMult: 1.2 } },
  { id: 'sc_nightharvest', tree: 'scavenger', tier: 3, name: 'Night Harvest', desc: 'Night loot chance +15%, night stealth +10%.', requires: ['sc_salvager'], effect: { nightLootMult: 1.15, nightVisMult: 0.9 } },
  { id: 'sc_packmule', tree: 'scavenger', tier: 3, name: 'Pack Mule', desc: 'Carry capacity +8kg; heavy-tier slowdown starts 10kg later.', requires: ['sc_locksmith'], effect: { bonusCarryKg: 8, heavySlowShiftKg: 10 } },
  { id: 'sc_remembers', tree: 'scavenger', tier: 4, name: 'The Island Remembers', desc: 'Capstone — POI respawn clocks −25%; T4+ loot chance +10% everywhere.', requires: ['sc_nightharvest', 'sc_packmule'], effect: { respawnMult: 0.75, rareLootMult: 1.1 } },
  // ---- Brawler ----
  { id: 'br_heavy', tree: 'brawler', tier: 1, name: 'Heavy Swings', desc: 'Melee damage +15%.', effect: { meleeDmgMult: 1.15 } },
  { id: 'br_blocker', tree: 'brawler', tier: 1, name: 'Blocker', desc: 'Block cost −40%, block mitigation +10%.', effect: { blockCostMult: 0.6, blockPctBonus: 0.1 } },
  { id: 'br_adrenaline', tree: 'brawler', tier: 1, name: 'Adrenaline', desc: 'A kill speeds your swings +20% for 5s.', effect: { killSwingMult: 1.2 } },
  { id: 'br_cleaver', tree: 'brawler', tier: 2, name: 'Cleaver', desc: 'Melee cleave +1 target.', requires: ['br_heavy'], effect: { cleaveBonus: 1 } },
  { id: 'br_executioner', tree: 'brawler', tier: 2, name: 'Executioner', desc: '+50% damage to staggered/stunned husks.', requires: ['br_blocker'], effect: { executeMult: 1.5 } },
  { id: 'br_thickskin', tree: 'brawler', tier: 2, name: 'Thick Skin', desc: 'Armor mitigation +5% (stacks with worn gear).', requires: ['br_adrenaline'], effect: { armorBonus: 0.05 } },
  { id: 'br_secondwind', tree: 'brawler', tier: 3, name: 'Second Wind', desc: 'Once per day, a lethal hit leaves you at 1 HP.', requires: ['br_cleaver'], effect: { secondWind: 1 } },
  { id: 'br_unstoppable', tree: 'brawler', tier: 3, name: 'Unstoppable', desc: 'Knockback taken −50%; swings can\u2019t be interrupted.', requires: ['br_executioner'], effect: { uninterruptible: 1, knockbackMult: 0.5 } },
  { id: 'br_juggernaut', tree: 'brawler', tier: 4, name: 'Juggernaut', desc: 'Capstone — brute hits don\u2019t break your block; +30% melee damage below 50% HP.', requires: ['br_secondwind', 'br_unstoppable'], effect: { lowHpDmgMult: 1.3, bruteBlockHold: 1 } },
  // ---- Mechanic ----
  { id: 'me_tinkerer', tree: 'mechanic', tier: 1, name: 'Tinkerer', desc: 'Crafting feels instant — parts just fit.', effect: { craftSpeedMult: 1.25 } },
  { id: 'me_grease', tree: 'mechanic', tier: 1, name: 'Grease Monkey', desc: 'Vehicle repairs cost 1 fewer part (min 1).', effect: { repairCostBonus: -1 } },
  { id: 'me_efficient', tree: 'mechanic', tier: 1, name: 'Efficient Hands', desc: '20% chance to refund one component on any craft.', effect: { refundChance: 0.2 } },
  { id: 'me_gunsmith', tree: 'mechanic', tier: 2, name: 'Gunsmith', desc: 'Mod attach costs halved; detach returns the cost.', requires: ['me_tinkerer'], effect: { modCostMult: 0.5 } },
  { id: 'me_juryrig', tree: 'mechanic', tier: 2, name: 'Jury-Rig', desc: 'Field vehicle repair cap rises from 60% to 80%.', requires: ['me_grease'], effect: { fieldRepairCap: 0.8 } },
  { id: 'me_demolition', tree: 'mechanic', tier: 2, name: 'Demolitionist', desc: 'Grenade damage +25%, blast radius +1m.', requires: ['me_efficient'], effect: { grenadeDmgMult: 1.25, grenadeAoeBonus: 1 } },
  { id: 'me_fabricator', tree: 'mechanic', tier: 3, name: 'Fabricator', desc: 'Machine Shop fabrication time −40%.', requires: ['me_gunsmith'], effect: { fabTimeMult: 0.6 } },
  { id: 'me_scrounger', tree: 'mechanic', tier: 3, name: 'Scrounger', desc: 'Disassembly yields +1 gun part.', requires: ['me_juryrig'], effect: { gunPartsBonus: 1 } },
  { id: 'me_masterfab', tree: 'mechanic', tier: 4, name: 'Master Fabricator', desc: 'Capstone — craft gun_parts at any Weapons Bench; the turret needs no blueprint.', requires: ['me_fabricator', 'me_scrounger'], effect: { benchGunParts: 1, turretNoBlueprint: 1 } },
  // ---- Ghost ----
  { id: 'gh_soft', tree: 'ghost', tier: 1, name: 'Soft Steps', desc: 'All your noise radii −25%.', effect: { noiseMult: 0.75 } },
  { id: 'gh_shadow', tree: 'ghost', tier: 1, name: 'Shadow', desc: 'Crouched visibility −30%.', effect: { crouchVisMult: 0.7 } },
  { id: 'gh_patient', tree: 'ghost', tier: 1, name: 'Patient', desc: 'Searching makes no extra noise.', effect: { quietSearch: 1 } },
  { id: 'gh_backstab', tree: 'ghost', tier: 2, name: 'Backstab', desc: 'Melee ×3 from behind or against unaware husks.', requires: ['gh_soft'], effect: { backstabMult: 3 } },
  { id: 'gh_vanish', tree: 'ghost', tier: 2, name: 'Vanish', desc: 'Flashbang blind radius +4m; breaking line of sight is 2× faster.', requires: ['gh_shadow'], effect: { flashRadiusBonus: 4, losBreakMult: 2 } },
  { id: 'gh_nightowl', tree: 'ghost', tier: 2, name: 'Night Owl', desc: 'Night stealth +20%, slight night vision (ambient lift).', requires: ['gh_patient'], effect: { nightStealthMult: 0.8 } },
  { id: 'gh_lootghost', tree: 'ghost', tier: 3, name: 'Loot Ghost', desc: 'Containers never make search noise; alarms trip half as often against you.', requires: ['gh_backstab'], effect: { alarmMult: 0.5, searchSilent: 1 } },
  { id: 'gh_coldblood', tree: 'ghost', tier: 3, name: 'Cold Blood', desc: 'Screamer screams don\u2019t mark you — the horde-call misses.', requires: ['gh_vanish'], effect: { screamImmune: 1 } },
  { id: 'gh_unseen', tree: 'ghost', tier: 4, name: 'Unseen', desc: 'Capstone — crouched, still, and shadowed: husks can\u2019t see you past 3m.', requires: ['gh_lootghost', 'gh_coldblood'], effect: { unseen: 1 } },
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
