import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const { vendorId, menuId, products } = body;

        if (!vendorId || !products?.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId and products[] are required' }) };
        }

        await client.query('BEGIN');

        let inserted = 0;
        for (const p of products) {
            if (!p.name?.trim()) continue;
            await client.query(`
                INSERT INTO vendor_products (company_id, vendor_id, menu_id, name, brand, category, sku, unit_size, case_size, unit_price, case_price)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                context.companyId, vendorId, menuId || null,
                p.name.trim(), p.brand || null, p.category || null, p.sku || null,
                p.unitSize || null, p.caseSize || null, p.unitPrice || null, p.casePrice || null,
            ]);
            inserted++;
        }

        await client.query('COMMIT');

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inserted }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('bulk-save-vendor-products error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
