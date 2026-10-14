import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/db';
import { createApp } from '../src/server';
import { dbAvailable, queuedJobs, resetDb, truncateAll } from './helpers';

const hasDb = await dbAvailable();

describe.skipIf(!hasDb)('POST /v1/demo-requests', () => {
    const app = createApp();
    const post = (body: unknown, ip = '10.0.0.1') => app.request('/v1/demo-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 100.64.0.1` },
        body: JSON.stringify(body),
    });

    beforeAll(resetDb);
    beforeEach(truncateAll);
    afterAll(closePool);

    it('stores org, person, request, message and activity, and queues follow-up jobs', async () => {
        process.env.DEMO_SCHEDULING_URL = 'https://cal.com/neurocann/demo';
        const res = await post({
            name: 'Jane Grower', email: 'jane@acmefarms.com', company: 'Acme Farms', state: 'CO',
            operationType: 'cultivation', message: 'Four flower rooms.', source: 'hero', utmSource: 'google',
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            ok: true, schedulingUrl: 'https://cal.com/neurocann/demo?name=Jane+Grower&email=jane%40acmefarms.com',
        });
        delete process.env.DEMO_SCHEDULING_URL;

        const db = getPool();
        const { rows: [org] } = await db.query(`SELECT * FROM organizations`);
        expect(org).toMatchObject({ name: 'Acme Farms', domain: 'acmefarms.com', stage: 'demo' });
        const { rows: [req] } = await db.query(`SELECT * FROM demo_requests`);
        expect(req).toMatchObject({ organization_id: org.id, state: 'CO', source: 'hero', utm_source: 'google', status: 'requested' });
        expect(req.ip_hash).toMatch(/^[0-9a-f]{64}$/);
        expect((await db.query(`SELECT body FROM messages`)).rows).toEqual([{ body: 'Four flower rooms.' }]);
        expect((await db.query(`SELECT type FROM activities`)).rows).toEqual([{ type: 'demo_requested' }]);

        const jobs = await queuedJobs();
        expect(jobs.map(j => j.task_identifier)).toEqual(['notify_demo_request', 'send_demo_confirmation', 'enrich_organization', 'sync_to_attio']);
        expect(jobs[2].key).toBe(`enrich:${org.id}`);
    });

    it('groups colleagues by work domain and collapses repeat enrichment jobs', async () => {
        await post({ name: 'A', email: 'a@acmefarms.com', company: 'Acme Farms' });
        await post({ name: 'B', email: 'b@acmefarms.com', company: 'ACME' });
        const db = getPool();
        expect((await db.query(`SELECT COUNT(*)::int AS n FROM organizations`)).rows[0].n).toBe(1);
        expect((await db.query(`SELECT COUNT(DISTINCT organization_id)::int AS n FROM people`)).rows[0].n).toBe(1);
        const enrichJobs = (await queuedJobs()).filter(j => j.task_identifier === 'enrich_organization');
        expect(enrichJobs).toHaveLength(1);
    });

    it('gives freemail sign-ups their own org and reuses it on repeat', async () => {
        await post({ name: 'C', email: 'c@gmail.com', company: 'C Gardens' });
        await post({ name: 'C', email: 'c@gmail.com', company: 'C Gardens' });
        await post({ name: 'D', email: 'd@gmail.com', company: 'D Farms' });
        const db = getPool();
        const { rows } = await db.query(`SELECT name, domain FROM organizations ORDER BY name`);
        expect(rows).toEqual([{ name: 'C Gardens', domain: null }, { name: 'D Farms', domain: null }]);
        expect((await db.query(`SELECT COUNT(*)::int AS n FROM demo_requests`)).rows[0].n).toBe(3);
    });

    it('does not demote a customer back to the demo stage', async () => {
        await post({ name: 'E', email: 'e@bigco.com', company: 'BigCo' });
        await getPool().query(`UPDATE organizations SET stage = 'customer'`);
        await post({ name: 'F', email: 'f@bigco.com', company: 'BigCo' });
        expect((await getPool().query(`SELECT stage FROM organizations`)).rows[0].stage).toBe('customer');
    });

    it('rejects invalid input, swallows honeypot hits, and rate-limits by IP', async () => {
        expect((await post({ name: 'x', email: 'bad', company: 'y' })).status).toBe(400);

        const spam = await post({ name: 'bot', email: 'bot@x.co', company: 'y', website: 'http://spam' });
        expect(spam.status).toBe(200);
        expect((await getPool().query(`SELECT COUNT(*)::int AS n FROM demo_requests`)).rows[0].n).toBe(0);

        for (let i = 0; i < 5; i++) {
            expect((await post({ name: `P${i}`, email: `p${i}@gmail.com`, company: 'Co' }, '7.7.7.7')).status).toBe(200);
        }
        expect((await post({ name: 'P6', email: 'p6@gmail.com', company: 'Co' }, '7.7.7.7')).status).toBe(429);
        expect((await post({ name: 'Q', email: 'q@gmail.com', company: 'Co' }, '8.8.8.8')).status).toBe(200);
    });

    it('rejects non-JSON bodies', async () => {
        const res = await app.request('/v1/demo-requests', { method: 'POST', body: 'not json' });
        expect(res.status).toBe(400);
    });
});
