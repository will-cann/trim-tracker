import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { entryId, profileId, name, startTime, tool } = JSON.parse(event.body || '{}');

        if (!entryId || !name || !startTime) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID, Name, and Start Time are required' }),
            };
        }

        const [newTrimmer] = await sql`
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
        ${name}, 
        ${startTime}, 
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
