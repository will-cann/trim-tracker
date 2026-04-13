import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

// ─────────────────────────────────────────────────────────────────────────────
// update-extraction-run
//
// Two responsibilities:
//   1. Metadata updates (name, strain, notes, plannedStart, status transitions).
//   2. Completion hook: when status transitions to 'completed' for the first
//      time, run side effects in a single transaction — decrement source
//      packages, apply any pending check-ins to run steps, create output
//      packages from the body's outputs[], populate extraction_run_outputs,
//      and write one extraction_logs row per output for compliance export.
//
// The hook is gated on `extraction_runs.sources_consumed_at IS NULL`. Once
// it runs successfully, sources_consumed_at is set. Subsequent completion
// attempts skip the side effects (idempotent). Cancellation touches nothing.
//
// See `~/.claude/plans/p2-p3-run-lifecycle.md` for the design rationale.
// ─────────────────────────────────────────────────────────────────────────────

interface FinalizeOutput {
    packageType: string;
    quantity: number;
    unit?: string | null;
    label?: string | null;
    strain?: string | null;
    licenseNumber?: string | null;
    notes?: string | null;
}

interface FinalizeCheckIn {
    stepId: string;
    value: number;
    unit?: string | null;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { id, status, name, strain, notes } = body;
        const outputs: FinalizeOutput[] = Array.isArray(body.outputs) ? body.outputs : [];
        const checkIns: FinalizeCheckIn[] = Array.isArray(body.checkIns) ? body.checkIns : [];

        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ── 1. Load the current run and verify ownership
            const { rows: runRows } = await client.query(
                `SELECT id, status, strain, target_product, sources_consumed_at
                 FROM extraction_runs
                 WHERE id = $1 AND company_id = $2
                 FOR UPDATE`,
                [id, context.companyId]
            );
            if (runRows.length === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Run not found' }) };
            }
            const currentRun = runRows[0];
            const isCompletingNow =
                status === 'completed' &&
                currentRun.status !== 'completed' &&
                currentRun.sources_consumed_at == null;

            // ── 2. Build dynamic SET clause for metadata updates
            const sets: string[] = ['updated_at = NOW()'];
            const values: unknown[] = [];
            let idx = 1;

