import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { sessionId, harvestName, licenseNumber, strain, startWeight, status, plannedTrimDate, plannedMethod } = JSON.parse(event.body || '{}');

        if (!sessionId || !harvestName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Session ID and Harvest Name are required' }),
            };
        }

        const [newEntry] = await sql`
      INSERT INTO trim_entries (
        session_id, 
        harvest_name, 
        license_number, 
        strain, 
        start_weight, 
        status,
        planned_trim_date,
        planned_method
      )
      VALUES (
        ${sessionId}, 
        ${harvestName}, 
        ${licenseNumber}, 
        ${strain}, 
        ${startWeight}, 
        ${status || 'active'},
        ${plannedTrimDate || null},
        ${plannedMethod || null}
      )
      RETURNING *
    `;

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
