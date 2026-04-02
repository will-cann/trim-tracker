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

        const { allocationId } = JSON.parse(event.body || '{}');

        if (!allocationId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'allocationId is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get allocation + parent harvest (including moisture loss pct)
            const { rows: [allocation] } = await client.query(`
                SELECT ha.*, h.batch_id, h.strain, h.license_number, h.company_id,
                       h.moisture_loss_pct, h.dry_weight AS harvest_dry_weight
                FROM harvest_allocations ha
                JOIN harvests h ON ha.harvest_id = h.id
                WHERE ha.id = $1
            `, [allocationId]);

            if (!allocation || allocation.company_id !== context.companyId) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Allocation not found' }) };
            }

            if (allocation.allocation_type !== 'flower') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Only flower allocations can be converted to trim' }) };
            }

            if (allocation.trim_entry_id) {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Allocation already converted to a trim entry' }) };
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

            // Wet weight is the allocation target (based on wet harvest weight minus waste)
            const wetWeight = parseFloat(allocation.actual_weight) > 0
                ? parseFloat(allocation.actual_weight)
                : parseFloat(allocation.target_weight);

            // If the harvest has a recorded dry weight, use that directly.
            // Otherwise estimate dry weight from moisture loss percentage.
            const moistureLossPct = parseFloat(allocation.moisture_loss_pct) || 75;
            const harvestDryWeight = parseFloat(allocation.harvest_dry_weight);
            const startWeight = harvestDryWeight > 0
                ? harvestDryWeight
                : Math.round(wetWeight * (1 - moistureLossPct / 100) * 100) / 100;

            // Create the trim entry with wet weight for reconciliation
            const { rows: [trimEntry] } = await client.query(`
                INSERT INTO trim_entries (
                    session_id, harvest_name, license_number, strain,
                    start_weight, wet_weight, status, harvest_allocation_id, harvest_id
                ) VALUES ($1, $2, $3, $4, $5, $6, 'upcoming', $7, $8)
                RETURNING *
            `, [sessionId, allocation.batch_id, allocation.license_number, allocation.strain,
                startWeight, wetWeight, allocationId, allocation.harvest_id]);

            // Update allocation
            await client.query(`
                UPDATE harvest_allocations
                SET trim_entry_id = $1, status = 'completed'
                WHERE id = $2
            `, [trimEntry.id, allocationId]);

            // Check if all allocations for this harvest are completed
            const { rows: [remaining] } = await client.query(
                `SELECT COUNT(*) as count FROM harvest_allocations WHERE harvest_id = $1 AND status != 'completed'`,
                [allocation.harvest_id]
            );

            if (parseInt(remaining.count) === 0) {
                await client.query(
                    `UPDATE harvests SET status = 'completed' WHERE id = $1`,
                    [allocation.harvest_id]
                );
            }

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
                        wetWeight: parseFloat(trimEntry.wet_weight) || 0,
                        moistureLoss: parseFloat(trimEntry.moisture_loss) || 0,
                        status: trimEntry.status,
                        harvestAllocationId: trimEntry.harvest_allocation_id,
                        harvestId: trimEntry.harvest_id,
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
        console.error('Error converting to trim:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to convert harvest to trim entry' }),
        };
    }
};
