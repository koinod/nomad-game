// Minimal node builtin shims for the proof-export compile (the repo
// doesn't carry @types/node; these cover exactly what the driver uses).
declare module 'node:fs' {
  export function mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  export function writeFileSync(p: string, data: string): void;
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
}
declare const process: { cwd(): string };
