import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, Upload, FileText, ArrowRight, Loader2, Pencil } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import type { TrimSession, TrimmerProfile, Harvest, ChatMessage, CreateTrimSessionDTO, License } from '../types/definitions';
import logo from '../assets/logo.png';

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
}) => {
    const [inputText, setInputText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const conversationIdRef = useRef<string | null>(null);

    const { isListening, finalTranscript, interimTranscript, startListening, stopListening, hasSupport, resetTranscript } = useSpeechRecognition();
    const [preListeningText, setPreListeningText] = useState('');

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
    });

    // Load conversation when conversationId changes
    const isNewConversationRef = useRef(false);

    useEffect(() => {
        if (conversationId && conversationId !== conversationIdRef.current) {
            const prevId = conversationIdRef.current;
            conversationIdRef.current = conversationId;

            // If we just created this conversation (no previous id or transitioning from null),
            // don't load from Dexie — the messages are already in state
            if (prevId === null && messages.length > 0) {
                isNewConversationRef.current = true;
                return;
            }

            onLoadConversation(conversationId).then(msgs => {
                if (msgs.length > 0) {
                    loadMessages(msgs);
                }
                // Don't clear if empty — could be a brand new conversation
            });
        } else if (!conversationId && conversationIdRef.current !== null) {
            conversationIdRef.current = null;
            isNewConversationRef.current = false;
            clearMessages();
        }
    }, [conversationId, onLoadConversation, loadMessages, clearMessages]);

    // Speech recognition effects
    useEffect(() => {
        if (finalTranscript) {
            setInputText(preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript);
        }
    }, [finalTranscript]);

    useEffect(() => {
        if (isListening && interimTranscript) {
            const base = finalTranscript
                ? (preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript)
                : preListeningText;
            setInputText(base ? `${base} ${interimTranscript}` : interimTranscript);
        }
    }, [interimTranscript, isListening]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions]);

    const handleSend = useCallback((text: string) => {
        if (!text.trim() || isLoading) return;
        // If no conversation yet, create one and set the ref immediately
        if (!conversationId) {
            const newId = crypto.randomUUID();
            setConversationId(newId);
            onConversationStarted(newId);
        }
        sendMessage(text.trim());
        setInputText('');
        resetTranscript();
    }, [isLoading, conversationId, onConversationStarted, sendMessage, resetTranscript, setConversationId]);

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
                    <h1 className="text-2xl font-bold text-gray-800 mb-1">What would you like to do?</h1>
                    <p className="text-sm text-gray-500 mb-8">
                        Start a session, add batches, manage trimmers, track harvests — just tell me.
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
                                placeholder='e.g. "Starting today with OG Kush 500g and Blue Dream 750g"'
                                rows={3}
                                disabled={isLoading || isExecuting}
                                className="w-full px-4 py-3 pr-24 border border-gray-200 rounded-xl resize-none
                                           text-sm text-gray-800 placeholder-gray-400
                                           focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                           disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            <div className="absolute right-2 bottom-2 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                    title="Upload CSV"
                                >
                                    <Upload size={16} />
                                </button>
                                {hasSupport && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isListening) {
                                                stopListening();
                                            } else {
                                                setPreListeningText(inputText);
                                                startListening();
                                            }
                                        }}
                                        className={`p-2 rounded-lg transition-colors ${
                                            isListening
                                                ? 'bg-red-100 text-red-500 hover:bg-red-200'
                                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                        }`}
                                        title={isListening ? 'Stop recording' : 'Voice input'}
                                    >
                                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || isLoading || isExecuting}
                                    className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600
                                               disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                                isDragOver
                                    ? 'border-emerald-400 bg-emerald-50'
                                    : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                                {isDragOver ? (
                                    <>
                                        <Upload size={16} className="text-emerald-500" />
                                        <span className="text-emerald-600 font-medium">Drop CSV here</span>
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
                        {[
                            'Start a new trim session with OG Kush',
                            'Add 3 batches of Blue Dream',
                            'Assign Maria to the active batch at 8am',
                            'Create a new harvest for Gelato',
                        ].map((suggestion) => (
                            <button
                                key={suggestion}
                                onClick={() => setInputText(suggestion)}
                                className="text-xs text-gray-500 px-3 py-2
                                           rounded-full border border-gray-200 hover:border-emerald-300
                                           hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                /* Chat view — messages + input at bottom */
                <div className="ai-home-chat">
                    <div className="ai-home-messages">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`ai-msg-row ${msg.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`}
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
                            </div>
                        ))}

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
                                    placeholder="Type a message..."
                                    rows={1}
                                    disabled={isLoading || isExecuting}
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
                                {hasSupport && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isListening) {
                                                stopListening();
                                            } else {
                                                setPreListeningText(inputText);
                                                startListening();
                                            }
                                        }}
                                        className={`p-2.5 rounded-lg transition-colors ${
                                            isListening
                                                ? 'bg-red-100 text-red-500'
                                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                        }`}
                                        title={isListening ? 'Stop' : 'Voice input'}
                                    >
                                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                                    </button>
                                )}
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
