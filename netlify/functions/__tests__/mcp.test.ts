// @vitest-environment node
/**
 * MCP (LLM plugin) endpoint tests — JSON-RPC framing, auth, scope enforcement
 * and company scoping of tool queries. The Neon driver is mocked so these run
 * without a database.
 *
 * Run with: npx vitest run netlify/functions/__tests__/mcp.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerEvent } from '@netlify/functions';

const sqlMock = vi.fn();
const poolQuery = vi.fn();

vi.mock('../utils/db', () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => sqlMock(strings.join('?').trim(), values),
    pool: { connect: async () => ({ query: poolQuery, release: () => {} }) },
}));

vi.mock('../utils/rateLimit', () => ({
    checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 100 })),
}));

vi.mock('../utils/sentry', () => ({ captureError: () => {} }));

const resolveContextMock = vi.fn();
vi.mock('../utils/auth', () => ({
    resolveContext: (...args: unknown[]) => resolveContextMock(...args),
}));

import { handler } from '../mcp';
import { hashApiKey, generateApiKey } from '../utils/apiKeys';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function event(body: unknown, headers: Record<string, string> = {}, httpMethod = 'POST'): HandlerEvent {
    return {
        httpMethod,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
        path: '/mcp',
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        multiValueHeaders: {},
        isBase64Encoded: false,
        rawUrl: 'http://localhost/mcp',
        rawQuery: '',
    } as unknown as HandlerEvent;
}

async function call(body: unknown, headers: Record<string, string> = {}, httpMethod = 'POST') {
    const res = await handler(event(body, headers, httpMethod), {} as any);
    return { status: res!.statusCode, headers: res!.headers ?? {}, json: res!.body ? JSON.parse(res!.body) : undefined };
}

/** Make the mocked `sql` recognise one API key with the given scopes. */
function installApiKey(scopes: string[]) {
    const { key, hash } = generateApiKey();
    sqlMock.mockImplementation(async (text: string, values: unknown[]) => {
        if (text.includes('FROM api_keys k')) {
            return values[0] === hash
                ? { rows: [{ id: 'key-1', company_id: COMPANY, user_id: USER, scopes, role: 'admin', departments: [] }] }
                : { rows: [] };
        }
        if (text.startsWith('UPDATE api_keys')) return { rows: [] };
        return { rows: [] };
    });
    return key;
}

const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, params });

beforeEach(() => {
    sqlMock.mockReset();
    poolQuery.mockReset();
    resolveContextMock.mockReset();
    resolveContextMock.mockResolvedValue(null);
});

