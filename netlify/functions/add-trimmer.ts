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

        const { entryId, profileId, name, startTime, tool } = JSON.parse(event.body || '{}');

        if (!entryId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID is required' }),
            };
        }

        if (tool && !['scissors', 'machine'].includes(tool)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'tool must be scissors or machine' }),
            };
        }

        // Verify ownership of the entry
        const ownershipResult = await sql`
          SELECT ts.company_id 
          FROM trim_sessions ts
          JOIN trim_entries te ON te.session_id = ts.id
          WHERE te.id = ${entryId}
        `;

        if (ownershipResult.rows.length === 0 || ownershipResult.rows[0].company_id !== context.companyId) {
            throw new Error('Forbidden: You do not have access to this resource');
        }

        const { rows: [newTrimmer] } = await sql`
      INSERT INTO trimmers (
        entry_id, 
        profile_id, 
        name, 
        start_time, 
        tool,
        flower_weight,
        shake_weight,
        trim_weight,
        waste_weight
      )
      VALUES (
        ${entryId}, 
        ${profileId || null}, 
        ${name || ''},
        ${startTime || null},
        ${tool || null},
        0, 0, 0, 0
      )
      RETURNING *
    `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...newTrimmer,
                startTime: newTrimmer.start_time,
                flowerWeight: newTrimmer.flower_weight,
                shakeWeight: newTrimmer.shake_weight,
                trimWeight: newTrimmer.trim_weight,
                wasteWeight: newTrimmer.waste_weight,
            }),
        };
    } catch (error) {
        console.error('Error adding trimmer:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add trimmer' }),
        };
    }
};
