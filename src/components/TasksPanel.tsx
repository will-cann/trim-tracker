import { useState } from 'react';
import {
    ClipboardList, Thermometer, Bug, Shield, Wrench, CloudSun,
    Package, FlaskConical, Warehouse, Truck, SprayCan, GraduationCap,
    Scissors, Sprout, Circle, Trash2, ChevronDown, ChevronUp,
    CheckCircle2, Clock, PlayCircle, CalendarClock,
    MapPin, User,
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
}

const CATEGORY_CONFIG: Record<HumanTaskCategory, { icon: typeof ClipboardList; label: string; color: string; bg: string }> = {
    drying_curing: { icon: Thermometer, label: 'Drying/Curing', color: 'text-amber-600', bg: 'bg-amber-50' },
    ipm: { icon: Bug, label: 'IPM', color: 'text-red-600', bg: 'bg-red-50' },
    compliance: { icon: Shield, label: 'Compliance', color: 'text-purple-600', bg: 'bg-purple-50' },
    equipment: { icon: Wrench, label: 'Equipment', color: 'text-gray-600', bg: 'bg-gray-100' },
    environmental: { icon: CloudSun, label: 'Environmental', color: 'text-blue-600', bg: 'bg-blue-50' },
    packaging: { icon: Package, label: 'Packaging', color: 'text-teal-600', bg: 'bg-teal-50' },
    qc_testing: { icon: FlaskConical, label: 'QC/Testing', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    inventory: { icon: Warehouse, label: 'Inventory', color: 'text-orange-600', bg: 'bg-orange-50' },
    transportation: { icon: Truck, label: 'Transport', color: 'text-slate-600', bg: 'bg-slate-100' },
    sanitation: { icon: SprayCan, label: 'Sanitation', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    training: { icon: GraduationCap, label: 'Training', color: 'text-pink-600', bg: 'bg-pink-50' },
    trim: { icon: Scissors, label: 'Trim', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    harvest: { icon: Sprout, label: 'Harvest', color: 'text-green-600', bg: 'bg-green-50' },
    other: { icon: Circle, label: 'Other', color: 'text-gray-500', bg: 'bg-gray-50' },
};

const PRIORITY_CONFIG: Record<HumanTaskPriority, { label: string; color: string; border: string; badge: string }> = {
    low: { label: 'Low', color: 'text-gray-500', border: 'border-l-gray-300', badge: 'bg-gray-100 text-gray-600' },
    medium: { label: 'Medium', color: 'text-blue-600', border: 'border-l-blue-400', badge: 'bg-blue-50 text-blue-600' },
    high: { label: 'High', color: 'text-amber-600', border: 'border-l-amber-400', badge: 'bg-amber-50 text-amber-600' },
    urgent: { label: 'Urgent', color: 'text-red-600', border: 'border-l-red-500', badge: 'bg-red-50 text-red-600' },
};

const STATUS_TABS: { value: HumanTaskStatus | 'all'; label: string; icon: typeof ClipboardList }[] = [
    { value: 'all', label: 'All', icon: ClipboardList },
    { value: 'pending', label: 'Pending', icon: Clock },
    { value: 'in_progress', label: 'In Progress', icon: PlayCircle },
    { value: 'completed', label: 'Completed', icon: CheckCircle2 },
];

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

const TaskCard = ({
    task,
    onUpdateStatus,
    onDeleteTask,
}: {
    task: HumanTask;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onDeleteTask: (id: string) => Promise<void>;
}) => {
    const [expanded, setExpanded] = useState(false);
    const cat = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.other;
    const pri = PRIORITY_CONFIG[task.priority];
    const CatIcon = cat.icon;

    const nextStatus = (): HumanTaskStatus | null => {
        if (task.status === 'pending') return 'in_progress';
        if (task.status === 'in_progress') return 'completed';
        return null;
    };

    const nextLabel = (): string => {
        if (task.status === 'pending') return 'Start';
        if (task.status === 'in_progress') return 'Complete';
        return '';
    };

    const next = nextStatus();

    return (
        <div className={`border-l-4 ${pri.border} bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden`}>
            <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center mt-0.5`}>
                        <CatIcon size={16} className={cat.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {task.title}
                            </h3>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pri.badge}`}>
                                {pri.label}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                                {cat.label}
                            </span>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                            {task.dueDate && (
                                <span className={`flex items-center gap-1 ${isOverdue(task.dueDate) && task.status !== 'completed' ? 'text-red-500 font-medium' : ''}`}>
                                    <CalendarClock size={11} />
                                    {formatDueDate(task.dueDate)}
                                </span>
                            )}
                            {task.assignee && (
                                <span className="flex items-center gap-1">
                                    <User size={11} />
                                    {task.assignee}
                                </span>
                            )}
                            {task.location && (
                                <span className="flex items-center gap-1">
                                    <MapPin size={11} />
                                    {task.location}
                                </span>
                            )}
                        </div>

                        {/* Expandable description */}
                        {task.description && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {expanded ? 'Hide details' : 'Show details'}
                            </button>
                        )}
                        {expanded && task.description && (
                            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                                {task.description}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {next && (
                            <button
                                onClick={() => onUpdateStatus(task.id, next)}
                                className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                                    next === 'completed'
                                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                }`}
                            >
                                {nextLabel()}
                            </button>
                        )}
                        {task.status === 'completed' && (
                            <span className="text-xs text-emerald-500 flex items-center gap-1">
                                <CheckCircle2 size={14} />
                            </span>
                        )}
                        <button
                            onClick={() => onDeleteTask(task.id)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const TasksPanel = ({
    tasks,
    filters,
    onSetFilters,
    onUpdateStatus,
    onDeleteTask,
    pendingCount,
}: TasksPanelProps) => {
    const categories = Object.entries(CATEGORY_CONFIG);
    const activeCategories = [...new Set(tasks.map(t => t.category))];

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3">
                    <ClipboardList size={24} className="text-teal-600" />
                    <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
                    {pendingCount > 0 && (
                        <span className="bg-teal-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                            {pendingCount}
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                    Tasks created by AI from your conversations and voice commands
                </p>
            </div>

            {/* Status tabs */}
            <div className="px-6 pb-3">
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    {STATUS_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = filters.status === tab.value;
                        return (
                            <button
                                key={tab.value}
                                onClick={() => onSetFilters({ status: tab.value })}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 justify-center ${
                                    isActive
                                        ? 'bg-white text-gray-800 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <Icon size={12} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Category filter chips */}
            <div className="px-6 pb-3 flex gap-1.5 flex-wrap">
                <button
                    onClick={() => onSetFilters({ category: 'all' })}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        filters.category === 'all'
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                    All
                </button>
                {categories
                    .filter(([key]) => activeCategories.includes(key as HumanTaskCategory))
                    .map(([key, cfg]) => {
                        const isActive = filters.category === key;
                        return (
                            <button
                                key={key}
                                onClick={() => onSetFilters({ category: isActive ? 'all' : key as HumanTaskCategory })}
                                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                    isActive
                                        ? `${cfg.bg} ${cfg.color} ring-1 ring-current ring-opacity-20`
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            >
                                {cfg.label}
                            </button>
                        );
                    })}
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                            <ClipboardList size={28} className="text-gray-300" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">No tasks yet</h3>
                        <p className="text-xs text-gray-400 max-w-xs">
                            Tasks will appear here when you describe operational work to the AI assistant via chat or voice
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tasks.map(task => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onUpdateStatus={onUpdateStatus}
                                onDeleteTask={onDeleteTask}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
