import { useState, useCallback, useEffect } from 'react';
import type { HumanTask, HumanTaskStatus, HumanTaskCategory, HumanTaskPriority } from '../types/definitions';
import { chatDb } from '../services/chatDb';

interface Filters {
    status: HumanTaskStatus | 'all';
    category: HumanTaskCategory | 'all';
    priority: HumanTaskPriority | 'all';
}

interface UseHumanTasksReturn {
    tasks: HumanTask[];
    filters: Filters;
    setFilters: (f: Partial<Filters>) => void;
    addHumanTask: (task: Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => Promise<HumanTask>;
    addHumanTasks: (tasks: Array<Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>>) => Promise<HumanTask[]>;
    updateTaskStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    updateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
    pendingCount: number;
    isLoaded: boolean;
}

export const useHumanTasks = (): UseHumanTasksReturn => {
    const [tasks, setTasks] = useState<HumanTask[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [filters, setFiltersState] = useState<Filters>({
        status: 'all',
        category: 'all',
        priority: 'all',
    });

    // Load all tasks from Dexie
    const reload = useCallback(async () => {
        try {
            const all = await chatDb.humanTasks.orderBy('createdAt').reverse().toArray();
            setTasks(all);
            setIsLoaded(true);
        } catch {
            setIsLoaded(true);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const setFilters = useCallback((partial: Partial<Filters>) => {
        setFiltersState(prev => ({ ...prev, ...partial }));
    }, []);

    const addHumanTask = useCallback(async (
        input: Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>
    ): Promise<HumanTask> => {
        const now = new Date().toISOString();
        const task: HumanTask = {
            ...input,
            id: crypto.randomUUID(),
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        await chatDb.humanTasks.add(task);
        setTasks(prev => [task, ...prev]);
        return task;
    }, []);

    const addHumanTasks = useCallback(async (
        inputs: Array<Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>>
    ): Promise<HumanTask[]> => {
        const now = new Date().toISOString();
        const newTasks = inputs.map(input => ({
            ...input,
            id: crypto.randomUUID(),
            status: 'pending' as const,
            createdAt: now,
            updatedAt: now,
        }));
        await chatDb.humanTasks.bulkAdd(newTasks);
        setTasks(prev => [...newTasks, ...prev]);
        return newTasks;
    }, []);

    const updateTaskStatus = useCallback(async (id: string, status: HumanTaskStatus) => {
        const now = new Date().toISOString();
        const updates: Partial<HumanTask> = { status, updatedAt: now };
        if (status === 'completed') updates.completedAt = now;
        await chatDb.humanTasks.update(id, updates);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }, []);

    const updateTask = useCallback(async (id: string, updates: Partial<HumanTask>) => {
        const withTimestamp = { ...updates, updatedAt: new Date().toISOString() };
        await chatDb.humanTasks.update(id, withTimestamp);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...withTimestamp } : t));
    }, []);

    const deleteTask = useCallback(async (id: string) => {
        await chatDb.humanTasks.delete(id);
        setTasks(prev => prev.filter(t => t.id !== id));
    }, []);

    // Apply filters
    const filtered = tasks.filter(t => {
        if (filters.status !== 'all' && t.status !== filters.status) return false;
        if (filters.category !== 'all' && t.category !== filters.category) return false;
        if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
        return true;
    });

    const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

    return {
        tasks: filtered,
        filters,
        setFilters,
        addHumanTask,
        addHumanTasks,
        updateTaskStatus,
        updateTask,
        deleteTask,
        pendingCount,
        isLoaded,
    };
};
