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
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { taskId } = JSON.parse(event.body || '{}');

        if (!taskId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'taskId is required' }) };
        }

        const result = await sql`
            DELETE FROM human_tasks
            WHERE id = ${taskId} AND company_id = ${context.companyId}
            RETURNING id
        `;

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Task not found' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted: true, id: taskId }),
        };
    } catch (error) {
        console.error('Error deleting task:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete task' }),
        };
    }
};
