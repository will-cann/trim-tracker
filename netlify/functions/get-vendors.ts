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

        const { rows } = await sql`
            SELECT v.*,
                   (SELECT COUNT(*) FROM vendor_products vp WHERE vp.vendor_id = v.id AND vp.is_active) AS product_count,
                   (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id) AS order_count
            FROM vendors v
            WHERE v.company_id = ${context.companyId}
            ORDER BY v.name
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows.map(r => ({
                id: r.id,
                name: r.name,
                contactName: r.contact_name,
                contactEmail: r.contact_email,
                contactPhone: r.contact_phone,
                leadTimeDays: r.lead_time_days,
                orderCadenceDays: r.order_cadence_days,
                notes: r.notes,
                isActive: r.is_active,
                vendorType: r.vendor_type,
                strainsGrown: r.strains_grown,
                lastContactedAt: r.last_contacted_at,
                qualityNotes: r.quality_notes,
                preferredUnits: r.preferred_units,
                licenseNumber: r.license_number,
                preferredChannel: r.preferred_channel,
                productCount: Number(r.product_count),
                orderCount: Number(r.order_count),
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }))),
        };
    } catch (error) {
        console.error('get-vendors error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
