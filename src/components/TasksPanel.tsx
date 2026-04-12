import React, { useState, useRef, useEffect } from 'react';
import {
    ClipboardList, Thermometer, Bug, Shield, Wrench, CloudSun,
    Package, FlaskConical, Warehouse, Truck, SprayCan, GraduationCap,
    Scissors, Sprout, Leaf, Circle, Trash2,
    CheckCircle2, PlayCircle, CalendarClock, Zap, ArrowRight,
    MapPin, User, MoreHorizontal, RotateCcw, Pencil, X, Check,
    ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown, ChevronRight, Plus, AlertTriangle, Clock,
    MessageSquare,
} from 'lucide-react';
import type { HumanTask, HumanTaskStatus, HumanTaskCategory, HumanTaskPriority, TaskViewSpec } from '../types/definitions';
import { executeAction } from '../services/actionExecutor';
import { Modal, Button, FilterToolbar, ViewToggle, useViewMode, UndoToast, ViewSwitcherPills, DashboardHeader } from './ui';
import type { FilterDef, SortOption } from './ui';
import ResourceCalendar from './ui/ResourceCalendar';
import { buildTasksSchedule } from './tasksCalendarAdapter';
import { useAuth } from '../contexts/authContext';
import { useTaskViews } from '../hooks/useTaskViews';

export interface TeamMember {
    id: string;
    name: string;
    userId?: string;
}

type TaskFilters = {
    status: HumanTaskStatus[] | 'all';
    category: HumanTaskCategory | 'all';
    priority: HumanTaskPriority | 'all';
    assignees: string[] | 'all';
};

