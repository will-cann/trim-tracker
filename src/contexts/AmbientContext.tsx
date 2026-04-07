import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useDeepgram } from '../hooks/useDeepgram';
import { apiService } from '../services/apiService';
import { describeAction } from '../components/AmbientActionCenter';
import type { AmbientCapture, TranscriptLine } from '../components/AmbientActionCenter';
import type { ProposedAction } from '../types/definitions';

// ─────────────────────────────────────────────────────────────────────────────
// Ambient session context
//
// Hoists the entire ambient-listening lifecycle out of any single view so the
// session survives navigation. One Deepgram instance, one transcript buffer,
// one capture list, one timer, one pending-review queue — all readable from
// anywhere in the app via useAmbient().
//
// The provider is purposefully decoupled from specific data shapes: the
// parent passes a `getContext` callback that assembles whatever snapshot of
// domain state should accompany each ai-parse call (session, harvests,
// tasks, licenses, etc). Intercepts (extraction cards, auto-created tasks)
// are also delegated to the parent so view-scoped UI logic can stay where it
// belongs.
// ─────────────────────────────────────────────────────────────────────────────

interface AmbientProviderProps {
    children: React.ReactNode;
    /** Snapshot builder — called on every utterance flush. */
    getContext: () => Record<string, unknown>;
    /** Invoked for every non-intercepted task-style action (passive capture). */
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
    /** Return true to swallow an action (e.g. extraction card intercepts). */
    onInterceptAction?: (action: ProposedAction) => boolean;
}

interface AmbientContextValue {
    // Lifecycle state
    sessionActive: boolean;
    isListening: boolean;
    isPaused: boolean;
    elapsedMs: number;
    // Speech state
    interimText: string;
    hasVoiceSignal: boolean;
    micError: string | null;
    // Captured data
    transcriptLines: TranscriptLine[];
    captures: AmbientCapture[];
    pendingActions: ProposedAction[] | null;
    isExecutingPending: boolean;
    // Controls
    start: () => Promise<void>;
    pause: () => void;
    resume: () => Promise<void>;
    end: () => void;
    confirmPending: () => Promise<void>;
    cancelPending: () => void;
}

const AmbientContext = createContext<AmbientContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAmbient = (): AmbientContextValue => {
    const ctx = useContext(AmbientContext);
    if (!ctx) throw new Error('useAmbient must be used inside <AmbientProvider>');
    return ctx;
};

/** Safe variant for surfaces that may render outside the provider (unlikely but defensive). */
// eslint-disable-next-line react-refresh/only-export-components
export const useAmbientOptional = (): AmbientContextValue | null => useContext(AmbientContext);

const SILENCE_FLUSH_MS = 5000;

