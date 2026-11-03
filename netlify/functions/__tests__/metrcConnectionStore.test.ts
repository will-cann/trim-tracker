/**
 * metrcConnectionStore: reads survive a database where migration 070 has not
 * run yet (Postgres 42P01), so a deploy that lands before the migration does
 * not take the picker or the sync down. Other errors still propagate.
 *
 * Run with:
 *     npx vitest run netlify/functions/__tests__/metrcConnectionStore.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sql = vi.fn();
vi.mock('../utils/db', () => ({ sql: (...a: unknown[]) => sql(...a), pool: {} }));

import { activeConnectionCompanyIds, findConnection } from '../utils/metrcConnectionStore';

const undefinedTable = () => Object.assign(new Error('relation "metrc_connections" does not exist'), { code: '42P01' });

beforeEach(() => {
    sql.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('before migration 070', () => {
    it('findConnection reads as no connection', async () => {
        sql.mockRejectedValue(undefinedTable());
        expect(await findConnection('c0ffee00-0000-0000-0000-000000000001')).toBeNull();
    });

    it('activeConnectionCompanyIds reads as no companies', async () => {
        sql.mockRejectedValue(undefinedTable());
        expect(await activeConnectionCompanyIds()).toEqual([]);
    });

    it('any other database error still propagates', async () => {
        sql.mockRejectedValue(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));
        await expect(findConnection('x')).rejects.toThrow('connection refused');
        await expect(activeConnectionCompanyIds()).rejects.toThrow('connection refused');
    });
});

describe('after migration 070', () => {
    it('maps a row and normalises json columns', async () => {
        sql.mockResolvedValue({ rows: [{ id: 'conn-1', company_id: 'c1', licenses: null, sync_licenses: ['CUL000030'], mode: 'read-only', status: 'active' }] });
        const row = await findConnection('c1');
        expect(row).toMatchObject({ id: 'conn-1', licenses: [], sync_licenses: ['CUL000030'] });
        sql.mockResolvedValue({ rows: [{ company_id: 'c1' }, { company_id: 'c2' }] });
        expect(await activeConnectionCompanyIds()).toEqual(['c1', 'c2']);
    });
});
