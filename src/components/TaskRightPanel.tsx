import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Circle, Clock, GripVertical, ListTodo, Trash2, Mic, Radio } from 'lucide-react';
import { useDeepgram } from '../hooks/useDeepgram';
import type { HumanTask, HumanTaskStatus, SpeechMode } from '../types/definitions';

interface TaskRightPanelProps {
    tasks: HumanTask[];
    isOpen: boolean;
    onToggle: () => void;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => void;
    onDeleteTask: (id: string) => void;
    pendingCount: number;
    onViewAll?: () => void;
    onActionVoiceText?: (text: string) => void;
    onAmbientAnalyze?: (text: string) => Promise<void>;
}

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

export const TaskRightPanel: React.FC<TaskRightPanelProps> = ({
    tasks,
    isOpen,
    onToggle,
    onUpdateStatus,
    onDeleteTask,
    pendingCount,
    onViewAll,
    onActionVoiceText,
    onAmbientAnalyze,
}) => {
    // === Voice controls ===
    const [voiceMode, setVoiceMode] = useState<SpeechMode | null>(null);
    const transcriptRef = useRef('');

    const handleTranscript = useCallback((text: string, isFinal: boolean) => {
        if (isFinal) {
            transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${text}` : text;
        }
    }, []);

    const handleUtteranceEnd = useCallback(() => {
        if (voiceMode === 'ambient' && transcriptRef.current.trim() && onAmbientAnalyze) {
            const text = transcriptRef.current;
            transcriptRef.current = '';
            onAmbientAnalyze(text);
        }
    }, [voiceMode, onAmbientAnalyze]);

    const { isListening, startListening, stopListening } = useDeepgram({
        mode: voiceMode || 'action',
        onTranscript: handleTranscript,
        onUtteranceEnd: handleUtteranceEnd,
    });

    const startVoice = useCallback(async (mode: SpeechMode) => {
        transcriptRef.current = '';
        setVoiceMode(mode);
        setTimeout(async () => {
            try { await startListening(); } catch { /* handled by hook */ }
        }, 50);
    }, [startListening]);

    const stopVoice = useCallback(() => {
        if (voiceMode === 'action' && transcriptRef.current.trim() && onActionVoiceText) {
            onActionVoiceText(transcriptRef.current);
        }
        if (voiceMode === 'ambient' && transcriptRef.current.trim() && onAmbientAnalyze) {
            onAmbientAnalyze(transcriptRef.current);
        }
        transcriptRef.current = '';
        stopListening();
        setVoiceMode(null);
    }, [voiceMode, stopListening, onActionVoiceText, onAmbientAnalyze]);

    // Show active tasks first (pending + in_progress), then completed
    const sorted = [...tasks].sort((a, b) => {
        const order: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
        const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Cap at 20 for the panel
    const visible = sorted.slice(0, 20);

    return (
        <>
            {/* Right edge controls — always visible */}
            <div className="task-edge-controls">
                {/* Action voice */}
                <button
                    className={`task-edge-btn ${isListening && voiceMode === 'action' ? 'voice-active-action' : ''}`}
                    onClick={() => {
                        if (isListening && voiceMode === 'action') { stopVoice(); }
                        else { if (isListening) stopVoice(); startVoice('action'); }
                    }}
                    title={isListening && voiceMode === 'action' ? 'Stop dictation' : 'Voice command'}
                >
                    {isListening && voiceMode === 'action' ? (
                        <div className="sidebar-voice-wave"><span /><span /><span /></div>
                    ) : (
                        <Mic size={14} />
                    )}
                </button>

                {/* Ambient voice */}
                <button
                    className={`task-edge-btn ${isListening && voiceMode === 'ambient' ? 'voice-active-ambient' : ''}`}
                    onClick={() => {
                        if (isListening && voiceMode === 'ambient') { stopVoice(); }
                        else { if (isListening) stopVoice(); startVoice('ambient'); }
                    }}
                    title={isListening && voiceMode === 'ambient' ? 'Stop ambient' : 'Ambient — auto-create tasks'}
                >
                    {isListening && voiceMode === 'ambient' ? (
                        <div className="sidebar-ambient-dots"><span /><span /><span /></div>
                    ) : (
                        <Radio size={14} />
                    )}
                </button>

                {/* Tasks expand */}
                <button
                    className={`task-edge-btn ${isOpen ? 'active' : ''}`}
                    onClick={onToggle}
                    title="Tasks"
                >
                    <ListTodo size={14} />
                    {pendingCount > 0 && !isOpen && (
                        <span className="task-expand-badge">{pendingCount}</span>
                    )}
                </button>
            </div>

            {/* Click-away overlay */}
            {isOpen && (
                <div className="task-panel-overlay" onClick={onToggle} />
            )}

            <div className={`task-panel ${isOpen ? 'open' : 'closed'}`}>
                {isOpen && (
                    <div
                        className="task-panel-grip"
                        onClick={onToggle}
                        title="Collapse panel"
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                {isOpen && (
                    <div className="task-panel-content">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-700">Tasks</h3>
                                {pendingCount > 0 && (
                                    <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                                        {pendingCount}
                                    </span>
                                )}
                            </div>
                            {onViewAll && (
                                <button
                                    onClick={onViewAll}
                                    className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors font-medium"
                                >
                                    View all
                                </button>
                            )}
                        </div>

                        {/* Task list */}
                        {visible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                <ListTodo size={24} className="mb-2" />
                                <p className="text-xs">No tasks yet</p>
                                <p className="text-xs mt-0.5 text-gray-300">Ask the AI to create tasks</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-0.5">
                                {visible.map(task => (
                                    <div
                                        key={task.id}
                                        className={`group flex items-start gap-2 px-2 py-2 rounded-md transition-colors hover:bg-gray-50 ${
                                            task.status === 'completed' ? 'opacity-50' : ''
                                        }`}
                                    >
                                        {/* Status toggle */}
                                        <button
                                            onClick={() => onUpdateStatus(task.id, nextStatus(task.status))}
                                            className="flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                                            title={`Status: ${task.status} — click to advance`}
                                        >
                                            {STATUS_ICON[task.status]}
                                        </button>

                                        {/* Task info */}
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

                                        {/* Delete */}
                                        <button
                                            onClick={() => onDeleteTask(task.id)}
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
            </div>
        </>
    );
};
