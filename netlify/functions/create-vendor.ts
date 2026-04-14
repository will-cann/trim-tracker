import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

const VENDOR_TYPES = new Set(['consumables', 'biomass', 'both']);
const CHANNELS = new Set(['email', 'sms']);

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

        const vendorType = VENDOR_TYPES.has(body.vendorType) ? body.vendorType : 'consumables';
        const preferredChannel = CHANNELS.has(body.preferredChannel) ? body.preferredChannel : 'email';
        const strainsGrown = Array.isArray(body.strainsGrown) && body.strainsGrown.length
            ? body.strainsGrown.map((s: unknown) => String(s)).filter(Boolean)
            : null;

        const { rows } = await sql`
            INSERT INTO vendors (
                company_id, name, contact_name, contact_email, contact_phone,
                lead_time_days, order_cadence_days, notes,
                vendor_type, strains_grown, last_contacted_at, quality_notes,
                preferred_units, license_number, preferred_channel
            )
            VALUES (
                ${context.companyId}, ${body.name.trim()}, ${body.contactName || null},
                ${body.contactEmail || null}, ${body.contactPhone || null},
                ${body.leadTimeDays || 3}, ${body.orderCadenceDays || 7}, ${body.notes || null},
                ${vendorType}, ${strainsGrown}, ${body.lastContactedAt || null},
                ${body.qualityNotes || null}, ${body.preferredUnits || null},
                ${body.licenseNumber || null}, ${preferredChannel}
            )
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
                vendorType: r.vendor_type,
                strainsGrown: r.strains_grown,
                lastContactedAt: r.last_contacted_at,
                qualityNotes: r.quality_notes,
                preferredUnits: r.preferred_units,
                licenseNumber: r.license_number,
                preferredChannel: r.preferred_channel,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }),
        };
    } catch (error) {
        console.error('create-vendor error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
