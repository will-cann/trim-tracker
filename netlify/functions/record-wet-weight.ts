import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
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

        const { harvestId, weight } = JSON.parse(event.body || '{}');

        if (!harvestId || weight === undefined || weight <= 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'harvestId and a positive weight are required' }),
            };
        }

        const { rows } = await sql`
            UPDATE harvests
            SET total_wet_weight = ${weight},
                status = CASE WHEN status = 'planning' THEN 'active' ELSE status END
            WHERE id = ${harvestId} AND company_id = ${context.companyId}
            RETURNING *
        `;

        if (rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, totalWetWeight: parseFloat(rows[0].total_wet_weight), status: rows[0].status }),
        };
    } catch (error) {
        console.error('Error recording wet weight:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to record wet weight' }),
        };
    }
};
