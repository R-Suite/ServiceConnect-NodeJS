import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
