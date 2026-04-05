import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

function toClient(row: any) {
    return {
        id: row.id,
        poolId: row.pool_id,
        poolSlug: row.pool_slug,
        poolLabel: row.pool_label,
        name: row.name,
        description: row.description || undefined,
        category: row.category || undefined,
        unit: row.unit,
        quantityOnHand: Number(row.quantity_on_hand),
        parLevel: row.par_level != null ? Number(row.par_level) : undefined,
        reorderQty: row.reorder_qty != null ? Number(row.reorder_qty) : undefined,
        vendorName: row.vendor_name || undefined,
        sku: row.sku || undefined,
        unitCost: row.unit_cost != null ? Number(row.unit_cost) : undefined,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { poolSlug, belowPar, category } = event.queryStringParameters || {};

        let result;
        if (poolSlug) {
            result = await sql`
                SELECT si.*, sp.slug as pool_slug, sp.label as pool_label
                FROM supply_items si
                JOIN supply_pools sp ON si.pool_id = sp.id
                WHERE si.company_id = ${context.companyId}
                  AND sp.slug = ${poolSlug}
                  AND si.is_active = true
                ORDER BY si.name ASC
            `;
        } else {
            result = await sql`
                SELECT si.*, sp.slug as pool_slug, sp.label as pool_label
                FROM supply_items si
                JOIN supply_pools sp ON si.pool_id = sp.id
                WHERE si.company_id = ${context.companyId}
                  AND si.is_active = true
                ORDER BY sp.slug, si.name ASC
            `;
        }

        let items = result.rows;

        if (belowPar === 'true') {
            items = items.filter((r: any) => r.par_level != null && Number(r.quantity_on_hand) <= Number(r.par_level));
        }
        if (category && category !== 'all') {
            items = items.filter((r: any) => r.category === category);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items.map(toClient)),
        };
    } catch (error) {
        console.error('Error fetching supply items:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch supply items' }),
        };
    }
};
