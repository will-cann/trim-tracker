import { Check, Loader2, ListChecks, Trash2 } from 'lucide-react';
import type { Task } from '../types/definitions';
import { TaskItem } from './TaskItem';

interface TaskListProps {
    tasks: Task[];
    onExecuteTask: (id: string) => void;
    onExecuteAll: () => void;
    onSkipTask: (id: string) => void;
    onRemoveTask: (id: string) => void;
    onEditTaskAction: (id: string, data: Record<string, string | number | boolean>) => void;
    onClearCompleted: () => void;
    onClearAll: () => void;
    pendingCount: number;
    completedCount: number;
    isExecuting: boolean;
}

export const TaskList = ({
    tasks,
    onExecuteTask,
    onExecuteAll,
    onSkipTask,
    onRemoveTask,
    onEditTaskAction,
    onClearCompleted,
    onClearAll,
    pendingCount,
    completedCount,
    isExecuting,
}: TaskListProps) => {
    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <ListChecks size={32} className="mb-2" />
                <p className="text-sm">No tasks yet</p>
                <p className="text-xs mt-1">Speak or type to create tasks</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-1 pb-3">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-700">Tasks</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        {pendingCount > 0 && (
                            <span>{pendingCount} pending</span>
                        )}
                        {completedCount > 0 && (
                            <span className="text-emerald-600">{completedCount} done</span>
                        )}
                    </div>
                </div>
                {completedCount > 0 && (
                    <button
                        onClick={onClearCompleted}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Clear done
                    </button>
                )}
            </div>

            {/* Task items */}
            <div className="flex-1 overflow-y-auto space-y-2">
                {tasks.map(task => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        onExecute={onExecuteTask}
                        onSkip={onSkipTask}
                        onRemove={onRemoveTask}
                        onEditAction={onEditTaskAction}
                    />
                ))}
            </div>

            {/* Bottom actions */}
            {pendingCount > 0 && (
                <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100">
                    <button
                        onClick={onExecuteAll}
                        disabled={isExecuting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                                   bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Executing...
                            </>
                        ) : (
                            <>
                                <Check size={14} />
                                Execute All ({pendingCount})
                            </>
                        )}
                    </button>
                    <button
                        onClick={onClearAll}
                        disabled={isExecuting}
                        className="px-3 py-2.5 rounded-lg border border-gray-200 text-gray-500 text-sm
                                   hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        title="Clear all tasks"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};
