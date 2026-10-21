import type { QuestDef } from '../store/types';

// v0.1.0 vertical slice: prologue + one main chain ending at The Lighthouse.
// Quest targets: 'poi:<id>' positions come from the engine's POI registry;
// 'npc:<id>' talks resolve through dialogue; 'husk' kills; item ids for collect.
//
// STORY AUDIT (Lane 9, 2026-10-21 — chain verified in the purged world):
// prologue (dialogue questEvent boat_choice → prologue_done) → q1 Jonah
// (talk + met_jonah) → q2 phone (wreck collect → phone_unlocked) → q3 relay
// (5 husks + relay_switch interact → relay_online, which is also Priya's
// recruit gate in Interact: requiresFlag 'relay_online' ✓) → q4 parts →
// q5 beacon: Interact opens Kowalski's beacon_choice dialogue at the lamp
// room; DialogueOverlay fires questEvent('choice','beacon_choice') and
// triggerEnding('light'|'dark'); the choices set beacon_lit / beacon_dark —
// the hardmode seed (FACTIONS_CANON Decision 4). Chain is intact end-to-end.
export const QUESTS: QuestDef[] = [
  {
    id: 'q_prologue',
    title: 'The Static Took Everything',
    giver: 'Cal Vega',
    brief: 'Get off Tern Rock. Whatever it costs.',
    steps: [
      { id: 's1', objective: 'Decide at the boat', type: 'choice', target: 'boat_choice', count: 1 },
      { id: 's2', objective: 'Reach the shore camp', type: 'reach', target: 'poi:shore_camp', count: 1 },
    ],
    rewards: {
      items: [{ id: 'pipe', qty: 1 }, { id: 'canned_food', qty: 2 }],
      flags: ['prologue_done'],
    },
  },
  {
    id: 'q1_first_light',
    title: 'First Light',
    giver: 'Jonah Reyes',
    brief: 'Find the survivor at the campfire and hear him out.',
    steps: [
      { id: 's1', objective: 'Talk to Jonah at the camp', type: 'talk', target: 'npc:jonah', count: 1 },
    ],
    rewards: {
      items: [{ id: 'bandage', qty: 2 }],
      flags: ['met_jonah'],
    },
    startsWhen: { questDone: 'q_prologue' },
  },
  {
    id: 'q2_dead_air',
    title: 'Dead Air',
    giver: 'Jonah Reyes',
    brief: 'Jonah saw a handset go down with the wreck. A working phone changes everything.',
    steps: [
      { id: 's1', objective: 'Recover the sat phone from the wreck', type: 'collect', target: 'phone', count: 1 },
    ],
    rewards: {
      flags: ['phone_unlocked'],
      items: [{ id: 'ammo_9mm', qty: 12 }],
    },
    startsWhen: { questDone: 'q1_first_light' },
  },
  {
    id: 'q3_clear_relay',
    title: 'Clear the Relay',
    giver: 'Dr. Anya Kowalski',
    brief: 'The relay station is crawling. Clear it and throw the switch so the Collective can hear again.',
    steps: [
      { id: 's1', objective: 'Destroy husks at the relay station (0/5)', type: 'kill', target: 'husk', count: 5 },
      { id: 's2', objective: 'Throw the relay switch', type: 'interact', target: 'poi:relay_switch', count: 1 },
    ],
    rewards: {
      rep: [{ faction: 'lighthouse', amount: 25 }],
      items: [{ id: 'pistol', qty: 1 }, { id: 'ammo_9mm', qty: 24 }],
      flags: ['relay_online'],
    },
    startsWhen: { flag: 'phone_unlocked' },
  },
  {
    id: 'q4_parts',
    title: 'Parts for Kowalski',
    giver: 'Dr. Anya Kowalski',
    brief: 'Kowalski needs three relay capacitors for the beacon. Bring them to the lighthouse.',
    steps: [
      { id: 's1', objective: 'Find relay capacitors (0/3)', type: 'collect', target: 'relay_part', count: 3 },
      { id: 's2', objective: 'Bring the parts to Kowalski', type: 'talk', target: 'npc:kowalski', count: 1 },
    ],
    rewards: {
      rep: [{ faction: 'lighthouse', amount: 30 }],
      items: [{ id: 'pack_t1', qty: 1 }, { id: 'medkit', qty: 1 }],
      flags: ['kowalski_helped'],
    },
    startsWhen: { questDone: 'q3_clear_relay' },
  },
  {
    id: 'q5_beacon',
    title: 'The Beacon',
    giver: 'Dr. Anya Kowalski',
    brief: 'Climb the lighthouse. Decide what the light is for.',
    steps: [
      { id: 's1', objective: 'Reach the lamp room', type: 'reach', target: 'poi:lighthouse_top', count: 1 },
      { id: 's2', objective: 'Decide the beacon’s fate', type: 'choice', target: 'beacon_choice', count: 1 },
    ],
    rewards: { flags: ['ending_ready'] },
    startsWhen: { questDone: 'q4_parts' },
  },
  {
    // FACTIONS_CANON §2.7: the Enclave is a rumor — dead drops and ONE radio
    // burst on a dead frequency, never an answer. The burst (worldWiring
    // ENCLAVE_RADIO_BURST) fires after the relay lives and sets
    // 'enclave_burst_heard', which starts this chain. Cache interactables
    // (wiring step W6) fire questEvent('interact', 'cache:<cacheId>').
    id: 'q_enclave_burst',
    title: 'A Voice on a Dead Frequency',
    giver: 'Unknown frequency',
    brief: 'Once the relay breathed again, something answered on a band that has been dead for eighteen months. Whoever they are, they leave things behind. Find what they left.',
    steps: [
      { id: 's1', objective: 'Open the dead drop at the forest cache', type: 'interact', target: 'cache:enclave_cache_forest', count: 1 },
      { id: 's2', objective: 'Open the dead drop at the wreck', type: 'interact', target: 'cache:enclave_cache_wreck', count: 1 },
      { id: 's3', objective: 'Open the dead drop in the dunes', type: 'interact', target: 'cache:enclave_cache_dune', count: 1 },
    ],
    rewards: {
      items: [{ id: 'gun_parts', qty: 2 }, { id: 'wire', qty: 2 }],
      flags: ['enclave_evidence'],
    },
    startsWhen: { flag: 'enclave_burst_heard' },
  },
];
