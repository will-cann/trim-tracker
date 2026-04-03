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
import { ExtractionRunCard, isCardReady } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { analyzeAmbientChunk as analyzeChunk } from '../services/ambientAnalyzer';
import type { ActionItemState } from '../services/ambientAnalyzer';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, SpeechMode, ProposedAction } from '../types/definitions';
import logo from '../assets/logo.png';

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

interface ActiveActionGroup {
    id: string;
    timestamp: Date;
    items: ActionItem[];
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
    const [, setActiveActionGroups] = useState<ActiveActionGroup[]>([]);
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

    const analyzeAmbientChunk = useCallback(async (text: string, existingEntryId?: string) => {
        if (!text.trim()) return;

        // Reuse existing transcript entry (created live) or make a new one
        const entryId = existingEntryId || crypto.randomUUID();
        const groupId = entryId;

        if (existingEntryId) {
            // Entry already exists from live transcript — mark as processing
            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status: 'processing' as const } : e)
            );
        } else {
            // Fallback: create entry now (e.g., flush on stop)
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
            const { status } = await analyzeChunk(text, buildAmbientContext(), {
                onCreateHumanTasks,
                onSessionUpdate,
                onInterceptAction: handleInterceptAction,
                onProgress: (items: ActionItemState[]) => {
                    const mapped = items.map(i => ({ label: i.label, status: i.status, detail: i.detail }));
                    // Update both transcript entry and tasks tab group
                    setTranscriptEntries(prev =>
                        prev.map(e => e.id === entryId ? { ...e, actions: mapped } : e)
                    );
                    setActiveActionGroups(prev => {
                        const group: ActiveActionGroup = { id: groupId, timestamp: new Date(), items: mapped };
                        const exists = prev.find(g => g.id === groupId);
                        return exists
                            ? prev.map(g => g.id === groupId ? group : g)
                            : [...prev, group];
                    });
                },
            }, recentHistory);

            // Update transcript status
            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status } : e)
            );

            // Auto-remove completed groups after a delay
            setTimeout(() => {
                setActiveActionGroups(prev => prev.filter(g => g.id !== groupId));
            }, 5000);
        } catch {
            setTranscriptEntries(prev =>
                prev.map(e => e.id === entryId ? { ...e, status: 'error' as const } : e)
            );
            // Remove failed group
            setActiveActionGroups(prev => prev.filter(g => g.id !== groupId));
        }
    }, [buildAmbientContext, onCreateHumanTasks, onSessionUpdate, handleInterceptAction]);

    // Track the live transcript entry ID so we can update it as words arrive
    const liveEntryIdRef = useRef<string | null>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const SILENCE_FLUSH_MS = 5000; // Flush after 5s of silence

    const flushAmbientTranscript = useCallback(() => {
        if (ambientTranscriptRef.current.trim()) {
            const text = ambientTranscriptRef.current;
            const existingEntryId = liveEntryIdRef.current;
            ambientTranscriptRef.current = '';
            liveEntryIdRef.current = null;
            analyzeAmbientChunk(text, existingEntryId || undefined);
        }
    }, [analyzeAmbientChunk]);

    const handleAmbientTranscript = useCallback((text: string, isFinal: boolean) => {
        if (isFinal) {
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

            // Reset silence timer — flush after SILENCE_FLUSH_MS of no new speech
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(flushAmbientTranscript, SILENCE_FLUSH_MS);
        }
    }, [flushAmbientTranscript]);

    const handleAmbientUtteranceEnd = useCallback(() => {
        // Don't flush immediately — reset the silence timer so we wait for
        // the full pause. This prevents mid-thought pauses from splitting
        // the transcript into incomplete chunks.
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(flushAmbientTranscript, SILENCE_FLUSH_MS);
    }, [flushAmbientTranscript]);

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

    // --- Chat hook ---
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
    } = useAIChat({ session, trimmerProfiles, harvests, onSessionUpdate, screenContext, onInterceptAction: handleInterceptAction });

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
                                <div
                                    key={msg.id}
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

                            {/* Ambient Toggle */}
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
