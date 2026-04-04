import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        if (!body.vendorId || !body.name?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId and name are required' }) };
        }

        // If productId provided, update; else insert
        if (body.productId) {
            const { rows } = await sql`
                UPDATE vendor_products SET
                    name = ${body.name.trim()},
                    brand = ${body.brand || null},
                    category = ${body.category || null},
                    sku = ${body.sku || null},
                    unit_size = ${body.unitSize || null},
                    case_size = ${body.caseSize || null},
                    unit_price = ${body.unitPrice || null},
                    case_price = ${body.casePrice || null},
                    is_active = COALESCE(${body.isActive ?? null}, is_active),
                    updated_at = NOW()
                WHERE id = ${body.productId} AND company_id = ${context.companyId}
                RETURNING *
            `;
            if (!rows.length) return { statusCode: 404, body: JSON.stringify({ error: 'Product not found' }) };
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formatProduct(rows[0])),
            };
        }

        const { rows } = await sql`
            INSERT INTO vendor_products (company_id, vendor_id, menu_id, name, brand, category, sku, unit_size, case_size, unit_price, case_price)
            VALUES (${context.companyId}, ${body.vendorId}, ${body.menuId || null}, ${body.name.trim()},
                    ${body.brand || null}, ${body.category || null}, ${body.sku || null},
                    ${body.unitSize || null}, ${body.caseSize || null}, ${body.unitPrice || null}, ${body.casePrice || null})
            RETURNING *
        `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatProduct(rows[0])),
        };
    } catch (error) {
        console.error('upsert-vendor-product error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

function formatProduct(r: any) {
    return {
        id: r.id,
        vendorId: r.vendor_id,
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
    };
}
