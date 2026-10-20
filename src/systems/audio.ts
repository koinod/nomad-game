// Procedural WebAudio: zero assets. All sounds synthesized on the fly.
// The AudioContext is created lazily on first play() and resumed there,
// so the module survives before any user gesture.

export type SfxName =
  | 'swing' | 'shot' | 'hit' | 'hurt' | 'pickup' | 'ui'
  | 'step' | 'quest' | 'eat' | 'phone' | 'switch' | 'beacon' | 'craft';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

/** Get (and lazily create) the shared context. Never throws. */
function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
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

function osc(
  type: OscillatorType,
  freq: number,
  e: Env & { slideTo?: number },
): void {
  const c = ac();
  if (!c || !master) return;
  const t0 = e.t0 ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (e.slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(e.slideTo, t0 + (e.attack ?? 0.005) + e.decay);
  adsr(g.gain, { ...e, t0 });
  o.connect(g).connect(master);
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

function noise(o: NoiseOpts): void {
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
  adsr(g.gain, { ...o.e, t0 });
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + (o.e.attack ?? 0.005) + o.e.decay + 0.05);
}

export const sfx = {
  play(name: SfxName, opts?: { volume?: number }): void {
    const c = ac();
    if (!c) return;
    const v = opts?.volume ?? 1;
    const now = c.currentTime;

    try {
      switch (name) {
        case 'swing':
          // filtered noise whoosh
          noise({ filterType: 'bandpass', freq: 900, q: 1.5, slideTo: 250, e: { t0: now, peak: 0.25 * v, decay: 0.22 } });
          break;
        case 'shot':
          // noise crack + low thump
          noise({ filterType: 'lowpass', freq: 4500, slideTo: 180, e: { t0: now, peak: 0.6 * v, decay: 0.32 } });
          osc('sine', 130, { t0: now, peak: 0.5 * v, decay: 0.3, slideTo: 38 });
          break;
        case 'hit':
          // meaty thud
          osc('sine', 190, { t0: now, peak: 0.45 * v, decay: 0.14, slideTo: 55 });
          noise({ filterType: 'lowpass', freq: 900, e: { t0: now, peak: 0.2 * v, decay: 0.1 } });
          break;
        case 'hurt':
          // low square blip, pitch falling
          osc('square', 130, { t0: now, peak: 0.18 * v, decay: 0.22, slideTo: 70 });
          break;
        case 'pickup':
          // two rising sine blips
          osc('sine', 660, { t0: now, peak: 0.2 * v, decay: 0.07 });
          osc('sine', 990, { t0: now + 0.08, peak: 0.2 * v, decay: 0.1 });
          break;
        case 'ui':
          // click
          osc('sine', 1250, { t0: now, peak: 0.12 * v, decay: 0.03 });
          break;
        case 'step':
          // short noise tap
          noise({ filterType: 'highpass', freq: 900, e: { t0: now, peak: 0.07 * v, decay: 0.05 } });
          break;
        case 'quest':
          // rising arpeggio, three notes
          [523.25, 659.25, 783.99].forEach((f, i) =>
            osc('sine', f, { t0: now + i * 0.09, peak: 0.22 * v, decay: 0.16 }),
          );
          break;
        case 'eat':
          // soft noise chew
          noise({ filterType: 'lowpass', freq: 480, e: { t0: now, peak: 0.18 * v, decay: 0.16 } });
          noise({ filterType: 'lowpass', freq: 420, e: { t0: now + 0.12, peak: 0.15 * v, decay: 0.14 } });
          break;
        case 'phone':
          // beep
          osc('sine', 880, { t0: now, peak: 0.2 * v, decay: 0.1 });
          break;
        case 'switch':
          // mechanical clack
          noise({ filterType: 'highpass', freq: 1800, e: { t0: now, peak: 0.22 * v, decay: 0.04 } });
          osc('square', 320, { t0: now, peak: 0.1 * v, decay: 0.04, slideTo: 180 });
          break;
        case 'beacon':
          // deep swell
          osc('sine', 58, { t0: now, peak: 0.4 * v, attack: 0.6, decay: 1.4 });
          osc('sine', 116, { t0: now + 0.15, peak: 0.16 * v, attack: 0.5, decay: 1.2 });
          break;
        case 'craft':
          // metallic ratchet clicks, three quick ticks
          [0, 0.07, 0.14].forEach((dt) =>
            noise({ filterType: 'highpass', freq: 2400, e: { t0: now + dt, peak: 0.16 * v, decay: 0.03 } }),
          );
          break;
      }
    } catch {
      /* audio is non-fatal */
    }
  },

  setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  },
};

