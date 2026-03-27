import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

function toClient(row: any) {
    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        priority: row.priority,
        category: row.category,
        status: row.status,
        assignee: row.assignee || undefined,
        assignedToUserId: row.assigned_to_user_id || undefined,
        createdByUserId: row.created_by_user_id || undefined,
        completedByUserId: row.completed_by_user_id || undefined,
        location: row.location || undefined,
        dueDate: row.due_date || undefined,
        sourceConversationId: row.source_conversation_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at || undefined,
    };
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { status, category, priority } = event.queryStringParameters || {};

        let result;
        if (status && status !== 'all') {
            result = await sql`
                SELECT * FROM human_tasks
                WHERE company_id = ${context.companyId} AND status = ${status}
                ORDER BY created_at DESC
            `;
        } else {
            result = await sql`
                SELECT * FROM human_tasks
                WHERE company_id = ${context.companyId}
                ORDER BY created_at DESC
            `;
        }

        let tasks = result.rows;

        // Client-side filter for category/priority (simpler than dynamic SQL)
        if (category && category !== 'all') {
            tasks = tasks.filter((t: any) => t.category === category);
        }
        if (priority && priority !== 'all') {
            tasks = tasks.filter((t: any) => t.priority === priority);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tasks.map(toClient)),
        };
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch tasks' }),
        };
    }
};
