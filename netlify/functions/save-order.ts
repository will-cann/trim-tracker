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
        if (!body.vendorId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId is required' }) };
        }

        await client.query('BEGIN');

        let orderId = body.orderId;

        if (orderId) {
            // Update existing order
            await client.query(`
                UPDATE purchase_orders SET
                    status = COALESCE($1, status),
                    expected_delivery = COALESCE($2, expected_delivery),
                    notes = COALESCE($3, notes),
                    submitted_at = CASE WHEN $1 = 'submitted' THEN NOW() ELSE submitted_at END,
                    delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
                    updated_at = NOW()
                WHERE id = $4 AND company_id = $5
            `, [body.status || null, body.expectedDelivery || null, body.notes || null, orderId, context.companyId]);
        } else {
            // Create new order
            const result = await client.query(`
                INSERT INTO purchase_orders (company_id, vendor_id, status, expected_delivery, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [context.companyId, body.vendorId, body.status || 'draft', body.expectedDelivery || null, body.notes || null]);
            orderId = result.rows[0].id;
        }

        // Upsert order lines if provided
        if (body.lines?.length) {
            // Clear existing lines for this order then re-insert
            await client.query('DELETE FROM purchase_order_lines WHERE order_id = $1', [orderId]);

            for (const line of body.lines) {
                if (!line.storeId || !line.vendorProductId) continue;
                await client.query(`
                    INSERT INTO purchase_order_lines (order_id, store_id, vendor_product_id, auto_suggested_qty, final_qty, unit_price, notes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [orderId, line.storeId, line.vendorProductId, line.autoSuggestedQty || 0, line.finalQty || 0, line.unitPrice || null, line.notes || null]);
            }
        }

        // Recompute totals
        await client.query(`
            UPDATE purchase_orders SET
                total_units = COALESCE((SELECT SUM(final_qty) FROM purchase_order_lines WHERE order_id = $1), 0),
                total_cost = COALESCE((SELECT SUM(line_total) FROM purchase_order_lines WHERE order_id = $1), 0)
            WHERE id = $1
        `, [orderId]);

        await client.query('COMMIT');

        // Return the full order with lines
        const orderResult = await client.query(`
            SELECT po.*, v.name AS vendor_name FROM purchase_orders po
            JOIN vendors v ON v.id = po.vendor_id
            WHERE po.id = $1
        `, [orderId]);
        const linesResult = await client.query(`
            SELECT pol.*, vp.name AS product_name, vp.brand, vp.sku, vp.category, s.name AS store_name
            FROM purchase_order_lines pol
            JOIN vendor_products vp ON vp.id = pol.vendor_product_id
            JOIN stores s ON s.id = pol.store_id
            WHERE pol.order_id = $1
            ORDER BY s.name, vp.name
        `, [orderId]);

        const o = orderResult.rows[0];

        return {
            statusCode: orderId === body.orderId ? 200 : 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: o.id,
                vendorId: o.vendor_id,
                vendorName: o.vendor_name,
                status: o.status,
                submittedAt: o.submitted_at,
                expectedDelivery: o.expected_delivery,
                deliveredAt: o.delivered_at,
                totalUnits: o.total_units,
                totalCost: o.total_cost ? Number(o.total_cost) : 0,
                notes: o.notes,
                createdAt: o.created_at,
                updatedAt: o.updated_at,
                lines: linesResult.rows.map(l => ({
                    id: l.id,
                    storeId: l.store_id,
                    storeName: l.store_name,
                    vendorProductId: l.vendor_product_id,
                    productName: l.product_name,
                    brand: l.brand,
                    sku: l.sku,
                    category: l.category,
                    autoSuggestedQty: l.auto_suggested_qty,
                    finalQty: l.final_qty,
                    unitPrice: l.unit_price ? Number(l.unit_price) : null,
                    lineTotal: l.line_total ? Number(l.line_total) : 0,
                    notes: l.notes,
                })),
            }),
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('save-order error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    } finally {
        client.release();
    }
};
