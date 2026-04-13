import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    X, Mic, MicOff, Radio, Upload, ArrowRight, Loader2,
    MessageSquare, FileText,
    CheckCircle2, Circle,
} from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import { ActionResult } from './ActionResult';
import { ExtractionRunCard, isCardReady } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { apiService } from '../services/apiService';
import { chatDb } from '../services/chatDb';
import { SILENCE_FLUSH_MS, retainTail } from '../lib/ambientChunker';
import { AMBIENT_ENABLED } from '../lib/featureFlags';
import type { TrimSession, TrimmerProfile, Harvest, SpeechMode, ProposedAction, ChatMessage } from '../types/definitions';
import logo from '../assets/logo.png';

// Stable localStorage key for ChatPanel's persistent conversation. The chat
// modal carries one ongoing conversation that survives close/reopen and page
// refreshes. AIHome uses its own separate conversation flow with sidebar.
const CHAT_PANEL_CONVERSATION_KEY = 'neurocann.chatPanel.conversationId';

function getOrCreateChatPanelConversationId(): string {
    try {
        const existing = localStorage.getItem(CHAT_PANEL_CONVERSATION_KEY);
        if (existing) return existing;
        const id = crypto.randomUUID();
        localStorage.setItem(CHAT_PANEL_CONVERSATION_KEY, id);
        return id;
    } catch {
        // localStorage unavailable (private mode, etc.) — fall back to in-memory
        return crypto.randomUUID();
    }
}

type PanelTab = 'chat' | 'transcript';

interface ActionItem {
    label: string;
    status: 'pending' | 'done' | 'skipped' | 'error';
    detail?: string;
}

interface TranscriptEntry {
    id: string;
    text: string;
    timestamp: Date;
    status: 'processing' | 'created' | 'partial' | 'no_action' | 'error';
    actions?: ActionItem[];
}

interface ChatPanelProps {
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests?: Harvest[];
    onSessionUpdate: () => Promise<void>;
    screenContext?: string;
    plantMapSummary?: Array<{ roomName: string; roomId: string; strains: string[]; plantIds: string[]; entityType: 'plants' | 'plantbatches'; plantHealth: number; contaminants: string[] }>;
    // Task creation (used by ambient mode)
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
}

// --- Context-aware suggestions per screen ---
const SCREEN_SUGGESTIONS: Record<string, string[]> = {
    'Plant Map': [
        'Track a plant health issue',
        'Move plants to flower',
        'Check plant counts by room',
    ],
    'Harvest': [
        'Harvest for fresh frozen',
        'Record harvest weights',
        'Allocate to flower & trim',
    ],
    'Trim': [
        'Start a trim session',
        'Assign trimmers to the batch',
        'Submit completed batches',
    ],
    'Harvest Day': [
        'Record plant weights',
        'Package for fresh frozen',
        'Submit this harvest batch',
    ],
    'Package': [
        'Create a new package',
        'Update package weight',
        'Check compliance status',
    ],
    'Tasks': [
        'Schedule an IPM task',
        'Assign a task to the team',
        'What tasks are overdue?',
    ],
};
const DEFAULT_SUGGESTIONS = [
    'Track a plant health issue',
    'Harvest for fresh frozen',
    'Schedule an IPM task',
];

function getSuggestions(screenContext?: string): string[] {
    if (!screenContext) return DEFAULT_SUGGESTIONS;
    for (const [key, suggestions] of Object.entries(SCREEN_SUGGESTIONS)) {
        if (screenContext.toLowerCase().includes(key.toLowerCase())) return suggestions;
    }
    return DEFAULT_SUGGESTIONS;
}


