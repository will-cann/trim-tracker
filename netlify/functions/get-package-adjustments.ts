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

        const packageId = event.queryStringParameters?.packageId;

        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'packageId is required' }) };
        }

        const result = await sql`
            SELECT pa.*, u.display_name as created_by_name
            FROM package_adjustments pa
            LEFT JOIN users u ON pa.created_by = u.id
            WHERE pa.package_id = ${packageId}
              AND pa.company_id = ${context.companyId}
            ORDER BY pa.created_at DESC
        `;

        const adjustments = result.rows.map((r: any) => ({
            id: r.id,
            packageId: r.package_id,
            quantityBefore: parseFloat(r.quantity_before),
            quantityAfter: parseFloat(r.quantity_after),
            quantityDelta: parseFloat(r.quantity_delta),
            reason: r.reason,
            notes: r.notes,
            createdBy: r.created_by,
            createdByName: r.created_by_name || null,
            createdAt: r.created_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustments),
        };
    } catch (error) {
        console.error('Error fetching package adjustments:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch adjustments' }),
        };
    }
};
