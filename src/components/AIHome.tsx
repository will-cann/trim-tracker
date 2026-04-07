import { useState, useRef, useEffect, useCallback } from 'react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { AIEmptyState } from './AIEmptyState';
import type { FacilitySetupStatus } from './AIEmptyState';
import { AIChat } from './AIChat';
import { isCardReady } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { AmbientActionCenter, describeAction } from './AmbientActionCenter';
import type { AmbientCapture, TranscriptLine } from './AmbientActionCenter';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, ChatMessage, License, HumanTask, SpeechMode, ConversationSummary, ProposedAction } from '../types/definitions';

interface AIHomeProps {
    conversationId: string | null;
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests: Harvest[];
    onSessionUpdate: () => Promise<void>;
    onSaveConversation: (id: string, title: string, messages: ChatMessage[]) => Promise<void>;
    onLoadConversation: (id: string) => Promise<ChatMessage[]>;
    onConversationStarted: (id: string) => void;
    licenses?: License[];
    activeLicenseId?: string | null;
    onLicenseChange?: (id: string) => void;
    onViewChange?: (view: string) => void;
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
    onUpdateHumanTask?: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteHumanTask?: (id: string) => Promise<void>;
    humanTasks?: HumanTask[];
    plantMapSummary?: Array<{ roomName: string; roomId: string; strains: string[]; plantIds: string[]; entityType: 'plants' | 'plantbatches'; plantHealth: number; contaminants: string[] }>;
    injectedVoiceText?: string | null;
    onClearInjectedText?: () => void;
    screenContext?: string;
    // Conversation history (moved from sidebar)
    conversations: ConversationSummary[];
    onSelectConversation: (id: string) => void;
    onDeleteConversation: (id: string) => void;
}

