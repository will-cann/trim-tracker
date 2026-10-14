import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePool, getPool, withTransaction } from '../src/db';
import { validateDemoRequest } from '../src/demoRequest';
import { enrichOrganization } from '../src/enrich';
import type { Research } from '../src/enrich/claudeResearch';
import { configuredLicenseSources, type LicenseSource } from '../src/enrich/licenses';
import { buildWhereClause, normalizeCompanyName, SocrataLicenseSource } from '../src/enrich/licenses/socrata';
import { createDemoRequest } from '../src/prospects';
import { dbAvailable, queuedJobs, resetDb, truncateAll } from './helpers';

const hasDb = await dbAvailable();

const socrataCfg = {
    state: 'co', domain: 'data.example.gov', dataset: 'abcd-1234',
    fields: { licenseNumber: 'license_no', legalName: 'licensee', dba: 'dba', licenseType: 'type', status: 'status' },
};

describe('Socrata license source', () => {
    it('normalizes legal suffixes', () => {
        expect(normalizeCompanyName('Acme Farms, L.L.C.')).toBe('ACME FARMS');
        expect(normalizeCompanyName('Green Co Inc.')).toBe('GREEN');
    });

    it('builds an escaped SoQL where clause', () => {
        const where = buildWhereClause(socrataCfg, { names: ["O'Neil Gardens LLC"], licenseNumbers: ['403-001'] });
        expect(where).toBe(
            "upper(license_no) = '403-001' OR upper(licensee) like '%O''NEIL GARDENS%' OR upper(dba) like '%O''NEIL GARDENS%'",
        );
        expect(buildWhereClause(socrataCfg, { names: ['Co'], licenseNumbers: [] })).toBe(null);
    });

    it('queries the dataset and maps rows', async () => {
        const fetchFn = vi.fn(async (url: string | URL | Request) => {
            expect(String(url)).toContain('https://data.example.gov/resource/abcd-1234.json?%24where=');
            return new Response(JSON.stringify([
                { license_no: '403-001', licensee: 'ACME FARMS LLC', type: 'Cultivation', status: 'Active' },
                { licensee: 'missing number' },
            ]));
        }) as unknown as typeof fetch;
        const rows = await new SocrataLicenseSource(socrataCfg, fetchFn).search({ names: ['Acme Farms'], licenseNumbers: [] });
        expect(rows).toEqual([expect.objectContaining({
            state: 'CO', licenseNumber: '403-001', legalName: 'ACME FARMS LLC', licenseType: 'Cultivation', status: 'Active',
            source: 'socrata:data.example.gov/abcd-1234',
        })]);
    });

    it('reads sources from LICENSE_SOURCES and tolerates bad JSON', () => {
        expect(configuredLicenseSources(JSON.stringify([socrataCfg]))[0].state).toBe('CO');
        expect(configuredLicenseSources('{nope')).toEqual([]);
        expect(configuredLicenseSources(undefined)).toEqual([]);
    });
});

describe.skipIf(!hasDb)('enrichOrganization', () => {
    beforeAll(resetDb);
    beforeEach(truncateAll);
    afterAll(closePool);

    const research: Research = {
        summary: 'Indoor cultivator and rosin producer in Denver.',
        operation_types: ['cultivation', 'extraction'],
        states: ['CO'],
        estimated_canopy: '30,000 sq ft',
        license_numbers: [{ state: 'CO', license_number: '403-001' }, { state: 'CO', license_number: '999-UNCONFIRMED' }],
        fit_score: 86,
        fit_reasons: ['Licensed cultivator', 'Runs extraction'],
        sources: ['https://acmefarms.com'],
    };

    async function seed() {
        const v = validateDemoRequest({ name: 'Jane', email: 'jane@acmefarms.com', company: 'Acme Farms', state: 'CO' });
        if (!v.ok) throw new Error('bad seed');
        const created = await withTransaction(c => createDemoRequest(c, v.value, { ipHash: null, userAgent: null }));
        await getPool().query(`DELETE FROM graphile_worker._private_jobs`);
        return created;
    }

    it('stores research, verified + unverified licenses, and queues an Attio sync', async () => {
        const { organizationId } = await seed();
        const coSource: LicenseSource = {
            state: 'CO',
            search: vi.fn(async q => {
                expect(q.licenseNumbers).toEqual(['403-001', '999-UNCONFIRMED']);
                return [{
                    state: 'CO', licenseNumber: '403-001', licenseType: 'Cultivation', status: 'Active', legalName: 'ACME FARMS LLC',
                    dba: null, city: 'Denver', expiresOn: '2027-01-31', source: 'socrata:test', raw: {},
                }];
            }),
        };
        const waSource: LicenseSource = { state: 'WA', search: vi.fn(async () => []) };
        const researchFn = vi.fn(async () => ({ output: research, inputTokens: 1200, outputTokens: 300 }));

        const outcome = await enrichOrganization(getPool(), organizationId, {}, { research: researchFn, licenseSources: [coSource, waSource] });
        expect(outcome).toEqual({ status: 'enriched', fitScore: 86, licenses: 2 });
        expect(researchFn).toHaveBeenCalledWith(expect.objectContaining({ company: 'Acme Farms', domain: 'acmefarms.com', statedState: 'CO' }));
        expect(waSource.search).not.toHaveBeenCalled();

        const db = getPool();
        const { rows: [org] } = await db.query(`SELECT fit_score, enrichment, enriched_at FROM organizations`);
        expect(org.fit_score).toBe(86);
        expect(org.enrichment.summary).toContain('rosin');
        const { rows: licenses } = await db.query(`SELECT license_number, status, source FROM licenses ORDER BY license_number`);
        expect(licenses).toEqual([
            { license_number: '403-001', status: 'Active', source: 'socrata:test' },
            { license_number: '999-UNCONFIRMED', status: 'unverified', source: 'claude_research' },
        ]);
        const { rows: [run] } = await db.query(`SELECT status, input_tokens, output_tokens FROM enrichment_runs`);
        expect(run).toEqual({ status: 'succeeded', input_tokens: 1200, output_tokens: 300 });
        expect((await queuedJobs()).map(j => j.task_identifier)).toEqual(['sync_to_attio']);

        // Within the refresh window it's skipped unless forced.
        expect((await enrichOrganization(db, organizationId, {}, { research: researchFn, licenseSources: [] })).status).toBe('skipped');
        expect((await enrichOrganization(db, organizationId, { force: true }, { research: researchFn, licenseSources: [] })).status).toBe('enriched');
    });

    it('skips cleanly with no providers, and records research failures', async () => {
        const { organizationId } = await seed();
        const none = await enrichOrganization(getPool(), organizationId, {}, { research: async () => null, licenseSources: [] });
        expect(none).toEqual({ status: 'skipped', reason: 'no enrichment providers configured' });

        await expect(enrichOrganization(getPool(), organizationId, {}, {
            research: async () => { throw new Error('boom'); }, licenseSources: [],
        })).rejects.toThrow('boom');
        const { rows } = await getPool().query(`SELECT status, error FROM enrichment_runs ORDER BY started_at`);
        expect(rows).toEqual([{ status: 'skipped', error: 'ANTHROPIC_API_KEY unset' }, { status: 'failed', error: 'boom' }]);
    });
});
