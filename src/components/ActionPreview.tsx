import { useState } from 'react';
import { Package, Plus, UserPlus, User, Loader2, Check, X, Sprout, Scale, ArrowRightLeft, Trash2, MapPin, CheckCircle2, XCircle, ChevronDown, Scissors, ClipboardList, Send, UserMinus, RefreshCw, Pencil, Leaf, MoveRight, TrendingUp, Skull, KeyRound, Tag, Upload, LayoutGrid } from 'lucide-react';
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
    delete_harvest: { icon: Trash2, label: 'Delete Harvest', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_harvest: { icon: Pencil, label: 'Update Harvest', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_batch: { icon: Trash2, label: 'Delete Batch', color: 'text-red-600', bgColor: 'bg-red-50' },
    change_batch_status: { icon: RefreshCw, label: 'Change Status', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    submit_session: { icon: Send, label: 'Submit Session', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    remove_trimmer: { icon: UserMinus, label: 'Remove Trimmer', color: 'text-red-600', bgColor: 'bg-red-50' },
    delete_trimmer_profile: { icon: UserMinus, label: 'Remove from Roster', color: 'text-red-600', bgColor: 'bg-red-50' },
    create_human_task: { icon: ClipboardList, label: 'Create Task', color: 'text-teal-600', bgColor: 'bg-teal-50' },
    update_human_task: { icon: ClipboardList, label: 'Update Task', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_human_task: { icon: Trash2, label: 'Delete Task', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Plant management
    create_planting: { icon: Leaf, label: 'Create Planting', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    move_plants: { icon: MoveRight, label: 'Move Plants', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    change_plant_phase: { icon: TrendingUp, label: 'Change Phase', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    destroy_plants: { icon: Skull, label: 'Destroy Plants', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_plant_health: { icon: Sprout, label: 'Update Health', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    // Strain & license
    create_strain: { icon: Leaf, label: 'Add Strain', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    delete_strain: { icon: Trash2, label: 'Delete Strain', color: 'text-red-600', bgColor: 'bg-red-50' },
    create_license: { icon: KeyRound, label: 'Add License', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_license: { icon: Trash2, label: 'Delete License', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Tags
    import_tags: { icon: Upload, label: 'Import Tags', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    assign_tag: { icon: Tag, label: 'Assign Tag', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    auto_assign_tags: { icon: Tag, label: 'Auto-assign Tags', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    // Rooms
    create_room: { icon: LayoutGrid, label: 'Create Room', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_room: { icon: LayoutGrid, label: 'Update Room', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_room: { icon: Trash2, label: 'Delete Room', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Packages
    create_package: { icon: Package, label: 'Create Package', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_package: { icon: Package, label: 'Update Package', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    finish_package: { icon: Package, label: 'Finish Package', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    delete_package: { icon: Trash2, label: 'Delete Package', color: 'text-red-600', bgColor: 'bg-red-50' },
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
    taskId: 'Task ID',
    taskTitle: 'Task',
    newStatus: 'New Status',
    trimmerName: 'Trimmer',
    profileName: 'Name',
    // Plant fields
    plantingType: 'Type',
    strainName: 'Strain',
    roomName: 'Room',
    roomType: 'Room Type',
    capacity: 'Capacity',
    squareFootage: 'Sq Ft',
    count: 'Count',
    batchType: 'Batch Type',
    batchName: 'Batch Name',
    growthPhase: 'Growth Phase',
    labelPrefix: 'Label Prefix',
    targetRoomName: 'Destination',
    sourceRoomName: 'From Room',
    entityType: 'Entity Type',
    plantIds: 'Plant IDs',
    targetPhase: 'Target Phase',
    // License
    licenseId: 'License ID',
    strainId: 'Strain ID',
    tagNumber: 'Tag Number',
    tagNumbers: 'Tag Numbers',
    tagType: 'Tag Type',
    plantIdentifier: 'Plant',
    // Package fields
    packageType: 'Type',
    label: 'Label',
    quantity: 'Quantity (g)',
    wasteWeight: 'Waste (g)',
    itemName: 'Item Name',
    packageId: 'Package ID',
    labTestingState: 'Lab Testing',
};

const HIDDEN_FIELDS = new Set(['entryId', 'profileId', 'harvestId', 'taskId', 'onCompleteAction']);

/** Key fields shown inline per action type — everything else is behind expand */
const KEY_FIELDS: Record<string, string[]> = {
    create_session: ['strain', 'startWeight', 'harvestName'],
    add_batch: ['strain', 'startWeight', 'harvestName'],
    assign_trimmer: ['name', 'startTime', 'entryName'],
    add_trimmer_profile: ['name'],
    create_harvest: ['strain', 'plantCount', 'allocation'],
    record_wet_weight: ['harvestIdentifier', 'weight'],
    allocate_harvest: ['harvestIdentifier', 'allocations'],
    record_harvest_waste: ['harvestIdentifier', 'wasteType', 'weight'],
    move_harvest: ['harvestIdentifier', 'dryingLocation'],
    convert_to_trim: ['harvestIdentifier'],
    delete_harvest: ['harvestName'],
    update_harvest: ['harvestName', 'strain', 'plantCount'],
    delete_batch: ['entryName'],
    change_batch_status: ['entryName', 'newStatus'],
    submit_session: [],
    remove_trimmer: ['entryName', 'trimmerName'],
    delete_trimmer_profile: ['profileName'],
    create_human_task: ['title', 'priority', 'category'],
    update_human_task: ['taskTitle', 'status', 'priority', 'assignee'],
    delete_human_task: ['taskTitle'],
    create_planting: ['strainName', 'roomName', 'count'],
    move_plants: ['strain', 'targetRoomName', 'sourceRoomName'],
    change_plant_phase: ['strain', 'targetPhase', 'targetRoomName'],
    destroy_plants: ['strain', 'roomName'],
    update_plant_health: ['strain', 'roomName'],
    create_strain: ['name'],
    delete_strain: ['strainName'],
    create_license: ['licenseNumber'],
    delete_license: ['licenseNumber'],
    import_tags: ['tagNumbers'],
    assign_tag: ['tagNumber', 'plantIdentifier'],
    auto_assign_tags: ['strain', 'roomName'],
    // Packages
    create_package: ['label', 'packageType', 'strain', 'quantity'],
    update_package: ['label', 'status', 'labTestingState'],
    finish_package: ['label'],
    delete_package: ['label'],
};

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
        case 'delete_harvest':
            return d.harvestName || '';
        case 'update_harvest':
            return [d.harvestName, d.strain].filter(Boolean).join(' · ');
        case 'delete_batch':
            return d.entryName || '';
        case 'change_batch_status':
            return [d.entryName, `→ ${d.newStatus}`].filter(Boolean).join(' ');
        case 'submit_session':
            return 'Close active session';
        case 'remove_trimmer':
            return [d.trimmerName, d.entryName && `from ${d.entryName}`].filter(Boolean).join(' ');
        case 'delete_trimmer_profile':
            return d.profileName || '';
        case 'create_human_task':
            return d.title || '';
        case 'update_human_task':
            return [d.taskTitle, d.status, d.assignee].filter(Boolean).join(' · ');
        case 'delete_human_task':
            return d.taskTitle || '';
        case 'create_package':
            return [d.label, d.packageType, d.strain, d.quantity && `${d.quantity}g`].filter(Boolean).join(' · ');
        case 'update_package':
        case 'finish_package':
        case 'delete_package':
            return d.label || '';
        default:
            return Object.values(d).filter(v => v && !HIDDEN_FIELDS.has(String(v))).slice(0, 3).join(' · ');
    }
}

/** Fields that should render as dropdowns with constrained options */
const SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
    priority: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' },
    ],
    category: [
        { value: 'drying_curing', label: 'Drying/Curing' },
        { value: 'ipm', label: 'IPM' },
        { value: 'compliance', label: 'Compliance' },
        { value: 'equipment', label: 'Equipment' },
        { value: 'environmental', label: 'Environmental' },
        { value: 'packaging', label: 'Packaging' },
        { value: 'qc_testing', label: 'QC/Testing' },
        { value: 'inventory', label: 'Inventory' },
        { value: 'transportation', label: 'Transportation' },
        { value: 'sanitation', label: 'Sanitation' },
        { value: 'training', label: 'Training' },
        { value: 'trim', label: 'Trim' },
        { value: 'harvest', label: 'Harvest' },
        { value: 'other', label: 'Other' },
    ],
    status: [
        { value: 'pending', label: 'Pending' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' },
    ],
    tool: [
        { value: 'scissors', label: 'Scissors' },
        { value: 'machine', label: 'Machine' },
    ],
    allocation: [
        { value: 'Flower', label: 'Flower (Dry Trim)' },
        { value: 'Frozen', label: 'Fresh Frozen' },
        { value: 'Both', label: 'Both' },
    ],
    newStatus: [
        { value: 'upcoming', label: 'Upcoming' },
        { value: 'active', label: 'Active' },
        { value: 'submitted', label: 'Submitted' },
    ],
    packageType: [
        { value: 'flower', label: 'Flower' },
        { value: 'trim', label: 'Trim' },
        { value: 'shake', label: 'Shake' },
        { value: 'fresh_frozen', label: 'Fresh Frozen' },
    ],
    labTestingState: [
        { value: 'not_submitted', label: 'Not Submitted' },
        { value: 'submitted', label: 'Submitted' },
        { value: 'passed', label: 'Passed' },
        { value: 'failed', label: 'Failed' },
    ],
    wasteType: [
        { value: 'powdery_mildew', label: 'Powdery Mildew' },
        { value: 'bud_rot', label: 'Bud Rot' },
        { value: 'insects', label: 'Insects' },
        { value: 'stems', label: 'Stems' },
        { value: 'leaves', label: 'Leaves' },
        { value: 'plant_material', label: 'Plant Material' },
        { value: 'fibrous', label: 'Fibrous' },
        { value: 'root_ball', label: 'Root Ball' },
        { value: 'other', label: 'Other' },
    ],
};

function FieldRow({
    fieldKey,
    value,
    isExecuting,
    isReadonly,
    onChange,
}: {
    fieldKey: string;
    value: any;
    isExecuting?: boolean;
    isReadonly: boolean;
    onChange: (newVal: any) => void;
}) {
    const options = SELECT_OPTIONS[fieldKey];

    return (
        <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-24 flex-shrink-0 text-right">
                {FIELD_LABELS[fieldKey] || fieldKey}
            </label>
            {isReadonly ? (
                <span className="flex-1 text-sm text-gray-700 px-2 py-1">
                    {options
                        ? options.find(o => o.value === value)?.label || String(value ?? '—')
                        : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                </span>
            ) : options ? (
                <select
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={isExecuting}
                    className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md bg-white
                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                               disabled:bg-gray-50 disabled:text-gray-400"
                >
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(e) => {
                        onChange(typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value);
                    }}
                    disabled={isExecuting}
                    className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                               disabled:bg-gray-50 disabled:text-gray-400"
                />
            )}
        </div>
    );
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

    const allFields = Object.entries(action.data).filter(([key]) => !HIDDEN_FIELDS.has(key));
    const keyFieldNames = new Set(KEY_FIELDS[action.type] || []);
    const keyFields = allFields.filter(([key]) => keyFieldNames.has(key));
    const secondaryFields = allFields.filter(([key]) => !keyFieldNames.has(key));
    const hasSecondary = secondaryFields.length > 0;

    return (
        <div className={`rounded-lg border transition-colors ${
            status === 'cancelled' ? 'border-gray-100 opacity-40' :
            status === 'confirmed' ? 'border-emerald-200' :
            'border-gray-200 bg-white'
        }`}>
            {/* Header — colored bar with icon + label + summary */}
            <div className={`flex items-center gap-2 px-3 py-2 ${
                status === 'confirmed' ? 'bg-emerald-50' : config.bgColor
            }`}>
                {status === 'confirmed' ? (
                    <Check size={14} className="text-emerald-500" />
                ) : status === 'cancelled' ? (
                    <X size={14} className="text-gray-400" />
                ) : (
                    <Icon size={14} className={config.color} />
                )}
                <span className={`text-xs font-semibold ${
                    status === 'confirmed' ? 'text-emerald-600' :
                    status === 'cancelled' ? 'text-gray-400' :
                    config.color
                }`}>
                    {config.label}
                </span>
                {summary && (
                    <span className="text-xs text-gray-500 ml-1 truncate">{summary}</span>
                )}
            </div>

            {/* Key fields — always visible */}
            {keyFields.length > 0 && (
                <div className="px-3 py-2 space-y-1.5">
                    {keyFields.map(([key, value]) => (
                        <FieldRow
                            key={key}
                            fieldKey={key}
                            value={value}
                            isExecuting={isExecuting}
                            isReadonly={isReadonly}
                            onChange={(newVal) => onEditAction?.(index, { [key]: newVal })}
                        />
                    ))}
                </div>
            )}

            {/* Secondary fields — behind expand */}
            {hasSecondary && !isReadonly && (
                <>
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 transition-colors"
                    >
                        <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        {expanded ? 'Less' : `${secondaryFields.length} more`}
                    </button>
                    {expanded && (
                        <div className="px-3 pb-2 space-y-1.5">
                            {secondaryFields.map(([key, value]) => (
                                <FieldRow
                                    key={key}
                                    fieldKey={key}
                                    value={value}
                                    isExecuting={isExecuting}
                                    isReadonly={isReadonly}
                                    onChange={(newVal) => onEditAction?.(index, { [key]: newVal })}
                                />
                            ))}
                            {action.data.onCompleteAction && (
                                <div className="flex items-start gap-2 mt-1 pt-1.5 border-t border-gray-100">
                                    <span className="text-xs text-gray-500 w-28 flex-shrink-0 text-right">On Complete</span>
                                    <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                                        {(action.data.onCompleteAction as any).type?.replace(/_/g, ' ')}
                                        {' — '}
                                        {Object.entries((action.data.onCompleteAction as any).data || {})
                                            .filter(([, v]) => v && typeof v !== 'object')
                                            .slice(0, 3)
                                            .map(([, v]) => String(v))
                                            .join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </>
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
