import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseRoomWorkbook, parseStrainCell, rotScoreToSeverity, rotScoreLabel, severityToRotScore, rotScoreToHealth, tableRoomHealth, defaultObservedAt } from '../roomSheet';
import type { SheetGrid } from '../roomSheet';

const here = path.dirname(fileURLToPath(import.meta.url));
const papin = JSON.parse(readFileSync(path.join(here, 'fixtures', 'papin-sheet.json'), 'utf8')) as Record<string, SheetGrid>;

describe('parseStrainCell', () => {
    it('reads single, split and slash codes', () => {
        expect(parseStrainCell('PPN ')).toEqual([{ strain: 'PPN', count: null }]);
        expect(parseStrainCell('GSB4 7    ARS20  7')).toEqual([{ strain: 'GSB4', count: 7 }, { strain: 'ARS20', count: 7 }]);
        expect(parseStrainCell('ppn/bis')).toEqual([{ strain: 'PPN', count: null }, { strain: 'BIS', count: null }]);
    });
});

describe('rot score scale', () => {
    it('maps the operator scale onto 1–5 severity and back', () => {
        expect([0.5, 1, 2, 3].map(rotScoreToSeverity)).toEqual([1, 2, 4, 5]);
        expect(rotScoreToSeverity(1.5)).toBe(3);
        expect([1, 2, 3, 4, 5].map(severityToRotScore)).toEqual([0.5, 1, 1.5, 2, 3]);
        expect(rotScoreLabel(2)).toBe('Freeze tops');
        expect(rotScoreLabel(3)).toBe('All to frozen');
    });

    it('maps scores onto a plant-health equivalent, unscored tables reading 100', () => {
        expect([null, 0.5, 1, 2, 3].map(rotScoreToHealth)).toEqual([100, 90, 75, 45, 10]);
        expect(rotScoreToHealth(1.5)).toBe(75);   // nearest level below
    });
});

describe('tableRoomHealth', () => {
    it('is the plant-weighted mean of table health, so one bad table in a big room barely moves it', () => {
        const room = tableRoomHealth([
            { plantCount: 14, score: null },
            { plantCount: 14, score: null },
            { plantCount: 12, score: 3 },
        ]);
        expect(room).toEqual({ health: 73, plants: 40, scoredTables: 1, scoredPlants: 12 });
    });

    it('reads 100 for an unscored or empty room', () => {
        expect(tableRoomHealth([]).health).toBe(100);
        expect(tableRoomHealth([{ plantCount: 14, score: null }]).health).toBe(100);
    });

    it('matches the Papin sheet: 34 of 90 tables scored, mostly early signs', () => {
        const parsed = parseRoomWorkbook(papin);
        const scores = new Map(parsed.scores.map(s => [`${s.row}:${s.col}`, s.score]));
        const room = tableRoomHealth(parsed.tables.map(t => ({ plantCount: t.plantCount, score: scores.get(`${t.row}:${t.col}`) ?? null })));
        expect(room.scoredTables).toBe(34);
        expect(room.health).toBeGreaterThan(90);
        expect(room.health).toBeLessThan(100);
    });
});