// ---------------------------------------------------------------------------
// Ambience: looping wind + rumble, night crickets, danger pulses.
// ---------------------------------------------------------------------------

interface AmbienceNodes {
  windSrc: AudioBufferSourceNode;
  windFilter: BiquadFilterNode;
  windGain: GainNode;
  pulseOsc: OscillatorNode | null;
  pulseLfo: OscillatorNode | null;
  pulseGain: GainNode | null;
  dissonant: OscillatorNode[];
}

let amb: AmbienceNodes | null = null;
let night = false;
let dangerLevel: 0 | 1 | 2 = 0;
let rumbleTimer: number | null = null;
let cricketTimer: number | null = null;

function distantRumble(): void {
  const c = ac();
  if (!c) return;
  // low distant boom that decays slowly
  osc('sine', 44, { t0: c.currentTime, peak: 0.1, attack: 0.4, decay: 2.6, slideTo: 30 });
  rumbleTimer = window.setTimeout(() => {
    distantRumble();
  }, 18000 + Math.random() * 24000);
}

function cricketTick(): void {
  const c = ac();
  if (!c) return;
  // sparse high chirp cluster
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    osc('sine', 4100 + Math.random() * 600, {
      t0: c.currentTime + i * 0.07,
      peak: 0.015,
      decay: 0.04,
    });
  }
  cricketTimer = window.setTimeout(cricketTick, 1200 + Math.random() * 3600);
}

function stopCrickets(): void {
  if (cricketTimer !== null) {
    clearTimeout(cricketTimer);
    cricketTimer = null;
  }
}

function stopRumble(): void {
  if (rumbleTimer !== null) {
    clearTimeout(rumbleTimer);
    rumbleTimer = null;
  }
}

function buildPulse(level: 1 | 2): void {
  const c = ac();
  if (!c || !master || !amb) return;
  const now = c.currentTime;
  // low pulse: sine under an LFO on the gain
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = level === 1 ? 55 : 49;
  const g = c.createGain();
  g.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = level === 1 ? 1.1 : 2.8;
  const lfoGain = c.createGain();
  lfoGain.gain.value = level === 1 ? 0.07 : 0.1;
  g.gain.value = 0.04;
  lfo.connect(lfoGain).connect(g.gain);
  o.connect(g).connect(master);
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
      d.connect(dg).connect(master);
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
    const buf = getNoise();
    if (!c || !master || !buf || amb) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = night ? 240 : 420;
      const gain = c.createGain();
      gain.gain.value = night ? 0.05 : 0.09;
      src.connect(filter).connect(gain).connect(master);
      src.start();
      amb = {
        windSrc: src,
        windFilter: filter,
        windGain: gain,
        pulseOsc: null,
        pulseLfo: null,
        pulseGain: null,
        dissonant: [],
      };
      if (night) cricketTick();
      else stopCrickets();
      stopRumble();
      distantRumble();
      if (dangerLevel === 1 || dangerLevel === 2) buildPulse(dangerLevel);
    } catch {
      /* audio is non-fatal */
    }
  },

  stop(): void {
    stopRumble();
    stopCrickets();
    clearPulse();
    if (amb && ctx) {
      const a = amb;
      amb = null;
      try {
        a.windSrc.stop(ctx.currentTime + 0.3);
      } catch {
        /* noop */
      }
      window.setTimeout(() => {
        try {
          a.windSrc.disconnect();
          a.windGain.disconnect();
        } catch {
          /* noop */
        }
      }, 500);
    }
  },

  setNight(isNight: boolean): void {
    night = isNight;
    const c = ctx;
    if (!c || !amb) return;
    const t = c.currentTime;
    // crossfade the wind to a darker, quieter bed at night
    amb.windFilter.frequency.setTargetAtTime(isNight ? 220 : 430, t, 1.2);
    amb.windGain.gain.setTargetAtTime(isNight ? 0.045 : 0.09, t, 1.2);
    if (isNight) {
      stopCrickets();
      cricketTick();
    } else {
      stopCrickets();
    }
  },

  setDanger(level: 0 | 1 | 2): void {
    dangerLevel = level;
    if (!amb) return; // applied on next start()
    clearPulse();
    if (level === 1 || level === 2) buildPulse(level);
  },
};
