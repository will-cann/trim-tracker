import type { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { isT3Configured, t3Mode } from './utils/t3';
import { resolveSyncCompany } from './utils/metrcSync';
import type { MetrcSyncListState, MetrcSyncRun, MetrcSyncStatus } from '../../shared/manifest/metrcSync';

/**
 * What Settings → Metrc Sync shows: whether this deploy syncs into the caller's
 * company, the last runs with per-list counts and errors, each list's cursor,
 * and how many synced rows NeuroCann holds. Read-only.
 */

const RECENT_RUNS = 10;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });
        const { ctx } = auth;

        const configured = isT3Configured();
        const company = resolveSyncCompany(process.env.MANIFEST_COMPANY_IDS);
        let enabled = false;
        let reason: string | undefined;
        if (!configured) reason = 'Metrc sync is not set up on this deploy (T3_API_KEY unset).';
        else if (!company.ok) reason = company.reason;
        else if (company.companyId !== ctx.companyId.toLowerCase()) reason = 'This deploy syncs Metrc into a different company.';
        else enabled = true;

        const canRun = enabled && (ctx.role === 'admin' || ctx.role === 'director');

        const base: MetrcSyncStatus = {
            configured,
            mode: t3Mode(),
            enabled,
            reason,
            canRun,
            lastRun: null,
            recentRuns: [],
            lists: [],
            totals: { items: 0, strains: 0, rooms: 0, packages: 0, plantBatches: 0, harvests: 0, plants: 0 },
        };
        if (!enabled) return json(200, base);

        const [runs, states, totals] = await Promise.all([
            sql`
                SELECT r.id, r.trigger, r.status, r.dry_run, r.queued_at, r.started_at, r.finished_at,
                       r.counts, r.errors, r.report, r.error, u.name AS started_by_name
                  FROM metrc_sync_runs r
                  LEFT JOIN users u ON u.id = r.started_by
                 WHERE r.company_id = ${ctx.companyId}
                 ORDER BY r.queued_at DESC
                 LIMIT ${RECENT_RUNS}
            `,
            sql`
                SELECT license_number, list, cursor, last_success_at, last_error, last_error_at
                  FROM metrc_sync_state
                 WHERE company_id = ${ctx.companyId}
                 ORDER BY license_number, list
            `,
            sql`
                SELECT
                    (SELECT COUNT(*)::int FROM metrc_items WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS items,
                    (SELECT COUNT(*)::int FROM strains WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS strains,
                    (SELECT COUNT(*)::int FROM rooms WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS rooms,
                    (SELECT COUNT(*)::int FROM packages WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS packages,
                    (SELECT COUNT(*)::int FROM plant_batches WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS plant_batches,
                    (SELECT COUNT(*)::int FROM harvests WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS harvests,
                    (SELECT COUNT(*)::int FROM plants WHERE company_id = ${ctx.companyId} AND metrc_id IS NOT NULL) AS plants
            `,
        ]);

        const recentRuns: MetrcSyncRun[] = runs.rows.map((r: any) => ({
            id: r.id,
            trigger: r.trigger,
            status: r.status,
            dryRun: Boolean(r.dry_run),
            startedByName: r.started_by_name ?? null,
            queuedAt: r.queued_at,
            startedAt: r.started_at ?? null,
            finishedAt: r.finished_at ?? null,
            counts: r.counts ?? {},
            errors: r.errors ?? [],
            report: r.report ?? null,
            error: r.error ?? null,
        }));
        const lists: MetrcSyncListState[] = states.rows.map((s: any) => ({
            license: s.license_number,
            list: s.list,
            cursor: s.cursor ?? null,
            lastSuccessAt: s.last_success_at ?? null,
            lastError: s.last_error ?? null,
            lastErrorAt: s.last_error_at ?? null,
        }));
        const t = totals.rows[0] ?? {};

        const body: MetrcSyncStatus = {
            ...base,
            lastRun: recentRuns[0] ?? null,
            recentRuns,
            lists,
            totals: { items: t.items ?? 0, strains: t.strains ?? 0, rooms: t.rooms ?? 0, packages: t.packages ?? 0, plantBatches: t.plant_batches ?? 0, harvests: t.harvests ?? 0, plants: t.plants ?? 0 },
        };
        return json(200, body);
    } catch (error) {
        console.error('metrc-sync-status error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
