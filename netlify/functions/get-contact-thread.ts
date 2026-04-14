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

        const id = event.queryStringParameters?.id;
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };

        const { rows: threadRows } = await sql`
            SELECT * FROM contact_threads
            WHERE id = ${id} AND company_id = ${context.companyId}
            LIMIT 1
        `;
        if (threadRows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Thread not found' }) };
        }
        const t = threadRows[0];

        const { rows: msgRows } = await sql`
            SELECT * FROM contact_messages
            WHERE thread_id = ${id} AND company_id = ${context.companyId}
            ORDER BY created_at ASC
        `;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: t.id,
                companyId: t.company_id,
                vendorId: t.vendor_id,
                channel: t.channel,
                subject: t.subject,
                status: t.status,
                lastActivityAt: t.last_activity_at,
                createdAt: t.created_at,
                messages: msgRows.map(m => ({
                    id: m.id,
                    threadId: m.thread_id,
                    companyId: m.company_id,
                    channel: m.channel,
                    direction: m.direction,
                    fromAddress: m.from_address,
                    toAddress: m.to_address,
                    subject: m.subject,
                    bodyText: m.body_text,
                    bodyHtml: m.body_html,
                    rawHeaders: m.raw_headers,
                    messageIdHeader: m.message_id_header,
                    inReplyToHeader: m.in_reply_to_header,
                    providerEventId: m.provider_event_id,
                    sentAt: m.sent_at,
                    receivedAt: m.received_at,
                    parsedAs: m.parsed_as,
                    createdAt: m.created_at,
                })),
            }),
        };
    } catch (error) {
        console.error('get-contact-thread error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
