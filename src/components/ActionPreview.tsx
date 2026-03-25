import { Package, Plus, UserPlus, User, Loader2, Check, X, Sprout, Scale, ArrowRightLeft, Trash2, MapPin } from 'lucide-react';
import type { ProposedAction } from '../types/definitions';

interface ActionPreviewProps {
    actions: ProposedAction[];
    onConfirm: () => void;
    onCancel: () => void;
    onEditAction: (index: number, data: Record<string, any>) => void;
    isExecuting: boolean;
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
    profileId: 'Profile ID',
    entryId: 'Entry ID',
    allocation: 'Allocation',
    plantCount: 'Plant Count',
    dryingLocation: 'Drying Location',
    targetWeight: 'Target Weight (g)',
    weight: 'Weight (g)',
    wasteType: 'Waste Type',
    harvestId: 'Harvest ID',
    harvestIdentifier: 'Harvest',
    allocations: 'Allocations',
};

const HIDDEN_FIELDS = ['entryId', 'profileId', 'harvestId'];

export const ActionPreview = ({ actions, onConfirm, onCancel, onEditAction, isExecuting }: ActionPreviewProps) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Review Actions ({actions.length})
                </span>
                <div className="h-px flex-1 bg-gray-200" />
            </div>

            {actions.map((action, index) => {
                const config = ACTION_CONFIG[action.type] || ACTION_CONFIG.add_batch;
                const Icon = config.icon;

                return (
                    <div
                        key={index}
                        className="border border-gray-200 rounded-lg bg-white overflow-hidden"
                    >
                        <div className={`flex items-center gap-2 px-3 py-2 ${config.bgColor}`}>
                            <Icon size={14} className={config.color} />
                            <span className={`text-xs font-semibold ${config.color}`}>
                                {config.label}
                            </span>
                        </div>
                        <div className="px-3 py-2 space-y-1.5">
                            {Object.entries(action.data)
                                .filter(([key]) => !HIDDEN_FIELDS.includes(key))
                                .map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <label className="text-xs text-gray-500 w-28 flex-shrink-0">
                                            {FIELD_LABELS[key] || key}
                                        </label>
                                        <input
                                            type={typeof value === 'number' ? 'number' : 'text'}
                                            value={value ?? ''}
                                            onChange={(e) => {
                                                const newVal = typeof value === 'number'
                                                    ? parseFloat(e.target.value) || 0
                                                    : e.target.value;
                                                onEditAction(index, { [key]: newVal });
                                            }}
                                            disabled={isExecuting}
                                            className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded
                                                       focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400
                                                       disabled:bg-gray-50 disabled:text-gray-400"
                                        />
                                    </div>
                                ))}
                        </div>
                    </div>
                );
            })}

            <div className="flex gap-2 pt-1">
                <button
                    onClick={onConfirm}
                    disabled={isExecuting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                               bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium
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
                            Confirm All
                        </>
                    )}
                </button>
                <button
                    onClick={onCancel}
                    disabled={isExecuting}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium
                               hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
