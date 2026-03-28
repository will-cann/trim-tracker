import { useState, useRef, useEffect } from 'react';
import {
    ClipboardList, Thermometer, Bug, Shield, Wrench, CloudSun,
    Package, FlaskConical, Warehouse, Truck, SprayCan, GraduationCap,
    Scissors, Sprout, Leaf, Circle, Trash2, ChevronUp,
    CheckCircle2, Clock, PlayCircle, CalendarClock,
    MapPin, User, Search, MoreHorizontal, RotateCcw, Pencil, X, Check,
} from 'lucide-react';
import type { HumanTask, HumanTaskStatus, HumanTaskCategory, HumanTaskPriority } from '../types/definitions';

interface TasksPanelProps {
    tasks: HumanTask[];
    filters: { status: HumanTaskStatus | 'all'; category: HumanTaskCategory | 'all'; priority: HumanTaskPriority | 'all' };
    onSetFilters: (f: Partial<TasksPanelProps['filters']>) => void;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteTask: (id: string) => Promise<void>;
    pendingCount: number;
    loadError?: string | null;
    onRetry?: () => void;
}

const CATEGORY_CONFIG: Record<HumanTaskCategory, { icon: typeof ClipboardList; label: string; color: string; bg: string; dot: string }> = {
    drying_curing: { icon: Thermometer, label: 'Drying/Curing', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    ipm: { icon: Bug, label: 'IPM', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
    compliance: { icon: Shield, label: 'Compliance', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
    equipment: { icon: Wrench, label: 'Equipment', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-500' },
    environmental: { icon: CloudSun, label: 'Environmental', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
    packaging: { icon: Package, label: 'Packaging', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', dot: 'bg-teal-500' },
    qc_testing: { icon: FlaskConical, label: 'QC/Testing', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
    inventory: { icon: Warehouse, label: 'Inventory', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
    transportation: { icon: Truck, label: 'Transport', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', dot: 'bg-slate-500' },
    sanitation: { icon: SprayCan, label: 'Sanitation', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    training: { icon: GraduationCap, label: 'Training', color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200', dot: 'bg-pink-500' },
    trim: { icon: Scissors, label: 'Trim', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    harvest: { icon: Sprout, label: 'Harvest', color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
    cultivation: { icon: Leaf, label: 'Cultivation', color: 'text-lime-700', bg: 'bg-lime-50 border-lime-200', dot: 'bg-lime-500' },
    other: { icon: Circle, label: 'Other', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
};

const PRIORITY_CONFIG: Record<HumanTaskPriority, { label: string; color: string; dot: string }> = {
    low: { label: 'Low', color: 'text-gray-500', dot: 'bg-gray-300' },
    medium: { label: 'Medium', color: 'text-blue-600', dot: 'bg-blue-400' },
    high: { label: 'High', color: 'text-amber-600', dot: 'bg-amber-400' },
    urgent: { label: 'Urgent', color: 'text-red-600', dot: 'bg-red-500' },
};

const STATUS_OPTIONS: { value: HumanTaskStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Done' },
];

function formatCreatedDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `about ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays}d`;
}

function isOverdue(iso: string): boolean {
    return new Date(iso) < new Date();
}

const CategoryPicker = ({
    current,
    onSelect,
    onClose,
}: {
    current: HumanTaskCategory;
    onSelect: (cat: HumanTaskCategory) => void;
    onClose: () => void;
}) => {
    const categories = Object.entries(CATEGORY_CONFIG) as [HumanTaskCategory, typeof CATEGORY_CONFIG[HumanTaskCategory]][];
    return (
        <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48 max-h-72 overflow-y-auto">
            {categories.map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isActive = key === current;
                return (
                    <button
                        key={key}
                        onClick={() => { onSelect(key); onClose(); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                            isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                        } ${cfg.color}`}
                    >
                        <Icon size={14} />
                        {cfg.label}
                    </button>
                );
            })}
        </div>
    );
};

const PriorityPicker = ({
    current,
    onSelect,
    onClose,
}: {
    current: HumanTaskPriority;
    onSelect: (pri: HumanTaskPriority) => void;
    onClose: () => void;
}) => {
    const priorities = Object.entries(PRIORITY_CONFIG) as [HumanTaskPriority, typeof PRIORITY_CONFIG[HumanTaskPriority]][];
    return (
        <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
            {priorities.map(([key, cfg]) => {
                const isActive = key === current;
                return (
                    <button
                        key={key}
                        onClick={() => { onSelect(key); onClose(); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                            isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                        } ${cfg.color}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                    </button>
                );
            })}
        </div>
    );
};

const TaskEditForm = ({
    task,
    onUpdateTask,
    onClose,
}: {
    task: HumanTask;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onClose: () => void;
}) => {
    const [draft, setDraft] = useState({
        title: task.title,
        description: task.description || '',
        assignee: task.assignee || '',
        location: task.location || '',
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        priority: task.priority,
        category: task.category,
    });
    const [saving, setSaving] = useState(false);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showPriorityPicker, setShowPriorityPicker] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    const handleSave = async () => {
        if (!draft.title.trim()) return;
        setSaving(true);
        try {
            const updates: Partial<HumanTask> = {};
            if (draft.title !== task.title) updates.title = draft.title.trim();
            if (draft.description !== (task.description || '')) updates.description = draft.description.trim() || undefined;
            if (draft.assignee !== (task.assignee || '')) updates.assignee = draft.assignee.trim() || undefined;
            if (draft.location !== (task.location || '')) updates.location = draft.location.trim() || undefined;
            if (draft.dueDate !== (task.dueDate ? task.dueDate.slice(0, 10) : '')) updates.dueDate = draft.dueDate || undefined;
            if (draft.priority !== task.priority) updates.priority = draft.priority;
            if (draft.category !== task.category) updates.category = draft.category;

            if (Object.keys(updates).length > 0) {
                await onUpdateTask(task.id, updates);
            }
            onClose();
        } catch {
            // Allow retry — form stays open
        } finally {
            setSaving(false);
        }
    };

    const catCfg = CATEGORY_CONFIG[draft.category] || CATEGORY_CONFIG.other;
    const priCfg = PRIORITY_CONFIG[draft.priority];
    const CatIcon = catCfg.icon;

    return (
        <tr className="border-b border-gray-200 bg-gray-50/70">
            <td colSpan={7} className="px-5 py-4 pl-14">
                <div className="space-y-3 max-w-2xl">
                    {/* Title */}
                    <input
                        ref={titleRef}
                        value={draft.title}
                        onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
                        placeholder="Task title"
                        className="w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
                    />

                    {/* Description */}
                    <textarea
                        value={draft.description}
                        onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 resize-none"
                        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
                    />

                    {/* Inline fields row */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Assignee */}
                        <div className="flex items-center gap-1.5 min-w-[140px]">
                            <User size={13} className="text-gray-400 shrink-0" />
                            <input
                                value={draft.assignee}
                                onChange={(e) => setDraft(d => ({ ...d, assignee: e.target.value }))}
                                placeholder="Assignee"
                                className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
                            />
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-1.5 min-w-[140px]">
                            <MapPin size={13} className="text-gray-400 shrink-0" />
                            <input
                                value={draft.location}
                                onChange={(e) => setDraft(d => ({ ...d, location: e.target.value }))}
                                placeholder="Location"
                                className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
                            />
                        </div>

                        {/* Due date */}
                        <div className="flex items-center gap-1.5">
                            <CalendarClock size={13} className="text-gray-400 shrink-0" />
                            <input
                                type="date"
                                value={draft.dueDate}
                                onChange={(e) => setDraft(d => ({ ...d, dueDate: e.target.value }))}
                                className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            />
                        </div>

                        {/* Priority picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all ${priCfg.color}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
                                {priCfg.label}
                            </button>
                            {showPriorityPicker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowPriorityPicker(false)} />
                                    <PriorityPicker
                                        current={draft.priority}
                                        onSelect={(pri) => setDraft(d => ({ ...d, priority: pri }))}
                                        onClose={() => setShowPriorityPicker(false)}
                                    />
                                </>
                            )}
                        </div>

                        {/* Category picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all ${catCfg.bg} ${catCfg.color}`}
                            >
                                <CatIcon size={12} />
                                {catCfg.label}
                            </button>
                            {showCategoryPicker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowCategoryPicker(false)} />
                                    <CategoryPicker
                                        current={draft.category}
                                        onSelect={(cat) => setDraft(d => ({ ...d, category: cat }))}
                                        onClose={() => setShowCategoryPicker(false)}
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleSave}
                            disabled={saving || !draft.title.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-md transition-colors"
                        >
                            <Check size={13} />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            <X size={13} />
                            Cancel
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    );
};

const TaskRow = ({
    task,
    onUpdateStatus,
    onUpdateTask,
    onDeleteTask,
    expanded,
    onToggleExpand,
    editing,
    onStartEdit,
    onStopEdit,
}: {
    task: HumanTask;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteTask: (id: string) => Promise<void>;
    expanded: boolean;
    onToggleExpand: () => void;
    editing: boolean;
    onStartEdit: () => void;
    onStopEdit: () => void;
}) => {
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const cat = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.other;
    const pri = PRIORITY_CONFIG[task.priority];
    const CatIcon = cat.icon;
    const isComplete = task.status === 'completed';

    const cycleStatus = () => {
        if (task.status === 'pending') onUpdateStatus(task.id, 'in_progress');
        else if (task.status === 'in_progress') onUpdateStatus(task.id, 'completed');
        else onUpdateStatus(task.id, 'pending');
    };

    const statusIcon = () => {
        if (isComplete) return <CheckCircle2 size={18} className="text-emerald-500" />;
        if (task.status === 'in_progress') return <PlayCircle size={18} className="text-blue-500" />;
        return <Circle size={18} className="text-gray-300" />;
    };

    return (
        <>
            <tr className={`group border-b border-gray-100 hover:bg-gray-50/60 transition-colors ${isComplete ? 'opacity-60' : ''}`}>
                {/* Status checkbox */}
                <td className="pl-5 pr-2 py-3 w-10">
                    <button onClick={cycleStatus} className="hover:scale-110 transition-transform">
                        {statusIcon()}
                    </button>
                </td>

                {/* Task title — double-click to edit */}
                <td className="px-3 py-3" onDoubleClick={onStartEdit}>
                    <div className="flex items-start gap-2">
                        <div className="min-w-0">
                            <p className={`text-sm leading-snug ${isComplete ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {task.title}
                            </p>
                            {task.dueDate && (
                                <span className={`text-[11px] mt-0.5 inline-flex items-center gap-1 ${
                                    isOverdue(task.dueDate) && !isComplete ? 'text-red-500 font-medium' : 'text-gray-400'
                                }`}>
                                    <CalendarClock size={10} />
                                    {formatDueDate(task.dueDate)}
                                </span>
                            )}
                        </div>
                    </div>
                </td>

                {/* Assignee / Location */}
                <td className="px-3 py-3 hidden md:table-cell">
                    {(task.assignee || task.location) ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            {task.assignee && (
                                <span className="flex items-center gap-1">
                                    <User size={12} className="text-gray-400" />
                                    {task.assignee}
                                </span>
                            )}
                            {task.assignee && task.location && <span className="text-gray-300">·</span>}
                            {task.location && (
                                <span className="flex items-center gap-1 text-gray-400">
                                    <MapPin size={11} />
                                    {task.location}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-sm text-gray-300">—</span>
                    )}
                </td>

                {/* Category badge — click to edit */}
                <td className="px-3 py-3 hidden sm:table-cell">
                    <div className="relative">
                        <button
                            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all ${cat.bg} ${cat.color}`}
                        >
                            <CatIcon size={12} />
                            {cat.label}
                        </button>
                        {showCategoryPicker && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowCategoryPicker(false)} />
                                <CategoryPicker
                                    current={task.category}
                                    onSelect={(newCat) => onUpdateTask(task.id, { category: newCat })}
                                    onClose={() => setShowCategoryPicker(false)}
                                />
                            </>
                        )}
                    </div>
                </td>

                {/* Priority */}
                <td className="px-3 py-3 hidden lg:table-cell">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${pri.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                        {pri.label}
                    </span>
                </td>

                {/* Created */}
                <td className="px-3 py-3 hidden lg:table-cell">
                    <span className="text-sm text-gray-400">{formatCreatedDate(task.createdAt)}</span>
                </td>

                {/* Actions */}
                <td className="pr-4 pl-2 py-3 w-10">
                    <div className="relative">
                        <button
                            onClick={onToggleExpand}
                            className="p-1 text-gray-300 hover:text-gray-500 transition-colors rounded hover:bg-gray-100"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        {expanded && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={onToggleExpand} />
                                <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
                                    <button
                                        onClick={() => { onStartEdit(); onToggleExpand(); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Pencil size={14} />
                                        Edit
                                    </button>
                                    {task.status !== 'completed' && (
                                        <button
                                            onClick={() => { onUpdateStatus(task.id, task.status === 'pending' ? 'in_progress' : 'completed'); onToggleExpand(); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            {task.status === 'pending' ? <PlayCircle size={14} /> : <CheckCircle2 size={14} />}
                                            {task.status === 'pending' ? 'Start' : 'Complete'}
                                        </button>
                                    )}
                                    {task.status === 'completed' && (
                                        <button
                                            onClick={() => { onUpdateStatus(task.id, 'pending'); onToggleExpand(); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            <RotateCcw size={14} />
                                            Reopen
                                        </button>
                                    )}
                                    <hr className="my-1 border-gray-100" />
                                    <button
                                        onClick={() => { onDeleteTask(task.id); onToggleExpand(); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 size={14} />
                                        Delete
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </td>
            </tr>
            {/* Edit form row */}
            {editing && (
                <TaskEditForm
                    task={task}
                    onUpdateTask={onUpdateTask}
                    onClose={onStopEdit}
                />
            )}
            {/* Description row (only when not editing) */}
            {!editing && task.description && expanded && (
                <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td colSpan={7} className="px-5 py-2.5 pl-14">
                        <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
                    </td>
                </tr>
            )}
        </>
    );
};

export const TasksPanel = ({
    tasks,
    filters,
    onSetFilters,
    onUpdateStatus,
    onUpdateTask,
    onDeleteTask,
    pendingCount,
    loadError,
    onRetry,
}: TasksPanelProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const activeCategories = [...new Set(tasks.map(t => t.category))];
    const hasActiveFilters = filters.status !== 'all' || filters.category !== 'all' || filters.priority !== 'all';

    const filteredTasks = tasks.filter(t => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!t.title.toLowerCase().includes(q) && !t.assignee?.toLowerCase().includes(q) && !t.location?.toLowerCase().includes(q)) {
                return false;
            }
        }
        return true;
    });

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-6 pt-6 pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
                        <p className="text-sm text-gray-400 mt-0.5">
                            {pendingCount > 0
                                ? `${pendingCount} incomplete task${pendingCount !== 1 ? 's' : ''}`
                                : 'No pending tasks'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Load error banner */}
            {loadError && (
                <div className="mx-6 mt-2 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <span className="flex-1">Failed to load tasks: {loadError}</span>
                    {onRetry && (
                        <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 rounded-md font-medium transition-colors">
                            <RotateCcw size={13} />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {/* Search + Filters bar */}
            <div className="px-6 py-3 flex items-center gap-3 flex-wrap border-b border-gray-100">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-md">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for a task or assignee"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
                    />
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <Clock size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-500">Status</span>
                    <select
                        value={filters.status}
                        onChange={(e) => onSetFilters({ status: e.target.value as HumanTaskStatus | 'all' })}
                        className="text-xs font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer pr-1"
                    >
                        {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <ClipboardList size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-500">Category</span>
                    <select
                        value={filters.category}
                        onChange={(e) => onSetFilters({ category: e.target.value as HumanTaskCategory | 'all' })}
                        className="text-xs font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer pr-1"
                    >
                        <option value="all">All</option>
                        {activeCategories.map(key => (
                            <option key={key} value={key}>{CATEGORY_CONFIG[key].label}</option>
                        ))}
                    </select>
                </div>

                {/* Priority filter */}
                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <ChevronUp size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-500">Priority</span>
                    <select
                        value={filters.priority}
                        onChange={(e) => onSetFilters({ priority: e.target.value as HumanTaskPriority | 'all' })}
                        className="text-xs font-semibold text-gray-800 bg-transparent border-none outline-none cursor-pointer pr-1"
                    >
                        <option value="all">All</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>

                {/* Reset */}
                {hasActiveFilters && (
                    <button
                        onClick={() => onSetFilters({ status: 'all', category: 'all', priority: 'all' })}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1.5"
                    >
                        <RotateCcw size={12} />
                        Reset filters
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
                {filteredTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mb-4 shadow-sm">
                            <ClipboardList size={28} className="text-gray-300" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-600 mb-1">
                            {searchQuery ? 'No matching tasks' : 'No tasks yet'}
                        </h3>
                        <p className="text-sm text-gray-400 max-w-xs">
                            {searchQuery
                                ? 'Try a different search term or reset your filters above.'
                                : 'Tell the AI things like "remind me to check humidity" or "schedule a trim for Friday" to create tasks.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 text-left">
                                <th className="pl-5 pr-2 py-3 w-10" />
                                <th className="px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Task title</th>
                                <th className="px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Assignee</th>
                                <th className="px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Category</th>
                                <th className="px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">Priority</th>
                                <th className="px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
                                <th className="pr-4 pl-2 py-3 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    onUpdateStatus={onUpdateStatus}
                                    onUpdateTask={onUpdateTask}
                                    onDeleteTask={onDeleteTask}
                                    expanded={expandedId === task.id}
                                    onToggleExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
                                    editing={editingId === task.id}
                                    onStartEdit={() => { setEditingId(task.id); setExpandedId(null); }}
                                    onStopEdit={() => setEditingId(null)}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
