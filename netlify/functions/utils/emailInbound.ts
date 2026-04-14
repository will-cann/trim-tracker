/**
 * SendGrid Inbound Parse helpers.
 *
 * SendGrid POSTs multipart/form-data with fields like:
 *   from, to, subject, text, html, envelope (JSON), headers (raw string),
 *   attachments (count), attachment-info (JSON), plus one part per attachment file.
 *
 * We implement a minimal multipart parser (no external deps) and light helpers for
 * header extraction, thread-token parsing, and signature verification.
 */

import { createVerify } from 'node:crypto';

export interface ParsedMultipartField {
    name: string;
    filename?: string;
    contentType?: string;
    data: Buffer;
}

/**
 * Parse a multipart/form-data body into ordered field parts.
 * Boundary comes from the Content-Type header (e.g. "multipart/form-data; boundary=----xyz").
 */
export function parseMultipart(body: Buffer, contentType: string): ParsedMultipartField[] {
    const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    if (!match) throw new Error('No multipart boundary in Content-Type');
    const boundary = match[1] ?? match[2];
    const delim = Buffer.from(`--${boundary}`);
    const crlf = Buffer.from('\r\n');

    const parts: ParsedMultipartField[] = [];
    let pos = 0;
    // Skip to first delimiter.
    const first = body.indexOf(delim);
    if (first < 0) return parts;
    pos = first + delim.length;

    while (pos < body.length) {
        // After the delimiter we expect either "--" (end) or CRLF (next part).
        if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // closing "--"
        if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

        // Headers end at first blank line (CRLF CRLF).
        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), pos);
        if (headerEnd < 0) break;
        const headerBlock = body.slice(pos, headerEnd).toString('utf8');
        pos = headerEnd + 4;

        // Next delimiter starts with CRLF "--boundary"
        const nextDelim = body.indexOf(Buffer.concat([crlf, delim]), pos);
        if (nextDelim < 0) break;
        const data = body.slice(pos, nextDelim);
        pos = nextDelim + crlf.length + delim.length;

        // Parse Content-Disposition and Content-Type from header block.
        let name = '';
        let filename: string | undefined;
        let partContentType: string | undefined;
        for (const line of headerBlock.split(/\r\n/)) {
            const lower = line.toLowerCase();
            if (lower.startsWith('content-disposition:')) {
                const n = /name="([^"]*)"/i.exec(line);
                if (n) name = n[1];
                const f = /filename="([^"]*)"/i.exec(line);
                if (f) filename = f[1];
            } else if (lower.startsWith('content-type:')) {
                partContentType = line.slice(line.indexOf(':') + 1).trim();
            }
        }
        if (name) parts.push({ name, filename, contentType: partContentType, data });
    }
    return parts;
}

export interface InboundEmail {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    envelope: { from?: string; to?: string[] } | null;
    rawHeaders: string;
    messageIdHeader: string | null;
    inReplyToHeader: string | null;
}

/**
 * Collapse parsed parts into a normalized inbound email object.
 * Non-file text fields are decoded as UTF-8.
 */
export function normalizeInboundFields(parts: ParsedMultipartField[]): InboundEmail {
    const map = new Map<string, string>();
    for (const p of parts) {
        if (p.filename) continue; // skip attachment file parts
        if (!map.has(p.name)) map.set(p.name, p.data.toString('utf8'));
    }
    const rawHeaders = map.get('headers') ?? '';
    let envelope: InboundEmail['envelope'] = null;
    const envStr = map.get('envelope');
    if (envStr) {
        try { envelope = JSON.parse(envStr); } catch { envelope = null; }
    }
    return {
        from: map.get('from') ?? '',
        to: map.get('to') ?? '',
        subject: map.get('subject') ?? '',
        text: map.get('text') ?? '',
        html: map.get('html') ?? '',
        envelope,
        rawHeaders,
        messageIdHeader: extractHeader(rawHeaders, 'Message-ID'),
        inReplyToHeader: extractHeader(rawHeaders, 'In-Reply-To'),
    };
}

/**
 * Extract a single header value from a raw RFC 5322 header block.
 * Case-insensitive. Returns the trimmed value, or null if missing.
 * Accepts both real CRLF and literal "\\n" sequences (some curl tests emit the latter).
 */
export function extractHeader(rawHeaders: string, name: string): string | null {
    if (!rawHeaders) return null;
    const normalized = rawHeaders.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const target = name.toLowerCase();
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        if (line.slice(0, idx).trim().toLowerCase() === target) {
            return line.slice(idx + 1).trim() || null;
        }
    }
    return null;
}

/**
 * Parse headers into an object for JSONB storage.
 */
