import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
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

        const { sessionId, harvestName, licenseNumber, strain, startWeight, status, plannedTrimDate, plannedMethod, harvestId } = JSON.parse(event.body || '{}');

        if (!sessionId || !harvestName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Session ID and Harvest Name are required' }),
            };
        }

        // Verify ownership of the session
        const ownershipResult = await sql`
          SELECT company_id FROM trim_sessions WHERE id = ${sessionId}
        `;

        if (ownershipResult.rows.length === 0 || ownershipResult.rows[0].company_id !== context.companyId) {
            throw new Error('Forbidden: You do not have access to this resource');
        }

        const { rows: [newEntry] } = await sql`
      INSERT INTO trim_entries (
        session_id,
        harvest_name,
        license_number,
        strain,
        start_weight,
        status,
        planned_trim_date,
        planned_method,
        harvest_id
      )
      VALUES (
        ${sessionId},
        ${harvestName},
        ${licenseNumber},
        ${strain},
        ${startWeight},
        ${status || 'active'},
        ${plannedTrimDate || null},
        ${plannedMethod || null},
        ${harvestId || null}
      )
      RETURNING *
    `;

        // Auto-capture strain
        if (strain) {
            await sql`
                INSERT INTO strains (company_id, name)
                VALUES (${context.companyId}, ${strain})
                ON CONFLICT (company_id, LOWER(name)) DO NOTHING
            `;
        }

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...newEntry,
                harvestName: newEntry.harvest_name,
                licenseNumber: newEntry.license_number,
                startWeight: newEntry.start_weight,
                plannedTrimDate: newEntry.planned_trim_date,
                plannedMethod: newEntry.planned_method,
                trimmers: []
            }),
        };
    } catch (error) {
        console.error('Error adding batch:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add batch' }),
        };
    }
};
