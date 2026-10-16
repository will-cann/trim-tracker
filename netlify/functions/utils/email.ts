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

export interface InviteEmailArgs {
    to: string;
    inviteUrl: string;
    inviterName?: string;
    memberName?: string;
    companyName?: string;
    /** Where to sign in once the password is set, e.g. https://proper.neurocann.app */
    appUrl?: string;
    /** Set on deploys with the manifest picker; adds a short section about it. */
    pickerUrl?: string;
    /** Where replies go (APP_CONTACT_EMAIL). */
    replyTo?: string;
}

const BRAND = '#3BB570';
const INK = '#1f2937';
const MUTED = '#6b7280';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The team invite / onboarding email: subject, plain text and HTML. Pure so it
 * can be tested and previewed without SendGrid. Table layout and inline styles
 * because that is what email clients render reliably.
 */
export function renderInviteEmail(opts: InviteEmailArgs): { subject: string; text: string; html: string } {
    const { to, inviteUrl, inviterName, memberName, companyName, appUrl, pickerUrl } = opts;
    const firstName = (memberName || to.split('@')[0]).trim().split(/\s+/)[0];
    const company = companyName || 'your team';
    const intro = inviterName
        ? `${inviterName} added you to ${company} on NeuroCann.`
        : `You've been added to ${company} on NeuroCann.`;
    const subject = `You're invited to ${company} on NeuroCann`;

    const pickerPoints = [
        'Load the Apex pick list. Lines come up in vault walk order.',
        'Scan each case’s Metrc tag with your phone camera or the USB scanner.',
        'On Review, “Check packages in Metrc” compares every case’s item, quantity, parent lot and lab status with the pick list and the invoice, so a wrong package is caught before it goes on a manifest.',
        'It is read-only for now: it can check and dry-run a transfer in Metrc, but not create one.',
    ];

    const text = [
        `Hi ${firstName},`,
        '',
        intro,
        '',
        `1. Set your password: ${inviteUrl}`,
        ...(appUrl ? [`2. Sign in at ${appUrl} with ${to}.`] : []),
        '',
        ...(pickerUrl
            ? [
                  `Manifest picker: ${pickerUrl}`,
                  ...pickerPoints.map((p) => `- ${p}`),
                  '',
              ]
            : []),
        'The password link expires in 7 days. Reply to this email if anything goes wrong.',
        '',
        '-- NeuroCann',
    ].join('\n');

    const logo = appUrl ? `<img src="${esc(appUrl)}/logo.png" width="40" height="40" alt="NeuroCann" style="display:block;border:0;width:40px;height:40px;" />` : '';
    const button = (href: string, label: string) =>
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${BRAND};">` +
        `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>` +
        `</td></tr></table>`;
    const p = (inner: string, extra = '') => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK};${extra}">${inner}</p>`;

    const pickerHtml = pickerUrl
        ? `<tr><td style="padding:8px 32px 8px;">
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;background:#f9fafb;">
              <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${INK};">Manifest picker</p>
              <ul style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.55;color:${INK};">
                ${pickerPoints.map((pt) => `<li style="margin:0 0 6px;">${esc(pt)}</li>`).join('')}
              </ul>
              <a href="${esc(pickerUrl)}" style="font-size:14px;font-weight:600;color:${BRAND};text-decoration:none;">Open the picker &rarr;</a>
            </div>
          </td></tr>`
        : '';

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;">
        <tr><td style="padding:28px 32px 8px;">${logo}</td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK};">${esc(subject)}</h1>
          ${p(`Hi ${esc(firstName)},`)}
          ${p(esc(intro))}
          ${p('<strong>1.</strong> Set your password:', 'margin-bottom:10px;')}
          ${button(inviteUrl, 'Set your password')}
          <div style="height:16px;"></div>
          ${appUrl ? p(`<strong>2.</strong> Then sign in at <a href="${esc(appUrl)}" style="color:${BRAND};">${esc(appUrl.replace(/^https?:\/\//, ''))}</a> with <strong>${esc(to)}</strong>.`) : ''}
        </td></tr>
        ${pickerHtml}
        <tr><td style="padding:16px 32px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">The password link expires in 7 days. Reply to this email if anything goes wrong.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">NeuroCann</p>
    </td></tr>
  </table>
</body></html>`;

    return { subject, text, html };
}

export async function sendInviteEmail(opts: InviteEmailArgs): Promise<{ success: boolean; error?: string }> {
    if (isStubMode()) {
        console.log('[email:stub] sendInviteEmail', { to: opts.to, inviteUrl: opts.inviteUrl });
        return { success: true };
    }
    try {
        ensureInit();
    } catch {
        return { success: false, error: 'SendGrid not configured' };
    }

    const { subject, text, html } = renderInviteEmail(opts);
    try {
        await sgMail.send({
            to: opts.to,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
            subject,
            text,
            html,
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
