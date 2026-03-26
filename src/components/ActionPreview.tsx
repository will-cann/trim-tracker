import { useState } from 'react';
import { Package, Plus, UserPlus, User, Loader2, Check, X, Sprout, Scale, ArrowRightLeft, Trash2, MapPin, CheckCircle2, XCircle, ChevronDown, Scissors, ClipboardList } from 'lucide-react';
import type { ProposedAction } from '../types/definitions';

interface ActionPreviewProps {
    actions: ProposedAction[];
    onConfirm?: () => void;
    onCancel?: () => void;
    onEditAction?: (index: number, data: Record<string, any>) => void;
    isExecuting?: boolean;
    readonly?: boolean;
    status?: 'confirmed' | 'cancelled';
}

const ACTION_CONFIG: Record<string, { icon: typeof Package; label: string; color: string; bgColor: string }> = {
    create_session: { icon: Package, label: 'Create Session', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    add_batch: { icon: Plus, label: 'Add Batch', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    assign_trimmer: { icon: User, label: 'Assign Trimmer', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    add_trimmer_profile: { icon: UserPlus, label: 'Add to Roster', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    create_harvest: { icon: Sprout, label: 'Create Harvest', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    record_wet_weight: { icon: Scale, label: 'Record Weight', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    allocate_harvest: { icon: ArrowRightLeft, label: 'Allocate', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    record_harvest_waste: { icon: Trash2, label: 'Record Waste', color: 'text-red-600', bgColor: 'bg-red-50' },
    move_harvest: { icon: MapPin, label: 'Move Harvest', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    convert_to_trim: { icon: Scissors, label: 'Send to Trim', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    create_human_task: { icon: ClipboardList, label: 'Task', color: 'text-teal-600', bgColor: 'bg-teal-50' },
};

const FIELD_LABELS: Record<string, string> = {
    harvestName: 'Harvest Name',
    strain: 'Strain',
    licenseNumber: 'License #',
    startWeight: 'Start Weight (g)',
    status: 'Status',
    name: 'Name',
    startTime: 'Start Time',
    tool: 'Tool',
    entryName: 'Batch',
    allocation: 'Allocation',
    plantCount: 'Plant Count',
    dryingLocation: 'Drying Location',
    targetWeight: 'Target Weight (g)',
    weight: 'Weight (g)',
    wasteType: 'Waste Type',
    harvestIdentifier: 'Harvest',
    allocations: 'Allocations',
    title: 'Title',
    description: 'Description',
    priority: 'Priority',
    category: 'Category',
    dueDate: 'Due Date',
    assignee: 'Assignee',
    location: 'Location',
};

const HIDDEN_FIELDS = new Set(['entryId', 'profileId', 'harvestId']);

/** Build a human-readable one-liner from action data */
function summarizeAction(action: ProposedAction): string {
    const d = action.data;
    switch (action.type) {
        case 'create_session':
        case 'add_batch':
            return [d.strain, d.startWeight && `${d.startWeight}g`, d.harvestName].filter(Boolean).join(' · ');
        case 'assign_trimmer':
            return [d.name, d.startTime, d.entryName && `→ ${d.entryName}`].filter(Boolean).join(' · ');
        case 'add_trimmer_profile':
            return d.name || '';
        case 'create_harvest':
            return [d.strain, d.plantCount && `${d.plantCount} plants`, d.allocation].filter(Boolean).join(' · ');
        case 'record_wet_weight':
            return [d.harvestIdentifier, d.weight && `${d.weight}g`].filter(Boolean).join(' · ');
        case 'allocate_harvest':
            return d.harvestIdentifier || '';
        case 'record_harvest_waste':
            return [d.harvestIdentifier, d.wasteType, d.weight && `${d.weight}g`].filter(Boolean).join(' · ');
        case 'move_harvest':
            return [d.harvestIdentifier, d.dryingLocation && `→ ${d.dryingLocation}`].filter(Boolean).join(' ');
        default:
            return Object.values(d).filter(v => v && !HIDDEN_FIELDS.has(String(v))).slice(0, 3).join(' · ');
    }
}

function ActionItem({
    action,
    index,
    isReadonly,
    isExecuting,
    status,
    onEditAction,
}: {
    action: ProposedAction;
    index: number;
    isReadonly: boolean;
    isExecuting?: boolean;
    status?: 'confirmed' | 'cancelled';
    onEditAction?: (index: number, data: Record<string, any>) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const config = ACTION_CONFIG[action.type] || ACTION_CONFIG.add_batch;
    const Icon = config.icon;
    const summary = summarizeAction(action);
    const editableFields = Object.entries(action.data).filter(([key]) => !HIDDEN_FIELDS.has(key));

    return (
        <div className={`rounded-lg border transition-colors ${
            status === 'cancelled' ? 'border-gray-100 opacity-40' :
            status === 'confirmed' ? 'border-emerald-200 bg-emerald-50/30' :
            expanded ? 'border-gray-300 bg-white shadow-sm' :
            'border-gray-200 bg-white hover:border-gray-300'
        }`}>
            {/* Summary row — always visible */}
            <button
                type="button"
                onClick={() => !isReadonly && setExpanded(!expanded)}
                disabled={isReadonly}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default"
            >
                {/* Status icon */}
                <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                    status === 'confirmed' ? 'bg-emerald-100' :
                    status === 'cancelled' ? 'bg-gray-100' :
                    config.bgColor
                }`}>
                    {status === 'confirmed' ? <Check size={14} className="text-emerald-600" /> :
                     status === 'cancelled' ? <X size={14} className="text-gray-400" /> :
                     <Icon size={14} className={config.color} />}
                </div>

                {/* Label + summary */}
                <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${
                        status === 'confirmed' ? 'text-emerald-700' :
                        status === 'cancelled' ? 'text-gray-400' :
                        'text-gray-900'
                    }`}>
                        {config.label}
                    </span>
                    {summary && (
                        <span className="text-sm text-gray-500 ml-2">{summary}</span>
                    )}
                </div>

                {/* Expand chevron */}
                {!isReadonly && (
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                )}
            </button>

            {/* Expanded edit fields */}
            {expanded && !isReadonly && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                    {editableFields.map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 w-28 flex-shrink-0 text-right">
                                {FIELD_LABELS[key] || key}
                            </label>
                            <input
                                type={typeof value === 'number' ? 'number' : 'text'}
                                value={value ?? ''}
                                onChange={(e) => {
                                    const newVal = typeof value === 'number'
                                        ? parseFloat(e.target.value) || 0
                                        : e.target.value;
                                    onEditAction?.(index, { [key]: newVal });
                                }}
                                disabled={isExecuting}
                                className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md
                                           focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                           disabled:bg-gray-50 disabled:text-gray-400"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const ActionPreview = ({ actions, onConfirm, onCancel, onEditAction, isExecuting, readonly, status }: ActionPreviewProps) => {
    const isReadonly = readonly || status === 'confirmed' || status === 'cancelled';

    return (
        <div className="space-y-2">
            {/* Status header */}
            <div className="flex items-center gap-2 px-1">
                <span className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 ${
                    status === 'confirmed' ? 'text-emerald-600' :
                    status === 'cancelled' ? 'text-gray-400' :
                    'text-gray-500'
                }`}>
                    {status === 'confirmed' && <CheckCircle2 size={12} />}
                    {status === 'cancelled' && <XCircle size={12} />}
                    {status === 'confirmed' ? `${actions.length} applied` :
                     status === 'cancelled' ? `Cancelled` :
                     `${actions.length} action${actions.length !== 1 ? 's' : ''}`}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Action list */}
            {actions.map((action, index) => (
                <ActionItem
                    key={index}
                    action={action}
                    index={index}
                    isReadonly={isReadonly}
                    isExecuting={isExecuting}
                    status={status}
                    onEditAction={onEditAction}
                />
            ))}

            {/* Confirm / Cancel */}
            {!isReadonly && (
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onConfirm}
                        disabled={isExecuting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                                   bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Applying...
                            </>
                        ) : (
                            <>
                                <Check size={14} />
                                Confirm
                            </>
                        )}
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={isExecuting}
                        className="px-3 py-2.5 rounded-lg text-gray-400 text-sm
                                   hover:text-gray-600 hover:bg-gray-50
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};
