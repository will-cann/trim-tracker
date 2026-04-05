import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
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

        const denied = authorize(context, 'director');
        if (denied) return denied;

        const id = event.queryStringParameters?.id;

        if (!id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID is required' }),
            };
        }

        await sql`
      DELETE FROM trimmer_profiles 
      WHERE id = ${id} AND company_id = ${context.companyId}
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
