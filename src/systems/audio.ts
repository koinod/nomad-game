// Procedural WebAudio: zero assets. All sounds synthesized on the fly.
//
// AUDIO PASS (2026-10-22): this module grew from a one-shot synth box
// into the game's audio engine. What it is now:
//
//  - A mixer: sources route through four buses (env / vehicle / combat /
//    ui) -> a shared "room" lowpass (interior muffling) -> master ->
//    destination. Master carries the persisted volume + mute.
//  - A voice-managed one-shot player: at most MAX_VOICES simultaneous
//    one-shot voices; overflow steals the oldest-quietest voice.
//  - Positional playback: play(name, { at: {x, z} }) attenuates and
//    pans against the listener the game feeds in via setListener().
//  - Persistent environment layers (wind / rain / surf / marsh buzz)
//    driven by audioEngine.setEnvironment() from the weather snapshot,
//    the terrain zone sampler and the kit roof query. Thunder is
//    scheduled from the storm state — the game has NO lightning system
//    to sync to (documented gap: thunder is flavour-timed, not
//    flash-synced).
//  - A vehicle voice (engine + tires) driven from the powertrain's
//    real rpm/gear state.
//  - Per-class gunshots (sfx.gunshot), per-kind husk vocals
//    (sfx.vocal) and per-surface footsteps (sfx.step + StepClock,
//    keyed to the same distance clocks the animation uses).
//
// The AudioContext is created lazily on first play()/unlock() and
// resumed there, so the module survives before any user gesture.
// One-time pointer/key listeners (registered at import, browser only)
// perform the gesture unlock the autoplay policy wants.

export type SfxName =
  | 'swing' | 'shot' | 'hit' | 'hurt' | 'pickup' | 'ui'
  | 'step' | 'quest' | 'eat' | 'phone' | 'switch' | 'beacon' | 'craft'
  | 'tick' | 'killconfirm' | 'headshot' | 'thud' | 'jam' | 'dryfire'
  | 'shriek' | 'burst' | 'spit';

export type AudioBus = 'env' | 'vehicle' | 'combat' | 'ui';

export interface PlayOpts {
  volume?: number;
  /** World position of the sound; attenuated + panned vs the listener. */
  at?: { x: number; z: number };
  /** Override the name's default bus. */
  bus?: AudioBus;
}

// ---------------------------------------------------------------------------
// Context, buses, master
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let roomFilter: BiquadFilterNode | null = null;
const buses: Record<AudioBus, GainNode | null> = { env: null, vehicle: null, combat: null, ui: null };
let muted = false;
let masterVolume = 1;
let noiseBuf: AudioBuffer | null = null;

function busNode(bus: AudioBus): GainNode | null {
  return buses[bus] ?? master;
}

