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

        // Optional query: ?includeInactive=1 to fetch archived types as well
        const includeInactive = event.queryStringParameters?.includeInactive === '1';

        const result = includeInactive
            ? await sql`
                SELECT id, name, display_name, category, default_unit, is_cannabis,
                       metrc_item_category, is_active, sort_order, created_at, updated_at
                FROM product_types
                WHERE company_id = ${context.companyId}
                ORDER BY sort_order ASC, name ASC
            `
            : await sql`
                SELECT id, name, display_name, category, default_unit, is_cannabis,
                       metrc_item_category, is_active, sort_order, created_at, updated_at
                FROM product_types
                WHERE company_id = ${context.companyId} AND is_active = true
                ORDER BY sort_order ASC, name ASC
            `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.rows.map(formatRow)),
        };
    } catch (error) {
        console.error('Error fetching product types:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch product types' }),
        };
    }
};

function formatRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        category: row.category,
        defaultUnit: row.default_unit,
        isCannabis: row.is_cannabis,
        metrcItemCategory: row.metrc_item_category,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
