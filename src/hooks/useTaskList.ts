import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task, ProposedAction, SpeechMode, TaskStatus } from '../types/definitions';
import { executeAction } from '../services/actionExecutor';
import { chatDb } from '../services/chatDb';

interface UseTaskListOptions {
    conversationId?: string | null;
    onSessionUpdate?: () => Promise<void>;
}

interface UseTaskListReturn {
    tasks: Task[];
    addTask: (action: ProposedAction, source: SpeechMode, sourceText: string) => Task;
    addTasks: (actions: ProposedAction[], source: SpeechMode, sourceText: string) => Task[];
    updateTask: (id: string, updates: Partial<Task>) => void;
    editTaskAction: (id: string, data: Record<string, string | number | boolean>) => void;
    removeTask: (id: string) => void;
    reorderTasks: (fromIndex: number, toIndex: number) => void;
    executeTask: (id: string) => Promise<void>;
    executeAll: () => Promise<void>;
    skipTask: (id: string) => void;
    clearCompleted: () => void;
    clearAll: () => void;
    pendingCount: number;
    completedCount: number;
    isExecuting: boolean;
}

export const useTaskList = ({
    conversationId,
    onSessionUpdate,
}: UseTaskListOptions = {}): UseTaskListReturn => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const conversationIdRef = useRef(conversationId);
    useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

    // Load tasks from Dexie when conversationId changes
    useEffect(() => {
        let cancelled = false;
        if (!conversationId) {
            // Use a microtask to clear tasks asynchronously (satisfies lint rule)
            Promise.resolve().then(() => { if (!cancelled) setTasks([]); });
            return () => { cancelled = true; };
        }
        chatDb.tasks
            .where('conversationId')
            .equals(conversationId)
            .sortBy('createdAt')
            .then(records => {
                if (!cancelled) setTasks(records.map(r => r.task));
            })
            .catch(() => {
                // Table may not exist yet on first run
            });
        return () => { cancelled = true; };
    }, [conversationId]);

    // Persist tasks to Dexie
    const persistTask = useCallback(async (task: Task) => {
        const cId = conversationIdRef.current;
        if (!cId) return;
        const now = new Date().toISOString();
        await chatDb.tasks.put({
            id: task.id,
            conversationId: cId,
            task,
            createdAt: task.createdAt,
            updatedAt: now,
        });
    }, []);

    const persistRemove = useCallback(async (taskId: string) => {
        await chatDb.tasks.delete(taskId);
    }, []);

    const addTask = useCallback((action: ProposedAction, source: SpeechMode, sourceText: string): Task => {
        const task: Task = {
            id: crypto.randomUUID(),
            action,
            status: 'pending',
            source,
            sourceText,
            createdAt: new Date().toISOString(),
        };
        setTasks(prev => [...prev, task]);
        persistTask(task);
        return task;
    }, [persistTask]);

    const addTasks = useCallback((actions: ProposedAction[], source: SpeechMode, sourceText: string): Task[] => {
        const newTasks = actions.map(action => ({
            id: crypto.randomUUID(),
            action,
            status: 'pending' as TaskStatus,
            source,
            sourceText,
            createdAt: new Date().toISOString(),
        }));
        setTasks(prev => [...prev, ...newTasks]);
        newTasks.forEach(t => persistTask(t));
        return newTasks;
    }, [persistTask]);

    const updateTask = useCallback((id: string, updates: Partial<Task>) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const updated = { ...t, ...updates };
            persistTask(updated);
            return updated;
        }));
    }, [persistTask]);

    const editTaskAction = useCallback((id: string, data: Record<string, string | number | boolean>) => {
        setTasks(prev => prev.map(t => {
            if (t.id !== id) return t;
            const updated: Task = {
                ...t,
                status: 'edited',
                action: { ...t.action, data: { ...t.action.data, ...data } },
            };
            persistTask(updated);
            return updated;
        }));
    }, [persistTask]);

    const removeTask = useCallback((id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        persistRemove(id);
    }, [persistRemove]);

    const reorderTasks = useCallback((fromIndex: number, toIndex: number) => {
        setTasks(prev => {
            const updated = [...prev];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            return updated;
        });
    }, []);

    const executeTask = useCallback(async (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task || task.status === 'completed' || task.status === 'executing') return;

        updateTask(id, { status: 'executing' });
        try {
            await executeAction(task.action);
            updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });
            await onSessionUpdate?.();
        } catch (error) {
            updateTask(id, {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }, [tasks, updateTask, onSessionUpdate]);

    const executeAll = useCallback(async () => {
        setIsExecuting(true);
        const pending = tasks.filter(t => t.status === 'pending' || t.status === 'edited');
        for (const task of pending) {
            updateTask(task.id, { status: 'executing' });
            try {
                await executeAction(task.action);
                updateTask(task.id, { status: 'completed', completedAt: new Date().toISOString() });
            } catch (error) {
                updateTask(task.id, {
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        setIsExecuting(false);
        await onSessionUpdate?.();
    }, [tasks, updateTask, onSessionUpdate]);

    const skipTask = useCallback((id: string) => {
        updateTask(id, { status: 'skipped' });
    }, [updateTask]);

    const clearCompleted = useCallback(() => {
        const completed = tasks.filter(t => t.status === 'completed' || t.status === 'skipped');
        completed.forEach(t => persistRemove(t.id));
        setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'skipped'));
    }, [tasks, persistRemove]);

    const clearAll = useCallback(() => {
        tasks.forEach(t => persistRemove(t.id));
        setTasks([]);
    }, [tasks, persistRemove]);

    const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'edited').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;

    return {
        tasks,
        addTask,
        addTasks,
        updateTask,
        editTaskAction,
        removeTask,
        reorderTasks,
        executeTask,
        executeAll,
        skipTask,
        clearCompleted,
        clearAll,
        pendingCount,
        completedCount,
        isExecuting,
    };
};