/** Get (and lazily create) the shared context + graph. Never throws. */
function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext;
      if (!AC) return null;
      ctx = new AC();
      roomFilter = ctx.createBiquadFilter();
      roomFilter.type = 'lowpass';
      roomFilter.frequency.value = 16000;
      roomFilter.Q.value = 0.4;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : masterVolume;
      roomFilter.connect(master);
      master.connect(ctx.destination);
      (Object.keys(buses) as AudioBus[]).forEach((b) => {
        const g = ctx!.createGain();
        g.gain.value = 1;
        g.connect(roomFilter!);
        buses[b] = g;
      });
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function getNoise(): AudioBuffer | null {
  const c = ac();
  if (!c) return null;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// ---------------------------------------------------------------------------
// Voice management: a hard cap on simultaneous one-shot voices.
// Persistent layers (wind/rain/engine/...) are engine-owned and do NOT
// count as voices.
// ---------------------------------------------------------------------------

export const MAX_VOICES = 24;

interface Voice {
  peak: number;
  startedAt: number;
  kill: () => void;
}

const voices = new Set<Voice>();

function registerVoice(peak: number, kill: () => void): Voice {
  const v: Voice = { peak, startedAt: ctx ? ctx.currentTime : 0, kill };
  voices.add(v);
  if (voices.size > MAX_VOICES) {
    // steal the oldest-quietest: lowest peak, age breaking ties toward old
    let victim: Voice | null = null;
    let victimScore = Infinity;
    const now = v.startedAt;
    voices.forEach((o) => {
      if (o === v) return;
      const score = o.peak / (1 + (now - o.startedAt) * 2);
      if (score < victimScore) {
        victimScore = score;
        victim = o;
      }
    });
    if (victim) {
      const vv: Voice = victim;
      voices.delete(vv);
      vv.kill();
    }
  }
  return v;
}

function releaseVoice(v: Voice): void {
  voices.delete(v);
}

// ---------------------------------------------------------------------------
// Listener + positional math (pure — pinned by tests)
// ---------------------------------------------------------------------------

const listener = { x: 0, z: 0, dirX: 0, dirZ: 1 };

export function setListener(x: number, z: number, dirX = 0, dirZ = 1): void {
  listener.x = x;
  listener.z = z;
  const len = Math.hypot(dirX, dirZ) || 1;
  listener.dirX = dirX / len;
  listener.dirZ = dirZ / len;
}

/**
 * Distance attenuation curve: full volume inside REF metres, then an
 * inverse-power rolloff (~ -8 dB per doubling past the reference).
 * Beyond CUTOFF the sound is not worth a voice at all.
 */
export const DIST_REF_M = 4;
export const DIST_CUTOFF_M = 130;
export function distanceGain(distM: number): number {
  if (distM <= DIST_REF_M) return 1;
  return Math.pow(DIST_REF_M / distM, 0.8);
}

/** Stereo pan -1..1 of a world offset against the listener's facing. */
export function panFor(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return 0;
  // right vector = facing rotated -90° in plan view
  const side = (dx * -listener.dirZ + dz * listener.dirX) / d;
  return Math.max(-0.8, Math.min(0.8, side * 0.8));
}

/** Resolve play opts against the listener: final gain + pan, or null
 *  when the sound is beyond the cutoff and should not be voiced. */
function spatialize(opts?: PlayOpts): { gain: number; pan: number } | null {
  const v = opts?.volume ?? 1;
  if (!opts?.at) return { gain: v, pan: 0 };
  const dx = opts.at.x - listener.x;
  const dz = opts.at.z - listener.z;
  const d = Math.hypot(dx, dz);
  if (d > DIST_CUTOFF_M) return null;
  return { gain: v * distanceGain(d), pan: panFor(dx, dz) };
}

// ---------------------------------------------------------------------------
// One-shot primitives (voice-managed, bus-routed, optionally spatialized)
// ---------------------------------------------------------------------------

interface Env {
  t0: number;
  peak: number;
  attack?: number;
  decay: number;
}

/** Simple AD envelope applied to a param. */
function adsr(param: AudioParam, e: Env): void {
  const attack = e.attack ?? 0.005;
  param.setValueAtTime(0.0001, e.t0);
  param.exponentialRampToValueAtTime(Math.max(0.0001, e.peak), e.t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, e.t0 + attack + e.decay);
}

interface Spatial {
  gain: number;
  pan: number;
}

interface VoiceTarget {
  bus: AudioBus;
  spatial: Spatial;
}

/** Route a one-shot's gain node through the spatializer into its bus. */
function voiceOut(g: GainNode, t: VoiceTarget): void {
  const c = ctx!;
  const dest = busNode(t.bus);
  if (!dest) return;
  if (Math.abs(t.spatial.pan) > 0.01 && typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = t.spatial.pan;
    g.connect(p).connect(dest);
  } else {
    g.connect(dest);
  }
}

function osc(
  type: OscillatorType,
  freq: number,
  e: Env & { slideTo?: number },
  t: VoiceTarget = { bus: 'combat', spatial: { gain: 1, pan: 0 } },
): void {
  const c = ac();
  if (!c || !master) return;
  const t0 = e.t0 ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (e.slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(e.slideTo, t0 + (e.attack ?? 0.005) + e.decay);
  adsr(g.gain, { ...e, t0, peak: e.peak * t.spatial.gain });
  o.connect(g);
  voiceOut(g, t);
  let voice: Voice | null = null;
  voice = registerVoice(e.peak * t.spatial.gain, () => {
    try { o.stop(); } catch { /* already stopped */ }
    try { o.disconnect(); g.disconnect(); } catch { /* noop */ }
  });
  o.onended = () => {
    if (voice) releaseVoice(voice);
    try { o.disconnect(); g.disconnect(); } catch { /* noop */ }
  };
  o.start(t0);
  o.stop(t0 + (e.attack ?? 0.005) + e.decay + 0.05);
}

interface NoiseOpts {
  filterType: BiquadFilterType;
  freq: number;
  q?: number;
  slideTo?: number;
  e: Env;
}

function noise(o: NoiseOpts, t: VoiceTarget = { bus: 'combat', spatial: { gain: 1, pan: 0 } }): void {
  const c = ac();
  const buf = getNoise();
  if (!c || !master || !buf) return;
  const t0 = o.e.t0 ?? c.currentTime;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filterType;
  f.frequency.setValueAtTime(o.freq, t0);
  f.Q.value = o.q ?? 1;
  if (o.slideTo !== undefined)
    f.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + (o.e.attack ?? 0.005) + o.e.decay);
  const g = c.createGain();
  adsr(g.gain, { ...o.e, t0, peak: o.e.peak * t.spatial.gain });
  src.connect(f);
  voiceOut(g, t);
  f.connect(g);
  let voice: Voice | null = null;
  voice = registerVoice(o.e.peak * t.spatial.gain, () => {
    try { src.stop(); } catch { /* already stopped */ }
    try { src.disconnect(); g.disconnect(); } catch { /* noop */ }
  });
  src.onended = () => {
    if (voice) releaseVoice(voice);
    try { src.disconnect(); g.disconnect(); } catch { /* noop */ }
  };
  src.start(t0);
  src.stop(t0 + (o.e.attack ?? 0.005) + o.e.decay + 0.05);
}

// ---------------------------------------------------------------------------
// Pure sound-design tables + mapping functions (pinned by tests).
// Every recipe below is synthesis parameters — no assets exist.
// ---------------------------------------------------------------------------

/** Gunshot classes. crack = the supersonic snap (noise through a
 *  falling lowpass), body = the muzzle thump (sine drop), tail = the
 *  outdoor slap-back (quiet late lowpassed noise). */
export type GunClass = 'pistol' | 'revolver' | 'smg' | 'carbine' | 'rifle' | 'shotgun' | 'flare' | 'bow';

export interface GunRecipe {
  crackFreq: number;
  crackEnd: number;
  crackDecay: number;
  bodyFreq: number;
  bodyEnd: number;
  bodyDecay: number;
  peak: number;
  tailDecay: number;
}

export const GUNSHOTS: Record<GunClass, GunRecipe> = {
  pistol: { crackFreq: 3800, crackEnd: 300, crackDecay: 0.16, bodyFreq: 150, bodyEnd: 50, bodyDecay: 0.16, peak: 0.5, tailDecay: 0.1 },
  revolver: { crackFreq: 3400, crackEnd: 260, crackDecay: 0.2, bodyFreq: 135, bodyEnd: 44, bodyDecay: 0.22, peak: 0.58, tailDecay: 0.14 },
  smg: { crackFreq: 4000, crackEnd: 340, crackDecay: 0.11, bodyFreq: 160, bodyEnd: 55, bodyDecay: 0.12, peak: 0.42, tailDecay: 0.06 },
  carbine: { crackFreq: 4100, crackEnd: 260, crackDecay: 0.2, bodyFreq: 140, bodyEnd: 46, bodyDecay: 0.24, peak: 0.55, tailDecay: 0.16 },
  rifle: { crackFreq: 4300, crackEnd: 200, crackDecay: 0.3, bodyFreq: 118, bodyEnd: 38, bodyDecay: 0.4, peak: 0.68, tailDecay: 0.3 },
  shotgun: { crackFreq: 2600, crackEnd: 180, crackDecay: 0.34, bodyFreq: 98, bodyEnd: 34, bodyDecay: 0.46, peak: 0.78, tailDecay: 0.26 },
  flare: { crackFreq: 1500, crackEnd: 500, crackDecay: 0.22, bodyFreq: 220, bodyEnd: 90, bodyDecay: 0.2, peak: 0.3, tailDecay: 0.1 },
  bow: { crackFreq: 2400, crackEnd: 900, crackDecay: 0.05, bodyFreq: 170, bodyEnd: 60, bodyDecay: 0.09, peak: 0.2, tailDecay: 0 },
};

/** Map an item id (src/data/items.ts) to its gunshot class. */
export function gunClassForItem(itemId: string | null | undefined): GunClass {
  switch (itemId) {
    case 'pistol': return 'pistol';
    case 'revolver': return 'revolver';
    case 'smg': return 'smg';
    case 'carbine': return 'carbine';
    case 'hunting_rifle':
    case 'dmr': return 'rifle';
    case 'shotgun': return 'shotgun';
    case 'flare_gun': return 'flare';
    case 'crossbow': return 'bow';
    default: return 'pistol';
  }
}

/** Husk vocal recipes, keyed by HuskKind (src/game/Husks.ts). Growls
 *  are detuned saws through a formant band; hissers are mostly noise;
 *  the crawler's "vocal" is its chitin skitter — three dry clicks. */
export interface VocalRecipe {
  baseFreq: number;
  endFreq: number;
  type: OscillatorType;
  formant: number;
  dur: number;
  noiseMix: number; // 0..1 share of bandpassed noise in the voice
  peak: number;
}

export const VOCALS: Record<string, VocalRecipe> = {
  shambler: { baseFreq: 84, endFreq: 58, type: 'sawtooth', formant: 420, dur: 0.7, noiseMix: 0.35, peak: 0.3 },
  stalker: { baseFreq: 62, endFreq: 48, type: 'sawtooth', formant: 2400, dur: 0.9, noiseMix: 0.8, peak: 0.22 },
  armored: { baseFreq: 96, endFreq: 70, type: 'square', formant: 900, dur: 0.5, noiseMix: 0.3, peak: 0.3 },
  screamer: { baseFreq: 680, endFreq: 1080, type: 'sawtooth', formant: 1600, dur: 0.55, noiseMix: 0.25, peak: 0.2 },
  brute: { baseFreq: 56, endFreq: 40, type: 'sawtooth', formant: 300, dur: 1.0, noiseMix: 0.4, peak: 0.42 },
  crawler: { baseFreq: 300, endFreq: 220, type: 'square', formant: 2800, dur: 0.16, noiseMix: 0.7, peak: 0.16 },
  bloater: { baseFreq: 128, endFreq: 84, type: 'sine', formant: 480, dur: 0.8, noiseMix: 0.45, peak: 0.32 },
  spitter: { baseFreq: 210, endFreq: 130, type: 'sawtooth', formant: 1100, dur: 0.4, noiseMix: 0.55, peak: 0.24 },
};

/** Footstep recipes per terrain zone (betaZoneAt). thump = heel strike
 *  through a lowpass; rustle = the surface's loose top layer. */
export type StepSurface = 'road' | 'granite' | 'grass' | 'forest' | 'sand' | 'marsh' | 'seabed';

export interface StepRecipe {
  thumpFreq: number;
  thumpPeak: number;
  rustleFreq: number;
  rustlePeak: number;
  decay: number;
}

export const STEP_SURFACES: Record<StepSurface, StepRecipe> = {
  road: { thumpFreq: 720, thumpPeak: 0.16, rustleFreq: 2600, rustlePeak: 0.03, decay: 0.07 },
  granite: { thumpFreq: 820, thumpPeak: 0.15, rustleFreq: 3000, rustlePeak: 0.04, decay: 0.06 },
  grass: { thumpFreq: 340, thumpPeak: 0.11, rustleFreq: 1500, rustlePeak: 0.05, decay: 0.09 },
  forest: { thumpFreq: 300, thumpPeak: 0.11, rustleFreq: 1800, rustlePeak: 0.07, decay: 0.1 },
  sand: { thumpFreq: 230, thumpPeak: 0.09, rustleFreq: 900, rustlePeak: 0.05, decay: 0.11 },
  marsh: { thumpFreq: 190, thumpPeak: 0.12, rustleFreq: 520, rustlePeak: 0.08, decay: 0.14 },
  seabed: { thumpFreq: 170, thumpPeak: 0.1, rustleFreq: 420, rustlePeak: 0.06, decay: 0.15 },
};

/**
 * A footstep clock keyed to DISTANCE, the same law as the animation:
 * feed it the metres travelled and it reports how many footfalls came
 * due. One full gait cycle (2π of phase) holds exactly two footfalls,
 * so a step falls due every cycleM/2 metres — for the player that is
 * BOB_CYCLE_M (moveMath), whose bob peaks at phase k·π, i.e. exactly
 * where this clock fires; for figures it is their GAITS cycleM.
 */
export class StepClock {
  private phase = 0;
  private fired = 0;
  constructor(private readonly cycleM: number) {}
  /** Advance by distance; returns the number of steps now due. */
  advance(distanceM: number): number {
    if (this.cycleM <= 0 || distanceM <= 0) return 0;
    this.phase += (distanceM / this.cycleM) * Math.PI * 2;
    const due = Math.floor(this.phase / Math.PI);
    const n = due - this.fired;
    this.fired = due;
    return Math.max(0, n);
  }
  reset(): void {
    this.phase = 0;
    this.fired = 0;
  }
}

/** Wind bed targets from the weather's continuous wind factor. */
export function windTargets(windSpeed: number, isNight: boolean): { freq: number; gain: number } {
  const w = Math.max(0, Math.min(1, windSpeed));
  const dark = isNight ? 0.72 : 1;
  return {
    freq: (170 + w * 640) * dark,
    gain: 0.025 + w * 0.155,
  };
}

/** Rain layer gain from precipitation 0..1 (0 below a drizzle floor). */
export function rainGain(precipitation: number): number {
  const p = Math.max(0, Math.min(1, precipitation));
  return p < 0.04 ? 0 : p * 0.13;
}

/** Surf gain from shoreline distance: loud at the waterline, gone by
 *  ~48 m inland. The swell LFO breathes ±30% over ~7 s on top. */
export function surfGain(shoreDistM: number): number {
  const d = Math.max(0, shoreDistM);
  const t = Math.max(0, 1 - d / 48);
  return t * t * 0.2;
}

/** Engine oscillator frequencies from crank rpm: a four-stroke's
 *  fundamental is rpm/60 per cylinder bank; fund = 2× crank (V8
 *  firing order read), sub = 1× crank. */
export function engineFreqs(rpm: number): { fund: number; sub: number } {
  const r = Math.max(0, rpm);
  return { fund: (r / 60) * 2, sub: r / 60 };
}

/** Tire-noise character per surface zone: [bandpass Hz, gain at 30 m/s]. */
export const TIRE_NOISE: Record<StepSurface, { freq: number; gainAt30: number }> = {
  road: { freq: 1900, gainAt30: 0.05 },
  granite: { freq: 950, gainAt30: 0.075 },
  grass: { freq: 520, gainAt30: 0.05 },
  forest: { freq: 460, gainAt30: 0.055 },
  sand: { freq: 340, gainAt30: 0.038 },
  marsh: { freq: 300, gainAt30: 0.032 },
  seabed: { freq: 260, gainAt30: 0.026 },
};

export function tireGain(surface: StepSurface, speedMps: number): number {
  const t = TIRE_NOISE[surface] ?? TIRE_NOISE.grass;
  const s = Math.min(1, Math.abs(speedMps) / 30);
  return t.gainAt30 * s * s;
}

/** Interior factor 0..1 → room-filter cutoff (Hz): the shared lowpass
 *  every bus runs through. 16 kHz outside (inaudible), ~650 Hz deep
 *  inside a structure. */
export function roomCutoff(interior: number): number {
  const t = Math.max(0, Math.min(1, interior));
  return 16000 * Math.pow(650 / 16000, t);
}

/** Is a point sheltered? Pure test against kit roof bounds: inside a
 *  roof's plan box and below its plate height (+ gable tolerance). */
export interface RoofBox { x0: number; z0: number; x1: number; z1: number; topY: number }
export function isUnderRoof(x: number, y: number, z: number, roofs: readonly RoofBox[]): boolean {
  for (const r of roofs) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y <= r.topY + 2.5) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// sfx: the one-shot surface. play() recipes are the original procedural
// set (kept — the game already speaks them in ~35 places); gunshot /
// vocal / step are the audio-pass additions.
// ---------------------------------------------------------------------------

const NAME_BUS: Partial<Record<SfxName, AudioBus>> = {
  ui: 'ui', phone: 'ui', pickup: 'ui', quest: 'ui', craft: 'ui',
  tick: 'ui', killconfirm: 'ui', headshot: 'ui', eat: 'ui', switch: 'ui',
  step: 'env', beacon: 'env',
};

export const sfx = {
  play(name: SfxName, opts?: PlayOpts): void {
    const c = ac();
    if (!c) return;
    const sp = spatialize(opts);
    if (!sp) return;
    const t: VoiceTarget = { bus: opts?.bus ?? NAME_BUS[name] ?? 'combat', spatial: sp };
    const now = c.currentTime;

    try {
      switch (name) {
        case 'swing':
          noise({ filterType: 'bandpass', freq: 900, q: 1.5, slideTo: 250, e: { t0: now, peak: 0.25, decay: 0.22 } }, t);
          break;
        case 'shot':
          // the generic shot stays for turrets/legacy callers; player
          // and companion fire goes through gunshot() per class.
          noise({ filterType: 'lowpass', freq: 4500, slideTo: 180, e: { t0: now, peak: 0.6, decay: 0.32 } }, t);
          osc('sine', 130, { t0: now, peak: 0.5, decay: 0.3, slideTo: 38 }, t);
          break;
        case 'hit':
          osc('sine', 190, { t0: now, peak: 0.45, decay: 0.14, slideTo: 55 }, t);
          noise({ filterType: 'lowpass', freq: 900, e: { t0: now, peak: 0.2, decay: 0.1 } }, t);
          break;
        case 'hurt':
          osc('square', 130, { t0: now, peak: 0.18, decay: 0.22, slideTo: 70 }, t);
          break;
        case 'pickup':
          osc('sine', 660, { t0: now, peak: 0.2, decay: 0.07 }, t);
          osc('sine', 990, { t0: now + 0.08, peak: 0.2, decay: 0.1 }, t);
          break;
        case 'ui':
          osc('sine', 1250, { t0: now, peak: 0.12, decay: 0.03 }, t);
          break;
        case 'step':
          sfx.step('grass', opts);
          break;
        case 'quest':
          [523.25, 659.25, 783.99].forEach((f, i) =>
            osc('sine', f, { t0: now + i * 0.09, peak: 0.22, decay: 0.16 }, t),
          );
          break;
        case 'eat':
          noise({ filterType: 'lowpass', freq: 480, e: { t0: now, peak: 0.18, decay: 0.16 } }, t);
          noise({ filterType: 'lowpass', freq: 420, e: { t0: now + 0.12, peak: 0.15, decay: 0.14 } }, t);
          break;
        case 'phone':
          osc('sine', 880, { t0: now, peak: 0.2, decay: 0.1 }, t);
          break;
        case 'switch':
          noise({ filterType: 'highpass', freq: 1800, e: { t0: now, peak: 0.22, decay: 0.04 } }, t);
          osc('square', 320, { t0: now, peak: 0.1, decay: 0.04, slideTo: 180 }, t);
          break;
        case 'beacon':
          osc('sine', 58, { t0: now, peak: 0.4, attack: 0.6, decay: 1.4 }, t);
          osc('sine', 116, { t0: now + 0.15, peak: 0.16, attack: 0.5, decay: 1.2 }, t);
          break;
        case 'craft':
          [0, 0.07, 0.14].forEach((dt) =>
            noise({ filterType: 'highpass', freq: 2400, e: { t0: now + dt, peak: 0.16, decay: 0.03 } }, t),
          );
          break;
        case 'tick':
          osc('sine', 2150, { t0: now, peak: 0.16, decay: 0.045 }, t);
          noise({ filterType: 'highpass', freq: 3200, e: { t0: now, peak: 0.1, decay: 0.03 } }, t);
          break;
        case 'headshot':
          osc('sine', 2400, { t0: now, peak: 0.18, decay: 0.05 }, t);
          osc('sine', 320, { t0: now, peak: 0.4, decay: 0.11, slideTo: 85 }, t);
          break;
        case 'killconfirm':
          osc('square', 392, { t0: now, peak: 0.14, decay: 0.07 }, t);
          osc('square', 587, { t0: now + 0.06, peak: 0.16, decay: 0.13 }, t);
          break;
        case 'thud':
          osc('sine', 118, { t0: now, peak: 0.55, decay: 0.17, slideTo: 44 }, t);
          noise({ filterType: 'lowpass', freq: 520, e: { t0: now, peak: 0.25, decay: 0.12 } }, t);
          break;
        case 'jam':
          noise({ filterType: 'highpass', freq: 2100, e: { t0: now, peak: 0.22, decay: 0.035 } }, t);
          osc('square', 210, { t0: now + 0.05, peak: 0.16, decay: 0.06, slideTo: 120 }, t);
          noise({ filterType: 'bandpass', freq: 700, q: 2, e: { t0: now + 0.05, peak: 0.18, decay: 0.08 } }, t);
          break;
        case 'dryfire':
          noise({ filterType: 'highpass', freq: 2000, e: { t0: now, peak: 0.2, decay: 0.03 } }, t);
          osc('square', 420, { t0: now, peak: 0.08, decay: 0.03, slideTo: 240 }, t);
          break;
        case 'shriek':
          osc('sawtooth', 480, { t0: now, peak: 0.16, attack: 0.25, decay: 0.75, slideTo: 1450 }, t);
          osc('sawtooth', 512, { t0: now + 0.05, peak: 0.13, attack: 0.25, decay: 0.7, slideTo: 1390 }, t);
          osc('square', 960, { t0: now + 0.1, peak: 0.07, attack: 0.2, decay: 0.6, slideTo: 2200 }, t);
          noise({ filterType: 'bandpass', freq: 1800, q: 1.4, slideTo: 2600, e: { t0: now, peak: 0.12, attack: 0.2, decay: 0.8 } }, t);
          break;
        case 'burst':
          osc('sine', 96, { t0: now, peak: 0.6, decay: 0.32, slideTo: 36 }, t);
          noise({ filterType: 'lowpass', freq: 900, slideTo: 220, e: { t0: now, peak: 0.35, decay: 0.22 } }, t);
          noise({ filterType: 'bandpass', freq: 500, q: 0.8, e: { t0: now + 0.08, peak: 0.2, decay: 0.3 } }, t);
          break;
        case 'spit':
          osc('sine', 340, { t0: now, peak: 0.2, decay: 0.16, slideTo: 130 }, t);
          noise({ filterType: 'bandpass', freq: 900, q: 1.2, slideTo: 400, e: { t0: now, peak: 0.14, decay: 0.12 } }, t);
          break;
      }
    } catch {
      /* audio is non-fatal */
    }
  },

  /** A gunshot by weapon class, optionally positioned at the shooter. */
  gunshot(cls: GunClass, opts?: PlayOpts): void {
    const c = ac();
    if (!c) return;
    const sp = spatialize(opts);
    if (!sp) return;
    const t: VoiceTarget = { bus: 'combat', spatial: sp };
    const r = GUNSHOTS[cls];
    const now = c.currentTime;
    try {
      // crack: broadband snap through a falling lowpass
      noise({ filterType: 'lowpass', freq: r.crackFreq, slideTo: r.crackEnd, e: { t0: now, peak: r.peak, decay: r.crackDecay } }, t);
      // body: the muzzle thump
      osc('sine', r.bodyFreq, { t0: now, peak: r.peak * 0.9, decay: r.bodyDecay, slideTo: r.bodyEnd }, t);
      // tail: outdoor slap-back, a beat late and much darker
      if (r.tailDecay > 0) {
        noise({ filterType: 'lowpass', freq: 700, e: { t0: now + 0.07, peak: r.peak * 0.22, decay: r.tailDecay } }, t);
      }
      if (cls === 'bow') {
        // string twang over the snap
        osc('triangle', 190, { t0: now, peak: 0.16, decay: 0.12, slideTo: 70 }, t);
      }
      if (cls === 'flare') {
        // fizzing burn after the pop
        noise({ filterType: 'highpass', freq: 2600, e: { t0: now + 0.05, peak: 0.06, decay: 0.5 } }, t);
      }
    } catch {
      /* audio is non-fatal */
    }
  },

  /** A husk vocalization by kind, optionally positioned at the husk. */
  vocal(kind: string, opts?: PlayOpts): void {
    const c = ac();
    if (!c) return;
    const sp = spatialize(opts);
    if (!sp) return;
    const r = VOCALS[kind] ?? VOCALS.shambler;
    const t: VoiceTarget = { bus: 'combat', spatial: sp };
    const now = c.currentTime;
    try {
      if (kind === 'crawler') {
        // chitin skitter: three dry clicks, slightly scattered
        [0, 0.055, 0.12].forEach((dt, i) =>
          noise({ filterType: 'bandpass', freq: r.formant - i * 250, q: 3, e: { t0: now + dt, peak: r.peak, decay: 0.035 } }, t),
        );
        return;
      }
      // the voiced part: detuned pair through the recipe's body
      osc(r.type, r.baseFreq, { t0: now, peak: r.peak * (1 - r.noiseMix * 0.5), attack: 0.06, decay: r.dur, slideTo: r.endFreq }, t);
      osc(r.type, r.baseFreq * 1.007, { t0: now + 0.02, peak: r.peak * 0.6 * (1 - r.noiseMix * 0.5), attack: 0.06, decay: r.dur * 0.9, slideTo: r.endFreq * 1.01 }, t);
      // breath/formant noise on top
      if (r.noiseMix > 0.05) {
        noise({ filterType: 'bandpass', freq: r.formant, q: 1.1, slideTo: r.formant * (r.endFreq / r.baseFreq), e: { t0: now, peak: r.peak * r.noiseMix, attack: 0.05, decay: r.dur } }, t);
      }
    } catch {
      /* audio is non-fatal */
    }
  },

  /** A footstep on a terrain surface (StepClock decides WHEN). */
  step(surface: StepSurface, opts?: PlayOpts): void {
    const c = ac();
    if (!c) return;
    const sp = spatialize(opts);
    if (!sp) return;
    const r = STEP_SURFACES[surface] ?? STEP_SURFACES.grass;
    const t: VoiceTarget = { bus: 'env', spatial: sp };
    const now = c.currentTime;
    try {
      noise({ filterType: 'lowpass', freq: r.thumpFreq, e: { t0: now, peak: r.thumpPeak, decay: r.decay } }, t);
      if (r.rustlePeak > 0.01) {
        noise({ filterType: 'bandpass', freq: r.rustleFreq, q: 0.8, e: { t0: now + 0.012, peak: r.rustlePeak, decay: r.decay * 0.9 } }, t);
      }
    } catch {
      /* audio is non-fatal */
    }
  },

  setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : masterVolume, ctx.currentTime, 0.02);
  },

  setVolume(v: number): void {
    masterVolume = Math.max(0, Math.min(1, v));
    if (master && ctx && !muted) master.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.02);
  },

  isMuted(): boolean {
    return muted;
  },
};