describe('transport', () => {
    it('rejects unauthenticated requests with 401 + WWW-Authenticate', async () => {
        sqlMock.mockResolvedValue({ rows: [] });
        const res = await call(rpc('initialize'));
        expect(res.status).toBe(401);
        expect(res.headers['WWW-Authenticate']).toContain('Bearer');
        expect(res.json.error.message).toMatch(/nck_/);
    });

    it('rejects unknown API keys', async () => {
        installApiKey(['read']);
        const res = await call(rpc('ping'), { authorization: 'Bearer nck_doesnotexist' });
        expect(res.status).toBe(401);
    });

    it('falls back to Auth0 session context for non-key bearer tokens', async () => {
        resolveContextMock.mockResolvedValue({ userId: USER, companyId: COMPANY, role: 'technician', departments: [] });
        const res = await call(rpc('tools/list'), { authorization: 'Bearer eyJhbGciOi.jwt.token' });
        expect(res.status).toBe(200);
        // Session auth gets both scopes, so write tools are listed.
        const names = res.json.result.tools.map((t: any) => t.name);
        expect(names).toContain('create_task');
    });

    it('answers initialize with negotiated protocol version and instructions', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }), { authorization: `Bearer ${key}` });
        expect(res.status).toBe(200);
        expect(res.json.result.protocolVersion).toBe('2025-03-26');
        expect(res.json.result.serverInfo.name).toBe('neurocann');
        expect(res.json.result.capabilities.tools).toBeDefined();
        expect(res.json.result.instructions).toMatch(/get_facility_overview/);
    });

    it('falls back to the latest protocol version for unknown requests', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('initialize', { protocolVersion: '1999-01-01' }), { authorization: `Bearer ${key}` });
        expect(res.json.result.protocolVersion).toBe('2025-06-18');
    });

    it('returns 202 with no body for notifications', async () => {
        const key = installApiKey(['read']);
        const res = await call({ jsonrpc: '2.0', method: 'notifications/initialized' }, { authorization: `Bearer ${key}` });
        expect(res.status).toBe(202);
        expect(res.json).toBeUndefined();
    });

    it('handles batches and skips notifications inside them', async () => {
        const key = installApiKey(['read']);
        const res = await call([rpc('ping', undefined, 'a'), { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc('ping', undefined, 'b')], { authorization: `Bearer ${key}` });
        expect(res.status).toBe(200);
        expect(res.json.map((r: any) => r.id)).toEqual(['a', 'b']);
    });

    it('returns a JSON-RPC parse error for malformed bodies', async () => {
        const key = installApiKey(['read']);
        const res = await call('{not json', { authorization: `Bearer ${key}` });
        expect(res.status).toBe(400);
        expect(res.json.error.code).toBe(-32700);
    });

    it('returns method-not-found for unknown methods', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('does/not/exist'), { authorization: `Bearer ${key}` });
        expect(res.json.error.code).toBe(-32601);
    });

    it('refuses GET (no SSE) and answers OPTIONS for CORS preflight', async () => {
        expect((await call(undefined, {}, 'GET')).status).toBe(405);
        const opts = await call(undefined, {}, 'OPTIONS');
        expect(opts.status).toBe(204);
        expect(opts.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });
});

