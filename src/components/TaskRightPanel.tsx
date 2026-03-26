import React from 'react';
import { CheckCircle2, Circle, Clock, GripVertical, ListTodo, Trash2 } from 'lucide-react';
import type { HumanTask, HumanTaskStatus } from '../types/definitions';

interface TaskRightPanelProps {
    tasks: HumanTask[];
    isOpen: boolean;
    onToggle: () => void;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => void;
    onDeleteTask: (id: string) => void;
    pendingCount: number;
    onViewAll?: () => void;
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
}) => {
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
            {/* Expand tab when closed */}
            {!isOpen && (
                <button
                    className="task-expand-tab"
                    onClick={onToggle}
                    title="Tasks"
                >
                    <ListTodo size={12} />
                    {pendingCount > 0 && (
                        <span className="task-expand-badge">{pendingCount}</span>
                    )}
                </button>
            )}

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
