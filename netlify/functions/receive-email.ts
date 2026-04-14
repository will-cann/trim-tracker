import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import {
    parseMultipart,
    normalizeInboundFields,
    resolveThreadMatch,
    headersToObject,
    verifySendgridSignature,
    type ThreadMatch,
} from './utils/emailInbound';

/**
 * SendGrid Inbound Parse webhook.
 *
 * Route: /.netlify/functions/receive-email
 * Auth:  No user JWT. If SENDGRID_WEBHOOK_PUBLIC_KEY is set, verify the ECDSA signature;
 *        otherwise log a warning and accept (dev + pre-signature prod).
 *
 * Must return 200 quickly — SendGrid retries aggressively on non-2xx. Any downstream
 * failure (including Unit 5's menu parser) is best-effort and swallowed.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Netlify base64-encodes binary bodies; multipart is treated as binary.
    const rawBody = event.body
        ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
        : Buffer.alloc(0);

    // Optional signature verification.
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    if (publicKey) {
        const sig = event.headers['x-twilio-email-event-webhook-signature']
            ?? event.headers['X-Twilio-Email-Event-Webhook-Signature'];
        const ts = event.headers['x-twilio-email-event-webhook-timestamp']
            ?? event.headers['X-Twilio-Email-Event-Webhook-Timestamp'];
        if (!verifySendgridSignature(publicKey, rawBody, ts, sig)) {
            console.warn('receive-email: signature verification failed');
            return { statusCode: 401, body: 'Invalid signature' };
        }
    } else {
        console.warn('receive-email: SENDGRID_WEBHOOK_PUBLIC_KEY not set — skipping signature verification');
    }

    const contentType = event.headers['content-type'] ?? event.headers['Content-Type'] ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
        return { statusCode: 400, body: 'Expected multipart/form-data' };
    }

    let email;
    try {
        const parts = parseMultipart(rawBody, contentType);
        email = normalizeInboundFields(parts);
    } catch (err) {
        console.error('receive-email: multipart parse error', err);
        return { statusCode: 400, body: 'Malformed multipart body' };
    }

    let match: ThreadMatch;
    try {
        match = await resolveThreadMatch(email, {
            findThreadById: async (id) => {
                const { rows } = await sql`SELECT id, vendor_id, company_id FROM contact_threads WHERE id = ${id} LIMIT 1`;
                return rows[0] ? { id: rows[0].id, vendorId: rows[0].vendor_id, companyId: rows[0].company_id } : null;
            },
            findMessageByHeader: async (header) => {
                const { rows } = await sql`
                    SELECT m.thread_id, m.vendor_id, t.company_id
                    FROM contact_messages m
                    JOIN contact_threads t ON t.id = m.thread_id
                    WHERE m.message_id_header = ${header}
                    LIMIT 1
                `;
                return rows[0]
                    ? { threadId: rows[0].thread_id, vendorId: rows[0].vendor_id, companyId: rows[0].company_id }
                    : null;
            },
            findVendorByEmail: async (addr) => {
                const { rows } = await sql`
                    SELECT id, company_id
                    FROM vendors
                    WHERE LOWER(contact_email) = ${addr}
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                return rows[0] ? { vendorId: rows[0].id, companyId: rows[0].company_id } : null;
            },
        });
    } catch (err) {
        console.error('receive-email: thread match error', err);
        return { statusCode: 500, body: 'Thread resolution failed' };
    }

    // Resolve / create thread row.
    let threadId: string | null = null;
    let vendorId: string | null = null;
    let companyId: string | null = null;

    try {
        if (match.kind === 'thread_token' || match.kind === 'in_reply_to') {
            threadId = match.threadId;
            vendorId = match.vendorId;
            companyId = match.companyId;
        } else if (match.kind === 'vendor_email') {
            vendorId = match.vendorId;
            companyId = match.companyId;
            const { rows } = await sql`
                INSERT INTO contact_threads (company_id, vendor_id, subject, status, last_activity_at)
                VALUES (${companyId}, ${vendorId}, ${email.subject || null}, 'active', NOW())
                RETURNING id
            `;
            threadId = rows[0].id;
        } else {
            // Unmatched — create an orphan thread for admin triage. company_id is NULL-aware;
            // if contact_threads requires a company_id NOT NULL, Unit 3's migration should
            // accept an "unmatched" sentinel or make this nullable. We pass NULL and let the DB decide.
            const { rows } = await sql`
                INSERT INTO contact_threads (company_id, vendor_id, subject, status, last_activity_at)
                VALUES (NULL, NULL, ${email.subject || null}, 'unmatched', NOW())
                RETURNING id
            `;
            threadId = rows[0].id;
        }
    } catch (err) {
        console.error('receive-email: thread upsert error', err);
        return { statusCode: 500, body: 'Thread persistence failed' };
    }

    // Insert inbound message row.
    let messageId: string | null = null;
    try {
        const headersJson = headersToObject(email.rawHeaders);
        const { rows } = await sql`
            INSERT INTO contact_messages (
                thread_id, vendor_id, company_id, channel, direction,
                from_address, to_address, subject, body_text, body_html,
                raw_headers, message_id_header, in_reply_to_header, received_at, parsed_as
            ) VALUES (
                ${threadId}, ${vendorId}, ${companyId}, 'email', 'inbound',
                ${email.from || null}, ${email.to || null}, ${email.subject || null},
                ${email.text || null}, ${email.html || null},
                ${JSON.stringify(headersJson)}::jsonb,
                ${email.messageIdHeader}, ${email.inReplyToHeader},
                NOW(), NULL
            )
            RETURNING id
        `;
        messageId = rows[0].id;

        await sql`UPDATE contact_threads SET last_activity_at = NOW() WHERE id = ${threadId}`;
    } catch (err) {
        console.error('receive-email: message insert error', err);
        return { statusCode: 500, body: 'Message persistence failed' };
    }

    // Best-effort hand-off to Unit 5's menu parser. Never fail the webhook on errors.
    if (messageId) {
        const base = process.env.URL ?? process.env.DEPLOY_URL ?? 'http://localhost:8888';
        // Fire and forget — await with a short timeout guard.
        void fetch(`${base}/.netlify/functions/parse-inbound-menu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId }),
        }).catch((err) => {
            console.warn('receive-email: parse-inbound-menu dispatch failed (non-fatal)', err?.message ?? err);
        });
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, threadId, messageId, match: match.kind }),
    };
};
