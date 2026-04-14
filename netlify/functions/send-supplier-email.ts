import { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';
import { sendSupplierEmail } from './utils/email';

interface SendSupplierEmailBody {
    vendorId?: string;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    threadId?: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

        const body: SendSupplierEmailBody = JSON.parse(event.body || '{}');
        const { vendorId, subject, bodyText, bodyHtml } = body;
        let { threadId } = body;

        if (!vendorId || !subject?.trim() || !bodyText?.trim()) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'vendorId, subject, and bodyText are required' }),
            };
        }

        const { rows: vendorRows } = await sql`
            SELECT id, name, contact_email
            FROM vendors
            WHERE id = ${vendorId} AND company_id = ${context.companyId}
            LIMIT 1
        `;
        const vendor = vendorRows[0];
        if (!vendor) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Vendor not found' }) };
        }
        if (!vendor.contact_email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Vendor has no contact email' }) };
        }

        if (threadId) {
            const { rows: threadRows } = await sql`
                SELECT id FROM contact_threads
                WHERE id = ${threadId} AND company_id = ${context.companyId}
                LIMIT 1
            `;
            if (threadRows.length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Thread not found' }) };
            }
        } else {
            const { rows: newThread } = await sql`
                INSERT INTO contact_threads (
                    id, company_id, vendor_id, channel, subject, status, last_activity_at, created_at
                )
                VALUES (
                    gen_random_uuid(), ${context.companyId}, ${vendorId},
                    'email', ${subject.trim()}, 'open', NOW(), NOW()
                )
                RETURNING id
            `;
            threadId = newThread[0].id as string;
        }

        const messageIdHeader = `<msg-${randomUUID()}@neurocann.app>`;

        const sendResult = await sendSupplierEmail({
            to: vendor.contact_email,
            subject: subject.trim(),
            bodyText,
            bodyHtml,
            threadId: threadId as string,
            messageIdHeader,
        });

        // Record every attempt — even failures — so the outbox has an audit trail.
        const errorNote = sendResult.success ? null : (sendResult.error || 'unknown send error');
        const sentAt = sendResult.success ? new Date().toISOString() : null;

        const { rows: msgRows } = await sql`
            INSERT INTO contact_messages (
                id, company_id, thread_id, channel, direction,
                from_address, to_address, subject,
                body_text, body_html, message_id_header,
                error_note, sent_at, created_at
            )
            VALUES (
                gen_random_uuid(), ${context.companyId}, ${threadId}, 'email', 'outbound',
                ${sendResult.fromAddress}, ${vendor.contact_email}, ${subject.trim()},
                ${bodyText}, ${sendResult.bodyHtml}, ${messageIdHeader},
                ${errorNote}, ${sentAt}, NOW()
            )
            RETURNING id
        `;

        if (sendResult.success) {
            await Promise.all([
                sql`
                    UPDATE contact_threads
                    SET last_activity_at = NOW()
                    WHERE id = ${threadId} AND company_id = ${context.companyId}
                `,
                sql`
                    UPDATE vendors
                    SET last_contacted_at = NOW()
                    WHERE id = ${vendorId} AND company_id = ${context.companyId}
                `,
            ]);
        }

        if (!sendResult.success) {
            return {
                statusCode: 502,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Email send failed',
                    detail: sendResult.error,
                    threadId,
                    messageId: msgRows[0].id,
                }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                threadId,
                messageId: msgRows[0].id,
                fromAddress: sendResult.fromAddress,
                replyToAddress: sendResult.replyToAddress,
                messageIdHeader,
            }),
        };
    } catch (error) {
        console.error('send-supplier-email error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
