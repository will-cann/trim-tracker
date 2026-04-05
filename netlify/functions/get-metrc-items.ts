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

        const licenseNumber = event.queryStringParameters?.licenseNumber;

        const result = licenseNumber
            ? await sql`
                SELECT * FROM metrc_items
                WHERE company_id = ${context.companyId}
                  AND license_number = ${licenseNumber}
                ORDER BY name ASC
            `
            : await sql`
                SELECT * FROM metrc_items
                WHERE company_id = ${context.companyId}
                ORDER BY license_number, name ASC
            `;

        const items = result.rows.map(formatItem);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items),
        };
    } catch (error) {
        console.error('Error fetching METRC items:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch METRC items' }),
        };
    }
};

function formatItem(r: any) {
    return {
        id: r.id,
        licenseNumber: r.license_number,
        name: r.name,
        category: r.category,
        strain: r.strain || null,
        unitOfMeasure: r.unit_of_measure,
        packageType: r.package_type || null,
        metrcId: r.metrc_id ? Number(r.metrc_id) : null,
        metrcSyncedAt: r.metrc_synced_at || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}
