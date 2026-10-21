// Minimal Node builtin declarations for source-scanning tests — the
// project ships no @types/node (browser app); tests run under vitest's
// Node runtime, so these modules exist, they just need types for tsc.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(
    path: string,
    opts: { withFileTypes: true },
  ): { name: string; isDirectory(): boolean }[];
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
