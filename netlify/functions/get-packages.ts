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

        const params = event.queryStringParameters || {};
        const status = params.status;
        const packageType = params.type;

        let result;

        if (status && packageType) {
            result = await sql`
                SELECT p.*, t.tag_number
                FROM packages p
                LEFT JOIN tags t ON p.tag_id = t.id
                WHERE p.company_id = ${context.companyId}
                  AND p.status = ${status}
                  AND p.package_type = ${packageType}
                ORDER BY p.packaged_date DESC
            `;
        } else if (status) {
            result = await sql`
                SELECT p.*, t.tag_number
                FROM packages p
                LEFT JOIN tags t ON p.tag_id = t.id
                WHERE p.company_id = ${context.companyId}
                  AND p.status = ${status}
                ORDER BY p.packaged_date DESC
            `;
        } else if (packageType) {
            result = await sql`
                SELECT p.*, t.tag_number
                FROM packages p
                LEFT JOIN tags t ON p.tag_id = t.id
                WHERE p.company_id = ${context.companyId}
                  AND p.status != 'archived'
                  AND p.package_type = ${packageType}
                ORDER BY p.packaged_date DESC
            `;
        } else {
            result = await sql`
                SELECT p.*, t.tag_number
                FROM packages p
                LEFT JOIN tags t ON p.tag_id = t.id
                WHERE p.company_id = ${context.companyId}
                  AND p.status != 'archived'
                ORDER BY p.packaged_date DESC
            `;
        }

        const packages = result.rows.map((row: any) => formatPackage(row));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(packages),
        };
    } catch (error) {
        console.error('Error fetching packages:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch packages' }),
        };
    }
};

function formatPackage(row: any) {
    return {
        id: row.id,
        harvestId: row.harvest_id,
        trimEntryId: row.trim_entry_id,
        tagId: row.tag_id,
        tagNumber: row.tag_number || null,
        label: row.label,
        packageType: row.package_type,
        itemName: row.item_name,
        strain: row.strain,
        licenseNumber: row.license_number,
        quantity: parseFloat(row.quantity) || 0,
        unit: row.unit,
        wasteWeight: parseFloat(row.waste_weight) || 0,
        location: row.location,
        notes: row.notes,
        status: row.status,
        labTestingState: row.lab_testing_state,
        packagedDate: row.packaged_date,
        finishedDate: row.finished_date,
        createdAt: row.created_at,
    };
}
