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
                SELECT t.*,
                    (SELECT COUNT(*) FROM contact_messages m WHERE m.thread_id = t.id) AS message_count,
                    (SELECT MAX(m.received_at) FROM contact_messages m WHERE m.thread_id = t.id AND m.direction = 'inbound') AS last_inbound_at
                FROM contact_threads t
                WHERE t.company_id = ${context.companyId}
                  AND t.vendor_id = ${vendorId}
                ORDER BY t.last_activity_at DESC
            `
            : await sql`
                SELECT t.*,
                    (SELECT COUNT(*) FROM contact_messages m WHERE m.thread_id = t.id) AS message_count,
                    (SELECT MAX(m.received_at) FROM contact_messages m WHERE m.thread_id = t.id AND m.direction = 'inbound') AS last_inbound_at
                FROM contact_threads t
                WHERE t.company_id = ${context.companyId}
                ORDER BY t.last_activity_at DESC
            `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows.map(r => ({
                id: r.id,
                companyId: r.company_id,
                vendorId: r.vendor_id,
                channel: r.channel,
                subject: r.subject,
                status: r.status,
                lastActivityAt: r.last_activity_at,
                createdAt: r.created_at,
                messageCount: Number(r.message_count),
                lastInboundAt: r.last_inbound_at,
            }))),
        };
    } catch (error) {
        console.error('get-contact-threads error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
