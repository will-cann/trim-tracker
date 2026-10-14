import { serve } from '@hono/node-server';
import type { Runner } from 'graphile-worker';
import { config } from './config';
import { closePool } from './db';
import { migrate } from './migrate';
import { createApp } from './server';
import { startWorker } from './worker';

/** Boot: apply migrations, start the job worker, serve HTTP. One Railway service. */
async function main() {
    await migrate(msg => console.log(`[migrate] ${msg}`));

    let runner: Runner | null = null;
    if (config.runWorker) {
        runner = await startWorker();
        console.log('[worker] started');
    }

    const server = serve({ fetch: createApp().fetch, port: config.port }, info => {
        console.log(`[http] listening on :${info.port}`);
    });

    const shutdown = async (signal: string) => {
        console.log(`[shutdown] ${signal}`);
        server.close();
        await runner?.stop();
        await closePool();
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(err => {
    console.error('[fatal]', err);
    process.exit(1);
});
