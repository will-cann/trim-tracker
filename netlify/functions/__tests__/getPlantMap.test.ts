/**
 * get-plant-map — rooms tracked by table read their health from their scores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let responders: Array<{ match: RegExp; rows: Record<string, unknown>[] }> = [];
vi.mock('../utils/db', () => ({
    sql: async (strings: TemplateStringsArray) => {
        const text = strings.join('?').replace(/\s+/g, ' ').trim();
        for (const r of responders) if (r.match.test(text)) return { rows: r.rows };
        return { rows: [] };
    },
    pool: {},
}));
vi.mock('../utils/auth', () => ({
    resolveContext: async () => ({ userId: 'u1', companyId: 'c1', role: 'admin', departments: [] }),
}));

import { handler } from '../get-plant-map';

const get = async (phase: string) => {
    const res = await (handler as any)({ httpMethod: 'GET', headers: {}, queryStringParameters: { phase } }, {} as any);
    return JSON.parse(res.body);
};

beforeEach(() => {
    responders = [
        // Flowering plants: Metrc-synced, never scored, so plant_health is 100 everywhere.
        { match: /FROM plants p JOIN rooms r .*p\.growth_phase = \?/, rows: [
            { room_id: 'papin', room_name: 'Papin', strain_name: 'Alien Rock Sours', plant_count: 1, plant_health: 100, contaminants: [], phase_date: '2026-08-01', harvest_date: '2026-10-03', flip_date: null },
            { room_id: 'papin', room_name: 'Papin', strain_name: 'Alien Rock Sours', plant_count: 1, plant_health: 100, contaminants: [], phase_date: '2026-08-01', harvest_date: '2026-10-03', flip_date: null },
            { room_id: 'fr7', room_name: 'Flower Room #7', strain_name: 'Biscotti', plant_count: 1, plant_health: 100, contaminants: [], phase_date: '2026-08-01', harvest_date: null, flip_date: null },
        ] },
        { match: /FROM room_tables t JOIN rooms r/, rows: [
            { room_id: 'papin', room_name: 'Papin', position_row: 0, position_col: 0, plant_count: 14, strains: [{ strain: 'ARS20', count: null }] },
            { room_id: 'papin', room_name: 'Papin', position_row: 0, position_col: 1, plant_count: 14, strains: [{ strain: 'GSB4', count: null }] },
            { room_id: 'grateful', room_name: 'Grateful', position_row: 0, position_col: 0, plant_count: 12, strains: [{ strain: 'GOG', count: null }] },
        ] },
        { match: /SELECT DISTINCT ON \(room_id, position_row, position_col\)/, rows: [
            { room_id: 'papin', position_row: 0, position_col: 1, rot_score: 1, severity: 2, contaminant: 'botrytis' },
        ] },
    ];
});

describe('get-plant-map with table rooms', () => {
    it('a flowering room with table scores reads its health from them and lists the contaminant', async () => {
        const map = await get('flowering');
        // 14 unscored @100 + 14 @75 (score 1) → 88; the plant rows (all 100) can only lower it, never raise it
        expect(map.Papin.plantHealth).toBe(88);
        expect(map.Papin.contaminants).toEqual(['botrytis']);
        expect(map.Papin.totalPlants).toBe(2);              // plant rows still count the canopy
        expect(map.Papin.harvestDates).toEqual(['2026-10-03']);
    });

    it('a room with tables but no plant rows still appears, counted from its tables', async () => {
        const map = await get('flowering');
        expect(map.Grateful).toMatchObject({ roomId: 'grateful', totalPlants: 12, strains: ['GOG'], plantHealth: 100, contaminants: [] });
    });

    it('rooms without tables are untouched', async () => {
        const map = await get('flowering');
        expect(map['Flower Room #7'].plantHealth).toBe(100);
    });

    it('does not consult tables for the veg view', async () => {
        const map = await get('vegetative');
        expect(map.Grateful).toBeUndefined();
    });
});
