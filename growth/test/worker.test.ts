import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePool, getPool, withTransaction } from '../src/db';
import { validateDemoRequest } from '../src/demoRequest';
import { createDemoRequest } from '../src/prospects';
import { buildDigest, buildTaskHandlers } from '../src/worker';
import { dbAvailable, resetDb, truncateAll } from './helpers';

const hasDb = await dbAvailable();

describe.skipIf(!hasDb)('worker tasks', () => {
    beforeAll(resetDb);
    beforeEach(truncateAll);
    afterAll(closePool);

    async function seed() {
        const v = validateDemoRequest({ name: 'Jane Grower', email: 'jane@acmefarms.com', company: 'Acme Farms' });
        if (!v.ok) throw new Error('bad seed');
        return withTransaction(c => createDemoRequest(c, v.value, { ipHash: null, userAgent: null }));
    }

    it('sends the notification once and marks it notified', async () => {
        const { demoRequestId } = await seed();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const handlers = buildTaskHandlers(getPool());
        await handlers.notify_demo_request({ demoRequestId });
        await handlers.notify_demo_request({ demoRequestId });
        const sends = log.mock.calls.filter(c => c[0] === '[email:stub]');
        log.mockRestore();
        expect(sends).toHaveLength(1);
        expect(sends[0][1]).toMatchObject({ to: 'will@neurocann.app', subject: 'Demo request: Acme Farms (Jane Grower)' });
        const { rows: [r] } = await getPool().query(`SELECT notified_at FROM demo_requests`);
        expect(r.notified_at).not.toBeNull();
    });

    it('sends the prospect a confirmation with the scheduling link', async () => {
        process.env.DEMO_SCHEDULING_URL = 'https://cal.com/neurocann/demo';
        const { demoRequestId } = await seed();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        await buildTaskHandlers(getPool()).send_demo_confirmation({ demoRequestId });
        const send = log.mock.calls.find(c => c[0] === '[email:stub]');
        log.mockRestore();
        delete process.env.DEMO_SCHEDULING_URL;
        expect(send?.[1]).toMatchObject({ to: 'jane@acmefarms.com', subject: 'Your NeuroCann demo request' });
        expect(send?.[1].preview).toContain('Hi Jane');
    });

    it('builds a digest of new and stale requests, or nothing', async () => {
        expect(await buildDigest(getPool())).toBeNull();
        await seed();
        await getPool().query(
            `INSERT INTO demo_requests (person_id, organization_id, company_name, created_at)
             SELECT person_id, organization_id, 'Old Co', NOW() - INTERVAL '5 days' FROM demo_requests LIMIT 1`,
        );
        const digest = await buildDigest(getPool());
        expect(digest).toContain('New demo requests (last 24h): 1');
        expect(digest).toContain('Acme Farms: Jane Grower <jane@acmefarms.com>');
        expect(digest).toContain('Still unscheduled after 2+ days: 1');
        expect(digest).toContain('Old Co');
    });
});
