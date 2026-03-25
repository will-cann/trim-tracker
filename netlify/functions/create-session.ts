import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';
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

        const data = JSON.parse(event.body || '{}');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check for existing active session
            const existing = await client.query(
                `SELECT id FROM trim_sessions WHERE company_id = $1 AND completed_at IS NULL LIMIT 1`,
                [context.companyId]
            );
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 409,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'An active session already exists. Submit or complete it first.' }),
                };
            }

            // Create session
            const sessionResult = await client.query(`
        INSERT INTO trim_sessions (company_id, created_by, start_time)
        VALUES ($1, $2, NOW())
        RETURNING *
      `, [context.companyId, context.userId]);

            const newSession = sessionResult.rows[0];

            // Create initial entry/batch
            const entryResult = await client.query(`
        INSERT INTO trim_entries (
          session_id, 
          harvest_name, 
          license_number, 
          strain, 
          start_weight, 
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'active')
        RETURNING *
      `, [newSession.id, data.harvestName, data.licenseNumber, data.strain, data.startWeight]);

            const newEntry = entryResult.rows[0];

            // Auto-capture strain
            if (data.strain) {
                await client.query(`
                    INSERT INTO strains (company_id, name)
                    VALUES ($1, $2)
                    ON CONFLICT (company_id, LOWER(name)) DO NOTHING
                `, [context.companyId, data.strain]);
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newSession,
                    startTime: newSession.start_time,
                    entries: [{
                        ...newEntry,
                        harvestName: newEntry.harvest_name,
                        licenseNumber: newEntry.license_number,
                        startWeight: parseFloat(newEntry.start_weight),
                        trimmers: []
                    }]
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating session:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create session' }),
        };
    }
};