// ---------------------------------------------------------------------------
// audioEngine: persistent layers + the vehicle voice + environment
// state. Game feeds setEnvironment() at ~10 Hz and engineUpdate() per
// frame while driving; everything else is schedulers owned here.
// ---------------------------------------------------------------------------

export interface EnvironmentState {
  /** WeatherSystem.snapshot() shape (structural — no import cycle). */
  weather: { state: string; precipitation: number; windSpeed: number };
  isNight: boolean;
  /** betaZoneAt() at the listener. */
  zone: StepSurface | 'road';
  /** Metres from the listener to the shoreline (surf driver). */
  shoreDistM: number;
  /** 0..1 — how deep inside a structure the listener is. */
  interior: number;
}

const DEFAULT_ENV: EnvironmentState = {
  weather: { state: 'clear', precipitation: 0, windSpeed: 0.25 },
  isNight: false,
  zone: 'grass',
  shoreDistM: 999,
  interior: 0,
};

interface LayerNodes {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

let windLayer: LayerNodes | null = null;
let rainLayer: LayerNodes | null = null;
let surfLayer: (LayerNodes & { lfo: OscillatorNode; lfoGain: GainNode }) | null = null;
let buzzLayer: LayerNodes | null = null;
let envState: EnvironmentState = DEFAULT_ENV;
let thunderTimer: number | null = null;
let wildlifeTimer: number | null = null;

function makeLayer(filterType: BiquadFilterType, freq: number): LayerNodes | null {
  const c = ac();
  const buf = getNoise();
  const dest = busNode('env');
  if (!c || !buf || !dest) return null;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // offset each layer's loop start so beds don't phase-lock
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(dest);
  src.start(0, Math.random() * 1.5);
  return { src, filter, gain };
}

function killLayer(l: LayerNodes | null): void {
  if (!l || !ctx) return;
  try { l.src.stop(ctx.currentTime + 0.2); } catch { /* noop */ }
  window.setTimeout(() => {
    try { l.src.disconnect(); l.gain.disconnect(); } catch { /* noop */ }
  }, 400);
}

/** One thunder clap. dist01: 0 = overhead crack, 1 = far rumble. */
export function thunderClap(dist01: number): void {
  const c = ac();
  if (!c) return;
  const d = Math.max(0, Math.min(1, dist01));
  const t: VoiceTarget = { bus: 'env', spatial: { gain: 1, pan: 0 } };
  const now = c.currentTime;
  try {
    if (d < 0.35) {
      // near: a crack first, then the body of the rumble
      noise({ filterType: 'lowpass', freq: 3200, slideTo: 300, e: { t0: now, peak: 0.34, attack: 0.004, decay: 0.28 } }, t);
      noise({ filterType: 'lowpass', freq: 240, e: { t0: now + 0.05, peak: 0.3, attack: 0.09, decay: 2.4 } }, t);
      osc('sine', 46, { t0: now + 0.03, peak: 0.22, attack: 0.05, decay: 2.0, slideTo: 30 }, t);
    } else {
      // far: all rumble, slow swell
      const peak = 0.1 + 0.16 * (1 - d);
      noise({ filterType: 'lowpass', freq: 190, e: { t0: now, peak, attack: 0.35, decay: 2.8 + d * 1.4 } }, t);
      osc('sine', 40, { t0: now + 0.1, peak: peak * 0.6, attack: 0.3, decay: 2.4, slideTo: 28 }, t);
    }
  } catch {
    /* audio is non-fatal */
  }
}

function armThunder(): void {
  if (thunderTimer !== null) return;
  const p = envState.weather.precipitation;
  const delay = (2.5 + Math.random() * 8) / (0.35 + p);
  thunderTimer = window.setTimeout(() => {
    thunderTimer = null;
    if (!amb) return;
    if (envState.weather.state === 'storm') {
      thunderClap(Math.random());
      armThunder();
    }
  }, delay * 1000);
}

function stopThunder(): void {
  if (thunderTimer !== null) {
    clearTimeout(thunderTimer);
    thunderTimer = null;
  }
}

/** One wildlife moment from the current env state: day birdsong over
 *  land zones, marsh insects, night crickets (classic pattern). */
function wildlifeTick(): void {
  const c = ac();
  if (!c || !amb) return;
  const zone = envState.zone;
  const land = zone === 'forest' || zone === 'grass' || zone === 'marsh' || zone === 'sand';
  const t: VoiceTarget = { bus: 'env', spatial: { gain: 1, pan: 0 } };
  const now = c.currentTime;
  try {
    if (land && !envState.isNight) {
      // birdsong: 2-4 quick FM chirps, wandering pitch, kept very quiet
      const base = 2400 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        osc('sine', base * (0.92 + Math.random() * 0.16), {
          t0: now + i * (0.11 + Math.random() * 0.05),
          peak: 0.016 + Math.random() * 0.014,
          decay: 0.07,
          slideTo: base * (1.08 + Math.random() * 0.2),
        }, t);
      }
      wildlifeTimer = window.setTimeout(wildlifeTick, 2600 + Math.random() * 5600);
    } else if (land && envState.isNight) {
      // crickets: sparse high chirp clusters
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        osc('sine', 4100 + Math.random() * 600, { t0: now + i * 0.07, peak: 0.013, decay: 0.04 }, t);
      }
      wildlifeTimer = window.setTimeout(wildlifeTick, 1200 + Math.random() * 3600);
    } else {
      wildlifeTimer = window.setTimeout(wildlifeTick, 4000);
    }
  } catch {
    wildlifeTimer = window.setTimeout(wildlifeTick, 4000);
  }
}

