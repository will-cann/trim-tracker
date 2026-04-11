import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * POST /save-strain-yield
 *
 * Upserts a strain_yield_override keyed on (company, strain, template,
 * input_type, output_type). If an id is provided, update that specific
 * row; otherwise insert-or-update on the unique constraint.
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

        const { id, strain, templateId, inputType, outputType, yieldPct, notes } = JSON.parse(event.body || '{}');
        if (!strain || !templateId || !inputType || !outputType || yieldPct == null) {
            return { statusCode: 400, body: JSON.stringify({ error: 'strain, templateId, inputType, outputType, yieldPct required' }) };
        }
        const pct = Number(yieldPct);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
            return { statusCode: 400, body: JSON.stringify({ error: 'yieldPct must be between 0 and 100' }) };
        }

        let row;
        if (id) {
            const result = await sql`
                UPDATE strain_yield_overrides
                SET yield_pct = ${pct}, notes = ${notes?.trim() || null}, updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING *
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
            }
            row = result.rows[0];
        } else {
            const result = await sql`
                INSERT INTO strain_yield_overrides
                    (company_id, strain, template_id, input_type, output_type, yield_pct, notes, created_by)
                VALUES
                    (${context.companyId}, ${strain}, ${templateId}, ${inputType}, ${outputType}, ${pct}, ${notes?.trim() || null}, ${context.userId})
                ON CONFLICT (company_id, strain, template_id, input_type, output_type)
                DO UPDATE SET yield_pct = EXCLUDED.yield_pct, notes = EXCLUDED.notes, updated_at = NOW()
                RETURNING *
            `;
            row = result.rows[0];
        }

        return {
            statusCode: id ? 200 : 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: row.id,
                companyId: row.company_id,
                strain: row.strain,
                templateId: row.template_id,
                inputType: row.input_type,
                outputType: row.output_type,
                yieldPct: parseFloat(row.yield_pct),
                notes: row.notes,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }),
        };
    } catch (error) {
        console.error('Error saving strain yield:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save strain yield' }) };
    }
};
