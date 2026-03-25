import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const id = event.queryStringParameters?.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Strain ID is required' }) };
        }

        await sql`
            DELETE FROM strains
            WHERE id = ${id} AND company_id = ${context.companyId}
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error deleting strain:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete strain' }),
        };
    }
};
