import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeAmbientChunk } from '../ambientAnalyzer';

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

    it('executes automated actions and returns created with summary', async () => {
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
        expect(result.summary).toBe('Weight recorded');
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
        expect(result.summary).toContain('1 task created');
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
        expect(result.summary).toContain('Harvest created');
        expect(result.summary).toContain('1 task created');
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
        expect(result.summary).toContain('Skipped');
        expect(result.summary).toContain('no plants found');
        // Session should NOT be refreshed when nothing actually executed
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
        expect(result.summary).toContain('Health updated');
        expect(result.summary).toContain('Skipped');
        expect(cbs.onSessionUpdate).toHaveBeenCalled();
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

    it('propagates errors from executeAction', async () => {
        const action = { type: 'record_wet_weight', data: { weight: 500 } };
        mockAiParse.mockResolvedValue({ actions: [action], message: '' });
        mockExecuteAction.mockRejectedValue(new Error('API down'));

        await expect(
            analyzeAmbientChunk('500 grams', dummyContext, makeCallbacks()),
        ).rejects.toThrow('API down');
    });

    it('propagates errors from aiParse', async () => {
        mockAiParse.mockRejectedValue(new Error('Network error'));

        await expect(
            analyzeAmbientChunk('anything', dummyContext, makeCallbacks()),
        ).rejects.toThrow('Network error');
    });
});
