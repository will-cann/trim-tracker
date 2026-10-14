import sgMail from '@sendgrid/mail';
import { config } from './config';

/**
 * SendGrid sender. With SENDGRID_API_KEY unset or 'stub', emails are logged
 * instead of sent so local dev and tests need no credentials (same convention
 * as netlify/functions/utils/email.ts in the product app).
 */

export interface OutboundEmail {
    to: string;
    subject: string;
    text: string;
    replyTo?: { email: string; name?: string } | string;
    fromName?: string;
}

export interface SendResult {
    success: boolean;
    stubbed?: boolean;
    error?: string;
}

let initializedKey: string | null = null;

export async function sendEmail(msg: OutboundEmail): Promise<SendResult> {
    const key = config.sendgridApiKey;
    if (!key || key === 'stub') {
        console.log('[email:stub]', { to: msg.to, subject: msg.subject, preview: msg.text.slice(0, 160) });
        return { success: true, stubbed: true };
    }
    if (initializedKey !== key) {
        sgMail.setApiKey(key);
        initializedKey = key;
    }
    try {
        await sgMail.send({
            to: msg.to,
            from: { email: config.sendgridFromEmail, name: msg.fromName ?? 'NeuroCann' },
            replyTo: msg.replyTo,
            subject: msg.subject,
            text: msg.text,
        });
        return { success: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'SendGrid send failed';
        const body = err && typeof err === 'object' && 'response' in err
            ? JSON.stringify((err as { response?: { body?: unknown } }).response?.body)
            : '';
        console.error('[email] send failed:', message, body);
        return { success: false, error: message };
    }
}

export interface DemoRequestEmailDetails {
    id: string;
    name: string;
    email: string;
    company: string;
    role: string | null;
    phone: string | null;
    state: string | null;
    operationType: string | null;
    facilitySize: string | null;
    currentTools: string | null;
    message: string | null;
    source: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
}

/** Internal heads-up. Reply-To is the prospect so replying goes straight to them. */
export function demoNotificationEmail(to: string, d: DemoRequestEmailDetails): OutboundEmail {
    const line = (label: string, value: string | null) => (value ? `${label}: ${value}` : null);
    const utm = [d.utmSource, d.utmMedium, d.utmCampaign].filter(Boolean).join(' / ') || null;
    const text = [
        `${d.name} at ${d.company} asked for a demo.`,
        '',
        line('Email', d.email),
        line('Phone', d.phone),
        line('Role', d.role),
        line('State', d.state),
        line('Operation', d.operationType),
        line('Canopy', d.facilitySize),
        line('Current tools', d.currentTools),
        '',
        d.message ? `Message:\n${d.message}\n` : null,
        line('Clicked from', d.source),
        line('UTM', utm),
        line('Referrer', d.referrer),
        `Demo request id: ${d.id}`,
        '',
        'Reply to this email to answer them directly. Enrichment and Attio sync run in the background.',
    ].filter((l): l is string => l !== null).join('\n');
    return {
        to,
        subject: `Demo request: ${d.company} (${d.name})`,
        text,
        replyTo: { email: d.email, name: d.name },
        fromName: 'NeuroCann Growth',
    };
}

/** Confirmation to the prospect. Plain text; replies go to the sales inbox. */
export function demoConfirmationEmail(opts: { to: string; name: string; replyTo: string; schedulingUrl: string | null }): OutboundEmail {
    const firstName = opts.name.split(' ')[0] || opts.name;
    const text = [
        `Hi ${firstName},`,
        '',
        'Thanks for asking to see NeuroCann. We got your request.',
        '',
        opts.schedulingUrl
            ? `If you haven't picked a time yet, grab one here:\n${opts.schedulingUrl}`
            : 'We will reply within one business day to find a time that works.',
        '',
        'Demos run about thirty minutes and use your own rooms, harvests, and workflow, not slides. If there is anything specific you want to see, just reply to this email.',
        '',
        '-- NeuroCann',
    ].join('\n');
    return { to: opts.to, subject: 'Your NeuroCann demo request', text, replyTo: opts.replyTo };
}