interface TasksPanelProps {
    tasks: HumanTask[];
    filters: TaskFilters;
    onSetFilters: (f: Partial<TaskFilters>) => void;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteTask: (id: string) => Promise<void>;
    onCreateTask?: (task: Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => Promise<HumanTask>;
    onNavigateToAI?: () => void;
    pendingCount: number;
    loadError?: string | null;
    onRetry?: () => void;
    teamMembers: TeamMember[];
}

// Brand-palette tint presets. All category/priority styles resolve to one of these
// five tuples — icons disambiguate category identity, not color.
const TONE = {
    chameleon: { text: 'text-[#1A7A42]', bg: 'bg-[#ECFDF5] border-[#A7F3D0]', dot: 'bg-[#3BB570]' },
    macaw:     { text: 'text-[#1B5EB5]', bg: 'bg-[#EFF8FF] border-[#BDE0FE]', dot: 'bg-[#1C9EFF]' },
    lion:      { text: 'text-[#B06A1F]', bg: 'bg-[#FFF7ED] border-[#FED7AA]', dot: 'bg-[#FA9E52]' },
    cardinal:  { text: 'text-[#A8403E]', bg: 'bg-[#FDECEC] border-[#F5C6C6]', dot: 'bg-[#DF5B59]' },
    rhino:     { text: 'text-[#5C5C5C]', bg: 'bg-[#F1F1F1] border-[#C0C0C0]', dot: 'bg-[#959595]' },
} as const;

const CATEGORY_CONFIG: Record<HumanTaskCategory, { icon: typeof ClipboardList; label: string; color: string; bg: string; dot: string }> = {
    drying_curing:  { icon: Thermometer,   label: 'Drying/Curing', color: TONE.lion.text,      bg: TONE.lion.bg,      dot: TONE.lion.dot },
    ipm:            { icon: Bug,           label: 'IPM',           color: TONE.cardinal.text,  bg: TONE.cardinal.bg,  dot: TONE.cardinal.dot },
    compliance:     { icon: Shield,        label: 'Compliance',    color: TONE.macaw.text,     bg: TONE.macaw.bg,     dot: TONE.macaw.dot },
    equipment:      { icon: Wrench,        label: 'Equipment',     color: TONE.rhino.text,     bg: TONE.rhino.bg,     dot: TONE.rhino.dot },
    environmental:  { icon: CloudSun,      label: 'Environmental', color: TONE.macaw.text,     bg: TONE.macaw.bg,     dot: TONE.macaw.dot },
    packaging:      { icon: Package,       label: 'Packaging',     color: TONE.chameleon.text, bg: TONE.chameleon.bg, dot: TONE.chameleon.dot },
    qc_testing:     { icon: FlaskConical,  label: 'QC/Testing',    color: TONE.macaw.text,     bg: TONE.macaw.bg,     dot: TONE.macaw.dot },
    inventory:      { icon: Warehouse,     label: 'Inventory',     color: TONE.lion.text,      bg: TONE.lion.bg,      dot: TONE.lion.dot },
    transportation: { icon: Truck,         label: 'Transport',     color: TONE.rhino.text,     bg: TONE.rhino.bg,     dot: TONE.rhino.dot },
    sanitation:     { icon: SprayCan,      label: 'Sanitation',    color: TONE.macaw.text,     bg: TONE.macaw.bg,     dot: TONE.macaw.dot },
    training:       { icon: GraduationCap, label: 'Training',      color: TONE.rhino.text,     bg: TONE.rhino.bg,     dot: TONE.rhino.dot },
    trim:           { icon: Scissors,      label: 'Trim',          color: TONE.chameleon.text, bg: TONE.chameleon.bg, dot: TONE.chameleon.dot },
    harvest:        { icon: Sprout,        label: 'Harvest',       color: TONE.chameleon.text, bg: TONE.chameleon.bg, dot: TONE.chameleon.dot },
    cultivation:    { icon: Leaf,          label: 'Cultivation',   color: TONE.chameleon.text, bg: TONE.chameleon.bg, dot: TONE.chameleon.dot },
    other:          { icon: Circle,        label: 'Other',         color: TONE.rhino.text,     bg: TONE.rhino.bg,     dot: TONE.rhino.dot },
};

const PRIORITY_CONFIG: Record<HumanTaskPriority, { label: string; color: string; dot: string }> = {
    low:    { label: 'Low',    color: TONE.rhino.text,    dot: TONE.rhino.dot },
    medium: { label: 'Medium', color: TONE.macaw.text,    dot: TONE.macaw.dot },
    high:   { label: 'High',   color: TONE.lion.text,     dot: TONE.lion.dot },
    urgent: { label: 'Urgent', color: TONE.cardinal.text, dot: TONE.cardinal.dot },
};


function formatDueDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays}d`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(iso: string): boolean {
    return new Date(iso) < new Date();
}

// ── Inline editing cells ────────────────────────────────────────────────────

const InlineTextCell = ({
    value,
    placeholder,
    onSave,
    icon: Icon,
}: {
    value: string;
    placeholder: string;
    onSave: (val: string) => void;
    icon?: typeof User;
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [flash, setFlash] = useState<'saved' | 'error' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
    useEffect(() => { setDraft(value); }, [value]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== value) {
            try {
                onSave(trimmed);
                setFlash('saved');
            } catch {
                setFlash('error');
            }
            setTimeout(() => setFlash(null), 1200);
        }
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1.5">
                {Icon && <Icon size={12} className="text-[#959595] shrink-0" />}
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
                    className="text-sm text-[#1A1A1A] bg-white border border-[#3BB570] rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20"
                    placeholder={placeholder}
                />
            </div>
        );
    }

    return (
        <button
            onClick={() => setEditing(true)}
            className={`flex items-center gap-1.5 text-left w-full group/cell min-h-[28px] transition-colors duration-300 rounded px-0.5 -mx-0.5 ${
                flash === 'saved' ? 'bg-[#3BB570]/[0.08]' : flash === 'error' ? 'bg-[#DF5B59]/[0.08]' : ''
            }`}
        >
            {Icon && <Icon size={12} className="text-[#959595] shrink-0" />}
            {flash === 'saved' ? (
                <span className="text-sm text-[#3BB570] flex items-center gap-1">
                    <Check size={12} /> Saved
                </span>
            ) : flash === 'error' ? (
                <span className="text-sm text-[#DF5B59]">Save failed</span>
            ) : value ? (
                <span className="text-sm text-[#1A1A1A]/70 group-hover/cell:text-[#1A1A1A] transition-colors">{value}</span>
            ) : (
                <span className="text-sm text-[#C0C0C0] group-hover/cell:text-[#959595] transition-colors">{placeholder}</span>
            )}
        </button>
    );
};

const InlineDateCell = ({
    value,
    isComplete,
    onSave,
}: {
    value: string | undefined;
    isComplete: boolean;
    onSave: (val: string) => void;
}) => {
    const [editing, setEditing] = useState(false);
    const dateStr = value ? value.slice(0, 10) : '';
    const [draft, setDraft] = useState(dateStr);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.showPicker?.();
        }
    }, [editing]);
    useEffect(() => { setDraft(value ? value.slice(0, 10) : ''); }, [value]);

    const commit = () => {
        setEditing(false);
        if (draft !== dateStr) onSave(draft);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="date"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); }}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(dateStr); setEditing(false); } }}
                className="text-sm text-[#1A1A1A] bg-white border border-[#3BB570] rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 w-[130px]"
            />
        );
    }

    return (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-left w-full group/cell min-h-[28px]">
            {value ? (
                <span className={`text-[12px] inline-flex items-center gap-1 ${
                    isOverdue(value) && !isComplete ? 'text-[#DF5B59] font-medium' : 'text-[#959595] group-hover/cell:text-[#1A1A1A]/70'
                } transition-colors`}>
                    <CalendarClock size={11} />
                    {formatDueDate(value)}
                </span>
            ) : (
                <span className="text-sm text-[#C0C0C0] group-hover/cell:text-[#959595] transition-colors flex items-center gap-1">
                    <CalendarClock size={11} />
                    Set date
                </span>
            )}
        </button>
    );
};

const InlineAssigneeCell = ({
    value,
    teamMembers,
    onSave,
}: {
    value: string;
    teamMembers: TeamMember[];
    onSave: (name: string, userId?: string) => void;
}) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-left w-full group/cell min-h-[28px]"
            >
                <User size={12} className="text-[#959595] shrink-0" />
                {value ? (
                    <span className="text-sm text-[#1A1A1A]/70 group-hover/cell:text-[#1A1A1A] transition-colors">{value}</span>
                ) : (
                    <span className="text-sm text-[#C0C0C0] group-hover/cell:text-[#959595] transition-colors">Assign</span>
                )}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-[#C0C0C0] py-1 w-48 max-h-60 overflow-y-auto">
                        {value && (
                            <button
                                onClick={() => { onSave('', undefined); setOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#959595] hover:bg-[#F1F1F1]/60 italic"
                            >
                                Unassign
                            </button>
                        )}
                        {teamMembers.filter(m => m.name !== value).map(m => (
                            <button
                                key={m.id}
                                onClick={() => { onSave(m.name, m.userId); setOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F1F1F1]/60"
                            >
                                <div className="w-5 h-5 rounded-full bg-[#3BB570]/10 text-[#3BB570] flex items-center justify-center text-[10px] font-semibold shrink-0">
                                    {m.name.charAt(0).toUpperCase()}
                                </div>
                                {m.name}
                            </button>
                        ))}
                        {teamMembers.length === 0 && (
                            <div className="px-3 py-2 text-xs text-[#959595]">No team members</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Picker dropdowns ────────────────────────────────────────────────────────

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
        <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-[#C0C0C0] py-1 w-48 max-h-72 overflow-y-auto">
            {categories.map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isActive = key === current;
                return (
                    <button
                        key={key}
                        onClick={() => { onSelect(key); onClose(); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                            isActive ? 'bg-[#F1F1F1] font-medium' : 'hover:bg-[#F1F1F1]/60'
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
        <div className="absolute left-0 top-8 z-30 bg-white rounded-lg shadow-lg border border-[#C0C0C0] py-1 w-36">
            {priorities.map(([key, cfg]) => {
                const isActive = key === current;
                return (
                    <button
                        key={key}
                        onClick={() => { onSelect(key); onClose(); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                            isActive ? 'bg-[#F1F1F1] font-medium' : 'hover:bg-[#F1F1F1]/60'
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

// ── Expanded edit form (description + all fields) ───────────────────────────

const TaskEditForm = ({
    task,
    onUpdateTask,
    onClose,
    teamMembers,
}: {
    task: HumanTask;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onClose: () => void;
    teamMembers: TeamMember[];
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
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showPriorityPicker, setShowPriorityPicker] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => { titleRef.current?.focus(); }, []);

    const handleSave = async () => {
        if (!draft.title.trim()) return;
        setSaving(true);
        try {
            const updates: Partial<HumanTask> = {};
            if (draft.title !== task.title) updates.title = draft.title.trim();
            if (draft.description !== (task.description || '')) updates.description = draft.description.trim() || undefined;
            if (draft.assignee !== (task.assignee || '')) {
                updates.assignee = draft.assignee.trim() || undefined;
                const member = teamMembers.find(m => m.name === draft.assignee);
                updates.assignedToUserId = member?.userId || undefined;
            }
            if (draft.location !== (task.location || '')) updates.location = draft.location.trim() || undefined;
            if (draft.dueDate !== (task.dueDate ? task.dueDate.slice(0, 10) : '')) updates.dueDate = draft.dueDate || undefined;
            if (draft.priority !== task.priority) updates.priority = draft.priority;
            if (draft.category !== task.category) updates.category = draft.category;

            if (Object.keys(updates).length > 0) {
                await onUpdateTask(task.id, updates);
            }
            onClose();
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const catCfg = CATEGORY_CONFIG[draft.category] || CATEGORY_CONFIG.other;
    const priCfg = PRIORITY_CONFIG[draft.priority];
    const CatIcon = catCfg.icon;

    return (
        <tr className="border-b border-[#C0C0C0] bg-[#F1F1F1]/50">
            <td colSpan={5} className="px-5 py-4 pl-14">
                <div className="space-y-3 max-w-2xl">
                    <input
                        ref={titleRef}
                        value={draft.title}
                        onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
                        placeholder="Task title"
                        className="w-full text-sm font-medium text-[#1A1A1A] bg-white border border-[#C0C0C0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 focus:border-[#3BB570]"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
                    />
                    <textarea
                        value={draft.description}
                        onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full text-sm text-[#1A1A1A] bg-white border border-[#C0C0C0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 focus:border-[#3BB570] resize-none"
                        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 min-w-[160px]">
                            <User size={13} className="text-[#959595] shrink-0" />
                            <select
                                value={draft.assignee}
                                onChange={(e) => setDraft(d => ({ ...d, assignee: e.target.value }))}
                                className="text-sm text-[#1A1A1A] bg-white border border-[#C0C0C0] rounded-md px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 focus:border-[#3BB570]"
                            >
                                <option value="">Unassigned</option>
                                {teamMembers.map(m => (
                                    <option key={m.id} value={m.name}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-1.5 min-w-[140px]">
                            <MapPin size={13} className="text-[#959595] shrink-0" />
                            <input value={draft.location} onChange={(e) => setDraft(d => ({ ...d, location: e.target.value }))} placeholder="Location"
                                className="text-sm text-[#1A1A1A] bg-white border border-[#C0C0C0] rounded-md px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 focus:border-[#3BB570]"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }} />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <CalendarClock size={13} className="text-[#959595] shrink-0" />
                            <input type="date" value={draft.dueDate} onChange={(e) => setDraft(d => ({ ...d, dueDate: e.target.value }))}
                                className="text-sm text-[#1A1A1A] bg-white border border-[#C0C0C0] rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3BB570]/20 focus:border-[#3BB570]" />
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all ${priCfg.color}`}>
                                <span className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
                                {priCfg.label}
                            </button>
                            {showPriorityPicker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowPriorityPicker(false)} />
                                    <PriorityPicker current={draft.priority} onSelect={(pri) => setDraft(d => ({ ...d, priority: pri }))} onClose={() => setShowPriorityPicker(false)} />
                                </>
                            )}
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all ${catCfg.bg} ${catCfg.color}`}>
                                <CatIcon size={12} />
                                {catCfg.label}
                            </button>
                            {showCategoryPicker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowCategoryPicker(false)} />
                                    <CategoryPicker current={draft.category} onSelect={(cat) => setDraft(d => ({ ...d, category: cat }))} onClose={() => setShowCategoryPicker(false)} />
                                </>
                            )}
                        </div>
                    </div>
                    {saveError && (
                        <p className="text-xs text-[#DF5B59] flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {saveError}
                        </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                        <button onClick={handleSave} disabled={saving || !draft.title.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#3BB570] hover:bg-[#2a8f56] disabled:opacity-50 rounded-md transition-colors">
                            <Check size={13} />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={onClose}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#959595] hover:text-[#1A1A1A] hover:bg-[#F1F1F1] rounded-md transition-colors">
                            <X size={13} />
                            Cancel
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    );
};

// ── Task row ────────────────────────────────────────────────────────────────

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
    teamMembers,
    urgencyBorder,
}: {
    task: HumanTask;
    onUpdateStatus: (id: string, status: HumanTaskStatus) => Promise<void>;
    onUpdateTask: (id: string, updates: Partial<HumanTask>) => Promise<void>;
    onDeleteTask: (id: string) => void;
    expanded: boolean;
    onToggleExpand: () => void;
    editing: boolean;
    onStartEdit: () => void;
    onStopEdit: () => void;
    teamMembers: TeamMember[];
    urgencyBorder?: string;
}) => {
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showPriorityPicker, setShowPriorityPicker] = useState(false);
    const cat = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.other;
    const pri = PRIORITY_CONFIG[task.priority];
    const CatIcon = cat.icon;
    const isComplete = task.status === 'completed';

    const cycleStatus = () => {
        if (task.status === 'pending') onUpdateStatus(task.id, 'in_progress');
        else if (task.status === 'in_progress') onUpdateStatus(task.id, 'completed');
        // completed → pending requires explicit "Reopen" from context menu
    };

    const statusIcon = () => {
        if (isComplete) return <CheckCircle2 size={18} className="text-[#3BB570]" />;
        if (task.status === 'in_progress') return <PlayCircle size={18} className="text-[#1C9EFF]" />;
        return <Circle size={18} className="text-[#C0C0C0]" />;
    };

    return (
        <>
            <tr className={`group border-b border-[#F1F1F1] hover:bg-[#F1F1F1]/40 transition-colors ${isComplete ? 'opacity-60' : ''} ${urgencyBorder ? `border-l-[3px] ${urgencyBorder}` : ''}`}>
                {/* Status checkbox */}
                <td className="pl-5 pr-2 py-3 w-10">
                    <button onClick={cycleStatus} className="hover:scale-110 transition-transform">
                        {statusIcon()}
                    </button>
                </td>

                {/* Task title + metadata row */}
                <td className="px-3 py-3">
                    <InlineTextCell
                        value={task.title}
                        placeholder="Untitled task"
                        onSave={(val) => onUpdateTask(task.id, { title: val })}
                    />
                    {/* Secondary metadata */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* Category badge */}
                        <div className="relative">
                            <button
                                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border cursor-pointer hover:ring-1 hover:ring-offset-1 hover:ring-gray-200 transition-all ${cat.bg} ${cat.color}`}
                            >
                                <CatIcon size={10} />
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
                        {/* Priority */}
                        <div className="relative">
                            <button
                                onClick={() => setShowPriorityPicker(!showPriorityPicker)}
                                className={`inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${pri.color}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
                                {pri.label}
                            </button>
                            {showPriorityPicker && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowPriorityPicker(false)} />
                                    <PriorityPicker
                                        current={task.priority}
                                        onSelect={(newPri) => onUpdateTask(task.id, { priority: newPri })}
                                        onClose={() => setShowPriorityPicker(false)}
                                    />
                                </>
                            )}
                        </div>
                        {/* Location */}
                        {task.location && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#959595]">
                                <MapPin size={10} />
                                {task.location}
                            </span>
                        )}
                    </div>
                </td>

                {/* Assignee */}
                <td className="px-3 py-3 hidden md:table-cell">
                    <InlineAssigneeCell
                        value={task.assignee || ''}
                        teamMembers={teamMembers}
                        onSave={(name, userId) => onUpdateTask(task.id, { assignee: name || undefined, assignedToUserId: userId })}
                    />
                </td>

                {/* Due date */}
                <td className="px-3 py-3 hidden sm:table-cell">
                    <InlineDateCell
                        value={task.dueDate}
                        isComplete={isComplete}
                        onSave={(val) => onUpdateTask(task.id, { dueDate: val || undefined })}
                    />
                </td>

                {/* Actions menu */}
                <td className="pr-4 pl-2 py-3 w-10">
                    <div className="relative">
                        <button
                            onClick={onToggleExpand}
                            className="p-1 text-[#C0C0C0] hover:text-[#959595] transition-colors rounded hover:bg-[#F1F1F1]"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        {expanded && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={onToggleExpand} />
                                <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-[#C0C0C0] py-1 min-w-[140px]">
                                    <button
                                        onClick={() => { onStartEdit(); onToggleExpand(); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F1F1F1]"
                                    >
                                        <Pencil size={14} />
                                        Edit details
                                    </button>
                                    {task.status !== 'completed' && (
                                        <button
                                            onClick={() => { onUpdateStatus(task.id, task.status === 'pending' ? 'in_progress' : 'completed'); onToggleExpand(); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F1F1F1]"
                                        >
                                            {task.status === 'pending' ? <PlayCircle size={14} className="text-[#1C9EFF]" /> : <CheckCircle2 size={14} className="text-[#3BB570]" />}
                                            {task.status === 'pending' ? 'Mark in progress' : 'Mark complete'}
                                        </button>
                                    )}
                                    {task.status === 'completed' && (
                                        <button
                                            onClick={() => { onUpdateStatus(task.id, 'pending'); onToggleExpand(); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F1F1F1]"
                                        >
                                            <RotateCcw size={14} />
                                            Reopen task
                                        </button>
                                    )}
                                    <hr className="my-1 border-[#F1F1F1]" />
                                    <button
                                        onClick={() => { onDeleteTask(task.id); onToggleExpand(); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[#DF5B59] hover:bg-[#DF5B59]/5"
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
            {/* Full edit form row */}
            {editing && (
                <TaskEditForm task={task} onUpdateTask={onUpdateTask} onClose={onStopEdit} teamMembers={teamMembers} />
            )}
            {/* Description row */}
            {!editing && task.description && expanded && (
                <tr className="border-b border-[#F1F1F1] bg-[#F1F1F1]/30">
                    <td colSpan={5} className="px-5 py-2.5 pl-14">
                        <p className="text-xs text-[#959595] leading-relaxed">{task.description}</p>
                    </td>
                </tr>
            )}
        </>
    );
};

// ── Urgency grouping ────────────────────────────────────────────────────────

type UrgencyGroup = 'overdue' | 'today' | 'upcoming' | 'no_date' | 'completed';

const URGENCY_CONFIG: Record<UrgencyGroup, { label: string; border: string; headerColor: string }> = {
    overdue: { label: 'Overdue', border: 'border-l-[#DF5B59]', headerColor: 'text-[#DF5B59]' },
    today: { label: 'Due Today', border: 'border-l-[#FA9E52]', headerColor: 'text-[#FA9E52]' },
    upcoming: { label: 'Upcoming', border: 'border-l-[#1C9EFF]', headerColor: 'text-[#1C9EFF]' },
    no_date: { label: 'No Due Date', border: 'border-l-[#C0C0C0]', headerColor: 'text-[#959595]' },
    completed: { label: 'Completed', border: 'border-l-[#3BB570]', headerColor: 'text-[#3BB570]' },
};

function getUrgencyGroup(task: HumanTask): UrgencyGroup {
    if (task.status === 'completed') return 'completed';
    if (!task.dueDate) return 'no_date';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(task.dueDate);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

    if (dueDay < today) return 'overdue';
    if (dueDay.getTime() === today.getTime()) return 'today';
    return 'upcoming';
}

function groupTasks(tasks: HumanTask[]): { group: UrgencyGroup; tasks: HumanTask[] }[] {
    const groups: Record<UrgencyGroup, HumanTask[]> = {
        overdue: [], today: [], upcoming: [], no_date: [], completed: [],
    };
    for (const t of tasks) groups[getUrgencyGroup(t)].push(t);
    const order: UrgencyGroup[] = ['overdue', 'today', 'upcoming', 'no_date', 'completed'];
    return order.filter(g => groups[g].length > 0).map(g => ({ group: g, tasks: groups[g] }));
}

// ── Inline task creation ────────────────────────────────────────────────────

const InlineCreateRow = ({
    onSave,
    onCancel,
    teamMembers,
}: {
    onSave: (task: Omit<HumanTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
    onCancel: () => void;
    teamMembers: TeamMember[];
}) => {
    const [title, setTitle] = useState('');
    const [assignee, setAssignee] = useState('');
    const [dueDate, setDueDate] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = () => {
        if (!title.trim()) return;
        const member = teamMembers.find(m => m.name === assignee);
        onSave({
            title: title.trim(),
            priority: 'medium',
            category: 'other',
            assignee: assignee || undefined,
            assignedToUserId: member?.userId,
            dueDate: dueDate || undefined,
        });
        setTitle('');
        setAssignee('');
        setDueDate('');
        inputRef.current?.focus();
    };

    return (
        <tr className="border-b border-[#F1F1F1] bg-[#3BB570]/[0.03]">
            <td className="pl-5 pr-2 py-2.5 w-10">
                <div className="w-[18px] h-[18px] rounded-full border-2 border-dashed border-[#C0C0C0]" />
            </td>
            <td className="px-3 py-2.5">
                <input
                    ref={inputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmit();
                        if (e.key === 'Escape') onCancel();
                    }}
                    placeholder="What needs to be done?"
                    className="text-sm text-[#1A1A1A] bg-transparent w-full focus:outline-none placeholder:text-[#C0C0C0]"
                />
            </td>
            <td className="px-3 py-2.5 hidden md:table-cell">
                <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="text-sm text-[#959595] bg-transparent focus:outline-none cursor-pointer"
                >
                    <option value="">Assign</option>
                    {teamMembers.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-2.5 hidden sm:table-cell">
                <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="text-sm text-[#959595] bg-transparent focus:outline-none"
                />
            </td>
            <td className="pr-4 pl-2 py-2.5 w-10">
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSubmit}
                        disabled={!title.trim()}
                        className="p-1 text-[#3BB570] hover:text-[#2a8f56] disabled:text-gray-200 transition-colors"
                        title="Add task"
                    >
                        <Check size={16} />
                    </button>
                    <button
                        onClick={onCancel}
                        className="p-1 text-[#C0C0C0] hover:text-[#959595] transition-colors"
                        title="Cancel"
                    >
                        <X size={14} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

// ── Main panel ──────────────────────────────────────────────────────────────

export const TasksPanel = ({
    tasks,
    filters,
    onSetFilters,
    onUpdateStatus,
    onUpdateTask,
    onDeleteTask,
    onCreateTask,
    onNavigateToAI,
    pendingCount,
    loadError,
    onRetry,
    teamMembers,
}: TasksPanelProps) => {
    type SortField = 'title' | 'assignee' | 'location' | 'dueDate' | 'category' | 'priority' | 'status';
    type SortDir = 'asc' | 'desc';

    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useViewMode('tasks', 'cards');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [pendingComplete, setPendingComplete] = useState<HumanTask | null>(null);
    const [executingAction, setExecutingAction] = useState(false);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [showCreateRow, setShowCreateRow] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<UrgencyGroup>>(new Set(['completed']));
    const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

    // ── Saved views ────────────────────────────────────────────────────────
    const { user } = useAuth();
    const currentUserName = teamMembers.find(m => m.userId === user?.id)?.name;
    const taskViews = useTaskViews({ currentUserName });
    const initialViewApplied = useRef(false);

    const getCurrentSpec = (): TaskViewSpec => ({
        filters,
        sortField,
        sortDir,
        viewMode,
    });

    const handleSelectView = (viewId: string) => {
        const spec = taskViews.applyView(viewId);
        onSetFilters(spec.filters);
        setSortField((spec.sortField as SortField) ?? null);
        setSortDir(spec.sortDir);
        setViewMode(spec.viewMode as 'cards' | 'table' | 'schedule' | 'calendar' | 'kanban');
        setSearchQuery('');
    };

    // Auto-apply "My Tasks" on initial load
    useEffect(() => {
        if (initialViewApplied.current) return;
        if (!user || teamMembers.length === 0) return;
        initialViewApplied.current = true;
        const myName = teamMembers.find(m => m.userId === user.id)?.name;
        if (myName) {
            onSetFilters({ assignees: [myName] });
        }
    }, [user, teamMembers, onSetFilters]);
    const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeCategories = [...new Set(tasks.map(t => t.category))];

    // Build FilterToolbar definitions
    const statusFilterDef: FilterDef = {
        key: 'status',
        label: 'Status',
        multi: true,
        options: [
            { value: 'pending', label: 'To Do', dot: 'bg-gray-300' },
            { value: 'in_progress', label: 'In Progress', dot: 'bg-[#1C9EFF]' },
            { value: 'completed', label: 'Done', dot: 'bg-[#3BB570]' },
        ],
    };

    const categoryFilterDef: FilterDef = {
        key: 'category',
        label: 'Category',
        options: activeCategories.map(key => ({
            value: key,
            label: CATEGORY_CONFIG[key].label,
        })),
    };

    const priorityFilterDef: FilterDef = {
        key: 'priority',
        label: 'Priority',
        options: [
            { value: 'urgent', label: 'Urgent', dot: 'bg-[#DF5B59]' },
            { value: 'high', label: 'High', dot: 'bg-[#FA9E52]' },
            { value: 'medium', label: 'Medium', dot: 'bg-[#1C9EFF]' },
            { value: 'low', label: 'Low', dot: 'bg-gray-300' },
        ],
    };

    const assigneeFilterDef: FilterDef = {
        key: 'assignees',
        label: 'Assignee',
        multi: true,
        options: teamMembers.map(m => ({ value: m.name, label: m.name })),
    };

    const taskFilterDefs: FilterDef[] = [
        statusFilterDef,
        ...(teamMembers.length > 0 ? [assigneeFilterDef] : []),
        categoryFilterDef,
        priorityFilterDef,
    ];

    const taskSortOptions: SortOption[] = [
        { value: 'title', label: 'Title' },
        { value: 'assignee', label: 'Assignee' },
        { value: 'dueDate', label: 'Due date' },
        { value: 'priority', label: 'Priority' },
        { value: 'status', label: 'Status' },
    ];

    // Convert filters state → activeFilters record for toolbar
    const activeFilterValues: Record<string, string[]> = {
        status: filters.status === 'all' ? [] : filters.status,
        category: filters.category === 'all' ? [] : [filters.category],
        priority: filters.priority === 'all' ? [] : [filters.priority],
        assignees: filters.assignees === 'all' ? [] : filters.assignees,
    };

    const handleFilterChange = (key: string, values: string[]) => {
        if (key === 'status') {
            onSetFilters({ status: values.length === 0 ? 'all' : values as HumanTaskStatus[] });
        } else if (key === 'category') {
            onSetFilters({ category: values.length === 0 ? 'all' : values[0] as HumanTaskCategory });
        } else if (key === 'priority') {
            onSetFilters({ priority: values.length === 0 ? 'all' : values[0] as HumanTaskPriority });
        } else if (key === 'assignees') {
            onSetFilters({ assignees: values.length === 0 ? 'all' : values });
        }
    };

    const handleClearFilters = () => {
        onSetFilters({ status: 'all', category: 'all', priority: 'all', assignees: 'all' });
    };

    const handleSortChange = (value: string | null, dir: 'asc' | 'desc') => {
        setSortField(value as SortField | null);
        setSortDir(dir);
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(null); setSortDir('asc'); }
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const STATUS_RANK: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };

    // Intercept status updates to check for completion actions
    const handleUpdateStatus = async (id: string, status: HumanTaskStatus) => {
        if (status === 'completed') {
            const task = tasks.find(t => t.id === id);
            if (task?.onCompleteAction) {
                setPendingComplete(task);
                return;
            }
        }
        await onUpdateStatus(id, status);
    };

    const confirmCompleteWithAction = async () => {
        if (!pendingComplete) return;
        setExecutingAction(true);
        try {
            // Complete the task first
            await onUpdateStatus(pendingComplete.id, 'completed');
            // Then execute the linked action
            if (pendingComplete.onCompleteAction) {
                await executeAction(pendingComplete.onCompleteAction);
            }
        } finally {
            setExecutingAction(false);
            setPendingComplete(null);
        }
    };

    const completeWithoutAction = async () => {
        if (!pendingComplete) return;
        await onUpdateStatus(pendingComplete.id, 'completed');
        setPendingComplete(null);
    };

    // Soft-delete with undo
    const handleSoftDelete = (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        // Cancel any existing pending delete
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
        setPendingDelete({ id, title: task.title });
        deleteTimerRef.current = setTimeout(() => {
            onDeleteTask(id);
            setPendingDelete(null);
            deleteTimerRef.current = null;
        }, 4000);
    };

    const handleUndoDelete = () => {
        if (deleteTimerRef.current) {
            clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }
        setPendingDelete(null);
    };

    const handleDismissDelete = () => {
        if (pendingDelete) {
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
            onDeleteTask(pendingDelete.id);
            setPendingDelete(null);
            deleteTimerRef.current = null;
        }
    };

    const filteredTasks = tasks.filter(t => {
        // Hide task pending deletion (undo window)
        if (pendingDelete && t.id === pendingDelete.id) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!t.title.toLowerCase().includes(q) && !t.assignee?.toLowerCase().includes(q) && !t.location?.toLowerCase().includes(q)) {
                return false;
            }
        }
        return true;
    });

    const calendarData = React.useMemo(
        () => buildTasksSchedule(filteredTasks),
        [filteredTasks],
    );

    const sortedTasks = sortField
        ? [...filteredTasks].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'title': cmp = a.title.localeCompare(b.title); break;
                case 'assignee': cmp = (a.assignee || '').localeCompare(b.assignee || ''); break;
                case 'location': cmp = (a.location || '').localeCompare(b.location || ''); break;
                case 'dueDate': cmp = (a.dueDate || '9').localeCompare(b.dueDate || '9'); break;
                case 'category': cmp = (CATEGORY_CONFIG[a.category]?.label || '').localeCompare(CATEGORY_CONFIG[b.category]?.label || ''); break;
                case 'priority': cmp = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9); break;
                case 'status': cmp = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9); break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        })
        : filteredTasks;

    const SortHeader = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
        <th
            className={`px-3 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none group hover:text-[#1A1A1A]/70 transition-colors ${className || ''} ${sortField === field ? 'text-[#3BB570]' : 'text-[#C0C0C0]'}`}
            onClick={() => toggleSort(field)}
        >
            <span className="inline-flex items-center gap-1">
                {children}
                {sortField === field ? (
                    sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                ) : (
                    <ChevronsUpDown size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                )}
            </span>
        </th>
    );

    // Urgency counts for the summary (computed from unfiltered tasks to always show true state)
    const overdueCount = tasks.filter(t => t.status !== 'completed' && t.dueDate && isOverdue(t.dueDate)).length;
    const todayCount = tasks.filter(t => {
        if (t.status === 'completed' || !t.dueDate) return false;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const due = new Date(t.dueDate);
        const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        return dueDay.getTime() === today.getTime();
    }).length;
    const urgentCount = tasks.filter(t => t.status !== 'completed' && t.priority === 'urgent').length;

    const toggleGroupCollapse = (group: UrgencyGroup) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-6 pt-2 pb-2">
                <DashboardHeader
                    eyebrow="Tasks"
                    title="Task Board"
                    density="compact"
                    actions={
                        <>
                            <ViewToggle mode={viewMode} onChange={setViewMode} showCalendar />
                            {onCreateTask && (
                                <button
                                    onClick={() => setShowCreateRow(true)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#3BB570] hover:bg-[#2a8f56] rounded-lg transition-colors"
                                >
                                    <Plus size={15} />
                                    New task
                                </button>
                            )}
                        </>
                    }
                />

                {/* Attention summary — only when there's something noteworthy */}
                {(overdueCount > 0 || todayCount > 0 || urgentCount > 0) && (
                    <div className="flex items-center gap-4 mt-3 py-2.5 px-3.5 bg-[#F1F1F1] rounded-lg">
                        {overdueCount > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                                <AlertTriangle size={14} className="text-[#DF5B59]" />
                                <span className="font-semibold text-[#DF5B59]">{overdueCount}</span>
                                <span className="text-[#959595]">overdue</span>
                            </div>
                        )}
                        {todayCount > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                                <Clock size={14} className="text-[#FA9E52]" />
                                <span className="font-semibold text-[#FA9E52]">{todayCount}</span>
                                <span className="text-[#959595]">due today</span>
                            </div>
                        )}
                        {urgentCount > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                                <Zap size={14} className="text-[#DF5B59]" />
                                <span className="font-semibold text-[#DF5B59]">{urgentCount}</span>
                                <span className="text-[#959595]">urgent</span>
                            </div>
                        )}
                    </div>
                )}
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

            {/* View switcher pills */}
            <div className="px-6 pt-2 pb-1">
                <ViewSwitcherPills
                    views={taskViews.views}
                    activeViewId={taskViews.activeViewId}
                    isModified={taskViews.isModified(getCurrentSpec())}
                    onSelectView={handleSelectView}
                    onSaveView={(title) => taskViews.saveCurrentAsView(title, getCurrentSpec())}
                    onDeleteView={taskViews.deleteView}
                    onUpdateView={(id) => taskViews.updateView(id, getCurrentSpec())}
                />
            </div>

            {/* Search + Filters + Sort */}
            <div className="px-6 py-3 border-b border-[#F1F1F1]">
                <FilterToolbar
                    search={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search tasks..."
                    filters={taskFilterDefs}
                    activeFilters={activeFilterValues}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                    sortOptions={taskSortOptions}
                    activeSort={sortField}
                    sortDir={sortDir}
                    onSortChange={handleSortChange}
                />
            </div>

            {/* Calendar View */}
            {viewMode === 'calendar' && (
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <ResourceCalendar
                        resources={calendarData.resources}
                        blocks={calendarData.blocks}
                    />
                </div>
            )}

            {/* Table */}
            {viewMode !== 'calendar' && (
            <div className="flex-1 overflow-y-auto">
                {sortedTasks.length === 0 && !showCreateRow ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        {searchQuery ? (
                            <>
                                <div className="w-14 h-14 rounded-full bg-[#F1F1F1] flex items-center justify-center mb-4">
                                    <ClipboardList size={24} className="text-[#C0C0C0]" />
                                </div>
                                <h3 className="text-sm font-medium text-[#959595] mb-1">No matching tasks</h3>
                                <p className="text-xs text-[#C0C0C0]">Try adjusting your search or filters</p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-base font-semibold text-[#1A1A1A] mb-1">Track operational work</h3>
                                <p className="text-sm text-[#959595] max-w-sm mb-6">
                                    IPM sprays, equipment checks, room turnovers — anything your team needs to do. Create tasks here or let the AI capture them from conversation.
                                </p>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-md">
                                    {onCreateTask && (
                                        <button
                                            onClick={() => setShowCreateRow(true)}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-[#3BB570] hover:bg-[#2a8f56] rounded-lg transition-colors"
                                        >
                                            <Plus size={16} />
                                            Create a task
                                        </button>
                                    )}
                                    {onNavigateToAI && (
                                        <button
                                            onClick={onNavigateToAI}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[#1A1A1A] border border-[#C0C0C0] hover:border-[#959595] hover:bg-[#F1F1F1] rounded-lg transition-colors"
                                        >
                                            <MessageSquare size={16} />
                                            Ask the AI
                                        </button>
                                    )}
                                </div>

                                {onNavigateToAI && (
                                    <div className="mt-6 text-left w-full max-w-md">
                                        <p className="text-xs font-medium text-[#959595] mb-2">Try saying:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                'Create IPM tasks for this week',
                                                'Remind me to calibrate scales Friday',
                                                'Set up harvest day checklist',
                                            ].map(prompt => (
                                                <button
                                                    key={prompt}
                                                    onClick={onNavigateToAI}
                                                    className="text-xs text-[#959595] bg-[#F1F1F1] hover:bg-[#e5e5e5] px-3 py-1.5 rounded-full transition-colors"
                                                >
                                                    "{prompt}"
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#F1F1F1] text-left">
                                <SortHeader field="status" className="pl-5 pr-2 py-3 w-10"><span className="sr-only">Status</span></SortHeader>
                                <SortHeader field="title">Task</SortHeader>
                                <SortHeader field="assignee" className="hidden md:table-cell">Assignee</SortHeader>
                                <SortHeader field="dueDate" className="hidden sm:table-cell">Due</SortHeader>
                                <th className="pr-4 pl-2 py-3 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {/* Inline creation row */}
                            {showCreateRow && onCreateTask && (
                                <InlineCreateRow
                                    teamMembers={teamMembers}
                                    onSave={async (task) => {
                                        await onCreateTask(task);
                                    }}
                                    onCancel={() => setShowCreateRow(false)}
                                />
                            )}

                            {/* Grouped tasks when no sort is active, flat list when sorting */}
                            {sortField ? (
                                sortedTasks.map(task => (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        onUpdateStatus={handleUpdateStatus}
                                        onUpdateTask={onUpdateTask}
                                        onDeleteTask={handleSoftDelete}
                                        expanded={expandedId === task.id}
                                        onToggleExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
                                        editing={editingId === task.id}
                                        onStartEdit={() => { setEditingId(task.id); setExpandedId(null); }}
                                        onStopEdit={() => setEditingId(null)}
                                        teamMembers={teamMembers}
                                        urgencyBorder={URGENCY_CONFIG[getUrgencyGroup(task)].border}
                                    />
                                ))
                            ) : (
                                groupTasks(sortedTasks).map(({ group, tasks: groupedTasks }) => {
                                    const cfg = URGENCY_CONFIG[group];
                                    const isCollapsed = collapsedGroups.has(group);
                                    return (
                                        <React.Fragment key={group}>
                                            {/* Group header */}
                                            <tr>
                                                <td colSpan={5}>
                                                    <button
                                                        onClick={() => toggleGroupCollapse(group)}
                                                        className="w-full flex items-center gap-2 px-5 py-2 bg-[#F1F1F1]/60 hover:bg-[#F1F1F1] transition-colors text-left"
                                                    >
                                                        <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.headerColor}`}>
                                                            {cfg.label}
                                                        </span>
                                                        <span className="text-xs text-[#959595] font-medium">
                                                            {groupedTasks.length}
                                                        </span>
                                                        {isCollapsed
                                                            ? <ChevronRight size={12} className="text-[#C0C0C0] ml-auto" />
                                                            : <ChevronDown size={12} className="text-[#C0C0C0] ml-auto" />
                                                        }
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* Group tasks */}
                                            {!isCollapsed && groupedTasks.map(task => (
                                                <TaskRow
                                                    key={task.id}
                                                    task={task}
                                                    onUpdateStatus={handleUpdateStatus}
                                                    onUpdateTask={onUpdateTask}
                                                    onDeleteTask={handleSoftDelete}
                                                    expanded={expandedId === task.id}
                                                    onToggleExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
                                                    editing={editingId === task.id}
                                                    onStartEdit={() => { setEditingId(task.id); setExpandedId(null); }}
                                                    onStopEdit={() => setEditingId(null)}
                                                    teamMembers={teamMembers}
                                                    urgencyBorder={cfg.border}
                                                />
                                            ))}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            )}

            {/* Completion action confirmation modal */}
            {pendingComplete && pendingComplete.onCompleteAction && (() => {
                const act = pendingComplete.onCompleteAction!;
                const actionLabel = act.type.replace(/_/g, ' ');
                const details = Object.entries(act.data)
                    .filter(([, v]) => v && typeof v !== 'object')
                    .slice(0, 5);
                return (
                    <Modal
                        title="Complete with linked action"
                        contentClassName="creation-modal"
                        onClose={() => setPendingComplete(null)}
                        footer={
                            <>
                                <Button variant="secondary" onClick={completeWithoutAction} disabled={executingAction}>
                                    Complete only
                                </Button>
                                <Button variant="primary" onClick={confirmCompleteWithAction} disabled={executingAction}>
                                    {executingAction ? 'Recording...' : 'Complete & record'}
                                </Button>
                            </>
                        }
                    >
                        <div className="flex flex-col gap-5">
                            {/* Task being completed */}
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#3BB570]/10 flex items-center justify-center shrink-0">
                                    <Check size={18} className="text-[#3BB570]" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-[#1A1A1A]">
                                        {pendingComplete.title}
                                    </p>
                                    {pendingComplete.location && (
                                        <p className="text-xs text-[#959595] mt-0.5">
                                            {pendingComplete.location}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Arrow connector */}
                            <div className="flex justify-center">
                                <ArrowRight size={16} className="text-[#C0C0C0] rotate-90" />
                            </div>

                            {/* Linked system action */}
                            <div className="border border-[#C0C0C0] rounded-[10px] overflow-hidden">
                                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#3BB570]/10">
                                    <Zap size={14} className="text-[#3BB570]" />
                                    <span className="text-sm font-medium text-[#2a8f56] capitalize">
                                        {actionLabel}
                                    </span>
                                </div>
                                {details.length > 0 && (
                                    <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
                                        {details.map(([k, v]) => (
                                            <div key={k} className="flex justify-between items-center">
                                                <span className="text-xs text-[#959595] capitalize">
                                                    {k.replace(/([A-Z])/g, ' $1').trim()}
                                                </span>
                                                <span className="text-xs font-medium text-[#1A1A1A]">
                                                    {String(v)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-[#959595] text-center">
                                This will record the action in your system when you mark the task done.
                            </p>
                        </div>
                    </Modal>
                );
            })()}

            {/* Undo delete toast */}
            {pendingDelete && (
                <UndoToast
                    message={`"${pendingDelete.title.length > 40 ? pendingDelete.title.slice(0, 40) + '…' : pendingDelete.title}" deleted`}
                    onUndo={handleUndoDelete}
                    onDismiss={handleDismissDelete}
                />
            )}
        </div>
    );
};
