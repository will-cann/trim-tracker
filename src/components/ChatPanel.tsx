import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    X, Mic, MicOff, Radio, Upload, ArrowRight, Loader2,
    MessageSquare, ListTodo, FileText,
    CheckCircle2, Circle, Clock, Trash2,
} from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import { ExtractionRunCard, isCardReady } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { analyzeAmbientChunk as analyzeChunk } from '../services/ambientAnalyzer';
import type { ActionItemState } from '../services/ambientAnalyzer';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, HumanTask, HumanTaskStatus, SpeechMode, ProposedAction } from '../types/definitions';
import logo from '../assets/logo.png';

type PanelTab = 'chat' | 'tasks' | 'transcript';

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
    // Task props
    tasks?: HumanTask[];
    onUpdateTaskStatus?: (id: string, status: HumanTaskStatus) => void;
    onDeleteTask?: (id: string) => void;
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
    taskPendingCount?: number;
    onViewAllTasks?: () => void;
}

// --- Task list helpers ---
const PRIORITY_DOT: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-400',
    low: 'bg-gray-300',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
    pending: <Circle size={14} className="text-gray-300" />,
    in_progress: <Clock size={14} className="text-amber-500" />,
    completed: <CheckCircle2 size={14} className="text-emerald-500" />,
};

