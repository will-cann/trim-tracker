import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);

        if (!context) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const id = event.queryStringParameters?.id;

        if (!id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID is required' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get session_id before deletion to update totals and verify ownership
            const entryResult = await client.query(`
                SELECT ts.company_id, te.session_id 
                FROM trim_entries te
                JOIN trim_sessions ts ON ts.id = te.session_id
                WHERE te.id = $1
            `, [id]);

            const entryRecord = entryResult.rows[0];

            if (entryRecord) {
                if (entryRecord.company_id !== context.companyId) {
                    throw new Error('Forbidden: You do not have access to this resource');
                }

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
                `, [entryRecord.session_id]);

                const newSessionTotals = sessionTotalsResult.rows[0];

                await client.query(`
                    UPDATE trim_sessions
                    SET 
                        total_flower = $1,
                        total_shake = $2,
                        total_trim = $3,
                        total_waste = $4
                    WHERE id = $5
                `, [newSessionTotals.flower_weight, newSessionTotals.shake_weight, newSessionTotals.trim_weight, newSessionTotals.waste_weight, entryRecord.session_id]);
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
            body: JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to delete batch' }),
        };
    }
};
