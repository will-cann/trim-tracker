import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const orderId = event.queryStringParameters?.orderId;
        if (!orderId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'orderId is required' }) };
        }

        const { rows: orderRows } = await sql`
            SELECT po.*, v.name AS vendor_name
            FROM purchase_orders po
            JOIN vendors v ON v.id = po.vendor_id
            WHERE po.id = ${orderId} AND po.company_id = ${context.companyId}
        `;

        if (!orderRows.length) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
        }

        const { rows: lineRows } = await sql`
            SELECT pol.*, vp.name AS product_name, vp.brand, vp.sku, vp.category,
                   vp.unit_size, vp.case_size, s.name AS store_name
            FROM purchase_order_lines pol
            JOIN vendor_products vp ON vp.id = pol.vendor_product_id
            JOIN stores s ON s.id = pol.store_id
            WHERE pol.order_id = ${orderId}
            ORDER BY s.name, vp.name
        `;

        const o = orderRows[0];

        return {
            statusCode: 200,
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
                lines: lineRows.map(l => ({
                    id: l.id,
                    storeId: l.store_id,
                    storeName: l.store_name,
                    vendorProductId: l.vendor_product_id,
                    productName: l.product_name,
                    brand: l.brand,
                    sku: l.sku,
                    category: l.category,
                    unitSize: l.unit_size,
                    caseSize: l.case_size,
                    autoSuggestedQty: l.auto_suggested_qty,
                    finalQty: l.final_qty,
                    unitPrice: l.unit_price ? Number(l.unit_price) : null,
                    lineTotal: l.line_total ? Number(l.line_total) : 0,
                    notes: l.notes,
                })),
            }),
        };
    } catch (error) {
        console.error('get-order-detail error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
