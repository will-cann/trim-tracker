import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Returns POS SKUs from sales_data that don't resolve to any vendor product
 * (neither directly via vendor_products.sku nor via vendor_product_aliases),
 * sorted by total units sold in the last 60 days. Highest-volume gaps first.
 *
 * Query: ?limit=200 (default 200)
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const limit = Math.min(Number(event.queryStringParameters?.limit) || 200, 1000);

        // Aggregate recent sales by SKU, then exclude any that already match.
        // Pulls a representative product_name from store_inventory if available.
        const { rows } = await sql`
            WITH recent_sales AS (
                SELECT
                    LOWER(sd.product_sku) AS sku_lower,
                    MAX(sd.product_sku) AS sku,
                    SUM(sd.units_sold) AS units_60d,
                    SUM(sd.revenue) AS revenue_60d,
                    COUNT(DISTINCT sd.store_id) AS store_count
                FROM sales_data sd
                WHERE sd.company_id = ${context.companyId}
                  AND sd.sale_date >= CURRENT_DATE - 60
                GROUP BY LOWER(sd.product_sku)
            ),
            matched_direct AS (
                SELECT LOWER(sku) AS sku_lower
                FROM vendor_products
                WHERE company_id = ${context.companyId} AND sku IS NOT NULL
            ),
            matched_alias AS (
                SELECT LOWER(sku) AS sku_lower
                FROM vendor_product_aliases
                WHERE company_id = ${context.companyId}
            )
            SELECT
                rs.sku,
                rs.units_60d,
                rs.revenue_60d,
                rs.store_count,
                (
                    SELECT MAX(si.product_name)
                    FROM store_inventory si
                    WHERE si.company_id = ${context.companyId}
                      AND LOWER(si.product_sku) = rs.sku_lower
                ) AS product_name
            FROM recent_sales rs
            WHERE rs.sku_lower NOT IN (SELECT sku_lower FROM matched_direct)
              AND rs.sku_lower NOT IN (SELECT sku_lower FROM matched_alias)
            ORDER BY rs.units_60d DESC NULLS LAST
            LIMIT ${limit}
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unmatched: rows.map(r => ({
                    sku: r.sku,
                    productName: r.product_name,
                    units60d: Number(r.units_60d) || 0,
                    revenue60d: Number(r.revenue_60d) || 0,
                    storeCount: Number(r.store_count) || 0,
                })),
            }),
        };
    } catch (error) {
        console.error('get-unmatched-skus error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
