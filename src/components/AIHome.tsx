import { useState, useRef, useEffect, useCallback } from 'react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { AIEmptyState } from './AIEmptyState';
import { AIChat } from './AIChat';
import { apiService } from '../services/apiService';
import type { TrimSession, TrimmerProfile, Harvest, ChatMessage, License, HumanTask, SpeechMode, ConversationSummary } from '../types/definitions';

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
    onViewChange?: (view: 'dashboard' | 'harvests' | 'reports' | 'tasks') => void;
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
    // ── Input state ──
    const [inputText, setInputText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const conversationIdRef = useRef<string | null>(null);

    // ── Voice state ──
    const [voiceMode, setVoiceMode] = useState<SpeechMode>('action');
    const inlineTranscriptRef = useRef('');
    const [inlineInterim, setInlineInterim] = useState('');
    const [micError, setMicError] = useState<string | null>(null);
    const voiceModeRef = useRef(voiceMode);
    voiceModeRef.current = voiceMode;
    const ambientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            // Silent fail for ambient
        }
    }, [buildAmbientContext, onCreateHumanTasks]);

    // ── Deepgram voice hooks ──
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
        } else {
            if (isFinal) {
                inlineTranscriptRef.current = inlineTranscriptRef.current
                    ? `${inlineTranscriptRef.current} ${text}` : text;
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
            if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
            ambientDebounceRef.current = setTimeout(() => {
                const text = inlineTranscriptRef.current;
                if (text.trim()) {
                    inlineTranscriptRef.current = '';
                    setInputText('');
                    analyzeAmbientChunk(text);
                }
            }, 5000);
        }
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
                setInputText('');
            }
            stopListening();
        } else {
            inlineTranscriptRef.current = voiceMode === 'action' ? inputText : '';
            setInlineInterim('');
            if (voiceMode === 'ambient') setInputText('');
            try { await startListening(); }
            catch (err) { setMicError(err instanceof Error ? err.message : 'Failed to start mic'); }
        }
    }, [isListening, startListening, stopListening, inputText, voiceMode, analyzeAmbientChunk]);

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
        if (isListening && voiceMode === 'ambient') {
            if (ambientDebounceRef.current) { clearTimeout(ambientDebounceRef.current); ambientDebounceRef.current = null; }
            if (inlineTranscriptRef.current.trim()) {
                analyzeAmbientChunk(inlineTranscriptRef.current);
                inlineTranscriptRef.current = '';
                setInputText('');
            }
            stopListening();
            return;
        }
        if (isListening) stopListening();
        setVoiceMode('ambient');
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
        setWantAmbientStart(true);
    }, [isListening, stopListening, voiceMode, analyzeAmbientChunk]);

    useEffect(() => {
        if (wantAmbientStart && voiceMode === 'ambient' && !isListening) {
            setWantAmbientStart(false);
            startListening().catch(err => {
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            });
        }
    }, [wantAmbientStart, voiceMode, isListening, startListening]);

    // ── AI Chat hook ──
    const {
        messages, isLoading, pendingActions, isExecuting,
        sendMessage, sendCSV, confirmActions, cancelActions,
        editAction, editMessage, clearMessages, loadMessages, setConversationId,
    } = useAIChat({
        session, trimmerProfiles, harvests, onSessionUpdate, conversationId, onSaveConversation,
        activeLicense: licenses.find(l => l.id === activeLicenseId)?.licenseNumber || null,
        onCreateHumanTasks, onUpdateHumanTask, onDeleteHumanTask,
        humanTasks: humanTasks?.map(t => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            category: t.category, assignee: t.assignee, location: t.location,
        })),
        plantMapSummary, screenContext,
    });

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

    return (
        <div className="ai-home">
            {!hasMessages ? (
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
                />
            )}
        </div>
    );
};
