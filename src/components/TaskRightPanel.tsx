import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Circle, PlayCircle, ChevronLeft, ListTodo, Trash2, Mic, Radio, Plus, CalendarClock } from 'lucide-react';
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
    onCreateTask?: (task: { title: string; priority: 'medium'; category: 'other' }) => Promise<unknown>;
}

// Human-readable category labels
const CATEGORY_LABEL: Record<string, string> = {
    drying_curing: 'Drying/Curing',
    ipm: 'IPM',
    compliance: 'Compliance',
    equipment: 'Equipment',
    environmental: 'Environmental',
    packaging: 'Packaging',
    qc_testing: 'QC/Testing',
    inventory: 'Inventory',
    transportation: 'Transport',
    sanitation: 'Sanitation',
    training: 'Training',
    trim: 'Trim',
    harvest: 'Harvest',
    cultivation: 'Cultivation',
    other: 'Other',
};

// Match brand palette from TasksPanel
const PRIORITY_DOT: Record<string, string> = {
    urgent: 'bg-[#DF5B59]',
    high: 'bg-[#FA9E52]',
    medium: 'bg-[#1C9EFF]',
    low: 'bg-[#C0C0C0]',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
    pending: <Circle size={16} className="text-[#C0C0C0]" />,
    in_progress: <PlayCircle size={16} className="text-[#1C9EFF]" />,
    completed: <CheckCircle2 size={16} className="text-[#3BB570]" />,
};

function formatSidebarDue(iso: string): { text: string; urgent: boolean } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(iso);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffMs = dueDay.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true };
    if (diffDays === 0) return { text: 'Today', urgent: true };
    if (diffDays === 1) return { text: 'Tomorrow', urgent: false };
    if (diffDays <= 7) return { text: `${diffDays}d`, urgent: false };
    return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
}