function nextStatus(current: HumanTaskStatus): HumanTaskStatus {
    switch (current) {
        case 'pending': return 'in_progress';
        case 'in_progress': return 'completed';
        case 'completed': return 'pending';
        default: return 'pending';
    }
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    screenContext,
    plantMapSummary,
    tasks = [],
    onUpdateTaskStatus,
    onDeleteTask,
    onCreateHumanTasks,
    taskPendingCount = 0,
    onViewAllTasks,
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
    const [activeActionGroups, setActiveActionGroups] = useState<ActiveActionGroup[]>([]);
    const [extractionRunCards, setExtractionRunCards] = useState<ExtractionRunCardData[]>([]);
    const prevTabRef = useRef<PanelTab>('chat');

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
                // Merge fields into existing card
                const updated = { ...match, lastUpdatedAt: now };
                const fieldsToMerge: (keyof ExtractionRunCardData)[] = [
                    'strain', 'inputPackageType', 'inputQuantity', 'outputPackageType',
                    'outputQuantity', 'licenseNumber', 'sourcePackageId', 'outputLabel',
                    'wasteWeight', 'notes',
                ];
                let lastField: string | null = null;
                for (const key of fieldsToMerge) {
                    if (d[key] !== null && d[key] !== undefined) {
                        (updated as any)[key] = d[key];
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
        setExtractionRunCards(prev => prev.map(c =>
            c.id === cardId ? { ...c, status: 'submitting' as const } : c
        ));

        const card = extractionRunCards.find(c => c.id === cardId);
        if (!card) return;

        try {
            await apiService.recordExtraction({
                sourcePackageId: card.sourcePackageId || undefined,
                inputPackageType: card.inputPackageType!,
                inputQuantity: card.inputQuantity!,
                outputPackageType: card.outputPackageType!,
                outputQuantity: card.outputQuantity || undefined,
                outputLabel: card.outputLabel || undefined,
                strain: card.strain!,
                licenseNumber: card.licenseNumber || undefined,
                wasteWeight: card.wasteWeight || undefined,
                notes: card.notes || undefined,
            });

            setExtractionRunCards(prev => prev.map(c =>
                c.id === cardId ? { ...c, status: 'submitted' as const } : c
            ));

            // Auto-dismiss after 3s
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
            });

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
        }
    }, []);

    const handleAmbientUtteranceEnd = useCallback(() => {
        if (ambientTranscriptRef.current.trim()) {
            const text = ambientTranscriptRef.current;
            const existingEntryId = liveEntryIdRef.current;
            ambientTranscriptRef.current = '';
            liveEntryIdRef.current = null;
            analyzeAmbientChunk(text, existingEntryId || undefined);
        }
    }, [analyzeAmbientChunk]);

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
            // Flush remaining transcript
            if (ambientTranscriptRef.current.trim()) {
                analyzeAmbientChunk(ambientTranscriptRef.current);
                ambientTranscriptRef.current = '';
            }
            ambientStop();
            setAmbientActive(false);
        } else {
            ambientTranscriptRef.current = '';
            setAmbientActive(true);
            // Auto-switch to tasks tab so user sees actions populating
            prevTabRef.current = activeTab;
            setActiveTab('tasks');
            await ambientStart();
        }
    }, [ambientListening, ambientStart, ambientStop, analyzeAmbientChunk, activeTab]);

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
    } = useAIChat({ session, trimmerProfiles, harvests, onSessionUpdate, screenContext });

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

    // Task list — sorted
    const sortedTasks = [...tasks].sort((a, b) => {
        const order: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
        const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const visibleTasks = sortedTasks.slice(0, 30);

    const showTranscriptTab = ambientActive || transcriptEntries.length > 0;

    const formatTime = (d: Date) =>
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return (
        <>
            {/* Floating open button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg
                               flex items-center justify-center transition-all duration-200
                               bg-emerald-500 hover:bg-emerald-600 hover:scale-105"
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
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center overflow-hidden">
                        <img src={logo} alt="AI" className="w-5 h-5 object-contain" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-bold" style={{ fontFamily: 'Lato, sans-serif' }}><span className="text-emerald-500">neuro</span><span className="text-gray-900">cann</span></h3>
                        <p className="text-xs text-gray-500">Say what happened. I'll update the records.</p>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
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
                    <button
                        className={`chatpanel-tab ${activeTab === 'tasks' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tasks')}
                    >
                        <ListTodo size={14} />
                        Tasks
                        {taskPendingCount > 0 && (
                            <span className="chatpanel-tab-badge">{taskPendingCount}</span>
                        )}
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
                                <div className="text-center py-8">
                                    <img src={logo} alt="" className="w-8 h-8 object-contain opacity-20 mx-auto mb-3" />
                                    <p className="text-sm text-gray-400">
                                        Tell me what you need — add batches, assign trimmers, or upload a CSV.
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        {[
                                            'Add 3 batches of Blue Dream',
                                            'Assign Maria to the OG Kush batch at 8am',
                                            'Add a new trimmer Carlos to the roster',
                                        ].map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                onClick={() => setInputText(suggestion)}
                                                className="block w-full text-left text-xs text-gray-500 px-3 py-2
                                                           rounded-lg border border-gray-100 hover:border-emerald-200
                                                           hover:bg-emerald-50 transition-colors"
                                            >
                                                "{suggestion}"
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
                                        className={`chat-bubble max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                                            msg.role === 'user'
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-gray-100 text-gray-800'
                                        }`}
                                    >
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-gray-100 rounded-2xl px-4 py-2">
                                        <Loader2 size={16} className="animate-spin text-gray-400" />
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

                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {/* === TASKS TAB === */}
                    {activeTab === 'tasks' && (
                        <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-semibold text-gray-700">Tasks</h3>
                                    {taskPendingCount > 0 && (
                                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                                            {taskPendingCount}
                                        </span>
                                    )}
                                </div>
                                {onViewAllTasks && (
                                    <button
                                        onClick={onViewAllTasks}
                                        className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium"
                                    >
                                        View all
                                    </button>
                                )}
                            </div>

                            {/* Live action checklist from ambient mode */}
                            {activeActionGroups.length > 0 && (
                                <div className="mb-3 space-y-2">
                                    {activeActionGroups.map(group => (
                                        <div key={group.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                            <div className="flex flex-col gap-1">
                                                {group.items.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        {item.status === 'pending' && (
                                                            <Loader2 size={12} className="animate-spin text-amber-500 shrink-0" />
                                                        )}
                                                        {item.status === 'done' && (
                                                            <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                                        )}
                                                        {item.status === 'skipped' && (
                                                            <Circle size={12} className="text-amber-400 shrink-0" />
                                                        )}
                                                        {item.status === 'error' && (
                                                            <Circle size={12} className="text-red-400 shrink-0" />
                                                        )}
                                                        <span className={`text-xs ${
                                                            item.status === 'done' ? 'text-emerald-700' :
                                                            item.status === 'skipped' ? 'text-amber-700' :
                                                            item.status === 'error' ? 'text-red-600' :
                                                            'text-gray-600'
                                                        }`}>
                                                            {item.label}
                                                            {item.detail && item.status !== 'done' && (
                                                                <span className="text-gray-400 ml-1">— {item.detail}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Extraction run cards */}
                            {extractionRunCards.length > 0 && (
                                <div className="mb-3 space-y-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            Extraction Runs
                                        </span>
                                        <span className="text-xs text-gray-300">({extractionRunCards.length})</span>
                                    </div>
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

                            {visibleTasks.length === 0 && activeActionGroups.length === 0 && extractionRunCards.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                    <ListTodo size={24} className="mb-2" />
                                    <p className="text-xs">No tasks yet</p>
                                    <p className="text-xs mt-0.5 text-gray-300">Ask the AI or use ambient mode to create tasks</p>
                                </div>
                            )}
                            {visibleTasks.length > 0 && (
                                <div className="space-y-0.5">
                                    {visibleTasks.map(task => (
                                        <div
                                            key={task.id}
                                            className={`group flex items-start gap-2 px-2 py-2 rounded-md transition-colors hover:bg-gray-50 ${
                                                task.status === 'completed' ? 'opacity-50' : ''
                                            }`}
                                        >
                                            <button
                                                onClick={() => onUpdateTaskStatus?.(task.id, nextStatus(task.status))}
                                                className="flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                                                title={`Status: ${task.status} — click to advance`}
                                            >
                                                {STATUS_ICON[task.status]}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-tight truncate ${
                                                    task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'
                                                }`}>
                                                    {task.title}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} />
                                                    <span className="text-xs text-gray-400 truncate">
                                                        {task.category}{task.assignee ? ` · ${task.assignee}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onDeleteTask?.(task.id)}
                                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all"
                                                title="Delete task"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* === TRANSCRIPT TAB === */}
                    {activeTab === 'transcript' && (
                        <div className="px-4 py-3">
                            {ambientActive && (
                                <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                                    <span className="chatpanel-ambient-dot" />
                                    <span className="text-xs text-emerald-700 font-medium">Listening — tasks created automatically</span>
                                </div>
                            )}

                            {transcriptEntries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                    <FileText size={24} className="mb-2" />
                                    <p className="text-xs">No transcript yet</p>
                                    <p className="text-xs mt-0.5 text-gray-300">
                                        {ambientActive ? 'Start speaking — utterances appear here' : 'Enable ambient mode to start transcribing'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transcriptEntries.map(entry => (
                                        <div key={entry.id} className="chatpanel-transcript-entry">
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                                                    {formatTime(entry.timestamp)}
                                                </span>
                                                <p className="text-sm text-gray-700 flex-1">"{entry.text}"</p>
                                            </div>
                                            <div className="ml-12 mt-1 flex flex-col gap-0.5">
                                                {entry.status === 'processing' && !entry.actions?.length && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                                        <Loader2 size={10} className="animate-spin" />
                                                        Processing...
                                                    </span>
                                                )}
                                                {entry.actions && entry.actions.length > 0 && entry.actions.map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5">
                                                        {item.status === 'pending' && (
                                                            <Loader2 size={10} className="animate-spin text-amber-500 shrink-0" />
                                                        )}
                                                        {item.status === 'done' && (
                                                            <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                                                        )}
                                                        {item.status === 'skipped' && (
                                                            <Circle size={10} className="text-amber-400 shrink-0" />
                                                        )}
                                                        {item.status === 'error' && (
                                                            <Circle size={10} className="text-red-400 shrink-0" />
                                                        )}
                                                        <span className={`text-xs ${
                                                            item.status === 'done' ? 'text-emerald-600' :
                                                            item.status === 'skipped' ? 'text-amber-600' :
                                                            item.status === 'error' ? 'text-red-500' :
                                                            'text-gray-500'
                                                        }`}>
                                                            {item.label}
                                                            {item.detail && item.status !== 'done' && (
                                                                <span className="text-gray-400"> — {item.detail}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                                {!entry.actions?.length && entry.status === 'no_action' && (
                                                    <span className="text-xs text-gray-400">No action needed</span>
                                                )}
                                                {!entry.actions?.length && entry.status === 'error' && (
                                                    <span className="text-xs text-red-400">Failed to process</span>
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
                <div className="border-t border-gray-200 px-3 py-3 bg-white">
                    <form onSubmit={handleSubmit} className="flex items-end gap-2">
                        <div className="flex-1 relative">
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
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl resize-none
                                           text-sm text-gray-800 placeholder-gray-400
                                           focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400
                                           disabled:bg-gray-50"
                                style={{ minHeight: '38px', maxHeight: '96px' }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = '38px';
                                    target.style.height = Math.min(target.scrollHeight, 96) + 'px';
                                }}
                            />
                        </div>

                        <div className="flex items-center gap-1 pb-0.5">
                            {/* CSV Upload */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                                    className={`p-2 rounded-lg transition-colors ${
                                        actionMicActive
                                            ? 'bg-red-100 text-red-500'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
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
                                    className={`p-2 rounded-lg transition-colors relative ${
                                        ambientActive
                                            ? 'text-emerald-600'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
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
                                className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600
                                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
