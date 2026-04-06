import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'director');
        if (denied) return denied;

        const id = event.queryStringParameters?.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get the plant weight and verify ownership
            const { rows: [entry] } = await client.query(`
                SELECT pw.*, h.company_id
                FROM harvest_plant_weights pw
                JOIN harvests h ON h.id = pw.harvest_id
                WHERE pw.id = $1 AND h.company_id = $2
            `, [id, context.companyId]);

            if (!entry) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Plant weight not found' }) };
            }

            await client.query(`DELETE FROM harvest_plant_weights WHERE id = $1`, [id]);

            // Recalculate harvest totals
            const { rows: [totals] } = await client.query(`
                SELECT COALESCE(SUM(weight), 0) AS total_weight, COUNT(*) AS plant_count
                FROM harvest_plant_weights WHERE harvest_id = $1
            `, [entry.harvest_id]);

            await client.query(
                `UPDATE harvests SET total_wet_weight = $1, plant_count = $2 WHERE id = $3`,
                [totals.total_weight, totals.plant_count, entry.harvest_id]
            );

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    totalWetWeight: parseFloat(totals.total_weight) || 0,
                    plantCount: parseInt(totals.plant_count) || 0,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error deleting plant weight:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete plant weight' }),
        };
    }
};
