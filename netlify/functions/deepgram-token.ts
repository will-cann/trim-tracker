import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const authContext = await resolveContext(event.headers.authorization);
        if (!authContext) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            console.error('DEEPGRAM_API_KEY not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Speech service not configured' }),
            };
        }

        // Return the API key gated behind auth.
        // For production, upgrade to Deepgram's temporary scoped keys API:
        // POST https://api.deepgram.com/v1/projects/{projectId}/keys
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: apiKey }),
        };
    } catch (error) {
        console.error('Error in deepgram-token:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to generate token' }),
        };
    }
};
