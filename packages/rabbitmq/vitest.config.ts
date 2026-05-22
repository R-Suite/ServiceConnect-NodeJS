import { defineConfig } from 'vitest/config';

// Base config is intentionally empty under vitest 2.x: project split lives in
// `vitest.workspace.ts` (the vitest 2 API). Future vitest 3 bump can move the
// project array back here and delete the workspace file.
export default defineConfig({});
