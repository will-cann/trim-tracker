import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let responders: Array<{ match: RegExp; rows: Record<string, unknown>[] | ((v: unknown[]) => Record<string, unknown>[]) }> = [];

vi.mock('../utils/db', () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?').replace(/\s+/g, ' ').trim();
        calls.push({ text, values });
        for (const r of responders) {
            if (r.match.test(text)) return { rows: typeof r.rows === 'function' ? r.rows(values) : r.rows };
        }
        return { rows: [] };
    },
    pool: {},
}));

import { METRIC_DEFINITIONS, METRIC_KEYS, computeMetrics, writeSnapshots, summarizeLatest, shiftDate } from '../utils/metrics';

beforeEach(() => { calls.length = 0; responders = []; });

describe('metric registry', () => {
    it('has unique keys and a computer for every definition', async () => {
        expect(new Set(METRIC_KEYS).size).toBe(METRIC_DEFINITIONS.length);
        const { rows, failures } = await computeMetrics('c1', '2026-10-17');
        // With an empty database every computer ran and produced a facility-wide zero or no rows.
        expect(failures).toEqual([]);
        for (const r of rows) expect(METRIC_KEYS).toContain(r.key);
    });
});

describe('computeMetrics', () => {
    it('maps query rows to dimensioned metrics and isolates a failing query', async () => {
        responders = [
            { match: /COUNT\(\*\)::int AS n FROM plants WHERE company_id = \? AND growth_phase IN \('vegetative', 'flowering'\)$/, rows: [{ n: 42 }] },
            { match: /GROUP BY r\.name/, rows: [{ dimension: 'Flower 1', value: 30 }, { dimension: 'Veg 1', value: 12 }, { dimension: null, value: 5 }] },
            { match: /ROUND\(AVG\(plant_health\)/, rows: [{ v: '93.5' }] },
            { match: /strain_name AS dimension, ROUND/, rows: [{ dimension: 'Wedding Cake', value: '0.4167' }] },
        ];
        const { rows, failures } = await computeMetrics('c1', '2026-10-17', ['plants.live', 'plants.by_room', 'plants.avg_health', 'health.botrytis_incidence_90d']);
        expect(failures).toEqual([]);
        expect(rows).toContainEqual({ key: 'plants.live', dimension: '', value: 42, extra: null });
        expect(rows.filter(r => r.key === 'plants.by_room').map(r => r.dimension)).toEqual(['Flower 1', 'Veg 1']);
        expect(rows).toContainEqual({ key: 'plants.avg_health', dimension: '', value: 93.5, extra: null });
        expect(rows).toContainEqual({ key: 'health.botrytis_incidence_90d', dimension: 'Wedding Cake', value: 0.4167 });
        // Windows are anchored on the snapshot date, not on now().
        const incidence = calls.find(c => /strain_name AS dimension, ROUND/.test(c.text));
        expect(incidence?.values).toContain('2026-10-17');
    });

    it('records a failure and keeps going', async () => {
        responders = [{ match: /FROM human_tasks WHERE company_id = \? AND status <> 'completed'$/, rows: () => { throw new Error('relation "human_tasks" does not exist'); } }];
        const { rows, failures } = await computeMetrics('c1', '2026-10-17', ['tasks.open', 'tasks.overdue']);
        expect(failures).toEqual([{ key: 'tasks.open', error: 'relation "human_tasks" does not exist' }]);
        expect(rows).toContainEqual({ key: 'tasks.overdue', dimension: '', value: 0, extra: null });
    });
});

describe('writeSnapshots', () => {
    it('upserts one row per metric row', async () => {
        const n = await writeSnapshots('c1', '2026-10-17', [
            { key: 'plants.live', dimension: '', value: 42 },
            { key: 'plants.by_room', dimension: 'Flower 1', value: 30 },
        ]);
        expect(n).toBe(2);
        const inserts = calls.filter(c => /INSERT INTO metric_snapshots/.test(c.text));
        expect(inserts).toHaveLength(2);
        expect(inserts[1].values.slice(0, 5)).toEqual(['c1', 'plants.by_room', 'Flower 1', '2026-10-17', 30]);
        expect(inserts[0].text).toMatch(/ON CONFLICT \(company_id, metric_key, dimension, snapshot_date\)/);
    });
});

describe('summarizeLatest', () => {
    it('reports the latest value and the change against the nearest earlier snapshot', () => {
        const out = summarizeLatest([
            { key: 'plants.live', dimension: '', date: '2026-10-10', value: 40 },
            { key: 'plants.live', dimension: '', date: '2026-10-12', value: 44 },
            { key: 'plants.live', dimension: '', date: '2026-10-17', value: 50 },
            { key: 'plants.by_room', dimension: 'Veg 1', date: '2026-10-17', value: 12 },
        ], 7);
        const live = out.find(m => m.key === 'plants.live')!;
        // 7 days before 10-17 is 10-10: that snapshot exists, so change is 50 − 40.
        expect(live).toMatchObject({ value: 50, previous: 40, change: 10, changePct: 25 });
        const veg = out.find(m => m.key === 'plants.by_room')!;
        expect(veg).toMatchObject({ value: 12, previous: null, change: null, changePct: null });
    });

    it('shifts dates across month boundaries', () => {
        expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
        expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    });
});
