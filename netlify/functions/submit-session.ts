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

        const { sessionId } = JSON.parse(event.body || '{}');

        if (!sessionId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Session ID is required' }),
            };
        }

        await sql`
      UPDATE trim_sessions
      SET completed_at = NOW()
      WHERE id = ${sessionId} AND company_id = ${context.companyId}
    `;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error submitting session:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to submit session' }),
        };
    }
};
