import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Import parsed sales rows from a CSV. The frontend handles CSV parsing and
 * column mapping; this function just upserts normalized rows into sales_data
 * and refreshes store_inventory from the latest on_hand values (if provided).
 *
 * Body shape:
 *   {
 *     storeId: string,
 *     fileName?: string,
 *     rows: Array<{
 *       productSku: string,
 *       productName?: string,
 *       saleDate: string,    // YYYY-MM-DD
 *       unitsSold: number,
 *       revenue?: number,
 *       onHand?: number,     // if present on the row, latest wins for store_inventory
 *     }>
 *   }
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
        const { storeId, fileName, rows } = body;

        if (!storeId) return { statusCode: 400, body: JSON.stringify({ error: 'storeId is required' }) };
        if (!Array.isArray(rows) || rows.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'rows[] is required' }) };
        }

        await client.query('BEGIN');

        // Verify store belongs to this company
        const storeCheck = await client.query(
            `SELECT id FROM stores WHERE id = $1 AND company_id = $2`,
            [storeId, context.companyId]
        );
        if (storeCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return { statusCode: 404, body: JSON.stringify({ error: 'Store not found' }) };
        }

        const valid = rows.filter((r: any) => r.productSku && r.saleDate);

        // Batch insert sales_data — chunk to keep statement size reasonable
        const CHUNK = 500;
        let dateMin: string | null = null;
        let dateMax: string | null = null;
        const onHandMap = new Map<string, { name: string | null; onHand: number }>();

        for (let i = 0; i < valid.length; i += CHUNK) {
            const chunk = valid.slice(i, i + CHUNK);
            const placeholders: string[] = [];
            const values: any[] = [];
            chunk.forEach((r: any, idx: number) => {
                const o = idx * 6;
                placeholders.push(`($${o+1}, $${o+2}, $${o+3}, $${o+4}, $${o+5}, $${o+6})`);
                values.push(
                    context.companyId,
                    storeId,
                    String(r.productSku).trim(),
                    r.saleDate,
                    Number(r.unitsSold) || 0,
                    Number(r.revenue) || 0,
                );
                if (!dateMin || r.saleDate < dateMin) dateMin = r.saleDate;
                if (!dateMax || r.saleDate > dateMax) dateMax = r.saleDate;
                if (r.onHand != null) {
                    onHandMap.set(String(r.productSku).trim(), {
                        name: r.productName || null,
                        onHand: Number(r.onHand) || 0,
                    });
                }
            });

            await client.query(`
                INSERT INTO sales_data (company_id, store_id, product_sku, sale_date, units_sold, revenue)
                VALUES ${placeholders.join(', ')}
            `, values);
        }

        // Upsert latest on-hand snapshots
        for (const [sku, { name, onHand }] of onHandMap) {
            await client.query(`
                INSERT INTO store_inventory (company_id, store_id, product_sku, product_name, on_hand, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (store_id, product_sku) DO UPDATE
                SET on_hand = EXCLUDED.on_hand,
                    product_name = COALESCE(EXCLUDED.product_name, store_inventory.product_name),
                    updated_at = NOW()
            `, [context.companyId, storeId, sku, name, onHand]);
        }

        // Record import history
        await client.query(`
            INSERT INTO sales_imports (company_id, store_id, file_name, rows_imported, date_min, date_max, imported_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [context.companyId, storeId, fileName || null, valid.length, dateMin, dateMax, context.userId]);

        await client.query('COMMIT');

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rowsImported: valid.length,
                dateMin,
                dateMax,
                inventoryUpdated: onHandMap.size,
            }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('import-sales-csv error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