describe('tools', () => {
    it('lists only read tools for read-only keys, with annotations and schemas', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('tools/list'), { authorization: `Bearer ${key}` });
        const tools = res.json.result.tools;
        const names = tools.map((t: any) => t.name);
        expect(names).toEqual(expect.arrayContaining(['get_facility_overview', 'list_harvests', 'list_packages', 'list_plants', 'list_tasks', 'run_report']));
        expect(names).not.toContain('create_task');
        expect(names).not.toContain('update_task_status');
        for (const t of tools) {
            expect(t.inputSchema.type).toBe('object');
            expect(t.annotations.readOnlyHint).toBe(true);
        }
    });

    it('blocks write tools for read-only keys even when called directly', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('tools/call', { name: 'create_task', arguments: { title: 'Flip room B' } }), { authorization: `Bearer ${key}` });
        expect(res.status).toBe(200);
        expect(res.json.result.isError).toBe(true);
        expect(res.json.result.content[0].text).toMatch(/write/);
        expect(sqlMock.mock.calls.some(([text]) => String(text).startsWith('INSERT INTO human_tasks'))).toBe(false);
    });

    it('scopes list queries to the key owner company', async () => {
        const key = installApiKey(['read']);
        const base = sqlMock.getMockImplementation()!;
        sqlMock.mockImplementation(async (text: string, values: unknown[]) => {
            if (text.includes('FROM harvests')) {
                return { rows: [{ id: 'h1', batch_id: 'B1', name: 'OGK Oct', strain: 'OG Kush', status: 'drying', total_wet_weight: '12345.50', plant_count: 40 }] };
            }
            return base(text, values);
        });
        const res = await call(rpc('tools/call', { name: 'list_harvests', arguments: { status: 'drying' } }), { authorization: `Bearer ${key}` });
        expect(res.json.result.isError).toBeUndefined();
        const harvestCall = sqlMock.mock.calls.find(([text]) => String(text).includes('FROM harvests'))!;
        expect(harvestCall[0]).toMatch(/company_id = \?/);
        expect(harvestCall[1]).toContain(COMPANY);
        const parsed = JSON.parse(res.json.result.content[0].text);
        expect(parsed[0]).toMatchObject({ id: 'h1', strain: 'OG Kush', totalWetWeightG: 12345.5 });
    });

    it('creates tasks attributed to the key owner when write scope is present', async () => {
        const key = installApiKey(['read', 'write']);
        const base = sqlMock.getMockImplementation()!;
        sqlMock.mockImplementation(async (text: string, values: unknown[]) => {
            if (text.startsWith('INSERT INTO human_tasks')) {
                return { rows: [{ id: 't1', title: values[1], priority: values[3], category: values[4], status: 'pending', created_at: 'now' }] };
            }
            return base(text, values);
        });
        const res = await call(rpc('tools/call', { name: 'create_task', arguments: { title: 'Check Veg 2 for mites', priority: 'high', category: 'ipm' } }), { authorization: `Bearer ${key}` });
        expect(res.json.result.isError).toBeUndefined();
        expect(res.json.result.structuredContent).toMatchObject({ id: 't1', title: 'Check Veg 2 for mites', priority: 'high', category: 'ipm' });
        const insert = sqlMock.mock.calls.find(([text]) => String(text).startsWith('INSERT INTO human_tasks'))!;
        expect(insert[1][0]).toBe(COMPANY);
        expect(insert[1]).toContain(USER);
    });

    it('surfaces validation problems as tool errors, not protocol errors', async () => {
        const key = installApiKey(['read', 'write']);
        const res = await call(rpc('tools/call', { name: 'create_task', arguments: { title: 'x', priority: 'asap' } }), { authorization: `Bearer ${key}` });
        expect(res.status).toBe(200);
        expect(res.json.result.isError).toBe(true);
        expect(res.json.result.content[0].text).toMatch(/priority/);
    });

    it('returns an error result for unknown tools', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('tools/call', { name: 'drop_everything' }), { authorization: `Bearer ${key}` });
        expect(res.json.result.isError).toBe(true);
    });

    it('runs reports read-only through the allowlisted compiler', async () => {
        const key = installApiKey(['read']);
        poolQuery.mockImplementation(async (text: string) => {
            if (text.startsWith('SELECT')) return { rows: [{ strain: 'OG Kush', total: 500 }] };
            return { rows: [] };
        });
        const res = await call(rpc('tools/call', {
            name: 'run_report',
            arguments: {
                from: 'harvests',
                columns: [{ expr: 'harvests.strain', alias: 'strain' }, { expr: 'harvests.total_wet_weight', alias: 'total', agg: 'sum' }],
                groupBy: ['harvests.strain'],
            },
        }), { authorization: `Bearer ${key}` });
        expect(res.json.result.isError).toBeUndefined();
        expect(res.json.result.structuredContent).toEqual({ rowCount: 1, rows: [{ strain: 'OG Kush', total: 500 }] });
        const statements = poolQuery.mock.calls.map(c => c[0]);
        expect(statements).toContain('SET TRANSACTION READ ONLY');
        const select = poolQuery.mock.calls.find(c => String(c[0]).startsWith('SELECT'))!;
        expect(select[0]).toContain('"harvests"."company_id" = $1');
        expect(select[1][0]).toBe(COMPANY);
    });

    it('rejects report specs that reference tables outside the allowlist', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('tools/call', {
            name: 'run_report',
            arguments: { from: 'api_keys', columns: [{ expr: 'api_keys.key_hash', alias: 'h' }] },
        }), { authorization: `Bearer ${key}` });
        expect(res.json.result.isError).toBe(true);
        expect(poolQuery).not.toHaveBeenCalled();
    });
});

describe('api key helpers', () => {
    it('generates prefixed keys whose hash is stable', () => {
        const { key, prefix, hash } = generateApiKey();
        expect(key.startsWith('nck_')).toBe(true);
        expect(prefix).toBe(key.slice(0, 12));
        expect(hash).toBe(hashApiKey(key));
        expect(hash).toHaveLength(64);
        expect(generateApiKey().key).not.toBe(key);
    });
});
