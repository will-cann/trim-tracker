import { describe, it, expect } from 'vitest';
import { buildCohorts, comparePlantsByTraits, proposeLayout, botrytisSusceptibility } from '../cohorts';
import type { CohortPlantInput } from '../cohorts';
import { scoreHotspots } from '../hotspots';

const plant = (id: string, feed: string | null, days: number | null, stretch: 'low' | 'medium' | 'high' | null, strain = 'S'): CohortPlantInput =>
    ({ id, label: id, strainName: strain, feedProfile: feed, floweringDays: days, stretchTrait: stretch });

describe('comparePlantsByTraits', () => {
    it('sorts by feed, then flower length, then stretch, with unknowns last', () => {
        const plants = [
            plant('d', 'Medium', 56, 'low'),
            plant('a', 'Heavy', 63, 'high'),
            plant('b', 'Heavy', 56, 'medium'),
            plant('c', 'Heavy', 56, 'low'),
            plant('e', null, 49, 'low'),
        ];
        const sorted = [...plants].sort((x, y) => comparePlantsByTraits(x, y));
        expect(sorted.map(p => p.id)).toEqual(['c', 'b', 'a', 'd', 'e']);
    });

    it('honours a custom trait order', () => {
        const a = plant('a', 'Heavy', 70, 'low');
        const b = plant('b', 'Light', 56, 'low');
        expect(comparePlantsByTraits(a, b, ['flower'])).toBeGreaterThan(0);
        expect(comparePlantsByTraits(a, b, ['feed'])).toBeLessThan(0);
    });
});

describe('buildCohorts', () => {
    it('groups plants sharing all three traits and lists their strains', () => {
        const cohorts = buildCohorts([
            plant('1', 'Heavy', 63, 'high', 'Wedding Cake'),
            plant('2', 'Heavy', 63, 'high', 'Blue Dream'),
            plant('3', 'Light', 56, 'low', 'Zkittlez'),
        ]);
        expect(cohorts).toHaveLength(2);
        expect(cohorts[0].strains).toEqual(['Blue Dream', 'Wedding Cake']);
        expect(cohorts[0].plants.map(p => p.id)).toEqual(['2', '1']);
        expect(cohorts[1].feedProfile).toBe('Light');
    });
});

describe('botrytisSusceptibility', () => {
    it('rises with flower length and stretch', () => {
        expect(botrytisSusceptibility({ floweringDays: 70, stretchTrait: 'high' })).toBeGreaterThan(botrytisSusceptibility({ floweringDays: 70, stretchTrait: 'low' }));
        expect(botrytisSusceptibility({ floweringDays: 49, stretchTrait: null })).toBeLessThan(botrytisSusceptibility({ floweringDays: null, stretchTrait: null }));
    });
});

describe('proposeLayout', () => {
    it('fills row-major in cohort order and skips hot cells when there is room', () => {
        const now = Date.parse('2026-10-16T00:00:00Z');
        const { cells } = scoreHotspots(
            [{ row: 0, col: 0, contaminant: 'botrytis', severity: 5, observedAt: now, status: 'active' }],
            { rows: 2, cols: 3, now, neighborSpread: 0 },
        );
        const plants = [plant('b', 'Light', 56, 'low'), plant('a', 'Heavy', 63, 'high')];
        const layout = proposeLayout(plants, { rows: 2, cols: 3, cells });
        expect(layout.placements).toEqual([
            { plantId: 'a', row: 0, col: 1 },
            { plantId: 'b', row: 0, col: 2 },
        ]);
        expect(layout.avoidedCells).toEqual([{ row: 0, col: 0, score: cells[0].score }]);
        expect(layout.unplaced).toEqual([]);
    });

    it('puts the least susceptible plants into hot cells when the room is full', () => {
        const now = Date.parse('2026-10-16T00:00:00Z');
        const { cells } = scoreHotspots(
            [{ row: 0, col: 0, contaminant: 'botrytis', severity: 5, observedAt: now, status: 'active' }],
            { rows: 1, cols: 3, now, neighborSpread: 0 },
        );
        const plants = [plant('long', 'Heavy', 70, 'high'), plant('mid', 'Heavy', 63, 'low'), plant('short', 'Light', 49, 'low')];
        const layout = proposeLayout(plants, { rows: 1, cols: 3, cells });
        const hot = layout.placements.find(p => p.row === 0 && p.col === 0);
        expect(hot?.plantId).toBe('short');
        expect(layout.placements.map(p => p.plantId).sort()).toEqual(['long', 'mid', 'short']);
        expect(layout.avoidedCells).toEqual([]);
    });

    it('respects occupied cells and reports overflow', () => {
        const layout = proposeLayout([plant('a', null, null, null), plant('b', null, null, null)], {
            rows: 1, cols: 2, occupied: new Set(['0:0']),
        });
        expect(layout.placements).toEqual([{ plantId: 'a', row: 0, col: 1 }]);
        expect(layout.unplaced).toEqual(['b']);
    });
});
