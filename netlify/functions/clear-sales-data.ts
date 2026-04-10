import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Destructive: wipes sales_data, store_inventory, sales_imports, and AI-generated
 * vendor_product_aliases for the current company. Manual aliases are preserved.
 * Used for resetting test data during ordering workflow development.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        await client.query('BEGIN');

        const sales = await client.query(
            'DELETE FROM sales_data WHERE company_id = $1',
            [context.companyId]
        );
        const inventory = await client.query(
            'DELETE FROM store_inventory WHERE company_id = $1',
            [context.companyId]
        );
        const imports = await client.query(
            'DELETE FROM sales_imports WHERE company_id = $1',
            [context.companyId]
        );
        // Only drop AI-generated aliases — preserve manual overrides
        const aliases = await client.query(
            `DELETE FROM vendor_product_aliases WHERE company_id = $1 AND source = 'ai'`,
            [context.companyId]
        );

        await client.query('COMMIT');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                salesDeleted: sales.rowCount || 0,
                inventoryDeleted: inventory.rowCount || 0,
                importsDeleted: imports.rowCount || 0,
                aiAliasesDeleted: aliases.rowCount || 0,
            }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('clear-sales-data error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
