import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, Mic, MicOff, Upload, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAIChat } from '../hooks/useAIChat';
import { ActionPreview } from './ActionPreview';
import { StartSession } from './StartSession';
import type { TrimmerProfile, CreateTrimSessionDTO } from '../types/definitions';

interface AIAssistantProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
    trimmerProfiles: TrimmerProfile[];
    onSessionUpdate: () => Promise<void>;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ onStart, trimmerProfiles, onSessionUpdate }) => {
    const [showManualForm, setShowManualForm] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    } = useAIChat({ session: null, trimmerProfiles, onSessionUpdate });

    // When final transcript updates, commit it to input
    useEffect(() => {
        if (finalTranscript) {
            setInputText(preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript);
        }
    }, [finalTranscript]);

    // Show interim text as a live preview in the input
    useEffect(() => {
        if (isListening && interimTranscript) {
            const base = finalTranscript
                ? (preListeningText ? `${preListeningText} ${finalTranscript}` : finalTranscript)
                : preListeningText;
            setInputText(base ? `${base} ${interimTranscript}` : interimTranscript);
        }
    }, [interimTranscript, isListening]);

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
            if (text?.trim()) {
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

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    if (showManualForm) {
        return (
            <div>
                <button
                    onClick={() => setShowManualForm(false)}
                    className="mb-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                    <Sparkles size={14} />
                    Back to AI Assistant
                </button>
                <StartSession onStart={onStart} />
            </div>
        );
    }

    return (
        <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Sparkles size={20} className="text-emerald-500" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-800" style={{ margin: 0 }}>Start a New Session</h2>
                    <p className="text-sm text-gray-500" style={{ margin: 0 }}>
                        Tell me what you're trimming today, or upload a CSV
                    </p>
                </div>
            </div>

            {/* Chat Messages */}
            {messages.length > 0 && (
                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`chat-bubble max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
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
                </div>
            )}

            {/* Action Preview */}
            {pendingActions && pendingActions.length > 0 && (
                <div className="mb-4">
                    <ActionPreview
                        actions={pendingActions}
                        onConfirm={confirmActions}
                        onCancel={cancelActions}
                        onEditAction={editAction}
                        isExecuting={isExecuting}
                    />
                </div>
            )}

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder='e.g. "Starting today with OG Kush 500g license ABC123 and Blue Dream 750g license DEF456"'
                        rows={3}
                        disabled={isLoading || isExecuting}
                        className="w-full px-4 py-3 pr-24 border border-gray-200 rounded-xl resize-none
                                   text-sm text-gray-800 placeholder-gray-400
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                   disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
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
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                                title={isListening ? 'Stop recording' : 'Start recording'}
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

                {/* CSV Upload Zone */}
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                        isDragOver
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                >
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

            {/* Manual Form Toggle */}
            <div className="mt-4 text-center">
                <button
                    onClick={() => setShowManualForm(true)}
                    className="text-sm text-gray-400 hover:text-emerald-600 transition-colors"
                >
                    Or use manual form
                </button>
            </div>
        </div>
    );
};
