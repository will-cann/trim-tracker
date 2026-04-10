import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id, status, inputWeightG, outputWeightG, equipmentId, notes, description, checkInValue, checkInUnit, timestampCapturedAt } = JSON.parse(event.body || '{}');
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        // Verify the step belongs to a run owned by this company
        const verify = await sql`
            SELECT s.id FROM extraction_run_steps s
            JOIN extraction_runs r ON r.id = s.run_id
            WHERE s.id = ${id} AND r.company_id = ${context.companyId}
        `;
        if (verify.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Step not found' }) };
        }

        // Build dynamic SET clause
        const sets: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (status !== undefined) {
            sets.push(`status = $${idx++}`);
            values.push(status);
            if (status === 'active') {
                sets.push(`started_at = COALESCE(started_at, NOW())`);
            } else if (status === 'completed' || status === 'skipped') {
                sets.push(`completed_at = NOW()`);
            }
        }
        if (inputWeightG !== undefined) {
            sets.push(`input_weight_g = $${idx++}`);
            values.push(inputWeightG);
        }
        if (outputWeightG !== undefined) {
            sets.push(`output_weight_g = $${idx++}`);
            values.push(outputWeightG);
        }
        if (equipmentId !== undefined) {
            sets.push(`equipment_id = $${idx++}`);
            values.push(equipmentId || null);
        }
        if (notes !== undefined) {
            sets.push(`notes = $${idx++}`);
            values.push(notes?.trim() || null);
        }
        if (description !== undefined) {
            sets.push(`description = $${idx++}`);
            values.push(description?.trim() || null);
        }
        // New check-in fields from migration 047 (schedule-driven run model)
        if (checkInValue !== undefined) {
            sets.push(`check_in_value = $${idx++}`);
            values.push(checkInValue);
        }
        if (checkInUnit !== undefined) {
            sets.push(`check_in_unit = $${idx++}`);
            values.push(checkInUnit || null);
        }
        if (timestampCapturedAt !== undefined) {
            sets.push(`timestamp_captured_at = $${idx++}`);
            values.push(timestampCapturedAt || null);
        }

        // Auto-calculate yield if both weights present
        if (inputWeightG !== undefined || outputWeightG !== undefined) {
            sets.push(`yield_pct = CASE
                WHEN input_weight_g > 0 AND output_weight_g IS NOT NULL
                THEN ROUND((output_weight_g / input_weight_g) * 100, 2)
                ELSE NULL
            END`);
        }

        if (sets.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No fields to update' }) };
        }

        values.push(id);

        const client = await pool.connect();
        try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE extraction_run_steps SET ${sets.join(', ')}
             WHERE id = $${idx}
             RETURNING *`,
            values
        );

        const s = result.rows[0];

        // ── Supply consumption hook ─────────────────────────────────────
        // When a step transitions to 'completed' and has a template_step_id,
        // look up step_supply_requirements and decrement supply inventory.
        const justCompleted = status === 'completed' && s.template_step_id;
        if (justCompleted) {
            const reqResult = await client.query(
                `SELECT ssr.supply_item_id, ssr.quantity_per,
                        si.quantity_on_hand, si.name AS supply_name
                 FROM step_supply_requirements ssr
                 JOIN supply_items si ON si.id = ssr.supply_item_id
                 WHERE ssr.step_id = $1`,
                [s.template_step_id]
            );

            for (const req of reqResult.rows) {
                const delta = -parseFloat(req.quantity_per);
                const newQty = parseFloat(req.quantity_on_hand) + delta;

                await client.query(
                    `UPDATE supply_items
                     SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
                     WHERE id = $2`,
                    [delta, req.supply_item_id]
                );

                await client.query(
                    `INSERT INTO supply_ledger
                        (company_id, supply_item_id, change_type, quantity_delta,
                         quantity_after, reference_type, reference_id, performed_by, notes)
                     VALUES ($1, $2, 'consume', $3, $4, 'extraction_run_step', $5, $6, $7)`,
                    [
                        context.companyId,
                        req.supply_item_id,
                        delta,
                        Math.max(newQty, 0),
                        s.id,
                        context.userId,
                        `Auto-consumed by step "${s.name}" completion`,
                    ]
                );
            }
        }

        await client.query('COMMIT');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: s.id,
                runId: s.run_id,
                templateStepId: s.template_step_id,
                stepOrder: s.step_order,
                name: s.name,
                status: s.status,
                inputWeightG: s.input_weight_g ? parseFloat(s.input_weight_g) : null,
                outputWeightG: s.output_weight_g ? parseFloat(s.output_weight_g) : null,
                yieldPct: s.yield_pct ? parseFloat(s.yield_pct) : null,
                equipmentId: s.equipment_id,
                isOptional: s.is_optional,
                startedAt: s.started_at,
                completedAt: s.completed_at,
                notes: s.notes,
                description: s.description || null,
                checkInValue: s.check_in_value != null ? parseFloat(s.check_in_value) : null,
                checkInUnit: s.check_in_unit || null,
                timestampCapturedAt: s.timestamp_captured_at || null,
            }),
        };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating run step:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update run step' }) };
    }
};
