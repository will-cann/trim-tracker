import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useDeepgram } from '../hooks/useDeepgram';
import { apiService } from '../services/apiService';
import { describeAction } from '../components/AmbientActionCenter';
import type { AmbientCapture, TranscriptLine } from '../components/AmbientActionCenter';
import type { ChatMessage, ProposedAction } from '../types/definitions';

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
    /**
     * Persist a completed ambient session to the conversation history store.
     * Called from end() when the session has any captures or transcript.
     */
    onSaveSession?: (id: string, title: string, messages: ChatMessage[], kind: 'ambient') => Promise<void>;
    /**
     * Edit the entity behind a capture chip. Currently used by the
     * Action Center's inline-edit affordance for task captures: the
     * user clicks a chip, fixes the title, and the parent looks up
     * the matching human task and updates it. Returns true on success.
     */
    onUpdateCapture?: (capture: AmbientCapture, updates: { title?: string }) => Promise<boolean>;
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
    /** Inline-edit a capture's underlying entity (e.g. task title). */
    updateCapture: (capture: AmbientCapture, updates: { title?: string }) => Promise<boolean>;
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

// Static cannabis cultivation / processing vocabulary. Primes Deepgram on
// every ambient session so domain terms (room types, processing verbs,
// material categories, common units) are recognized correctly. Dynamic
// terms (strain names, room names, trimmer names) are appended at start.
const STATIC_KEYTERMS: readonly string[] = [
    // Imperative speech acts the user is most likely to issue. These bias
    // the recognizer away from phonetically similar function words —
    // "remind me" stops becoming "find me", "log it" stops becoming "lock
    // it", etc. Keep this list focused on verbs that drive real actions.
    'remind me', 'tell', 'schedule', 'create', 'add', 'start', 'begin',
    'record', 'log', 'note', 'assign', 'move', 'transfer', 'submit',
    'finish', 'complete', 'mark', 'flag', 'pause', 'resume', 'cancel',
    // Material categories
    'flower', 'shake', 'trim', 'waste', 'biomass', 'fresh frozen',
    'bubble hash', 'rosin', 'live rosin', 'live resin', 'distillate',
    'kief', 'hash', 'cart', 'cartridge', 'terpenes',
    // Lifecycle stages
    'clone', 'mother', 'veg', 'vegetative', 'flower room', 'dry room',
    'cure', 'curing', 'bucking', 'trimming',
    // Domain verbs
    'harvest', 'allocate', 'package', 'weigh', 'bin', 'tag',
    // Units
    'grams', 'milliliters', 'ounces', 'pounds', 'milligrams',
    // Domain nouns
    'strain', 'batch', 'session', 'license', 'METRC', 'manifest',
    'plant batch', 'wet weight', 'dry weight', 'extraction run',
    // Common strain families
    'OG', 'Kush', 'Diesel', 'Gelato', 'Haze', 'Runtz', 'Cake',
    'Sativa', 'Indica', 'Hybrid',
];

// ─── Session serialization helpers ───────────────────────────────────────
function formatElapsedShort(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
}

function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSessionTitle(captureCount: number, elapsedMs: number): string {
    const duration = formatElapsedShort(elapsedMs);
    if (captureCount === 0) return `Transcript only · ${duration}`;
    return `${captureCount} captured · ${duration}`;
}

function formatSessionBody(
    captures: AmbientCapture[],
    transcript: TranscriptLine[],
    elapsedMs: number,
): string {
    const parts: string[] = [];
    parts.push(`**Ambient session · ${formatElapsedShort(elapsedMs)}**`);
    parts.push('');
    if (captures.length > 0) {
        parts.push(`**Captured (${captures.length})**`);
        for (const cap of captures) {
            const suffix = cap.summary ? ` — ${cap.summary}` : '';
            parts.push(`- ${cap.label}${suffix}`);
        }
        parts.push('');
    }
    if (transcript.length > 0) {
        parts.push(`**Transcript (${transcript.length})**`);
        for (const line of transcript) {
            parts.push(`> ${formatClock(line.timestamp)} — ${line.text}`);
        }
    }
    return parts.join('\n');
}

