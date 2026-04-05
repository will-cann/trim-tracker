import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
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

        const { harvestId, bins } = JSON.parse(event.body || '{}');

        if (!harvestId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'harvestId is required' }) };
        }
        if (!Array.isArray(bins) || bins.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'bins array is required (each with weight)' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Verify harvest ownership and status
            const { rows: [harvest] } = await client.query(
                `SELECT id, strain, license_number, status FROM harvests WHERE id = $1 AND company_id = $2`,
                [harvestId, context.companyId]
            );

            if (!harvest) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
            }

            if (harvest.status !== 'bucking' && harvest.status !== 'hanging') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: `Harvest must be in hanging or bucking status (current: ${harvest.status})` }) };
            }

            // Auto-transition hanging → bucking on first bin
            if (harvest.status === 'hanging') {
                await client.query(
                    `UPDATE harvests SET status = 'bucking' WHERE id = $1`,
                    [harvestId]
                );
            }

            // Get the next bin_number for this harvest
            const { rows: [{ max_num }] } = await client.query(
                `SELECT COALESCE(MAX(bin_number), 0) AS max_num FROM harvest_bins WHERE harvest_id = $1`,
                [harvestId]
            );
            let nextNum = parseInt(max_num) + 1;

            const created: any[] = [];

            for (const bin of bins) {
                const { rows: [row] } = await client.query(`
                    INSERT INTO harvest_bins (
                        company_id, harvest_id, bin_number, strain, license_number,
                        weight, location, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `, [
                    context.companyId, harvestId, nextNum,
                    bin.strain || harvest.strain,
                    bin.licenseNumber || harvest.license_number,
                    bin.weight || null,
                    bin.location || null,
                    context.userId,
                ]);

                created.push({
                    id: row.id,
                    harvestId: row.harvest_id,
                    binNumber: row.bin_number,
                    strain: row.strain,
                    licenseNumber: row.license_number,
                    weight: row.weight ? parseFloat(row.weight) : null,
                    status: row.status,
                    location: row.location,
                    buckedAt: row.bucked_at,
                    readyAt: row.ready_at,
                    createdAt: row.created_at,
                });

                nextNum++;
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bins: created }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating bins:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create bins' }),
        };
    }
};
