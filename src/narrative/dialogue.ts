import type { DialogueNode } from '../store/types';

export const PROLOGUE_START = 'start';

export const PROLOGUE_SCRIPT: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    speaker: 'Cass',
    lines: [
      'Cold first. Then the ringing.',
      'I wake up on wet rock with a name I almost remember and a wedding ring I don\u2019t.',
      'The Static took eighteen months of me. Maybe. The water took the rest.',
    ],
    next: 'static',
  },
  static: {
    id: 'static',
    speaker: 'Cass',
    lines: [
      'They come at dusk. People call them husks — what\u2019s left of anyone the Static got to.',
      'They\u2019re already moving along the treeline. I can hear them the way you hear weather.',
      'The boat is still tied off. And Cal hasn\u2019t moved since the wave threw us.',
    ],
    next: 'cal_leg',
  },
  cal_leg: {
    id: 'cal_leg',
    speaker: 'Cal',
    lines: [
      'Go on, then.',
      'My leg\u2019s finished, Cass. I can feel it grinding when I breathe.',
      'That boat holds one of us. Maybe one and a half, on a good day.',
    ],
    next: 'boat',
  },
  boat: {
    id: 'boat',
    speaker: 'Cass',
    lines: [
      'The husks are at the rocks now. Thirty seconds, maybe less.',
      'His hand is on my wrist. Not pulling. Just there.',
    ],
    choices: [
      {
        id: 'sacrifice_cal',
        label: 'Leave him — the boat only holds one',
        setFlags: ['sacrificed_cal'],
        next: 'sacrifice_after',
      },
      {
        id: 'leave_cal',
        label: 'Drag him aboard anyway',
        setFlags: ['left_cal'],
        next: 'leave_after',
      },
    ],
  },
  sacrifice_after: {
    id: 'sacrifice_after',
    speaker: 'Cal',
    lines: [
      'There it is. That\u2019s the one I know.',
      'Find out who you were, Cass. And if it was anyone worth being — be them louder.',
    ],
    questEvent: { type: 'choice', target: 'boat_choice', count: 1 },
    setFlags: ['prologue_done'],
    next: 'shore',
  },
  leave_after: {
    id: 'leave_after',
    speaker: 'Cal',
    lines: [
      'You\u2019re going to kill us both, you know that.',
      '...All right. On three. And Cass — whatever I was to you before, it was worth it.',
    ],
    questEvent: { type: 'choice', target: 'boat_choice', count: 1 },
    setFlags: ['prologue_done'],
    next: 'shore',
  },
  shore: {
    id: 'shore',
    speaker: 'Cass',
    lines: [
      'The mainland never got closer. The water took the boat, the rocks took everything else.',
      'I wash up on a beach I don\u2019t know, under a sky that won\u2019t explain itself.',
      'Somewhere inland there\u2019s a campfire. Smoke means someone. Someone means a chance.',
    ],
    next: null,
  },
};

export const NPC_DIALOGUES: Record<
  'npc:jonah' | 'npc:kowalski',
  { start: string; nodes: Record<string, DialogueNode> }
> = {
  'npc:jonah': {
    start: 'start',
    nodes: {
      start: {
        id: 'start',
        speaker: 'Jonah',
        lines: [
          'Easy. You\u2019re shaking like a wet dog.',
          'I\u2019m Jonah. This is my fire, those are my beans, and you look like the ocean chewed you up.',
          'You don\u2019t remember much, do you? Yeah. The Static does that to the ones it doesn\u2019t take outright.',
        ],
        questEvent: { type: 'talk', target: 'npc:jonah' },
        setFlags: ['met_jonah'],
        next: 'static_explained',
      },
      static_explained: {
        id: 'static_explained',
        speaker: 'Jonah',
        lines: [
          'Eighteen months ago every radio on the coast screamed at once. Then people just... stopped being people.',
          'The husks aren\u2019t dead, not exactly. They\u2019re tuned wrong, like a station that won\u2019t come in.',
          'Daylight slows them. Night doesn\u2019t. Plan around that and you might keep your skin.',
        ],
        next: 'wreck_phone',
      },
      wreck_phone: {
        id: 'wreck_phone',
        speaker: 'Jonah',
        lines: [
          'That wreck down the beach — something in it still has power. A phone, maybe. It pings now and then.',
          'If it still works, take it. A working screen out here is worth more than a gun.',
          'Whatever it shows you, trust the map more than your memory. Memory\u2019s a liar since the Static.',
        ],
        next: 'lighthouse_mention',
      },
      lighthouse_mention: {
        id: 'lighthouse_mention',
        speaker: 'Jonah',
        lines: [
          'Head east when you\u2019re ready. There\u2019s a lighthouse, and a woman there named Kowalski who hears things in the radio noise.',
          'She\u2019s looking for someone who can move quiet and carry heavy. Sounds like you, if the day goes well.',
          'Eat first. The husks can wait. They\u2019re patient, but so are we.',
        ],
        setFlags: ['jonah_briefed'],
        next: null,
      },
    },
  },
  'npc:kowalski': {
    start: 'start',
    nodes: {
      start: {
        id: 'start',
        speaker: 'Kowalski',
        lines: [
          'You\u2019re the one Jonah sent. Good. He talks too much, which means he trusts you.',
          'I\u2019m Dr. Anya Kowalski. Before the Static I built relay towers. Now I\u2019m trying to rebuild one from wreckage and spite.',
        ],
        questEvent: { type: 'talk', target: 'npc:kowalski' },
        setFlags: ['met_kowalski'],
        next: 'relay_brief',
      },
      relay_brief: {
        id: 'relay_brief',
        speaker: 'Kowalski',
        lines: [
          'The relay station west of here went dark last week. Five husks nest in the ruins now — they like the hum.',
          'I need three capacitors from the forest and dune caches, and the station switch thrown. Then this lighthouse talks again.',
          'And Cass? When the lamp is lit, everyone left on this coast will see it. That is the point. And the risk.',
        ],
        setFlags: ['kowalski_briefed'],
        next: 'beacon_choice',
      },
      beacon_choice: {
        id: 'beacon_choice',
        speaker: 'Kowalski',
        lines: [
          'The beacon is ready. The switch is yours.',
          'Light it, and every survivor in range comes home — and so does everything that hunts them.',
          'Leave it dark, and we stay hidden. Safe. Alone. Decide.',
        ],
        choices: [
          {
            id: 'light_beacon',
            label: 'Light the beacon — call everyone home',
            setFlags: ['beacon_lit'],
            next: null,
          },
          {
            id: 'dark_beacon',
            label: 'Let it stay dark',
            setFlags: ['beacon_dark'],
            next: null,
          },
        ],
      },
    },
  },
};

export const ENDING_LINES: string[] = [
  'The lamp turns. The light goes out over the water, steady as a held breath.',
  'Somewhere east, a campfire flares — someone answering.',
  'I still don\u2019t know who I was before the Static. The ring is still a stranger on my hand.',
  'But I know what I did on Tern Rock. I know what it cost.',
  'Kowalski keeps the signal alive. Jonah keeps the fire lit. I keep moving.',
  'The husks are still out there, tuned wrong, waiting for the dark.',
  'So am I, in a way. Waiting for morning. It always comes.',
  'This is Cass. If you can hear this — come home.',
];
