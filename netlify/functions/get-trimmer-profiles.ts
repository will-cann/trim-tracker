import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const result = await sql`
      SELECT id, name, status 
      FROM trimmer_profiles 
      WHERE company_id = ${COMPANY_ID}
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