export const ChatPanel: React.FC<ChatPanelProps> = ({
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    screenContext,
    plantMapSummary,
    onCreateHumanTasks,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<PanelTab>('chat');
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Action mic state ---
    const [actionMicActive, setActionMicActive] = useState(false);
    const actionTranscriptRef = useRef('');

    // --- Ambient state ---
    const [ambientActive, setAmbientActive] = useState(false);
    const ambientTranscriptRef = useRef('');
    const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
    const transcriptEntriesRef = useRef<TranscriptEntry[]>([]);
    transcriptEntriesRef.current = transcriptEntries;
    const [extractionRunCards, setExtractionRunCards] = useState<ExtractionRunCardData[]>([]);

    // --- Action mic deepgram ---
    const handleActionTranscript = useCallback((text: string, isFinal: boolean) => {
        if (isFinal) {
            actionTranscriptRef.current = actionTranscriptRef.current
                ? `${actionTranscriptRef.current} ${text}`
                : text;
            setInputText(actionTranscriptRef.current);
        } else {
            setInputText(actionTranscriptRef.current ? `${actionTranscriptRef.current} ${text}` : text);
        }
    }, []);

    const {
        isListening: actionListening,
        startListening: actionStart,
        stopListening: actionStop,
    } = useDeepgram({
        mode: 'action' as SpeechMode,
        onTranscript: handleActionTranscript,
    });

    const handleActionMicToggle = useCallback(async () => {
        if (actionListening) {
            actionStop();
            setActionMicActive(false);
        } else {
            actionTranscriptRef.current = inputText;
            setActionMicActive(true);
            await actionStart();
        }
    }, [actionListening, actionStart, actionStop, inputText]);

    // --- Ambient deepgram ---
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
        plantMapSummary: plantMapSummary || undefined,
        screenContext,
    }), [session, trimmerProfiles, harvests, plantMapSummary, screenContext]);

    // --- Extraction card intercept ---
    const handleInterceptAction = useCallback((action: ProposedAction): boolean => {
        if (action.type !== 'record_extraction') return false;

        const d = action.data;
        setExtractionRunCards(prev => {
            // Find matching card by strain
            let match = d.strain
                ? prev.find(c => c.status === 'filling' && c.strain?.toLowerCase() === d.strain.toLowerCase())
                : null;
            // Fallback: most recently updated filling card
            if (!match) {
                const filling = prev.filter(c => c.status === 'filling');
                if (filling.length === 1) match = filling[0];
            }

            const now = Date.now();

            if (match) {
                // Merge fields into existing card — only fill empty fields,
                // don't overwrite values the card already has
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
                    // Write if the card's field is empty, this is notes (append),
                    // or the incoming value differs (correction/update)
                    if (existing === null || existing === undefined || existing === '' || key === 'notes' || existing !== incoming) {
                        (updated as any)[key] = incoming;
                        lastField = key;
                    }
                }
                updated.lastUpdatedField = lastField;
                if (isCardReady(updated)) updated.status = 'ready';
                return prev.map(c => c.id === match!.id ? updated : c);
            } else {
                // Create new card
                const card: ExtractionRunCardData = {
                    id: crypto.randomUUID(),
                    createdAt: new Date(),
                    strain: d.strain || null,
                    inputPackageType: d.inputPackageType || null,
                    inputQuantity: d.inputQuantity || null,
                    outputPackageType: d.outputPackageType || null,
                    outputQuantity: d.outputQuantity || null,
                    licenseNumber: d.licenseNumber || null,
                    sourcePackageId: d.sourcePackageId || null,
                    outputLabel: d.outputLabel || null,
                    wasteWeight: d.wasteWeight || null,
                    notes: d.notes || null,
                    status: 'filling',
                    lastUpdatedField: 'strain',
                    lastUpdatedAt: now,
                };
                if (isCardReady(card)) card.status = 'ready';
                return [...prev, card];
            }
        });
        return true; // intercepted
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

    // Stable persistent conversation ID — survives close/reopen and page refresh
    const persistentConversationIdRef = useRef<string>(getOrCreateChatPanelConversationId());

    // saveConversation writes the latest messages list to chatDb whenever
    // useAIChat's internal effect fires (i.e. on every message change).
    const saveConversation = useCallback(async (id: string, title: string, messages: ChatMessage[]) => {
        const now = new Date().toISOString();
        const existing = await chatDb.conversations.get(id);
        if (existing) {
            await chatDb.conversations.update(id, { title, messages, updatedAt: now });
        } else {
            await chatDb.conversations.add({ id, title, messages, createdAt: now, updatedAt: now });
        }
    }, []);

    // --- Chat hook (must be before analyzeAmbientChunk so proposeAmbientActions is available) ---
    const {
        messages,
        isLoading,
        pendingActions,
        isExecuting,
        sendMessage,
        sendCSV,
        confirmActions,
        cancelActions,
        editAction,
        proposeAmbientActions,
        loadMessages,
    } = useAIChat({
        session,
        trimmerProfiles,
        harvests,
        onSessionUpdate,
        screenContext,
        onInterceptAction: handleInterceptAction,
        conversationId: persistentConversationIdRef.current,
        onSaveConversation: saveConversation,
    });

    // On mount, hydrate any prior conversation from chatDb. Runs once.
    const hydratedRef = useRef(false);
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const id = persistentConversationIdRef.current;
        chatDb.conversations.get(id).then(record => {
            if (record?.messages?.length) {
                loadMessages(record.messages);
            }
        }).catch(() => { /* DB unavailable, start fresh */ });
    }, [loadMessages]);

    const analyzeAmbientChunk = useCallback(async (text: string, existingEntryId?: string) => {
        if (!text.trim()) return;

        // Reuse existing transcript entry (created live) or make a new one
        const entryId = existingEntryId || crypto.randomUUID();

        if (existingEntryId) {
            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status: 'processing' as const } : e)
            );
        } else {
            setTranscriptEntries(prev => [...prev, {
                id: entryId, text, timestamp: new Date(), status: 'processing',
            }]);
        }

        // Gather recent transcript history (last 5 entries, excluding current) for AI context
        const recentHistory = transcriptEntriesRef.current
            .filter(e => e.id !== entryId && e.text.trim())
            .slice(-5)
            .map(e => e.text);

        try {
            const result = await apiService.aiParse({
                transcriptChunks: [text],
                context: buildAmbientContext(),
                recentTranscriptHistory: recentHistory,
            });

            const allActions = result.actions as ProposedAction[];

            // Split: extraction-card intercepts → handled inline (their own confirm UI),
            // create_human_task → directly created (passive capture),
            // everything else → routed through chat panel preview cards for explicit confirmation.
            const intercepted: ProposedAction[] = [];
            const humanTasks: ProposedAction[] = [];
            const reviewable: ProposedAction[] = [];

            for (const action of allActions) {
                if (handleInterceptAction(action)) {
                    intercepted.push(action);
                } else if (action.type === 'create_human_task') {
                    humanTasks.push(action);
                } else {
                    reviewable.push(action);
                }
            }

            if (humanTasks.length > 0 && onCreateHumanTasks) {
                try {
                    await onCreateHumanTasks(humanTasks.map(a => a.data as { title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }));
                } catch {
                    // Task creation failure is logged below via the entry status
                }
            }

            if (reviewable.length > 0) {
                proposeAmbientActions(text, reviewable);
            }

            // Update transcript entry status:
            // - 'created' if any action surfaced (review pending or already routed)
            // - 'no_action' if literally nothing came back
            // - 'partial' if we got something but couldn't route it
            const anyHandled = intercepted.length + humanTasks.length + reviewable.length > 0;
            const status: TranscriptEntry['status'] = !allActions.length
                ? 'no_action'
                : anyHandled
                    ? 'created'
                    : 'partial';

            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status } : e)
            );
        } catch {
            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status: 'error' as const } : e)
            );
        }
    }, [buildAmbientContext, onCreateHumanTasks, handleInterceptAction, proposeAmbientActions]);

    // Track the live transcript entry ID so we can update it as words arrive
    const liveEntryIdRef = useRef<string | null>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushAmbientTranscript = useCallback(() => {
        if (ambientTranscriptRef.current.trim()) {
            const text = ambientTranscriptRef.current;
            const existingEntryId = liveEntryIdRef.current;
            // Tail overlap: retain the last sentence across the flush so the
            // next chunk has continuity. The system prompt tells the AI to
            // amend (not duplicate) actions from already-seen tail content.
            ambientTranscriptRef.current = retainTail(text);
            liveEntryIdRef.current = null;
            analyzeAmbientChunk(text, existingEntryId || undefined);
        }
    }, [analyzeAmbientChunk]);

    // Shared timer reset — called from both final and interim transcripts,
    // so any speech activity (not just Deepgram-emitted finals) extends the
    // silence window. Previously only finals reset the timer, causing
    // mid-utterance flushes during continuous speech with long final gaps.
    const resetAmbientSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(flushAmbientTranscript, SILENCE_FLUSH_MS);
    }, [flushAmbientTranscript]);

    const handleAmbientTranscript = useCallback((text: string, isFinal: boolean) => {
        if (!isFinal) {
            // Interim speech means the user is still talking — extend the
            // silence window so we don't flush mid-utterance.
            if (text.trim()) resetAmbientSilenceTimer();
            return;
        }
        ambientTranscriptRef.current = ambientTranscriptRef.current
            ? `${ambientTranscriptRef.current} ${text}`
            : text;

        // Show/update a live transcript entry immediately
        if (!liveEntryIdRef.current) {
            liveEntryIdRef.current = crypto.randomUUID();
            setTranscriptEntries(prev => [...prev, {
                id: liveEntryIdRef.current!,
                text: ambientTranscriptRef.current,
                timestamp: new Date(),
                status: 'no_action' as const, // neutral until parsed
            }]);
        } else {
            const id = liveEntryIdRef.current;
            setTranscriptEntries(prev =>
                prev.map(e => e.id === id ? { ...e, text: ambientTranscriptRef.current } : e)
            );
        }

        resetAmbientSilenceTimer();
    }, [resetAmbientSilenceTimer]);

    const handleAmbientUtteranceEnd = useCallback(() => {
        // Don't flush immediately — reset the silence timer so we wait for
        // the full pause. This prevents mid-thought pauses from splitting
        // the transcript into incomplete chunks.
        resetAmbientSilenceTimer();
    }, [resetAmbientSilenceTimer]);

    const {
        isListening: ambientListening,
        startListening: ambientStart,
        stopListening: ambientStop,
    } = useDeepgram({
        mode: 'ambient' as SpeechMode,
        onTranscript: handleAmbientTranscript,
        onUtteranceEnd: handleAmbientUtteranceEnd,
    });

    const handleAmbientToggle = useCallback(async () => {
        if (ambientListening) {
            // Clear silence timer and flush remaining transcript
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            flushAmbientTranscript();
            ambientStop();
            setAmbientActive(false);
        } else {
            ambientTranscriptRef.current = '';
            setAmbientActive(true);
            await ambientStart();
        }
    }, [ambientListening, ambientStart, ambientStop, flushAmbientTranscript, activeTab]);

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptEntries]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || isLoading) return;
        sendMessage(inputText.trim());
        setInputText('');
        actionTranscriptRef.current = '';
        if (actionListening) {
            actionStop();
            setActionMicActive(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleFileUpload = (file: File) => {
        if (!file.name.endsWith('.csv')) return;
        if (file.size > 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text?.trim()) sendCSV(text);
        };
        reader.readAsText(file);
    };

    const showTranscriptTab = ambientActive || transcriptEntries.length > 0;

    const formatTime = (d: Date) =>
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return (
        <>
            {/* Floating open button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="chatpanel-fab"
                    title="neurocann"
                >
                    <img src={logo} alt="AI" className="w-6 h-6 object-contain brightness-0 invert" />
                    {/* Ambient indicator on FAB */}
                    {ambientActive && (
                        <span className="chatpanel-fab-ambient-ring" />
                    )}
                </button>
            )}

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed right-0 top-0 h-full z-40 w-full ${extractionRunCards.length > 0 ? 'sm:w-[600px]' : 'sm:w-[400px]'}
                           bg-white shadow-2xl flex flex-col
                           transition-all duration-300 ease-in-out
                           ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="chatpanel-header">
                    <div className="chatpanel-header-logo">
                        <img src={logo} alt="AI" className="w-5 h-5 object-contain" />
                    </div>
                    <div className="flex-1">
                        <h3 className="chatpanel-brand"><span className="chatpanel-brand-accent">neuro</span>cann</h3>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="chatpanel-close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Tab bar */}
                <div className="chatpanel-tabs">
                    <button
                        className={`chatpanel-tab ${activeTab === 'chat' ? 'active' : ''}`}
                        onClick={() => setActiveTab('chat')}
                    >
                        <MessageSquare size={14} />
                        Chat
                    </button>
                    {showTranscriptTab && (
                        <button
                            className={`chatpanel-tab ${activeTab === 'transcript' ? 'active' : ''}`}
                            onClick={() => setActiveTab('transcript')}
                        >
                            <FileText size={14} />
                            Transcript
                            {ambientActive && (
                                <span className="chatpanel-tab-live" />
                            )}
                        </button>
                    )}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                    {/* === CHAT TAB === */}
                    {activeTab === 'chat' && (
                        <div className="px-4 py-3 space-y-3">
                            {messages.length === 0 && (
                                <div className="chatpanel-empty">
                                    <p className="chatpanel-empty-text">
                                        What needs to happen?
                                    </p>
                                    <div className="chatpanel-empty-suggestions">
                                        {getSuggestions(screenContext).map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                onClick={() => {
                                                    setInputText(suggestion);
                                                    sendMessage(suggestion);
                                                }}
                                                className="chatpanel-suggestion"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div key={msg.id} className="space-y-1.5">
                                    <div
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                                msg.role === 'user'
                                                    ? 'ai-msg-bubble-user'
                                                    : 'ai-msg-bubble-assistant'
                                            }`}
                                        >
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* Confirmed/cancelled action cards (readonly) */}
                                    {msg.actions && msg.actions.length > 0 && (msg.status === 'confirmed' || msg.status === 'cancelled') && (
                                        <ActionPreview
                                            actions={msg.actions}
                                            readonly
                                            status={msg.status}
                                        />
                                    )}

                                    {/* Result cards */}
                                    {msg.results && msg.results.length > 0 && (
                                        <ActionResult results={msg.results} />
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="ai-msg-bubble-assistant rounded-2xl px-4 py-2">
                                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                                    </div>
                                </div>
                            )}

                            {pendingActions && pendingActions.length > 0 && (
                                <ActionPreview
                                    actions={pendingActions}
                                    onConfirm={confirmActions}
                                    onCancel={cancelActions}
                                    onEditAction={editAction}
                                    isExecuting={isExecuting}
                                />
                            )}

                            {extractionRunCards.length > 0 && (
                                <div className="space-y-2">
                                    {extractionRunCards.map(card => (
                                        <ExtractionRunCard
                                            key={card.id}
                                            card={card}
                                            onSubmit={handleExtractionSubmit}
                                            onDismiss={handleExtractionDismiss}
                                            onUpdateCard={handleExtractionCardUpdate}
                                        />
                                    ))}
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}


                    {/* === TRANSCRIPT TAB === */}
                    {activeTab === 'transcript' && (
                        <div className="px-4 py-3">
                            {ambientActive && (
                                <div className="chatpanel-ambient-banner">
                                    <span className="chatpanel-ambient-dot" />
                                    <span>Listening — tasks created automatically</span>
                                </div>
                            )}

                            {transcriptEntries.length === 0 ? (
                                <div className="chatpanel-tasks-empty">
                                    <FileText size={24} />
                                    <p>No transcript yet</p>
                                    <span>
                                        {ambientActive ? 'Start speaking — utterances appear here' : 'Enable ambient mode to start transcribing'}
                                    </span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transcriptEntries.map(entry => (
                                        <div key={entry.id} className="chatpanel-transcript-entry">
                                            <div className="flex items-start gap-2">
                                                <span className="chatpanel-transcript-time">
                                                    {formatTime(entry.timestamp)}
                                                </span>
                                                <p className="chatpanel-transcript-text">"{entry.text}"</p>
                                            </div>
                                            <div className="ml-12 mt-1 flex flex-col gap-0.5">
                                                {entry.status === 'processing' && !entry.actions?.length && (
                                                    <span className="chatpanel-action-item" style={{ color: 'var(--color-shake)' }}>
                                                        <Loader2 size={10} className="animate-spin" />
                                                        Processing...
                                                    </span>
                                                )}
                                                {entry.actions && entry.actions.length > 0 && entry.actions.map((item, idx) => (
                                                    <div key={idx} className="chatpanel-action-item">
                                                        {item.status === 'pending' && (
                                                            <Loader2 size={10} className="animate-spin shrink-0" style={{ color: 'var(--color-shake)' }} />
                                                        )}
                                                        {item.status === 'done' && (
                                                            <CheckCircle2 size={10} className="shrink-0" style={{ color: 'var(--color-flower)' }} />
                                                        )}
                                                        {item.status === 'skipped' && (
                                                            <Circle size={10} className="shrink-0" style={{ color: 'var(--color-shake)' }} />
                                                        )}
                                                        {item.status === 'error' && (
                                                            <Circle size={10} className="shrink-0" style={{ color: 'var(--color-waste)' }} />
                                                        )}
                                                        <span className={`text-xs ${
                                                            item.status === 'done' ? 'chatpanel-status-done' :
                                                            item.status === 'skipped' ? 'chatpanel-status-skipped' :
                                                            item.status === 'error' ? 'chatpanel-status-error' :
                                                            'chatpanel-status-pending'
                                                        }`}>
                                                            {item.label}
                                                            {item.detail && item.status !== 'done' && (
                                                                <span style={{ color: 'var(--text-secondary)' }}> — {item.detail}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                                {!entry.actions?.length && entry.status === 'no_action' && (
                                                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>No action needed</span>
                                                )}
                                                {!entry.actions?.length && entry.status === 'error' && (
                                                    <span className="text-xs" style={{ color: 'var(--color-waste)' }}>Failed to process</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={transcriptEndRef} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input bar — always visible */}
                <div className="chatpanel-input-bar">
                    <form onSubmit={handleSubmit} className="chatpanel-form">
                        <div className="flex-1">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    actionMicActive ? 'Listening...' :
                                    pendingActions && pendingActions.length > 0 ? 'Review actions above...' :
                                    'Type a message...'
                                }
                                rows={1}
                                disabled={isLoading || isExecuting || !!(pendingActions && pendingActions.length > 0)}
                                className="chatpanel-textarea"
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = '38px';
                                    target.style.height = Math.min(target.scrollHeight, 96) + 'px';
                                }}
                            />
                        </div>

                        <div className="chatpanel-actions">
                            {/* CSV Upload */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="chatpanel-icon-btn"
                                title="Upload CSV"
                            >
                                <Upload size={16} />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                    e.target.value = '';
                                }}
                                className="hidden"
                            />

                            {/* Action Mic */}
                            <div className="relative group">
                                <button
                                    type="button"
                                    onClick={handleActionMicToggle}
                                    className={`chatpanel-icon-btn ${actionMicActive ? 'chatpanel-icon-btn-active' : ''}`}
                                    title={actionMicActive ? 'Stop dictation' : 'Voice command — speak, then send'}
                                >
                                    {actionMicActive ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                                <div className="chatpanel-tooltip">
                                    {actionMicActive ? 'Stop dictation' : 'Voice command — speak, then send'}
                                </div>
                            </div>

                            {/* Ambient Toggle — gated behind AMBIENT_ENABLED */}
                            {AMBIENT_ENABLED && (
                                <div className="relative group">
                                    <button
                                        type="button"
                                        onClick={handleAmbientToggle}
                                        className={`chatpanel-icon-btn ${ambientActive ? 'chatpanel-icon-btn-ambient' : ''}`}
                                        title={ambientActive ? 'Stop ambient listening' : 'Ambient — transcribes speech in background'}
                                    >
                                        <Radio size={16} />
                                        {ambientActive && (
                                            <span className="chatpanel-ambient-ring" />
                                        )}
                                    </button>
                                    <div className="chatpanel-tooltip">
                                        {ambientActive ? 'Stop ambient listening' : 'Ambient — transcribes speech in background'}
                                    </div>
                                </div>
                            )}

                            {/* Send */}
                            <button
                                type="submit"
                                disabled={!inputText.trim() || isLoading || isExecuting}
                                className="chatpanel-send"
                            >
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};
