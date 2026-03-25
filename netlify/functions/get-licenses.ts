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

        // If ?mine=true, return only licenses assigned to the current user
        const mine = event.queryStringParameters?.mine === 'true';

        let result;
        if (mine) {
            result = await sql`
                SELECT l.id, l.license_number, l.label, l.created_at
                FROM licenses l
                JOIN user_licenses ul ON ul.license_id = l.id
                WHERE l.company_id = ${context.companyId}
                  AND ul.user_id = ${context.userId}
                ORDER BY l.license_number ASC
            `;
        } else {
            result = await sql`
                SELECT l.id, l.license_number, l.label, l.created_at,
                    COALESCE(
                        (SELECT json_agg(json_build_object('userId', ul.user_id))
                         FROM user_licenses ul WHERE ul.license_id = l.id),
                        '[]'::json
                    ) AS assigned_users
                FROM licenses l
                WHERE l.company_id = ${context.companyId}
                ORDER BY l.license_number ASC
            `;
        }

        const licenses = result.rows.map((r: any) => ({
            id: r.id,
            licenseNumber: r.license_number,
            label: r.label,
            createdAt: r.created_at,
            ...(r.assigned_users ? { assignedUsers: r.assigned_users } : {}),
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(licenses),
        };
    } catch (error) {
        console.error('Error fetching licenses:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch licenses' }),
        };
    }
};
