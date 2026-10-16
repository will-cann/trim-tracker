import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'invites@neurocann.app';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'neurocann';
const OUTREACH_FROM = process.env.SENDGRID_OUTREACH_FROM || 'outreach@neurocann.app';
const INBOUND_DOMAIN = process.env.SENDGRID_INBOUND_DOMAIN || 'replies.neurocann.app';

let initialized = false;

function isStubMode(): boolean {
    return !SENDGRID_API_KEY || SENDGRID_API_KEY === 'stub';
}

function ensureInit() {
    if (initialized) return;
    if (isStubMode()) return;
    sgMail.setApiKey(SENDGRID_API_KEY as string);
    initialized = true;
}

// ── Invite email ────────────────────────────────────────────────────────────

export async function sendInviteEmail(opts: {
    to: string;
    inviteUrl: string;
    inviterName?: string;
    memberName?: string;
    companyName?: string;
    /** Where to sign in once the password is set, e.g. https://proper.neurocann.app */
    appUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
    if (isStubMode()) {
        console.log('[email:stub] sendInviteEmail', { to: opts.to, inviteUrl: opts.inviteUrl });
        return { success: true };
    }
    try {
        ensureInit();
    } catch {
        return { success: false, error: 'SendGrid not configured' };
    }

    const { to, inviteUrl, inviterName, memberName, companyName, appUrl } = opts;
    const greeting = memberName || to.split('@')[0];
    const invitedBy = inviterName ? ` ${inviterName} has` : ' You have been';
    const company = companyName || 'your team';

    try {
        await sgMail.send({
            to,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            subject: `You're invited to join ${company} on neurocann`,
            text: [
                `Hey ${greeting},`,
                '',
                `${invitedBy} invited you to join ${company} on neurocann.`,
                '',
                `Set your password: ${inviteUrl}`,
                '',
                ...(appUrl ? [`Then sign in at ${appUrl} with ${to}.`, ''] : []),
                'This link expires in 7 days.',
                '',
                '-- neurocann',
            ].join('\n'),
        });
        return { success: true };
    } catch (err: unknown) {
        const message = sendGridErrorMessage(err);
        console.error('SendGrid invite email failed:', message, sendGridErrorBody(err));
        return { success: false, error: message };
    }
}

// ── Supplier outreach email ─────────────────────────────────────────────────

export interface SupplierEmailArgs {
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    threadId: string;
    messageIdHeader: string;
    replyToAddress?: string;
}

export interface SupplierEmailResult {
    success: boolean;
    error?: string;
    fromAddress: string;
    replyToAddress: string;
    bodyHtml: string;
}

/**
 * Send a plain, human-authored-looking outreach email to a supplier/vendor.
 *
 * Unlike sendInviteEmail, this has NO neurocann branding, no logo, and no
 * colored CTA button — supplier emails should read like a human wrote them.
 *
 * Reply-To is thread-tokenized so the inbound parse webhook can route
 * replies back to the right contact_threads row without relying on
 * In-Reply-To / References headers alone.
 */
export async function sendSupplierEmail(args: SupplierEmailArgs): Promise<SupplierEmailResult> {
    const { to, subject, bodyText, threadId, messageIdHeader } = args;
    const replyToAddress = args.replyToAddress || `thread-${threadId}@${INBOUND_DOMAIN}`;
    const bodyHtml = args.bodyHtml ?? textToSimpleHtml(bodyText);

    if (isStubMode()) {
        console.log('[email:stub] sendSupplierEmail', {
            to, subject, threadId, messageIdHeader, replyToAddress,
            bodyTextPreview: bodyText.slice(0, 120),
        });
        return { success: true, fromAddress: OUTREACH_FROM, replyToAddress, bodyHtml };
    }

    try {
        ensureInit();
    } catch {
        return { success: false, error: 'SendGrid not configured', fromAddress: OUTREACH_FROM, replyToAddress, bodyHtml };
    }

    try {
        await sgMail.send({
            to,
            from: OUTREACH_FROM,
            replyTo: replyToAddress,
            subject,
            text: bodyText,
            html: bodyHtml,
            headers: {
                'Message-ID': messageIdHeader,
            },
        });
        return { success: true, fromAddress: OUTREACH_FROM, replyToAddress, bodyHtml };
    } catch (err: unknown) {
        const message = sendGridErrorMessage(err);
        console.error('SendGrid supplier email failed:', message, sendGridErrorBody(err));
        return { success: false, error: message, fromAddress: OUTREACH_FROM, replyToAddress, bodyHtml };
    }
}

// ── Manifest picker export email ────────────────────────────────────────────

export interface ManifestAttachment {
    filename: string;
    /** UTF-8 text content (CSV). Base64-encoded before handing to SendGrid. */
    content: string;
}

export async function sendManifestEmail(opts: {
    to: string;
    subject: string;
    bodyText: string;
    attachments: ManifestAttachment[];
}): Promise<{ success: boolean; error?: string; fromAddress: string }> {
    const { to, subject, bodyText, attachments } = opts;

    if (isStubMode()) {
        console.log('[email:stub] sendManifestEmail', {
            to, subject, attachments: attachments.map(a => `${a.filename} (${a.content.length} chars)`),
        });
        return { success: true, fromAddress: FROM_EMAIL };
    }

    try {
        ensureInit();
    } catch {
        return { success: false, error: 'SendGrid not configured', fromAddress: FROM_EMAIL };
    }

    try {
        await sgMail.send({
            to,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            subject,
            text: bodyText,
            attachments: attachments.map(a => ({
                filename: a.filename,
                content: Buffer.from(a.content, 'utf8').toString('base64'),
                type: 'text/csv',
                disposition: 'attachment',
            })),
        });
        return { success: true, fromAddress: FROM_EMAIL };
    } catch (err: unknown) {
        const message = sendGridErrorMessage(err);
        console.error('SendGrid manifest email failed:', message, sendGridErrorBody(err));
        return { success: false, error: message, fromAddress: FROM_EMAIL };
    }
}

/**
 * SendGrid's own reason for a rejected send. The client error's message is just
 * the HTTP status text ("Forbidden", "Unauthorized"); the useful part, e.g.
 * "The from address does not match a verified Sender Identity", is in
 * response.body.errors[].message.
 */
export function sendGridErrorMessage(err: unknown): string {
    const base = err instanceof Error ? err.message : 'SendGrid send failed';
    const body = (err as { response?: { body?: { errors?: Array<{ message?: string; field?: string | null }> } } } | null)?.response?.body;
    const reasons = (body?.errors ?? [])
        .map(e => (e.field ? `${e.message} (${e.field})` : e.message))
        .filter((m): m is string => !!m);
    return reasons.length ? `${base}: ${reasons.join('; ')}` : base;
}

function sendGridErrorBody(err: unknown): string {
    const body = (err as { response?: { body?: unknown } } | null)?.response?.body;
    return body === undefined ? '' : JSON.stringify(body);
}

/**
 * Minimal text→HTML converter for supplier emails. Preserves paragraph
 * breaks and escapes entities, but adds NO styling, colors, or branding —
 * the goal is "this reads like a human typed it in Gmail".
 */
function textToSimpleHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const paragraphs = escaped.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return '';
    return paragraphs
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');
}
