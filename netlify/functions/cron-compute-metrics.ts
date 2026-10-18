import type { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { runMetricsForCompany, todayIso } from './utils/metrics';
import { expireStaleTableScores, TABLE_SCORE_MAX_AGE_DAYS } from './utils/tableScores';

/**
 * Scheduled (netlify.toml, daily): writes today's facility metric snapshots
 * for every company. No auth — Netlify invokes it on the schedule and refuses
 * ordinary HTTP calls to scheduled functions, which is why the director-only
 * "Recompute now" lives in a separate function (compute-metrics.ts).
 */
export const handler: Handler = async () => {
    const asOf = todayIso();
    try {
        const { rows: companies } = await sql`SELECT id FROM companies`;
        let written = 0;
        let failed = 0;
        for (const c of companies) {
            try {
                const r = await runMetricsForCompany(c.id, asOf, 'schedule');
                written += r.written;
                if (r.failures.length) failed++;
            } catch (err) {
                failed++;
                console.error('[cron-compute-metrics] company failed', c.id, err);
            }
            // Table scores (sheet imports) have no plant to end them: close any older than a cycle.
            try {
                const expired = await expireStaleTableScores(c.id);
                if (expired) console.log(`[cron-compute-metrics] ${c.id}: closed ${expired} table score(s) older than ${TABLE_SCORE_MAX_AGE_DAYS} days`);
            } catch (err) {
                console.error('[cron-compute-metrics] table score expiry failed', c.id, err);
            }
        }
        console.log(`[cron-compute-metrics] ${asOf}: ${companies.length} companies, ${written} rows, ${failed} with failures`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, date: asOf, companies: companies.length, written, failed }) };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[cron-compute-metrics] error', msg);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to compute metrics', detail: msg }) };
    }
};

// Netlify scheduled function — daily at 05:20 UTC (also declared in netlify.toml).
export const config = {
    schedule: '20 5 * * *',
};
