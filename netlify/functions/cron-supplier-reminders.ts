import type { Handler } from '@netlify/functions';
import { sql } from './utils/db';

/**
 * Daily cron — creates a human_task to reach out to biomass suppliers whose
 * outreach cadence has lapsed. Runs without user context; loops per-company.
 *
 * Columns used (added by this unit's migration + Unit 1's CRM migration):
 *   vendors.vendor_type          -- 'biomass' | 'both' | ... (Unit 1)
 *   vendors.last_contacted_at    -- timestamptz (Unit 1)
 *   vendors.outreach_cadence_days (Unit 9)
 *   vendors.next_reminder_at     -- timestamptz (Unit 9)
 *
 * If Unit 1 hasn't landed, the query throws on missing columns — we catch
 * and no-op so the cron is safe to deploy independently.
 */
export const handler: Handler = async () => {
    let created = 0;
    let scanned = 0;

    try {
        // Find every overdue biomass vendor across all companies in one query.
        const { rows: overdue } = await sql`
            SELECT
                v.id,
                v.company_id,
                v.name,
                v.last_contacted_at,
                v.outreach_cadence_days,
                EXTRACT(DAY FROM (NOW() - v.last_contacted_at))::int AS days_since_contact
            FROM vendors v
            WHERE v.vendor_type IN ('biomass', 'both')
              AND v.outreach_cadence_days IS NOT NULL
              AND v.is_active = TRUE
              AND (
                    v.next_reminder_at <= NOW()
                 OR (
                        v.next_reminder_at IS NULL
                    AND v.last_contacted_at IS NOT NULL
                    AND v.last_contacted_at + (v.outreach_cadence_days || ' days')::interval <= NOW()
                    )
              )
        `;

        scanned = overdue.length;

        // Batch: one assignee lookup per distinct company, not per vendor.
        const companyIds = [...new Set(overdue.map(v => v.company_id))];
        const assigneeByCompany = new Map<string, string>();
        if (companyIds.length > 0) {
            const { rows: assignees } = await sql`
                SELECT DISTINCT ON (company_id) company_id, id
                FROM users
                WHERE company_id = ANY(${companyIds}::uuid[])
                  AND role IN ('director', 'admin')
                ORDER BY company_id, CASE role WHEN 'director' THEN 0 ELSE 1 END, created_at
            `;
            for (const row of assignees) assigneeByCompany.set(row.company_id, row.id);
        }

        for (const v of overdue) {
            const assignedToUserId = assigneeByCompany.get(v.company_id) ?? null;

            const daysAgo = v.days_since_contact ?? v.outreach_cadence_days;
            const title = `Reach out to ${v.name} — last contact ${daysAgo} days ago`;

            await sql`
                INSERT INTO human_tasks (
                    company_id, title, priority, category,
                    assigned_to_user_id, created_by_user_id
                ) VALUES (
                    ${v.company_id},
                    ${title},
                    'medium',
                    'other',
                    ${assignedToUserId},
                    NULL
                )
            `;

            // Roll the next reminder forward so we don't re-fire tomorrow.
            await sql`
                UPDATE vendors
                SET next_reminder_at = NOW() + (${v.outreach_cadence_days} || ' days')::interval
                WHERE id = ${v.id}
            `;

            created++;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ scanned, created }),
        };
    } catch (err: any) {
        // Missing columns (Unit 1 not yet landed) — log and no-op.
        const msg = err?.message || String(err);
        if (msg.includes('vendor_type') || msg.includes('last_contacted_at')) {
            console.warn('cron-supplier-reminders: CRM columns not yet present, skipping', msg);
            return { statusCode: 200, body: JSON.stringify({ scanned: 0, created: 0, skipped: true }) };
        }
        console.error('cron-supplier-reminders error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'cron failed', scanned, created }) };
    }
};

// Netlify scheduled function — daily at 14:00 UTC (09:00 CT).
export const config = {
    schedule: '0 14 * * *',
};