export const AmbientProvider: React.FC<AmbientProviderProps> = ({
    children,
    getContext,
    onCreateHumanTasks,
    onInterceptAction,
    onSaveSession,
    onUpdateCapture,
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
    const onSaveSessionRef = useRef(onSaveSession);
    const onUpdateCaptureRef = useRef(onUpdateCapture);
    useEffect(() => { getContextRef.current = getContext; }, [getContext]);
    useEffect(() => { onCreateHumanTasksRef.current = onCreateHumanTasks; }, [onCreateHumanTasks]);
    useEffect(() => { onInterceptActionRef.current = onInterceptAction; }, [onInterceptAction]);
    useEffect(() => { onSaveSessionRef.current = onSaveSession; }, [onSaveSession]);
    useEffect(() => { onUpdateCaptureRef.current = onUpdateCapture; }, [onUpdateCapture]);

    // Track the session id so end() knows what to write. Generated on start.
    const sessionIdRef = useRef<string | null>(null);
    const sessionStartedAtRef = useRef<number | null>(null);

    // ── Dynamic Deepgram keyterms ────────────────────────────────────────
    // Pulled once on mount + refreshed before each session start. These are
    // the proper nouns most likely to be mistranscribed: strain names, room
    // names, trimmer profile names, active harvest names. Combined with the
    // static cannabis vocab list at connect time.
    const dynamicKeytermsRef = useRef<string[]>([]);

    const refreshDynamicKeyterms = useCallback(async () => {
        try {
            const [strains, rooms, trimmers, harvests] = await Promise.all([
                apiService.getStrains().catch(() => []),
                apiService.getRooms().catch(() => []),
                apiService.getTrimmerProfiles().catch(() => []),
                apiService.getHarvests().catch(() => []),
            ]);
            const terms: string[] = [];
            for (const s of strains) if (s.name) terms.push(s.name);
            for (const r of rooms) if (r.name) terms.push(r.name);
            for (const t of trimmers) if (t.name) terms.push(t.name);
            for (const h of harvests) {
                if (h.batchId) terms.push(h.batchId);
                if (h.strain) terms.push(h.strain);
            }
            dynamicKeytermsRef.current = terms;
        } catch (err) {
            console.warn('[ambient] failed to refresh dynamic keyterms:', err);
        }
    }, []);

    // Prime the dynamic keyterms on mount so the first session starts with
    // them already in hand. Refreshed again on each start() call.
    useEffect(() => {
        refreshDynamicKeyterms();
    }, [refreshDynamicKeyterms]);

    const getKeyterms = useCallback((): string[] => {
        return [...STATIC_KEYTERMS, ...dynamicKeytermsRef.current];
    }, []);

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

    // ── Continuously persist the session to the Recent list ─────────────
    // Without this, an accidental refresh / tab close mid-session wipes
    // every capture before the user gets a chance to hit End. Now the
    // session record is upserted to chatDb whenever captures or transcript
    // lines change (debounced) so the in-progress work survives a reload.
    // The record appears in Recent immediately and stays current.
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!sessionActive) return;
        const sid = sessionIdRef.current;
        if (!sid) return;
        const hasContent = captures.length > 0 || transcriptLines.length > 0;
        if (!hasContent) return;
        if (!onSaveSessionRef.current) return;

        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            const title = formatSessionTitle(captures.length, elapsedMs);
            const content = formatSessionBody(captures, transcriptLines, elapsedMs);
            const message: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content,
            };
            onSaveSessionRef.current?.(sid, title, [message], 'ambient').catch(err => {
                console.warn('[ambient] continuous save failed:', err);
            });
        }, 500);

        return () => {
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
        };
    }, [sessionActive, captures, transcriptLines, elapsedMs]);

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

            // Captured = "auto-applied, no further action needed".
            // Review queue = "needs the user's OK before applying".
            // An action belongs to ONE list, never both. Reviewable items
            // get added to captures only after the user confirms them in
            // confirmPending().
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
        getKeyterms,
    });

    // ── Controls ─────────────────────────────────────────────────────────
    const start = useCallback(async () => {
        setMicError(null);
        // Refresh keyterms so anything added since mount (new strain, new
        // room, etc.) is included in this session's recognition prime.
        // Fire and forget — Deepgram will use whatever's already cached if
        // this hasn't completed by the time the WS opens.
        refreshDynamicKeyterms();
        // Fresh session — reset everything and stamp a new id.
        sessionIdRef.current = crypto.randomUUID();
        sessionStartedAtRef.current = Date.now();
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
            sessionIdRef.current = null;
            sessionStartedAtRef.current = null;
            setMicError(err instanceof Error ? err.message : 'Failed to start mic');
        }
    }, [startListening, refreshDynamicKeyterms]);

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
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }
        if (isListening) stopListening();
        bufferRef.current = '';
        setInterimText('');

        // Final synchronous save so a session ended right after a capture
        // doesn't lose the most recent content to the debounce window.
        // The continuous persist effect already handles the steady state.
        const sid = sessionIdRef.current;
        const hasContent = captures.length > 0 || transcriptLines.length > 0;
        if (sid && hasContent && onSaveSessionRef.current) {
            const title = formatSessionTitle(captures.length, elapsedMs);
            const content = formatSessionBody(captures, transcriptLines, elapsedMs);
            const message: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content,
            };
            onSaveSessionRef.current(sid, title, [message], 'ambient').catch(err => {
                console.error('[ambient] failed to save session on end:', err);
            });
        }

        sessionIdRef.current = null;
        sessionStartedAtRef.current = null;
        setSessionActive(false);
        setIsPaused(false);
        setRunStartedAt(null);
        setElapsedBeforeRun(0);
        setElapsedMs(0);
        setTranscriptLines([]);
        setCaptures([]);
        setPendingActions(null);
        setMicError(null);
    }, [isListening, stopListening, captures, transcriptLines, elapsedMs]);

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
            // Promote every confirmed action to the Captured list so the
            // user has a record of what they approved during this session.
            for (const action of pendingActions) {
                pushCapture(action);
            }
            setPendingActions(null);
        } catch (err) {
            setMicError(err instanceof Error ? err.message : 'Failed to apply actions');
        } finally {
            setIsExecutingPending(false);
        }
    }, [pendingActions, isExecutingPending, pushCapture]);

    const cancelPending = useCallback(() => {
        setPendingActions(null);
    }, []);

    // Edit a capture's underlying entity. Currently only handles task
    // captures (the most common STT-mistake target). Returns true on
    // success so the inline editor can collapse / show feedback.
    const updateCapture = useCallback(async (capture: AmbientCapture, updates: { title?: string }): Promise<boolean> => {
        if (!onUpdateCaptureRef.current) return false;
        try {
            const ok = await onUpdateCaptureRef.current(capture, updates);
            if (!ok) return false;
            // Reflect the update in the local capture list so the chip
            // immediately shows the new label.
            setCaptures(prev => prev.map(c =>
                c.id === capture.id
                    ? { ...c, summary: updates.title ?? c.summary }
                    : c
            ));
            return true;
        } catch (err) {
            console.warn('[ambient] updateCapture failed:', err);
            return false;
        }
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
        updateCapture,
    };

    return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>;
};
