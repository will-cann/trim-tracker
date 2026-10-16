import { describe, it, expect } from 'vitest';
import { planMoves, floweringWeek } from '../movePlanner';
import type { PlannerPlant, PlannerRoom } from '../movePlanner';
import { scoreHotspots } from '../hotspots';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);

const mk = (id: string, row: number | null, col: number | null, over: Partial<PlannerPlant> = {}): PlannerPlant => ({
    id, label: id, strainName: 'Gelato', row, col, growthPhase: 'flowering',
    floweringDate: daysAgo(42), floweringDays: 59, stretchTrait: 'medium', feedProfile: 'Medium', activeIssues: [], ...over,
});

function room(plants: PlannerPlant[], rows = 3, cols = 4, events: Parameters<typeof scoreHotspots>[0] = []): PlannerRoom {
    return { id: 'r1', name: 'Flower 1', rows, cols, plants, cells: scoreHotspots(events, { rows, cols, now: NOW }).cells };
}

describe('floweringWeek', () => {
    it('is 1-indexed from the flowering date', () => {
        expect(floweringWeek(daysAgo(0), NOW)).toBe(1);
        expect(floweringWeek(daysAgo(7), NOW)).toBe(2);
        expect(floweringWeek(daysAgo(42), NOW)).toBe(7);
        expect(floweringWeek(null, NOW)).toBeNull();
    });
});

describe('planMoves', () => {
    it('returns nothing for a clean room', () => {
        const plan = planMoves(room([mk('a', 0, 0), mk('b', 0, 1)]), { now: NOW });
        expect(plan.suggestions).toEqual([]);
        expect(plan.summary).toEqual({ plantsWithActiveSpread: 0, plantsAtRisk: 0, emptySafeCells: 10, emptyHotCells: 0 });
    });

    it('culls severe bud rot and isolates milder cases away from the bench', () => {
        const plants = [
            mk('rot', 1, 1, { activeIssues: [{ contaminant: 'botrytis', severity: 5 }] }),
            mk('mild', 0, 3, { activeIssues: [{ contaminant: 'botrytis', severity: 2 }] }),
        ];
        const plan = planMoves(room(plants), { now: NOW });
        const cull = plan.suggestions.find(s => s.plantId === 'rot');
        expect(cull?.kind).toBe('cull');
        expect(cull?.priority).toBe('urgent');
        const iso = plan.suggestions.find(s => s.plantId === 'mild');
        expect(iso?.kind).toBe('isolate');
        expect(iso?.to).not.toBeNull();
        // Destination is at least two cells from both carriers.
        const to = iso!.to!;
        for (const c of [{ row: 1, col: 1 }, { row: 0, col: 3 }]) {
            expect(Math.max(Math.abs(c.row - to.row), Math.abs(c.col - to.col))).toBeGreaterThan(1);
        }
    });

    it('relocates a late-flower neighbour of an active carrier to a dry cell', () => {
        const plants = [
            mk('carrier', 0, 0, { activeIssues: [{ contaminant: 'botrytis', severity: 3 }] }),
            mk('neighbour', 0, 1),
        ];
        const plan = planMoves(room(plants), { now: NOW });
        const rel = plan.suggestions.find(s => s.plantId === 'neighbour');
        expect(rel?.kind).toBe('relocate');
        expect(rel?.priority).toBe('high');
        expect(rel?.reason).toMatch(/^Next to carrier/);
        expect(rel?.reason).toMatch(/week 7 of flower/);
        expect(rel?.to).not.toBeNull();
        expect(Math.max(Math.abs(rel!.to!.row - 0), Math.abs(rel!.to!.col - 0))).toBeGreaterThan(1);
        // The isolate destination and the relocate destination never collide.
        const iso = plan.suggestions.find(s => s.plantId === 'carrier')!;
        expect(`${iso.to!.row}:${iso.to!.col}`).not.toBe(`${rel!.to!.row}:${rel!.to!.col}`);
        expect(plan.summary.plantsAtRisk).toBe(1);
    });

    it('asks for inspection instead when no dry cell is free', () => {
        const plants = [
            mk('carrier', 0, 0, { activeIssues: [{ contaminant: 'powdery_mildew', severity: 3 }] }),
            mk('neighbour', 0, 1),
        ];
        const plan = planMoves(room(plants, 1, 2), { now: NOW });
        const n = plan.suggestions.find(s => s.plantId === 'neighbour');
        expect(n?.kind).toBe('inspect');
        expect(n?.reason).toMatch(/No dry cell is free/);
    });

    it('flags recurring hot cells from history even with no active carriers, and lists empty ones to avoid', () => {
        const events = [
            { row: 2, col: 3, contaminant: 'botrytis', severity: 5, observedAt: daysAgo(5), status: 'resolved' as const },
            { row: 2, col: 3, contaminant: 'botrytis', severity: 5, observedAt: daysAgo(60), status: 'resolved' as const },
            { row: 2, col: 2, contaminant: 'botrytis', severity: 5, observedAt: daysAgo(3), status: 'resolved' as const },
        ];
        const plants = [mk('sitting', 2, 3, { floweringDate: daysAgo(10) }), mk('fine', 0, 0)];
        const plan = planMoves(room(plants, 3, 4, events), { now: NOW });
        const s = plan.suggestions.find(x => x.plantId === 'sitting');
        expect(s?.kind).toBe('relocate');
        expect(s?.reason).toMatch(/recurring hot spot/);
        expect(plan.avoidCells.map(c => `${c.row}:${c.col}`)).toContain('2:2');
        expect(plan.suggestions.find(x => x.plantId === 'fine')).toBeUndefined();
    });

    it('prefers another room with space when isolating', () => {
        const plants = [mk('carrier', 0, 0, { activeIssues: [{ contaminant: 'botrytis', severity: 3 }] })];
        const other: PlannerRoom = { id: 'r2', name: 'Flower 2', rows: 1, cols: 2, plants: [], cells: scoreHotspots([], { rows: 1, cols: 2, now: NOW }).cells };
        const plan = planMoves(room(plants), { now: NOW, otherRooms: [other] });
        expect(plan.suggestions[0].to?.roomId).toBe('r2');
    });
});
