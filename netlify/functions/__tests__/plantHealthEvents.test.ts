/**
 * plant-health-events handler — validation and state sync.
 *
 * Mocks the sql tagged template so we can assert (a) contaminant aliases
 * normalise ("bud rot" → botrytis), (b) the observation snapshots the
 * plant's room/cell, and (c) the plant's current contaminants/health are
 * kept in step on log and on resolve.
 *
 * Run with: npx vitest run netlify/functions/__tests__/plantHealthEvents.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let responders: Array<{ match: RegExp; rows: (values: unknown[]) => Record<string, unknown>[] }> = [];

vi.mock('../utils/db', () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?').replace(/\s+/g, ' ').trim();
        calls.push({ text, values });
        for (const r of responders) {
            if (r.match.test(text)) return { rows: r.rows(values) };
        }
        return { rows: [] };
    },
    pool: {},
}));

vi.mock('../utils/auth', () => ({
    resolveContext: async () => ({ userId: 'u1', companyId: 'c1', role: 'admin', departments: [] }),
    authorize: () => null,
}));

import { handler } from '../plant-health-events';

const invoke = (method: string, body?: unknown, query?: Record<string, string>) =>
    (handler as any)({ httpMethod: method, headers: {}, body: body ? JSON.stringify(body) : null, queryStringParameters: query ?? null }, {} as any);

const PLANT = {
    id: '11111111-1111-1111-1111-111111111111', label: 'WC-F-001', strain_name: 'Wedding Cake',
    room_id: '22222222-2222-2222-2222-222222222222', room_name: 'Flower Room 1',
    position_row: 2, position_col: 5, growth_phase: 'flowering', flowering_date: '2026-09-01', contaminants: ['thrips'],
};

beforeEach(() => {
    calls.length = 0;
    responders = [];
});

describe('POST /plant-health-events', () => {
    it('rejects an unknown contaminant', async () => {
        const res = await invoke('POST', { plantIds: [PLANT.id], contaminant: 'glitter' });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/Unknown contaminant/);
    });

    it('requires plantIds', async () => {
        const res = await invoke('POST', { contaminant: 'botrytis' });
        expect(res.statusCode).toBe(400);
    });

    it('normalises "bud rot", snapshots the cell, and adds the contaminant to the plant', async () => {
        responders = [
            { match: /FROM plants p LEFT JOIN rooms/, rows: () => [PLANT] },
            { match: /INSERT INTO plant_health_events/, rows: (v) => [{
                id: 'e1', plant_id: v[1], plant_label: v[2], strain_name: v[3], room_id: v[4], room_name: v[5],
                position_row: v[6], position_col: v[7], contaminant: v[8], severity: v[9], rot_score: v[10], note: v[11],
                growth_phase: v[12], flowering_day: v[13], status: 'active', observed_at: v[14], source: v[15], resolved_at: null,
            }] },
        ];
        const res = await invoke('POST', { plantIds: [PLANT.id], contaminant: 'bud rot', severity: 9, note: ' top cola ', observedAt: '2026-10-10T12:00:00Z' });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.affected).toBe(1);
        const ev = body.created[0];
        expect(ev.contaminant).toBe('botrytis');
        expect(ev.severity).toBe(5);              // clamped
        expect(ev.row).toBe(2);
        expect(ev.col).toBe(5);
        expect(ev.roomName).toBe('Flower Room 1');
        expect(ev.floweringDay).toBe(39);         // 2026-09-01 → 2026-10-10
        expect(ev.note).toBe('top cola');
        expect(ev.rotScore).toBeNull();
        expect(ev.source).toBe('app');

        const update = calls.find(c => /UPDATE plants SET contaminants/.test(c.text));
        expect(update).toBeDefined();
        expect(update!.values[0]).toEqual(['thrips', 'botrytis']);
        // thrips (10) + botrytis (30) → 60, applied as LEAST(plant_health, 60)
        expect(update!.values[1]).toBe(60);
    });

    it('does not duplicate a contaminant the plant already carries', async () => {
        responders = [
            { match: /FROM plants p LEFT JOIN rooms/, rows: () => [{ ...PLANT, contaminants: ['botrytis'] }] },
            { match: /INSERT INTO plant_health_events/, rows: () => [{ id: 'e2', contaminant: 'botrytis', severity: 3, status: 'active', observed_at: new Date() }] },
        ];
        const res = await invoke('POST', { plantIds: [PLANT.id], contaminant: 'botrytis' });
        expect(res.statusCode).toBe(201);
        expect(calls.some(c => /UPDATE plants SET contaminants/.test(c.text))).toBe(false);
    });
});

describe('POST /plant-health-events (table cell)', () => {
    it('logs a cell-level bud-rot score with the operator scale mapped onto severity', async () => {
        responders = [
            { match: /FROM rooms r LEFT JOIN room_tables t/, rows: () => [{ id: PLANT.room_id, name: 'Flower Room 1', strains: [{ strain: 'BDZ', count: null }] }] },
            // Cell-mode insert has a literal NULL plant_id, so values start at the label.
            { match: /INSERT INTO plant_health_events/, rows: (v) => [{
                id: 'e3', plant_id: null, plant_label: v[1], strain_name: v[2], room_id: v[3], room_name: v[4],
                position_row: v[5], position_col: v[6], contaminant: v[7], severity: v[8], rot_score: v[9], note: v[10],
                growth_phase: 'flowering', status: 'active', observed_at: v[11], source: v[12], resolved_at: null,
            }] },
        ];
        const res = await invoke('POST', { roomId: PLANT.room_id, row: 9, col: 2, contaminant: 'botrytis', rotScore: 2, note: 'tops going' });
        expect(res.statusCode).toBe(201);
        const ev = JSON.parse(res.body).created[0];
        expect(ev).toMatchObject({ plantId: null, plantLabel: 'BDZ table', strainName: 'BDZ', row: 9, col: 2, contaminant: 'botrytis', severity: 4, rotScore: 2, source: 'app' });
        expect(ev.note).toBe('Score 2 — Freeze tops. tops going');
        // No plant state to update in cell mode.
        expect(calls.some(c => /UPDATE plants SET contaminants/.test(c.text))).toBe(false);
    });
});

describe('PATCH /plant-health-events', () => {
    it('resolves events and drops the contaminant when nothing active remains', async () => {
        responders = [
            { match: /UPDATE plant_health_events SET status = 'resolved'/, rows: () => [
                { id: 'e1', plant_id: PLANT.id, contaminant: 'botrytis', severity: 4, status: 'resolved', observed_at: new Date(), resolved_at: new Date() },
            ] },
            { match: /SELECT DISTINCT contaminant FROM plant_health_events/, rows: () => [{ contaminant: 'thrips' }] },
            { match: /SELECT contaminants FROM plants/, rows: () => [{ contaminants: ['thrips', 'botrytis'] }] },
        ];
        const res = await invoke('PATCH', { eventIds: ['e1'] });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).affected).toBe(1);
        const update = calls.find(c => /UPDATE plants SET contaminants = \? ::text\[\], plant_health/.test(c.text) || /UPDATE plants SET contaminants/.test(c.text));
        expect(update).toBeDefined();
        expect(update!.values[0]).toEqual(['thrips']);
        expect(update!.values[1]).toBe(90);
    });

    it('keeps the contaminant while another active event for it exists', async () => {
        responders = [
            { match: /UPDATE plant_health_events SET status = 'resolved'/, rows: () => [
                { id: 'e1', plant_id: PLANT.id, contaminant: 'botrytis', severity: 2, status: 'resolved', observed_at: new Date(), resolved_at: new Date() },
            ] },
            { match: /SELECT DISTINCT contaminant FROM plant_health_events/, rows: () => [{ contaminant: 'botrytis' }] },
            { match: /SELECT contaminants FROM plants/, rows: () => [{ contaminants: ['botrytis'] }] },
        ];
        const res = await invoke('PATCH', { eventIds: ['e1'] });
        expect(res.statusCode).toBe(200);
        expect(calls.some(c => /UPDATE plants SET contaminants/.test(c.text))).toBe(false);
    });

    it('requires eventIds or plantIds', async () => {
        const res = await invoke('PATCH', {});
        expect(res.statusCode).toBe(400);
    });
});

describe('GET /plant-health-events', () => {
    it('passes filters through and serialises rows', async () => {
        responders = [{ match: /FROM plant_health_events e/, rows: () => [
            { id: 'e1', plant_id: PLANT.id, plant_label: 'WC-F-001', strain_name: 'Wedding Cake', room_id: PLANT.room_id, room_name: 'Flower Room 1',
              position_row: 0, position_col: 1, contaminant: 'botrytis', severity: 3, note: null, growth_phase: 'flowering', flowering_day: 40,
              status: 'active', observed_at: '2026-10-10T12:00:00.000Z', resolved_at: null },
        ] }];
        const res = await invoke('GET', undefined, { roomId: PLANT.room_id, contaminant: 'bud rot', status: 'active', days: '30' });
        expect(res.statusCode).toBe(200);
        const rows = JSON.parse(res.body);
        expect(rows[0]).toMatchObject({ id: 'e1', contaminant: 'botrytis', row: 0, col: 1, status: 'active', observedAt: '2026-10-10T12:00:00.000Z' });
        const q = calls[0];
        expect(q.values).toContain('botrytis');
        expect(q.values).toContain(30);
    });
});
