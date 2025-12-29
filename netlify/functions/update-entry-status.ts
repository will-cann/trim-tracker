import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
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
      WHERE id = ${entryId} AND session_id IN (
        SELECT id FROM trim_sessions WHERE company_id = ${context.companyId}
      )
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
