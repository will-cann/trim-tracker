import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * POST /save-planning-session
 *
 * Create (no id) or update (id provided) a planning session.
 *
 * Body: {
 *   id?, name, targets[], plan?, status?, notes?
 * }
 */

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id, name, targets, plan, status, notes } = JSON.parse(event.body || '{}');
        if (!name || typeof name !== 'string' || !name.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name is required' }) };
        }
        if (!Array.isArray(targets)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'targets[] is required' }) };
        }
        const safeStatus = ['draft', 'scheduled', 'archived'].includes(status) ? status : 'draft';
        const targetsJson = JSON.stringify(targets);
        const planJson = plan ? JSON.stringify(plan) : null;

        let row;
        if (id) {
            const result = await sql`
                UPDATE planning_sessions
                SET name = ${name.trim()},
                    targets = ${targetsJson}::jsonb,
                    plan = ${planJson}::jsonb,
                    status = ${safeStatus},
                    notes = ${notes?.trim() || null},
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING *
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Planning session not found' }) };
            }
            row = result.rows[0];
        } else {
            const result = await sql`
                INSERT INTO planning_sessions (company_id, name, targets, plan, status, notes, created_by)
                VALUES (${context.companyId}, ${name.trim()}, ${targetsJson}::jsonb,
                        ${planJson}::jsonb, ${safeStatus}, ${notes?.trim() || null}, ${context.userId})
                RETURNING *
            `;
            row = result.rows[0];
        }

        return {
            statusCode: id ? 200 : 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: row.id,
                companyId: row.company_id,
                name: row.name,
                targets: row.targets || [],
                plan: row.plan || null,
                status: row.status,
                notes: row.notes,
                createdBy: row.created_by,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }),
        };
    } catch (error) {
        console.error('Error saving planning session:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save planning session' }) };
    }
};
