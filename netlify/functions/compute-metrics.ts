import type { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';
import { runMetricsForCompany, shiftDate, todayIso } from './utils/metrics';

/**
 * Computes the facility metric snapshots.
 *
 * Scheduled (netlify.toml, daily): no Authorization header. Runs every
 * company for today's date. Returns only counts.
 *
 * Manual: POST with a Bearer token (director+). Body { date?, backfillDays? }
 * recomputes the caller's company for one day, or for the last N days when
 * backfillDays is set (max 365) — e.g. right after the migration so the
 * Reports page has a trend from day one.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const hasAuth = !!event.headers.authorization;
    try {
        if (!hasAuth) {
            // Scheduled invocation.
            const asOf = todayIso();
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
                    console.error('[compute-metrics] company failed', c.id, err);
                }
            }
            console.log(`[compute-metrics] ${asOf}: ${companies.length} companies, ${written} rows, ${failed} with failures`);
            return json(200, { ok: true, date: asOf, companies: companies.length, written, failed });
        }

        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });
        const denied = authorize(context, 'director');
        if (denied) return denied;

        const body = JSON.parse(event.body || '{}');
        const today = todayIso();
        const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date <= today ? body.date : today;
        const backfillDays = Math.min(365, Math.max(0, parseInt(body.backfillDays, 10) || 0));

        const days: string[] = [];
        for (let i = backfillDays; i >= 0; i--) days.push(shiftDate(date, -i));

        let written = 0;
        const failures: Array<{ date: string; key: string; error: string }> = [];
        for (const d of days) {
            const r = await runMetricsForCompany(context.companyId, d, backfillDays > 0 ? 'backfill' : 'manual');
            written += r.written;
            for (const f of r.failures) failures.push({ date: d, ...f });
        }
        return json(200, { ok: true, days: days.length, written, failures });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[compute-metrics] error', msg);
        return json(500, { error: 'Failed to compute metrics', detail: msg });
    }
};

function json(statusCode: number, body: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
