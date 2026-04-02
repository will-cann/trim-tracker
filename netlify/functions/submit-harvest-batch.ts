import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { captureError } from './utils/sentry';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'lead');
        if (denied) return denied;

        const { harvestId } = JSON.parse(event.body || '{}');

        if (!harvestId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'harvestId is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows: [harvest] } = await client.query(
                `SELECT id, company_id, status, total_wet_weight FROM harvests WHERE id = $1 AND company_id = $2`,
                [harvestId, context.companyId]
            );

            if (!harvest) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
            }

            if (harvest.status !== 'planning' && harvest.status !== 'active') {
                await client.query('ROLLBACK');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: `Cannot submit harvest in '${harvest.status}' status` }),
                };
            }

            if (parseFloat(harvest.total_wet_weight) <= 0) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Harvest must have wet weight recorded before submission' }),
                };
            }

            const { rows: [updated] } = await client.query(`
                UPDATE harvests SET status = 'submitted', submitted_at = NOW()
                WHERE id = $1
                RETURNING *
            `, [harvestId]);

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: updated.id,
                    batchId: updated.batch_id,
                    status: updated.status,
                    submittedAt: updated.submitted_at,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error submitting harvest batch:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to submit harvest batch' }),
        };
    }
};
