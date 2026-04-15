import { describe, it, expect } from 'vitest';
import { expandVarietyTargets, selectStrainsForVariety } from '../varietySolver';
import type { Strain } from '../../../types/definitions';

const mkStrain = (id: string, name: string, phenotype: 'sativa' | 'indica' | 'hybrid' | null = null): Strain => ({
    id,
    name,
    defaultVegDays: null,
    defaultFloweringDays: null,
    stretchTrait: null,
    notes: null,
    phenotype,
    terpeneTags: null,
    expectedYieldPct: null,
    harvestCount: 0,
    sessionCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

const catalog: Strain[] = [
    mkStrain('1', 'Blue Dream', 'sativa'),
    mkStrain('2', 'Green Crack', 'sativa'),
    mkStrain('3', 'Northern Lights', 'indica'),
    mkStrain('4', 'Gelato', 'hybrid'),
    mkStrain('5', 'Wedding Cake', 'hybrid'),
    mkStrain('6', 'GSC', 'hybrid'),
];

describe('selectStrainsForVariety', () => {
    it('picks 1 sativa, 1 indica, 2 hybrid per quota', () => {
        const { chosen, warnings } = selectStrainsForVariety(
            { strainCount: 4, phenotypeMix: { sativa: 1, indica: 1, hybrid: 2 }, balance: 'even' },
            catalog,
            new Map(),
        );
        expect(chosen).toHaveLength(4);
        expect(chosen.filter(s => s.phenotype === 'sativa')).toHaveLength(1);
        expect(chosen.filter(s => s.phenotype === 'indica')).toHaveLength(1);
        expect(chosen.filter(s => s.phenotype === 'hybrid')).toHaveLength(2);
        expect(warnings).toHaveLength(0);
    });

    it('ranks candidates by on-hand biomass within each bucket', () => {
        const biomass = new Map([
            ['Green Crack', 5000], // higher than Blue Dream — should be picked first
            ['Blue Dream', 1000],
        ]);
        const { chosen } = selectStrainsForVariety(
            { strainCount: 1, phenotypeMix: { sativa: 1 }, balance: 'even' },
            catalog,
            biomass,
        );
        expect(chosen[0].name).toBe('Green Crack');
    });

    it('warns on partial fulfillment when a bucket is under-stocked', () => {
        const smallCatalog = [
            mkStrain('1', 'Blue Dream', 'sativa'),
            mkStrain('4', 'Gelato', 'hybrid'), // only 1 hybrid available
        ];
        const { chosen, warnings } = selectStrainsForVariety(
            { strainCount: 3, phenotypeMix: { sativa: 1, hybrid: 2 }, balance: 'even' },
            smallCatalog,
            new Map(),
        );
        expect(chosen).toHaveLength(2);
        expect(warnings.join(' ')).toMatch(/hybrid/);
        expect(warnings.join(' ')).toMatch(/unfilled/);
    });

    it('fills remaining slots with any-phenotype strains once quotas are met', () => {
        const { chosen } = selectStrainsForVariety(
            { strainCount: 4, phenotypeMix: { sativa: 1 }, balance: 'even' },
            catalog,
            new Map(),
        );
        // 1 sativa from the quota + 3 filler from any phenotype. At least
        // the 1 required sativa must be in the set; total equals requested.
        expect(chosen).toHaveLength(4);
        expect(chosen.filter(s => s.phenotype === 'sativa').length).toBeGreaterThanOrEqual(1);
    });

    it('warns when phenotype quota sum exceeds strainCount', () => {
        const { warnings } = selectStrainsForVariety(
            { strainCount: 2, phenotypeMix: { sativa: 2, indica: 2 }, balance: 'even' },
            catalog,
            new Map(),
        );
        expect(warnings.join(' ')).toMatch(/exceed/i);
    });
});

describe('expandVarietyTargets', () => {
    it('splits a variety target into N per-strain targets of equal quantity', () => {
        const { targets, warnings } = expandVarietyTargets(
            [
                {
                    outputType: 'rosin_cart',
                    quantity: 5000,
                    unit: 'ea',
                    variety: {
                        strainCount: 4,
                        phenotypeMix: { sativa: 1, indica: 1, hybrid: 2 },
                        balance: 'even',
                    },
                },
            ],
            catalog,
            new Map(),
        );
        expect(targets).toHaveLength(4);
        expect(targets.every(t => t.quantity === 1250)).toBe(true);
        expect(targets.every(t => t.outputType === 'rosin_cart')).toBe(true);
        expect(targets.every(t => !t.variety)).toBe(true);
        expect(warnings).toHaveLength(0);
    });

    it('passes single-strain targets through unchanged', () => {
        const { targets } = expandVarietyTargets(
            [{ outputType: 'rosin_cart', quantity: 100, strain: 'Blue Dream' }],
            catalog,
            new Map(),
        );
        expect(targets).toHaveLength(1);
        expect(targets[0].strain).toBe('Blue Dream');
    });

    it('falls back to any-strain when no catalog strains match', () => {
        const { targets, warnings } = expandVarietyTargets(
            [
                {
                    outputType: 'rosin_cart',
                    quantity: 1000,
                    variety: {
                        strainCount: 2,
                        phenotypeMix: { sativa: 2 },
                        balance: 'even',
                    },
                },
            ],
            [], // empty catalog
            new Map(),
        );
        expect(targets).toHaveLength(1);
        expect(targets[0].strain).toBeNull();
        expect(warnings.length).toBeGreaterThan(0);
    });
});
