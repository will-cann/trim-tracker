import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Bulk-create vendor_product_aliases. Each alias is { sku, vendorProductId, source?, confidence? }.
 * Existing rows for the same (company, sku) are overwritten.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const client = await pool.connect();
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        const aliases: Array<{ sku: string; vendorProductId: string; source?: string; confidence?: number }> = body.aliases || [];

        if (!Array.isArray(aliases) || aliases.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'aliases[] is required' }) };
        }

        const valid = aliases.filter(a => a.sku?.trim() && a.vendorProductId);
        if (valid.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid aliases' }) };
        }

        await client.query('BEGIN');

        // Verify all vendorProductIds belong to this company
        const productIds = [...new Set(valid.map(a => a.vendorProductId))];
        const check = await client.query(
            `SELECT id FROM vendor_products WHERE id = ANY($1) AND company_id = $2`,
            [productIds, context.companyId]
        );
        const validIds = new Set(check.rows.map(r => r.id));
        const safe = valid.filter(a => validIds.has(a.vendorProductId));

        let inserted = 0;
        for (const a of safe) {
            await client.query(`
                INSERT INTO vendor_product_aliases (company_id, vendor_product_id, sku, source, confidence)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (company_id, sku) DO UPDATE
                SET vendor_product_id = EXCLUDED.vendor_product_id,
                    source = EXCLUDED.source,
                    confidence = EXCLUDED.confidence
            `, [
                context.companyId,
                a.vendorProductId,
                a.sku.trim(),
                a.source || 'manual',
                a.confidence ?? null,
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
        console.error('save-product-aliases error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