export function headersToObject(rawHeaders: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!rawHeaders) return out;
    const normalized = rawHeaders.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    for (const line of normalized.split('\n')) {
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) out[k] = v;
    }
    return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract a "thread-<uuid>" token from a to-address like
 * "thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app".
 * Handles display-name forms ("Name <addr>") and comma-separated lists (takes the first match).
 */
export function extractThreadId(toField: string): string | null {
    if (!toField) return null;
    for (const entry of toField.split(',')) {
        const angle = /<([^>]+)>/.exec(entry);
        const addr = (angle ? angle[1] : entry).trim();
        const local = addr.split('@')[0];
        if (local && local.toLowerCase().startsWith('thread-')) {
            const id = local.slice('thread-'.length);
            if (UUID_RE.test(id)) return id.toLowerCase();
        }
    }
    return null;
}

/**
 * Extract the first plain email address from a field that may contain display names,
 * multiple recipients, or angle brackets.
 */
export function extractAddress(field: string): string | null {
    if (!field) return null;
    const first = field.split(',')[0] ?? '';
    const angle = /<([^>]+)>/.exec(first);
    const addr = (angle ? angle[1] : first).trim();
    return addr.includes('@') ? addr.toLowerCase() : null;
}

/**
 * Verify a SendGrid Inbound Parse signature using the configured ECDSA public key.
 * SendGrid's signed webhook sets:
 *   X-Twilio-Email-Event-Webhook-Signature   (base64 DER ECDSA signature)
 *   X-Twilio-Email-Event-Webhook-Timestamp   (unix seconds)
 * Payload to verify = timestamp + raw-body (bytes).
 *
 * Returns true if verified, false otherwise. When publicKey is falsy the caller should
 * decide its own policy (e.g., allow in dev, log a warning).
 */
export function verifySendgridSignature(
    publicKeyPem: string,
    rawBody: Buffer,
    timestamp: string | undefined,
    signatureB64: string | undefined,
): boolean {
    if (!publicKeyPem || !timestamp || !signatureB64) return false;
    try {
        const verifier = createVerify('sha256');
        verifier.update(timestamp);
        verifier.update(rawBody);
        verifier.end();
        return verifier.verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
    } catch {
        return false;
    }
}

export type ThreadMatch =
    | { kind: 'thread_token'; threadId: string; vendorId: string | null; companyId: string | null }
    | { kind: 'in_reply_to'; threadId: string; vendorId: string | null; companyId: string | null }
    | { kind: 'vendor_email'; threadId: null; vendorId: string; companyId: string }
    | { kind: 'unmatched'; threadId: null; vendorId: null; companyId: null };

export interface ThreadLookupDeps {
    findThreadById: (threadId: string) => Promise<{ id: string; vendorId: string | null; companyId: string | null } | null>;
    findMessageByHeader: (inReplyTo: string) => Promise<{ threadId: string; vendorId: string | null; companyId: string | null } | null>;
    findVendorByEmail: (email: string) => Promise<{ vendorId: string; companyId: string } | null>;
}

/**
 * Resolve an inbound email to a thread / vendor per the matching rules:
 *   1. thread-<uuid> token in "to" address
 *   2. In-Reply-To header -> contact_messages.message_id_header -> thread
 *   3. sender email -> vendors.contact_email (newest match across tenants; see TODO)
 *   4. unmatched -> caller should insert with vendor_id null, mark thread status 'unmatched'
 */
export async function resolveThreadMatch(
    email: InboundEmail,
    deps: ThreadLookupDeps,
): Promise<ThreadMatch> {
    const envTo = Array.isArray(email.envelope?.to) && email.envelope!.to!.length > 0
        ? email.envelope!.to!.join(',')
        : email.to;
    const threadToken = extractThreadId(envTo);
    if (threadToken) {
        const row = await deps.findThreadById(threadToken);
        if (row) return { kind: 'thread_token', threadId: row.id, vendorId: row.vendorId, companyId: row.companyId };
    }

    if (email.inReplyToHeader) {
        const cleaned = email.inReplyToHeader.replace(/[<>]/g, '').trim();
        if (cleaned) {
            const msg = await deps.findMessageByHeader(cleaned);
            if (msg) return { kind: 'in_reply_to', threadId: msg.threadId, vendorId: msg.vendorId, companyId: msg.companyId };
        }
    }

    const fromAddr = extractAddress(email.envelope?.from ?? email.from);
    if (fromAddr) {
        // TODO(multi-tenant): when the same vendor email exists across companies, we currently
        // pick the newest vendor row. A proper fix requires routing on the thread token only or
        // scoping replies domains per tenant.
        const vendor = await deps.findVendorByEmail(fromAddr);
        if (vendor) return { kind: 'vendor_email', threadId: null, vendorId: vendor.vendorId, companyId: vendor.companyId };
    }

    return { kind: 'unmatched', threadId: null, vendorId: null, companyId: null };
}
