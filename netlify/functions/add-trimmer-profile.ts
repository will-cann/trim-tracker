import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';
import { sendInvitation } from './utils/auth0mgmt';

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

        // Inviting users (with email) requires manager+; adding roster-only profiles is open
        if (email) {
            const denied = authorize(context, 'manager');
            if (denied) return denied;
        }

        const validRoles = ['admin', 'manager', 'lead', 'worker'];
        const assignedRole = validRoles.includes(role) ? role : 'worker';

        const { rows } = await sql`
            INSERT INTO trimmer_profiles (company_id, name, status, role, email)
            VALUES (
                ${context.companyId},
                ${name},
                'active',
                ${assignedRole},
                ${email || null}
            )
            RETURNING id, name, status, role, email, user_id, invited_at, invite_status, created_at
        `;

        const row = rows[0];

        // Send Auth0 invitation if email was provided
        let invited = false;
        if (email) {
            const result = await sendInvitation(email, name);
            invited = result.success;
            if (result.success) {
                await sql`
                    UPDATE trimmer_profiles
                    SET invited_at = NOW(), invite_status = 'pending'
                    WHERE id = ${row.id}
                `;
            } else {
                console.warn(`Profile created but invite failed for ${email}: ${result.error}`);
            }
        }

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
                invitedAt: invited ? new Date().toISOString() : undefined,
                inviteStatus: invited ? 'pending' : 'none',
                createdAt: row.created_at,
                invited,
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
