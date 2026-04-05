import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const { id, poolSlug, name, description, category, unit, parLevel, reorderQty, vendorName, sku, unitCost } = body;

        if (!name || !poolSlug) {
            return { statusCode: 400, body: JSON.stringify({ error: 'name and poolSlug are required' }) };
        }

        // Resolve pool_id
        const poolResult = await sql`
            SELECT id FROM supply_pools
            WHERE company_id = ${context.companyId} AND slug = ${poolSlug}
        `;
        if (poolResult.rows.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid pool' }) };
        }
        const poolId = poolResult.rows[0].id;

        let result;
        if (id) {
            // Verify ownership
            const existing = await sql`
                SELECT company_id FROM supply_items WHERE id = ${id}
            `;
            if (existing.rows.length === 0 || existing.rows[0].company_id !== context.companyId) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
            }

            result = await sql`
                UPDATE supply_items SET
                    pool_id = ${poolId},
                    name = ${name},
                    description = ${description || null},
                    category = ${category || null},
                    unit = ${unit || 'ea'},
                    par_level = ${parLevel ?? null},
                    reorder_qty = ${reorderQty ?? null},
                    vendor_name = ${vendorName || null},
                    sku = ${sku || null},
                    unit_cost = ${unitCost ?? null}
                WHERE id = ${id} AND company_id = ${context.companyId}
                RETURNING *
            `;
        } else {
            result = await sql`
                INSERT INTO supply_items (
                    company_id, pool_id, name, description, category, unit,
                    par_level, reorder_qty, vendor_name, sku, unit_cost
                ) VALUES (
                    ${context.companyId}, ${poolId}, ${name}, ${description || null},
                    ${category || null}, ${unit || 'ea'},
                    ${parLevel ?? null}, ${reorderQty ?? null},
                    ${vendorName || null}, ${sku || null}, ${unitCost ?? null}
                )
                RETURNING *
            `;
        }

        const row = result.rows[0];
        // Fetch pool info for response
        return {
            statusCode: id ? 200 : 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: row.id,
                poolId: row.pool_id,
                poolSlug,
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
            }),
        };
    } catch (error) {
        console.error('Error saving supply item:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to save supply item' }),
        };
    }
};