function stopWildlife(): void {
  if (wildlifeTimer !== null) {
    clearTimeout(wildlifeTimer);
    wildlifeTimer = null;
  }
}

// --- vehicle voice --------------------------------------------------------

interface EngineNodes {
  fund: OscillatorNode;
  sub: OscillatorNode;
  noiseSrc: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  tireSrc: AudioBufferSourceNode;
  tireFilter: BiquadFilterNode;
  tireGain: GainNode;
}

let engineNodes: EngineNodes | null = null;

export interface EngineState {
  rpm: number;
  idleRpm: number;
  redlineRpm: number;
  /** 0..1 throttle load. */
  load: number;
  speedMps: number;
  surface: StepSurface;
}

function engineStart(): void {
  const c = ac();
  const buf = getNoise();
  const dest = busNode('vehicle');
  if (!c || !buf || !dest || engineNodes) return;
  try {
    const fund = c.createOscillator();
    fund.type = 'sawtooth';
    const sub = c.createOscillator();
    sub.type = 'sine';
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = c.createGain();
    gain.gain.value = 0;
    fund.connect(filter);
    sub.connect(filter);
    noiseSrc.connect(filter);
    filter.connect(gain).connect(dest);
    const tireSrc = c.createBufferSource();
    tireSrc.buffer = buf;
    tireSrc.loop = true;
    const tireFilter = c.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 600;
    tireFilter.Q.value = 0.7;
    const tireGain = c.createGain();
    tireGain.gain.value = 0;
    tireSrc.connect(tireFilter).connect(tireGain).connect(dest);
    fund.start();
    sub.start();
    noiseSrc.start(0, 0.7);
    tireSrc.start(0, 1.3);
    engineNodes = { fund, sub, noiseSrc, filter, gain, tireSrc, tireFilter, tireGain };
  } catch {
    /* audio is non-fatal */
  }
}

