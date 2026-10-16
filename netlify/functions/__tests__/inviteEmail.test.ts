import { describe, it, expect } from 'vitest';
import { renderInviteEmail } from '../utils/email';

const args = {
    to: 'jmodrusic@properbrands.com',
    inviteUrl: 'https://login.neurocann.app/u/reset-verify?ticket=abc&x=1',
    memberName: 'Jacob Modrusic',
    inviterName: 'Will Parkhurst',
    companyName: 'Proper Cannabis',
    appUrl: 'https://proper.neurocann.app',
};

describe('renderInviteEmail', () => {
    it('names the company, the inviter, the link and where to sign in', () => {
        const { subject, text, html } = renderInviteEmail(args);
        expect(subject).toBe("You're invited to Proper Cannabis on NeuroCann");
        expect(text).toContain('Hi Jacob,');
        expect(text).toContain('Will Parkhurst added you to Proper Cannabis on NeuroCann.');
        expect(text).toContain(`Set your password: ${args.inviteUrl}`);
        expect(text).toContain('Sign in at https://proper.neurocann.app with jmodrusic@properbrands.com.');
        expect(html).toContain('href="https://login.neurocann.app/u/reset-verify?ticket=abc&amp;x=1"');
        expect(html).toContain('src="https://proper.neurocann.app/logo.png"');
    });

    it('only describes the picker when given its URL', () => {
        expect(renderInviteEmail(args).html).not.toContain('Manifest picker');
        const withPicker = renderInviteEmail({ ...args, pickerUrl: 'https://proper.neurocann.app/manifest' });
        expect(withPicker.html).toContain('Manifest picker');
        expect(withPicker.html).toContain('href="https://proper.neurocann.app/manifest"');
        expect(withPicker.text).toContain('Check packages in Metrc');
    });

    it('escapes names in the HTML', () => {
        const { html } = renderInviteEmail({ ...args, inviterName: '<b>x</b>', companyName: 'A & B' });
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt; added you to A &amp; B');
        expect(html).not.toContain('<b>x</b>');
    });

    it('falls back sensibly without names or app URL', () => {
        const { text, html } = renderInviteEmail({ to: 'nick@x.com', inviteUrl: 'https://x/t' });
        expect(text).toContain('Hi nick,');
        expect(text).toContain("You've been added to your team on NeuroCann.");
        expect(text).not.toContain('Sign in at');
        expect(html).not.toContain('<img');
    });
});
