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

        const denied = authorize(context, 'manager');
        if (denied) return denied;

        const { profileId, email } = JSON.parse(event.body || '{}');

        if (!profileId && !email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'profileId or email is required' }) };
        }

        // Look up the profile
        const { rows } = profileId
            ? await sql`
                SELECT id, name, email, user_id FROM trimmer_profiles
                WHERE id = ${profileId} AND company_id = ${context.companyId}
              `
            : await sql`
                SELECT id, name, email, user_id FROM trimmer_profiles
                WHERE LOWER(email) = LOWER(${email}) AND company_id = ${context.companyId}
              `;

        if (rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Team member not found' }) };
        }

        const profile = rows[0];

        if (!profile.email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Team member has no email address. Update their profile first.' }) };
        }

        if (profile.user_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'This team member has already accepted their invitation.' }) };
        }

        const result = await sendInvitation(profile.email, profile.name);

        if (!result.success) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: result.error || 'Failed to send invitation' }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, email: profile.email }),
        };
    } catch (error) {
        console.error('Error sending invitation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send invitation' }),
        };
    }
};
