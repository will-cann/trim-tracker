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

        const { taskId, ...updates } = JSON.parse(event.body || '{}');

        if (!taskId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'taskId is required' }) };
        }

        // Verify ownership
        const existing = await sql`
            SELECT company_id, status FROM human_tasks WHERE id = ${taskId}
        `;
        if (existing.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Task not found' }) };
        }
        if (existing.rows[0].company_id !== context.companyId) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        // Build SET clauses dynamically
        const sets: Record<string, any> = {};
        if (updates.title !== undefined) sets.title = updates.title;
        if (updates.description !== undefined) sets.description = updates.description;
        if (updates.priority !== undefined) sets.priority = updates.priority;
        if (updates.category !== undefined) sets.category = updates.category;
        if (updates.status !== undefined) sets.status = updates.status;
        if (updates.assignee !== undefined) sets.assignee = updates.assignee;
        if (updates.assignedToUserId !== undefined) sets.assigned_to_user_id = updates.assignedToUserId;
        if (updates.location !== undefined) sets.location = updates.location;
        if (updates.dueDate !== undefined) sets.due_date = updates.dueDate;

        // If completing, set completion metadata
        if (updates.status === 'completed' && existing.rows[0].status !== 'completed') {
            sets.completed_at = new Date().toISOString();
            sets.completed_by_user_id = context.userId;
        }
        // If un-completing, clear completion metadata
        if (updates.status && updates.status !== 'completed' && existing.rows[0].status === 'completed') {
            sets.completed_at = null;
            sets.completed_by_user_id = null;
        }

        if (Object.keys(sets).length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
        }

        // Build parameterized UPDATE — use individual field updates for safety
        const result = await sql`
            UPDATE human_tasks SET
                title = COALESCE(${sets.title ?? null}, title),
                description = CASE WHEN ${sets.description !== undefined} THEN ${sets.description ?? null} ELSE description END,
                priority = COALESCE(${sets.priority ?? null}, priority),
                category = COALESCE(${sets.category ?? null}, category),
                status = COALESCE(${sets.status ?? null}, status),
                assignee = CASE WHEN ${sets.assignee !== undefined} THEN ${sets.assignee ?? null} ELSE assignee END,
                assigned_to_user_id = CASE WHEN ${sets.assigned_to_user_id !== undefined} THEN ${sets.assigned_to_user_id ?? null}::uuid ELSE assigned_to_user_id END,
                location = CASE WHEN ${sets.location !== undefined} THEN ${sets.location ?? null} ELSE location END,
                due_date = CASE WHEN ${sets.due_date !== undefined} THEN ${sets.due_date ?? null}::timestamptz ELSE due_date END,
                completed_at = CASE WHEN ${sets.completed_at !== undefined} THEN ${sets.completed_at ?? null}::timestamptz ELSE completed_at END,
                completed_by_user_id = CASE WHEN ${sets.completed_by_user_id !== undefined} THEN ${sets.completed_by_user_id ?? null}::uuid ELSE completed_by_user_id END
            WHERE id = ${taskId} AND company_id = ${context.companyId}
            RETURNING *
        `;

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Task not found' }) };
        }

        const row = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
            }),
        };
    } catch (error) {
        console.error('Error updating task:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update task' }),
        };
    }
};