function engineStop(): void {
  if (!engineNodes || !ctx) return;
  const n = engineNodes;
  engineNodes = null;
  const t = ctx.currentTime;
  try {
    n.gain.gain.setTargetAtTime(0, t, 0.05);
    n.tireGain.gain.setTargetAtTime(0, t, 0.05);
    window.setTimeout(() => {
      [n.fund, n.sub, n.noiseSrc, n.tireSrc].forEach((s) => {
        try { s.stop(); } catch { /* noop */ }
        try { s.disconnect(); } catch { /* noop */ }
      });
    }, 350);
  } catch {
    /* noop */
  }
}

function engineUpdate(s: EngineState): void {
  if (!engineNodes && s.rpm > 0) engineStart();
  const c = ctx;
  if (!c || !engineNodes) return;
  const t = c.currentTime;
  const { fund, sub } = engineFreqs(s.rpm);
  const norm = Math.max(0, Math.min(1, (s.rpm - s.idleRpm) / Math.max(1, s.redlineRpm - s.idleRpm)));
  engineNodes.fund.frequency.setTargetAtTime(Math.max(20, fund), t, 0.03);
  engineNodes.sub.frequency.setTargetAtTime(Math.max(12, sub), t, 0.03);
  engineNodes.filter.frequency.setTargetAtTime(280 + norm * 1700 + s.load * 700, t, 0.05);
  engineNodes.gain.gain.setTargetAtTime(0.045 + norm * 0.05 + s.load * 0.075, t, 0.06);
  engineNodes.tireFilter.frequency.setTargetAtTime(TIRE_NOISE[s.surface].freq, t, 0.2);
  engineNodes.tireGain.gain.setTargetAtTime(tireGain(s.surface, s.speedMps), t, 0.15);
}

