import pg from 'pg';
import { getPool } from '../src/db';
import { migrate } from '../src/migrate';

/** True when the test Postgres (TEST_DATABASE_URL) is reachable. */
export async function dbAvailable(): Promise<boolean> {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        await client.end();
        return true;
    } catch {
        return false;
    }
}

/** Fresh schema for each test file. */
export async function resetDb() {
    const pool = getPool();
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS graphile_worker CASCADE;');
    await migrate(() => {});
}

export async function truncateAll() {
    await getPool().query(`TRUNCATE organizations, people, demo_requests, conversations, messages, activities, licenses, enrichment_runs CASCADE;
                           DELETE FROM graphile_worker._private_jobs;`);
}

export async function queuedJobs(): Promise<Array<{ task_identifier: string; payload: any; key: string | null }>> {
    const { rows } = await getPool().query(`SELECT t.identifier AS task_identifier, j.payload, j.key
         FROM graphile_worker._private_jobs j JOIN graphile_worker._private_tasks t ON t.id = j.task_id ORDER BY j.id`);
    return rows;
}
