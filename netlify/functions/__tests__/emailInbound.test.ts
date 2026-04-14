import { describe, it, expect, vi } from 'vitest';
import {
    parseMultipart,
    normalizeInboundFields,
    extractHeader,
    extractThreadId,
    extractAddress,
    headersToObject,
    resolveThreadMatch,
} from '../utils/emailInbound';

const BOUNDARY = '----TestBoundary1234';

function buildMultipart(fields: Array<[string, string, { filename?: string; contentType?: string }?]>): Buffer {
    const parts: Buffer[] = [];
    for (const [name, value, opts] of fields) {
        const disposition = opts?.filename
            ? `form-data; name="${name}"; filename="${opts.filename}"`
            : `form-data; name="${name}"`;
        const headers = [`Content-Disposition: ${disposition}`];
        if (opts?.contentType) headers.push(`Content-Type: ${opts.contentType}`);
        parts.push(Buffer.from(`--${BOUNDARY}\r\n${headers.join('\r\n')}\r\n\r\n${value}\r\n`));
    }
    parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
    return Buffer.concat(parts);
}

describe('parseMultipart', () => {
    it('parses simple text fields', () => {
        const body = buildMultipart([
            ['from', 'grower@example.com'],
            ['subject', 'Re: Menu request'],
        ]);
        const parts = parseMultipart(body, `multipart/form-data; boundary=${BOUNDARY}`);
        expect(parts).toHaveLength(2);
        expect(parts[0].name).toBe('from');
        expect(parts[0].data.toString('utf8')).toBe('grower@example.com');
        expect(parts[1].name).toBe('subject');
    });

    it('preserves filename + content-type on attachment parts', () => {
        const body = buildMultipart([
            ['text', 'hi'],
            ['attachment1', 'PDFBINARY', { filename: 'menu.pdf', contentType: 'application/pdf' }],
        ]);
        const parts = parseMultipart(body, `multipart/form-data; boundary=${BOUNDARY}`);
        expect(parts[1].filename).toBe('menu.pdf');
        expect(parts[1].contentType).toBe('application/pdf');
        expect(parts[1].data.toString('utf8')).toBe('PDFBINARY');
    });

    it('handles quoted boundary in Content-Type', () => {
        const body = buildMultipart([['a', 'b']]);
        const parts = parseMultipart(body, `multipart/form-data; boundary="${BOUNDARY}"`);
        expect(parts).toHaveLength(1);
    });

    it('throws when boundary missing', () => {
        expect(() => parseMultipart(Buffer.from(''), 'application/json')).toThrow();
    });
});

describe('normalizeInboundFields', () => {
    it('produces an InboundEmail with headers extracted', () => {
        const body = buildMultipart([
            ['from', 'grower@example.com'],
            ['to', 'thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app'],
            ['subject', 'Re: Menu'],
            ['text', 'Here is our menu.'],
            ['html', '<p>Here is our menu.</p>'],
            ['envelope', '{"to":["thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app"],"from":"grower@example.com"}'],
            ['headers', 'Message-ID: <abc@mail.example.com>\r\nIn-Reply-To: <xyz@neurocann.app>'],
        ]);
        const parts = parseMultipart(body, `multipart/form-data; boundary=${BOUNDARY}`);
        const email = normalizeInboundFields(parts);
        expect(email.from).toBe('grower@example.com');
        expect(email.text).toBe('Here is our menu.');
        expect(email.envelope?.from).toBe('grower@example.com');
        expect(email.messageIdHeader).toBe('<abc@mail.example.com>');
        expect(email.inReplyToHeader).toBe('<xyz@neurocann.app>');
    });

    it('skips attachment file parts for text field collection', () => {
        const body = buildMultipart([
            ['text', 'body'],
            ['attachment1', 'BIN', { filename: 'menu.pdf' }],
        ]);
        const parts = parseMultipart(body, `multipart/form-data; boundary=${BOUNDARY}`);
        const email = normalizeInboundFields(parts);
        expect(email.text).toBe('body');
    });
});

describe('extractHeader', () => {
    it('is case-insensitive', () => {
        const raw = 'Message-ID: <abc>\r\nX-Spam: no';
        expect(extractHeader(raw, 'message-id')).toBe('<abc>');
    });

    it('handles literal \\n as newline', () => {
        const raw = 'Message-ID: <abc>\\nIn-Reply-To: <xyz>';
        expect(extractHeader(raw, 'In-Reply-To')).toBe('<xyz>');
    });

    it('returns null when missing', () => {
        expect(extractHeader('X: y', 'Z')).toBeNull();
        expect(extractHeader('', 'Z')).toBeNull();
    });
});

