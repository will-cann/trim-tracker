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
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const roomType = event.queryStringParameters?.type;

        let result;
        if (roomType) {
            result = await sql`
                SELECT id, name, room_type, capacity
                FROM rooms
                WHERE company_id = ${context.companyId}
                    AND room_type = ${roomType}
                ORDER BY name
            `;
        } else {
            result = await sql`
                SELECT id, name, room_type, capacity
                FROM rooms
                WHERE company_id = ${context.companyId}
                ORDER BY name
            `;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows),
        };
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch rooms' }),
        };
    }
};
