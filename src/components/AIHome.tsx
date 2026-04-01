import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Upload, FileText, ArrowRight, Loader2, Pencil,
    Scissors, Package, Plus, User, Sprout, Scale,
    ArrowRightLeft, ClipboardList, Leaf,
    MoveRight, Thermometer, Radio, ChevronDown, type LucideIcon,
} from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import { ActionResult } from './ActionResult';
import { VoicePill } from './VoicePill';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, ChatMessage, CreateTrimSessionDTO, License, HumanTask, SpeechMode } from '../types/definitions';
import logo from '../assets/logo.png';

// ── Quick starts (always visible) + full workflow catalog (expandable) ──
interface WorkflowItem { text: string; icon: LucideIcon }
interface WorkflowCategory { label: string; color: string; items: WorkflowItem[] }

// One per category, randomized each mount
const STARTER_POOLS: { color: string; options: { text: string; icon: LucideIcon }[] }[] = [
    {
        color: '#3BB570', // Plants
        options: [
            { text: 'Plant new clones', icon: Leaf },
            { text: 'Track a plant health issue', icon: Thermometer },
            { text: 'Move plants to flower', icon: MoveRight },
        ],
    },
    {
        color: '#FA9E52', // Harvest & Extraction
        options: [
            { text: 'Harvest for fresh frozen', icon: Sprout },
            { text: 'Harvest for dry trim', icon: Sprout },
            { text: 'Log an extraction run', icon: Thermometer },
            { text: 'Plan a harvest', icon: ClipboardList },
        ],
    },
    {
        color: '#1C9EFF', // Trim
        options: [
            { text: 'Start a trim session', icon: Scissors },
            { text: 'Manage the trim team', icon: User },
            { text: 'Check trimmer performance', icon: Scale },
        ],
    },
    {
        color: '#959595', // Operations
        options: [
            { text: 'Schedule an IPM task', icon: ClipboardList },
            { text: 'Run this week\u2019s trim report', icon: Scale },
            { text: 'Check flower-to-waste ratio', icon: Thermometer },
        ],
    },
];

