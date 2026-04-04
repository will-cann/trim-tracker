import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body = JSON.parse(event.body || '{}');
        if (!body.vendorId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'vendorId is required' }) };
        }

        const { rows } = await sql`
            UPDATE vendors SET
                name = COALESCE(${body.name || null}, name),
                contact_name = COALESCE(${body.contactName}, contact_name),
                contact_email = COALESCE(${body.contactEmail}, contact_email),
                contact_phone = COALESCE(${body.contactPhone}, contact_phone),
                lead_time_days = COALESCE(${body.leadTimeDays || null}, lead_time_days),
                order_cadence_days = COALESCE(${body.orderCadenceDays || null}, order_cadence_days),
                notes = COALESCE(${body.notes}, notes),
                is_active = COALESCE(${body.isActive ?? null}, is_active),
                updated_at = NOW()
            WHERE id = ${body.vendorId} AND company_id = ${context.companyId}
            RETURNING *
        `;

        if (!rows.length) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Vendor not found' }) };
        }

        const r = rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: r.id,
                name: r.name,
                contactName: r.contact_name,
                contactEmail: r.contact_email,
                contactPhone: r.contact_phone,
                leadTimeDays: r.lead_time_days,
                orderCadenceDays: r.order_cadence_days,
                notes: r.notes,
                isActive: r.is_active,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }),
        };
    } catch (error) {
        console.error('update-vendor error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
