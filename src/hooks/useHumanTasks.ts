import { useState, useCallback, useEffect } from 'react';
import type { HumanTask, HumanTaskStatus, HumanTaskCategory, HumanTaskPriority } from '../types/definitions';
import { apiService } from '../services/apiService';

interface Filters {
    status: HumanTaskStatus[] | 'all';
    category: HumanTaskCategory | 'all';
    priority: HumanTaskPriority | 'all';
    assignees: string[] | 'all';
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
    loadError: string | null;
    retry: () => void;
}

export const useHumanTasks = (): UseHumanTasksReturn => {
    const [tasks, setTasks] = useState<HumanTask[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filters, setFiltersState] = useState<Filters>({
        status: 'all',
        category: 'all',
        priority: 'all',
        assignees: 'all',
    });

    // Load all tasks from server
    const reload = useCallback(async () => {
        setLoadError(null);
        try {
            const all = await apiService.getTasks();
            setTasks(all);
            setIsLoaded(true);
        } catch (err) {
            console.error('[useHumanTasks] Failed to load tasks:', err);
            setLoadError(err instanceof Error ? err.message : 'Failed to load tasks');
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
        const task = await apiService.createTask(input);
        setTasks(prev => [task, ...prev]);
        return task;
    }, []);

    const addHumanTasks = useCallback(async (
        inputs: Array<Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>>
    ): Promise<HumanTask[]> => {
        const newTasks = await apiService.createTasks(inputs);
        setTasks(prev => [...newTasks, ...prev]);
        return newTasks;
    }, []);

    const updateTaskStatus = useCallback(async (id: string, status: HumanTaskStatus) => {
        try {
            const updated = await apiService.updateTask(id, { status });
            setTasks(prev => prev.map(t => t.id === id ? updated : t));
        } catch (error) {
            // Offline / failed — show error, don't update local state
            throw error;
        }
    }, []);

    const updateTask = useCallback(async (id: string, updates: Partial<HumanTask>) => {
        try {
            const updated = await apiService.updateTask(id, updates);
            setTasks(prev => prev.map(t => t.id === id ? updated : t));
        } catch (error) {
            throw error;
        }
    }, []);

    const deleteTask = useCallback(async (id: string) => {
        try {
            await apiService.deleteTask(id);
            setTasks(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            throw error;
        }
    }, []);

    // Apply filters client-side
    const filtered = tasks.filter(t => {
        if (filters.status !== 'all' && !filters.status.includes(t.status)) return false;
        if (filters.category !== 'all' && t.category !== filters.category) return false;
        if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
        if (filters.assignees !== 'all') {
            const name = t.assignee || '';
            if (!filters.assignees.includes(name)) return false;
        }
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
        loadError,
        retry: reload,
    };
};
