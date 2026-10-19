// STUB — replaced by the systems agent. Signatures must stay exact.
// All sound is procedural WebAudio; no assets.

export type SfxName =
  | 'swing' | 'shot' | 'hit' | 'hurt' | 'pickup' | 'ui'
  | 'step' | 'quest' | 'eat' | 'phone' | 'switch' | 'beacon';

export const sfx = {
  play(_name: SfxName, _opts?: { volume?: number }): void { /* stub */ },
  setMuted(_m: boolean): void { /* stub */ },
};

export const ambience = {
  start(): void { /* stub */ },
  stop(): void { /* stub */ },
  setNight(_isNight: boolean): void { /* stub */ },
  setDanger(_level: 0 | 1 | 2): void { /* stub */ },
};
