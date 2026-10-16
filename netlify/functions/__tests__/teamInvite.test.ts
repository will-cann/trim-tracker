import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendInvitation = vi.fn();
vi.mock('../utils/auth0mgmt', () => ({ sendInvitation: (...a: unknown[]) => sendInvitation(...a) }));

const sendInviteEmail = vi.fn();
vi.mock('../utils/email', () => ({ sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a) }));

const sql = vi.fn();
vi.mock('../utils/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));

import { inviteTeamMember, displayCompanyName } from '../utils/teamInvite';

const base = { email: 'jmodrusic@properbrands.com', name: 'Jacob Modrusic', companyId: 'c1', inviterUserId: 'u1' };

beforeEach(() => {
    sendInvitation.mockReset();
    sendInviteEmail.mockReset();
    sql.mockReset();
    sql.mockResolvedValue({ rows: [{ company_name: 'Proper Cannabis', inviter_name: 'Will Parkhurst' }] });
    process.env.APP_PUBLIC_URL = 'https://proper.neurocann.app';
    delete process.env.VITE_MANIFEST_DEPLOY_NAME;
    delete process.env.APP_CONTACT_EMAIL;
});

describe('inviteTeamMember', () => {
    it('emails the set-password link with company, inviter and sign-in URL', async () => {
        sendInvitation.mockResolvedValue({ success: true, inviteUrl: 'https://login.neurocann.app/u/reset-verify?ticket=t' });
        sendInviteEmail.mockResolvedValue({ success: true });

        const r = await inviteTeamMember(base);

        expect(r).toEqual({ success: true, inviteUrl: 'https://login.neurocann.app/u/reset-verify?ticket=t', emailed: true, emailError: undefined });
        expect(sendInviteEmail).toHaveBeenCalledWith({
            to: 'jmodrusic@properbrands.com',
            inviteUrl: 'https://login.neurocann.app/u/reset-verify?ticket=t',
            memberName: 'Jacob Modrusic',
            inviterName: 'Will Parkhurst',
            companyName: 'Proper Cannabis',
            appUrl: 'https://proper.neurocann.app',
            pickerUrl: undefined,
            replyTo: undefined,
        });
    });

    it('still returns the link when the email fails', async () => {
        sendInvitation.mockResolvedValue({ success: true, inviteUrl: 'https://x/t' });
        sendInviteEmail.mockResolvedValue({ success: false, error: 'Forbidden: sender not verified' });

        const r = await inviteTeamMember(base);

        expect(r).toMatchObject({ success: true, inviteUrl: 'https://x/t', emailed: false, emailError: 'Forbidden: sender not verified' });
    });

    it('sends nothing when Auth0 refuses', async () => {
        sendInvitation.mockResolvedValue({ success: false, error: 'Invites aren’t set up' });

        const r = await inviteTeamMember(base);

        expect(r).toEqual({ success: false, error: 'Invites aren’t set up', emailed: false });
        expect(sendInviteEmail).not.toHaveBeenCalled();
    });

    it('does not email when an existing login gets no link', async () => {
        sendInvitation.mockResolvedValue({ success: true });
        expect(await inviteTeamMember(base)).toEqual({ success: true, emailed: false });
        expect(sendInviteEmail).not.toHaveBeenCalled();
    });

    it('sends the email even if the name lookup fails', async () => {
        sendInvitation.mockResolvedValue({ success: true, inviteUrl: 'https://x/t' });
        sendInviteEmail.mockResolvedValue({ success: true });
        sql.mockRejectedValue(new Error('db down'));

        expect((await inviteTeamMember(base)).emailed).toBe(true);
        expect(sendInviteEmail.mock.calls[0][0]).toMatchObject({ companyName: undefined, inviterName: undefined });
    });
});

it('adds the picker section and reply-to on a picker deploy', async () => {
    process.env.VITE_MANIFEST_DEPLOY_NAME = 'Proper Cannabis';
    process.env.APP_CONTACT_EMAIL = 'will@neurocann.app';
    process.env.APP_PUBLIC_URL = 'https://proper.neurocann.app/';
    sendInvitation.mockResolvedValue({ success: true, inviteUrl: 'https://x/t' });
    sendInviteEmail.mockResolvedValue({ success: true });

    await inviteTeamMember(base);

    expect(sendInviteEmail.mock.calls[0][0]).toMatchObject({
        appUrl: 'https://proper.neurocann.app',
        pickerUrl: 'https://proper.neurocann.app/manifest',
        replyTo: 'will@neurocann.app',
    });
});

describe('displayCompanyName', () => {
    it('keeps a real company name', () => {
        expect(displayCompanyName('Proper Cannabis')).toBe('Proper Cannabis');
    });

    it('swaps auto-provisioned names for the deploy name', () => {
        process.env.VITE_MANIFEST_DEPLOY_NAME = 'Proper Cannabis';
        expect(displayCompanyName('My Company')).toBe('Proper Cannabis');
        expect(displayCompanyName('will@neurocann.app')).toBe('Proper Cannabis');
        expect(displayCompanyName(null)).toBe('Proper Cannabis');
    });

    it('returns undefined when there is nothing better', () => {
        expect(displayCompanyName('My Company')).toBeUndefined();
    });
});
