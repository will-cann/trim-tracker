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

        // Ensure the current user has a trimmer_profile (covers admin who created the company)
        const { rows: existingLink } = await sql`
            SELECT id FROM trimmer_profiles
            WHERE company_id = ${context.companyId} AND user_id = ${context.userId}
            LIMIT 1
        `;

        // Fetch current user info from users table
        const { rows: [currentUser] } = await sql`
            SELECT name, email, role FROM users WHERE id = ${context.userId}
        `;

        if (existingLink.length === 0) {
            if (currentUser) {
                await sql`
                    INSERT INTO trimmer_profiles (id, company_id, name, status, role, email, user_id, invite_status)
                    VALUES (gen_random_uuid(), ${context.companyId}, ${currentUser.name || currentUser.email}, 'active', ${currentUser.role}, ${currentUser.email}, ${context.userId}, 'accepted')
                `;
            }
        } else if (currentUser) {
            // Sync profile with latest user info (fixes stale auth0|... names)
            await sql`
                UPDATE trimmer_profiles
                SET name = ${currentUser.name || currentUser.email}, email = ${currentUser.email}
                WHERE id = ${existingLink[0].id}
            `;
        }

        const result = await sql`
            SELECT id, name, status, role, email, departments, user_id, invited_at, invite_status, created_at
            FROM trimmer_profiles
            WHERE company_id = ${context.companyId}
            ORDER BY name ASC
        `;

        const profiles = result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            role: row.role || 'technician',
            departments: row.departments || [],
            email: row.email || undefined,
            userId: row.user_id || undefined,
            invitedAt: row.invited_at || undefined,
            inviteStatus: row.invite_status || 'none',
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
