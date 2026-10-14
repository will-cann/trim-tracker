import { describe, expect, it } from 'vitest';
import { companyDomain, validateDemoRequest } from '../src/demoRequest';
import { prefilledSchedulingUrl } from '../src/prospects';

describe('validateDemoRequest', () => {
    const base = { name: ' Jane  Grower ', email: ' Jane@AcmeFarms.com ', company: 'Acme Farms' };

    it('normalizes and accepts a minimal request', () => {
        const r = validateDemoRequest(base);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value).toMatchObject({ name: 'Jane Grower', email: 'jane@acmefarms.com', company: 'Acme Farms', role: null });
    });

    it('requires name, a valid email and company', () => {
        expect(validateDemoRequest({ ...base, name: '' })).toMatchObject({ ok: false, spam: false });
        expect(validateDemoRequest({ ...base, email: 'nope' })).toMatchObject({ ok: false, error: 'Please add a valid email address.' });
        expect(validateDemoRequest({ ...base, company: '  ' })).toMatchObject({ ok: false, spam: false });
        expect(validateDemoRequest(null)).toMatchObject({ ok: false, spam: false });
    });

    it('flags the honeypot as spam', () => {
        expect(validateDemoRequest({ ...base, website: 'http://spam' })).toEqual({ ok: false, spam: true });
    });

    it('drops select values outside the allowlist and truncates long text', () => {
        const r = validateDemoRequest({ ...base, operationType: 'drop table', facilitySize: '5k-20k', message: 'x'.repeat(5000) });
        expect(r.ok && r.value.operationType).toBe(null);
        expect(r.ok && r.value.facilitySize).toBe('5k-20k');
        expect(r.ok && r.value.message?.length).toBe(2000);
    });
});

describe('companyDomain', () => {
    it('returns the work domain and ignores freemail', () => {
        expect(companyDomain('a@AcmeFarms.com')).toBe('acmefarms.com');
        expect(companyDomain('a@gmail.com')).toBe(null);
        expect(companyDomain('a@proton.me')).toBe(null);
    });
});

describe('prefilledSchedulingUrl', () => {
    it('adds name and email, and passes through null', () => {
        expect(prefilledSchedulingUrl('https://cal.com/x/demo?embed=1', 'Jane G', 'j@a.co'))
            .toBe('https://cal.com/x/demo?embed=1&name=Jane+G&email=j%40a.co');
        expect(prefilledSchedulingUrl(null, 'a', 'b')).toBe(null);
    });
});
