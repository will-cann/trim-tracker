import { Handler } from '@netlify/functions';
import { sendManifestEmail, type ManifestAttachment } from './utils/email';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';

/**
 * Emails the generated .t3csv transfer files from the standalone manifest
 * picker (/manifest) to a user-specified address. Auth: see manifestAuth.
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

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
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
