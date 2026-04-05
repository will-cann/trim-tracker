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

        const { binId } = JSON.parse(event.body || '{}');

        if (!binId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'binId is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get bin with harvest info
            const { rows: [bin] } = await client.query(`
                SELECT b.*, h.batch_id, h.moisture_loss_pct
                FROM harvest_bins b
                JOIN harvests h ON b.harvest_id = h.id
                WHERE b.id = $1 AND b.company_id = $2
            `, [binId, context.companyId]);

            if (!bin) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Bin not found' }) };
            }

            if (bin.status !== 'ready') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Bin must be in ready status to send to trim' }) };
            }

            if (bin.trim_entry_id) {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Bin already sent to trim' }) };
            }

            // Find or create an active session
            let sessionId: string;
            const { rows: existingSessions } = await client.query(
                `SELECT id FROM trim_sessions WHERE company_id = $1 AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
                [context.companyId]
            );

            if (existingSessions.length > 0) {
                sessionId = existingSessions[0].id;
            } else {
                const { rows: [newSession] } = await client.query(`
                    INSERT INTO trim_sessions (company_id, created_by, start_time)
                    VALUES ($1, $2, NOW())
                    RETURNING id
                `, [context.companyId, context.userId]);
                sessionId = newSession.id;
            }

            // Bin weight is the post-cure weight (already dry), use as start_weight directly
            const startWeight = parseFloat(bin.weight) || 0;

            // Create the trim entry linked to this bin
            const { rows: [trimEntry] } = await client.query(`
                INSERT INTO trim_entries (
                    session_id, harvest_name, license_number, strain,
                    start_weight, status, harvest_id, bin_id
                ) VALUES ($1, $2, $3, $4, $5, 'upcoming', $6, $7)
                RETURNING *
            `, [sessionId, bin.batch_id, bin.license_number, bin.strain,
                startWeight, bin.harvest_id, binId]);

            // Update bin status and link
            await client.query(`
                UPDATE harvest_bins
                SET status = 'in_trim', trim_entry_id = $1
                WHERE id = $2
            `, [trimEntry.id, binId]);

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trimEntry: {
                        id: trimEntry.id,
                        sessionId: trimEntry.session_id,
                        harvestName: trimEntry.harvest_name,
                        licenseNumber: trimEntry.license_number,
                        strain: trimEntry.strain,
                        startWeight: parseFloat(trimEntry.start_weight) || 0,
                        status: trimEntry.status,
                        harvestId: trimEntry.harvest_id,
                        binId: trimEntry.bin_id,
                    },
                    sessionId,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error sending bin to trim:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send bin to trim' }),
        };
    }
};
