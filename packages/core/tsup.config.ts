import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/testing/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node22',
    sourcemap: true,
    splitting: true,
    external: ['vitest'],
});
