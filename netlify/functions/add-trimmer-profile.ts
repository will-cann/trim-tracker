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

        const { name } = JSON.parse(event.body || '{}');

        if (!name) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Name is required' }),
            };
        }

        const { rows } = await sql`
      INSERT INTO trimmer_profiles (company_id, name, status)
      VALUES (${context.companyId}, ${name}, 'active')
      RETURNING id, name, status
    `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows[0]),
        };
    } catch (error) {
        console.error('Error adding trimmer profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add trimmer profile' }),
        };
    }
};
