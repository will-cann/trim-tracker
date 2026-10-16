import { sql } from './db';
import { sendInvitation } from './auth0mgmt';
import { sendInviteEmail } from './email';

export interface TeamInviteResult {
    success: boolean;
    error?: string;
    /** Auth0 "set your password" link, when one was created. */
    inviteUrl?: string;
    /** True when the link was emailed to the member. */
    emailed: boolean;
    emailError?: string;
}

/**
 * Creates the member's Auth0 login (or a fresh set-password link for an
 * existing one) and emails the link from SENDGRID_FROM_EMAIL. The link is
 * also returned so the inviter can share it by hand if the email fails.
 */
export async function inviteTeamMember(opts: {
    email: string;
    name?: string;
    companyId: string;
    inviterUserId: string;
}): Promise<TeamInviteResult> {
    const result = await sendInvitation(opts.email, opts.name);
    if (!result.success) return { success: false, error: result.error, emailed: false };
    if (!result.inviteUrl) return { success: true, emailed: false };

    let companyName: string | undefined;
    let inviterName: string | undefined;
    try {
        const { rows } = await sql`
            SELECT c.name AS company_name, u.name AS inviter_name
            FROM companies c
            LEFT JOIN users u ON u.id = ${opts.inviterUserId} AND u.company_id = c.id
            WHERE c.id = ${opts.companyId}
        `;
        companyName = displayCompanyName(rows[0]?.company_name);
        inviterName = rows[0]?.inviter_name || undefined;
    } catch (err) {
        console.warn('Invite email: could not look up company/inviter names', err);
    }

    const appUrl = process.env.APP_PUBLIC_URL?.replace(/\/+$/, '') || undefined;
    const sent = await sendInviteEmail({
        to: opts.email,
        inviteUrl: result.inviteUrl,
        memberName: opts.name,
        inviterName,
        companyName,
        appUrl,
        // Deploys set up for the manifest picker (e.g. Proper) introduce it.
        pickerUrl: appUrl && process.env.VITE_MANIFEST_DEPLOY_NAME ? `${appUrl}/manifest` : undefined,
        replyTo: process.env.APP_CONTACT_EMAIL || undefined,
    });
    return {
        success: true,
        inviteUrl: result.inviteUrl,
        emailed: sent.success,
        emailError: sent.success ? undefined : sent.error,
    };
}

/**
 * Auto-provisioned companies are named after the first user ("My Company", an
 * email address). Prefer the deploy's name (e.g. "Proper Cannabis") over those.
 */
export function displayCompanyName(name: string | null | undefined): string | undefined {
    const deployName = process.env.VITE_MANIFEST_DEPLOY_NAME?.trim() || undefined;
    const n = name?.trim();
    if (!n || n === 'My Company' || n.includes('@')) return deployName;
    return n;
}
