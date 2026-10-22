import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '/home/hatch/workspace/nomad-wt/perf',
  test: {
    include: ['tools/perf/*.probe.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
