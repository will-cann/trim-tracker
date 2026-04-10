import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * Compute order suggestions for a vendor across all active stores.
 *
 * For each (store, vendor_product) pair:
 *   1. Find sales rows where sales_data.product_sku matches vendor_products.sku
 *      (case-insensitive). Restrict to the last `windowWeeks` weeks.
 *   2. velocity_per_day = total_units_sold / window_days
 *   3. trend = compare velocity in first half vs second half of window
 *   4. on_hand = store_inventory.on_hand (0 if missing)
 *   5. suggested_qty = ceil(velocity * (lead_time + cadence)) - on_hand
 *   6. status = red (out / <2 day cover) | yellow (<7 day) | green (covered) | gray (no history)
 *
 * Query: ?vendorId=...&windowWeeks=8 (default 8)
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const vendorId = event.queryStringParameters?.vendorId;
        const windowWeeks = Number(event.queryStringParameters?.windowWeeks) || 8;
        if (!vendorId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId is required' }) };
        }

        const windowDays = windowWeeks * 7;
        const halfDays = Math.floor(windowDays / 2);

        // Vendor (for lead_time + cadence)
        const { rows: vendorRows } = await sql`
            SELECT id, name, lead_time_days, order_cadence_days
            FROM vendors
            WHERE id = ${vendorId} AND company_id = ${context.companyId}
        `;
        if (vendorRows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Vendor not found' }) };
        }
        const vendor = vendorRows[0];
        const coverageDays = (vendor.lead_time_days || 0) + (vendor.order_cadence_days || 0);

        // Vendor products
        const { rows: products } = await sql`
            SELECT id, name, sku, unit_price, case_size
            FROM vendor_products
            WHERE vendor_id = ${vendorId}
              AND company_id = ${context.companyId}
              AND is_active = TRUE
        `;

        // Build SKU → vendor_product_id resolver: direct sku + aliases
        const skuToProductId = new Map<string, string>();
        for (const p of products) {
            if (p.sku) skuToProductId.set(String(p.sku).toLowerCase(), p.id);
        }
        const productIds = products.map(p => p.id);
        if (productIds.length > 0) {
            const { rows: aliasRows } = await sql`
                SELECT vendor_product_id, LOWER(sku) AS sku_lower
                FROM vendor_product_aliases
                WHERE company_id = ${context.companyId}
                  AND vendor_product_id = ANY(${productIds})
            `;
            for (const a of aliasRows) {
                skuToProductId.set(a.sku_lower, a.vendor_product_id);
            }
        }

        // Active stores
        const { rows: stores } = await sql`
            SELECT id, name FROM stores
            WHERE company_id = ${context.companyId} AND is_active = TRUE
            ORDER BY name
        `;

        // Pull all sales for the window in one query, aggregated per (store, sku, half)
        // half: 'recent' = last halfDays, 'older' = previous halfDays
        const { rows: salesRows } = await sql`
            SELECT
                store_id,
                LOWER(product_sku) AS sku_lower,
                SUM(units_sold) FILTER (WHERE sale_date >= CURRENT_DATE - ${halfDays}::int) AS recent_units,
                SUM(units_sold) FILTER (WHERE sale_date < CURRENT_DATE - ${halfDays}::int AND sale_date >= CURRENT_DATE - ${windowDays}::int) AS older_units,
                SUM(units_sold) FILTER (WHERE sale_date >= CURRENT_DATE - ${windowDays}::int) AS total_units
            FROM sales_data
            WHERE company_id = ${context.companyId}
              AND sale_date >= CURRENT_DATE - ${windowDays}::int
            GROUP BY store_id, LOWER(product_sku)
        `;

        // Index: store_id::vendor_product_id → { recent, older, total }
        // (sums across multiple POS SKUs that resolve to the same vendor product)
        const salesIndex = new Map<string, { recent: number; older: number; total: number }>();
        for (const r of salesRows) {
            const vpid = skuToProductId.get(r.sku_lower);
            if (!vpid) continue;
            const key = `${r.store_id}::${vpid}`;
            const existing = salesIndex.get(key) || { recent: 0, older: 0, total: 0 };
            existing.recent += Number(r.recent_units) || 0;
            existing.older += Number(r.older_units) || 0;
            existing.total += Number(r.total_units) || 0;
            salesIndex.set(key, existing);
        }

        // On-hand inventory aggregated per vendor_product
        const { rows: invRows } = await sql`
            SELECT store_id, LOWER(product_sku) AS sku_lower, on_hand
            FROM store_inventory
            WHERE company_id = ${context.companyId}
        `;
        const invIndex = new Map<string, number>();
        for (const r of invRows) {
            const vpid = skuToProductId.get(r.sku_lower);
            if (!vpid) continue;
            const key = `${r.store_id}::${vpid}`;
            invIndex.set(key, (invIndex.get(key) || 0) + (Number(r.on_hand) || 0));
        }

        // Build suggestions
        const suggestions: Array<{
            storeId: string;
            vendorProductId: string;
            sku: string | null;
            velocityPerDay: number;
            trend: 'accelerating' | 'stable' | 'declining' | 'unknown';
            onHand: number;
            coverageDays: number;
            suggestedQty: number;
            status: 'red' | 'yellow' | 'green' | 'gray';
            reasoning: string;
        }> = [];

        for (const product of products) {
            for (const store of stores) {
                const key = `${store.id}::${product.id}`;
                const sales = salesIndex.get(key);
                const onHand = invIndex.get(key) || 0;

                let velocity = 0;
                let trend: 'accelerating' | 'stable' | 'declining' | 'unknown' = 'unknown';
                let status: 'red' | 'yellow' | 'green' | 'gray' = 'gray';
                let suggestedQty = 0;
                let reasoning = '';

                if (!sales || sales.total === 0) {
                    reasoning = `No sales history in last ${windowWeeks} weeks`;
                } else {
                    velocity = sales.total / windowDays;
                    // Trend: recent half vs older half (per-day)
                    const recentVel = sales.recent / halfDays;
                    const olderVel = sales.older / halfDays;
                    if (olderVel === 0 && recentVel > 0) trend = 'accelerating';
                    else if (recentVel > olderVel * 1.15) trend = 'accelerating';
                    else if (recentVel < olderVel * 0.85) trend = 'declining';
                    else trend = 'stable';

                    const target = Math.ceil(velocity * coverageDays);
                    suggestedQty = Math.max(0, target - onHand);

                    const daysOfCover = velocity > 0 ? onHand / velocity : 999;
                    if (onHand === 0 || daysOfCover < 2) status = 'red';
                    else if (daysOfCover < 7) status = 'yellow';
                    else status = 'green';

                    reasoning =
                        `${velocity.toFixed(1)}/day · ${onHand} on hand (~${Math.round(daysOfCover)} days) · ` +
                        `lead ${vendor.lead_time_days}d + cadence ${vendor.order_cadence_days}d → target ${target}`;
                }

                suggestions.push({
                    storeId: store.id,
                    vendorProductId: product.id,
                    sku: product.sku || null,
                    velocityPerDay: Number(velocity.toFixed(4)),
                    trend,
                    onHand,
                    coverageDays,
                    suggestedQty,
                    status,
                    reasoning,
                });
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendorId,
                vendorName: vendor.name,
                windowWeeks,
                coverageDays,
                suggestions,
            }),
        };
    } catch (error) {
        console.error('get-order-suggestions error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
