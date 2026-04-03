import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, ArrowRight, Upload, Pencil } from 'lucide-react';
import { ActionPreview } from './ActionPreview';
import { ActionResult } from './ActionResult';
import { ExtractionRunCard } from './ExtractionRunCard';
import type { ExtractionRunCardData } from './ExtractionRunCard';
import { VoicePill } from './VoicePill';
import type { ChatMessage, ProposedAction, SpeechMode } from '../types/definitions';
import logo from '../assets/logo.png';

interface AIChatProps {
    messages: ChatMessage[];
    isLoading: boolean;
    pendingActions: ProposedAction[] | null;
    isExecuting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    onEditAction: (index: number, data: Record<string, any>) => void;
    onEditMessage: (id: string) => string | null;
    onSend: (text: string) => void;
    onFileUpload: (file: File) => void;
    onViewChange?: (view: 'dashboard' | 'harvests' | 'reports' | 'tasks') => void;
    // Input state (managed by parent)
    inputText: string;
    onInputChange: (text: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    // Voice
    isListening: boolean;
    voiceMode: SpeechMode;
    onToggleListening: () => void;
    onSwitchMode: (mode: SpeechMode) => void;
    micError?: string | null;
    // License selector
    licenseSelector?: React.ReactNode;
    // Focus input
    onFocusInput: () => void;
    // Extraction cards
    extractionRunCards?: ExtractionRunCardData[];
    onExtractionSubmit?: (cardId: string) => void;
    onExtractionDismiss?: (cardId: string) => void;
    onExtractionCardUpdate?: (cardId: string, updates: Partial<ExtractionRunCardData>) => void;
}

export const AIChat: React.FC<AIChatProps> = ({
    messages,
    isLoading,
    pendingActions,
    isExecuting,
    onConfirm,
    onCancel,
    onEditAction,
    onEditMessage,
    onFileUpload,
    onViewChange,
    inputText,
    onInputChange,
    onSubmit,
    onKeyDown,
    textareaRef,
    isListening,
    voiceMode,
    onToggleListening,
    onSwitchMode,
    micError,
    licenseSelector,
    onFocusInput,
    extractionRunCards = [],
    onExtractionSubmit,
    onExtractionDismiss,
    onExtractionCardUpdate,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions, extractionRunCards]);

    const isCommandMode = !!(pendingActions && pendingActions.length > 0);

    return (
        <div className="ai-home-chat">
            <div className="ai-home-messages">
                {messages.map((msg) => {
                    const isThePendingMsg = msg.status === 'pending';
                    return (
                        <div
                            key={msg.id}
                            className={`ai-cmd-row ${
                                isCommandMode && !isThePendingMsg ? 'opacity-40 transition-opacity' : 'transition-opacity'
                            }`}
                        >
                            {msg.role === 'user' ? (
                                <div className="ai-cmd-prompt">
                                    <span className="ai-cmd-arrow">&rarr;</span>
                                    <span className="ai-cmd-text">{msg.content}</span>
                                    <button
                                        className="ai-cmd-edit"
                                        onClick={() => {
                                            const text = onEditMessage(msg.id);
                                            if (text) {
                                                onInputChange(text);
                                                onFocusInput();
                                            }
                                        }}
                                        title="Edit and resend"
                                    >
                                        <Pencil size={11} />
                                    </button>
                                </div>
                            ) : (
                                <div className="ai-cmd-response">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                </div>
                            )}

                            {/* Inline action cards */}
                            {msg.actions && msg.actions.length > 0 && (msg.status === 'confirmed' || msg.status === 'cancelled') && (
                                <div className="ai-cmd-actions">
                                    <ActionPreview
                                        actions={msg.actions}
                                        readonly
                                        status={msg.status}
                                    />
                                </div>
                            )}

                            {/* Result cards */}
                            {msg.results && msg.results.length > 0 && (
                                <div className="ai-cmd-actions">
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
                    <div className="ai-cmd-row">
                        <div className="ai-cmd-loading">
                            <img src={logo} alt="" className="ai-cmd-loading-logo" />
                            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                        </div>
                    </div>
                )}

                {pendingActions && pendingActions.length > 0 && (
                    <div className="ai-cmd-row">
                        <ActionPreview
                            actions={pendingActions}
                            onConfirm={onConfirm}
                            onCancel={onCancel}
                            onEditAction={onEditAction}
                            isExecuting={isExecuting}
                        />
                    </div>
                )}

                {extractionRunCards.length > 0 && (
                    <div className="ai-cmd-row space-y-2">
                        {extractionRunCards.map(card => (
                            <ExtractionRunCard
                                key={card.id}
                                card={card}
                                onSubmit={onExtractionSubmit || (() => {})}
                                onDismiss={onExtractionDismiss || (() => {})}
                                onUpdateCard={onExtractionCardUpdate || (() => {})}
                            />
                        ))}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="ai-home-input-bar">
                {micError && (
                    <div className="ai-cmd-row-wrap">
                        <p className="text-xs px-1" style={{ color: 'var(--color-waste)' }}>{micError}</p>
                    </div>
                )}
                {licenseSelector && (
                    <div className="ai-cmd-row-wrap mb-2">
                        {licenseSelector}
                    </div>
                )}
                <form onSubmit={onSubmit} className="ai-chat-form">
                    <div className="ai-chat-input-wrap">
                        <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder={
                                pendingActions && pendingActions.length > 0
                                    ? "Add more details or send to update..."
                                    : isListening && voiceMode === 'ambient'
                                        ? "Listening... tasks will be created automatically"
                                        : "Type a message..."
                            }
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
                                if (file) onFileUpload(file);
                                e.target.value = '';
                            }}
                            className="hidden"
                        />
                        <VoicePill
                            isListening={isListening}
                            mode={voiceMode}
                            onToggleListening={onToggleListening}
                            onSwitchMode={onSwitchMode}
                            error={micError}
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
    );
};
