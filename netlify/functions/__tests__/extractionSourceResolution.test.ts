/**
 * buildStartExtractionRunData — source package resolution tests.
 *
 * Regression guard for the PR #2 LIMIT 1 bug: when multiple packages
 * shared the same (strain, packageType), all inputs collapsed onto the
 * first matching row. This file verifies the three strategies in the
 * resolver:
 *   1. Explicit sourcePackageId from the agent → direct lookup
 *   2. Fuzzy (strain, packageType) + quantity match → one distinct row per input
 *   3. Multiple same-strain inputs without IDs → consume distinct rows sequentially
 *
 * Mocks sql + fetch so the handler runs end-to-end with a canned
 * start_extraction_run tool_use and we can inspect the resulting
 * ProposedAction.data.
 *
 * Run with: npx vitest run netlify/functions/__tests__/extractionSourceResolution.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────
// Mocks — must be declared BEFORE handler import
// ──────────────────────────────────────────────────────────────────────────

type QueryShape = { match: (key: string) => boolean; rows: Record<string, unknown>[] };
let sqlQueryStubs: QueryShape[] = [];

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    void values;
    const key = strings.join('?').replace(/\s+/g, ' ').trim();
    for (const stub of sqlQueryStubs) {
        if (stub.match(key)) return Promise.resolve({ rows: stub.rows });
    }
    return Promise.resolve({ rows: [] });
}

// @netlify/functions `stream` helper wraps the handler with AWS Lambda's
// streamifyResponse global. That global only exists in the Netlify runtime,
// so in tests we replace stream() with an identity pass-through.
vi.mock('@netlify/functions', async () => {
    const actual = await vi.importActual<typeof import('@netlify/functions')>('@netlify/functions');
    return {
        ...actual,
        stream: <T>(handler: T): T => handler,
    };
});

vi.mock('../utils/db', () => ({
    sql: sqlTag,
    pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock('../utils/auth', () => ({
    resolveContext: vi.fn().mockResolvedValue({
        userId: 'user-1',
        companyId: 'company-1',
        role: 'director',
        departments: ['cultivation', 'extraction'],
    }),
}));

vi.mock('../utils/rateLimit', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('../utils/sentry', () => ({
    withSentry: (handler: unknown) => handler,
    captureError: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────────────────
// Anthropic fetch mock
// ──────────────────────────────────────────────────────────────────────────

interface CannedResponse {
    content: Array<{
        type: 'text' | 'tool_use';
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
    }>;
    stop_reason: string;
}

let responseQueue: CannedResponse[] = [];

// Encode a canned Anthropic response as an SSE event stream matching
// the shape consumeAnthropicStream() expects. Kept duplicated rather
// than shared with agentLoop.test.ts to keep each test file
// self-contained — these helpers are a dozen lines and the test files
// are otherwise independent.
function encodeSSE(canned: CannedResponse): Uint8Array {
    const events: string[] = [];
    const push = (eventType: string, data: Record<string, unknown>) => {
        events.push(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    push('message_start', {
        type: 'message_start',
        message: { usage: { input_tokens: 100, output_tokens: 0 } },
    });
    canned.content.forEach((block, index) => {
        if (block.type === 'text') {
            push('content_block_start', {
                type: 'content_block_start',
                index,
                content_block: { type: 'text', text: '' },
            });
            push('content_block_delta', {
                type: 'content_block_delta',
                index,
                delta: { type: 'text_delta', text: block.text || '' },
            });
            push('content_block_stop', { type: 'content_block_stop', index });
        } else {
            push('content_block_start', {
                type: 'content_block_start',
                index,
                content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
            });
            push('content_block_delta', {
                type: 'content_block_delta',
                index,
                delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input || {}) },
            });
            push('content_block_stop', { type: 'content_block_stop', index });
        }
    });
    push('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: canned.stop_reason },
        usage: { output_tokens: 50 },
    });
    push('message_stop', { type: 'message_stop' });
    return new TextEncoder().encode(events.join(''));
}

const mockFetch = vi.fn(async (): Promise<Response> => {
    const next = responseQueue.shift();
    if (!next) throw new Error('responseQueue empty');
    const bytes = encodeSSE(next);
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
    return {
        ok: true,
        status: 200,
        body,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        text: async () => new TextDecoder().decode(bytes),
        json: async () => next,
    } as unknown as Response;
});

import { handler } from '../ai-parse';

function makeEvent(): Parameters<typeof handler>[0] {
    return {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: JSON.stringify({
            message: 'test',
            context: {
                hasActiveSession: false,
                trimmerProfiles: [],
                existingEntries: [],
                harvests: [],
                humanTasks: [],
                screenContext: 'Test',
            },
        }),
    } as Parameters<typeof handler>[0];
}

// Seed-like Wi Fi OG fresh frozen packages, matching the actual seed
// data the user pointed at during testing.
const WIFI_OG_PACKAGES = [
    { id: 'pkg-wfog-1', label: 'WFOG-FF-2026-03-10',   quantity: '15000', package_type: 'fresh_frozen', strain: 'Wi Fi OG', created_at: '2026-03-10' },
    { id: 'pkg-wfog-2', label: 'WFOG-FF-2026-03-05-B', quantity: '20000', package_type: 'fresh_frozen', strain: 'Wi Fi OG', created_at: '2026-03-05' },
    { id: 'pkg-wfog-3', label: 'WFOG-FF-2026-03-05-A', quantity: '30000', package_type: 'fresh_frozen', strain: 'Wi Fi OG', created_at: '2026-03-05' },
    { id: 'pkg-wfog-4', label: 'WFOG-FF-2026-02-28-A', quantity: '25000', package_type: 'fresh_frozen', strain: 'Wi Fi OG', created_at: '2026-02-28' },
    { id: 'pkg-wfog-5', label: 'WFOG-FF-2026-02-28-B', quantity: '25000', package_type: 'fresh_frozen', strain: 'Wi Fi OG', created_at: '2026-02-28' },
];

beforeEach(() => {
    responseQueue = [];
    sqlQueryStubs = [];
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
    process.env.CLAUDE_API_KEY = 'test-key';

    // Default stubs: process_templates + product_types + extraction_runs
    // return empty so the helper's non-package branches don't break.
    sqlQueryStubs.push({
        match: (k) => k.includes('FROM process_templates'),
        rows: [{ id: 'tmpl-solventless', name: 'Solventless — Fresh Frozen to Rosin', process_type: 'solventless', accepted_inputs: ['fresh_frozen'] }],
    });
    sqlQueryStubs.push({
        match: (k) => k.includes('FROM product_types'),
        rows: [{ name: 'fresh_frozen', display_name: 'Fresh Frozen', category: 'biomass', default_unit: 'g', is_cannabis: true }],
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('extraction source-package resolution', () => {
    it('consumes 5 distinct rows when the agent passes 5 same-strain inputs without IDs (regression: LIMIT 1 bug)', async () => {
        // Stub the Wi Fi OG fuzzy query to return ALL 5 matching packages.
        sqlQueryStubs.push({
            match: (k) => k.includes('FROM packages') && k.includes('package_type =') && k.includes('LOWER(strain)'),
            rows: WIFI_OG_PACKAGES,
        });

        // Canned response: agent proposes start_extraction_run with 5 Wi Fi OG
        // inputs matching the seed data quantities. NO sourcePackageId set
        // (simulating an older agent call that doesn't know about the new
        // disambiguation fields).
        responseQueue.push({
            content: [{
                type: 'tool_use',
                id: 'toolu_start_run',
                name: 'start_extraction_run',
                input: {
                    templateIdentifier: 'solventless',
                    strain: 'Wi Fi OG',
                    inputs: [
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 15000 },
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 20000 },
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 30000 },
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 25000 },
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 25000 },
                    ],
                    startImmediately: true,
                },
            }],
            stop_reason: 'end_turn',
        });

        const res = await handler(makeEvent(), {} as never, () => undefined);
        const body = JSON.parse((res as { body: string }).body);

        expect(body.actions).toHaveLength(1);
        const data = body.actions[0].data;

        // Each resolved input must point at a DISTINCT source package.
        const ids = (data.inputs as Array<{ sourcePackageId: string }>).map(i => i.sourcePackageId);
        expect(new Set(ids).size).toBe(5);

        // sourcePackageIds array has 5 unique entries.
        expect(data.sourcePackageIds).toHaveLength(5);
        expect(new Set(data.sourcePackageIds).size).toBe(5);

        // sourcePackageQuantities map has 5 keys (one per unique package)
        // summing to 115000g (not 25000g as the old bug produced).
        const qtyValues = Object.values(data.sourcePackageQuantities as Record<string, number>);
        expect(qtyValues).toHaveLength(5);
        const totalQty = qtyValues.reduce((a, b) => a + b, 0);
        expect(totalQty).toBe(115000);
    });

    it('matches by quantity when multiple candidates exist', async () => {
        sqlQueryStubs.push({
            match: (k) => k.includes('FROM packages') && k.includes('package_type =') && k.includes('LOWER(strain)'),
            rows: WIFI_OG_PACKAGES,
        });

        // Only one input — should resolve to the package with matching
        // quantity (30000 → WFOG-FF-2026-03-05-A).
        responseQueue.push({
            content: [{
                type: 'tool_use',
                id: 'toolu_single',
                name: 'start_extraction_run',
                input: {
                    templateIdentifier: 'solventless',
                    strain: 'Wi Fi OG',
                    inputs: [{ packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 30000 }],
                    startImmediately: true,
                },
            }],
            stop_reason: 'end_turn',
        });

        const res = await handler(makeEvent(), {} as never, () => undefined);
        const body = JSON.parse((res as { body: string }).body);
        const input = body.actions[0].data.inputs[0];

        expect(input.sourcePackageId).toBe('pkg-wfog-3');
        expect(input.sourcePackageLabel).toBe('WFOG-FF-2026-03-05-A');
        expect(input.quantity).toBe(30000);
    });

    it('uses explicit sourcePackageId when the agent provides it (skip fuzzy match entirely)', async () => {
        // Stub: the explicit-ID query returns only pkg-wfog-4. Match by
        // `WHERE id = ?` (leading WHERE disambiguates from `company_id`).
        sqlQueryStubs.push({
            match: (k) => k.includes('FROM packages') && /WHERE id = \?/.test(k),
            rows: [WIFI_OG_PACKAGES[3]], // pkg-wfog-4
        });

        responseQueue.push({
            content: [{
                type: 'tool_use',
                id: 'toolu_by_id',
                name: 'start_extraction_run',
                input: {
                    templateIdentifier: 'solventless',
                    strain: 'Wi Fi OG',
                    inputs: [{
                        sourcePackageId: 'pkg-wfog-4',
                        packageType: 'fresh_frozen',
                        strain: 'Wi Fi OG',
                        quantity: 25000,
                    }],
                    startImmediately: true,
                },
            }],
            stop_reason: 'end_turn',
        });

        const res = await handler(makeEvent(), {} as never, () => undefined);
        const body = JSON.parse((res as { body: string }).body);
        const input = body.actions[0].data.inputs[0];

        expect(input.sourcePackageId).toBe('pkg-wfog-4');
        expect(input.sourcePackageLabel).toBe('WFOG-FF-2026-02-28-A');
    });

    it('handles mixed explicit + fuzzy resolution in one run', async () => {
        // Stub for explicit ID lookup (strategy 1) — regex to distinguish
        // from `company_id = ?` which also contains `id = ?`.
        sqlQueryStubs.push({
            match: (k) => k.includes('FROM packages') && /WHERE id = \?/.test(k),
            rows: [WIFI_OG_PACKAGES[0]], // pkg-wfog-1 (15000g)
        });
        // Stub for fuzzy lookup (strategy 3)
        sqlQueryStubs.push({
            match: (k) => k.includes('FROM packages') && k.includes('package_type =') && k.includes('LOWER(strain)'),
            rows: WIFI_OG_PACKAGES,
        });

        responseQueue.push({
            content: [{
                type: 'tool_use',
                id: 'toolu_mixed',
                name: 'start_extraction_run',
                input: {
                    templateIdentifier: 'solventless',
                    strain: 'Wi Fi OG',
                    inputs: [
                        // Explicit ID: consume pkg-wfog-1
                        { sourcePackageId: 'pkg-wfog-1', packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 15000 },
                        // Fuzzy + quantity: should find pkg-wfog-3 (30000g)
                        //   NOT pkg-wfog-1 since that's already consumed
                        { packageType: 'fresh_frozen', strain: 'Wi Fi OG', quantity: 30000 },
                    ],
                    startImmediately: true,
                },
            }],
            stop_reason: 'end_turn',
        });

        const res = await handler(makeEvent(), {} as never, () => undefined);
        const body = JSON.parse((res as { body: string }).body);
        const inputs = body.actions[0].data.inputs;

        expect(inputs).toHaveLength(2);
        expect(inputs[0].sourcePackageId).toBe('pkg-wfog-1');
        expect(inputs[1].sourcePackageId).toBe('pkg-wfog-3');
        // Two distinct rows
        expect(inputs[0].sourcePackageId).not.toBe(inputs[1].sourcePackageId);
    });
});
