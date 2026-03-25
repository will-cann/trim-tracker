import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // CREATE
        if (event.httpMethod === 'POST') {
            const { licenseNumber, label } = JSON.parse(event.body || '{}');
            if (!licenseNumber?.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'License number is required' }) };
            }

            const result = await sql`
                INSERT INTO licenses (company_id, license_number, label)
                VALUES (${context.companyId}, ${licenseNumber.trim()}, ${label?.trim() || null})
                ON CONFLICT (company_id, LOWER(license_number)) DO UPDATE SET
                    label = COALESCE(EXCLUDED.label, licenses.label),
                    updated_at = NOW()
                RETURNING id, license_number, label, created_at
            `;

            const lic = result.rows[0];

            // Auto-assign to creator
            await sql`
                INSERT INTO user_licenses (user_id, license_id)
                VALUES (${context.userId}, ${lic.id})
                ON CONFLICT (user_id, license_id) DO NOTHING
            `;

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: lic.id,
                    licenseNumber: lic.license_number,
                    label: lic.label,
                    createdAt: lic.created_at,
                }),
            };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'License ID is required' }) };
            }

            await sql`
                DELETE FROM licenses
                WHERE id = ${id} AND company_id = ${context.companyId}
            `;

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true }),
            };
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        console.error('Error managing license:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to manage license' }),
        };
    }
};