// --- the facade -----------------------------------------------------------

export const audioEngine = {
  /** Create/resume the context inside a user gesture (autoplay law). */
  unlock(): void {
    ac();
  },
  /** True once a context exists. Before this, the engine is silent
   *  and owns zero nodes. */
  started(): boolean {
    return ctx !== null;
  },
  setListener,
  setEnvironment(env: EnvironmentState): void {
    envState = env;
    const c = ctx;
    if (!c || !amb) return;
    const t = c.currentTime;
    const shelter = 1 - env.interior * 0.55; // outdoor beds duck inside
    if (windLayer) {
      const w = windTargets(env.weather.windSpeed, env.isNight);
      windLayer.filter.frequency.setTargetAtTime(w.freq, t, 0.6);
      windLayer.gain.gain.setTargetAtTime(w.gain * shelter, t, 0.6);
    }
    if (rainLayer) {
      rainLayer.gain.gain.setTargetAtTime(rainGain(env.weather.precipitation) * shelter, t, 0.4);
    }
    if (surfLayer) {
      surfLayer.gain.gain.setTargetAtTime(surfGain(env.shoreDistM) * shelter, t, 0.8);
    }
    if (buzzLayer) {
      // marsh insect bed: day only, marsh only, gone under a roof
      const buzz = env.zone === 'marsh' && !env.isNight ? 0.011 * (1 - env.interior) : 0;
      buzzLayer.gain.gain.setTargetAtTime(buzz, t, 0.8);
    }
    if (roomFilter) {
      roomFilter.frequency.setTargetAtTime(roomCutoff(env.interior), t, 0.25);
    }
    if (env.weather.state === 'storm') armThunder();
  },
  engineStart,
  engineStop,
  engineUpdate,
  engineRunning(): boolean {
    return engineNodes !== null;
  },
};

