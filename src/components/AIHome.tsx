import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Upload, FileText, ArrowRight, Loader2, Pencil,
    Scissors, Package, Plus, User, UserPlus, Sprout, Scale,
    ArrowRightLeft, Trash2, MapPin, ClipboardList, Leaf,
    MoveRight, Thermometer, CalendarCheck, type LucideIcon,
} from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import { ActionResult } from './ActionResult';
import { VoicePill } from './VoicePill';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, ChatMessage, CreateTrimSessionDTO, License, HumanTask, SpeechMode } from '../types/definitions';
import logo from '../assets/logo.png';

// ── Suggestion chips with icons + brand colors ──
interface Suggestion {
    text: string;
    icon: LucideIcon;
    color: string;   // CSS color for icon
    bg: string;       // CSS background for icon badge
}

const ALL_SUGGESTIONS: Suggestion[] = [
    // Trim
    { text: 'Start a trim session with OG Kush 500g', icon: Scissors, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    { text: 'Add 3 batches of Blue Dream to the active session', icon: Plus, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    { text: 'Submit all completed batches', icon: Package, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    { text: 'Record 200g waste from batch H-102', icon: Trash2, color: 'var(--color-waste)', bg: 'rgba(223,91,89,0.1)' },
    { text: 'Revert batch H-105 back to upcoming', icon: ArrowRightLeft, color: 'var(--color-shake)', bg: 'rgba(250,158,82,0.1)' },
    // Trimmers
    { text: 'Assign Maria and Carlos to the active batch', icon: User, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    { text: 'Add a new trimmer named Sofia to the roster', icon: UserPlus, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
    { text: 'Remove Jordan from batch H-103', icon: User, color: 'var(--color-waste)', bg: 'rgba(223,91,89,0.1)' },
    { text: 'How is Maria performing this session?', icon: Scale, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    // Harvest
    { text: 'Create a harvest for Gelato', icon: Sprout, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    { text: 'Record wet weight 2400g for harvest H-201', icon: Scale, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    { text: 'Allocate harvest H-201 to flower and frozen', icon: ArrowRightLeft, color: 'var(--color-shake)', bg: 'rgba(250,158,82,0.1)' },
    { text: 'Move harvest H-198 to drying room 2', icon: MapPin, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
    { text: 'Record stem waste for the Gelato harvest', icon: Trash2, color: 'var(--color-waste)', bg: 'rgba(223,91,89,0.1)' },
    // Plants
    { text: 'Move 30 clones to veg room A', icon: MoveRight, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    { text: 'Create a batch of 50 Wedding Cake clones', icon: Leaf, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    { text: 'Promote nursery batch to vegetative', icon: Sprout, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    { text: 'Move flowering plants from room C to room D', icon: MapPin, color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
    { text: 'How many plants are in veg right now?', icon: Leaf, color: 'var(--color-flower)', bg: 'rgba(59,181,112,0.1)' },
    // Tasks
    { text: 'Add a task: flush all plants in room B by Friday', icon: ClipboardList, color: '#0D9488', bg: 'rgba(13,148,136,0.1)' },
    { text: 'Create a task to calibrate scales before next session', icon: ClipboardList, color: '#0D9488', bg: 'rgba(13,148,136,0.1)' },
    { text: 'Remind me to order new trim trays by Monday', icon: CalendarCheck, color: 'var(--color-shake)', bg: 'rgba(250,158,82,0.1)' },
    { text: 'Assign the dehumidifier check to Carlos', icon: ClipboardList, color: '#0D9488', bg: 'rgba(13,148,136,0.1)' },
    // Reports / Questions
    { text: 'Show me this week\'s trim output by strain', icon: Scale, color: 'var(--color-trim)', bg: 'rgba(28,158,255,0.1)' },
    { text: 'What\'s the flower-to-waste ratio this month?', icon: Thermometer, color: 'var(--color-shake)', bg: 'rgba(250,158,82,0.1)' },
];

/** Pick N random suggestions, stable per mount */
function pickSuggestions(count: number): Suggestion[] {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

interface AIHomeProps {
    conversationId: string | null;
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests: Harvest[];
    onSessionUpdate: () => Promise<void>;
    onSaveConversation: (id: string, title: string, messages: ChatMessage[]) => Promise<void>;
    onLoadConversation: (id: string) => Promise<ChatMessage[]>;
    onConversationStarted: (id: string) => void;
    onStart: (dto: CreateTrimSessionDTO) => void;
    licenses?: License[];
    activeLicenseId?: string | null;
    onLicenseChange?: (id: string) => void;
    onViewChange?: (view: 'dashboard' | 'harvests' | 'reports' | 'tasks') => void;
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
    onUpdateHumanTask?: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteHumanTask?: (id: string) => Promise<void>;
    humanTasks?: HumanTask[];
    plantMapSummary?: Array<{ roomName: string; roomId: string; strains: string[]; plantIds: string[]; entityType: 'plants' | 'plantbatches'; plantHealth: number; contaminants: string[] }>;
    injectedVoiceText?: string | null;
    onClearInjectedText?: () => void;
    screenContext?: string;
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
}) => {
    const [inputText, setInputText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const conversationIdRef = useRef<string | null>(null);

    // Voice input — dual mode (action fills textarea, ambient auto-creates tasks)
    const [voiceMode, setVoiceMode] = useState<SpeechMode>('action');
    const inlineTranscriptRef = useRef('');
    const [inlineInterim, setInlineInterim] = useState('');
    const [micError, setMicError] = useState<string | null>(null);
    const voiceModeRef = useRef(voiceMode);
    voiceModeRef.current = voiceMode;

    // Build context for ambient mode AI parsing
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

    // Ambient mode: auto-analyze transcript chunks into tasks
    const analyzeAmbientChunk = useCallback(async (text: string) => {
        if (!text.trim() || !onCreateHumanTasks) return;
        try {
            const result = await apiService.aiParse({
                transcriptChunks: [text],
                context: buildAmbientContext(),
            });
            if (result.actions.length > 0) {
                const taskActions = result.actions.filter(a => a.type === 'create_human_task');
                if (taskActions.length > 0) {
                    await onCreateHumanTasks(taskActions.map(a => a.data as any));
                }
            }
        } catch {
            // Silent fail for ambient — don't interrupt the flow
        }
    }, [buildAmbientContext, onCreateHumanTasks]);

    const handleInlineTranscript = useCallback((text: string, isFinal: boolean) => {
        if (voiceModeRef.current === 'action') {
            // Action mode: fill the textarea
            if (isFinal) {
                inlineTranscriptRef.current = inlineTranscriptRef.current
                    ? `${inlineTranscriptRef.current} ${text}`
                    : text;
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
        } else {
            // Ambient mode: accumulate transcript (shown in textarea as feedback)
            if (isFinal) {
                inlineTranscriptRef.current = inlineTranscriptRef.current
                    ? `${inlineTranscriptRef.current} ${text}`
                    : text;
                setInputText(inlineTranscriptRef.current);
                setInlineInterim('');
            } else {
                setInlineInterim(text);
                setInputText(inlineTranscriptRef.current ? `${inlineTranscriptRef.current} ${text}` : text);
            }
        }
    }, [inlineInterim]);

    const handleUtteranceEnd = useCallback(() => {
        if (voiceModeRef.current === 'ambient' && inlineTranscriptRef.current.trim()) {
            // Auto-analyze the accumulated transcript
            const text = inlineTranscriptRef.current;
            inlineTranscriptRef.current = '';
            setInputText('');
            analyzeAmbientChunk(text);
        }
        // Action mode: do nothing — user sends manually
    }, [analyzeAmbientChunk]);

    const handleInlineError = useCallback((err: string) => {
        setMicError(err);
        setTimeout(() => setMicError(null), 5000);
    }, []);

    const { isListening: inlineListening, startListening: inlineStart, stopListening: inlineStop, error: deepgramError } = useDeepgram({
        mode: voiceMode,
        onTranscript: handleInlineTranscript,
        onUtteranceEnd: handleUtteranceEnd,
        onError: handleInlineError,
    });

    const handleVoiceToggle = useCallback(async () => {
        setMicError(null);
        if (inlineListening) {
            // If ambient and there's remaining transcript, analyze it
            if (voiceModeRef.current === 'ambient' && inlineTranscriptRef.current.trim()) {
                analyzeAmbientChunk(inlineTranscriptRef.current);
                inlineTranscriptRef.current = '';
                setInputText('');
            }
            inlineStop();
        } else {
            inlineTranscriptRef.current = voiceMode === 'action' ? inputText : '';
            setInlineInterim('');
            if (voiceMode === 'ambient') setInputText('');
            try {
                await inlineStart();
            } catch (err) {
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            }
        }
    }, [inlineListening, inlineStart, inlineStop, inputText, voiceMode, analyzeAmbientChunk]);

    const handleModeSwitch = useCallback((mode: SpeechMode) => {
        if (inlineListening) {
            inlineStop();
        }
        setVoiceMode(mode);
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
    }, [inlineListening, inlineStop]);

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
        editMessage,
        clearMessages,
        loadMessages,
        setConversationId,
    } = useAIChat({
        session,
        trimmerProfiles,
        harvests,
        onSessionUpdate,
        conversationId,
        onSaveConversation,
        activeLicense: licenses.find(l => l.id === activeLicenseId)?.licenseNumber || null,
        onCreateHumanTasks,
        onUpdateHumanTask,
        onDeleteHumanTask,
        humanTasks: humanTasks?.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            category: t.category,
            assignee: t.assignee,
            location: t.location,
        })),
        plantMapSummary,
        screenContext,
    });

    // Load conversation when conversationId changes
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
                if (msgs.length > 0) {
                    loadMessages(msgs);
                }
            });
        } else if (!conversationId && conversationIdRef.current !== null) {
            conversationIdRef.current = null;
            isNewConversationRef.current = false;
            clearMessages();
        }
    }, [conversationId, onLoadConversation, loadMessages, clearMessages]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions]);

    // Handle injected voice text from sidebar action mode
    useEffect(() => {
        if (injectedVoiceText) {
            setInputText(injectedVoiceText);
            onClearInjectedText?.();
            textareaRef.current?.focus();
        }
    }, [injectedVoiceText, onClearInjectedText]);

    const handleSend = useCallback((text: string) => {
        if (!text.trim() || isLoading) return;
        if (!conversationId) {
            const newId = crypto.randomUUID();
            setConversationId(newId);
            onConversationStarted(newId);
        }
        sendMessage(text.trim());
        setInputText('');
        inlineTranscriptRef.current = '';
        setInlineInterim('');
        if (inlineListening) {
            inlineStop();
        }
    }, [isLoading, conversationId, onConversationStarted, sendMessage, setConversationId, inlineListening, inlineStop]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend(inputText);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(inputText);
        }
    };

    const handleFileUpload = (file: File) => {
        if (!file.name.endsWith('.csv')) {
            alert('Please upload a CSV file.');
            return;
        }
        if (file.size > 1024 * 1024) {
            alert('File is too large. Please upload a CSV under 1MB.');
            return;
        }
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
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    };

    const hasMessages = messages.length > 0;
    const [suggestions] = useState(() => pickSuggestions(6));

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

    return (
        <div className="ai-home">
            {!hasMessages ? (
                /* Empty state — centered */
                <div className="ai-home-empty">
                    <div className="ai-home-logo">
                        <img src={logo} alt="Neurocann" className="w-12 h-12 object-contain" />
                    </div>
                    <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-color)' }}>Tell me what to do</h1>
                    <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
                        Run your operation with natural language — trim, harvest, plants, tasks, and more.
                    </p>

                    {/* License selector */}
                    {licenseSelector}

                    {/* Input */}
                    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-3">
                        <div className="relative">
                            <textarea
                                ref={textareaRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder='e.g. "Move 20 clones from nursery to veg room B"'
                                rows={3}
                                disabled={isLoading || isExecuting}
                                className="w-full px-4 py-3 pr-24 rounded-xl resize-none
                                           text-sm focus:outline-none focus:ring-2 transition-colors
                                           disabled:cursor-not-allowed"
                                style={{
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-color)',
                                    '--tw-ring-color': 'var(--primary-light)',
                                } as React.CSSProperties}
                            />
                            <div className="absolute right-2 bottom-2 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-lg transition-colors"
                                    style={{ color: 'var(--text-secondary)' }}
                                    title="Upload CSV"
                                >
                                    <Upload size={16} />
                                </button>
                                <VoicePill
                                    isListening={inlineListening}
                                    mode={voiceMode}
                                    onToggleListening={handleVoiceToggle}
                                    onSwitchMode={handleModeSwitch}
                                    error={micError || deepgramError}
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || isLoading || isExecuting}
                                    className="p-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    style={{ background: 'var(--primary-color)' }}
                                >
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
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

                        {/* CSV Drop Zone */}
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors"
                            style={{
                                borderColor: isDragOver ? 'var(--primary-color)' : 'var(--border-color)',
                                background: isDragOver ? 'var(--primary-light)' : 'transparent',
                            }}
                        >
                            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {isDragOver ? (
                                    <>
                                        <Upload size={16} style={{ color: 'var(--primary-color)' }} />
                                        <span className="font-medium" style={{ color: 'var(--primary-dark)' }}>Drop CSV here</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={16} />
                                        <span>Drop a CSV file here, or click to upload</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </form>

                    {/* Suggestions */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-2xl">
                        {suggestions.map((s) => {
                            const Icon = s.icon;
                            return (
                                <button
                                    key={s.text}
                                    onClick={() => handleSend(s.text)}
                                    className="suggestion-chip"
                                >
                                    <span className="suggestion-chip-icon" style={{ background: s.bg, color: s.color }}>
                                        <Icon size={12} />
                                    </span>
                                    {s.text}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* Chat view — messages + input at bottom */
                <div className="ai-home-chat">
                    <div className="ai-home-messages">
                        {messages.map((msg) => {
                            const isCommandMode = !!(pendingActions && pendingActions.length > 0);
                            const isThePendingMsg = msg.status === 'pending';
                            return (
                            <div
                                key={msg.id}
                                className={`ai-msg-row ${msg.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'} ${
                                    isCommandMode && !isThePendingMsg ? 'opacity-40 transition-opacity' : 'transition-opacity'
                                }`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="ai-msg-avatar">
                                        <img src={logo} alt="" className="w-5 h-5 object-contain" />
                                    </div>
                                )}
                                {msg.role === 'user' && (
                                    <button
                                        className="ai-msg-edit-btn"
                                        onClick={() => {
                                            const text = editMessage(msg.id);
                                            if (text) {
                                                setInputText(text);
                                                textareaRef.current?.focus();
                                            }
                                        }}
                                        title="Edit and resend"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                )}
                                <div
                                    className={`ai-msg-bubble ${
                                        msg.role === 'user'
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                >
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                                {/* Render confirmed/cancelled actions inline */}
                                {msg.actions && msg.actions.length > 0 && (msg.status === 'confirmed' || msg.status === 'cancelled') && (
                                    <div className="ai-msg-actions">
                                        <ActionPreview
                                            actions={msg.actions}
                                            readonly
                                            status={msg.status}
                                        />
                                    </div>
                                )}
                                {/* Render result cards with navigation */}
                                {msg.results && msg.results.length > 0 && (
                                    <div className="ai-msg-actions">
                                        <ActionResult
                                            results={msg.results}
                                            onNavigate={onViewChange}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                        })}

                        {isLoading && (
                            <div className="ai-msg-row ai-msg-assistant">
                                <div className="ai-msg-avatar">
                                    <img src={logo} alt="" className="w-5 h-5 object-contain" />
                                </div>
                                <div className="ai-msg-bubble bg-gray-100">
                                    <Loader2 size={16} className="animate-spin text-gray-400" />
                                </div>
                            </div>
                        )}

                        {pendingActions && pendingActions.length > 0 && (
                            <div className="max-w-3xl mx-auto w-full px-4">
                                <ActionPreview
                                    actions={pendingActions}
                                    onConfirm={confirmActions}
                                    onCancel={cancelActions}
                                    onEditAction={editAction}
                                    isExecuting={isExecuting}
                                />
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input bar pinned to bottom */}
                    <div className="ai-home-input-bar">
                        {(micError || deepgramError) && (
                            <div className="max-w-3xl mx-auto w-full mb-2">
                                <p className="text-xs text-red-500 px-1">{micError || deepgramError}</p>
                            </div>
                        )}
                        {licenseSelector && (
                            <div className="max-w-3xl mx-auto w-full mb-2">
                                {licenseSelector}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto w-full flex items-end gap-2">
                            <div className="flex-1 relative">
                                <textarea
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={pendingActions && pendingActions.length > 0 ? "Review actions above..." : inlineListening && voiceMode === 'ambient' ? "Listening... tasks will be created automatically" : "Type a message..."}
                                    rows={1}
                                    disabled={isLoading || isExecuting || !!(pendingActions && pendingActions.length > 0)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none
                                               text-sm text-gray-800 placeholder-gray-400
                                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                               disabled:bg-gray-50"
                                    style={{ minHeight: '44px', maxHeight: '120px' }}
                                    onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = '44px';
                                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                    }}
                                />
                            </div>
                            <div className="flex items-center gap-1 pb-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                    title="Upload CSV"
                                >
                                    <Upload size={18} />
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
                                <VoicePill
                                    isListening={inlineListening}
                                    mode={voiceMode}
                                    onToggleListening={handleVoiceToggle}
                                    onSwitchMode={handleModeSwitch}
                                    error={micError || deepgramError}
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || isLoading || isExecuting}
                                    className="p-2.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600
                                               disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
