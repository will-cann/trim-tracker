import type { Handler } from '@netlify/functions';
import { resolveContext, authorize } from './utils/auth';
import { runMetricsForCompany, shiftDate, todayIso } from './utils/metrics';

/**
 * Manual recompute of the facility metric snapshots for the caller's company.
 *
 * POST with a Bearer token (director+). Body { date?, backfillDays? }
 * recomputes one day (today by default), or `date` and the N days before it
 * when backfillDays is set. One request is capped at 14 days so it stays
 * inside the function time limit; the Reports page backfills a longer range
 * as a series of requests.
 *
 * The nightly run for every company is cron-compute-metrics.ts. It must be a
 * separate function: Netlify answers HTTP calls to a scheduled function with
 * an empty 403, so this one is deliberately not on a schedule.
 */
const MAX_BACKFILL_DAYS_PER_REQUEST = 14;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });
        const denied = authorize(context, 'director');
        if (denied) return json(403, { error: 'Only directors and admins can recompute metrics', detail: `Your role is ${context.role}.` });

        const body = JSON.parse(event.body || '{}');
        const today = todayIso();
        const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date <= today ? body.date : today;
        const backfillDays = Math.min(MAX_BACKFILL_DAYS_PER_REQUEST, Math.max(0, parseInt(body.backfillDays, 10) || 0));

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
