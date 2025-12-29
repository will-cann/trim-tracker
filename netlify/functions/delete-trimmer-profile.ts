import { Handler } from '@netlify/functions';
import { sql } from './utils/db';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const id = event.queryStringParameters?.id;

    if (!id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'ID is required' }),
        };
    }

    try {
        await sql`
      DELETE FROM trimmer_profiles 
      WHERE id = ${id}
    `;

        return {
            statusCode: 204,
            body: '',
        };
    } catch (error) {
        console.error('Error deleting trimmer profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete trimmer profile' }),
        };
    }
};
