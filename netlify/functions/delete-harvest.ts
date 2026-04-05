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
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'director');
        if (denied) return denied;

        const id = event.queryStringParameters?.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        // Only allow deleting harvests in planning status
        const { rows } = await sql`
            DELETE FROM harvests
            WHERE id = ${id} AND company_id = ${context.companyId} AND status = 'planning'
            RETURNING id
        `;

        if (rows.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Harvest not found or cannot be deleted (only planning harvests can be deleted)' }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error deleting harvest:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete harvest' }),
        };
    }
};
