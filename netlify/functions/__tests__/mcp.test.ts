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

const verifyTokenMock = vi.fn();
const contextForAuth0UserMock = vi.fn();
vi.mock('../utils/auth', () => ({
    verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
    contextForAuth0User: (...args: unknown[]) => contextForAuth0UserMock(...args),
    DEV_BYPASS_CONTEXT: { userId: 'dev', companyId: 'dev-co', role: 'admin', departments: [] },
}));

import { handler } from '../mcp';
import { handler as metadataHandler } from '../oauth-protected-resource';
import { hashApiKey, generateApiKey } from '../utils/apiKeys';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOST = 'neurocann.app';
const MCP_RESOURCE = `https://${HOST}/mcp`;
const METADATA_URL = `https://${HOST}/.well-known/oauth-protected-resource`;

function event(body: unknown, headers: Record<string, string> = {}, httpMethod = 'POST'): HandlerEvent {
    return {
        httpMethod,
        headers: { 'content-type': 'application/json', host: HOST, 'x-forwarded-proto': 'https', ...headers },
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
    sqlMock.mockResolvedValue({ rows: [] });
    poolQuery.mockReset();
    verifyTokenMock.mockReset();
    verifyTokenMock.mockResolvedValue(null);
    contextForAuth0UserMock.mockReset();
    contextForAuth0UserMock.mockResolvedValue({ userId: USER, companyId: COMPANY, role: 'technician', departments: [] });
    delete process.env.MCP_RESOURCE;
    process.env.AUTH0_DOMAIN = 'login.neurocann.app';
});

const PUBLIC_TOOLS = ['about_neurocann', 'plan_extraction_inputs', 'estimate_dry_weight', 'estimate_harvest_yield', 'plan_harvest_timeline', 'estimate_trim_labor'];

