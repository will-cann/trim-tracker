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
        if (!body.name?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Vendor name is required' }) };
        }

        const { rows } = await sql`
            INSERT INTO vendors (company_id, name, contact_name, contact_email, contact_phone, lead_time_days, order_cadence_days, notes)
            VALUES (${context.companyId}, ${body.name.trim()}, ${body.contactName || null}, ${body.contactEmail || null},
                    ${body.contactPhone || null}, ${body.leadTimeDays || 3}, ${body.orderCadenceDays || 7}, ${body.notes || null})
            RETURNING *
        `;

        const r = rows[0];
        return {
            statusCode: 201,
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
        console.error('create-vendor error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
