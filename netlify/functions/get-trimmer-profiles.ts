import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const result = await sql`
            SELECT id, name, status, role, email, user_id, created_at
            FROM trimmer_profiles
            WHERE company_id = ${context.companyId}
            ORDER BY name ASC
        `;

        const profiles = result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            role: row.role || 'worker',
            email: row.email || undefined,
            userId: row.user_id || undefined,
            createdAt: row.created_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profiles),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error fetching trimmer profiles:', msg);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: msg }),
        };
    }
};
