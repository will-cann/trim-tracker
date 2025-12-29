import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { entryId, status } = JSON.parse(event.body || '{}');

        if (!entryId || !status) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID and Status are required' }),
            };
        }

        await sql`
      UPDATE trim_entries
      SET status = ${status}
      WHERE id = ${entryId}
    `;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error updating entry status:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update entry status' }),
        };
    }
};