// ---------------------------------------------------------------------------
// Ambience: the persistent soundscape. start() builds the env layers
// (wind / rain / surf / buzz) and arms the wildlife + thunder
// schedulers; the danger pulse rides on top, driven by the game.
// The wind layer doubles as the compat surface the original ambience
// API promised (setNight crossfades it) — setEnvironment() is the
// richer driver and supersedes the static values when the game feeds
// it (Game does, at 10 Hz).
// ---------------------------------------------------------------------------

interface AmbienceNodes {
  pulseOsc: OscillatorNode | null;
  pulseLfo: OscillatorNode | null;
  pulseGain: GainNode | null;
  dissonant: OscillatorNode[];
}

let amb: AmbienceNodes | null = null;
let night = false;
let dangerLevel: 0 | 1 | 2 = 0;

function buildPulse(level: 1 | 2): void {
  const c = ac();
  const dest = busNode('env');
  if (!c || !dest || !amb) return;
  const now = c.currentTime;
  // low pulse: sine under an LFO on the gain
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = level === 1 ? 55 : 49;
  const g = c.createGain();
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = level === 1 ? 1.1 : 2.8;
  const lfoGain = c.createGain();
  lfoGain.gain.value = level === 1 ? 0.07 : 0.1;
  g.gain.value = 0.04;
  lfo.connect(lfoGain).connect(g.gain);
  o.connect(g).connect(dest);
  o.start(now);
  lfo.start(now);
  amb.pulseOsc = o;
  amb.pulseLfo = lfo;
  amb.pulseGain = g;

  if (level === 2) {
    // dissonant edge: two close high sines, quiet
    for (const f of [220, 233.08]) {
      const d = c.createOscillator();
      d.type = 'sine';
      d.frequency.value = f;
      const dg = c.createGain();
      dg.gain.value = 0.012;
      d.connect(dg).connect(dest);
      d.start(now);
      amb.dissonant.push(d);
    }
  }
}

