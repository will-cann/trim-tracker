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

        const { name, role, email } = JSON.parse(event.body || '{}');

        if (!name) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Name is required' }) };
        }

        const { rows } = await sql`
            INSERT INTO trimmer_profiles (company_id, name, status, role, email)
            VALUES (
                ${context.companyId},
                ${name},
                'active',
                ${role || 'worker'},
                ${email || null}
            )
            RETURNING id, name, status, role, email, user_id, created_at
        `;

        const row = rows[0];
        return {
            statusCode: 201,
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
        console.error('Error adding trimmer profile:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add team member' }),
        };
    }
};
