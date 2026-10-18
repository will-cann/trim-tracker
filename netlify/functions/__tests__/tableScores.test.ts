/**
 * Table-score lifecycle and roll-up (utils/tableScores). Mocks the sql tagged
 * template to assert the guards each query carries and how rows roll up.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let responders: Array<{ match: RegExp; rows: (values: unknown[]) => Record<string, unknown>[] }> = [];

vi.mock('../utils/db', () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?').replace(/\s+/g, ' ').trim();
        calls.push({ text, values });
        for (const r of responders) if (r.match.test(text)) return { rows: r.rows(values) };
        return { rows: [] };
    },
    pool: {},
}));

import { settleTableScoresForRooms, expireStaleTableScores, tableRoomRollups, TABLE_SCORE_MAX_AGE_DAYS } from '../utils/tableScores';

beforeEach(() => { calls.length = 0; responders = []; });

describe('settleTableScoresForRooms', () => {
    it('with explicit rooms: closes open table scores where no live plants remain', async () => {
        responders = [{ match: /UPDATE plant_health_events/, rows: () => [{ id: 'a' }, { id: 'b' }] }];
        const n = await settleTableScoresForRooms('c1', ['r1', 'r2']);
        expect(n).toBe(2);
        const q = calls[0];
        expect(q.text).toMatch(/plant_id IS NULL AND e\.position_row IS NOT NULL/);
        expect(q.text).toMatch(/room_id = ANY\(\?::uuid\[\]\)/);
        expect(q.text).toMatch(/NOT EXISTS \( SELECT 1 FROM plants p .*p\.growth_phase IN \('vegetative', 'flowering'\)/);
        expect(q.text).not.toMatch(/harvested_date/);   // the caller just harvested them; no extra proof needed
        expect(q.values).toEqual(['c1', ['r1', 'r2']]);
    });

    it('without rooms (after a sync): also requires a plant harvested or destroyed since the score', async () => {
        responders = [{ match: /UPDATE plant_health_events/, rows: () => [{ id: 'a' }] }];
        const n = await settleTableScoresForRooms('c1');
        expect(n).toBe(1);
        expect(calls[0].text).toMatch(/COALESCE\(p\.harvested_date, p\.destroyed_date\) >= e\.observed_at/);
        expect(calls[0].text).not.toMatch(/ANY\(/);
    });

    it('does nothing for an empty room list', async () => {
        expect(await settleTableScoresForRooms('c1', [])).toBe(0);
        expect(calls).toHaveLength(0);
    });
});

describe('expireStaleTableScores', () => {
    it('closes table scores older than the age cap, default 90 days', async () => {
        responders = [{ match: /UPDATE plant_health_events/, rows: () => [{ id: 'a' }] }];
        expect(await expireStaleTableScores('c1')).toBe(1);
        expect(calls[0].text).toMatch(/observed_at < NOW\(\) - make_interval\(days => \?\)/);
        expect(calls[0].values).toEqual(['c1', TABLE_SCORE_MAX_AGE_DAYS]);
        expect(TABLE_SCORE_MAX_AGE_DAYS).toBe(90);
    });
});

describe('tableRoomRollups', () => {
    it('rolls each room up from its tables and their latest active score', async () => {
        responders = [
            { match: /FROM room_tables t JOIN rooms r/, rows: () => [
                { room_id: 'papin', room_name: 'Papin', position_row: 0, position_col: 0, plant_count: 14, strains: [{ strain: 'ARS20', count: null }] },
                { room_id: 'papin', room_name: 'Papin', position_row: 0, position_col: 1, plant_count: 14, strains: '[{"strain":"GSB4","count":7},{"strain":"ARS20","count":7}]' },
                { room_id: 'papin', room_name: 'Papin', position_row: 9, position_col: 3, plant_count: 12, strains: [{ strain: 'BDZ', count: null }] },
                { room_id: 'grateful', room_name: 'Grateful', position_row: 0, position_col: 0, plant_count: 10, strains: [{ strain: 'GOG', count: null }] },
            ] },
            { match: /SELECT DISTINCT ON \(room_id, position_row, position_col\)/, rows: () => [
                { room_id: 'papin', position_row: 0, position_col: 1, rot_score: 0.5, severity: 1, contaminant: 'botrytis' },
                { room_id: 'papin', position_row: 9, position_col: 3, rot_score: null, severity: 4, contaminant: 'powdery_mildew' },   // app-scored: severity only
            ] },
        ];
        const rollups = await tableRoomRollups('c1');
        const papin = rollups.get('papin')!;
        // 14 @ 100, 14 @ 90 (0.5), 12 @ 45 (severity 4 → score 2) → weighted mean
        expect(papin.health).toBe(Math.round((14 * 100 + 14 * 90 + 12 * 45) / 40));
        expect(papin.plants).toBe(40);
        expect(papin.scoredTables).toBe(2);
        expect(papin.strains).toEqual(['ARS20', 'BDZ', 'GSB4']);
        expect(papin.contaminants).toEqual(['botrytis', 'powdery_mildew']);
        const grateful = rollups.get('grateful')!;
        expect(grateful).toMatchObject({ health: 100, plants: 10, scoredTables: 0, contaminants: [] });
        // The scores query only ran because tables exist, and only reads active cell-level events
        expect(calls[1].text).toMatch(/status = 'active' AND plant_id IS NULL AND position_row IS NOT NULL/);
    });

    it('returns an empty map, and skips the scores query, when the company has no tables', async () => {
        expect((await tableRoomRollups('c1')).size).toBe(0);
        expect(calls).toHaveLength(1);
    });
});