export const AIHome: React.FC<AIHomeProps> = ({
    conversationId,
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    onSaveConversation,
    onLoadConversation,
    onConversationStarted,
    licenses = [],
    activeLicenseId,
    onLicenseChange,
    onViewChange,
    onCreateHumanTasks,
    onUpdateHumanTask,
    onDeleteHumanTask,
    humanTasks,
    plantMapSummary,
    injectedVoiceText,
    onClearInjectedText,
    screenContext,
    conversations,
    onSelectConversation,
    onDeleteConversation,
}) => {
    // ── Facility setup status (for first-run checklist) ──
    const [facilitySetup, setFacilitySetup] = useState<FacilitySetupStatus>({
        hasLicenses: true, hasStrains: true, hasRooms: true, loading: true,
    });

    useEffect(() => {
        let cancelled = false;
        Promise.all([apiService.getStrains(), apiService.getRooms()]).then(([strains, rooms]) => {
            if (!cancelled) {
                setFacilitySetup({
                    hasLicenses: licenses.length > 0,
                    hasStrains: strains.length > 0,
                    hasRooms: rooms.length > 0,
                    loading: false,
                });
            }
        });
        return () => { cancelled = true; };
    }, [licenses.length]);

    // ── Input state ──
    const [inputText, setInputText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const conversationIdRef = useRef<string | null>(null);

    // ── Extraction run cards ──
    const [extractionRunCards, setExtractionRunCards] = useState<ExtractionRunCardData[]>([]);

    // ── Voice state ──
    const [voiceMode, setVoiceMode] = useState<SpeechMode>('action');
    const inlineTranscriptRef = useRef('');
    const [inlineInterim, setInlineInterim] = useState('');
    const [micError, setMicError] = useState<string | null>(null);
    const voiceModeRef = useRef(voiceMode);
    voiceModeRef.current = voiceMode;
    const ambientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Ambient session state (transcript + captures kept out of the chat UI) ──
    // Session lifecycle is independent of Deepgram's listening state: the user
    // can Stop (mute mic, freeze timer, keep the Action Center visible with
    // all captures intact) and Resume (restart mic, continue the same session).
    // Only "End session" actually tears the state down.
    const [ambientSessionActive, setAmbientSessionActive] = useState(false);
    const [ambientPaused, setAmbientPaused] = useState(false);
    const [ambientRunStartedAt, setAmbientRunStartedAt] = useState<number | null>(null); // start of the CURRENT listening run
    const [ambientElapsedBeforeRun, setAmbientElapsedBeforeRun] = useState(0);            // accumulated elapsed ms from prior runs
    const [ambientElapsedMs, setAmbientElapsedMs] = useState(0);
    const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
    const [ambientCaptures, setAmbientCaptures] = useState<AmbientCapture[]>([]);

    // Tick the elapsed counter every second while listening (not while paused).
    useEffect(() => {
        if (!ambientSessionActive) return;
        if (ambientPaused || ambientRunStartedAt == null) {
            setAmbientElapsedMs(ambientElapsedBeforeRun);
            return;
        }
        const update = () => setAmbientElapsedMs(ambientElapsedBeforeRun + (Date.now() - ambientRunStartedAt));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [ambientSessionActive, ambientPaused, ambientRunStartedAt, ambientElapsedBeforeRun]);

    // ── Ambient mode context + analysis ──
    const buildAmbientContext = useCallback(() => ({
        hasActiveSession: !!session,
        sessionId: session?.id,
        trimmerProfiles: trimmerProfiles.map(p => ({ id: p.id, name: p.name })),
        existingEntries: (session?.entries || []).map(e => ({
            id: e.id, harvestName: e.harvestName, strain: e.strain, status: e.status,
        })),
        harvests: (harvests || []).map(h => ({
            id: h.id, batchId: h.batchId, strain: h.strain, status: h.status,
        })),
        activeLicenseNumber: licenses.find(l => l.id === activeLicenseId)?.licenseNumber || undefined,
        humanTasks: (humanTasks || []).map(t => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            category: t.category, assignee: t.assignee, location: t.location,
        })),
    }), [session, trimmerProfiles, harvests, activeLicenseId, licenses, humanTasks]);

    // ── Extraction card intercept ──
    const handleInterceptAction = useCallback((action: ProposedAction): boolean => {
        if (action.type !== 'record_extraction') return false;
        const d = action.data;
        setExtractionRunCards(prev => {
            let match = d.strain
                ? prev.find(c => c.status === 'filling' && c.strain?.toLowerCase() === d.strain.toLowerCase())
                : null;
            if (!match) {
                const filling = prev.filter(c => c.status === 'filling');
                if (filling.length === 1) match = filling[0];
            }
            const now = Date.now();
            if (match) {
                const updated = { ...match, lastUpdatedAt: now };
                const fieldsToMerge: (keyof ExtractionRunCardData)[] = [
                    'strain', 'inputPackageType', 'inputQuantity', 'outputPackageType',
                    'outputQuantity', 'licenseNumber', 'sourcePackageId', 'outputLabel',
                    'wasteWeight', 'notes',
                ];
                let lastField: string | null = null;
                for (const key of fieldsToMerge) {
                    const incoming = d[key];
                    if (incoming === null || incoming === undefined) continue;
                    const existing = (match as any)[key];
                    if (existing === null || existing === undefined || existing === '' || key === 'notes' || existing !== incoming) {
                        (updated as any)[key] = incoming;
                        lastField = key;
                    }
                }
                updated.lastUpdatedField = lastField;
                if (isCardReady(updated)) updated.status = 'ready';
                return prev.map(c => c.id === match!.id ? updated : c);
            } else {
                const card: ExtractionRunCardData = {
                    id: crypto.randomUUID(), createdAt: new Date(),
                    strain: d.strain || null, inputPackageType: d.inputPackageType || null,
                    inputQuantity: d.inputQuantity || null, outputPackageType: d.outputPackageType || null,
                    outputQuantity: d.outputQuantity || null, licenseNumber: d.licenseNumber || null,
                    sourcePackageId: d.sourcePackageId || null, outputLabel: d.outputLabel || null,
                    wasteWeight: d.wasteWeight || null, notes: d.notes || null,
                    status: 'filling', lastUpdatedField: 'strain', lastUpdatedAt: now,
                };
                if (isCardReady(card)) card.status = 'ready';
                return [...prev, card];
            }
        });
        return true;
    }, []);

    const handleExtractionSubmit = useCallback(async (cardId: string) => {
        const card = extractionRunCards.find(c => c.id === cardId);
        if (!card) return;
        if (!isCardReady(card)) {
            setExtractionRunCards(prev => prev.map(c =>
                c.id === cardId ? { ...c, status: 'filling' as const } : c
            ));
            return;
        }
        setExtractionRunCards(prev => prev.map(c =>
            c.id === cardId ? { ...c, status: 'submitting' as const } : c
        ));
        try {
            await apiService.recordExtraction({
                sourcePackageId: card.sourcePackageId || undefined,
                inputPackageType: card.inputPackageType!,
                inputQuantity: card.inputQuantity!,
                outputPackageType: card.outputPackageType!,
                outputQuantity: card.outputQuantity!,
                outputLabel: card.outputLabel || undefined,
                strain: card.strain!,
                licenseNumber: card.licenseNumber || undefined,
                wasteWeight: card.wasteWeight || undefined,
                notes: card.notes || undefined,
            });
            setExtractionRunCards(prev => prev.map(c =>
                c.id === cardId ? { ...c, status: 'submitted' as const } : c
            ));
            setTimeout(() => {
                setExtractionRunCards(prev => prev.filter(c => c.id !== cardId));
            }, 3000);
            await onSessionUpdate();
        } catch {
            setExtractionRunCards(prev => prev.map(c =>
                c.id === cardId ? { ...c, status: 'error' as const } : c
            ));
        }
    }, [extractionRunCards, onSessionUpdate]);

    const handleExtractionDismiss = useCallback((cardId: string) => {
        setExtractionRunCards(prev => prev.filter(c => c.id !== cardId));
    }, []);

    const handleExtractionCardUpdate = useCallback((cardId: string, updates: Partial<ExtractionRunCardData>) => {
        setExtractionRunCards(prev => prev.map(c => {
            if (c.id !== cardId) return c;
            const updated = { ...c, ...updates };
            if (isCardReady(updated) && updated.status === 'filling') updated.status = 'ready';
            return updated;
        }));
    }, []);

    // ── AI Chat hook (must be before analyzeAmbientChunk so proposeAmbientActions is available) ──
    const {
        messages, isLoading, pendingActions, isExecuting,
        sendMessage, sendCSV, confirmActions, cancelActions,
        editAction, editMessage, clearMessages, loadMessages, setConversationId,
        proposeAmbientActions,
    } = useAIChat({
        session, trimmerProfiles, harvests, onSessionUpdate, conversationId, onSaveConversation,
        activeLicense: licenses.find(l => l.id === activeLicenseId)?.licenseNumber || null,
        onInterceptAction: handleInterceptAction,
        onCreateHumanTasks, onUpdateHumanTask, onDeleteHumanTask,
        humanTasks: humanTasks?.map(t => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            category: t.category, assignee: t.assignee, location: t.location,
        })),
        plantMapSummary, screenContext,
    });

    const pushCapture = useCallback((action: ProposedAction) => {
        const described = describeAction(action);
        setAmbientCaptures(prev => [...prev, {
            id: crypto.randomUUID(),
            actionType: action.type,
            label: described.label,
            summary: described.summary,
            kind: described.kind,
            timestamp: Date.now(),
        }]);
    }, []);

    const analyzeAmbientChunk = useCallback(async (text: string) => {
        if (!text.trim()) return;
        try {
            const result = await apiService.aiParse({
                transcriptChunks: [text],
                context: buildAmbientContext(),
            });
            const allActions = result.actions as ProposedAction[];

            // Split: extraction-card intercepts → handled inline,
            // create_human_task → auto-captured (passive), surfaced as a capture chip,
            // everything else → pending review in the Action Center.
            const reviewable: ProposedAction[] = [];
            const humanTaskActions: ProposedAction[] = [];

            for (const action of allActions) {
                if (handleInterceptAction(action)) {
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

            if (humanTaskActions.length > 0 && onCreateHumanTasks) {
                await onCreateHumanTasks(humanTaskActions.map(a => a.data as { title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }));
            }

            if (reviewable.length > 0) {
                // Surface via the existing pending-actions gate so the Action
                // Center can confirm/cancel them — but do NOT inject a chat
                // message (the ambient UI is the source of truth while
                // listening). The chat log stays clean.
                proposeAmbientActions('', reviewable, true);
            }
        } catch (err) {
            // Surface ambient analysis failures to the tagline instead of
            // dropping silently — the Action Center will show the message.
            setMicError(err instanceof Error ? err.message : 'Ambient parse failed');
        }
    }, [buildAmbientContext, onCreateHumanTasks, handleInterceptAction, proposeAmbientActions, pushCapture]);

    // ── Deepgram voice hooks ──
    // Action mode: transcript flows into the textarea so the user can edit/send.
    // Ambient mode: transcript is silent — it accumulates into a background log
    // and a live "interim" line that the Ambient Action Center can choose to
    // surface. We never touch inputText in ambient mode.
    const handleInlineTranscript = useCallback((text: string, isFinal: boolean) => {
        if (voiceModeRef.current === 'action') {
            if (isFinal) {
                inlineTranscriptRef.current = inlineTranscriptRef.current
                    ? `${inlineTranscriptRef.current} ${text}` : text;
                setInputText(prev => {
                    const base = prev.replace(inlineInterim, '').trimEnd();
                    return base ? `${base} ${text}` : text;
                });
                setInlineInterim('');
            } else {
                setInlineInterim(text);
                setInputText(prev => {
                    const base = inlineTranscriptRef.current || prev.replace(inlineInterim, '').trimEnd();
                    return base ? `${base} ${text}` : text;
                });
            }
            return;
        }

        // Ambient mode — silent capture only.
        // Deepgram runs with endpointing=false + vad_events=true in ambient
        // mode, which means UtteranceEnd messages are unreliable. Instead,
        // we flush on silence: every final transcript resets a 5-second
        // timer; when the timer fires with no new speech, we analyze.
        if (isFinal) {
            const trimmed = text.trim();
            if (trimmed) {
                inlineTranscriptRef.current = inlineTranscriptRef.current
                    ? `${inlineTranscriptRef.current} ${trimmed}` : trimmed;
                setTranscriptLines(prev => [...prev, {
                    id: crypto.randomUUID(),
                    text: trimmed,
                    timestamp: Date.now(),
                }]);

                // Reset silence debounce on every final chunk.
                if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
                ambientDebounceRef.current = setTimeout(() => {
                    const buffered = inlineTranscriptRef.current;
                    if (buffered.trim()) {
                        inlineTranscriptRef.current = '';
                        analyzeAmbientChunk(buffered);
                    }
                }, 5000);
            }
            setInlineInterim('');
        } else {
            setInlineInterim(text);
        }
    }, [inlineInterim, analyzeAmbientChunk]);

    // Backup: if Deepgram does emit UtteranceEnd, nudge the debounce.
    // Never flushes immediately — just keeps the silence timer alive so a
    // mid-thought pause doesn't split a single intent across two analyses.
    const handleUtteranceEnd = useCallback(() => {
        if (voiceModeRef.current !== 'ambient') return;
        if (!inlineTranscriptRef.current.trim()) return;
        if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
        ambientDebounceRef.current = setTimeout(() => {
            const buffered = inlineTranscriptRef.current;
            if (buffered.trim()) {
                inlineTranscriptRef.current = '';
                analyzeAmbientChunk(buffered);
            }
        }, 5000);
    }, [analyzeAmbientChunk]);

    const handleInlineError = useCallback((err: string) => {
        setMicError(err);
        setTimeout(() => setMicError(null), 5000);
    }, []);

    const { isListening, startListening, stopListening, error: deepgramError } = useDeepgram({
        mode: voiceMode,
        onTranscript: handleInlineTranscript,
        onUtteranceEnd: handleUtteranceEnd,
        onError: handleInlineError,
    });

    const handleVoiceToggle = useCallback(async () => {
        setMicError(null);
        if (isListening) {
            if (ambientDebounceRef.current) {
                clearTimeout(ambientDebounceRef.current);
                ambientDebounceRef.current = null;
            }
            if (voiceModeRef.current === 'ambient' && inlineTranscriptRef.current.trim()) {
                analyzeAmbientChunk(inlineTranscriptRef.current);
                inlineTranscriptRef.current = '';
            }
            // Action mode: just stop. Ambient mode: the VoicePill routes through
            // the pause path below so we don't tear down the session.
            if (voiceModeRef.current === 'ambient') {
                setAmbientPaused(true);
                setAmbientElapsedBeforeRun(prev => prev + (ambientRunStartedAt ? Date.now() - ambientRunStartedAt : 0));
                setAmbientRunStartedAt(null);
            }
            stopListening();
        } else {
            inlineTranscriptRef.current = voiceMode === 'action' ? inputText : '';
            setInlineInterim('');
            if (voiceMode === 'ambient') {
                setInputText('');
                // Starting fresh from the VoicePill: reset all session state.
                setTranscriptLines([]);
                setAmbientCaptures([]);
                setAmbientElapsedBeforeRun(0);
                setAmbientRunStartedAt(Date.now());
                setAmbientPaused(false);
                setAmbientSessionActive(true);
            }
            try { await startListening(); }
            catch (err) {
                if (voiceMode === 'ambient') {
                    setAmbientSessionActive(false);
                    setAmbientRunStartedAt(null);
                }
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            }
        }
    }, [isListening, startListening, stopListening, inputText, voiceMode, analyzeAmbientChunk, ambientRunStartedAt]);

    const handleModeSwitch = useCallback((mode: SpeechMode) => {
        if (ambientDebounceRef.current) { clearTimeout(ambientDebounceRef.current); ambientDebounceRef.current = null; }
        if (isListening) stopListening();
        setVoiceMode(mode);
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
    }, [isListening, stopListening]);

    // One-click ambient start
    const [wantAmbientStart, setWantAmbientStart] = useState(false);

    const handleStartAmbient = useCallback(() => {
        // If ambient is already listening, toggle to paused (same as Stop button).
        if (isListening && voiceMode === 'ambient') {
            if (ambientDebounceRef.current) { clearTimeout(ambientDebounceRef.current); ambientDebounceRef.current = null; }
            if (inlineTranscriptRef.current.trim()) {
                analyzeAmbientChunk(inlineTranscriptRef.current);
                inlineTranscriptRef.current = '';
            }
            setAmbientPaused(true);
            setAmbientElapsedBeforeRun(prev => prev + (ambientRunStartedAt ? Date.now() - ambientRunStartedAt : 0));
            setAmbientRunStartedAt(null);
            stopListening();
            return;
        }
        if (isListening) stopListening();
        setVoiceMode('ambient');
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
        // Fresh session — reset everything.
        setTranscriptLines([]);
        setAmbientCaptures([]);
        setAmbientElapsedBeforeRun(0);
        setAmbientPaused(false);
        setAmbientSessionActive(true);
        setWantAmbientStart(true);
    }, [isListening, stopListening, voiceMode, analyzeAmbientChunk, ambientRunStartedAt]);

    useEffect(() => {
        if (wantAmbientStart && voiceMode === 'ambient' && !isListening) {
            setWantAmbientStart(false);
            setAmbientRunStartedAt(Date.now());
            startListening().catch(err => {
                setAmbientSessionActive(false);
                setAmbientRunStartedAt(null);
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            });
        }
    }, [wantAmbientStart, voiceMode, isListening, startListening]);

    // Pause — mute mic, freeze timer, keep all session state intact.
    const handleAmbientPause = useCallback(() => {
        if (ambientDebounceRef.current) {
            clearTimeout(ambientDebounceRef.current);
            ambientDebounceRef.current = null;
        }
        if (inlineTranscriptRef.current.trim()) {
            analyzeAmbientChunk(inlineTranscriptRef.current);
            inlineTranscriptRef.current = '';
        }
        setInlineInterim('');
        setAmbientPaused(true);
        setAmbientElapsedBeforeRun(prev => prev + (ambientRunStartedAt ? Date.now() - ambientRunStartedAt : 0));
        setAmbientRunStartedAt(null);
        stopListening();
    }, [analyzeAmbientChunk, stopListening, ambientRunStartedAt]);

    // Resume — restart mic, timer continues from where it was paused.
    const handleAmbientResume = useCallback(async () => {
        setMicError(null);
        try {
            setAmbientRunStartedAt(Date.now());
            setAmbientPaused(false);
            await startListening();
        } catch (err) {
            setAmbientPaused(true);
            setAmbientRunStartedAt(null);
            setMicError(err instanceof Error ? err.message : 'Failed to resume mic');
        }
    }, [startListening]);

    // End session — explicit exit. Clears all ambient state and returns
    // the user to the regular AI home (or chat if there are messages).
    const handleAmbientEnd = useCallback(() => {
        if (ambientDebounceRef.current) {
            clearTimeout(ambientDebounceRef.current);
            ambientDebounceRef.current = null;
        }
        if (isListening) stopListening();
        inlineTranscriptRef.current = '';
        setInlineInterim('');
        setAmbientSessionActive(false);
        setAmbientPaused(false);
        setAmbientRunStartedAt(null);
        setAmbientElapsedBeforeRun(0);
        setAmbientElapsedMs(0);
        setTranscriptLines([]);
        setAmbientCaptures([]);
    }, [isListening, stopListening]);

    // ── Conversation lifecycle ──
    const isNewConversationRef = useRef(false);

    useEffect(() => {
        if (conversationId && conversationId !== conversationIdRef.current) {
            const prevId = conversationIdRef.current;
            conversationIdRef.current = conversationId;
            if (prevId === null && messages.length > 0) {
                isNewConversationRef.current = true;
                return;
            }
            onLoadConversation(conversationId).then(msgs => {
                if (msgs.length > 0) loadMessages(msgs);
            });
        } else if (!conversationId && conversationIdRef.current !== null) {
            conversationIdRef.current = null;
            isNewConversationRef.current = false;
            clearMessages();
        }
    }, [conversationId, onLoadConversation, loadMessages, clearMessages]);

    // Injected voice text from external
    useEffect(() => {
        if (injectedVoiceText) {
            setInputText(injectedVoiceText);
            onClearInjectedText?.();
            textareaRef.current?.focus();
        }
    }, [injectedVoiceText, onClearInjectedText]);

    // ── Handlers ──
    const handleSend = useCallback((text: string) => {
        if (!text.trim() || isLoading) return;
        if (pendingActions && pendingActions.length > 0) cancelActions();
        if (!conversationId) {
            const newId = crypto.randomUUID();
            setConversationId(newId);
            onConversationStarted(newId);
        }
        sendMessage(text.trim());
        setInputText('');
        inlineTranscriptRef.current = '';
        setInlineInterim('');
        if (isListening) stopListening();
    }, [isLoading, conversationId, onConversationStarted, sendMessage, setConversationId, isListening, stopListening, pendingActions, cancelActions]);

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSend(inputText); };
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(inputText); }
    };

    const handleFileUpload = useCallback((file: File) => {
        if (!file.name.endsWith('.csv')) { alert('Please upload a CSV file.'); return; }
        if (file.size > 1024 * 1024) { alert('File is too large. Please upload a CSV under 1MB.'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text?.trim()) {
                if (!conversationId) {
                    const newId = crypto.randomUUID();
                    setConversationId(newId);
                    onConversationStarted(newId);
                }
                sendCSV(text);
            }
        };
        reader.readAsText(file);
    }, [conversationId, onConversationStarted, sendCSV, setConversationId]);

    // ── License selector ──
    const licenseSelector = licenses.length > 0 ? (
        <div className="ai-license-selector">
            {licenses.map(lic => (
                <button
                    key={lic.id}
                    className={`ai-license-pill ${lic.id === activeLicenseId ? 'active' : ''}`}
                    onClick={() => onLicenseChange?.(lic.id)}
                    title={lic.label || lic.licenseNumber}
                >
                    {lic.label || lic.licenseNumber}
                </button>
            ))}
        </div>
    ) : null;

    const combinedError = micError || deepgramError || null;
    const hasMessages = messages.length > 0;
    // The Action Center stays visible as long as the session is active,
    // regardless of whether the mic is currently listening or paused.
    const showAmbientCenter = voiceMode === 'ambient' && ambientSessionActive;

    return (
        <div className="ai-home">
            {showAmbientCenter ? (
                <AmbientActionCenter
                    elapsedMs={ambientElapsedMs}
                    isPaused={ambientPaused}
                    interimText={inlineInterim}
                    hasVoiceSignal={!ambientPaused && inlineInterim.trim().length > 0}
                    captures={ambientCaptures}
                    pendingActions={pendingActions}
                    isExecuting={isExecuting}
                    onConfirm={confirmActions}
                    onCancel={cancelActions}
                    transcript={transcriptLines}
                    onPause={handleAmbientPause}
                    onResume={handleAmbientResume}
                    onEnd={handleAmbientEnd}
                    micError={combinedError}
                />
            ) : !hasMessages ? (
                <AIEmptyState
                    onSend={handleSend}
                    onStartAmbient={handleStartAmbient}
                    onFileUpload={handleFileUpload}
                    isLoading={isLoading}
                    isExecuting={isExecuting}
                    isListening={isListening}
                    voiceMode={voiceMode}
                    onToggleListening={handleVoiceToggle}
                    onSwitchMode={handleModeSwitch}
                    micError={combinedError}
                    conversations={conversations}
                    onSelectConversation={onSelectConversation}
                    onDeleteConversation={onDeleteConversation}
                    licenseSelector={licenseSelector}
                    isDragOver={isDragOver}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file);
                    }}
                    textareaRef={textareaRef}
                    inputText={inputText}
                    onInputChange={setInputText}
                    onSubmit={handleSubmit}
                    onKeyDown={handleKeyDown}
                    facilitySetup={facilitySetup}
                    onNavigateToSettings={() => onViewChange?.('settings')}
                />
            ) : (
                <AIChat
                    messages={messages}
                    isLoading={isLoading}
                    pendingActions={pendingActions}
                    isExecuting={isExecuting}
                    onConfirm={confirmActions}
                    onCancel={cancelActions}
                    onEditAction={editAction}
                    onEditMessage={editMessage}
                    onSend={handleSend}
                    onFileUpload={handleFileUpload}
                    onViewChange={onViewChange}
                    inputText={inputText}
                    onInputChange={setInputText}
                    onSubmit={handleSubmit}
                    onKeyDown={handleKeyDown}
                    textareaRef={textareaRef}
                    isListening={isListening}
                    voiceMode={voiceMode}
                    onToggleListening={handleVoiceToggle}
                    onSwitchMode={handleModeSwitch}
                    micError={combinedError}
                    licenseSelector={licenseSelector}
                    onFocusInput={() => textareaRef.current?.focus()}
                    extractionRunCards={extractionRunCards}
                    onExtractionSubmit={handleExtractionSubmit}
                    onExtractionDismiss={handleExtractionDismiss}
                    onExtractionCardUpdate={handleExtractionCardUpdate}
                />
            )}
        </div>
    );
};
