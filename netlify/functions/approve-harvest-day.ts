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

        const { harvestIds } = JSON.parse(event.body || '{}');

        if (!Array.isArray(harvestIds) || harvestIds.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'harvestIds array is required' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const approved: any[] = [];

            for (const harvestId of harvestIds) {
                // Verify ownership and status
                const { rows: [harvest] } = await client.query(`
                    SELECT h.id, h.status, h.batch_id, h.strain,
                        EXISTS(
                            SELECT 1 FROM harvest_allocations
                            WHERE harvest_id = h.id AND allocation_type = 'flower'
                        ) AS has_flower
                    FROM harvests h
                    WHERE h.id = $1 AND h.company_id = $2
                `, [harvestId, context.companyId]);

                if (!harvest) continue;

                if (harvest.status !== 'submitted') {
                    await client.query('ROLLBACK');
                    return {
                        statusCode: 400,
                        body: JSON.stringify({
                            error: `Harvest "${harvest.batch_id}" is not in submitted status`,
                        }),
                    };
                }

                // Flower allocation → drying; frozen-only → completed
                const nextStatus = harvest.has_flower ? 'drying' : 'completed';
                const endDate = harvest.has_flower ? null : 'NOW()';

                const { rows: [updated] } = await client.query(`
                    UPDATE harvests
                    SET status = $1,
                        approved_at = NOW(),
                        approved_by = $2
                        ${endDate ? ', harvest_end_date = NOW()' : ''}
                    WHERE id = $3
                    RETURNING id, batch_id, strain, status, approved_at
                `, [nextStatus, context.userId, harvestId]);

                approved.push({
                    id: updated.id,
                    batchId: updated.batch_id,
                    strain: updated.strain,
                    status: updated.status,
                    approvedAt: updated.approved_at,
                });
            }

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error approving harvest day:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to approve harvests' }),
        };
    }
};