describe('extractThreadId', () => {
    it('parses a thread-uuid token', () => {
        expect(extractThreadId('thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app'))
            .toBe('00000000-0000-0000-0000-000000000000');
    });

    it('handles display-name form', () => {
        expect(extractThreadId('"Ops" <thread-11111111-2222-3333-4444-555555555555@replies.neurocann.app>'))
            .toBe('11111111-2222-3333-4444-555555555555');
    });

    it('returns null for non-thread addresses', () => {
        expect(extractThreadId('sales@example.com')).toBeNull();
        expect(extractThreadId('thread-notauuid@replies.neurocann.app')).toBeNull();
    });

    it('picks the first thread token in a list', () => {
        const to = 'sales@example.com, thread-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@replies.neurocann.app';
        expect(extractThreadId(to)).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    });
});

describe('extractAddress', () => {
    it('strips display name + angles', () => {
        expect(extractAddress('"Jane Grower" <jane@example.com>')).toBe('jane@example.com');
    });
    it('lowercases', () => {
        expect(extractAddress('JANE@Example.COM')).toBe('jane@example.com');
    });
});

describe('headersToObject', () => {
    it('splits headers into a map', () => {
        const obj = headersToObject('Message-ID: <a>\r\nSubject: hi');
        expect(obj['Message-ID']).toBe('<a>');
        expect(obj['Subject']).toBe('hi');
    });
});

describe('resolveThreadMatch', () => {
    const baseEmail = {
        from: 'grower@example.com',
        to: '',
        subject: 's',
        text: '',
        html: '',
        envelope: null as any,
        rawHeaders: '',
        messageIdHeader: null,
        inReplyToHeader: null,
    };

    it('resolves via thread token when present', async () => {
        const deps = {
            findThreadById: vi.fn().mockResolvedValue({
                id: '00000000-0000-0000-0000-000000000000',
                vendorId: 'v-1',
                companyId: 'c-1',
            }),
            findMessageByHeader: vi.fn(),
            findVendorByEmail: vi.fn(),
        };
        const match = await resolveThreadMatch({
            ...baseEmail,
            to: 'thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app',
            envelope: { to: ['thread-00000000-0000-0000-0000-000000000000@replies.neurocann.app'], from: 'grower@example.com' },
        }, deps);
        expect(match.kind).toBe('thread_token');
        expect(deps.findMessageByHeader).not.toHaveBeenCalled();
    });

    it('falls back to In-Reply-To when thread token does not exist in DB', async () => {
        const deps = {
            findThreadById: vi.fn().mockResolvedValue(null),
            findMessageByHeader: vi.fn().mockResolvedValue({ threadId: 't-123', vendorId: 'v-1', companyId: 'c-1' }),
            findVendorByEmail: vi.fn(),
        };
        const match = await resolveThreadMatch({
            ...baseEmail,
            inReplyToHeader: '<xyz@mail>',
        }, deps);
        expect(match).toEqual({ kind: 'in_reply_to', threadId: 't-123', vendorId: 'v-1', companyId: 'c-1' });
        expect(deps.findMessageByHeader).toHaveBeenCalledWith('xyz@mail');
    });

    it('falls back to vendor email when no thread/header match', async () => {
        const deps = {
            findThreadById: vi.fn().mockResolvedValue(null),
            findMessageByHeader: vi.fn().mockResolvedValue(null),
            findVendorByEmail: vi.fn().mockResolvedValue({ vendorId: 'v-9', companyId: 'c-1' }),
        };
        const match = await resolveThreadMatch({
            ...baseEmail,
            from: 'Grower <grower@example.com>',
            inReplyToHeader: '<missing@mail>',
        }, deps);
        expect(match).toEqual({ kind: 'vendor_email', threadId: null, vendorId: 'v-9', companyId: 'c-1' });
        expect(deps.findVendorByEmail).toHaveBeenCalledWith('grower@example.com');
    });

    it('returns unmatched when nothing resolves', async () => {
        const deps = {
            findThreadById: vi.fn().mockResolvedValue(null),
            findMessageByHeader: vi.fn().mockResolvedValue(null),
            findVendorByEmail: vi.fn().mockResolvedValue(null),
        };
        const match = await resolveThreadMatch({ ...baseEmail, from: 'stranger@example.com' }, deps);
        expect(match.kind).toBe('unmatched');
    });
});
