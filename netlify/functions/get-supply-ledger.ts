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

        const { itemId, poolSlug, changeType, limit, offset } = event.queryStringParameters || {};
        const lim = Math.min(Number(limit) || 50, 200);
        const off = Number(offset) || 0;

        let result;
        if (itemId) {
            result = await sql`
                SELECT sl.*, si.name as item_name
                FROM supply_ledger sl
                JOIN supply_items si ON sl.supply_item_id = si.id
                WHERE sl.company_id = ${context.companyId}
                  AND sl.supply_item_id = ${itemId}
                ORDER BY sl.created_at DESC
                LIMIT ${lim} OFFSET ${off}
            `;
        } else if (poolSlug) {
            result = await sql`
                SELECT sl.*, si.name as item_name
                FROM supply_ledger sl
                JOIN supply_items si ON sl.supply_item_id = si.id
                JOIN supply_pools sp ON si.pool_id = sp.id
                WHERE sl.company_id = ${context.companyId}
                  AND sp.slug = ${poolSlug}
                ORDER BY sl.created_at DESC
                LIMIT ${lim} OFFSET ${off}
            `;
        } else {
            result = await sql`
                SELECT sl.*, si.name as item_name
                FROM supply_ledger sl
                JOIN supply_items si ON sl.supply_item_id = si.id
                WHERE sl.company_id = ${context.companyId}
                ORDER BY sl.created_at DESC
                LIMIT ${lim} OFFSET ${off}
            `;
        }

        let entries = result.rows;
        if (changeType && changeType !== 'all') {
            entries = entries.filter((r: any) => r.change_type === changeType);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entries.map((r: any) => ({
                id: r.id,
                supplyItemId: r.supply_item_id,
                itemName: r.item_name,
                changeType: r.change_type,
                quantityDelta: Number(r.quantity_delta),
                quantityAfter: Number(r.quantity_after),
                referenceType: r.reference_type || undefined,
                referenceId: r.reference_id || undefined,
                notes: r.notes || undefined,
                performedBy: r.performed_by || undefined,
                createdAt: r.created_at,
            }))),
        };
    } catch (error) {
        console.error('Error fetching supply ledger:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch supply ledger' }),
        };
    }
};