function nextStatus(current: HumanTaskStatus): HumanTaskStatus | null {
    switch (current) {
        case 'pending': return 'in_progress';
        case 'in_progress': return 'completed';
        case 'completed': return null; // Reopen requires explicit action
        default: return null;
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
    onCreateTask,
}) => {
    // === Quick-create ===
    const [quickTitle, setQuickTitle] = useState('');
    const quickInputRef = useRef<HTMLInputElement>(null);

    const handleQuickCreate = async () => {
        const title = quickTitle.trim();
        if (!title || !onCreateTask) return;
        setQuickTitle('');
        await onCreateTask({ title, priority: 'medium', category: 'other' });
    };

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
                {/* Action voice — dictate commands to AI */}
                <div className="task-edge-btn-wrap group/tip">
                    <button
                        className={`task-edge-btn ${isListening && voiceMode === 'action' ? 'voice-active-action' : ''}`}
                        onClick={() => {
                            if (isListening && voiceMode === 'action') { stopVoice(); }
                            else { if (isListening) stopVoice(); startVoice('action'); }
                        }}
                        aria-label={isListening && voiceMode === 'action' ? 'Stop dictation' : 'Voice command — speak to the AI'}
                    >
                        {isListening && voiceMode === 'action' ? (
                            <div className="sidebar-voice-wave"><span /><span /><span /></div>
                        ) : (
                            <Mic size={14} />
                        )}
                    </button>
                    <span className="task-edge-tooltip group-hover/tip:opacity-100">
                        {isListening && voiceMode === 'action' ? 'Stop' : 'Voice command'}
                    </span>
                </div>

                {/* Ambient voice — listen and auto-create tasks */}
                <div className="task-edge-btn-wrap group/tip">
                    <button
                        className={`task-edge-btn ${isListening && voiceMode === 'ambient' ? 'voice-active-ambient' : ''}`}
                        onClick={() => {
                            if (isListening && voiceMode === 'ambient') { stopVoice(); }
                            else { if (isListening) stopVoice(); startVoice('ambient'); }
                        }}
                        aria-label={isListening && voiceMode === 'ambient' ? 'Stop ambient listening' : 'Ambient mode — auto-create tasks from speech'}
                    >
                        {isListening && voiceMode === 'ambient' ? (
                            <div className="sidebar-ambient-dots"><span /><span /><span /></div>
                        ) : (
                            <Radio size={14} />
                        )}
                    </button>
                    <span className="task-edge-tooltip group-hover/tip:opacity-100">
                        {isListening && voiceMode === 'ambient' ? 'Stop' : 'Ambient listen'}
                    </span>
                </div>

                {/* Tasks expand */}
                <div className="task-edge-btn-wrap group/tip">
                    <button
                        className={`task-edge-btn ${isOpen ? 'active' : ''}`}
                        onClick={onToggle}
                        aria-label={`Tasks — ${pendingCount} pending`}
                    >
                        <ListTodo size={14} />
                        {pendingCount > 0 && !isOpen && (
                            <span className="task-expand-badge">{pendingCount}</span>
                        )}
                    </button>
                    <span className="task-edge-tooltip group-hover/tip:opacity-100">
                        Inbox
                    </span>
                </div>
            </div>

            {/* Click-away overlay */}
            {isOpen && (
                <div className="task-panel-overlay" onClick={onToggle} />
            )}

            <div className={`task-panel ${isOpen ? 'open' : 'closed'}`}>
                {isOpen && (
                    <button
                        className="task-panel-grip"
                        onClick={onToggle}
                        title="Collapse panel"
                    >
                        <ChevronLeft size={12} />
                    </button>
                )}

                {isOpen && (
                    <div className="task-panel-content">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-[#1A1A1A]">Inbox</h3>
                                {pendingCount > 0 && (
                                    <span className="text-xs bg-[#3BB570]/10 text-[#3BB570] px-1.5 py-0.5 rounded-full font-medium">
                                        {pendingCount}
                                    </span>
                                )}
                            </div>
                            {onViewAll && (
                                <button
                                    onClick={onViewAll}
                                    className="text-xs text-[#3BB570] hover:text-[#2a8f56] transition-colors font-medium"
                                >
                                    All tasks
                                </button>
                            )}
                        </div>

                        {/* Task list */}
                        {visible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 px-2">
                                <ListTodo size={22} className="mb-2 text-[#C0C0C0]" />
                                <p className="text-xs font-medium text-[#959595] mb-1">No tasks yet</p>
                                <p className="text-[11px] text-[#C0C0C0] text-center leading-relaxed">
                                    Tap <Mic size={10} className="inline text-[#959595] -mt-0.5" /> to dictate a command or <Radio size={10} className="inline text-[#959595] -mt-0.5" /> to auto-capture tasks from conversation
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-0.5">
                                {visible.map(task => (
                                    <div
                                        key={task.id}
                                        className={`group flex items-start gap-2 px-2 py-2 rounded-md transition-colors hover:bg-[#F1F1F1] ${
                                            task.status === 'completed' ? 'opacity-50' : ''
                                        }`}
                                    >
                                        {/* Status toggle */}
                                        <button
                                            onClick={() => {
                                                const next = nextStatus(task.status);
                                                if (next) onUpdateStatus(task.id, next);
                                            }}
                                            className={`flex-shrink-0 mt-0.5 transition-transform ${task.status === 'completed' ? 'cursor-default' : 'hover:scale-110'}`}
                                            title={task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In progress — click to complete' : 'To do — click to start'}
                                        >
                                            {STATUS_ICON[task.status]}
                                        </button>

                                        {/* Task info */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-tight truncate ${
                                                task.status === 'completed' ? 'line-through text-[#C0C0C0]' : 'text-[#1A1A1A]'
                                            }`}>
                                                {task.title}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} />
                                                <span className="text-xs text-[#959595] truncate">
                                                    {CATEGORY_LABEL[task.category] || task.category}{task.assignee ? ` · ${task.assignee}` : ''}
                                                </span>
                                                {task.dueDate && task.status !== 'completed' && (() => {
                                                    const due = formatSidebarDue(task.dueDate);
                                                    return (
                                                        <span className={`inline-flex items-center gap-0.5 text-[10px] ml-auto shrink-0 ${due.urgent ? 'text-[#DF5B59] font-medium' : 'text-[#C0C0C0]'}`}>
                                                            <CalendarClock size={9} />
                                                            {due.text}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Delete */}
                                        <button
                                            onClick={() => onDeleteTask(task.id)}
                                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-[#C0C0C0] hover:text-[#DF5B59] transition-all"
                                            title="Delete task"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}

                                {/* Truncation indicator */}
                                {tasks.length > 20 && (
                                    <div className="pt-2 pb-1 text-center">
                                        <button
                                            onClick={onViewAll}
                                            className="text-xs text-[#959595] hover:text-[#3BB570] transition-colors"
                                        >
                                            +{tasks.length - 20} more tasks
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Quick-create input */}
                        {onCreateTask && (
                            <div className="mt-auto pt-2 border-t border-[#F1F1F1]">
                                <div className="flex items-center gap-1.5">
                                    <Plus size={13} className="text-[#C0C0C0] shrink-0" />
                                    <input
                                        ref={quickInputRef}
                                        value={quickTitle}
                                        onChange={(e) => setQuickTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleQuickCreate();
                                            if (e.key === 'Escape') { setQuickTitle(''); quickInputRef.current?.blur(); }
                                        }}
                                        placeholder="Add a task..."
                                        className="flex-1 text-xs text-[#1A1A1A] bg-transparent placeholder:text-[#C0C0C0] focus:outline-none py-1"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};
