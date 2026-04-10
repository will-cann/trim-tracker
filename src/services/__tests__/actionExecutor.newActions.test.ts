/**
 * actionExecutor — new action types from the PR #1 tool collapse.
 *
 * Verifies that the three new internal action types emitted by the unified
 * extraction_run and find_plants tools dispatch to the right apiService
 * calls and return the right outcome labels.
 *
 * Does NOT test the full pre-existing action matrix — that's covered by
 * the manual smoke tests. This file is narrow: just the three new cases.
 *
 * Run with: npx vitest run src/services/__tests__/actionExecutor.newActions.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProposedAction } from '../../types/definitions';

// Mock apiService before importing actionExecutor
const mockAmendExtractionRunInputs = vi.fn();
const mockUpdateExtractionRun = vi.fn();

vi.mock('../apiService', () => ({
    apiService: {
        amendExtractionRunInputs: (...args: unknown[]) => mockAmendExtractionRunInputs(...args),
        updateExtractionRun: (...args: unknown[]) => mockUpdateExtractionRun(...args),
    },
}));

import { executeAction } from '../actionExecutor';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('actionExecutor — amend_extraction_run_inputs', () => {
    it('calls apiService.amendExtractionRunInputs with the added inputs', async () => {
        mockAmendExtractionRunInputs.mockResolvedValue({ runId: 'run-1', runName: 'Test run', status: 'active', sources: [] });

        const action: ProposedAction = {
            type: 'amend_extraction_run_inputs',
            data: {
                runId: 'run-1',
                runName: 'Toadstool OG — Live Rosin',
                addedInputs: [
                    { packageType: 'fresh_frozen', strain: 'Zkittlez', quantity: 2500, unit: 'g' },
                    { packageType: 'fresh_frozen', strain: 'Purple Punch', quantity: 2500, unit: 'g' },
                ],
                addedSourcePackageIds: ['pkg-zkittlez', 'pkg-purple'],
                addedSourcePackageQuantities: { 'pkg-zkittlez': 2500, 'pkg-purple': 2500 },
            },
        };

        const outcome = await executeAction(action);

        expect(mockAmendExtractionRunInputs).toHaveBeenCalledTimes(1);
        expect(mockAmendExtractionRunInputs).toHaveBeenCalledWith({
            runId: 'run-1',
            addedSourcePackageIds: ['pkg-zkittlez', 'pkg-purple'],
            addedSourcePackageQuantities: { 'pkg-zkittlez': 2500, 'pkg-purple': 2500 },
        });
        expect(outcome.executed).toBe(true);
        expect(outcome.label).toContain('Toadstool OG — Live Rosin');
        expect(outcome.label).toContain('Zkittlez');
        expect(outcome.label).toContain('Purple Punch');
    });

    it('skips when runId is missing (guard against bad dispatcher output)', async () => {
        const action: ProposedAction = {
            type: 'amend_extraction_run_inputs',
            data: { addedSourcePackageIds: ['pkg-1'] },
        };

        const outcome = await executeAction(action);

        expect(mockAmendExtractionRunInputs).not.toHaveBeenCalled();
        expect(outcome.executed).toBe(false);
        expect(outcome.label).toContain('no run ID');
    });

    it('skips when addedSourcePackageIds is empty', async () => {
        const action: ProposedAction = {
            type: 'amend_extraction_run_inputs',
            data: { runId: 'run-1', addedSourcePackageIds: [] },
        };

        const outcome = await executeAction(action);

        expect(mockAmendExtractionRunInputs).not.toHaveBeenCalled();
        expect(outcome.executed).toBe(false);
    });
});

describe('actionExecutor — cancel_extraction_run', () => {
    it('calls updateExtractionRun with status=cancelled', async () => {
        mockUpdateExtractionRun.mockResolvedValue({ id: 'run-1', status: 'cancelled' });

        const action: ProposedAction = {
            type: 'cancel_extraction_run',
            data: { runId: 'run-1', runName: 'Monday Wash' },
        };

        const outcome = await executeAction(action);

        expect(mockUpdateExtractionRun).toHaveBeenCalledWith('run-1', { status: 'cancelled' });
        expect(outcome.executed).toBe(true);
        expect(outcome.label).toContain('Cancelled');
        expect(outcome.label).toContain('Monday Wash');
    });

    it('skips when runId is missing', async () => {
        const action: ProposedAction = {
            type: 'cancel_extraction_run',
            data: {},
        };

        const outcome = await executeAction(action);

        expect(mockUpdateExtractionRun).not.toHaveBeenCalled();
        expect(outcome.executed).toBe(false);
    });
});

describe('actionExecutor — find_plants_result (stub)', () => {
    it('is display-only and does not call any API', async () => {
        const action: ProposedAction = {
            type: 'find_plants_result',
            data: {
                query: { strainName: 'Wedding Cake', roomName: 'Flower Room 2' },
                plants: [
                    { id: 'p1', label: 'WC-F-001', strain: 'Wedding Cake', room: 'Flower Room 2', phase: 'flowering', health: 65, contaminants: ['powdery_mildew'] },
                ],
                batches: [],
                totalMatches: 1,
            },
        };

        const outcome = await executeAction(action);

        expect(mockAmendExtractionRunInputs).not.toHaveBeenCalled();
        expect(mockUpdateExtractionRun).not.toHaveBeenCalled();
        expect(outcome.executed).toBe(true);
        expect(outcome.label).toContain('1 match');
    });

    it('pluralizes the match count', async () => {
        const action: ProposedAction = {
            type: 'find_plants_result',
            data: { query: {}, plants: [], batches: [], totalMatches: 6 },
        };

        const outcome = await executeAction(action);

        expect(outcome.label).toContain('6 matches');
    });
});
