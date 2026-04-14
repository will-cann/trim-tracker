import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

const VENDOR_TYPES = new Set(['consumables', 'biomass', 'both']);
const CHANNELS = new Set(['email', 'sms']);

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

        // Validate enums only when provided; COALESCE preserves prior value when null.
        const vendorType = body.vendorType !== undefined
            ? (VENDOR_TYPES.has(body.vendorType) ? body.vendorType : null)
            : null;
        const preferredChannel = body.preferredChannel !== undefined
            ? (CHANNELS.has(body.preferredChannel) ? body.preferredChannel : null)
            : null;
        const strainsGrown = body.strainsGrown === undefined
            ? null
            : (Array.isArray(body.strainsGrown)
                ? body.strainsGrown.map((s: unknown) => String(s)).filter(Boolean)
                : null);

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
                vendor_type = COALESCE(${vendorType}, vendor_type),
                strains_grown = COALESCE(${strainsGrown}, strains_grown),
                last_contacted_at = COALESCE(${body.lastContactedAt || null}, last_contacted_at),
                quality_notes = COALESCE(${body.qualityNotes}, quality_notes),
                preferred_units = COALESCE(${body.preferredUnits}, preferred_units),
                license_number = COALESCE(${body.licenseNumber}, license_number),
                preferred_channel = COALESCE(${preferredChannel}, preferred_channel),
                outreach_cadence_days = COALESCE(${body.outreachCadenceDays ?? null}, outreach_cadence_days),
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
                vendorType: r.vendor_type,
                strainsGrown: r.strains_grown,
                lastContactedAt: r.last_contacted_at,
                qualityNotes: r.quality_notes,
                preferredUnits: r.preferred_units,
                licenseNumber: r.license_number,
                preferredChannel: r.preferred_channel,
                outreachCadenceDays: r.outreach_cadence_days,
                nextReminderAt: r.next_reminder_at,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }),
        };
    } catch (error) {
        console.error('update-vendor error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
