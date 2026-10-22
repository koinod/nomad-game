// audio.test.ts — the audio pass gate: the engine's contract, pinned
// headlessly against a mock AudioContext.
//
// The module under test reads window.AudioContext lazily (never at
// import), so each test installs a fresh mock window + a fresh module
// (vi.resetModules) and drives the real code. The mock records every
// node, connection and param call — graph shape and levels are
// asserted, not vibes.

import { describe, expect, it, vi } from 'vitest';
import { BOB_CYCLE_M, bobPhaseDelta } from '../game/moveMath';
import { GAITS, gaitPhaseAdvance } from '../game/figureAnim';

// ---------------------------------------------------------------------------
// Mock WebAudio
// ---------------------------------------------------------------------------

class MockParam {
  value: number;
  targetCalls: number[] = [];
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number): void { this.value = v; }
  exponentialRampToValueAtTime(v: number): void { this.value = v; }
  linearRampToValueAtTime(v: number): void { this.value = v; }
  setTargetAtTime(v: number): void { this.value = v; this.targetCalls.push(v); }
}

class MockNode {
  connections: unknown[] = [];
  constructor(readonly kind: string) {}
  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void { /* noop */ }
}

class MockOsc extends MockNode {
  type: OscillatorType = 'sine';
  frequency = new MockParam(440);
  stopArgs: (number | undefined)[] = [];
  started = false;
  onended: (() => void) | null = null;
  constructor() { super('osc'); }
  start(): void { this.started = true; }
  stop(when?: number): void { this.stopArgs.push(when); }
}

class MockSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  stopArgs: (number | undefined)[] = [];
  started = false;
  onended: (() => void) | null = null;
  constructor() { super('source'); }
  start(): void { this.started = true; }
  stop(when?: number): void { this.stopArgs.push(when); }
}

class MockGain extends MockNode {
  gain = new MockParam(1);
  constructor() { super('gain'); }
}

class MockBiquad extends MockNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockParam(350);
  Q = new MockParam(1);
  constructor() { super('biquad'); }
}

class MockPanner extends MockNode {
  pan = new MockParam(0);
  constructor() { super('panner'); }
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new MockNode('destination');
  oscs: MockOsc[] = [];
  sources: MockSource[] = [];
  gains: MockGain[] = [];
  biquads: MockBiquad[] = [];
  panners: MockPanner[] = [];
  constructor() { MockAudioContext.instances.push(this); }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  createGain(): MockGain { const g = new MockGain(); this.gains.push(g); return g; }
  createOscillator(): MockOsc { const o = new MockOsc(); this.oscs.push(o); return o; }
  createBufferSource(): MockSource { const s = new MockSource(); this.sources.push(s); return s; }
  createBiquadFilter(): MockBiquad { const b = new MockBiquad(); this.biquads.push(b); return b; }
  createStereoPanner(): MockPanner { const p = new MockPanner(); this.panners.push(p); return p; }
  createBuffer(_ch: number, len: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(len) };
  }
  /** Every node this context ever made. */
  nodeCount(): number {
    return this.oscs.length + this.sources.length + this.gains.length + this.biquads.length + this.panners.length;
  }
}

// ---------------------------------------------------------------------------
// Harness: fresh window + fresh module per test
// ---------------------------------------------------------------------------

type AudioModule = typeof import('../systems/audio');

async function freshAudio(): Promise<{ mod: AudioModule; ac: () => MockAudioContext }> {
  vi.resetModules();
  MockAudioContext.instances = [];
  const g = globalThis as unknown as { window: unknown };
  g.window = {
    AudioContext: MockAudioContext,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: () => undefined,
  };
  const mod = await import('../systems/audio');
  return {
    mod,
    ac: () => {
      const inst = MockAudioContext.instances[MockAudioContext.instances.length - 1];
      if (!inst) throw new Error('no AudioContext created yet');
      return inst;
    },
  };
}

function stubLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  return map;
}

// ---------------------------------------------------------------------------
// Lifecycle: nothing exists before the first gesture/unlock
// ---------------------------------------------------------------------------

