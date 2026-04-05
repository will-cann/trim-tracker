import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'director');
        if (denied) return denied;

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

        // UPDATE
        if (event.httpMethod === 'PUT') {
            const { id, label } = JSON.parse(event.body || '{}');
            if (!id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'License ID is required' }) };
            }

            const result = await sql`
                UPDATE licenses SET label = ${label?.trim() || null}, updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING id, license_number, label, created_at
            `;

            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'License not found' }) };
            }

            const lic = result.rows[0];
            return {
                statusCode: 200,
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
