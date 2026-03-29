import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const harvestId = event.queryStringParameters?.harvestId;
        if (!harvestId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'harvestId is required' }) };
        }

        // Verify ownership via join
        const { rows } = await pool.query(`
            SELECT pw.id, pw.harvest_id, pw.plant_number, pw.weight, pw.created_at
            FROM harvest_plant_weights pw
            JOIN harvests h ON h.id = pw.harvest_id
            WHERE pw.harvest_id = $1 AND h.company_id = $2
            ORDER BY pw.plant_number ASC
        `, [harvestId, context.companyId]);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows.map(r => ({
                id: r.id,
                harvestId: r.harvest_id,
                plantNumber: r.plant_number,
                weight: parseFloat(r.weight) || 0,
                createdAt: r.created_at,
            }))),
        };
    } catch (error) {
        console.error('Error getting plant weights:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to get plant weights' }),
        };
    }
};
