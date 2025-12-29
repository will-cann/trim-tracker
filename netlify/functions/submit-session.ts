import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
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
      WHERE id = ${sessionId}
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
