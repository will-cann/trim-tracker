import { useState } from 'react';
import {
    Package, Plus, UserPlus, User, Sprout, Scale, ArrowRightLeft,
    Trash2, MapPin, Play, SkipForward, X, ChevronDown, ChevronUp,
    Check, AlertCircle, Loader2, GripVertical, ClipboardList,
} from 'lucide-react';
import type { Task } from '../types/definitions';
import { Badge } from './ui';

interface TaskItemProps {
    task: Task;
    onExecute: (id: string) => void;
    onSkip: (id: string) => void;
    onRemove: (id: string) => void;
    onEditAction: (id: string, data: Record<string, string | number | boolean>) => void;
}

const ACTION_CONFIG: Record<string, { icon: typeof Package; label: string; color: string; bgColor: string }> = {
    create_session: { icon: Package, label: 'Create Session', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    add_batch: { icon: Plus, label: 'Add Batch', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    assign_trimmer: { icon: User, label: 'Assign Trimmer', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    add_trimmer_profile: { icon: UserPlus, label: 'Add to Roster', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    create_harvest: { icon: Sprout, label: 'Create Harvest', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    record_wet_weight: { icon: Scale, label: 'Record Wet Weight', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    allocate_harvest: { icon: ArrowRightLeft, label: 'Allocate Harvest', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    record_harvest_waste: { icon: Trash2, label: 'Record Waste', color: 'text-red-600', bgColor: 'bg-red-50' },
    move_harvest: { icon: MapPin, label: 'Move Harvest', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    create_human_task: { icon: ClipboardList, label: 'Task', color: 'text-teal-600', bgColor: 'bg-teal-50' },
};

const FIELD_LABELS: Record<string, string> = {
    harvestName: 'Harvest Name', strain: 'Strain', licenseNumber: 'License #',
    startWeight: 'Start Weight (g)', status: 'Status', name: 'Name',
    startTime: 'Start Time', tool: 'Tool', entryName: 'Batch',
    allocation: 'Allocation', plantCount: 'Plant Count',
    dryingLocation: 'Drying Location', targetWeight: 'Target Weight (g)',
    weight: 'Weight (g)', wasteType: 'Waste Type',
    title: 'Title', description: 'Description', priority: 'Priority',
    category: 'Category', dueDate: 'Due Date', assignee: 'Assignee', location: 'Location',
};

const HIDDEN_FIELDS = ['entryId', 'profileId', 'harvestId'];

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: 'text-gray-600', bg: 'bg-gray-100' },
    edited: { label: 'Edited', color: 'text-blue-600', bg: 'bg-blue-50' },
    executing: { label: 'Running', color: 'text-amber-600', bg: 'bg-amber-50' },
    completed: { label: 'Done', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    failed: { label: 'Failed', color: 'text-red-600', bg: 'bg-red-50' },
    skipped: { label: 'Skipped', color: 'text-gray-400', bg: 'bg-gray-50' },
};

// Summarize key data fields into a short string
function summarizeData(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.strain) parts.push(String(data.strain));
    if (data.name) parts.push(String(data.name));
    if (data.harvestName) parts.push(String(data.harvestName));
    if (data.startWeight) parts.push(`${data.startWeight}g`);
    if (data.weight) parts.push(`${data.weight}g`);
    if (data.dryingLocation) parts.push(String(data.dryingLocation));
    return parts.slice(0, 3).join(', ');
}

export const TaskItem = ({ task, onExecute, onSkip, onRemove, onEditAction }: TaskItemProps) => {
    const [expanded, setExpanded] = useState(false);
    const config = ACTION_CONFIG[task.action.type] || ACTION_CONFIG.add_batch;
    const Icon = config.icon;
    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
    const isActionable = task.status === 'pending' || task.status === 'edited';
    const isDone = task.status === 'completed' || task.status === 'skipped';

    return (
        <div className={`border rounded-lg bg-white transition-all ${
            isDone ? 'opacity-60 border-gray-100' :
            task.status === 'failed' ? 'border-red-200' :
            task.status === 'executing' ? 'border-amber-200' :
            'border-gray-200'
        }`}>
            {/* Compact row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
                <GripVertical size={14} className="text-gray-300 flex-shrink-0 cursor-grab" />
                <div className={`p-1.5 rounded ${config.bgColor} flex-shrink-0`}>
                    {task.status === 'completed' ? (
                        <Check size={14} className="text-emerald-500" />
                    ) : task.status === 'executing' ? (
                        <Loader2 size={14} className="text-amber-500 animate-spin" />
                    ) : task.status === 'failed' ? (
                        <AlertCircle size={14} className="text-red-500" />
                    ) : (
                        <Icon size={14} className={config.color} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">
                            {config.label}
                        </span>
                        <Badge variant="custom" bg={statusStyle.bg} color={statusStyle.color}>
                            {statusStyle.label}
                        </Badge>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                        {summarizeData(task.action.data)}
                    </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {isActionable && (
                        <>
                            <button
                                onClick={() => onExecute(task.id)}
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Execute"
                            >
                                <Play size={14} />
                            </button>
                            <button
                                onClick={() => onSkip(task.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
                                title="Skip"
                            >
                                <SkipForward size={14} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => onRemove(task.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove"
                    >
                        <X size={12} />
                    </button>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Error message */}
            {task.status === 'failed' && task.error && (
                <div className="px-3 pb-2">
                    <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{task.error}</p>
                </div>
            )}

            {/* Expanded edit view */}
            {expanded && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
                    {task.sourceText && (
                        <p className="text-xs text-gray-400 italic mb-2">"{task.sourceText}"</p>
                    )}
                    {Object.entries(task.action.data)
                        .filter(([key]) => !HIDDEN_FIELDS.includes(key))
                        .map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 w-28 flex-shrink-0">
                                    {FIELD_LABELS[key] || key}
                                </label>
                                {isActionable ? (
                                    <input
                                        type={typeof value === 'number' ? 'number' : 'text'}
                                        value={value ?? ''}
                                        onChange={(e) => {
                                            const newVal = typeof value === 'number'
                                                ? parseFloat(e.target.value) || 0
                                                : e.target.value;
                                            onEditAction(task.id, { [key]: newVal });
                                        }}
                                        className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded
                                                   focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                                    />
                                ) : (
                                    <span className="flex-1 text-sm text-gray-700 px-2 py-1">
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
                                    </span>
                                )}
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
};
