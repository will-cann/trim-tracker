/**
 * PA — Universal ambient confirmation gate
 *
 * Verifies that `useAIChat.proposeAmbientActions` surfaces ambient-captured
 * actions through the same pending/confirm gate used by action mode and does
 * NOT auto-execute them. Run with:
 *
 *     npx vitest run src/hooks/__tests__/useAIChat.proposeAmbient.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ProposedAction } from '../../types/definitions';

// --- Mocks (must be hoisted before importing the hook) ---
const mockExecuteAction = vi.fn();
const mockAiParse = vi.fn();

vi.mock('../../services/actionExecutor', () => ({
    executeAction: (...args: unknown[]) => mockExecuteAction(...args),
}));

vi.mock('../../services/apiService', () => ({
    apiService: { aiParse: (...args: unknown[]) => mockAiParse(...args) },
}));

// Import after mocks are set up
import { useAIChat } from '../useAIChat';

// Minimal options to bring up the hook with no persistence and no real session
const baseOptions = {
    session: null,
    trimmerProfiles: [],
    harvests: [],
    onSessionUpdate: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useAIChat.proposeAmbientActions (PA invariant)', () => {
    it('routes ambient actions into pendingActions instead of auto-executing', () => {
        const { result } = renderHook(() => useAIChat(baseOptions));

        const startRunAction: ProposedAction = {
            type: 'start_extraction_run',
            data: { runName: 'Toadstool OG - Live Rosin', strain: 'Toadstool OG' },
        };
        const recordExtractionAction: ProposedAction = {
            type: 'record_extraction',
            data: { strain: 'Blackberry', inputPackageType: 'fresh_frozen', outputPackageType: 'bubble_hash' },
        };

        act(() => {
            result.current.proposeAmbientActions(
                'start a wash for Toadstool OG with 2500g fresh frozen',
                [startRunAction, recordExtractionAction],
            );
        });

        // Pending actions should be set — confirmation gate is armed
        expect(result.current.pendingActions).toEqual([startRunAction, recordExtractionAction]);

        // Single assistant message that quotes the transcript inline above the proposal.
        // No emoji markers — the quoted blockquote + "from ambient" verb convey source.
        expect(result.current.messages).toHaveLength(1);
        const proposalMsg = result.current.messages[0];
        expect(proposalMsg.role).toBe('assistant');
        expect(proposalMsg.content).not.toContain('🎙️');
        expect(proposalMsg.content).toContain('start a wash for Toadstool OG');
        expect(proposalMsg.content).toContain('from ambient');
        expect(proposalMsg.actions).toEqual([startRunAction, recordExtractionAction]);
        expect(proposalMsg.status).toBe('pending');

        // CRITICAL: nothing was auto-executed
        expect(mockExecuteAction).not.toHaveBeenCalled();
        expect(baseOptions.onSessionUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when called with an empty action list', () => {
        const { result } = renderHook(() => useAIChat(baseOptions));

        act(() => {
            result.current.proposeAmbientActions('idle chatter, no actions', []);
        });

        expect(result.current.pendingActions).toBeNull();
        expect(result.current.messages).toHaveLength(0);
        expect(mockExecuteAction).not.toHaveBeenCalled();
    });

    it('cancelActions clears pending without calling executeAction', () => {
        const { result } = renderHook(() => useAIChat(baseOptions));

        const action: ProposedAction = {
            type: 'create_session',
            data: { strain: 'Blue Dream', startWeight: 500 },
        };

        act(() => {
            result.current.proposeAmbientActions('start a session for blue dream 500g', [action]);
        });
        expect(result.current.pendingActions).toEqual([action]);

        act(() => {
            result.current.cancelActions();
        });

        expect(result.current.pendingActions).toBeNull();
        expect(mockExecuteAction).not.toHaveBeenCalled();

        // The proposal message gets marked cancelled (preserves history)
        const proposalMsg = result.current.messages.find(m => m.role === 'assistant');
        expect(proposalMsg?.status).toBe('cancelled');
    });

    it('confirmActions executes only after explicit user confirmation', async () => {
        mockExecuteAction.mockResolvedValue({ executed: true, label: 'OK' });
        const { result } = renderHook(() => useAIChat(baseOptions));

        const action: ProposedAction = {
            type: 'create_harvest',
            data: { strain: 'Wedding Cake', plantCount: 12 },
        };

        act(() => {
            result.current.proposeAmbientActions('new harvest for wedding cake 12 plants', [action]);
        });
        // Still not executed at this point
        expect(mockExecuteAction).not.toHaveBeenCalled();

        await act(async () => {
            await result.current.confirmActions();
        });

        // NOW it executes — and only because the user confirmed
        expect(mockExecuteAction).toHaveBeenCalledTimes(1);
        expect(mockExecuteAction).toHaveBeenCalledWith(action);
        expect(result.current.pendingActions).toBeNull();
        expect(baseOptions.onSessionUpdate).toHaveBeenCalled();
    });
});
