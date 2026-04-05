import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const VALID_PACKAGE_TYPES = ['flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'lead');
        if (denied) return denied;

        const { name, licenseNumber, category, strain, unitOfMeasure, packageType } = JSON.parse(event.body || '{}');

        if (!name?.trim() || !licenseNumber?.trim() || !category?.trim()) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'name, licenseNumber, and category are required' }),
            };
        }

        if (packageType && !VALID_PACKAGE_TYPES.includes(packageType)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `packageType must be one of: ${VALID_PACKAGE_TYPES.join(', ')}` }),
            };
        }

        const result = await sql`
            INSERT INTO metrc_items (company_id, license_number, name, category, strain, unit_of_measure, package_type)
            VALUES (
                ${context.companyId},
                ${licenseNumber.trim()},
                ${name.trim()},
                ${category.trim()},
                ${strain?.trim() || null},
                ${unitOfMeasure?.trim() || 'Grams'},
                ${packageType || null}
            )
            ON CONFLICT (company_id, license_number, name) DO UPDATE SET
                category = EXCLUDED.category,
                strain = COALESCE(EXCLUDED.strain, metrc_items.strain),
                unit_of_measure = EXCLUDED.unit_of_measure,
                package_type = COALESCE(EXCLUDED.package_type, metrc_items.package_type),
                updated_at = NOW()
            RETURNING *
        `;

        const r = result.rows[0];

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
            }),
        };
    } catch (error) {
        console.error('Error upserting METRC item:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to upsert METRC item' }),
        };
    }
};
