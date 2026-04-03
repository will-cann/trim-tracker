import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { templateId, name, strain, notes, inputMaterial, targetProduct, sourcePackageIds, sourcePackageQuantities, plannedStart, stepEquipment } = JSON.parse(event.body || '{}');
        if (!templateId || !name) {
            return { statusCode: 400, body: JSON.stringify({ error: 'templateId and name are required' }) };
        }

        // Get template steps to copy into the run
        const stepsResult = await sql`
            SELECT * FROM process_steps
            WHERE template_id = ${templateId}
            ORDER BY step_order ASC
        `;

        // Auto-derive input material from template's first step if not explicitly provided
        const derivedInputMaterial = inputMaterial
            || (stepsResult.rows.length > 0 ? stepsResult.rows[0].input_type : null);

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Create the run
            const runResult = await client.query(
                `INSERT INTO extraction_runs (company_id, template_id, name, strain, input_material, target_product, status, planned_start, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7, $8)
                 RETURNING *`,
                [context.companyId, templateId, name.trim(), strain?.trim() || null, derivedInputMaterial, targetProduct || null, plannedStart || null, notes?.trim() || null]
            );
            const run = runResult.rows[0];

            // Link source packages with optional quantity_used
            const qtyMap: Record<string, number> = sourcePackageQuantities || {};
            if (sourcePackageIds && Array.isArray(sourcePackageIds)) {
                for (const pkgId of sourcePackageIds) {
                    const qtyUsed = qtyMap[pkgId] ?? null;
                    await client.query(
                        `INSERT INTO extraction_run_sources (run_id, package_id, quantity_used) VALUES ($1, $2, $3)`,
                        [run.id, pkgId, qtyUsed]
                    );
                }
                // Also set source_package_id to the first one for backwards compat
                if (sourcePackageIds.length > 0) {
                    await client.query(
                        `UPDATE extraction_runs SET source_package_id = $1 WHERE id = $2`,
                        [sourcePackageIds[0], run.id]
                    );
                }
            }

            // stepEquipment is a map of stepOrder -> equipmentId from the user's confirmation
            const equipMap: Record<number, string> = stepEquipment || {};

            // Create run steps from template
            const steps = [];
            for (const ts of stepsResult.rows) {
                const equipId = equipMap[ts.step_order] || null;
                const stepResult = await client.query(
                    `INSERT INTO extraction_run_steps (run_id, template_step_id, step_order, name, status, is_optional, equipment_id, description)
                     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
                     RETURNING *`,
                    [run.id, ts.id, ts.step_order, ts.name, ts.is_optional, equipId, ts.description || null]
                );
                steps.push(stepResult.rows[0]);
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: run.id,
                    companyId: run.company_id,
                    templateId: run.template_id,
                    name: run.name,
                    strain: run.strain,
                    inputMaterial: run.input_material,
                    status: run.status,
                    plannedStart: run.planned_start,
                    notes: run.notes,
                    steps: steps.map(s => ({
                        id: s.id,
                        runId: s.run_id,
                        templateStepId: s.template_step_id,
                        stepOrder: s.step_order,
                        name: s.name,
                        status: s.status,
                        inputWeightG: null,
                        outputWeightG: null,
                        yieldPct: null,
                        equipmentId: null,
                        isOptional: s.is_optional,
                        startedAt: null,
                        completedAt: null,
                        notes: null,
                    })),
                    createdAt: run.created_at,
                    updatedAt: run.updated_at,
                }),
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating extraction run:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create extraction run' }) };
    }
};
