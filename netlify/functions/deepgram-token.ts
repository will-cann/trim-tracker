import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { captureError } from './utils/sentry';
import { checkRateLimit } from './utils/rateLimit';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const authContext = await resolveContext(event.headers.authorization);
        if (!authContext) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // Rate limit: 10 token requests per company per 60 seconds
        const rateLimit = await checkRateLimit(authContext.companyId, 'deepgram-token', 10, 60);
        if (!rateLimit.allowed) {
            return {
                statusCode: 429,
                headers: { 'Retry-After': String(rateLimit.retryAfterSeconds || 60) },
                body: JSON.stringify({ error: 'Rate limit exceeded' }),
            };
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
