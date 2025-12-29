import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
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

        const { entryId, type, value } = JSON.parse(event.body || '{}');

        if (!entryId || !type) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID and Type are required' }),
            };
        }

        const column = `${type}_weight`;
        if (!['flower', 'shake', 'trim', 'waste'].includes(type)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid weight type' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify ownership
            const ownershipResult = await client.query(`
              SELECT company_id FROM trim_sessions 
              WHERE id = (SELECT session_id FROM trim_entries WHERE id = $1)
            `, [entryId]);

            if (ownershipResult.rows.length === 0 || ownershipResult.rows[0].company_id !== context.companyId) {
                throw new Error('Forbidden: You do not have access to this resource');
            }

            await client.query(`
        UPDATE trim_entries
        SET ${column} = $1
        WHERE id = $2
      `, [value, entryId]);

            // Update session totals too
            const entryResult = await client.query('SELECT session_id FROM trim_entries WHERE id = $1', [entryId]);
            const entry = entryResult.rows[0];

            if (entry) {
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
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error updating entry weight:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update entry weight' }),
        };
    }
};
