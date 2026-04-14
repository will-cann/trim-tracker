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

    const { to, inviteUrl, inviterName, memberName, companyName } = opts;
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
                `Accept your invite: ${inviteUrl}`,
                '',
                'This link expires in 7 days.',
                '',
                '-- neurocann',
            ].join('\n'),
        });
        return { success: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'SendGrid send failed';
        if (err && typeof err === 'object' && 'response' in err) {
            const sgErr = err as { response?: { body?: unknown } };
            console.error('SendGrid invite email failed:', message, JSON.stringify(sgErr.response?.body));
        } else {
            console.error('SendGrid invite email failed:', message);
        }
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
        const message = err instanceof Error ? err.message : 'SendGrid send failed';
        if (err && typeof err === 'object' && 'response' in err) {
            const sgErr = err as { response?: { body?: unknown } };
            console.error('SendGrid supplier email failed:', message, JSON.stringify(sgErr.response?.body));
        } else {
            console.error('SendGrid supplier email failed:', message);
        }
        return { success: false, error: message, fromAddress: OUTREACH_FROM, replyToAddress, bodyHtml };
    }
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
