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

        const { harvestId, wasteType, weight } = JSON.parse(event.body || '{}');

        if (!harvestId || !wasteType || !weight || weight <= 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'harvestId, wasteType, and a positive weight are required' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify ownership
            const { rows: [harvest] } = await client.query(
                `SELECT id, company_id FROM harvests WHERE id = $1 AND company_id = $2`,
                [harvestId, context.companyId]
            );

            if (!harvest) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
            }

            // Insert waste entry
            const { rows: [wasteEntry] } = await client.query(`
                INSERT INTO harvest_waste (harvest_id, waste_type, weight, recorded_by)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [harvestId, wasteType, weight, context.userId]);

            // Recalculate total waste weight
            const { rows: [totals] } = await client.query(
                `SELECT COALESCE(SUM(weight), 0) as total FROM harvest_waste WHERE harvest_id = $1`,
                [harvestId]
            );

            await client.query(
                `UPDATE harvests SET total_waste_weight = $1 WHERE id = $2`,
                [totals.total, harvestId]
            );

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: wasteEntry.id,
                    harvestId: wasteEntry.harvest_id,
                    wasteType: wasteEntry.waste_type,
                    weight: parseFloat(wasteEntry.weight) || 0,
                    recordedBy: wasteEntry.recorded_by,
                    createdAt: wasteEntry.created_at,
                    totalWasteWeight: parseFloat(totals.total) || 0,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error recording harvest waste:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to record waste' }),
        };
    }
};
