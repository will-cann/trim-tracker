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

        const { harvestId, plantNumber, weight } = JSON.parse(event.body || '{}');

        if (!harvestId || !weight || weight <= 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'harvestId and a positive weight are required' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify ownership
            const { rows: [harvest] } = await client.query(
                `SELECT id, company_id, status FROM harvests WHERE id = $1 AND company_id = $2`,
                [harvestId, context.companyId]
            );

            if (!harvest) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
            }

            // Auto-assign plant number if not provided
            let assignedNumber = plantNumber;
            if (!assignedNumber) {
                const { rows: [max] } = await client.query(
                    `SELECT COALESCE(MAX(plant_number), 0) + 1 AS next FROM harvest_plant_weights WHERE harvest_id = $1`,
                    [harvestId]
                );
                assignedNumber = max.next;
            }

            // Insert plant weight
            const { rows: [entry] } = await client.query(`
                INSERT INTO harvest_plant_weights (harvest_id, plant_number, weight)
                VALUES ($1, $2, $3)
                ON CONFLICT (harvest_id, plant_number) DO UPDATE SET weight = $3
                RETURNING *
            `, [harvestId, assignedNumber, weight]);

            // Recalculate harvest totals from plant weights
            const { rows: [totals] } = await client.query(`
                SELECT COALESCE(SUM(weight), 0) AS total_weight, COUNT(*) AS plant_count
                FROM harvest_plant_weights WHERE harvest_id = $1
            `, [harvestId]);

            await client.query(
                `UPDATE harvests SET total_wet_weight = $1, plant_count = $2 WHERE id = $3`,
                [totals.total_weight, totals.plant_count, harvestId]
            );

            // Transition from planning to active on first weight entry
            if (harvest.status === 'planning') {
                await client.query(
                    `UPDATE harvests SET status = 'active' WHERE id = $1`,
                    [harvestId]
                );
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: entry.id,
                    harvestId: entry.harvest_id,
                    plantNumber: entry.plant_number,
                    weight: parseFloat(entry.weight) || 0,
                    createdAt: entry.created_at,
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
        console.error('Error recording plant weight:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to record plant weight' }),
        };
    }
};
