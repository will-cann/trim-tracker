import { useState } from 'react';
import {
    ClipboardList, Thermometer, Bug, Shield, Wrench, CloudSun,
    Package, FlaskConical, Warehouse, Truck, SprayCan, GraduationCap,
    Scissors, Sprout, Circle, Trash2, ChevronUp,
    CheckCircle2, Clock, PlayCircle, CalendarClock,
    MapPin, User, Search, MoreHorizontal, RotateCcw,
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

const TaskRow = ({
    task,
    onUpdateStatus,
    onUpdateTask,
    onDeleteTask,
    expanded,
    onToggleExpand,
}: {
    task: HumanTask;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteTask: (id: string) => Promise<void>;
    expanded: boolean;
    onToggleExpand: () => void;
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

                {/* Task title */}
                <td className="px-3 py-3">
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
                            <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
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
                                <button
                                    onClick={() => { onDeleteTask(task.id); onToggleExpand(); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </td>
            </tr>
            {/* Description row */}
            {task.description && expanded && (
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
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                            <ClipboardList size={28} className="text-gray-300" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">
                            {searchQuery ? 'No matching tasks' : 'No tasks yet'}
                        </h3>
                        <p className="text-xs text-gray-400 max-w-xs">
                            {searchQuery
                                ? 'Try adjusting your search or filters'
                                : 'Tasks will appear here when you describe operational work to the AI assistant'}
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
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
