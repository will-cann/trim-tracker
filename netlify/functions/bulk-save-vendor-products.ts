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
        let { vendorId, vendorName, products } = body;

        if (!products?.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'products[] is required' }) };
        }
        if (!vendorId && !vendorName?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId or vendorName is required' }) };
        }

        await client.query('BEGIN');

        // Auto-create vendor if only vendorName provided
        if (!vendorId && vendorName?.trim()) {
            const result = await client.query(`
                INSERT INTO vendors (company_id, name)
                VALUES ($1, $2)
                RETURNING id
            `, [context.companyId, vendorName.trim()]);
            vendorId = result.rows[0].id;

            // Also create a menu record to track this upload
            await client.query(`
                INSERT INTO vendor_menus (vendor_id, company_id, file_name, status, parsed_at)
                VALUES ($1, $2, $3, 'parsed', NOW())
            `, [vendorId, context.companyId, body.fileName || 'menu upload']);
        }

        const valid = products.filter((p: any) => p.name?.trim());
        if (!valid.length) {
            await client.query('ROLLBACK');
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid products to save' }) };
        }

        // Batch insert — build multi-row VALUES clause
        const COLS = 10; // columns per row
        const values: any[] = [];
        const placeholders: string[] = [];
        valid.forEach((p: any, i: number) => {
            const offset = i * COLS;
            placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10})`);
            values.push(
                context.companyId, vendorId,
                p.name.trim(), p.brand || null, p.category || null, p.sku || null,
                p.unitSize || null, p.caseSize || null, p.unitPrice || null, p.casePrice || null,
            );
        });

        await client.query(`
            INSERT INTO vendor_products (company_id, vendor_id, name, brand, category, sku, unit_size, case_size, unit_price, case_price)
            VALUES ${placeholders.join(', ')}
        `, values);

        const inserted = valid.length;

        await client.query('COMMIT');

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId, inserted }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('bulk-save-vendor-products error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