function clearPulse(): void {
  if (!amb) return;
  const c = ctx;
  const now = c ? c.currentTime : 0;
  const kill = (n: { stop(t: number): void; disconnect(): void }) => {
    try {
      n.stop(now + 0.3);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }, 500);
  };
  if (amb.pulseOsc) kill(amb.pulseOsc);
  if (amb.pulseLfo) kill(amb.pulseLfo);
  amb.dissonant.forEach(kill);
  amb.pulseOsc = null;
  amb.pulseLfo = null;
  amb.pulseGain = null;
  amb.dissonant = [];
}

export const ambience = {
  start(): void {
    const c = ac();
    if (!c || amb) return;
    try {
      windLayer = makeLayer('lowpass', night ? 240 : 420);
      if (windLayer) {
        const w = windTargets(envState.weather.windSpeed, night);
        windLayer.filter.frequency.value = w.freq;
        windLayer.gain.gain.value = w.gain;
      }
      rainLayer = makeLayer('highpass', 1500);
      surfLayer = (() => {
        const l = makeLayer('lowpass', 480);
        if (!l) return null;
        // swell: a slow LFO breathing on the surf gain (±30%, ~7 s)
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 1 / 7;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 0;
        lfo.connect(lfoGain).connect(l.gain.gain);
        lfo.start();
        return { ...l, lfo, lfoGain };
      })();
      if (surfLayer) {
        // LFO depth tracks the surf level: setEnvironment refreshes
        // the base gain; depth is a fixed small share of full scale.
        surfLayer.lfoGain.gain.value = 0.02;
      }
      buzzLayer = makeLayer('bandpass', 320);
      if (buzzLayer) buzzLayer.filter.Q.value = 2.5;
      amb = { pulseOsc: null, pulseLfo: null, pulseGain: null, dissonant: [] };
      stopWildlife();
      wildlifeTimer = window.setTimeout(wildlifeTick, 900);
      if (envState.weather.state === 'storm') armThunder();
      if (dangerLevel === 1 || dangerLevel === 2) buildPulse(dangerLevel);
      // re-apply the last environment now the layers exist
      audioEngine.setEnvironment(envState);
    } catch {
      /* audio is non-fatal */
    }
  },

  stop(): void {
    stopThunder();
    stopWildlife();
    clearPulse();
    killLayer(windLayer);
    killLayer(rainLayer);
    killLayer(buzzLayer);
    if (surfLayer && ctx) {
      const s = surfLayer;
      try { s.lfo.stop(ctx.currentTime + 0.2); } catch { /* noop */ }
      killLayer(s);
    }
    windLayer = null;
    rainLayer = null;
    surfLayer = null;
    buzzLayer = null;
    amb = null;
  },

  setNight(isNight: boolean): void {
    night = isNight;
    envState = { ...envState, isNight };
    // immediate crossfade of the wind bed even before the next
    // environment tick; setEnvironment keeps refining it from there.
    const c = ctx;
    if (!c || !windLayer) return;
    const w = windTargets(envState.weather.windSpeed, isNight);
    windLayer.filter.frequency.setTargetAtTime(w.freq, c.currentTime, 1.2);
    windLayer.gain.gain.setTargetAtTime(w.gain, c.currentTime, 1.2);
  },

  setDanger(level: 0 | 1 | 2): void {
    dangerLevel = level;
    if (!amb) return; // applied on next start()
    clearPulse();
    if (level === 1 || level === 2) buildPulse(level);
  },
};

// ---------------------------------------------------------------------------
// Autoplay unlock: the first pointer/key gesture anywhere resumes (and
// if needed creates) the context. Registered once at import; in Node
// (tests) window is absent and this is a no-op.
// ---------------------------------------------------------------------------

try {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const unlock = () => {
      audioEngine.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
} catch {
  /* audio is non-fatal */
}
