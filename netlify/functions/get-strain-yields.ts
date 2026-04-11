import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * GET /get-strain-yields
 *   ?strain=<name>   — filter to one strain
 *   ?templateId=<id> — filter to one SOP
 *
 * Returns every strain_yield_override row scoped to the company, joined
 * with its template name for display. Used by the strain yields UI and
 * read at plan time to drive the override → historical → template lookup.
 */

interface Row {
    id: string;
    company_id: string;
    strain: string;
    template_id: string;
    template_name: string;
    input_type: string;
    output_type: string;
    yield_pct: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

const shape = (r: Row) => ({
    id: r.id,
    companyId: r.company_id,
    strain: r.strain,
    templateId: r.template_id,
    templateName: r.template_name,
    inputType: r.input_type,
    outputType: r.output_type,
    yieldPct: parseFloat(r.yield_pct),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
});

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        const strain = event.queryStringParameters?.strain;
        const templateId = event.queryStringParameters?.templateId;

        let result;
        if (strain && templateId) {
            result = await sql`
                SELECT o.*, t.name AS template_name
                FROM strain_yield_overrides o
                JOIN process_templates t ON t.id = o.template_id
                WHERE o.company_id = ${context.companyId}
                  AND o.strain = ${strain}
                  AND o.template_id = ${templateId}
                ORDER BY o.input_type, o.output_type
            `;
        } else if (strain) {
            result = await sql`
                SELECT o.*, t.name AS template_name
                FROM strain_yield_overrides o
                JOIN process_templates t ON t.id = o.template_id
                WHERE o.company_id = ${context.companyId}
                  AND o.strain = ${strain}
                ORDER BY t.name, o.input_type, o.output_type
            `;
        } else if (templateId) {
            result = await sql`
                SELECT o.*, t.name AS template_name
                FROM strain_yield_overrides o
                JOIN process_templates t ON t.id = o.template_id
                WHERE o.company_id = ${context.companyId}
                  AND o.template_id = ${templateId}
                ORDER BY o.strain, o.input_type, o.output_type
            `;
        } else {
            result = await sql`
                SELECT o.*, t.name AS template_name
                FROM strain_yield_overrides o
                JOIN process_templates t ON t.id = o.template_id
                WHERE o.company_id = ${context.companyId}
                ORDER BY o.strain, t.name, o.input_type, o.output_type
            `;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows.map(r => shape(r as Row))),
        };
    } catch (error) {
        console.error('Error fetching strain yields:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch strain yields' }) };
    }
};
