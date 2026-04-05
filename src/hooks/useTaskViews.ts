import { useState, useCallback, useEffect, useRef } from 'react';
import type { TaskViewSpec, SavedTaskView } from '../types/definitions';
import { apiService } from '../services/apiService';

export type BuiltInViewId = '__all_tasks__' | '__my_tasks__';

export interface TaskView {
    id: string | BuiltInViewId;
    title: string;
    spec: TaskViewSpec;
    isBuiltIn: boolean;
}

const ALL_TASKS_SPEC: TaskViewSpec = {
    filters: { status: 'all', category: 'all', priority: 'all', assignees: 'all' },
    sortField: null,
    sortDir: 'asc',
    viewMode: 'cards',
};

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
}

export function isSpecEqual(a: TaskViewSpec, b: TaskViewSpec): boolean {
    // filters.status
    if (a.filters.status === 'all' && b.filters.status !== 'all') return false;
    if (a.filters.status !== 'all' && b.filters.status === 'all') return false;
    if (a.filters.status !== 'all' && b.filters.status !== 'all') {
        if (!arraysEqual(a.filters.status, b.filters.status)) return false;
    }
    // filters.category
    if (a.filters.category !== b.filters.category) return false;
    // filters.priority
    if (a.filters.priority !== b.filters.priority) return false;
    // filters.assignees
    if (a.filters.assignees === 'all' && b.filters.assignees !== 'all') return false;
    if (a.filters.assignees !== 'all' && b.filters.assignees === 'all') return false;
    if (a.filters.assignees !== 'all' && b.filters.assignees !== 'all') {
        if (!arraysEqual(a.filters.assignees, b.filters.assignees)) return false;
    }
    // sort + viewMode
    if (a.sortField !== b.sortField) return false;
    if (a.sortDir !== b.sortDir) return false;
    if (a.viewMode !== b.viewMode) return false;
    return true;
}

interface UseTaskViewsParams {
    currentUserName?: string;
}

interface UseTaskViewsReturn {
    views: TaskView[];
    activeViewId: string;
    applyView: (id: string) => TaskViewSpec;
    saveCurrentAsView: (title: string, spec: TaskViewSpec) => Promise<void>;
    updateView: (id: string, spec: TaskViewSpec) => Promise<void>;
    deleteView: (id: string) => Promise<void>;
    isModified: (currentSpec: TaskViewSpec) => boolean;
    isLoading: boolean;
}

export const useTaskViews = ({ currentUserName }: UseTaskViewsParams): UseTaskViewsReturn => {
    const [savedViews, setSavedViews] = useState<SavedTaskView[]>([]);
    const [activeViewId, setActiveViewId] = useState<string>('__my_tasks__');
    const [isLoading, setIsLoading] = useState(true);
    const loadedRef = useRef(false);

    // Load saved views from API
    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        (async () => {
            try {
                const data = await apiService.getSavedTaskViews();
                setSavedViews(data);
            } catch (err) {
                console.error('[useTaskViews] Failed to load saved views:', err);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    // Build "My Tasks" spec dynamically based on current user
    const myTasksSpec: TaskViewSpec = {
        filters: {
            status: 'all',
            category: 'all',
            priority: 'all',
            assignees: currentUserName ? [currentUserName] : 'all',
        },
        sortField: null,
        sortDir: 'asc',
        viewMode: 'cards',
    };

    // Construct full views list: built-ins first, then saved
    const views: TaskView[] = [
        { id: '__all_tasks__', title: 'All Tasks', spec: ALL_TASKS_SPEC, isBuiltIn: true },
        { id: '__my_tasks__', title: 'My Tasks', spec: myTasksSpec, isBuiltIn: true },
        ...savedViews.map(sv => ({
            id: sv.id,
            title: sv.title,
            spec: sv.spec,
            isBuiltIn: false,
        })),
    ];

    const getViewSpec = useCallback((viewId: string): TaskViewSpec => {
        if (viewId === '__all_tasks__') return ALL_TASKS_SPEC;
        if (viewId === '__my_tasks__') return myTasksSpec;
        const saved = savedViews.find(v => v.id === viewId);
        return saved?.spec ?? ALL_TASKS_SPEC;
    }, [savedViews, myTasksSpec]);

    const applyView = useCallback((viewId: string): TaskViewSpec => {
        setActiveViewId(viewId);
        return getViewSpec(viewId);
    }, [getViewSpec]);

    const saveCurrentAsView = useCallback(async (title: string, spec: TaskViewSpec) => {
        const saved = await apiService.saveTaskView({ title, spec });
        setSavedViews(prev => [saved, ...prev]);
        setActiveViewId(saved.id);
    }, []);

    const updateView = useCallback(async (id: string, spec: TaskViewSpec) => {
        const existing = savedViews.find(v => v.id === id);
        if (!existing) return;
        const updated = await apiService.saveTaskView({ id, title: existing.title, spec });
        setSavedViews(prev => prev.map(v => v.id === id ? updated : v));
    }, [savedViews]);

    const deleteView = useCallback(async (id: string) => {
        await apiService.deleteTaskView(id);
        setSavedViews(prev => prev.filter(v => v.id !== id));
        if (activeViewId === id) {
            setActiveViewId('__my_tasks__');
        }
    }, [activeViewId]);

    const isModified = useCallback((currentSpec: TaskViewSpec): boolean => {
        const activeSpec = getViewSpec(activeViewId);
        return !isSpecEqual(currentSpec, activeSpec);
    }, [activeViewId, getViewSpec]);

    return {
        views,
        activeViewId,
        applyView,
        saveCurrentAsView,
        updateView,
        deleteView,
        isModified,
        isLoading,
    };
};
