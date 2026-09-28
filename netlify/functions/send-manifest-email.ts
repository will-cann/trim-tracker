import { Handler } from '@netlify/functions';
import { timingSafeEqual } from 'crypto';
import { resolveContext } from './utils/auth';
import { sendManifestEmail, type ManifestAttachment } from './utils/email';

/**
 * Emails the generated .t3csv transfer files from the standalone manifest
 * picker (/manifest) to a user-specified address.
 *
 * The picker has no Auth0 session, so this endpoint accepts either:
 *   - a normal Bearer token (resolveContext), or
 *   - the shared access code from MANIFEST_ACCESS_CODE in `x-manifest-key`.
 * If MANIFEST_ACCESS_CODE is unset and DEV_BYPASS_AUTH is not on, the
 * endpoint is disabled — never an open relay.
 */

const MAX_FILES = 5;
const MAX_FILE_CHARS = 256 * 1024;
const MAX_NOTE_CHARS = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILENAME_RE = /^[A-Za-z0-9._-]{1,120}\.(t3csv|csv)$/;

interface Body {
    to?: string;
    subject?: string;
    note?: string;
    files?: ManifestAttachment[];
}

function json(statusCode: number, payload: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

function codeMatches(provided: string | undefined, expected: string | undefined): boolean {
    if (!provided || !expected) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function authorize(headers: Record<string, string | undefined>): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const bearer = headers.authorization;
    if (bearer) {
        const ctx = await resolveContext(bearer);
        if (ctx) return { ok: true };
    }

    const expected = process.env.MANIFEST_ACCESS_CODE;
    if (!expected) {
        if (process.env.DEV_BYPASS_AUTH === 'true') return { ok: true };
        return { ok: false, status: 403, error: 'Email export is not enabled on this deploy (MANIFEST_ACCESS_CODE unset).' };
    }
    if (codeMatches(headers['x-manifest-key'], expected)) return { ok: true };
    return { ok: false, status: 401, error: 'Access code is missing or wrong. Set it under Settings → Email export.' };
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorize(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });

        const body: Body = JSON.parse(event.body || '{}');
        const to = body.to?.trim() ?? '';
        const files = Array.isArray(body.files) ? body.files : [];

        if (!EMAIL_RE.test(to)) return json(400, { error: 'Enter a valid email address.' });
        if (files.length === 0) return json(400, { error: 'Nothing to send — no transfer files.' });
        if (files.length > MAX_FILES) return json(400, { error: `Too many files (max ${MAX_FILES}).` });
        for (const f of files) {
            if (!f || typeof f.filename !== 'string' || typeof f.content !== 'string') {
                return json(400, { error: 'Each file needs a filename and content.' });
            }
            if (!FILENAME_RE.test(f.filename)) return json(400, { error: `Bad filename: ${f.filename}` });
            if (f.content.length > MAX_FILE_CHARS) return json(400, { error: `${f.filename} is too large.` });
        }

        const subject = (body.subject?.trim() || 'Metrc transfer files').slice(0, 200);
        const note = (body.note ?? '').slice(0, MAX_NOTE_CHARS);
        const bodyText = [
            note.trim(),
            '',
            'Attached:',
            ...files.map(f => `  - ${f.filename}`),
            '',
            'Open Metrc → Transfers → New Transfer, then use T3\'s "Autofill T3 CSV" with each file. One file per origin license.',
            '',
            '-- neurocann manifest picker',
        ].join('\n').trimStart();

        const result = await sendManifestEmail({ to, subject, bodyText, attachments: files });
        if (!result.success) {
            return json(502, { error: 'Email send failed', detail: result.error });
        }
        return json(200, { sent: true, to, from: result.fromAddress, files: files.map(f => f.filename) });
    } catch (error) {
        console.error('send-manifest-email error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
