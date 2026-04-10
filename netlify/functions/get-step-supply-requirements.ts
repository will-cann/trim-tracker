import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * GET /get-step-supply-requirements?templateId=...
 *
 * Returns supply requirements for all steps in a given process template.
 * Each requirement links a process step to a supply item with a quantity_per.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const templateId = event.queryStringParameters?.templateId;
        if (!templateId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'templateId is required' }) };
        }

        // Verify the template belongs to this company
        const tmpl = await sql`
            SELECT id FROM process_templates
            WHERE id = ${templateId} AND company_id = ${context.companyId}
        `;
        if (tmpl.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Template not found' }) };
        }

        const result = await sql`
            SELECT
                ssr.id,
                ssr.step_id,
                ssr.supply_item_id,
                ssr.quantity_per,
                ps.step_order,
                ps.name AS step_name,
                si.name AS supply_name,
                si.unit AS supply_unit,
                si.quantity_on_hand,
                si.par_level
            FROM step_supply_requirements ssr
            JOIN process_steps ps ON ps.id = ssr.step_id
            JOIN supply_items si ON si.id = ssr.supply_item_id
            WHERE ps.template_id = ${templateId}
            ORDER BY ps.step_order ASC, si.name ASC
        `;

        const requirements = result.rows.map((row: any) => ({
            id: row.id,
            stepId: row.step_id,
            supplyItemId: row.supply_item_id,
            quantityPer: parseFloat(row.quantity_per),
            stepOrder: row.step_order,
            stepName: row.step_name,
            supplyName: row.supply_name,
            supplyUnit: row.supply_unit,
            quantityOnHand: parseFloat(row.quantity_on_hand),
            parLevel: row.par_level != null ? parseFloat(row.par_level) : null,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requirements),
        };
    } catch (error) {
        console.error('Error fetching step supply requirements:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch step supply requirements' }) };
    }
};
