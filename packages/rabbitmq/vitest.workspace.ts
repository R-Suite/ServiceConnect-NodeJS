import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
    {
        extends: './vitest.config.ts',
        test: {
            name: 'unit',
            include: ['test/unit/**/*.test.ts', 'test/smoke.test.ts'],
        },
    },
    {
        extends: './vitest.config.ts',
        test: {
            name: 'e2e',
            include: ['test/e2e/**/*.test.ts'],
            testTimeout: 60_000,
            hookTimeout: 60_000,
            globalSetup: ['./test/e2e/setup.ts'],
            // The e2e suite drives a single shared RabbitMQ broker (and some tests force-close
            // connections or delete queues). Run the files sequentially so they don't thrash the broker
            // and starve long-running handlers (e.g. the cancellation test) of delivery under contention.
            fileParallelism: false,
        },
    },
]);