describe('engine lifecycle', () => {
  it('owns zero nodes and no context before start', async () => {
    const { mod } = await freshAudio();
    expect(mod.audioEngine.started()).toBe(false);
    expect(MockAudioContext.instances.length).toBe(0);
  });

  it('unlock creates exactly one context, reused afterwards', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    mod.audioEngine.unlock();
    mod.sfx.play('ui');
    expect(MockAudioContext.instances.length).toBe(1);
    expect(mod.audioEngine.started()).toBe(true);
    expect(ac().nodeCount()).toBeGreaterThan(0);
  });

  it('mute set before start lands on the master gain at creation', async () => {
    const { mod, ac } = await freshAudio();
    mod.sfx.setMuted(true);
    mod.sfx.setVolume(0.5);
    mod.audioEngine.unlock();
    const ctx = ac();
    // master is the gain wired to the destination
    const master = ctx.gains.find((gn) => gn.connections.includes(ctx.destination));
    expect(master).toBeDefined();
    expect(master!.gain.value).toBe(0);
    mod.sfx.setMuted(false);
    expect(master!.gain.value).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Mixer graph: four buses -> room filter -> master -> destination
// ---------------------------------------------------------------------------

describe('bus graph', () => {
  it('routes every bus through the shared room filter into master', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    const ctx = ac();
    const master = ctx.gains.find((gn) => gn.connections.includes(ctx.destination))!;
    // the room filter is the (single) lowpass at 16 kHz feeding master
    const room = ctx.biquads.find((b) => b.connections.includes(master));
    expect(room).toBeDefined();
    expect(room!.frequency.value).toBe(16000);
    // 4 bus gains + master = at least 5 gains, buses all feed the room
    const busGains = ctx.gains.filter((gn) => gn !== master && gn.connections.includes(room!));
    expect(busGains.length).toBe(4);
  });

  it('ambience start builds the four persistent env layers', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    mod.ambience.start();
    const ctx = ac();
    // wind + rain + surf + buzz loop sources, plus the swell LFO osc
    expect(ctx.sources.length).toBeGreaterThanOrEqual(4);
    expect(ctx.sources.every((s) => s.loop)).toBe(true);
    mod.ambience.stop();
  });
});

// ---------------------------------------------------------------------------
// Pure mappings
// ---------------------------------------------------------------------------

describe('weather -> wind mapping', () => {
  it('pins the wind bed targets across the range', async () => {
    const { mod } = await freshAudio();
    expect(mod.windTargets(0, false)).toEqual({ freq: 170, gain: 0.025 });
    expect(mod.windTargets(0.25, false).freq).toBeCloseTo(330);
    expect(mod.windTargets(0.25, false).gain).toBeCloseTo(0.0638);
    expect(mod.windTargets(1, false)).toEqual({ freq: 810, gain: 0.18 });
    // night darkens the bed's filter, same gain curve
    expect(mod.windTargets(1, true).freq).toBeCloseTo(810 * 0.72);
    expect(mod.windTargets(1, true).gain).toBeCloseTo(0.18);
    // monotonic in wind speed
    let prev = -1;
    for (const w of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const g = mod.windTargets(w, false).gain;
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });

  it('rain gain is zero under the drizzle floor and linear above', async () => {
    const { mod } = await freshAudio();
    expect(mod.rainGain(0)).toBe(0);
    expect(mod.rainGain(0.03)).toBe(0);
    expect(mod.rainGain(0.6)).toBeCloseTo(0.078);
    expect(mod.rainGain(1)).toBeCloseTo(0.13);
  });

  it('surf gain follows the shoreline curve', async () => {
    const { mod } = await freshAudio();
    expect(mod.surfGain(0)).toBeCloseTo(0.2);
    expect(mod.surfGain(24)).toBeCloseTo(0.05);
    expect(mod.surfGain(48)).toBe(0);
    expect(mod.surfGain(120)).toBe(0);
  });

  it('room cutoff sweeps 16 kHz -> 650 Hz with the interior factor', async () => {
    const { mod } = await freshAudio();
    expect(mod.roomCutoff(0)).toBe(16000);
    expect(mod.roomCutoff(1)).toBeCloseTo(650);
    expect(mod.roomCutoff(0.5)).toBeLessThan(mod.roomCutoff(0.25));
    expect(mod.roomCutoff(0.5)).toBeGreaterThan(mod.roomCutoff(0.75));
  });

  it('under-roof is a plan-box + plate-height test', async () => {
    const { mod } = await freshAudio();
    const roofs = [{ x0: 0, z0: 0, x1: 10, z1: 10, topY: 3 }];
    expect(mod.isUnderRoof(5, 1.7, 5, roofs)).toBe(true);
    expect(mod.isUnderRoof(5, 8, 5, roofs)).toBe(false); // standing on the roof
    expect(mod.isUnderRoof(15, 1.7, 5, roofs)).toBe(false);
    expect(mod.isUnderRoof(5, 1.7, 5, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spatialization
// ---------------------------------------------------------------------------

describe('distance + pan', () => {
  it('distance gain is full inside the reference and rolls off past it', async () => {
    const { mod } = await freshAudio();
    expect(mod.distanceGain(0)).toBe(1);
    expect(mod.distanceGain(mod.DIST_REF_M)).toBe(1);
    expect(mod.distanceGain(8)).toBeCloseTo(Math.pow(0.5, 0.8));
    expect(mod.distanceGain(40)).toBeLessThan(mod.distanceGain(8));
  });

  it('a sound beyond the cutoff is never voiced', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    mod.audioEngine.setListener(0, 0, 0, 1);
    const before = ac().nodeCount();
    mod.sfx.gunshot('rifle', { at: { x: mod.DIST_CUTOFF_M + 40, z: 0 } });
    expect(ac().nodeCount()).toBe(before);
    mod.sfx.gunshot('rifle', { at: { x: 20, z: 0 } });
    expect(ac().nodeCount()).toBeGreaterThan(before);
  });

  it('pan follows the side component against the listener facing', async () => {
    const { mod } = await freshAudio();
    mod.setListener(0, 0, 0, 1); // facing +z
    expect(mod.panFor(0, 10)).toBeCloseTo(0); // dead ahead
    expect(Math.abs(mod.panFor(10, 0))).toBeCloseTo(0.8); // hard to one side
    expect(mod.panFor(10, 0)).toBe(-mod.panFor(-10, 0)); // mirrored
  });
});

// ---------------------------------------------------------------------------
// Voice cap + stealing
// ---------------------------------------------------------------------------

describe('voice management', () => {
  it('caps simultaneous one-shot voices, stealing oldest-quietest', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    const ctx = ac();
    // 'shot' = 1 noise + 1 osc = 2 voices per play
    const plays = 30;
    for (let i = 0; i < plays; i++) {
      ctx.currentTime = i * 0.05; // age the earlier voices
      mod.sfx.play('shot');
    }
    const attempted = plays * 2;
    const stolen = [...ctx.oscs, ...ctx.sources].filter(
      (n) => n.stopArgs.some((a) => a === undefined),
    ).length;
    expect(stolen).toBe(attempted - mod.MAX_VOICES);
    // and the earliest voices are the ones that got stolen
    expect(ctx.sources[0].stopArgs.some((a) => a === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Engine voice
// ---------------------------------------------------------------------------

describe('engine voice', () => {
  it('engine frequencies track crank rpm', async () => {
    const { mod } = await freshAudio();
    expect(mod.engineFreqs(900)).toEqual({ fund: 30, sub: 15 });
    expect(mod.engineFreqs(6000)).toEqual({ fund: 200, sub: 100 });
    expect(mod.engineFreqs(0)).toEqual({ fund: 0, sub: 0 });
  });

  it('engineUpdate spins up the voice and pitches it from rpm', async () => {
    const { mod, ac } = await freshAudio();
    mod.audioEngine.unlock();
    expect(mod.audioEngine.engineRunning()).toBe(false);
    mod.audioEngine.engineUpdate({ rpm: 3000, idleRpm: 900, redlineRpm: 7000, load: 0.5, speedMps: 12, surface: 'road' });
    expect(mod.audioEngine.engineRunning()).toBe(true);
    const ctx = ac();
    const saw = ctx.oscs.find((o) => o.type === 'sawtooth');
    expect(saw).toBeDefined();
    // fund at 3000 rpm = 100 Hz, applied via setTargetAtTime
    expect(saw!.frequency.targetCalls).toContain(100);
    mod.audioEngine.engineStop();
    expect(mod.audioEngine.engineRunning()).toBe(false);
  });

  it('tire gain grows with speed squared and is surface-dependent', async () => {
    const { mod } = await freshAudio();
    expect(mod.tireGain('road', 0)).toBe(0);
    expect(mod.tireGain('road', 30)).toBeCloseTo(0.05);
    expect(mod.tireGain('road', 15)).toBeCloseTo(0.0125);
    expect(mod.tireGain('granite', 30)).toBeGreaterThan(mod.tireGain('road', 30));
  });
});

// ---------------------------------------------------------------------------
// Footstep clock == the animation's stride clock
// ---------------------------------------------------------------------------

describe('StepClock', () => {
  it('fires exactly where the bob cycle strikes (phase k·π)', async () => {
    const { mod } = await freshAudio();
    const clock = new mod.StepClock(BOB_CYCLE_M);
    // feed the very increments the Player feeds bobPhaseDelta
    let steps = 0;
    let phase = 0;
    for (let i = 0; i < 200; i++) {
      const d = 0.1; // metres per frame at a steady walk
      phase += bobPhaseDelta(d);
      steps += clock.advance(d);
      // invariant: steps fired == footfalls the phase has crossed
      expect(steps).toBe(Math.floor(phase / Math.PI));
    }
    expect(steps).toBe(8); // 20 m at one step per 2.4 m
  });

  it('matches the figureAnim gait clock for companion strides', async () => {
    const { mod } = await freshAudio();
    const clock = new mod.StepClock(GAITS.human.cycleM);
    let phase = 0;
    let steps = 0;
    for (let i = 0; i < 100; i++) {
      phase = gaitPhaseAdvance(phase, 0.17, GAITS.human.cycleM);
      steps += clock.advance(0.17);
      expect(steps).toBe(Math.floor(phase / Math.PI));
    }
    // one step per half-cycle: 17 m at cycleM 1.7 => 20 steps
    expect(steps).toBe(20);
  });

  it('a step falls due exactly every cycleM/2 metres', async () => {
    const { mod } = await freshAudio();
    const clock = new mod.StepClock(4.8);
    expect(clock.advance(2.39)).toBe(0);
    expect(clock.advance(0.01)).toBe(1);
    expect(clock.advance(2.4)).toBe(1);
    clock.reset();
    expect(clock.advance(2.4)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gun classes + vocal/step tables
// ---------------------------------------------------------------------------

describe('sound tables', () => {
  it('maps every ranged item id to its gunshot class', async () => {
    const { mod } = await freshAudio();
    expect(mod.gunClassForItem('pistol')).toBe('pistol');
    expect(mod.gunClassForItem('revolver')).toBe('revolver');
    expect(mod.gunClassForItem('smg')).toBe('smg');
    expect(mod.gunClassForItem('carbine')).toBe('carbine');
    expect(mod.gunClassForItem('hunting_rifle')).toBe('rifle');
    expect(mod.gunClassForItem('dmr')).toBe('rifle');
    expect(mod.gunClassForItem('shotgun')).toBe('shotgun');
    expect(mod.gunClassForItem('flare_gun')).toBe('flare');
    expect(mod.gunClassForItem('crossbow')).toBe('bow');
    expect(mod.gunClassForItem('spoon')).toBe('pistol'); // safe default
    expect(mod.gunClassForItem(null)).toBe('pistol');
  });

  it('gunshot recipes are ordered by power where it matters', async () => {
    const { mod } = await freshAudio();
    expect(mod.GUNSHOTS.shotgun.peak).toBeGreaterThan(mod.GUNSHOTS.pistol.peak);
    expect(mod.GUNSHOTS.rifle.tailDecay).toBeGreaterThan(mod.GUNSHOTS.smg.tailDecay);
    expect(mod.GUNSHOTS.bow.peak).toBeLessThan(mod.GUNSHOTS.pistol.peak);
  });

  it('has a vocal recipe for every husk kind', async () => {
    const { mod } = await freshAudio();
    for (const kind of ['shambler', 'stalker', 'armored', 'screamer', 'brute', 'crawler', 'bloater', 'spitter']) {
      expect(mod.VOCALS[kind], kind).toBeDefined();
      expect(mod.VOCALS[kind].peak).toBeGreaterThan(0);
    }
    // the brute is the deepest voice on the island
    const freqs = Object.values(mod.VOCALS).map((v) => v.baseFreq);
    expect(mod.VOCALS.brute.baseFreq).toBe(Math.min(...freqs));
  });
});

// ---------------------------------------------------------------------------
// Settings persistence through the store
// ---------------------------------------------------------------------------

describe('store audio settings', () => {
  it('defaults unmuted/full, persists changes, and reads them back on a fresh store', async () => {
    stubLocalStorage();
    await freshAudio(); // installs the mock window first
    vi.resetModules();
    const store1 = await import('../store/gameStore');
    expect(store1.useGameStore.getState().audioMuted).toBe(false);
    expect(store1.useGameStore.getState().audioVolume).toBe(1);
    store1.useGameStore.getState().setAudioVolume(0.4);
    store1.useGameStore.getState().setAudioMuted(true);
    const raw = (globalThis as unknown as { localStorage: { getItem(k: string): string | null } })
      .localStorage.getItem('nomad-audio');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ muted: true, volume: 0.4 });
    // a fresh store (new module graph) reads the persisted settings
    vi.resetModules();
    const store2 = await import('../store/gameStore');
    expect(store2.useGameStore.getState().audioMuted).toBe(true);
    expect(store2.useGameStore.getState().audioVolume).toBe(0.4);
  });
});
