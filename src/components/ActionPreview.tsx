import { useState } from 'react';
import { Package, Plus, UserPlus, User, Loader2, Check, X, Sprout, Scale, ArrowRightLeft, Trash2, MapPin, CheckCircle2, XCircle, ChevronDown, Scissors, ClipboardList, Send, UserMinus, RefreshCw, Pencil, Leaf, MoveRight, TrendingUp, Skull, KeyRound, Tag, Upload, LayoutGrid, ArrowRight, Percent, Flame, Snowflake, Droplets, Mail, Truck } from 'lucide-react';
import type { ProposedAction } from '../types/definitions';
import { TERPENE_TAG_LABELS } from '../types/definitions';
import { TypeChip } from './ui';

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
    add_trimmer_profile: { icon: UserPlus, label: 'Add to Roster', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    create_harvest: { icon: Sprout, label: 'Create Harvest', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    record_wet_weight: { icon: Scale, label: 'Record Weight', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    allocate_harvest: { icon: ArrowRightLeft, label: 'Allocate', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    record_harvest_waste: { icon: Trash2, label: 'Record Waste', color: 'text-red-600', bgColor: 'bg-red-50' },
    move_harvest: { icon: MapPin, label: 'Move Harvest', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    convert_to_trim: { icon: Scissors, label: 'Send to Trim', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    delete_harvest: { icon: Trash2, label: 'Delete Harvest', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_harvest: { icon: Pencil, label: 'Update Harvest', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_batch: { icon: Trash2, label: 'Delete Batch', color: 'text-red-600', bgColor: 'bg-red-50' },
    change_batch_status: { icon: RefreshCw, label: 'Change Status', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    submit_session: { icon: Send, label: 'Submit Session', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    remove_trimmer: { icon: UserMinus, label: 'Remove Trimmer', color: 'text-red-600', bgColor: 'bg-red-50' },
    delete_trimmer_profile: { icon: UserMinus, label: 'Remove from Roster', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_trimmer_profile: { icon: User, label: 'Update Profile', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    update_batch_weight: { icon: Scale, label: 'Update Weight', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    create_human_task: { icon: ClipboardList, label: 'Create Task', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_human_task: { icon: ClipboardList, label: 'Update Task', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_human_task: { icon: Trash2, label: 'Delete Task', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Plant management
    create_planting: { icon: Leaf, label: 'Create Planting', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    move_plants: { icon: MoveRight, label: 'Move Plants', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    change_plant_phase: { icon: TrendingUp, label: 'Change Phase', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    destroy_plants: { icon: Skull, label: 'Destroy Plants', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_plant_health: { icon: Sprout, label: 'Update Health', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    // Strain & license
    create_strain: { icon: Leaf, label: 'Add Strain', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_strain: { icon: Leaf, label: 'Update Strain', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_strain: { icon: Trash2, label: 'Delete Strain', color: 'text-red-600', bgColor: 'bg-red-50' },
    create_license: { icon: KeyRound, label: 'Add License', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_license: { icon: Trash2, label: 'Delete License', color: 'text-red-600', bgColor: 'bg-red-50' },
    update_license: { icon: KeyRound, label: 'Update License', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    // Tags
    import_tags: { icon: Upload, label: 'Import Tags', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    assign_tag: { icon: Tag, label: 'Assign Tag', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    auto_assign_tags: { icon: Tag, label: 'Auto-assign Tags', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    // Rooms
    create_room: { icon: LayoutGrid, label: 'Create Room', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_room: { icon: LayoutGrid, label: 'Update Room', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_room: { icon: Trash2, label: 'Delete Room', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Vendors / Suppliers
    create_vendor: { icon: Truck, label: 'Add Vendor', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_vendor: { icon: Truck, label: 'Update Vendor', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    delete_vendor: { icon: Trash2, label: 'Archive Vendor', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Packages
    create_package: { icon: Package, label: 'Create Package', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    update_package: { icon: Package, label: 'Update Package', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    finish_package: { icon: Package, label: 'Finish Package', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    delete_package: { icon: Trash2, label: 'Delete Package', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Extraction
    record_extraction: { icon: ArrowRightLeft, label: 'Extraction', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    start_extraction_run: { icon: Flame, label: 'Start Run', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    amend_extraction_run_inputs: { icon: Plus, label: 'Add to Run', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    cancel_extraction_run: { icon: X, label: 'Cancel Run', color: 'text-red-600', bgColor: 'bg-red-50' },
    // Supplier outreach
    compose_supplier_email: { icon: Mail, label: 'Supplier Email', color: 'text-blue-600', bgColor: 'bg-blue-50' },
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
    // Strain variety fields
    phenotype: 'Phenotype',
    terpeneTags: 'Terpenes',
    expectedYieldPct: 'Yield %',
    defaultVegDays: 'Veg days',
    defaultFloweringDays: 'Flower days',
    stretchTrait: 'Stretch',
    // Vendor / supplier fields
    vendorName: 'Vendor',
    vendorType: 'Type',
    contactName: 'Contact',
    contactEmail: 'Email',
    contactPhone: 'Phone',
    leadTimeDays: 'Lead time (days)',
    orderCadenceDays: 'Order cadence (days)',
    strainsGrown: 'Strains',
    qualityNotes: 'Quality notes',
    preferredUnits: 'Unit',
    preferredChannel: 'Channel',
    outreachCadenceDays: 'Outreach cadence (days)',
    isActive: 'Active',
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
    // Extraction fields (record_extraction)
    sourcePackageLabel: 'Source',
    inputPackageType: 'Input',
    inputQuantity: 'Input (g)',
    outputPackageType: 'Output',
    outputQuantity: 'Output (g)',
    outputLabel: 'Output Label',
    // Extraction run fields (start_extraction_run)
    templateName: 'Template',
    runName: 'Run name',
    inputMaterial: 'Input',
    inputQuantityG: 'Quantity (g)',
    targetProduct: 'Target',
    plannedStart: 'Scheduled for',
    runIdentifier: 'Run',
    notes: 'Notes',
    // Supplier email fields
    subject: 'Subject',
    bodyText: 'Body',
    reason: 'Why',
};

const HIDDEN_FIELDS = new Set([
    // Internal DB IDs — never user-facing
    'entryId', 'profileId', 'harvestId', 'taskId', 'strainId', 'licenseId',
    'packageId', 'runId', 'templateId',
    // Hybrid task completion wrapper — rendered separately with its own label
    'onCompleteAction',
    // Extraction — source package resolution is server-side
    'sourcePackageId', 'sourcePackageLabel',
    'sourcePackageIds', 'sourcePackageQuantities',
    'addedSourcePackageIds', 'addedSourcePackageQuantities',
    // Extraction — complex array payloads rendered via the summary line
    'inputs', 'addedInputs',
    // Extraction — backend bookkeeping
    'templateMatched', 'inputMismatch',
]);

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
    create_strain: ['name', 'phenotype', 'terpeneTags', 'expectedYieldPct'],
    update_strain: ['strainName', 'phenotype', 'terpeneTags', 'expectedYieldPct'],
    delete_strain: ['strainName'],
    create_license: ['licenseNumber'],
    delete_license: ['licenseNumber'],
    update_license: ['licenseNumber', 'label'],
    update_trimmer_profile: ['profileName', 'name', 'role', 'status'],
    update_batch_weight: ['entryName', 'weightType', 'value'],
    import_tags: ['tagNumbers'],
    assign_tag: ['tagNumber', 'plantIdentifier'],
    auto_assign_tags: ['strain', 'roomName'],
    // Packages
    create_package: ['label', 'packageType', 'strain', 'quantity'],
    update_package: ['label', 'status', 'labTestingState'],
    finish_package: ['label'],
    delete_package: ['label'],
    // Extraction
    record_extraction: ['strain', 'inputPackageType', 'inputQuantity', 'outputPackageType', 'outputQuantity'],
    start_extraction_run: ['templateName', 'runName', 'strain', 'inputMaterial', 'inputQuantityG', 'targetProduct'],
    // Supplier email — rendered via custom branch; key fields list is empty
    // because `ActionItem` has a dedicated render path for this action type.
    compose_supplier_email: [],
    // Vendors / Suppliers
    create_vendor: ['name', 'vendorType', 'contactEmail', 'strainsGrown'],
    update_vendor: ['vendorName', 'vendorType', 'contactEmail', 'strainsGrown'],
    delete_vendor: ['vendorName'],
};

/** Fields FieldRow should render as a multi-line textarea. Parallels DATE_TIME_FIELDS. */
const TEXTAREA_FIELDS = new Set(['bodyText']);

/** Fields whose value is `string[]` — rendered as editable chip list with add/remove. */
const CHIP_ARRAY_FIELDS = new Set(['strainsGrown', 'terpeneTags']);

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
        case 'record_extraction':
            return [
                d.strain,
                d.inputQuantity && `${d.inputQuantity}g ${d.inputPackageType?.replace('_', ' ')}`,
                d.outputQuantity ? `→ ${d.outputQuantity}g ${d.outputPackageType?.replace('_', ' ')}` : `→ ${d.outputPackageType?.replace('_', ' ')} (pending)`,
            ].filter(Boolean).join(' ');
        case 'start_extraction_run': {
            // Prefer inputs[] array; fall back to legacy singular fields.
            const inputsArr = Array.isArray(d.inputs) ? d.inputs : [];
            let inputsText = '';
            if (inputsArr.length > 0) {
                inputsText = inputsArr
                    .map((i: { packageType?: string; quantity?: number; unit?: string }) => {
                        const typ = (i.packageType || '').replace(/_/g, ' ');
                        if (i.quantity) return `${i.quantity}${i.unit || 'g'} ${typ}`.trim();
                        return typ;
                    })
                    .filter(Boolean)
                    .join(' + ');
            } else if (d.inputQuantityG) {
                inputsText = `${d.inputQuantityG}g ${(d.inputMaterial || '').replace(/_/g, ' ')}`.trim();
            } else if (d.inputMaterial) {
                inputsText = d.inputMaterial.replace(/_/g, ' ');
            }
            const targetLabel = d.targetProduct
                ? String(d.targetProduct).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                : null;
            return [
                d.strain,
                d.templateName,
                inputsText,
                targetLabel && `→ ${targetLabel}`,
                d.status === 'planned' && '(scheduled)',
            ].filter(Boolean).join(' · ');
        }
        case 'amend_extraction_run_inputs': {
            // "Add 4 more packages to the Multi-Strain Trim to Distillate run"
            const addedArr = Array.isArray(d.addedInputs) ? d.addedInputs : [];
            const addedText = addedArr
                .map((i: { packageType?: string; quantity?: number; unit?: string; strain?: string }) => {
                    const typ = (i.packageType || '').replace(/_/g, ' ');
                    const strainLabel = i.strain ? `${i.strain} ` : '';
                    if (i.quantity) return `${strainLabel}${i.quantity}${i.unit || 'g'} ${typ}`.trim();
                    return `${strainLabel}${typ}`.trim();
                })
                .filter(Boolean)
                .join(' + ');
            return [
                d.runName,
                addedText && `+ ${addedText}`,
            ].filter(Boolean).join(' · ');
        }
        case 'cancel_extraction_run':
            return d.runName || d.runId || '';
        case 'compose_supplier_email':
            return [d.vendorName, d.subject].filter(Boolean).join(' · ');
        case 'update_trimmer_profile':
            return [d.profileName, d.name && `→ ${d.name}`, d.role, d.status].filter(Boolean).join(' · ');
        case 'update_batch_weight':
            return [d.entryName, `${d.weightType} → ${d.value}g`].filter(Boolean).join(' · ');
        case 'update_license':
            return [d.licenseNumber, `label → "${d.label}"`].filter(Boolean).join(' · ');
        default:
            // Generic fallback: take the first few primitive, user-facing
            // values. Filter by KEY (not value) against HIDDEN_FIELDS, and
            // skip arrays/objects so we never render "[object Object]" in
            // the summary row.
            return Object.entries(d)
                .filter(([k, v]) =>
                    !HIDDEN_FIELDS.has(k)
                    && v !== null
                    && v !== undefined
                    && v !== ''
                    && typeof v !== 'object'
                )
                .slice(0, 3)
                .map(([, v]) => String(v))
                .join(' · ');
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
        { value: 'cultivation', label: 'Cultivation' },
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
    vendorType: [
        { value: 'consumables', label: 'Consumables' },
        { value: 'biomass', label: 'Biomass' },
        { value: 'both', label: 'Both' },
    ],
    preferredChannel: [
        { value: 'email', label: 'Email' },
        { value: 'sms', label: 'SMS' },
    ],
    phenotype: [
        { value: 'sativa', label: 'Sativa' },
        { value: 'indica', label: 'Indica' },
        { value: 'hybrid', label: 'Hybrid' },
    ],
    stretchTrait: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
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
        { value: 'bubble_hash', label: 'Bubble Hash' },
        { value: 'rosin', label: 'Rosin' },
        { value: 'rosin_cart', label: 'Rosin Cart' },
    ],
    inputPackageType: [
        { value: 'fresh_frozen', label: 'Fresh Frozen' },
        { value: 'bubble_hash', label: 'Bubble Hash' },
        { value: 'rosin', label: 'Rosin' },
    ],
    outputPackageType: [
        { value: 'bubble_hash', label: 'Bubble Hash' },
        { value: 'rosin', label: 'Rosin' },
        { value: 'rosin_cart', label: 'Rosin Cart' },
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

/**
 * Fields whose value is a cultivation/extraction material type and should
 * render as an iconed, colored category chip instead of an editable text
 * input. The chip style mirrors `CategoryBadge` in the Ordering module
 * (`src/components/Ordering/ProductCatalog.tsx`) — small 11px uppercase-ish
 * pill with a type-specific color + lucide icon.
 *
 * TODO: The Packages inventory (`src/components/Packages/PackageCard.tsx`)
 * still uses the older `.status-badge` treatment (src/index.css line 4268+).
 * Migrate it to this same chip so every package-type reference across the
 * app reads identically. See project memory:
 * `project_chip_system_consolidation.md`.
 */
const PACKAGE_TYPE_FIELDS = new Set([
    'packageType', 'inputPackageType', 'outputPackageType',
    'inputMaterial', 'targetProduct',
]);

/**
 * Fields whose value is a reference to a DB entity or catalog entry.
 * These render as locked read-only text — allowing free-text edits here
 * would let users silently create mismatches with the canonical record
 * (e.g., typing "Sour Deisel" instead of "Sour Diesel"). If a reference
 * is wrong, users should cancel and re-prompt the agent, not type a fix.
 */
const DATE_TIME_FIELDS = new Set(['plannedStart']);

const DISPLAY_ONLY_FIELDS = new Set([
    // Strain references
    'strain', 'strainName',
    // Extraction template + run identifier
    'templateName', 'runName', 'runIdentifier',
    // Harvest / batch identifiers
    'harvestName', 'harvestIdentifier', 'entryName',
    // Room references
    'roomName', 'sourceRoomName', 'targetRoomName', 'dryingLocation',
    // License references
    'licenseNumber',
    // Trimmer / task references
    'profileName', 'trimmerName', 'taskTitle', 'plantIdentifier',
]);

/**
 * Per-action-type label overrides. Lets a single schema key read
 * differently depending on the action it's attached to — e.g., `status`
 * on an extraction run is really "when does this run start", not a
 * generic database status, so we label it "Start when".
 */
const LABELS_BY_ACTION: Record<string, Record<string, string>> = {
    start_extraction_run: {
        status: 'Start when',
    },
};

/**
 * Per-action-type dropdown option overrides. The global SELECT_OPTIONS
 * map is shared across every action and — for keys like `status` — the
 * valid values depend on which entity the action mutates. Extraction
 * runs use `active` / `planned`; human tasks use `pending` / `in_progress`
 * / `completed`. Without this override the dropdown ends up offering the
 * wrong set and the user can silently set an invalid status.
 */
const OPTIONS_BY_ACTION: Record<string, Record<string, Array<{ value: string; label: string }>>> = {
    start_extraction_run: {
        status: [
            { value: 'active', label: 'Start immediately' },
            { value: 'planned', label: 'Schedule for later' },
        ],
    },
};

function ChipArrayEditor({ value, onChange, disabled, labels, placeholder }: { value: any; onChange: (v: string[]) => void; disabled?: boolean; labels?: Record<string, string>; placeholder?: string }) {
    const items: string[] = Array.isArray(value) ? value : [];
    const [draft, setDraft] = useState('');

    const add = () => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        if (items.includes(trimmed)) { setDraft(''); return; }
        onChange([...items, trimmed]);
        setDraft('');
    };
    const remove = (s: string) => onChange(items.filter(i => i !== s));

    return (
        <div className="flex-1 flex flex-wrap items-center gap-1.5 px-2 py-1 border border-gray-200 rounded-md bg-white min-h-[32px]">
            {items.map(s => (
                <span
                    key={s}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs rounded-full"
                    style={{ background: 'rgba(59, 181, 112, 0.12)', color: 'var(--color-flower, #3BB570)' }}
                >
                    {labels?.[s] ?? s}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => remove(s)}
                            className="rounded-full hover:bg-black/10 w-4 h-4 flex items-center justify-center"
                            aria-label={`Remove ${s}`}
                        >
                            <X size={10} />
                        </button>
                    )}
                </span>
            ))}
            {!disabled && (
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
                        if (e.key === 'Backspace' && !draft && items.length) { remove(items[items.length - 1]); }
                    }}
                    onBlur={add}
                    placeholder={items.length ? '' : (placeholder ?? 'Add strain…')}
                    className="flex-1 min-w-[80px] text-xs px-1 py-0.5 outline-none bg-transparent"
                />
            )}
        </div>
    );
}

function DateTimePills({ value, onChange, disabled }: { value: any; onChange: (v: any) => void; disabled?: boolean }) {
    const [showCustom, setShowCustom] = useState(false);

    const toLocal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const now = new Date();
    const tomorrow7am = new Date(now);
    tomorrow7am.setDate(tomorrow7am.getDate() + 1);
    tomorrow7am.setHours(7, 0, 0, 0);

    const monday7am = new Date(now);
    monday7am.setDate(monday7am.getDate() + ((8 - monday7am.getDay()) % 7 || 7));
    monday7am.setHours(7, 0, 0, 0);

    const tomorrowVal = toLocal(tomorrow7am);
    const mondayVal = toLocal(monday7am);
    const showMonday = monday7am > tomorrow7am;

    const isPreset = value === tomorrowVal || value === mondayVal;
    const isCustom = value && !isPreset;

    const formatPreview = (val: string) => {
        if (!val) return '';
        const d = new Date(val);
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            + ' at '
            + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <div className="flex-1 space-y-1.5">
            <div className="start-run-date-presets">
                <button
                    type="button"
                    className={`start-run-date-preset ${!value && !showCustom ? 'start-run-date-preset--active' : ''}`}
                    onClick={() => { onChange(null); setShowCustom(false); }}
                    disabled={disabled}
                >
                    Now
                </button>
                <button
                    type="button"
                    className={`start-run-date-preset ${value === tomorrowVal ? 'start-run-date-preset--active' : ''}`}
                    onClick={() => { onChange(tomorrowVal); setShowCustom(false); }}
                    disabled={disabled}
                >
                    Tomorrow 7am
                </button>
                {showMonday && (
                    <button
                        type="button"
                        className={`start-run-date-preset ${value === mondayVal ? 'start-run-date-preset--active' : ''}`}
                        onClick={() => { onChange(mondayVal); setShowCustom(false); }}
                        disabled={disabled}
                    >
                        Monday 7am
                    </button>
                )}
                <button
                    type="button"
                    className={`start-run-date-preset ${isCustom || showCustom ? 'start-run-date-preset--active' : ''}`}
                    onClick={() => { if (!isCustom) onChange(tomorrowVal); setShowCustom(true); }}
                    disabled={disabled}
                >
                    Pick date
                </button>
            </div>
            {(showCustom || isCustom) && value && (
                <div className="start-run-date-custom">
                    <input
                        type="datetime-local"
                        className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-md
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                   disabled:bg-gray-50 disabled:text-gray-400"
                        value={value}
                        onChange={e => onChange(e.target.value || null)}
                        disabled={disabled}
                    />
                    <span className="text-xs text-gray-500">{formatPreview(value)}</span>
                </div>
            )}
        </div>
    );
}

function FieldRow({
    fieldKey,
    value,
    isExecuting,
    isReadonly,
    actionType,
    onChange,
}: {
    fieldKey: string;
    value: any;
    isExecuting?: boolean;
    isReadonly: boolean;
    actionType?: string;
    onChange: (newVal: any) => void;
}) {
    // Look up options / label with per-action overrides first. Lets a single
    // schema key (`status`, etc.) render differently based on the action
    // context without forking the whole dispatcher.
    const options = (actionType && OPTIONS_BY_ACTION[actionType]?.[fieldKey])
        || SELECT_OPTIONS[fieldKey];
    const label = (actionType && LABELS_BY_ACTION[actionType]?.[fieldKey])
        || FIELD_LABELS[fieldKey]
        || fieldKey;
    const isTypeField = PACKAGE_TYPE_FIELDS.has(fieldKey);
    const isDateTimeField = DATE_TIME_FIELDS.has(fieldKey);
    const isTextareaField = TEXTAREA_FIELDS.has(fieldKey);
    const isChipArrayField = CHIP_ARRAY_FIELDS.has(fieldKey);
    const isDisplayOnly = DISPLAY_ONLY_FIELDS.has(fieldKey);
    // Shared humanizer for readonly text — "active" → "Active",
    // "in_progress" → "In Progress".
    const humanize = (v: unknown): string => {
        if (v === null || v === undefined || v === '') return '—';
        if (options) {
            const match = options.find(o => o.value === v);
            if (match) return match.label;
        }
        if (typeof v === 'object') return JSON.stringify(v);
        const str = String(v);
        return /^[a-z][a-z0-9_]*$/.test(str)
            ? str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : str;
    };

    return (
        <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-24 flex-shrink-0 text-right">
                {label}
            </label>
            {isTypeField ? (
                // Package/material type — render as an ordering-style chip.
                // This is display-only in the preview card: the agent resolves
                // the type from the catalog and users who need to change it
                // should cancel and re-prompt rather than edit the raw value.
                <div className="flex-1 min-w-0">
                    <TypeChip palette="packageType" value={value == null ? null : String(value)} fallback="—" />
                </div>
            ) : isDisplayOnly ? (
                // DB / catalog reference — locked. Rendered as plain text so
                // it reads as a value, not an editable field.
                <span className="flex-1 text-sm px-2 py-1" style={{ color: '#1A1A1A' }}>
                    {humanize(value)}
                </span>
            ) : isReadonly && isChipArrayField ? (
                <ChipArrayEditor
                    value={value}
                    onChange={() => {}}
                    disabled
                    labels={fieldKey === 'terpeneTags' ? TERPENE_TAG_LABELS : undefined}
                />
            ) : isReadonly ? (
                <span className="flex-1 text-sm text-gray-700 px-2 py-1">
                    {humanize(value)}
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
            ) : isChipArrayField ? (
                <ChipArrayEditor
                    value={value}
                    onChange={onChange}
                    disabled={isExecuting}
                    labels={fieldKey === 'terpeneTags' ? TERPENE_TAG_LABELS : undefined}
                    placeholder={fieldKey === 'terpeneTags' ? 'Add terpene tag…' : undefined}
                />
            ) : isDateTimeField ? (
                <DateTimePills value={value} onChange={onChange} disabled={isExecuting} />
            ) : isTextareaField ? (
                <textarea
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={isExecuting}
                    rows={7}
                    className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                               disabled:bg-gray-50 disabled:text-gray-400 resize-y leading-relaxed"
                />
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

const PACKAGE_TYPE_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    rosin_cart: 'Rosin Carts',
};

const PACKAGE_TYPE_ICONS: Record<string, typeof Snowflake> = {
    fresh_frozen: Snowflake,
    bubble_hash: Droplets,
    rosin: Flame,
    rosin_cart: Package,
};

function ExtractionExpandedView({
    data,
    isReadonly,
    isExecuting,
    onFieldChange,
}: {
    data: Record<string, any>;
    isReadonly: boolean;
    isExecuting?: boolean;
    onFieldChange: (field: string, value: any) => void;
}) {
    const [showSecondary, setShowSecondary] = useState(false);

    const inputLabel = PACKAGE_TYPE_LABELS[data.inputPackageType] || data.inputPackageType;
    const outputLabel = PACKAGE_TYPE_LABELS[data.outputPackageType] || data.outputPackageType;
    const InputIcon = PACKAGE_TYPE_ICONS[data.inputPackageType] || Package;
    const OutputIcon = PACKAGE_TYPE_ICONS[data.outputPackageType] || Package;

    const yieldPct = data.inputQuantity && data.outputQuantity
        ? ((data.outputQuantity / data.inputQuantity) * 100).toFixed(1)
        : null;

    return (
        <div style={{ padding: '10px 12px 8px' }}>
            {/* Strain */}
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D', marginBottom: '10px' }}>
                {data.strain}
            </div>

            {/* Flow visualization */}
            <div style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: '0',
                background: '#F8F8F8',
                borderRadius: '10px',
                overflow: 'hidden',
            }}>
                {/* Input side */}
                <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                }}>
                    <InputIcon size={16} style={{ color: '#959595' }} />
                    <span style={{ fontSize: '11px', color: '#959595', fontWeight: 500 }}>
                        {inputLabel}
                    </span>
                    {isReadonly ? (
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#2D2D2D' }}>
                            {data.inputQuantity ? `${Number(data.inputQuantity).toLocaleString()}g` : '—'}
                        </span>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                            <input
                                type="number"
                                value={data.inputQuantity ?? ''}
                                onChange={(e) => onFieldChange('inputQuantity', parseFloat(e.target.value) || 0)}
                                disabled={isExecuting}
                                style={{
                                    width: '80px',
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: '#2D2D2D',
                                    textAlign: 'center',
                                    border: '1px solid #E5E5E5',
                                    borderRadius: '6px',
                                    padding: '2px 4px',
                                    background: 'white',
                                    fontFamily: 'inherit',
                                }}
                            />
                            <span style={{ fontSize: '12px', color: '#959595' }}>g</span>
                        </div>
                    )}
                </div>

                {/* Arrow */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                }}>
                    <ArrowRight size={18} style={{ color: '#C0C0C0' }} />
                </div>

                {/* Output side */}
                <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    background: data.outputQuantity ? 'rgba(59, 181, 112, 0.06)' : 'transparent',
                }}>
                    <OutputIcon size={16} style={{ color: data.outputQuantity ? '#3BB570' : '#959595' }} />
                    <span style={{ fontSize: '11px', color: data.outputQuantity ? '#3BB570' : '#959595', fontWeight: 500 }}>
                        {outputLabel}
                    </span>
                    {isReadonly ? (
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            color: data.outputQuantity ? '#3BB570' : '#959595',
                        }}>
                            {data.outputQuantity ? `${Number(data.outputQuantity).toLocaleString()}g` : 'Pending'}
                        </span>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                            <input
                                type="number"
                                value={data.outputQuantity ?? ''}
                                onChange={(e) => onFieldChange('outputQuantity', parseFloat(e.target.value) || 0)}
                                disabled={isExecuting}
                                placeholder="—"
                                style={{
                                    width: '80px',
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    color: '#3BB570',
                                    textAlign: 'center',
                                    border: '1px solid #E5E5E5',
                                    borderRadius: '6px',
                                    padding: '2px 4px',
                                    background: 'white',
                                    fontFamily: 'inherit',
                                }}
                            />
                            <span style={{ fontSize: '12px', color: '#959595' }}>g</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Yield badge */}
            {yieldPct && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '8px',
                }}>
                    <Percent size={11} style={{ color: '#FA9E52' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#FA9E52' }}>
                        {yieldPct}% yield
                    </span>
                </div>
            )}

            {/* Output label */}
            {data.outputLabel && (
                <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: '#959595',
                    textAlign: 'center',
                }}>
                    Label: <span style={{ color: '#6B6B6B' }}>{data.outputLabel}</span>
                </div>
            )}

            {/* Secondary fields toggle */}
            {!isReadonly && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowSecondary(!showSecondary)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            width: '100%',
                            marginTop: '8px',
                            padding: '4px 0',
                            fontSize: '11px',
                            color: '#ABABAB',
                            background: 'none',
                            border: 'none',
                            borderTop: '1px solid #F0F0F0',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        <ChevronDown size={11} style={{
                            transform: showSecondary ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.15s',
                        }} />
                        {showSecondary ? 'Less' : 'Details'}
                    </button>
                    {showSecondary && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px' }}>
                            <FieldRow fieldKey="outputLabel" value={data.outputLabel} isReadonly={isReadonly} isExecuting={isExecuting}
                                onChange={(v) => onFieldChange('outputLabel', v)} />
                            <FieldRow fieldKey="licenseNumber" value={data.licenseNumber} isReadonly={isReadonly} isExecuting={isExecuting}
                                onChange={(v) => onFieldChange('licenseNumber', v)} />
                            <FieldRow fieldKey="wasteWeight" value={data.wasteWeight} isReadonly={isReadonly} isExecuting={isExecuting}
                                onChange={(v) => onFieldChange('wasteWeight', v)} />
                            <FieldRow fieldKey="notes" value={data.notes} isReadonly={isReadonly} isExecuting={isExecuting}
                                onChange={(v) => onFieldChange('notes', v)} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Custom preview for `compose_supplier_email` — generic FieldRow can't
 * render the full layout (muted "why" line + editable subject/body +
 * sign-off hint) without special-casing, so it gets its own view.
 */
function SupplierEmailView({
    data,
    isReadonly,
    isExecuting,
    onFieldChange,
}: {
    data: Record<string, any>;
    isReadonly: boolean;
    isExecuting?: boolean;
    onFieldChange: (field: string, value: any) => void;
}) {
    return (
        <div className="px-3 py-2.5 space-y-2">
            {/* Vendor — read-only chip */}
            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-24 flex-shrink-0 text-right">Vendor</label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    <Mail size={11} />
                    {data.vendorName || 'Unknown vendor'}
                </span>
            </div>

            {/* Reason — muted advisory copy, not editable */}
            {data.reason && (
                <div className="flex items-start gap-2">
                    <label className="text-xs text-gray-400 w-24 flex-shrink-0 text-right pt-0.5">Why</label>
                    <span className="flex-1 text-xs italic text-gray-500">{data.reason}</span>
                </div>
            )}

            {/* Subject — editable single line */}
            <div className="flex items-center gap-2">
                <label htmlFor="supplier-email-subject" className="text-xs text-gray-400 w-24 flex-shrink-0 text-right">Subject</label>
                {isReadonly ? (
                    <span className="flex-1 text-sm px-2 py-1" style={{ color: '#1A1A1A' }}>
                        {data.subject || '—'}
                    </span>
                ) : (
                    <input
                        id="supplier-email-subject"
                        type="text"
                        value={data.subject ?? ''}
                        onChange={(e) => onFieldChange('subject', e.target.value)}
                        disabled={isExecuting}
                        className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                   disabled:bg-gray-50 disabled:text-gray-400"
                    />
                )}
            </div>

            {/* Body — editable multiline */}
            <div className="flex items-start gap-2">
                <label htmlFor="supplier-email-body" className="text-xs text-gray-400 w-24 flex-shrink-0 text-right pt-1">Body</label>
                {isReadonly ? (
                    <pre className="flex-1 text-sm px-2 py-1 whitespace-pre-wrap font-sans" style={{ color: '#1A1A1A' }}>
                        {data.bodyText || '—'}
                    </pre>
                ) : (
                    <textarea
                        id="supplier-email-body"
                        value={data.bodyText ?? ''}
                        onChange={(e) => onFieldChange('bodyText', e.target.value)}
                        disabled={isExecuting}
                        rows={7}
                        className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md
                                   font-sans leading-relaxed resize-y
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                                   disabled:bg-gray-50 disabled:text-gray-400"
                    />
                )}
            </div>

            {!isReadonly && (
                <div className="flex items-start gap-2">
                    <span className="w-24 flex-shrink-0" />
                    <span className="text-xs text-gray-400">Edit before sending — replies will come back into this thread.</span>
                </div>
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

    const allFields = Object.entries(action.data).filter(([key]) => {
        if (HIDDEN_FIELDS.has(key)) return false;
        // start_extraction_run: status + plannedStart are replaced by the DateTimePills row
        if (action.type === 'start_extraction_run' && (key === 'status' || key === 'plannedStart')) return false;
        return true;
    });
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

            {/* SOP input mismatch warning */}
            {action.type === 'start_extraction_run' && !isReadonly && (action.data.inputMismatch || action.data.templateMatched === false) && (
                <div className="mx-3 mt-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 flex items-start gap-2">
                    <XCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-amber-700">
                        {action.data.inputMismatch
                            ? action.data.inputMismatch
                            : action.data.templateId
                                ? 'No matching SOP found for this input type.'
                                : 'No SOP template matched — this run cannot be created.'}
                    </span>
                </div>
            )}

            {/* Custom extraction view */}
            {action.type === 'record_extraction' ? (
                <ExtractionExpandedView
                    data={action.data}
                    isReadonly={isReadonly}
                    isExecuting={isExecuting}
                    onFieldChange={(field, value) => onEditAction?.(index, { [field]: value })}
                />
            ) : action.type === 'compose_supplier_email' ? (
                <SupplierEmailView
                    data={action.data}
                    isReadonly={isReadonly}
                    isExecuting={isExecuting}
                    onFieldChange={(field, value) => onEditAction?.(index, { [field]: value })}
                />
            ) : (
                <>
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
                                    actionType={action.type}
                                    onChange={(newVal) => onEditAction?.(index, { [key]: newVal })}
                                />
                            ))}
                        </div>
                    )}

                    {/* Extraction run: Start When pills (replaces status + plannedStart) */}
                    {action.type === 'start_extraction_run' && !isReadonly && (
                        <div className="px-3 pb-2">
                            <div className="flex items-start gap-2">
                                <label className="text-xs text-gray-400 w-24 flex-shrink-0 text-right pt-1">Start when</label>
                                <DateTimePills
                                    value={action.data.plannedStart}
                                    onChange={(val) => {
                                        onEditAction?.(index, {
                                            plannedStart: val,
                                            status: val ? 'planned' : 'active',
                                        });
                                    }}
                                    disabled={isExecuting}
                                />
                            </div>
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
                                            actionType={action.type}
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
                </>
            )}
        </div>
    );
}

export const ActionPreview = ({ actions, onConfirm, onCancel, onEditAction, isExecuting, readonly, status }: ActionPreviewProps) => {
    const isReadonly = readonly || status === 'confirmed' || status === 'cancelled';

    return (
        <div className="space-y-2 action-preview-enter">
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
