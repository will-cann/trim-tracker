import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * DELETE /delete-planning-session
 *
 * Hard-deletes a planning session. Runs that were created from the session
 * keep their `source_planning_session_id` set to NULL via ON DELETE SET NULL.
 */

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id } = JSON.parse(event.body || '{}');
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        const result = await sql`
            DELETE FROM planning_sessions
            WHERE id = ${id} AND company_id = ${context.companyId}
            RETURNING id
        `;
        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Planning session not found' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error deleting planning session:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete planning session' }) };
    }
};
