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

        const { profileId } = JSON.parse(event.body || '{}');

        if (!profileId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'profileId is required' }) };
        }

        // Verify ownership and get profile
        const existing = await sql`
            SELECT company_id, name, email FROM trimmer_profiles WHERE id = ${profileId}
        `;
        if (existing.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
        }
        if (existing.rows[0].company_id !== context.companyId) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        const profile = existing.rows[0];
        if (!profile.email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Profile has no email address' }) };
        }

        // Send Auth0 invitation
        const result = await sendInvitation(profile.email, profile.name);

        if (!result.success) {
            return {
                statusCode: 502,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: result.error || 'Failed to send invitation' }),
            };
        }

        // Update invite tracking
        const updated = await sql`
            UPDATE trimmer_profiles
            SET invited_at = NOW(), invite_status = 'pending'
            WHERE id = ${profileId}
            RETURNING invited_at
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                invitedAt: updated.rows[0].invited_at,
                inviteUrl: result.inviteUrl || undefined,
            }),
        };
    } catch (error) {
        console.error('Error sending team invite:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send invitation' }),
        };
    }
};
