import { useState, useRef, useEffect, useCallback } from 'react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useAIChat } from '../hooks/useAIChat';
import { useAmbient } from '../contexts/AmbientContext';
import { AIEmptyState } from './AIEmptyState';
import type { FacilitySetupStatus } from './AIEmptyState';
import { AIChat } from './AIChat';
import { isCardReady } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { AmbientActionCenter } from './AmbientActionCenter';
import { AmbientStatusPill } from './AmbientStatusPill';
import logo from '../assets/logo.png';
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
    // Ambient session state is owned by AmbientContext so it survives
    // navigation. AIHome only owns the action-mode dictation (mic into
    // textarea). The voiceMode flag is kept for the VoicePill UI so the
    // user can still pick "ambient" from the long-press menu.
    const ambient = useAmbient();
    const [voiceMode, setVoiceMode] = useState<SpeechMode>('action');
    const inlineTranscriptRef = useRef('');
    const [inlineInterim, setInlineInterim] = useState('');
    const [micError, setMicError] = useState<string | null>(null);

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

    // ── AI Chat hook ──
    const {
        messages, isLoading, pendingActions, isExecuting,
        sendMessage, sendCSV, confirmActions, cancelActions,
        editAction, editMessage, clearMessages, loadMessages, setConversationId,
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

    // ── Deepgram (action mode only) ──────────────────────────────────
    // AIHome's local useDeepgram is exclusively for action-mode dictation
    // into the textarea. Ambient lives in AmbientContext with its own
    // independent Deepgram instance so it survives navigation.
    const handleInlineTranscript = useCallback((text: string, isFinal: boolean) => {
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
    }, [inlineInterim]);

    const handleInlineError = useCallback((err: string) => {
        setMicError(err);
        setTimeout(() => setMicError(null), 5000);
    }, []);

    const { isListening: actionListening, startListening: startActionMic, stopListening: stopActionMic, error: deepgramError } = useDeepgram({
        mode: 'action',
        onTranscript: handleInlineTranscript,
        onError: handleInlineError,
    });

    // VoicePill toggle — routes based on the currently selected voice mode.
    // Action mode drives the local action-Deepgram that fills the textarea.
    // Ambient mode delegates entirely to AmbientContext so the session is
    // hoisted above AIHome and survives navigation.
    const handleVoiceToggle = useCallback(async () => {
        setMicError(null);
        if (voiceMode === 'ambient') {
            if (!ambient.sessionActive) {
                await ambient.start();
            } else if (ambient.isPaused) {
                await ambient.resume();
            } else {
                ambient.pause();
            }
            return;
        }
        // Action mode
        if (actionListening) {
            stopActionMic();
        } else {
            inlineTranscriptRef.current = inputText;
            setInlineInterim('');
            try { await startActionMic(); }
            catch (err) { setMicError(err instanceof Error ? err.message : 'Failed to start mic'); }
        }
    }, [voiceMode, ambient, actionListening, startActionMic, stopActionMic, inputText]);

    const handleModeSwitch = useCallback((mode: SpeechMode) => {
        if (actionListening) stopActionMic();
        setVoiceMode(mode);
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
    }, [actionListening, stopActionMic]);

    // Start ambient from the "Ambient Listening" feature card on AIEmptyState.
    // Delegates entirely to the context. If ambient is already listening,
    // pressing again pauses (mirrors the Action Center's Stop pill).
    const handleStartAmbient = useCallback(() => {
        setVoiceMode('ambient');
        if (actionListening) stopActionMic();
        inlineTranscriptRef.current = '';
        setInputText('');
        setInlineInterim('');
        if (!ambient.sessionActive) {
            ambient.start().catch(err => {
                setMicError(err instanceof Error ? err.message : 'Failed to start mic');
            });
        } else if (ambient.isPaused) {
            ambient.resume().catch(err => {
                setMicError(err instanceof Error ? err.message : 'Failed to resume mic');
            });
        } else {
            ambient.pause();
        }
    }, [actionListening, stopActionMic, ambient]);

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
        if (actionListening) stopActionMic();
    }, [isLoading, conversationId, onConversationStarted, sendMessage, setConversationId, actionListening, stopActionMic, pendingActions, cancelActions]);

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

    const combinedError = micError || deepgramError || ambient.micError || null;
    const hasMessages = messages.length > 0;
    // The Action Center is visible on the AI home whenever an ambient
    // session exists — even while paused. The session is owned by
    // AmbientContext so it survives navigation.
    const showAmbientCenter = ambient.sessionActive;
    // VoicePill display listening state: follows whichever mode the user
    // has selected. Ambient mode reflects the context's actual mic state;
    // action mode reflects the local action-Deepgram.
    const pillListening = voiceMode === 'ambient' ? ambient.isListening : actionListening;

    // The body key drives the fade transition: when it changes, the
    // outgoing body fades + drifts down, the incoming body fades + drifts
    // in from a slight scale. The brand block above never moves.
    const bodyKey = showAmbientCenter ? 'ambient' : hasMessages ? 'chat' : 'empty';

    return (
        <div className="ai-home">
            {/* Brand block — persistent across empty / ambient states. Skipped
                for the chat view which owns its own full-bleed scroll layout. */}
            {!hasMessages && (
                <div className="ai-home-brand-block">
                    <div className="ai-hero">
                        <img src={logo} alt="neurocann" className="ai-hero-logo" />
                        <h1 className="ai-hero-brand">
                            <span className="ai-hero-accent">neuro</span>cann
                        </h1>
                    </div>
                    {licenses.length > 0 && (
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
                    )}
                    {showAmbientCenter && (
                        <AmbientStatusPill
                            isPaused={ambient.isPaused}
                            hasVoiceSignal={ambient.hasVoiceSignal}
                            elapsedMs={ambient.elapsedMs}
                            onPause={ambient.pause}
                            onResume={ambient.resume}
                            onEnd={ambient.end}
                        />
                    )}
                </div>
            )}

            {/* Body — fades between empty and ambient. Chat replaces the
                whole AIHome surface so it lives outside the brand-block tree. */}
            {hasMessages ? (
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
                    isListening={pillListening}
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
            ) : (
                <div className="ai-home-body" key={bodyKey}>
                    {showAmbientCenter ? (
                        <AmbientActionCenter
                            isPaused={ambient.isPaused}
                            interimText={ambient.interimText}
                            hasVoiceSignal={ambient.hasVoiceSignal}
                            captures={ambient.captures}
                            pendingActions={ambient.pendingActions}
                            isExecuting={ambient.isExecutingPending}
                            onConfirm={ambient.confirmPending}
                            onCancel={ambient.cancelPending}
                            transcript={ambient.transcriptLines}
                            onUpdateCapture={ambient.updateCapture}
                            micError={combinedError}
                        />
                    ) : (
                        <AIEmptyState
                            onSend={handleSend}
                            onStartAmbient={handleStartAmbient}
                            onFileUpload={handleFileUpload}
                            isLoading={isLoading}
                            isExecuting={isExecuting}
                            isListening={pillListening}
                            voiceMode={voiceMode}
                            onToggleListening={handleVoiceToggle}
                            onSwitchMode={handleModeSwitch}
                            micError={combinedError}
                            conversations={conversations}
                            onSelectConversation={onSelectConversation}
                            onDeleteConversation={onDeleteConversation}
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
                    )}
                </div>
            )}
        </div>
    );
};
