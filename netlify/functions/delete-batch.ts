import { Handler } from '@netlify/functions';
import { pool } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const id = event.queryStringParameters?.id;

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'ID is required' }),
        };
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get session_id before deletion to update totals
            const entryResult = await client.query('SELECT session_id FROM trim_entries WHERE id = $1', [id]);
            const entry = entryResult.rows[0];

            if (entry) {
                await client.query('DELETE FROM trim_entries WHERE id = $1', [id]);

                // Update session totals
                const sessionTotalsResult = await client.query(`
          SELECT 
            COALESCE(SUM(flower_weight), 0) as flower_weight,
            COALESCE(SUM(shake_weight), 0) as shake_weight,
            COALESCE(SUM(trim_weight), 0) as trim_weight,
            COALESCE(SUM(waste_weight), 0) as waste_weight
          FROM trim_entries
          WHERE session_id = $1
        `, [entry.session_id]);

                const newSessionTotals = sessionTotalsResult.rows[0];

                await client.query(`
          UPDATE trim_sessions
          SET 
            total_flower = $1,
            total_shake = $2,
            total_trim = $3,
            total_waste = $4
          WHERE id = $5
        `, [newSessionTotals.flower_weight, newSessionTotals.shake_weight, newSessionTotals.trim_weight, newSessionTotals.waste_weight, entry.session_id]);
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return {
            statusCode: 204,
            body: '',
        };
    } catch (error) {
        console.error('Error deleting batch:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete batch' }),
        };
    }
};
