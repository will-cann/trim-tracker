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

        const { itemId } = JSON.parse(event.body || '{}');
        if (!itemId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'itemId is required' }) };
        }

        // Check if item has ledger entries — soft-delete if so, hard-delete if not
        const ledgerCheck = await sql`
            SELECT COUNT(*)::int as count FROM supply_ledger WHERE supply_item_id = ${itemId}
        `;

        if (ledgerCheck.rows[0].count > 0) {
            const result = await sql`
                UPDATE supply_items SET is_active = false
                WHERE id = ${itemId} AND company_id = ${context.companyId}
                RETURNING id
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted: true, soft: true, id: itemId }),
            };
        } else {
            const result = await sql`
                DELETE FROM supply_items
                WHERE id = ${itemId} AND company_id = ${context.companyId}
                RETURNING id
            `;
            if (result.rows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleted: true, soft: false, id: itemId }),
            };
        }
    } catch (error) {
        console.error('Error deleting supply item:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete supply item' }),
        };
    }
};
