import type { Queryable } from './db';

/**
 * Job names and payloads. Enqueued with graphile_worker.add_job inside the
 * caller's transaction, so a job exists if and only if its data committed.
 */
export interface JobPayloads {
    notify_demo_request: { demoRequestId: string };
    send_demo_confirmation: { demoRequestId: string };
    enrich_organization: { organizationId: string; force?: boolean };
    sync_to_attio: { organizationId: string };
    daily_digest: Record<string, never>;
    attio_reconcile: Record<string, never>;
}
export type JobName = keyof JobPayloads;

export async function enqueue<K extends JobName>(
    db: Queryable,
    name: K,
    payload: JobPayloads[K],
    opts: { jobKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<void> {
    await db.query(
        `SELECT graphile_worker.add_job($1, $2::json, job_key := $3, run_at := $4, max_attempts := $5)`,
        [name, JSON.stringify(payload), opts.jobKey ?? null, opts.runAt ?? null, opts.maxAttempts ?? null],
    );
}
