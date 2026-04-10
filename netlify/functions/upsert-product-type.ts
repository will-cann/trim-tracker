import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

const VALID_CATEGORIES = ['biomass', 'intermediate', 'finished', 'additive'];

function normalizeName(raw: string): string {
    // Convert to snake_case lowercase, strip non-alphanumerics
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const {
            id,
            name: rawName,
            displayName,
            category,
            defaultUnit,
            isCannabis,
            processTypes,
            metrcItemCategory,
            isActive,
            sortOrder,
        } = body;

        if (!rawName || !displayName) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name and displayName are required' }) };
        }
        if (!category || !VALID_CATEGORIES.includes(category)) {
            return { statusCode: 400, body: JSON.stringify({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` }) };
        }

        const normalizedName = normalizeName(rawName);
        if (!normalizedName) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name must contain at least one alphanumeric character' }) };
        }

        const unit = defaultUnit || 'g';
        const cannabis = isCannabis !== false; // default true
        const active = isActive !== false; // default true
        const sort = typeof sortOrder === 'number' ? sortOrder : 100;
        const procTypes: string[] = Array.isArray(processTypes) ? processTypes : [];

        if (id) {
            // Update existing
            const result = await sql`
                UPDATE product_types
                SET name = ${normalizedName},
                    display_name = ${displayName},
                    category = ${category},
                    default_unit = ${unit},
                    is_cannabis = ${cannabis},
                    process_types = ${procTypes},
                    metrc_item_category = ${metrcItemCategory || null},
                    is_active = ${active},
                    sort_order = ${sort},
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING *
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Product type not found' }) };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formatRow(result.rows[0])),
            };
        }

        // Insert new (or no-op if already exists with same name)
        const result = await sql`
            INSERT INTO product_types (
                company_id, name, display_name, category, default_unit,
                is_cannabis, process_types, metrc_item_category, is_active, sort_order
            )
            VALUES (
                ${context.companyId}, ${normalizedName}, ${displayName}, ${category}, ${unit},
                ${cannabis}, ${procTypes}, ${metrcItemCategory || null}, ${active}, ${sort}
            )
            ON CONFLICT (company_id, name) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                category = EXCLUDED.category,
                default_unit = EXCLUDED.default_unit,
                is_cannabis = EXCLUDED.is_cannabis,
                process_types = EXCLUDED.process_types,
                metrc_item_category = EXCLUDED.metrc_item_category,
                is_active = EXCLUDED.is_active,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
            RETURNING *
        `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatRow(result.rows[0])),
        };
    } catch (error) {
        console.error('Error upserting product type:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to upsert product type' }),
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
        processTypes: (row.process_types as string[]) || [],
        metrcItemCategory: row.metrc_item_category,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