describe('parseRoomWorkbook on the Papin sheet', () => {
    const parsed = parseRoomWorkbook(papin);

    it('reads the title, decks and grid shape', () => {
        expect(parsed.roomName).toBe('PAPIN');
        expect(parsed.observedAt).toBe('2026-08-19');
        expect(parsed.sections).toEqual([
            { name: 'Upper Deck', rowStart: 0, rowCount: 5 },
            { name: 'Lower Deck', rowStart: 5, rowCount: 5 },
        ]);
        expect(parsed.rows).toBe(10);
        expect(parsed.cols).toBe(9);
        expect(parsed.colStartLabel).toBe('East');
        expect(parsed.colEndLabel).toBe('West');
    });

    it('reads every table with its strain and count, matching the sheet total', () => {
        expect(parsed.tables).toHaveLength(90);
        expect(parsed.totalPlants).toBe(1164);
        const a1 = parsed.tables.find(t => t.row === 0 && t.col === 0)!;
        expect(a1).toMatchObject({ section: 'Upper Deck', strains: [{ strain: 'ARS20', count: null }], plantCount: 14, sourceCell: 'A3' });
        const split = parsed.tables.find(t => t.sourceCell === 'B7')!;
        expect(split).toMatchObject({ row: 2, col: 1, strains: [{ strain: 'GSB4', count: 7 }, { strain: 'ARS20', count: 7 }], plantCount: 14 });
        const lower = parsed.tables.find(t => t.sourceCell === 'I23')!;
        expect(lower).toMatchObject({ section: 'Lower Deck', row: 9, col: 8, strains: [{ strain: 'GGT', count: null }], plantCount: 12 });
        // The legend column (J) is not a table.
        expect(parsed.tables.every(t => t.col <= 8)).toBe(true);
    });

    it('reads the scores onto the same positions', () => {
        expect(parsed.scores).toHaveLength(34);
        expect(parsed.scores.filter(s => s.score === 1)).toHaveLength(2);
        expect(parsed.scores.filter(s => s.score === 0.5)).toHaveLength(32);
        const first = parsed.scores.find(s => s.sourceCell === 'A4')!;
        expect(first).toMatchObject({ section: 'Upper Deck', row: 0, col: 0, strain: 'ARS20', score: 0.5 });
        // Rows 9–12 of the health sheet are blank, so the third bench's split cell lands on bench 2, not bench 1.
        const split = parsed.scores.find(s => s.sourceCell === 'G8')!;
        expect(split).toMatchObject({ row: 2, col: 6, strain: 'PPN' });
        const bdz = parsed.scores.filter(s => s.score === 1);
        expect(bdz.map(s => `${s.row}:${s.col}`).sort()).toEqual(['9:2', '9:3']);
        // Every score sits on a table.
        const occupied = new Set(parsed.tables.map(t => `${t.row}:${t.col}`));
        expect(parsed.scores.every(s => occupied.has(`${s.row}:${s.col}`))).toBe(true);
        expect(parsed.warnings).toEqual([]);
    });
});

describe('parseRoomWorkbook edge cases', () => {
    it('handles a single unlabelled section and a missing score sheet', () => {
        const grid: SheetGrid = [
            ['Flower 2 10/01/2026'],
            [],
            ['GG4', 'GG4', 'WC'],
            [12, 12, 10],
            ['WC', null, 'WC'],
            [10, null, 10],
        ];
        const parsed = parseRoomWorkbook({ Sheet1: grid });
        expect(parsed.roomName).toBe('Flower 2');
        expect(parsed.observedAt).toBe('2026-10-01');
        expect(parsed.sections).toEqual([{ name: 'Main', rowStart: 0, rowCount: 2 }]);
        expect(parsed.tables).toHaveLength(5);
        expect(parsed.totalPlants).toBe(54);
        expect(parsed.warnings).toContain('No score sheet found; only the layout was read.');
    });

    it('warns about a missing count instead of failing', () => {
        const parsed = parseRoomWorkbook({ map: [['Veg 1'], [], ['A', 'B'], [10, null]] });
        expect(parsed.tables).toHaveLength(2);
        expect(parsed.warnings.some(w => w.includes('"B" has no plant count'))).toBe(true);
    });
});

describe('defaultObservedAt', () => {
    const today = '2026-10-18';
    it('uses a recent title date', () => {
        expect(defaultObservedAt('2026-10-15', today)).toEqual({ observedAt: '2026-10-15', verdict: 'recent', ageDays: 3 });
        expect(defaultObservedAt(today, today).verdict).toBe('recent');
    });
    it('falls back to today for an old title date (a stale template or a typo), and says how old', () => {
        // Papin's sheet is titled 8/19 but was scored in October: the month was mistyped.
        expect(defaultObservedAt('2026-08-19', today)).toEqual({ observedAt: today, verdict: 'old', ageDays: 60 });
    });
    it('falls back to today for a future title date (the day the room comes down)', () => {
        expect(defaultObservedAt('2026-10-19', today)).toEqual({ observedAt: today, verdict: 'future', ageDays: -1 });
    });
    it('is today when the sheet has no date', () => {
        expect(defaultObservedAt(null, today)).toEqual({ observedAt: today, verdict: 'none', ageDays: null });
    });
});
