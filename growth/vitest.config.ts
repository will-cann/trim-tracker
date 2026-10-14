import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // DB-backed tests share one Postgres database; run files serially.
        fileParallelism: false,
        setupFiles: ['test/setup.ts'],
    },
});
