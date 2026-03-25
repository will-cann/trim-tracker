import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Mic, MicOff, Upload, ArrowRight, Loader2 } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import type { TrimSession, TrimmerProfile, Harvest } from '../types/definitions';
import logo from '../assets/logo.png';

interface ChatPanelProps {
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests?: Harvest[];
    onSessionUpdate: () => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ session, trimmerProfiles, harvests, onSessionUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    } = useAIChat({ session, trimmerProfiles, harvests, onSessionUpdate });

    // When final transcript updates, commit it to input
    useEffect(() => {
        if (finalTranscript) {
            setInputText(preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript);
        }
    }, [finalTranscript]);

    // Show interim text as a live preview
    useEffect(() => {
        if (isListening && interimTranscript) {
            const base = finalTranscript
                ? (preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript)
                : preListeningText;
            setInputText(base ? `${base} ${interimTranscript}` : interimTranscript);
        }
    }, [interimTranscript, isListening]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || isLoading) return;
        sendMessage(inputText.trim());
        setInputText('');
        resetTranscript();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
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
            if (text?.trim()) sendCSV(text);
        };
        reader.readAsText(file);
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg
                           flex items-center justify-center transition-all duration-200
                           ${isOpen
                        ? 'bg-gray-600 hover:bg-gray-700 rotate-0'
                        : 'bg-emerald-500 hover:bg-emerald-600 hover:scale-105'
                    }`}
                title="AI Assistant"
            >
                {isOpen ? <X size={22} className="text-white" /> : <img src={logo} alt="AI" className="w-6 h-6 object-contain brightness-0 invert" />}
            </button>

            {/* Panel Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed right-0 top-0 h-full z-40 w-full sm:w-[400px]
                           bg-white shadow-2xl flex flex-col
                           transition-transform duration-300 ease-in-out
                           ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Panel Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center overflow-hidden">
                        <img src={logo} alt="AI" className="w-5 h-5 object-contain" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-800">AI Assistant</h3>
                        <p className="text-xs text-gray-500">Add batches, assign trimmers, and more</p>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
                                        onClick={() => {
                                            setInputText(suggestion);
                                            // Focus the textarea
                                        }}
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

                    {/* Inline Action Preview */}
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

                {/* Input Bar */}
                <div className="border-t border-gray-200 px-3 py-3 bg-white">
                    <form onSubmit={handleSubmit} className="flex items-end gap-2">
                        <div className="flex-1 relative">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a message..."
                                rows={1}
                                disabled={isLoading || isExecuting}
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

                            {/* Mic */}
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
                                            ? 'bg-red-100 text-red-500'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
                                    title={isListening ? 'Stop' : 'Voice input'}
                                >
                                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                </button>
                            )}

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
