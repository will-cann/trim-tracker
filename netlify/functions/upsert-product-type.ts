import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
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
            gramWeight,
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
        // Fill weight for each-unit products (carts, pens, buckets). Stored as
        // null for bulk-weight items; a positive number for each-unit items.
        const gw = gramWeight == null || gramWeight === '' ? null
            : (Number.isFinite(Number(gramWeight)) && Number(gramWeight) > 0 ? Number(gramWeight) : null);

        if (id) {
            // Update existing — use pool.query so the pg driver handles the
            // JS string array natively for process_types (TEXT[]).
            const result = await pool.query(
                `UPDATE product_types
                 SET name = $1, display_name = $2, category = $3, default_unit = $4,
                     gram_weight = $5,
                     is_cannabis = $6, process_types = $7, metrc_item_category = $8,
                     is_active = $9, sort_order = $10, updated_at = NOW()
                 WHERE id = $11 AND company_id = $12
                 RETURNING *`,
                [normalizedName, displayName, category, unit, gw, cannabis, procTypes,
                 metrcItemCategory || null, active, sort, id, context.companyId]
            );
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Product type not found' }) };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formatRow(result.rows[0])),
            };
        }

        // Insert new (or upsert on conflict)
        const result = await pool.query(
            `INSERT INTO product_types (
                company_id, name, display_name, category, default_unit, gram_weight,
                is_cannabis, process_types, metrc_item_category, is_active, sort_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (company_id, name) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                category = EXCLUDED.category,
                default_unit = EXCLUDED.default_unit,
                gram_weight = EXCLUDED.gram_weight,
                is_cannabis = EXCLUDED.is_cannabis,
                process_types = EXCLUDED.process_types,
                metrc_item_category = EXCLUDED.metrc_item_category,
                is_active = EXCLUDED.is_active,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
            RETURNING *`,
            [context.companyId, normalizedName, displayName, category, unit, gw,
             cannabis, procTypes, metrcItemCategory || null, active, sort]
        );

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
        gramWeight: row.gram_weight != null ? parseFloat(row.gram_weight as string) : null,
        isCannabis: row.is_cannabis,
        processTypes: (row.process_types as string[]) || [],
        metrcItemCategory: row.metrc_item_category,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