describe('anonymous access (ChatGPT pre-sign-in)', () => {
    it('lets anonymous callers initialize and see every tool with securitySchemes', async () => {
        const init = await call(rpc('initialize', { protocolVersion: '2025-06-18' }));
        expect(init.status).toBe(200);
        expect(init.json.result.instructions).toMatch(/plan_extraction_inputs/);

        const list = await call(rpc('tools/list'));
        expect(list.status).toBe(200);
        const byName = Object.fromEntries(list.json.result.tools.map((t: any) => [t.name, t]));
        for (const name of PUBLIC_TOOLS) {
            expect(byName[name].securitySchemes).toEqual(expect.arrayContaining([{ type: 'noauth' }]));
        }
        expect(byName.list_harvests.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['read:facility'] }]);
        expect(byName.create_task.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['read:facility', 'write:tasks'] }]);
        for (const t of list.json.result.tools) expect(t.scope).toBeUndefined();
    });

    it('runs public tools without credentials and without touching the database', async () => {
        const res = await call(rpc('tools/call', { name: 'plan_extraction_inputs', arguments: { targetProduct: 'rosin', targetAmount: 500 } }));
        expect(res.status).toBe(200);
        expect(res.json.result.isError).toBeUndefined();
        const plan = res.json.result.structuredContent;
        // 500 g rosin ÷ (5% × 96% × 60%) ≈ 17.36 kg fresh frozen ≈ 38.3 lb
        expect(plan.startingMaterial.type).toBe('fresh_frozen');
        expect(plan.startingMaterial.required.pounds).toBeCloseTo(38.3, 0);
        expect(plan.overallYieldPct).toBeCloseTo(2.88, 1);
        expect(plan.steps.map((s: any) => s.step)).toEqual(['Wash (ice water)', 'Freeze dry', 'Press']);
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it('points prospects at the privacy policy and terms from about_neurocann', async () => {
        const res = await call(rpc('tools/call', { name: 'about_neurocann', arguments: {} }));
        expect(res.status).toBe(200);
        const links = res.json.result.structuredContent.links;
        expect(links.privacyPolicy).toMatch(/\/privacy$/);
        expect(links.termsOfService).toMatch(/\/terms$/);
    });

    it('challenges anonymous calls to facility tools with mcp/www_authenticate instead of a 401', async () => {
        const res = await call(rpc('tools/call', { name: 'list_harvests', arguments: {} }));
        expect(res.status).toBe(200);
        expect(res.json.result.isError).toBe(true);
        const challenge = res.json.result._meta['mcp/www_authenticate'][0];
        expect(challenge).toContain(`resource_metadata="${METADATA_URL}"`);
        expect(challenge).toContain('error="invalid_token"');
        expect(challenge).toMatch(/error_description="/);
        expect(challenge).toContain('scope="read:facility"');
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it('serves RFC 9728 protected-resource metadata pointing at Auth0', async () => {
        const res = await metadataHandler(event(undefined, {}, 'GET'), {} as any);
        expect(res!.statusCode).toBe(200);
        const doc = JSON.parse(res!.body!);
        expect(doc.resource).toBe(MCP_RESOURCE);
        expect(doc.authorization_servers).toEqual(['https://login.neurocann.app/']);
        expect(doc.scopes_supported).toEqual(expect.arrayContaining(['openid', 'offline_access', 'read:facility', 'write:tasks']));
        expect(doc.resource_policy_uri).toBe(`https://${HOST}/privacy`);
        expect(doc.resource_tos_uri).toBe(`https://${HOST}/terms`);
    });

    it('honours MCP_RESOURCE when the public identifier differs from the request host', async () => {
        process.env.MCP_RESOURCE = 'https://app.example.com/mcp';
        const res = await metadataHandler(event(undefined, { host: 'internal.netlify.app' }, 'GET'), {} as any);
        expect(JSON.parse(res!.body!).resource).toBe('https://app.example.com/mcp');
    });
});

describe('OAuth tokens (ChatGPT / claude.ai after linking)', () => {
    it('verifies tokens against the MCP resource audience and derives scopes from the token', async () => {
        verifyTokenMock.mockResolvedValue({ sub: 'auth0|1', aud: [MCP_RESOURCE], scope: 'openid read:facility' });
        const list = await call(rpc('tools/list'), { authorization: 'Bearer eyJhbGciOi.jwt.token' });
        expect(verifyTokenMock).toHaveBeenCalledWith('Bearer eyJhbGciOi.jwt.token', [MCP_RESOURCE]);
        const names = list.json.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_harvests');
        expect(names).not.toContain('create_task');
    });

    it('grants write tools when the token carries write:tasks', async () => {
        verifyTokenMock.mockResolvedValue({ sub: 'auth0|1', aud: MCP_RESOURCE, scope: 'read:facility write:tasks' });
        const list = await call(rpc('tools/list'), { authorization: 'Bearer eyJhbGciOi.jwt.token' });
        expect(list.json.result.tools.map((t: any) => t.name)).toContain('create_task');
    });

    it('asks for an upgraded link (insufficient_scope) when a read-only token calls a write tool', async () => {
        verifyTokenMock.mockResolvedValue({ sub: 'auth0|1', aud: MCP_RESOURCE, scope: 'read:facility' });
        const res = await call(rpc('tools/call', { name: 'create_task', arguments: { title: 'x' } }), { authorization: 'Bearer eyJhbGciOi.jwt.token' });
        expect(res.json.result.isError).toBe(true);
        expect(res.json.result._meta['mcp/www_authenticate'][0]).toContain('error="insufficient_scope"');
    });

    it('treats in-app session tokens (app audience) as full access', async () => {
        verifyTokenMock.mockResolvedValue({ sub: 'auth0|1', aud: 'https://api.neurocann.app' });
        const list = await call(rpc('tools/list'), { authorization: 'Bearer eyJhbGciOi.jwt.token' });
        expect(list.json.result.tools.map((t: any) => t.name)).toContain('create_task');
    });

    it('returns 401 with a resource_metadata challenge for tokens that do not verify', async () => {
        verifyTokenMock.mockResolvedValue(null);
        const res = await call(rpc('ping'), { authorization: 'Bearer garbage' });
        expect(res.status).toBe(401);
        expect(res.headers['WWW-Authenticate']).toContain(`resource_metadata="${METADATA_URL}"`);
        expect(res.headers['WWW-Authenticate']).toContain('error="invalid_token"');
    });
});

describe('transport', () => {
    it('rejects unknown API keys with 401', async () => {
        installApiKey(['read']);
        const res = await call(rpc('ping'), { authorization: 'Bearer nck_doesnotexist' });
        expect(res.status).toBe(401);
        expect(res.headers['WWW-Authenticate']).toContain('Bearer');
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
    it('lists public + read tools for read-only keys, with annotations and schemas', async () => {
        const key = installApiKey(['read']);
        const res = await call(rpc('tools/list'), { authorization: `Bearer ${key}` });
        const tools = res.json.result.tools;
        const names = tools.map((t: any) => t.name);
        expect(names).toEqual(expect.arrayContaining([...PUBLIC_TOOLS, 'get_facility_overview', 'list_harvests', 'list_packages', 'list_plants', 'list_tasks', 'run_report']));
        expect(names).not.toContain('create_task');
        expect(names).not.toContain('update_task_status');
        for (const t of tools) {
            expect(t.inputSchema.type).toBe('object');
            expect(t.annotations.readOnlyHint).toBe(true);
            expect(t.description.length).toBeGreaterThan(20);
        }
    });

    it('estimates dry weight with the product default moisture loss', async () => {
        const res = await call(rpc('tools/call', { name: 'estimate_dry_weight', arguments: { wetWeight: 100, unit: 'lb', plantCount: 50 } }));
        const out = res.json.result.structuredContent;
        expect(out.estimatedDryWeight.pounds).toBeCloseTo(25, 1);
        expect(out.perPlant.plants).toBe(50);
        expect(out.perPlant.wet.pounds).toBeCloseTo(2, 1);
    });

    it('plans a harvest timeline forwards from a flip date and backwards from a target harvest', async () => {
        const fwd = await call(rpc('tools/call', { name: 'plan_harvest_timeline', arguments: { flipDate: '2026-10-01', vegDays: 28 } }));
        const m = fwd.json.result.structuredContent.milestones;
        expect(m).toMatchObject({ vegStart: '2026-09-03', flipToFlower: '2026-10-01', harvest: '2026-12-03', dryingComplete: '2026-12-13', cureComplete: '2026-12-27' });

        const back = await call(rpc('tools/call', { name: 'plan_harvest_timeline', arguments: { targetHarvestDate: '2026-12-03', floweringDays: 56 } }));
        expect(back.json.result.structuredContent.milestones.flipToFlower).toBe('2026-10-08');

        const neither = await call(rpc('tools/call', { name: 'plan_harvest_timeline', arguments: {} }));
        expect(neither.json.result.isError).toBe(true);
    });

    it('estimates harvest yield from canopy and splits it into flower, trim and shake', async () => {
        const res = await call(rpc('tools/call', { name: 'estimate_harvest_yield', arguments: { canopySqFt: 1000, plantsPerSqFt: 0.1, pricePerLbFlower: 1000 } }));
        const out = res.json.result.structuredContent;
        expect(out.plants).toBe(100);
        expect(out.expectedDryWeight.grams).toBe(45000);
        expect(out.expectedWetWeight.grams).toBe(180000);
        expect(out.split.flower.grams).toBe(31500);
        expect(out.split.trim.sharePct + out.split.flower.sharePct + out.split.shake.sharePct).toBe(100);
        expect(out.estimatedRevenue.flowerUsd).toBeCloseTo(69445, -1);
    });

    it('estimates trim labor, crew size and cost', async () => {
        const res = await call(rpc('tools/call', { name: 'estimate_trim_labor', arguments: { dryWeight: 100, unit: 'lb', targetDays: 5, hourlyRateUsd: 20 } }));
        const out = res.json.result.structuredContent;
        // 45,359 g ÷ 75 g/hr ≈ 605 trimmer-hours → 16 trimmers over 5 × 8 h days
        expect(out.trimmerHours).toBeCloseTo(604.8, 0);
        expect(out.crewNeeded.trimmers).toBe(16);
        expect(out.laborCost.perLbUsd).toBeCloseTo(120.96, 1);
        expect(sqlMock).not.toHaveBeenCalled();
    });

    it('rejects nonsense public-tool input as a tool error', async () => {
        const res = await call(rpc('tools/call', { name: 'plan_extraction_inputs', arguments: { targetProduct: 'rosin', targetAmount: 10, targetUnit: 'carts' } }));
        expect(res.json.result.isError).toBe(true);
        expect(res.json.result.content[0].text).toMatch(/carts/);
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
