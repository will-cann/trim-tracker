import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * GET /get-planning-sessions
 *   ?id=<uuid>         — fetch a single session (with full plan JSONB)
 *   ?status=draft|...  — filter by status (default: draft + scheduled)
 *
 * Listing omits the `plan` JSONB to keep payloads small; the single-get path
 * includes it.
 */

interface Row {
    id: string;
    company_id: string;
    name: string;
    targets: unknown;
    plan: unknown;
    status: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

const shape = (r: Row, includePlan: boolean) => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    targets: r.targets || [],
    plan: includePlan ? (r.plan || null) : null,
    status: r.status,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
});

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const id = event.queryStringParameters?.id;
        const statusFilter = event.queryStringParameters?.status;

        if (id) {
            const result = await sql`
                SELECT * FROM planning_sessions
                WHERE id = ${id} AND company_id = ${context.companyId}
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Planning session not found' }) };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shape(result.rows[0] as Row, true)),
            };
        }

        const result = statusFilter
            ? await sql`
                SELECT id, company_id, name, targets, NULL::jsonb AS plan,
                       status, notes, created_by, created_at, updated_at
                FROM planning_sessions
                WHERE company_id = ${context.companyId} AND status = ${statusFilter}
                ORDER BY updated_at DESC
            `
            : await sql`
                SELECT id, company_id, name, targets, NULL::jsonb AS plan,
                       status, notes, created_by, created_at, updated_at
                FROM planning_sessions
                WHERE company_id = ${context.companyId} AND status IN ('draft', 'scheduled')
                ORDER BY updated_at DESC
            `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows.map(r => shape(r as Row, false))),
        };
    } catch (error) {
        console.error('Error fetching planning sessions:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch planning sessions' }) };
    }
};
