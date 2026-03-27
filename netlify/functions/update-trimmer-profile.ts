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

        const { profileId, name, role, email, status } = JSON.parse(event.body || '{}');

        if (!profileId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'profileId is required' }) };
        }

        // Verify ownership
        const existing = await sql`
            SELECT company_id FROM trimmer_profiles WHERE id = ${profileId}
        `;
        if (existing.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
        }
        if (existing.rows[0].company_id !== context.companyId) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        const result = await sql`
            UPDATE trimmer_profiles SET
                name = COALESCE(${name ?? null}, name),
                role = COALESCE(${role ?? null}, role),
                email = CASE WHEN ${email !== undefined} THEN ${email ?? null} ELSE email END,
                status = COALESCE(${status ?? null}, status)
            WHERE id = ${profileId} AND company_id = ${context.companyId}
            RETURNING id, name, status, role, email, user_id, created_at
        `;

        const row = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: row.id,
                name: row.name,
                status: row.status,
                role: row.role,
                email: row.email || undefined,
                userId: row.user_id || undefined,
                createdAt: row.created_at,
            }),
        };
    } catch (error) {
        console.error('Error updating profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update team member' }),
        };
    }
};