const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
    {
        label: 'Trim',
        color: '#1C9EFF',
        items: [
            { text: 'Start a trim session', icon: Scissors },
            { text: 'Add batches to session', icon: Plus },
            { text: 'Assign trimmers', icon: User },
            { text: 'Submit completed batches', icon: Package },
        ],
    },
    {
        label: 'Harvest & Extraction',
        color: '#FA9E52',
        items: [
            { text: 'Harvest for fresh frozen', icon: Sprout },
            { text: 'Record harvest weights', icon: Scale },
            { text: 'Allocate to flower & trim', icon: ArrowRightLeft },
            { text: 'Record extraction run', icon: Thermometer },
        ],
    },
    {
        label: 'Plants',
        color: '#3BB570',
        items: [
            { text: 'Plant new clones', icon: Leaf },
            { text: 'Move between rooms', icon: MoveRight },
            { text: 'Track plant health issue', icon: Thermometer },
            { text: 'Change growth phase', icon: Sprout },
        ],
    },
    {
        label: 'Operations',
        color: '#959595',
        items: [
            { text: 'Schedule an IPM task', icon: ClipboardList },
            { text: 'Weekly trim report', icon: Scale },
            { text: 'Flower-to-waste ratio', icon: Thermometer },
        ],
    },
];

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

    // One-click ambient start from feature card
    const [wantAmbientStart, setWantAmbientStart] = useState(false);

    const handleStartAmbient = useCallback(() => {
        if (inlineListening && voiceMode === 'ambient') {
            // Already ambient — stop
            if (inlineTranscriptRef.current.trim()) {
                analyzeAmbientChunk(inlineTranscriptRef.current);
                inlineTranscriptRef.current = '';
                setInputText('');
            }
            inlineStop();
            return;
        }
        if (inlineListening) inlineStop();
        setVoiceMode('ambient');
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
        setWantAmbientStart(true);
    }, [inlineListening, inlineStop, voiceMode, analyzeAmbientChunk]);

    useEffect(() => {
        if (wantAmbientStart && voiceMode === 'ambient' && !inlineListening) {
            setWantAmbientStart(false);
            inlineStart().catch(err => {
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            });
        }
    }, [wantAmbientStart, voiceMode, inlineListening, inlineStart]);

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
        // Cancel stale pending actions — new message supersedes them
        if (pendingActions && pendingActions.length > 0) {
            cancelActions();
        }
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
    }, [isLoading, conversationId, onConversationStarted, sendMessage, setConversationId, inlineListening, inlineStop, pendingActions, cancelActions]);

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
    const [showAllWorkflows, setShowAllWorkflows] = useState(false);

    // Rotating quick starts — one chip cycles at a time
    const [starterIndices, setStarterIndices] = useState(() =>
        STARTER_POOLS.map(pool => Math.floor(Math.random() * pool.options.length))
    );
    const [fadingChip, setFadingChip] = useState(-1);

    useEffect(() => {
        if (hasMessages) return;
        let cursor = 0;
        const interval = setInterval(() => {
            const poolIdx = cursor % STARTER_POOLS.length;
            setFadingChip(poolIdx);
            setTimeout(() => {
                setStarterIndices(prev => {
                    const next = [...prev];
                    next[poolIdx] = (next[poolIdx] + 1) % STARTER_POOLS[poolIdx].options.length;
                    return next;
                });
                setFadingChip(-1);
            }, 250);
            cursor++;
        }, 3500);
        return () => clearInterval(interval);
    }, [hasMessages]);

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
                /* Empty state — command center */
                <div
                    className="ai-home-empty"
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                >
                    {/* Brand */}
                    <div className="ai-hero">
                        <img src={logo} alt="neurocann" className="ai-hero-logo" />
                        <h1 className="ai-hero-brand"><span className="ai-hero-accent">neuro</span>cann</h1>
                    </div>

                    {/* License selector */}
                    {licenseSelector}

                    {/* Primary input */}
                    <form onSubmit={handleSubmit} className="ai-hero-form">
                        <div className="ai-hero-input">
                            <textarea
                                ref={textareaRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="What needs to happen?"
                                rows={2}
                                disabled={isLoading || isExecuting}
                            />
                            <div className="ai-hero-input-actions">
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
                                    className="ai-hero-send"
                                >
                                    <ArrowRight size={18} />
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
                    </form>

                    {/* Quick starts — rotating colored pills, one per category */}
                    <div className="ai-quick-starts">
                        {STARTER_POOLS.map((pool, i) => {
                            const opt = pool.options[starterIndices[i]];
                            const Icon = opt.icon;
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSend(opt.text)}
                                    className={`ai-quick-chip${fadingChip === i ? ' fading' : ''}`}
                                    type="button"
                                    style={{
                                        '--chip-color': pool.color,
                                        '--chip-bg': `${pool.color}0D`,
                                        '--chip-bg-hover': `${pool.color}1A`,
                                    } as React.CSSProperties}
                                >
                                    <Icon size={14} />
                                    {opt.text}
                                </button>
                            );
                        })}
                    </div>

                    {/* Feature cards: Ambient + Import */}
                    <div className="ai-features">
                        <button
                            className={`ai-feature-card${inlineListening && voiceMode === 'ambient' ? ' ai-feature-active' : ''}`}
                            onClick={handleStartAmbient}
                            type="button"
                        >
                            <div className="ai-feature-icon" style={{ background: 'rgba(28,158,255,0.08)', color: '#1C9EFF' }}>
                                <Radio size={20} />
                            </div>
                            <div className="ai-feature-text">
                                <span className="ai-feature-title">Ambient Listening</span>
                                <span className="ai-feature-desc">
                                    {inlineListening && voiceMode === 'ambient'
                                        ? 'Listening — tasks created automatically'
                                        : 'Leave the mic on — tasks captured as your team talks'}
                                </span>
                            </div>
                        </button>

                        <button
                            className={`ai-feature-card${isDragOver ? ' ai-feature-drop' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            type="button"
                        >
                            <div className="ai-feature-icon" style={{ background: 'rgba(250,158,82,0.08)', color: '#FA9E52' }}>
                                <FileText size={20} />
                            </div>
                            <div className="ai-feature-text">
                                <span className="ai-feature-title">Spreadsheet Import</span>
                                <span className="ai-feature-desc">Bulk create harvests, plants, or tag assignments from CSV</span>
                            </div>
                        </button>
                    </div>

                    {/* All workflows — progressive disclosure */}
                    <div className="ai-wf-section">
                        <button
                            className={`ai-wf-toggle${showAllWorkflows ? ' open' : ''}`}
                            onClick={() => setShowAllWorkflows(v => !v)}
                            type="button"
                        >
                            All workflows
                            <ChevronDown size={14} />
                        </button>
                        <div className={`ai-wf-expand${showAllWorkflows ? ' open' : ''}`}>
                            <div className="ai-wf-expand-inner">
                                <div className="ai-workflows">
                                    {WORKFLOW_CATEGORIES.map((cat) => (
                                        <div key={cat.label} className="ai-wf-group">
                                            <span className="ai-wf-label" style={{ color: cat.color }}>{cat.label}</span>
                                            <div className="ai-wf-items">
                                                {cat.items.map((w) => {
                                                    const Icon = w.icon;
                                                    return (
                                                        <button
                                                            key={w.text}
                                                            onClick={() => handleSend(w.text)}
                                                            className="ai-wf-item"
                                                            type="button"
                                                        >
                                                            <Icon size={13} style={{ color: cat.color, flexShrink: 0 }} />
                                                            {w.text}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mic error */}
                    {(micError || deepgramError) && (
                        <p className="text-xs" style={{ color: 'var(--color-waste)' }}>{micError || deepgramError}</p>
                    )}
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
                                            ? 'ai-msg-bubble-user'
                                            : 'ai-msg-bubble-assistant'
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
                                <div className="ai-msg-bubble ai-msg-bubble-assistant">
                                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
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
                                <p className="text-xs px-1" style={{ color: 'var(--color-waste)' }}>{micError || deepgramError}</p>
                            </div>
                        )}
                        {licenseSelector && (
                            <div className="max-w-3xl mx-auto w-full mb-2">
                                {licenseSelector}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="ai-chat-form">
                            <div className="ai-chat-input-wrap">
                                <textarea
                                    ref={textareaRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={pendingActions && pendingActions.length > 0 ? "Add more details or send to update..." : inlineListening && voiceMode === 'ambient' ? "Listening... tasks will be created automatically" : "Type a message..."}
                                    rows={1}
                                    disabled={isLoading || isExecuting}
                                    className="ai-chat-textarea"
                                    onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = '44px';
                                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                    }}
                                />
                            </div>
                            <div className="ai-chat-actions">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="ai-chat-icon-btn"
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
                                    className="ai-chat-send"
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
