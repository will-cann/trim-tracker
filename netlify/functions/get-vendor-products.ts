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

        const { rows } = vendorId
            ? await sql`
                SELECT vp.*, v.name AS vendor_name
                FROM vendor_products vp
                JOIN vendors v ON v.id = vp.vendor_id
                WHERE vp.company_id = ${context.companyId} AND vp.vendor_id = ${vendorId}
                ORDER BY vp.category, vp.name
            `
            : await sql`
                SELECT vp.*, v.name AS vendor_name
                FROM vendor_products vp
                JOIN vendors v ON v.id = vp.vendor_id
                WHERE vp.company_id = ${context.companyId} AND vp.is_active = true
                ORDER BY v.name, vp.category, vp.name
            `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows.map(r => ({
                id: r.id,
                vendorId: r.vendor_id,
                vendorName: r.vendor_name,
                menuId: r.menu_id,
                name: r.name,
                brand: r.brand,
                category: r.category,
                sku: r.sku,
                unitSize: r.unit_size,
                caseSize: r.case_size,
                unitPrice: r.unit_price ? Number(r.unit_price) : null,
                casePrice: r.case_price ? Number(r.case_price) : null,
                isActive: r.is_active,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }))),
        };
    } catch (error) {
        console.error('get-vendor-products error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
