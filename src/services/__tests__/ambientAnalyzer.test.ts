import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeAmbientChunk } from '../ambientAnalyzer';
import type { ActionItemState } from '../ambientAnalyzer';

// --- Mocks ---
const mockAiParse = vi.fn();
const mockExecuteAction = vi.fn();

vi.mock('../apiService', () => ({
    apiService: { aiParse: (...args: unknown[]) => mockAiParse(...args) },
}));

vi.mock('../actionExecutor', () => ({
    executeAction: (...args: unknown[]) => mockExecuteAction(...args),
}));

// --- Helpers ---
const dummyContext = { hasActiveSession: false };
const makeCallbacks = () => ({
    onCreateHumanTasks: vi.fn().mockResolvedValue(undefined),
    onSessionUpdate: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn(),
});

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('analyzeAmbientChunk', () => {
    it('returns no_action when AI returns zero actions', async () => {
        mockAiParse.mockResolvedValue({ actions: [], message: '' });

        const result = await analyzeAmbientChunk('just chatting', dummyContext, makeCallbacks());

        expect(result.status).toBe('no_action');
        expect(mockExecuteAction).not.toHaveBeenCalled();
    });

    it('executes automated actions and returns created', async () => {
        const action = { type: 'record_wet_weight', data: { harvestIdentifier: 'Wi Fi OG', weight: 574392 } };
        mockAiParse.mockResolvedValue({ actions: [action], message: 'Recorded.' });
        mockExecuteAction.mockResolvedValue({ executed: true, label: 'Weight recorded' });

        const cbs = makeCallbacks();
        const result = await analyzeAmbientChunk(
            'We are harvesting Wi Fi OG. 574392 grams of wet weight.',
            dummyContext,
            cbs,
        );

        expect(result.status).toBe('created');
        expect(mockExecuteAction).toHaveBeenCalledWith(action);
        expect(cbs.onSessionUpdate).toHaveBeenCalled();
        expect(cbs.onCreateHumanTasks).not.toHaveBeenCalled();
    });

    it('creates human tasks when AI returns create_human_task actions', async () => {
        const taskAction = {
            type: 'create_human_task',
            data: { title: 'Take 100 clones of Ice Cream Cake', priority: 'medium', category: 'cultivation', assignee: 'Anthony' },
        };
        mockAiParse.mockResolvedValue({ actions: [taskAction], message: 'Task created.' });

        const cbs = makeCallbacks();
        const result = await analyzeAmbientChunk(
            'Take 100 clones of ice cream cake and assign that to Anthony',
            dummyContext,
            cbs,
        );

        expect(result.status).toBe('created');
        expect(cbs.onCreateHumanTasks).toHaveBeenCalledWith([taskAction.data]);
        expect(mockExecuteAction).not.toHaveBeenCalled();
        expect(cbs.onSessionUpdate).not.toHaveBeenCalled();
    });

    it('handles mixed actions: automated + human tasks', async () => {
        const autoAction = { type: 'create_harvest', data: { strain: 'Wi Fi OG', plantCount: 500 } };
        const taskAction = { type: 'create_human_task', data: { title: 'Check dry room temps', priority: 'medium', category: 'environmental' } };
        mockAiParse.mockResolvedValue({ actions: [autoAction, taskAction], message: 'Done.' });
        mockExecuteAction.mockResolvedValue({ executed: true, label: 'Harvest created' });

        const cbs = makeCallbacks();
        const result = await analyzeAmbientChunk('harvest wifi og and check dry room temps', dummyContext, cbs);

        expect(result.status).toBe('created');
        expect(mockExecuteAction).toHaveBeenCalledWith(autoAction);
        expect(cbs.onCreateHumanTasks).toHaveBeenCalledWith([taskAction.data]);
        expect(cbs.onSessionUpdate).toHaveBeenCalled();
    });

    it('returns partial when all automated actions are skipped', async () => {
        const action = { type: 'update_plant_health', data: { plantIdentifier: 'Ice Cream Cake', health: 85 } };
        mockAiParse.mockResolvedValue({ actions: [action], message: '' });
        mockExecuteAction.mockResolvedValue({ executed: false, label: 'Skipped — no plants found' });

        const cbs = makeCallbacks();
        const result = await analyzeAmbientChunk('ice cream cake at 85%', dummyContext, cbs);

        expect(result.status).toBe('partial');
        expect(cbs.onSessionUpdate).not.toHaveBeenCalled();
    });

    it('returns partial when some actions execute and some skip', async () => {
        const okAction = { type: 'update_plant_health', data: { plantIdentifier: 'Sourdeezel', roomName: 'Veg 1', health: 98 } };
        const skipAction = { type: 'update_plant_health', data: { plantIdentifier: 'Unknown Strain', roomName: 'Veg 2', health: 50 } };
        mockAiParse.mockResolvedValue({ actions: [okAction, skipAction], message: '' });
        mockExecuteAction
            .mockResolvedValueOnce({ executed: true, label: 'Health updated' })
            .mockResolvedValueOnce({ executed: false, label: 'Skipped — no plants found' });

        const cbs = makeCallbacks();
        const result = await analyzeAmbientChunk('sourdeezel 98, unknown 50', dummyContext, cbs);

        expect(result.status).toBe('partial');
        expect(cbs.onSessionUpdate).toHaveBeenCalled();
    });

    it('calls onProgress after each action with updated statuses', async () => {
        const action1 = { type: 'update_plant_health', data: { plantIdentifier: 'OG Kush', health: 90 } };
        const action2 = { type: 'update_plant_health', data: { plantIdentifier: 'Blue Dream', health: 95 } };
        mockAiParse.mockResolvedValue({ actions: [action1, action2], message: '' });
        mockExecuteAction
            .mockResolvedValueOnce({ executed: true, label: 'Health updated' })
            .mockResolvedValueOnce({ executed: true, label: 'Health updated' });

        const cbs = makeCallbacks();
        await analyzeAmbientChunk('OG Kush 90, Blue Dream 95', dummyContext, cbs);

        // First call: both pending (initial state)
        expect(cbs.onProgress).toHaveBeenCalledTimes(3); // initial + after each action
        const firstCall = cbs.onProgress.mock.calls[0][0] as ActionItemState[];
        expect(firstCall.every(i => i.status === 'pending')).toBe(true);

        // Second call: first done, second pending
        const secondCall = cbs.onProgress.mock.calls[1][0] as ActionItemState[];
        expect(secondCall[0].status).toBe('done');
        expect(secondCall[1].status).toBe('pending');

        // Third call: both done
        const thirdCall = cbs.onProgress.mock.calls[2][0] as ActionItemState[];
        expect(thirdCall.every(i => i.status === 'done')).toBe(true);
    });

    it('works without onCreateHumanTasks callback', async () => {
        const autoAction = { type: 'record_wet_weight', data: { weight: 1000 } };
        mockAiParse.mockResolvedValue({ actions: [autoAction], message: '' });
        mockExecuteAction.mockResolvedValue({ executed: true, label: 'Weight recorded' });

        const result = await analyzeAmbientChunk('1000 grams', dummyContext, {
            onSessionUpdate: vi.fn().mockResolvedValue(undefined),
        });

        expect(result.status).toBe('created');
        expect(mockExecuteAction).toHaveBeenCalledWith(autoAction);
    });

    it('propagates errors from aiParse', async () => {
        mockAiParse.mockRejectedValue(new Error('Network error'));

        await expect(
            analyzeAmbientChunk('anything', dummyContext, makeCallbacks()),
        ).rejects.toThrow('Network error');
    });

    it('marks action as error when executeAction throws', async () => {
        const action = { type: 'record_wet_weight', data: { weight: 500 } };
        mockAiParse.mockResolvedValue({ actions: [action], message: '' });
        mockExecuteAction.mockRejectedValue(new Error('API down'));

        const cbs = makeCallbacks();
        // Should not throw — errors are captured per-action
        const result = await analyzeAmbientChunk('500 grams', dummyContext, cbs);

        // Last progress call should show error status
        const lastCall = cbs.onProgress.mock.calls.at(-1)?.[0] as ActionItemState[];
        expect(lastCall[0].status).toBe('error');
        expect(lastCall[0].detail).toContain('API down');
        // partial because nothing succeeded
        expect(result.status).toBe('partial');
    });
});
