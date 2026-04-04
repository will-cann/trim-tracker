import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
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

        const { id, name, description, processType, domain, phaseDurations, steps } = JSON.parse(event.body || '{}');

        if (!name || !processType || !steps?.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name, processType, and steps are required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let templateId: string;

            if (id) {
                // Update existing template
                const { rows } = await client.query(
                    `UPDATE process_templates
                     SET name = $1, description = $2, process_type = $3,
                         domain = $4, phase_durations = $5, updated_at = NOW()
                     WHERE id = $6 AND company_id = $7
                     RETURNING id`,
                    [name, description || null, processType, domain || 'extraction', phaseDurations ? JSON.stringify(phaseDurations) : null, id, context.companyId]
                );
                if (rows.length === 0) {
                    await client.query('ROLLBACK');
                    return { statusCode: 404, body: JSON.stringify({ error: 'Template not found' }) };
                }
                templateId = rows[0].id;

                // Delete existing steps and re-insert
                await client.query('DELETE FROM process_steps WHERE template_id = $1', [templateId]);
            } else {
                // Create new template
                const { rows } = await client.query(
                    `INSERT INTO process_templates (company_id, name, description, process_type, domain, phase_durations)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [context.companyId, name, description || null, processType, domain || 'extraction', phaseDurations ? JSON.stringify(phaseDurations) : null]
                );
                templateId = rows[0].id;
            }

            // Insert steps
            for (const step of steps) {
                await client.query(
                    `INSERT INTO process_steps (
                        template_id, step_order, name, description,
                        input_type, output_type, equipment_type,
                        expected_yield_pct, est_duration_hours, est_hands_on_hours, is_optional,
                        track, phase, phase_week, phase_day,
                        is_span, span_end_week, env_targets,
                        task_category, on_complete_action, requires_supplies,
                        is_critical, recurrence
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                              $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
                    [
                        templateId,
                        step.stepOrder,
                        step.name,
                        step.description || null,
                        step.inputType || null,
                        step.outputType || null,
                        step.equipmentType || null,
                        step.expectedYieldPct || null,
                        step.estDurationHours || null,
                        step.estHandsOnHours || null,
                        step.isOptional || false,
                        // Cultivation fields
                        step.track || null,
                        step.phase || null,
                        step.phaseWeek || null,
                        step.phaseDay || null,
                        step.isSpan || false,
                        step.spanEndWeek || null,
                        step.envTargets ? JSON.stringify(step.envTargets) : null,
                        step.taskCategory || null,
                        step.onCompleteAction ? JSON.stringify(step.onCompleteAction) : null,
                        step.requiresSupplies || null,
                        step.isCritical || false,
                        step.recurrence ? JSON.stringify(step.recurrence) : null,
                    ]
                );
            }

            await client.query('COMMIT');

            return {
                statusCode: id ? 200 : 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: templateId, success: true }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error saving process template:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save process template' }) };
    }
};
