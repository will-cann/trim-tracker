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
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const { sessionId } = JSON.parse(event.body || '{}');

        if (!sessionId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Session ID is required' }),
            };
        }

        const client = await pool.connect();
        let rolledOverCount = 0;

        try {
            await client.query('BEGIN');

            // Verify ownership
            const sessionResult = await client.query(
                'SELECT id FROM trim_sessions WHERE id = $1 AND company_id = $2',
                [sessionId, context.companyId]
            );
            if (sessionResult.rows.length === 0) {
                throw new Error('Session not found');
            }

            // Find non-submitted entries (upcoming or active)
            const { rows: pendingEntries } = await client.query(
                `SELECT id FROM trim_entries WHERE session_id = $1 AND status != 'submitted'`,
                [sessionId]
            );

            rolledOverCount = pendingEntries.length;

            if (rolledOverCount > 0) {
                // Create a new session to hold the rolled-over entries
                const { rows: [newSession] } = await client.query(
                    `INSERT INTO trim_sessions (id, company_id, created_by, start_time, total_flower, total_shake, total_trim, total_waste)
                     VALUES (gen_random_uuid(), $1, $2, NOW(), 0, 0, 0, 0)
                     RETURNING id`,
                    [context.companyId, context.userId]
                );

                // Move pending entries to the new session
                await client.query(
                    `UPDATE trim_entries SET session_id = $1 WHERE session_id = $2 AND status != 'submitted'`,
                    [newSession.id, sessionId]
                );

                // Recalculate new session totals from moved entries
                await client.query(
                    `UPDATE trim_sessions SET
                        total_flower = COALESCE((SELECT SUM(flower_weight) FROM trim_entries WHERE session_id = $1), 0),
                        total_shake = COALESCE((SELECT SUM(shake_weight) FROM trim_entries WHERE session_id = $1), 0),
                        total_trim = COALESCE((SELECT SUM(trim_weight) FROM trim_entries WHERE session_id = $1), 0),
                        total_waste = COALESCE((SELECT SUM(waste_weight) FROM trim_entries WHERE session_id = $1), 0)
                     WHERE id = $1`,
                    [newSession.id]
                );
            }

            // Recalculate old session totals (only submitted entries remain)
            await client.query(
                `UPDATE trim_sessions SET
                    total_flower = COALESCE((SELECT SUM(flower_weight) FROM trim_entries WHERE session_id = $1), 0),
                    total_shake = COALESCE((SELECT SUM(shake_weight) FROM trim_entries WHERE session_id = $1), 0),
                    total_trim = COALESCE((SELECT SUM(trim_weight) FROM trim_entries WHERE session_id = $1), 0),
                    total_waste = COALESCE((SELECT SUM(waste_weight) FROM trim_entries WHERE session_id = $1), 0),
                    completed_at = NOW()
                 WHERE id = $1`,
                [sessionId]
            );

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                rolledOver: rolledOverCount,
            }),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error submitting session:', msg, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to submit session' }),
        };
    }
};
