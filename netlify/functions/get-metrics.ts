import type { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';
import { METRIC_DEFINITIONS, METRIC_KEYS, summarizeLatest, type SnapshotPoint } from './utils/metrics';

/**
 * GET /get-metrics?keys=a,b&days=30&compare=7
 *
 * Returns the metric definitions, the time series for the requested keys
 * over the window, a latest-value summary with change vs `compare` days
 * earlier, and the most recent compute runs.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });

        const q = event.queryStringParameters ?? {};
        const requested = q.keys ? q.keys.split(',').map(s => s.trim()).filter(k => METRIC_KEYS.includes(k)) : [];
        const keys = requested.length ? requested : METRIC_KEYS;
        const days = Math.min(730, Math.max(1, parseInt(q.days ?? '90', 10) || 90));
        const compare = Math.min(365, Math.max(1, parseInt(q.compare ?? '7', 10) || 7));

        const { rows } = await sql`
            SELECT metric_key, dimension, snapshot_date::text AS snapshot_date, value::float AS value
            FROM metric_snapshots
            WHERE company_id = ${context.companyId}
              AND metric_key = ANY(${keys}::text[])
              AND snapshot_date >= CURRENT_DATE - ${days}::int
            ORDER BY snapshot_date ASC
        `;
        const points: SnapshotPoint[] = rows.map((r: any) => ({ key: r.metric_key, dimension: r.dimension, date: r.snapshot_date, value: Number(r.value) }));

        const series: Record<string, SnapshotPoint[]> = {};
        for (const p of points) (series[p.key] ??= []).push(p);

        const { rows: runs } = await sql`
            SELECT id, snapshot_date::text AS snapshot_date, trigger, status, metrics_written, error, started_at, finished_at
            FROM metric_runs
            WHERE company_id = ${context.companyId} OR (company_id IS NULL)
            ORDER BY started_at DESC
            LIMIT 10
        `;

        return json(200, {
            definitions: METRIC_DEFINITIONS.filter(d => keys.includes(d.key)),
            windowDays: days,
            compareDays: compare,
            latest: summarizeLatest(points, compare),
            series,
            runs: runs.map((r: any) => ({
                id: r.id, date: r.snapshot_date, trigger: r.trigger, status: r.status, metricsWritten: r.metrics_written,
                error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
            })),
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[get-metrics] error', msg);
        return json(500, { error: 'Failed to load metrics', detail: msg });
    }
};

function json(statusCode: number, body: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
