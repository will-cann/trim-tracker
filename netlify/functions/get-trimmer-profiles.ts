import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
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

        const result = await sql`
      SELECT id, name, status 
      FROM trimmer_profiles 
      WHERE company_id = ${context.companyId}
      ORDER BY name ASC
    `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Error fetching trimmer profiles:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch trimmer profiles' }),
        };
    }
};
