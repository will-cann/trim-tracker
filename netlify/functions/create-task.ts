import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

interface CreateTaskInput {
    title: string;
    description?: string;
    priority?: string;
    category?: string;
    assignee?: string;
    assignedToUserId?: string;
    location?: string;
    dueDate?: string;
    sourceConversationId?: string;
    onCompleteAction?: { type: string; data: Record<string, any> };
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');

        // Support single task or batch
        const inputs: CreateTaskInput[] = Array.isArray(body.tasks) ? body.tasks : [body];

        const created = [];

        for (const input of inputs) {
            if (!input.title) continue;

            const result = await sql`
                INSERT INTO human_tasks (
                    company_id, title, description, priority, category,
                    assignee, assigned_to_user_id, created_by_user_id,
                    location, due_date, source_conversation_id, on_complete_action
                ) VALUES (
                    ${context.companyId},
                    ${input.title},
                    ${input.description || null},
                    ${input.priority || 'medium'},
                    ${input.category || 'other'},
                    ${input.assignee || null},
                    ${input.assignedToUserId || null},
                    ${context.userId},
                    ${input.location || null},
                    ${input.dueDate || null},
                    ${input.sourceConversationId || null},
                    ${input.onCompleteAction ? JSON.stringify(input.onCompleteAction) : null}::jsonb
                )
                RETURNING *
            `;

            const row = result.rows[0];
            created.push({
                id: row.id,
                title: row.title,
                description: row.description || undefined,
                priority: row.priority,
                category: row.category,
                status: row.status,
                assignee: row.assignee || undefined,
                assignedToUserId: row.assigned_to_user_id || undefined,
                createdByUserId: row.created_by_user_id || undefined,
                location: row.location || undefined,
                dueDate: row.due_date || undefined,
                sourceConversationId: row.source_conversation_id || undefined,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                completedAt: row.completed_at || undefined,
                onCompleteAction: row.on_complete_action || undefined,
            });
        }

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(created.length === 1 ? created[0] : created),
        };
    } catch (error) {
        console.error('Error creating task:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create task' }),
        };
    }
};
