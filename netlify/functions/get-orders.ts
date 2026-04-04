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

        const vendorId = event.queryStringParameters?.vendorId;
        const status = event.queryStringParameters?.status;

        let query;
        if (vendorId && status) {
            query = await sql`
                SELECT po.*, v.name AS vendor_name
                FROM purchase_orders po
                JOIN vendors v ON v.id = po.vendor_id
                WHERE po.company_id = ${context.companyId} AND po.vendor_id = ${vendorId} AND po.status = ${status}
                ORDER BY po.created_at DESC
            `;
        } else if (vendorId) {
            query = await sql`
                SELECT po.*, v.name AS vendor_name
                FROM purchase_orders po
                JOIN vendors v ON v.id = po.vendor_id
                WHERE po.company_id = ${context.companyId} AND po.vendor_id = ${vendorId}
                ORDER BY po.created_at DESC
            `;
        } else if (status) {
            query = await sql`
                SELECT po.*, v.name AS vendor_name
                FROM purchase_orders po
                JOIN vendors v ON v.id = po.vendor_id
                WHERE po.company_id = ${context.companyId} AND po.status = ${status}
                ORDER BY po.created_at DESC
            `;
        } else {
            query = await sql`
                SELECT po.*, v.name AS vendor_name
                FROM purchase_orders po
                JOIN vendors v ON v.id = po.vendor_id
                WHERE po.company_id = ${context.companyId}
                ORDER BY po.created_at DESC
            `;
        }

        const orders = query.rows.map(r => ({
            id: r.id,
            vendorId: r.vendor_id,
            vendorName: r.vendor_name,
            status: r.status,
            submittedAt: r.submitted_at,
            expectedDelivery: r.expected_delivery,
            deliveredAt: r.delivered_at,
            totalUnits: r.total_units,
            totalCost: r.total_cost ? Number(r.total_cost) : 0,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orders),
        };
    } catch (error) {
        console.error('get-orders error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
