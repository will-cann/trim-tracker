import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Mic, MicOff, Radio, Zap, Clock, Sparkles, Loader2, StopCircle } from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import { useTaskList } from '../hooks/useTaskList';
import { TaskList } from './TaskList';
import { apiService } from '../services/apiService';
import type { SpeechMode, TrimSession, TrimmerProfile, Harvest, License } from '../types/definitions';

interface VoiceInterfaceProps {
    session: TrimSession | null;
    trimmerProfiles: TrimmerProfile[];
    harvests: Harvest[];
    onSessionUpdate: () => Promise<void>;
    conversationId: string | null;
    activeLicense?: string | null;
    licenses?: License[];
    onClose: () => void;
    onCreateHumanTasks?: (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => Promise<void>;
}

export const VoiceInterface = ({
    session,
    trimmerProfiles,
    harvests,
    onSessionUpdate,
    conversationId,
    activeLicense,
    onClose,
    onCreateHumanTasks,
}: VoiceInterfaceProps) => {
    const [mode, setMode] = useState<SpeechMode>('action');
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const transcriptRef = useRef('');
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Ensure we always have a conversationId for task persistence
    const effectiveConversationId = useMemo(
        () => conversationId || crypto.randomUUID(),
        [conversationId]
    );

    const {
        tasks, addTasks, editTaskAction, removeTask,
        executeTask, executeAll, skipTask,
        clearCompleted, clearAll, pendingCount, completedCount,
        isExecuting,
    } = useTaskList({ conversationId: effectiveConversationId, onSessionUpdate });

    const buildContext = useCallback(() => ({
        hasActiveSession: !!session,
        sessionId: session?.id,
        trimmerProfiles: trimmerProfiles.map(p => ({ id: p.id, name: p.name })),
        existingEntries: (session?.entries || []).map(e => ({
            id: e.id, harvestName: e.harvestName, strain: e.strain, status: e.status,
        })),
        harvests: (harvests || []).map(h => ({
            id: h.id, batchId: h.batchId, strain: h.strain, status: h.status,
        })),
        activeLicenseNumber: activeLicense || undefined,
    }), [session, trimmerProfiles, harvests, activeLicense]);

    // Send transcript to AI for task extraction
    const analyzeTranscript = useCallback(async (text: string) => {
        if (!text.trim()) return;
        setIsAnalyzing(true);
        setAnalyzeError(null);
        try {
            const result = await apiService.aiParse({
                transcriptChunks: [text],
                context: buildContext(),
            });

            // Split human tasks from automated actions
            const humanTaskActions = result.actions.filter((a: any) => a.type === 'create_human_task');
            const automatedActions = result.actions.filter((a: any) => a.type !== 'create_human_task');

            if (automatedActions.length > 0) {
                addTasks(automatedActions, mode, text.slice(0, 100));
            }

            // Create human tasks directly
            if (humanTaskActions.length > 0 && onCreateHumanTasks) {
                await onCreateHumanTasks(humanTaskActions.map((a: any) => a.data));
            }

            if (result.actions.length === 0) {
                setAnalyzeError('No actionable tasks found in transcript. Try being more specific.');
            }
        } catch (error) {
            console.error('Failed to analyze transcript:', error);
            setAnalyzeError(error instanceof Error ? error.message : 'Failed to analyze transcript');
        } finally {
            setIsAnalyzing(false);
        }
    }, [buildContext, addTasks, mode, onCreateHumanTasks]);

    // Handle Deepgram transcripts
    const handleTranscript = useCallback((text: string, isFinal: boolean) => {
        if (isFinal) {
            transcriptRef.current = transcriptRef.current
                ? `${transcriptRef.current} ${text}`
                : text;
            setTranscript(transcriptRef.current);
            setInterimText('');
        } else {
            setInterimText(text);
        }
    }, []);

    // Action mode: auto-analyze when utterance ends
    const handleUtteranceEnd = useCallback(() => {
        if (mode === 'action' && transcriptRef.current.trim()) {
            const text = transcriptRef.current;
            transcriptRef.current = '';
            setTranscript('');
            analyzeTranscript(text);
        }
    }, [mode, analyzeTranscript]);

    const { isListening, startListening, stopListening, error } = useDeepgram({
        mode,
        onTranscript: handleTranscript,
        onUtteranceEnd: handleUtteranceEnd,
    });

    // Timer for ambient mode
    useEffect(() => {
        if (isListening && mode === 'ambient') {
            setElapsedSeconds(0);
            timerRef.current = setInterval(() => {
                setElapsedSeconds(s => s + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isListening, mode]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript, interimText]);

    const handleMicToggle = async () => {
        if (isListening) {
            // In action mode, also analyze any remaining text
            if (mode === 'action' && transcriptRef.current.trim()) {
                const text = transcriptRef.current;
                transcriptRef.current = '';
                setTranscript('');
                analyzeTranscript(text);
            }
            stopListening();
        } else {
            transcriptRef.current = '';
            setTranscript('');
            setInterimText('');
            await startListening();
        }
    };

    const handleAnalyzeNow = () => {
        if (transcriptRef.current.trim()) {
            analyzeTranscript(transcriptRef.current);
            // Don't clear transcript in ambient mode — keep the full log
        }
    };

    const handleStopAndReview = () => {
        if (transcriptRef.current.trim()) {
            analyzeTranscript(transcriptRef.current);
        }
        stopListening();
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Mode toggle */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button
                        onClick={() => { if (!isListening) setMode('action'); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            mode === 'action'
                                ? 'bg-white text-gray-800 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Zap size={12} />
                        Action
                    </button>
                    <button
                        onClick={() => { if (!isListening) setMode('ambient'); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            mode === 'ambient'
                                ? 'bg-white text-gray-800 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Radio size={12} />
                        Ambient
                    </button>
                </div>
                <button
                    onClick={onClose}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                    Back to chat
                </button>
            </div>

            {/* Main voice area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Mic + transcript area */}
                <div className="flex flex-col items-center pt-6 pb-4 px-4">
                    {/* Mic button */}
                    <button
                        onClick={handleMicToggle}
                        disabled={isAnalyzing}
                        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all
                            ${isListening
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                            }
                            disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isListening ? <MicOff size={28} /> : <Mic size={28} />}
                        {isListening && (
                            <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-20" />
                        )}
                    </button>

                    {/* Status text */}
                    <p className="text-sm text-gray-500 mt-3">
                        {isListening
                            ? mode === 'ambient'
                                ? 'Listening... speak naturally'
                                : 'Listening... speak a command'
                            : mode === 'ambient'
                                ? 'Tap to start ambient listening'
                                : 'Tap to speak a command'
                        }
                    </p>

                    {/* Timer (ambient only) */}
                    {mode === 'ambient' && isListening && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                            <Clock size={12} />
                            <span className="tabular-nums">{formatTime(elapsedSeconds)}</span>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-red-500 mt-2">{error}</p>
                    )}
                    {analyzeError && (
                        <p className="text-xs text-amber-600 mt-2">{analyzeError}</p>
                    )}
                </div>

                {/* Transcript area */}
                {(transcript || interimText) && (
                    <div className="px-4 pb-3">
                        <div className="max-h-32 overflow-y-auto bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                            {transcript}
                            {interimText && (
                                <span className="text-gray-400"> {interimText}</span>
                            )}
                            <div ref={transcriptEndRef} />
                        </div>
                    </div>
                )}

                {/* Ambient controls */}
                {mode === 'ambient' && isListening && (
                    <div className="flex gap-2 px-4 pb-3">
                        <button
                            onClick={handleAnalyzeNow}
                            disabled={isAnalyzing || !transcript.trim()}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                                       bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium
                                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isAnalyzing ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Sparkles size={14} />
                            )}
                            Analyze Now
                        </button>
                        <button
                            onClick={handleStopAndReview}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200
                                       text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                        >
                            <StopCircle size={14} />
                            Stop & Review
                        </button>
                    </div>
                )}

                {/* Analyzing indicator */}
                {isAnalyzing && (
                    <div className="flex items-center justify-center gap-2 px-4 pb-3 text-sm text-gray-500">
                        <Loader2 size={14} className="animate-spin" />
                        Extracting tasks...
                    </div>
                )}

                {/* Task list */}
                <div className="flex-1 overflow-hidden px-4 pb-4">
                    <TaskList
                        tasks={tasks}
                        onExecuteTask={executeTask}
                        onExecuteAll={executeAll}
                        onSkipTask={skipTask}
                        onRemoveTask={removeTask}
                        onEditTaskAction={editTaskAction}
                        onClearCompleted={clearCompleted}
                        onClearAll={clearAll}
                        pendingCount={pendingCount}
                        completedCount={completedCount}
                        isExecuting={isExecuting}
                    />
                </div>
            </div>
        </div>
    );
};
