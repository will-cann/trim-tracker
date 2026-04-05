import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

const VALID_ACTIONS = ['burp', 'aerate', 'inspect', 'note'];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { binId, action, notes, moistureReading, nextActionAt } = JSON.parse(event.body || '{}');

        if (!binId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'binId is required' }) };
        }
        if (!action || !VALID_ACTIONS.includes(action)) {
            return { statusCode: 400, body: JSON.stringify({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify bin ownership
            const { rows: [bin] } = await client.query(
                `SELECT id, status FROM harvest_bins WHERE id = $1 AND company_id = $2`,
                [binId, context.companyId]
            );

            if (!bin) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Bin not found' }) };
            }

            if (bin.status !== 'curing') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Can only log cure actions for bins in curing status' }) };
            }

            const { rows: [log] } = await client.query(`
                INSERT INTO bin_cure_logs (bin_id, action, notes, moisture_reading, recorded_by, next_action_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [binId, action, notes || null, moistureReading || null, context.userId, nextActionAt || null]);

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: log.id,
                    binId: log.bin_id,
                    action: log.action,
                    notes: log.notes,
                    moistureReading: log.moisture_reading ? parseFloat(log.moisture_reading) : null,
                    recordedBy: log.recorded_by,
                    nextActionAt: log.next_action_at,
                    createdAt: log.created_at,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error logging bin cure:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to log cure action' }),
        };
    }
};
