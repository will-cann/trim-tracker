import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool, withTransaction } from '../src/db';
import { validateDemoRequest } from '../src/demoRequest';
import { handleMcpRequest, isAuthorized } from '../src/mcp/server';
import { createDemoRequest } from '../src/prospects';
import { dbAvailable, queuedJobs, resetDb, truncateAll } from './helpers';

const hasDb = await dbAvailable();

describe('isAuthorized', () => {
    it('accepts only configured bearer keys', () => {
        expect(isAuthorized('Bearer k1', ['k1', 'k2'])).toBe(true);
        expect(isAuthorized('bearer k2', ['k1', 'k2'])).toBe(true);
        expect(isAuthorized('Bearer nope', ['k1'])).toBe(false);
        expect(isAuthorized(undefined, ['k1'])).toBe(false);
        expect(isAuthorized('Bearer k1', [])).toBe(false);
    });
});

describe.skipIf(!hasDb)('growth MCP server', () => {
    const rpc = async (method: string, params?: unknown, auth = 'Bearer test-key') => {
        const res = await handleMcpRequest(auth, JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
        return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
    };
    const call = async (name: string, args: Record<string, unknown> = {}) => (await rpc('tools/call', { name, arguments: args })).json.result;

    async function seed(email = 'jane@acmefarms.com') {
        const v = validateDemoRequest({ name: 'Jane Grower', email, company: 'Acme Farms', state: 'CO' });
        if (!v.ok) throw new Error('bad seed');
        return withTransaction(c => createDemoRequest(c, v.value, { ipHash: null, userAgent: null }));
    }

    beforeAll(resetDb);
    beforeEach(truncateAll);
    afterAll(closePool);

    it('rejects missing or wrong keys with 401', async () => {
        expect((await rpc('tools/list', {}, 'Bearer wrong')).status).toBe(401);
        expect((await rpc('tools/list', {}, '')).status).toBe(401);
    });

    it('initializes and lists tools', async () => {
        const init = await rpc('initialize', { protocolVersion: '2025-03-26' });
        expect(init.json.result.protocolVersion).toBe('2025-03-26');
        expect(init.json.result.serverInfo.name).toBe('neurocann-growth');
        const names = (await rpc('tools/list')).json.result.tools.map((t: any) => t.name);
        expect(names).toEqual(expect.arrayContaining(['pipeline_summary', 'list_demo_requests', 'get_prospect', 'log_note', 'enrich_organization']));
    });

    it('answers notifications with 202 and unknown methods with an error', async () => {
        const note = await handleMcpRequest('Bearer test-key', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
        expect(note.status).toBe(202);
        expect((await rpc('nope/method')).json.error.code).toBe(-32601);
    });

    it('lists, looks up and updates demo requests', async () => {
        const { demoRequestId, organizationId } = await seed();
        const list = await call('list_demo_requests', { status: 'requested' });
        expect(list.structuredContent.demo_requests).toHaveLength(1);

        const byDomain = await call('get_prospect', { domain: 'https://www.AcmeFarms.com/about' });
        expect(byDomain.structuredContent.organization.id).toBe(organizationId);
        const byEmail = await call('get_prospect', { email: 'JANE@acmefarms.com' });
        expect(byEmail.structuredContent.people[0].name).toBe('Jane Grower');

        const updated = await call('update_demo_request', { id: demoRequestId, scheduled_at: '2026-10-20T16:00:00Z' });
        expect(updated.structuredContent.status).toBe('scheduled');
        const done = await call('update_demo_request', { id: demoRequestId, status: 'completed' });
        expect(done.structuredContent.status).toBe('completed');
    });

    it('logs notes, moves stages, searches and summarizes', async () => {
        const { organizationId } = await seed();
        await truncateJobs();
        const note = await call('log_note', { email: 'jane@acmefarms.com', kind: 'call_note', body: 'Wants rosin yield tracking.' });
        expect(note.isError).toBeUndefined();
        const prospect = (await call('get_prospect', { organization_id: organizationId })).structuredContent;
        expect(prospect.notes[0]).toMatchObject({ kind: 'call_note', body: 'Wants rosin yield tracking.' });
        expect((await queuedJobs()).map(j => j.task_identifier)).toEqual(['sync_to_attio']);

        await call('update_organization', { domain: 'acmefarms.com', stage: 'trial' });
        const found = await call('search_prospects', { query: 'jane', stage: 'trial' });
        expect(found.structuredContent.organizations).toHaveLength(1);
        const summary = await call('pipeline_summary');
        expect(summary.structuredContent.organizations_by_stage).toEqual({ trial: 1 });
    });

    it('returns tool errors for bad input instead of throwing', async () => {
        const r = await call('get_prospect', { domain: 'nobody.example' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('No organization with domain nobody.example');
        expect((await call('update_demo_request', { id: 'not-a-uuid', status: 'completed' })).isError).toBe(true);
        expect((await call('list_demo_requests', { status: 'bogus' })).isError).toBe(true);
        expect((await call('no_such_tool')).isError).toBe(true);
    });

    it('queues enrichment and Attio sync', async () => {
        const { organizationId } = await seed();
        await truncateJobs();
        await call('enrich_organization', { domain: 'acmefarms.com', force: true });
        await call('sync_to_attio', { organization_id: organizationId });
        const jobs = await queuedJobs();
        expect(jobs.map(j => j.task_identifier)).toEqual(['enrich_organization', 'sync_to_attio']);
        expect(jobs[0].payload).toEqual({ organizationId, force: true });
    });
});

async function truncateJobs() {
    await getPool().query(`DELETE FROM graphile_worker._private_jobs`);
}
