import { run, type Runner, type TaskList } from 'graphile-worker';
import { syncOrganizationToAttio } from './attio';
import { config } from './config';
import { getPool, type Queryable } from './db';
import { demoConfirmationEmail, demoNotificationEmail, sendEmail, type DemoRequestEmailDetails } from './email';
import { enrichOrganization } from './enrich';
import { enqueue, type JobPayloads } from './jobs';
import { getDemoRequestDetail, prefilledSchedulingUrl } from './prospects';

/**
 * Scheduled jobs (UTC). Graphile Worker de-duplicates cron runs across
 * restarts and backfills nothing by default.
 *   - daily_digest:    14:00 UTC (09:00 CT), new + stale demo requests, failures
 *   - attio_reconcile: 08:00 UTC, retry orgs whose Attio sync failed or never ran
 */
export const CRONTAB = [
    '0 14 * * * daily_digest',
    '0 8 * * * attio_reconcile',
].join('\n');

function emailDetails(d: Record<string, any>): DemoRequestEmailDetails {
    return {
        id: d.id, name: d.person_name, email: d.person_email, company: d.company_name, role: d.person_role,
        phone: d.person_phone, state: d.state, operationType: d.operation_type, facilitySize: d.facility_size,
        currentTools: d.current_tools, message: d.message, source: d.source, utmSource: d.utm_source,
        utmMedium: d.utm_medium, utmCampaign: d.utm_campaign, referrer: d.referrer,
    };
}

export function buildTaskHandlers(db: Queryable = getPool()) {
    const handlers: { [K in keyof JobPayloads]: (payload: JobPayloads[K]) => Promise<void> } = {
        async notify_demo_request({ demoRequestId }) {
            const d = await getDemoRequestDetail(db, demoRequestId);
            if (!d || d.notified_at) return;
            const res = await sendEmail(demoNotificationEmail(config.demoNotifyEmail, emailDetails(d)));
            if (!res.success) throw new Error(`notification email failed: ${res.error}`);
            await db.query(`UPDATE demo_requests SET notified_at = NOW() WHERE id = $1`, [demoRequestId]);
        },

        async send_demo_confirmation({ demoRequestId }) {
            const d = await getDemoRequestDetail(db, demoRequestId);
            if (!d) return;
            const res = await sendEmail(demoConfirmationEmail({
                to: d.person_email,
                name: d.person_name,
                replyTo: config.demoNotifyEmail,
                schedulingUrl: prefilledSchedulingUrl(config.demoSchedulingUrl, d.person_name, d.person_email),
            }));
            if (!res.success) throw new Error(`confirmation email failed: ${res.error}`);
        },

        async enrich_organization({ organizationId, force }) {
            const outcome = await enrichOrganization(db, organizationId, { force });
            console.log('[enrich]', organizationId, outcome);
        },

        async sync_to_attio({ organizationId }) {
            await syncOrganizationToAttio(db, organizationId);
        },

        async daily_digest() {
            const text = await buildDigest(db);
            if (!text) return;
            const res = await sendEmail({ to: config.demoNotifyEmail, subject: 'NeuroCann growth digest', text, fromName: 'NeuroCann Growth' });
            if (!res.success) throw new Error(`digest email failed: ${res.error}`);
        },

        async attio_reconcile() {
            if (!config.attioApiKey) return;
            const { rows } = await db.query(
                `SELECT id FROM organizations
                 WHERE attio_sync_error IS NOT NULL OR attio_synced_at IS NULL OR attio_synced_at < updated_at
                 LIMIT 200`,
            );
            for (const r of rows) await enqueue(db, 'sync_to_attio', { organizationId: r.id }, { jobKey: `attio:${r.id}` });
        },
    };
    return handlers;
}

/** Plain-text digest, or null when there's nothing worth sending. */
export async function buildDigest(db: Queryable): Promise<string | null> {
    const { rows: fresh } = await db.query(
        `SELECT dr.company_name, p.name, p.email, dr.source, o.fit_score
         FROM demo_requests dr JOIN people p ON p.id = dr.person_id LEFT JOIN organizations o ON o.id = dr.organization_id
         WHERE dr.created_at > NOW() - INTERVAL '1 day' ORDER BY dr.created_at`,
    );
    const { rows: stale } = await db.query(
        `SELECT dr.company_name, p.name, p.email, dr.created_at
         FROM demo_requests dr JOIN people p ON p.id = dr.person_id
         WHERE dr.status = 'requested' AND dr.created_at < NOW() - INTERVAL '2 days'
         ORDER BY dr.created_at LIMIT 25`,
    );
    const { rows: failures } = await db.query(
        `SELECT o.name, er.provider, er.error FROM enrichment_runs er JOIN organizations o ON o.id = er.organization_id
         WHERE er.status = 'failed' AND er.started_at > NOW() - INTERVAL '1 day'
         UNION ALL
         SELECT name, 'attio', attio_sync_error FROM organizations WHERE attio_sync_error IS NOT NULL`,
    );
    if (!fresh.length && !stale.length && !failures.length) return null;

    const lines: string[] = [];
    lines.push(`New demo requests (last 24h): ${fresh.length}`);
    for (const r of fresh) {
        lines.push(`  - ${r.company_name}: ${r.name} <${r.email}>${r.fit_score != null ? ` · fit ${r.fit_score}` : ''}${r.source ? ` · from ${r.source}` : ''}`);
    }
    if (stale.length) {
        lines.push('', `Still unscheduled after 2+ days: ${stale.length}`);
        for (const r of stale) lines.push(`  - ${r.company_name}: ${r.name} <${r.email}> (requested ${new Date(r.created_at).toISOString().slice(0, 10)})`);
    }
    if (failures.length) {
        lines.push('', 'Failures:');
        for (const f of failures) lines.push(`  - ${f.name} [${f.provider}]: ${String(f.error).slice(0, 200)}`);
    }
    lines.push('', 'Mark a demo scheduled: growth demos update <id> --status scheduled');
    return lines.join('\n');
}

export async function startWorker(): Promise<Runner> {
    const handlers = buildTaskHandlers();
    const taskList: TaskList = {};
    for (const [name, fn] of Object.entries(handlers)) {
        taskList[name] = async payload => (fn as (p: unknown) => Promise<void>)(payload);
    }
    return run({ pgPool: getPool(), taskList, crontab: CRONTAB, concurrency: 4, noHandleSignals: true });
}
