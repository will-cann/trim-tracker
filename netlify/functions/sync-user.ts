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

        const { name, email } = JSON.parse(event.body || '{}');
        if (!name && !email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name or email required' }) };
        }

        // Update users table
        await sql`
            UPDATE users SET
                name = COALESCE(${name || null}, name),
                email = COALESCE(${email || null}, email),
                updated_at = NOW()
            WHERE id = ${context.userId}
        `;

        // Also update linked trimmer_profile if it exists
        await sql`
            UPDATE trimmer_profiles SET
                name = COALESCE(${name || null}, name),
                email = COALESCE(${email || null}, email)
            WHERE company_id = ${context.companyId} AND user_id = ${context.userId}
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true }),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error syncing user:', msg);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: msg }),
        };
    }
};
