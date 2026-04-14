/**
 * parse-inbound-menu / menuExtraction — unit tests
 *
 * Covers:
 *  - htmlToText fallback strips tags
 *  - normalizeParse coerces weird AI output into our typed shape
 *  - callAnthropicForMenu uses tool-use and returns the structured input
 *  - writeMenuAndProducts is idempotent: 2nd call updates rather than duplicates
 *
 * Run with: npx vitest run netlify/functions/__tests__/menuExtraction.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── SQL mock: captures every query and returns pre-set rows by substring match
type Stub = { match: (key: string) => boolean; rows: Record<string, unknown>[] };
let stubs: Stub[] = [];
const sqlLog: { key: string; values: unknown[] }[] = [];

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
    const key = strings.join('?').replace(/\s+/g, ' ').trim();
    sqlLog.push({ key, values });
    for (const s of stubs) {
        if (s.match(key)) return Promise.resolve({ rows: s.rows });
    }
    return Promise.resolve({ rows: [] });
}

vi.mock('../utils/db', () => ({
    sql: sqlTag,
    pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock('../utils/auth', () => ({
    resolveContext: vi.fn().mockResolvedValue({
        userId: 'user-1',
        companyId: 'company-1',
        role: 'director',
        departments: ['extraction'],
    }),
}));

import {
    htmlToText,
    normalizeParse,
    callAnthropicForMenu,
    formatUnitSize,
    INBOUND_MENU_TOOL,
} from '../utils/menuExtraction';
import { writeMenuAndProducts } from '../parse-inbound-menu';

beforeEach(() => {
    stubs = [];
    sqlLog.length = 0;
});

describe('htmlToText', () => {
    it('strips tags and preserves line breaks', () => {
        const html = '<p>Blue Dream FF</p><br/><div>1lb @ $450</div>';
        const txt = htmlToText(html);
        expect(txt).toContain('Blue Dream FF');
        expect(txt).toContain('1lb @ $450');
        expect(txt).not.toContain('<');
    });

    it('drops style and script blocks', () => {
        const html = '<style>.x{}</style><script>evil()</script><p>hi</p>';
        expect(htmlToText(html)).toBe('hi');
    });
});

describe('normalizeParse', () => {
    it('coerces minimal valid input and defaults unknowns', () => {
        const result = normalizeParse({
            products: [
                { name: 'Blue Dream FF', strain: 'Blue Dream', inputType: 'fresh_frozen', unit: 'lb', unitSize: 1 },
            ],
        });
        expect(result.products).toHaveLength(1);
        expect(result.products[0]).toMatchObject({
            name: 'Blue Dream FF',
            inputType: 'fresh_frozen',
            unit: 'lb',
            unitSize: 1,
            unitPrice: null,
            caseSize: null,
        });
        expect(result.menuDateMentioned).toBeNull();
    });

    it('falls back input_type to other and unit to lb for garbage values', () => {
        const result = normalizeParse({
            products: [{ name: 'x', strain: 'y', inputType: 'weird', unit: 'pints', unitSize: 'three' }],
        });
        expect(result.products[0].inputType).toBe('other');
        expect(result.products[0].unit).toBe('lb');
        expect(result.products[0].unitSize).toBe(1);
    });

    it('drops products with no name', () => {
        const result = normalizeParse({ products: [{ name: '', strain: 'z' }, { name: 'OK', strain: 'a' }] });
        expect(result.products.map(p => p.name)).toEqual(['OK']);
    });
});

describe('formatUnitSize', () => {
    it('concats unitSize + unit', () => {
        expect(formatUnitSize({ unit: 'lb', unitSize: 1 })).toBe('1lb');
        expect(formatUnitSize({ unit: 'kg', unitSize: 2.5 })).toBe('2.5kg');
    });
});

describe('callAnthropicForMenu', () => {
    it('calls Anthropic with tool-use and returns normalized tool input', async () => {
        const fakeFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                content: [
                    {
                        type: 'tool_use',
                        name: INBOUND_MENU_TOOL.name,
                        input: {
                            products: [
                                {
                                    name: 'Zkittlez Fresh Frozen',
                                    strain: 'Zkittlez',
                                    inputType: 'fresh_frozen',
                                    unit: 'lb',
                                    unitSize: 1,
                                    unitPrice: 475,
                                },
                            ],
                            menuDateMentioned: '2026-04-20',
                            generalNotes: 'Pickup only',
                        },
                    },
                ],
            }),
        }) as unknown as typeof fetch;

        const parsed = await callAnthropicForMenu('Blue Dream FF 1lb...', 'sk-fake', fakeFetch);
        expect(parsed?.products[0].name).toBe('Zkittlez Fresh Frozen');
        expect(parsed?.products[0].unitPrice).toBe(475);
        expect(parsed?.menuDateMentioned).toBe('2026-04-20');

        // Verify we sent tool_choice pinning the extract_menu tool
        const callBody = JSON.parse((fakeFetch as any).mock.calls[0][1].body);
        expect(callBody.tool_choice).toEqual({ type: 'tool', name: 'extract_menu' });
        expect(callBody.tools[0].name).toBe('extract_menu');
    });

    it('returns null when Claude emits no tool_use block', async () => {
        const fakeFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ content: [{ type: 'text', text: 'sorry' }] }),
        }) as unknown as typeof fetch;
        const parsed = await callAnthropicForMenu('...', 'sk-fake', fakeFetch);
        expect(parsed).toBeNull();
    });

    it('throws on non-2xx', async () => {
        const fakeFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'boom',
        }) as unknown as typeof fetch;
        await expect(callAnthropicForMenu('...', 'sk-fake', fakeFetch)).rejects.toThrow(/500/);
    });
});

describe('writeMenuAndProducts', () => {
    const parsed = {
        products: [
            {
                name: 'Blue Dream Fresh Frozen',
                strain: 'Blue Dream',
                inputType: 'fresh_frozen' as const,
                unit: 'lb' as const,
                unitSize: 1,
                unitPrice: 450,
                caseSize: null,
                casePrice: null,
                availableQty: 20,
                notes: null,
            },
        ],
        menuDateMentioned: null,
        generalNotes: null,
    };

    it('inserts a vendor_menus row and a vendor_products row when none exists', async () => {
        stubs = [
            { match: (k) => k.includes('INSERT INTO vendor_menus'), rows: [{ id: 'menu-1' }] },
            { match: (k) => k.includes('SELECT id FROM vendor_products'), rows: [] },
        ];

        const result = await writeMenuAndProducts({
            companyId: 'company-1',
            vendorId: 'vendor-1',
            messageId: 'msg-1',
            subject: 'April drop',
            parsed,
        });

        expect(result).toEqual({ menuId: 'menu-1', productsUpserted: 1 });
        const keys = sqlLog.map(s => s.key);
        expect(keys.some(k => k.includes('INSERT INTO vendor_menus'))).toBe(true);
        expect(keys.some(k => k.includes('INSERT INTO vendor_products'))).toBe(true);
        expect(keys.some(k => k.includes('UPDATE vendor_products'))).toBe(false);
    });

    it('updates an existing vendor_products row on re-parse (idempotent)', async () => {
        stubs = [
            { match: (k) => k.includes('INSERT INTO vendor_menus'), rows: [{ id: 'menu-2' }] },
            { match: (k) => k.includes('SELECT id FROM vendor_products'), rows: [{ id: 'vp-existing' }] },
        ];

        const result = await writeMenuAndProducts({
            companyId: 'company-1',
            vendorId: 'vendor-1',
            messageId: 'msg-1',
            subject: null,
            parsed,
        });

        expect(result.productsUpserted).toBe(1);
        const keys = sqlLog.map(s => s.key);
        expect(keys.some(k => k.includes('UPDATE vendor_products'))).toBe(true);
        expect(keys.some(k => k.includes('INSERT INTO vendor_products'))).toBe(false);
    });

    it('defaults file_name to a safe placeholder when subject is missing', async () => {
        stubs = [
            { match: (k) => k.includes('INSERT INTO vendor_menus'), rows: [{ id: 'menu-3' }] },
            { match: (k) => k.includes('SELECT id FROM vendor_products'), rows: [] },
        ];
        await writeMenuAndProducts({
            companyId: 'company-1',
            vendorId: 'vendor-1',
            messageId: 'msg-1',
            subject: '   ',
            parsed,
        });
        const menuInsert = sqlLog.find(s => s.key.includes('INSERT INTO vendor_menus'));
        expect(menuInsert?.values).toContain('Inbound email menu');
    });
});