            if (status !== undefined) {
                sets.push(`status = $${idx++}`);
                values.push(status);
                if (status === 'active') {
                    sets.push(`started_at = COALESCE(started_at, NOW())`);
                } else if (status === 'completed' || status === 'cancelled') {
                    sets.push(`completed_at = NOW()`);
                }
            }
            if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name.trim()); }
            if (strain !== undefined) { sets.push(`strain = $${idx++}`); values.push(strain?.trim() || null); }
            if (notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(notes?.trim() || null); }

            // ── 3. Apply pending check-ins to run steps (optional, usually from Finish Run modal)
            // These land before the completion hook so the run has the operator's final values
            // on record when we compute output packages.
            if (checkIns.length > 0) {
                for (const ci of checkIns) {
                    if (!ci.stepId || typeof ci.value !== 'number') continue;
                    await client.query(
                        `UPDATE extraction_run_steps
                         SET check_in_value = $1,
                             check_in_unit = $2,
                             status = CASE WHEN status = 'pending' THEN 'completed' ELSE status END,
                             completed_at = CASE WHEN completed_at IS NULL THEN NOW() ELSE completed_at END
                         WHERE id = $3 AND run_id = $4`,
                        [ci.value, ci.unit || null, ci.stepId, id]
                    );
                }
            }

            // ── 4. Apply the metadata updates (status + fields)
            values.push(id, context.companyId);
            const result = await client.query(
                `UPDATE extraction_runs SET ${sets.join(', ')}
                 WHERE id = $${idx++} AND company_id = $${idx}
                 RETURNING *`,
                values
            );
            const r = result.rows[0];

            // ── 5. Completion hook — only runs on first transition to 'completed'
            let createdOutputs: Array<{
                packageId: string;
                packageType: string;
                quantity: number;
                unit: string;
                label: string;
                sequence: number;
            }> = [];

            if (isCompletingNow) {
                // 5a. Load all source packages for this run via extraction_run_sources.
                //     extraction_run_outputs is the destination; extraction_run_sources is the origin.
                const { rows: sources } = await client.query(
                    `SELECT s.package_id, s.quantity_used,
                            p.label, p.package_type, p.strain, p.license_number, p.quantity AS current_quantity
                     FROM extraction_run_sources s
                     JOIN packages p ON p.id = s.package_id
                     WHERE s.run_id = $1`,
                    [id]
                );

                // 5b. Load product type catalog to distinguish cannabis vs non-cannabis sources
                //     (license inheritance comes from the first cannabis source only).
                const { rows: productTypes } = await client.query(
                    `SELECT name, is_cannabis, default_unit
                     FROM product_types
                     WHERE company_id = $1`,
                    [context.companyId]
                );
                const typeMap = new Map<string, { isCannabis: boolean; defaultUnit: string }>();
                for (const pt of productTypes) {
                    typeMap.set(pt.name, {
                        isCannabis: pt.is_cannabis,
                        defaultUnit: pt.default_unit,
                    });
                }

                // 5c. Decrement each source package by quantity_used (or by remaining if null).
                for (const src of sources) {
                    const currentQty = parseFloat(src.current_quantity);
                    const toConsume = src.quantity_used != null
                        ? parseFloat(src.quantity_used)
                        : currentQty; // consume remaining if caller didn't specify

                    if (toConsume <= 0) continue;
                    if (currentQty < toConsume) {
                        await client.query('ROLLBACK');
                        return {
                            statusCode: 400,
                            body: JSON.stringify({
                                error: `Insufficient quantity on source package "${src.label}": ${currentQty} available, ${toConsume} requested`,
                            }),
                        };
                    }

                    const remaining = currentQty - toConsume;
                    await client.query(
                        `UPDATE packages
                         SET quantity = quantity - $1,
                             status = CASE WHEN quantity - $1 <= 0 THEN 'finished' ELSE status END,
                             updated_at = NOW()
                         WHERE id = $2`,
                        [toConsume, src.package_id]
                    );
                }

                // 5d. Determine license inheritance — first cannabis source wins.
                //     Non-cannabis sources (botanical terpenes, butane) don't provide the license.
                const inheritedLicense = (() => {
                    for (const src of sources) {
                        const pt = typeMap.get(src.package_type);
                        const isCannabis = pt?.isCannabis ?? true; // default to true if catalog missing
                        if (isCannabis && src.license_number) {
                            return src.license_number as string;
                        }
                    }
                    return null;
                })();

                // 5e. Determine strain to use for output packages — run.strain, fallback to first cannabis source strain
                const inheritedStrain = (r.strain as string | null)
                    || sources.find(s => (typeMap.get(s.package_type)?.isCannabis ?? true) && s.strain)?.strain
                    || 'Unknown';

                // 5f. Derive outputs — if the caller provided an outputs[] array, use it.
                //     Otherwise fall back to deriving a single output from target_product (kanban drag path).
                const effectiveOutputs: FinalizeOutput[] = outputs.length > 0
                    ? outputs
                    : (r.target_product
                        ? [{ packageType: r.target_product, quantity: 0 } as FinalizeOutput]
                        : []);

                // 5g. Create output packages and link them to the run via extraction_run_outputs.
                //     Also write an extraction_logs row per output for METRC export.
                let seq = 0;
                for (const out of effectiveOutputs) {
                    const pt = typeMap.get(out.packageType);
                    const unit = out.unit
                        || pt?.defaultUnit
                        || 'g';
                    const qty = typeof out.quantity === 'number' && out.quantity > 0
                        ? out.quantity
                        : 0;
                    if (qty <= 0) {
                        // Skip outputs with no quantity — they're placeholders from the fallback path
                        // (e.g. kanban drag with no final weight yet). The run completes but no
                        // inventory is created. User can amend later via record-extraction.
                        seq++;
                        continue;
                    }

                    const outStrain = out.strain || inheritedStrain;
                    const outLicense = out.licenseNumber || inheritedLicense;
                    const outLabel = out.label
                        || `${outStrain} - ${out.packageType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} - ${new Date().toISOString().slice(0, 10)}`;

                    // First cannabis source package id for lineage (used by packages.source_package_id)
                    const firstCannabisSource = sources.find(s =>
                        (typeMap.get(s.package_type)?.isCannabis ?? true)
                    );

                    const { rows: [pkgRow] } = await client.query(
                        `INSERT INTO packages (
                            company_id, created_by, source_package_id, input_quantity,
                            label, package_type, strain, license_number,
                            quantity, unit, notes
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        RETURNING id, label, package_type, quantity, unit`,
                        [
                            context.companyId,
                            context.userId,
                            firstCannabisSource?.package_id || null,
                            firstCannabisSource?.quantity_used ? parseFloat(firstCannabisSource.quantity_used) : null,
                            outLabel,
                            out.packageType,
                            outStrain,
                            outLicense,
                            qty,
                            unit,
                            out.notes || null,
                        ]
                    );

                    await client.query(
                        `INSERT INTO extraction_run_outputs (run_id, package_id, sequence)
                         VALUES ($1, $2, $3)`,
                        [id, pkgRow.id, seq]
                    );

                    // Compliance log row — one per output.
                    const inputPkgType = firstCannabisSource?.package_type || null;
                    const inputQty = firstCannabisSource?.quantity_used
                        ? parseFloat(firstCannabisSource.quantity_used)
                        : null;
                    const yieldPct = (inputQty && inputQty > 0)
                        ? parseFloat(((qty / inputQty) * 100).toFixed(2))
                        : null;

                    await client.query(
                        `INSERT INTO extraction_logs (
                            company_id, created_by,
                            source_package_id, input_package_type, input_quantity,
                            output_package_id, output_package_type, output_quantity,
                            strain, license_number, extraction_type,
                            yield_percentage, waste_weight, notes
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                        [
                            context.companyId,
                            context.userId,
                            firstCannabisSource?.package_id || null,
                            inputPkgType,
                            inputQty,
                            pkgRow.id,
                            out.packageType,
                            qty,
                            outStrain,
                            outLicense,
                            'run_completion',
                            yieldPct,
                            0,
                            out.notes || null,
                        ]
                    );

                    createdOutputs.push({
                        packageId: pkgRow.id,
                        packageType: pkgRow.package_type,
                        quantity: parseFloat(pkgRow.quantity),
                        unit: pkgRow.unit,
                        label: pkgRow.label,
                        sequence: seq,
                    });
                    seq++;
                }

                // 5h. Set the idempotency gate — prevents re-running the hook on retries.
                await client.query(
                    `UPDATE extraction_runs SET sources_consumed_at = NOW() WHERE id = $1`,
                    [id]
                );
            }

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: r.id,
                    status: r.status,
                    name: r.name,
                    strain: r.strain,
                    notes: r.notes,
                    startedAt: r.started_at,
                    completedAt: r.completed_at,
                    sourcesConsumedAt: r.sources_consumed_at,
                    updatedAt: r.updated_at,
                    outputs: createdOutputs,
                }),
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating extraction run:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update extraction run' }) };
    }
};