export const AmbientProvider: React.FC<AmbientProviderProps> = ({
    children,
    getContext,
    onCreateHumanTasks,
    onInterceptAction,
}) => {
    // ── Session lifecycle ────────────────────────────────────────────────
    const [sessionActive, setSessionActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [elapsedBeforeRun, setElapsedBeforeRun] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);

    // ── Speech buffers ───────────────────────────────────────────────────
    const bufferRef = useRef('');
    const [interimText, setInterimText] = useState('');
    const [micError, setMicError] = useState<string | null>(null);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Captured data ────────────────────────────────────────────────────
    const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
    const [captures, setCaptures] = useState<AmbientCapture[]>([]);
    const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
    const [isExecutingPending, setIsExecutingPending] = useState(false);

    // Refs for callbacks passed via props so deepgram handlers don't re-bind
    const getContextRef = useRef(getContext);
    const onCreateHumanTasksRef = useRef(onCreateHumanTasks);
    const onInterceptActionRef = useRef(onInterceptAction);
    useEffect(() => { getContextRef.current = getContext; }, [getContext]);
    useEffect(() => { onCreateHumanTasksRef.current = onCreateHumanTasks; }, [onCreateHumanTasks]);
    useEffect(() => { onInterceptActionRef.current = onInterceptAction; }, [onInterceptAction]);

    // ── Tick elapsed time every second while listening ───────────────────
    useEffect(() => {
        if (!sessionActive) return;
        if (isPaused || runStartedAt == null) {
            setElapsedMs(elapsedBeforeRun);
            return;
        }
        const update = () => setElapsedMs(elapsedBeforeRun + (Date.now() - runStartedAt));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [sessionActive, isPaused, runStartedAt, elapsedBeforeRun]);

    // ── Capture push ─────────────────────────────────────────────────────
    const pushCapture = useCallback((action: ProposedAction) => {
        const described = describeAction(action);
        setCaptures(prev => [...prev, {
            id: crypto.randomUUID(),
            actionType: action.type,
            label: described.label,
            summary: described.summary,
            kind: described.kind,
            timestamp: Date.now(),
        }]);
    }, []);

    // ── Analyzer ─────────────────────────────────────────────────────────
    const analyzeChunk = useCallback(async (text: string) => {
        if (!text.trim()) return;
        try {
            const result = await apiService.aiParse({
                transcriptChunks: [text],
                context: getContextRef.current(),
            });
            const allActions = result.actions as ProposedAction[];

            const reviewable: ProposedAction[] = [];
            const humanTaskActions: ProposedAction[] = [];

            for (const action of allActions) {
                if (onInterceptActionRef.current?.(action)) {
                    pushCapture(action);
                    continue;
                }
                if (action.type === 'create_human_task') {
                    humanTaskActions.push(action);
                    pushCapture(action);
                } else {
                    reviewable.push(action);
                    pushCapture(action);
                }
            }

            if (humanTaskActions.length > 0 && onCreateHumanTasksRef.current) {
                await onCreateHumanTasksRef.current(humanTaskActions.map(a => a.data as { title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }));
            }

            if (reviewable.length > 0) {
                // Merge into any existing pending queue so multiple utterances stack.
                setPendingActions(prev => (prev && prev.length > 0 ? [...prev, ...reviewable] : reviewable));
            }
        } catch (err) {
            setMicError(err instanceof Error ? err.message : 'Ambient parse failed');
        }
    }, [pushCapture]);

    // ── Deepgram wiring ──────────────────────────────────────────────────
    const handleTranscript = useCallback((text: string, isFinal: boolean) => {
        if (!isFinal) {
            setInterimText(text);
            return;
        }
        const trimmed = text.trim();
        setInterimText('');
        if (!trimmed) return;

        bufferRef.current = bufferRef.current ? `${bufferRef.current} ${trimmed}` : trimmed;
        setTranscriptLines(prev => [...prev, {
            id: crypto.randomUUID(),
            text: trimmed,
            timestamp: Date.now(),
        }]);

        // Reset the silence debounce on every final chunk.
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
            const text = bufferRef.current;
            if (text.trim()) {
                bufferRef.current = '';
                analyzeChunk(text);
            }
        }, SILENCE_FLUSH_MS);
    }, [analyzeChunk]);

    const handleUtteranceEnd = useCallback(() => {
        // Backup path if Deepgram does emit it — just nudge the silence timer.
        if (!bufferRef.current.trim()) return;
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
            const text = bufferRef.current;
            if (text.trim()) {
                bufferRef.current = '';
                analyzeChunk(text);
            }
        }, SILENCE_FLUSH_MS);
    }, [analyzeChunk]);

    const handleError = useCallback((err: string) => {
        setMicError(err);
        setTimeout(() => setMicError(null), 5000);
    }, []);

    const { isListening, startListening, stopListening } = useDeepgram({
        mode: 'ambient',
        onTranscript: handleTranscript,
        onUtteranceEnd: handleUtteranceEnd,
        onError: handleError,
    });

    // ── Controls ─────────────────────────────────────────────────────────
    const start = useCallback(async () => {
        setMicError(null);
        // Fresh session — reset everything.
        bufferRef.current = '';
        setInterimText('');
        setTranscriptLines([]);
        setCaptures([]);
        setPendingActions(null);
        setElapsedBeforeRun(0);
        setElapsedMs(0);
        setIsPaused(false);
        setSessionActive(true);
        setRunStartedAt(Date.now());
        try {
            await startListening();
        } catch (err) {
            setSessionActive(false);
            setRunStartedAt(null);
            setMicError(err instanceof Error ? err.message : 'Failed to start mic');
        }
    }, [startListening]);

    const pause = useCallback(() => {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        // Flush any remaining buffer before pausing so the user's last
        // utterance isn't lost.
        if (bufferRef.current.trim()) {
            analyzeChunk(bufferRef.current);
            bufferRef.current = '';
        }
        setInterimText('');
        setIsPaused(true);
        setElapsedBeforeRun(prev => prev + (runStartedAt ? Date.now() - runStartedAt : 0));
        setRunStartedAt(null);
        stopListening();
    }, [analyzeChunk, stopListening, runStartedAt]);

    const resume = useCallback(async () => {
        setMicError(null);
        try {
            setRunStartedAt(Date.now());
            setIsPaused(false);
            await startListening();
        } catch (err) {
            setIsPaused(true);
            setRunStartedAt(null);
            setMicError(err instanceof Error ? err.message : 'Failed to resume mic');
        }
    }, [startListening]);

    const end = useCallback(() => {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        if (isListening) stopListening();
        bufferRef.current = '';
        setInterimText('');
        setSessionActive(false);
        setIsPaused(false);
        setRunStartedAt(null);
        setElapsedBeforeRun(0);
        setElapsedMs(0);
        setTranscriptLines([]);
        setCaptures([]);
        setPendingActions(null);
        setMicError(null);
    }, [isListening, stopListening]);

    // ── Pending review handling (ambient-only queue) ─────────────────────
    // This is deliberately separate from the main chat pending queue in
    // useAIChat. Ambient captures are reviewed inside the Action Center.
    const confirmPending = useCallback(async () => {
        if (!pendingActions || isExecutingPending) return;
        setIsExecutingPending(true);
        try {
            const { executeAction } = await import('../services/actionExecutor');
            const humanTaskCreates = pendingActions.filter(a => a.type === 'create_human_task');
            const humanTaskUpdates = pendingActions.filter(a => a.type === 'update_human_task');
            const humanTaskDeletes = pendingActions.filter(a => a.type === 'delete_human_task');
            const automated = pendingActions.filter(a =>
                a.type !== 'create_human_task'
                && a.type !== 'update_human_task'
                && a.type !== 'delete_human_task'
            );

            for (const action of automated) {
                await executeAction(action);
            }
            if (humanTaskCreates.length > 0 && onCreateHumanTasksRef.current) {
                await onCreateHumanTasksRef.current(humanTaskCreates.map(a => a.data as { title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }));
            }
            // Update/delete paths are uncommon in ambient — skip for now.
            if (humanTaskUpdates.length > 0 || humanTaskDeletes.length > 0) {
                console.warn('[ambient] update/delete human tasks not yet wired in ambient confirm path');
            }
            setPendingActions(null);
        } catch (err) {
            setMicError(err instanceof Error ? err.message : 'Failed to apply actions');
        } finally {
            setIsExecutingPending(false);
        }
    }, [pendingActions, isExecutingPending]);

    const cancelPending = useCallback(() => {
        setPendingActions(null);
    }, []);

    const value: AmbientContextValue = {
        sessionActive,
        isListening,
        isPaused,
        elapsedMs,
        interimText,
        hasVoiceSignal: !isPaused && interimText.trim().length > 0,
        micError,
        transcriptLines,
        captures,
        pendingActions,
        isExecutingPending,
        start,
        pause,
        resume,
        end,
        confirmPending,
        cancelPending,
    };

    return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>;
};
