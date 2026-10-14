import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttioClient, companyAttioValues, enrichmentNoteContent, personAttioValues, syncOrganizationToAttio } from '../src/attio';
import { closePool, getPool, withTransaction } from '../src/db';
import { validateDemoRequest } from '../src/demoRequest';
import { createDemoRequest } from '../src/prospects';
import { dbAvailable, resetDb, truncateAll } from './helpers';

const hasDb = await dbAvailable();

describe('Attio value mapping', () => {
    it('maps companies and people to Attio attribute values', () => {
        expect(companyAttioValues({ name: 'Acme', domain: 'acme.com' })).toEqual({ name: 'Acme', domains: ['acme.com'] });
        expect(companyAttioValues({ name: 'Acme', domain: null })).toEqual({ name: 'Acme' });
        expect(personAttioValues({ name: 'Jane Q Grower', email: 'j@acme.com', role: 'COO' }, 'rec_1')).toEqual({
            email_addresses: ['j@acme.com'],
            name: [{ first_name: 'Jane', last_name: 'Q Grower', full_name: 'Jane Q Grower' }],
            job_title: 'COO',
            company: [{ target_object: 'companies', target_record_id: 'rec_1' }],
        });
    });

    it('renders enrichment notes', () => {
        const text = enrichmentNoteContent(
            { summary: 'Indoor grower.', fit_score: 82, fit_reasons: ['Runs extraction'], states: ['CO'], sources: ['https://acme.com'] },
            [{ state: 'CO', license_number: '403-001', license_type: 'Cultivation', status: 'active' }],
        );
        expect(text).toContain('Fit score: 82/100');
        expect(text).toContain('CO 403-001 Cultivation (active)');
        expect(text).toContain('https://acme.com');
    });
});

function fakeAttio() {
    const calls: Array<{ method: string; path: string; body: any }> = [];
    let n = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const path = String(url).replace('https://api.attio.com/v2', '');
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? 'GET', path, body });
        n++;
        let id: Record<string, string>;
        if (path.startsWith('/objects/companies')) id = { record_id: 'co_1' };
        else if (path.startsWith('/objects/people')) id = { record_id: `pe_${n}` };
        else if (path.startsWith('/lists/')) id = { entry_id: `en_${n}` };
        else id = { note_id: `no_${n}` };
        return new Response(JSON.stringify({ data: { id } }), { status: 200 });
    }) as unknown as typeof fetch;
    return { client: new AttioClient('test', fetchFn), calls };
}

describe.skipIf(!hasDb)('syncOrganizationToAttio', () => {
    beforeAll(resetDb);
    beforeEach(truncateAll);
    afterAll(closePool);

    async function seed() {
        const v = validateDemoRequest({ name: 'Jane Grower', email: 'jane@acmefarms.com', company: 'Acme Farms', message: 'Hi there' });
        if (!v.ok) throw new Error('bad seed');
        return withTransaction(c => createDemoRequest(c, v.value, { ipHash: null, userAgent: null }));
    }

    it('returns false when Attio is not configured', async () => {
        const { organizationId } = await seed();
        expect(await syncOrganizationToAttio(getPool(), organizationId, null)).toBe(false);
    });

    it('asserts company + person, adds list entry and notes once, and stores ids', async () => {
        process.env.ATTIO_DEMO_LIST = 'demo_pipeline';
        const { organizationId } = await seed();
        await getPool().query(
            `INSERT INTO enrichment_runs (organization_id, provider, status, output) VALUES ($1, 'claude_research', 'succeeded', $2)`,
            [organizationId, JSON.stringify({ summary: 'Indoor grower.', fit_score: 80 })],
        );
        const { client, calls } = fakeAttio();

        expect(await syncOrganizationToAttio(getPool(), organizationId, client)).toBe(true);
        expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
            'PUT /objects/companies/records?matching_attribute=domains',
            'PUT /objects/people/records?matching_attribute=email_addresses',
            'PUT /lists/demo_pipeline/entries',
            'POST /notes',
            'POST /notes',
        ]);
        expect(calls[1].body.data.values.company).toEqual([{ target_object: 'companies', target_record_id: 'co_1' }]);
        expect(calls[3].body.data).toMatchObject({ parent_object: 'companies', parent_record_id: 'co_1', title: 'Demo request from Jane Grower', content: 'Hi there' });
        expect(calls[4].body.data.title).toBe('NeuroCann enrichment');

        const { rows: [org] } = await getPool().query(`SELECT attio_record_id, attio_synced_at, attio_sync_error FROM organizations`);
        expect(org.attio_record_id).toBe('co_1');
        expect(org.attio_synced_at).not.toBeNull();

        // Second sync only re-asserts records; entries and notes aren't duplicated.
        calls.length = 0;
        await syncOrganizationToAttio(getPool(), organizationId, client);
        expect(calls.map(c => c.path)).toEqual([
            '/objects/companies/records?matching_attribute=domains',
            '/objects/people/records?matching_attribute=email_addresses',
        ]);
        delete process.env.ATTIO_DEMO_LIST;
    });

    it('records the error and rethrows so the job retries', async () => {
        const { organizationId } = await seed();
        const failing = new AttioClient('test', (async () => new Response('{"message":"bad"}', { status: 400 })) as unknown as typeof fetch);
        await expect(syncOrganizationToAttio(getPool(), organizationId, failing)).rejects.toThrow(/400/);
        const { rows: [org] } = await getPool().query(`SELECT attio_sync_error FROM organizations`);
        expect(org.attio_sync_error).toMatch(/400/);
    });
});
