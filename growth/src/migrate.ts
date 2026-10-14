import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations as runWorkerMigrations } from 'graphile-worker';
import { config } from './config';
import { getPool, closePool } from './db';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/**
 * Apply growth/migrations/*.sql in filename order, each once, each in its own
 * transaction. Also installs Graphile Worker's schema so jobs can be enqueued
 * from SQL (graphile_worker.add_job) inside our own transactions.
 */
export async function migrate(log: (msg: string) => void = console.log) {
    const pool = getPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
            await client.query('COMMIT');
            log(`applied ${file}`);
        } catch (err) {
            await client.query('ROLLBACK');
            throw new Error(`${file}: ${(err as Error).message}`);
        } finally {
            client.release();
        }
    }

    await runWorkerMigrations({ pgPool: pool });
    log('migrations up to date');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const host = (() => { try { return new URL(config.databaseUrl ?? '').host; } catch { return '(unset)'; } })();
    console.log(`Target: ${host}`);
    migrate()
        .then(() => closePool())
        .catch(err => { console.error(err.message); process.exit(1); });
}
