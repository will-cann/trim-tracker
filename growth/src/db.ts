import pg from 'pg';
import { config } from './config';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
    if (!pool) {
        if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
        pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
        // Idle-client errors (e.g. the DB restarting) must not crash the process.
        pool.on('error', err => console.error('[db] idle client error:', err.message));
        pool.on('connect', client => {
            client.on('error', err => console.error('[db] client error:', err.message));
        });
    }
    return pool;
}

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** Run `fn` inside a transaction on a dedicated client. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
