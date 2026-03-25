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

        const { harvestId, allocations } = JSON.parse(event.body || '{}');
        // allocations: Array<{ type: 'flower' | 'frozen', targetWeight: number }>

        if (!harvestId || !allocations || !allocations.length) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'harvestId and allocations array are required' }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify harvest ownership and get current state
            const { rows: [harvest] } = await client.query(
                `SELECT * FROM harvests WHERE id = $1 AND company_id = $2`,
                [harvestId, context.companyId]
            );

            if (!harvest) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
            }

            const totalAllocated = allocations.reduce((sum: number, a: any) => sum + a.targetWeight, 0);
            const available = parseFloat(harvest.total_wet_weight) - parseFloat(harvest.total_waste_weight);

            if (totalAllocated > available) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: `Total allocation (${totalAllocated}g) exceeds available weight (${available}g)`,
                    }),
                };
            }

            // Delete existing allocations (re-allocating replaces previous)
            await client.query(
                `DELETE FROM harvest_allocations WHERE harvest_id = $1`,
                [harvestId]
            );

            // Insert new allocations
            const insertedAllocations = [];
            for (const alloc of allocations) {
                const { rows: [inserted] } = await client.query(`
                    INSERT INTO harvest_allocations (harvest_id, allocation_type, target_weight)
                    VALUES ($1, $2, $3)
                    RETURNING *
                `, [harvestId, alloc.type, alloc.targetWeight]);
                insertedAllocations.push(inserted);
            }

            // Update harvest status if it has flower allocation
            const hasFlower = allocations.some((a: any) => a.type === 'flower');
            if (hasFlower && harvest.status === 'active') {
                await client.query(
                    `UPDATE harvests SET status = 'drying' WHERE id = $1`,
                    [harvestId]
                );
            }

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    allocations: insertedAllocations.map(a => ({
                        id: a.id,
                        harvestId: a.harvest_id,
                        allocationType: a.allocation_type,
                        targetWeight: parseFloat(a.target_weight) || 0,
                        actualWeight: parseFloat(a.actual_weight) || 0,
                        trimEntryId: a.trim_entry_id,
                        status: a.status,
                    })),
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error allocating harvest:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to allocate harvest' }),
        };
    }
};
