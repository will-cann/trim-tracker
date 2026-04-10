import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Amend an existing extraction run's input list.
 *
 * Used for multi-strain runs that accumulate their full input set across
 * multiple user utterances — especially in ambient mode where Deepgram may
 * split a single narration across transcript chunks. Rather than creating
 * a new run for each chunk, the AI calls `extraction_run` with action
 * `amend_inputs` referencing the existing runId, and that routes here.
 *
 * Semantics:
 * - Each entry in `addedSourcePackageIds` is upserted into extraction_run_sources
 *   for the target run.
 * - If the same package is already linked, quantity_used is updated (the
 *   UNIQUE(run_id, package_id) constraint makes this an ON CONFLICT update).
 * - The run itself is not otherwise modified; status stays as-is.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}') as {
            runId?: string;
            addedSourcePackageIds?: string[];
            addedSourcePackageQuantities?: Record<string, number>;
        };

        if (!body.runId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'runId is required' }) };
        }
        const addedIds = Array.isArray(body.addedSourcePackageIds) ? body.addedSourcePackageIds : [];
        const qtyMap: Record<string, number> = body.addedSourcePackageQuantities || {};

        if (addedIds.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'addedSourcePackageIds must be non-empty' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify the run belongs to this company. Scope check must happen
            // before any writes — never trust runId from the request body.
            const runCheck = await client.query(
                `SELECT id, name, status FROM extraction_runs WHERE id = $1 AND company_id = $2`,
                [body.runId, context.companyId]
            );
            if (runCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Run not found' }) };
            }
            const run = runCheck.rows[0];

            // Upsert each package into extraction_run_sources. ON CONFLICT
            // updates quantity_used if the package was already linked — this
            // lets the AI correct a previous quantity in a follow-up chunk
            // ("actually that was 20K not 17K") without creating duplicates.
            for (const pkgId of addedIds) {
                const qty = qtyMap[pkgId] ?? null;
                await client.query(
                    `INSERT INTO extraction_run_sources (run_id, package_id, quantity_used)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (run_id, package_id)
                     DO UPDATE SET quantity_used = EXCLUDED.quantity_used`,
                    [body.runId, pkgId, qty]
                );
            }

            // Refresh source_package_id to point at the first linked source
            // (kept for backwards compat with UI that only renders one input).
            // Do this only if the run doesn't already have one set; don't
            // clobber the primary input picked during creation.
            await client.query(
                `UPDATE extraction_runs
                 SET source_package_id = COALESCE(source_package_id, $1),
                     updated_at = NOW()
                 WHERE id = $2 AND company_id = $3`,
                [addedIds[0], body.runId, context.companyId]
            );

            await client.query('COMMIT');

            // Return the updated input list so the frontend can refresh
            // without re-querying.
            const sourcesResult = await pool.query(
                `SELECT ers.package_id, ers.quantity_used,
                        p.label, p.package_type, p.strain, p.quantity AS package_quantity
                 FROM extraction_run_sources ers
                 LEFT JOIN packages p ON p.id = ers.package_id
                 WHERE ers.run_id = $1
                 ORDER BY ers.created_at ASC`,
                [body.runId]
            );

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId: run.id,
                    runName: run.name,
                    status: run.status,
                    sources: sourcesResult.rows.map(r => ({
                        packageId: r.package_id,
                        quantityUsed: r.quantity_used !== null ? parseFloat(r.quantity_used) : null,
                        label: r.label,
                        packageType: r.package_type,
                        strain: r.strain,
                        packageQuantity: r.package_quantity !== null ? parseFloat(r.package_quantity) : null,
                    })),
                }),
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error amending extraction run inputs:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to amend extraction run inputs' }) };
    }
};
