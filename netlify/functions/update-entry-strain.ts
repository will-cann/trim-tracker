import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { entryId, strain } = JSON.parse(event.body || '{}');

        if (!entryId || !strain) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID and Strain are required' }),
            };
        }

        await sql`
      UPDATE trim_entries
      SET strain = ${strain}
      WHERE id = ${entryId}
    `;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error updating entry strain:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update entry strain' }),
        };
    }
};
