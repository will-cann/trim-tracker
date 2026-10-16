import { describe, it, expect } from 'vitest';
import { scoreHotspots, riskLevel, eventWeight, indexCells, cellKey } from '../hotspots';
import type { HotspotEventInput } from '../hotspots';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const ev = (over: Partial<HotspotEventInput>): HotspotEventInput => ({
    row: 1, col: 1, contaminant: 'botrytis', severity: 3, observedAt: daysAgo(0), status: 'active', ...over,
});

describe('eventWeight', () => {
    it('scales with severity and never decays below the active floor', () => {
        expect(eventWeight(ev({ severity: 5 }), NOW, 45)).toBeCloseTo(1);
        expect(eventWeight(ev({ severity: 5, observedAt: daysAgo(400) }), NOW, 45)).toBeCloseTo(0.6);
    });

    it('halves a resolved event every half-life', () => {
        const w = eventWeight(ev({ severity: 5, status: 'resolved', observedAt: daysAgo(45) }), NOW, 45);
        expect(w).toBeCloseTo(0.5, 2);
        const w2 = eventWeight(ev({ severity: 5, status: 'resolved', observedAt: daysAgo(90) }), NOW, 45);
        expect(w2).toBeCloseTo(0.25, 2);
    });
});

describe('scoreHotspots', () => {
    it('returns one cell per grid position with zero risk when there are no events', () => {
        const r = scoreHotspots([], { rows: 2, cols: 3, now: NOW });
        expect(r.cells).toHaveLength(6);
        expect(r.cells.every(c => c.score === 0 && c.events === 0)).toBe(true);
        expect(r.eventsCounted).toBe(0);
    });

    it('bleeds risk into orthogonal neighbours more than diagonals', () => {
        const r = scoreHotspots([ev({ severity: 5 })], { rows: 3, cols: 3, now: NOW, neighborSpread: 0.4 });
        const byKey = indexCells(r.cells);
        const centre = byKey.get(cellKey(1, 1))!;
        const ortho = byKey.get(cellKey(0, 1))!;
        const diag = byKey.get(cellKey(0, 0))!;
        expect(centre.raw).toBeCloseTo(1);
        expect(ortho.raw).toBeCloseTo(0.4);
        expect(diag.raw).toBeCloseTo(0.2);
        expect(centre.score).toBeGreaterThan(ortho.score);
        expect(ortho.score).toBeGreaterThan(diag.score);
        expect(centre.events).toBe(1);
        expect(ortho.events).toBe(0);
    });

    it('ignores non-spreading contaminants by default and honours an explicit filter', () => {
        const events = [ev({ contaminant: 'nutrient_deficiency' }), ev({ contaminant: 'powdery_mildew', row: 0, col: 0 })];
        const all = scoreHotspots(events, { rows: 2, cols: 2, now: NOW });
        expect(all.eventsCounted).toBe(1);
        const onlyBotrytis = scoreHotspots(events, { rows: 2, cols: 2, now: NOW, contaminants: ['botrytis'] });
        expect(onlyBotrytis.eventsCounted).toBe(0);
    });

    it('counts events outside the window or without a position separately', () => {
        const events = [ev({ observedAt: daysAgo(100) }), ev({ row: null, col: null })];
        const r = scoreHotspots(events, { rows: 2, cols: 2, now: NOW, windowDays: 30 });
        expect(r.eventsCounted).toBe(1);
        expect(r.unplacedEvents).toBe(1);
    });

    it('stacks repeated events in the same cell into a high-risk score', () => {
        const events = [ev({ severity: 3 }), ev({ severity: 3, observedAt: daysAgo(10), status: 'resolved' }), ev({ severity: 4, observedAt: daysAgo(20), status: 'resolved' })];
        const r = scoreHotspots(events, { rows: 2, cols: 2, now: NOW });
        const centre = indexCells(r.cells).get(cellKey(1, 1))!;
        expect(riskLevel(centre.score)).toBe('high');
        expect(centre.contaminants.botrytis).toBe(3);
        expect(centre.activeEvents).toBe(1);
        expect(centre.lastObservedAt).toBe(daysAgo(0));
    });
});

describe('riskLevel', () => {
    it('maps scores to bands', () => {
        expect(riskLevel(0)).toBe('none');
        expect(riskLevel(0.2)).toBe('low');
        expect(riskLevel(0.45)).toBe('medium');
        expect(riskLevel(0.9)).toBe('high');
    });
});
