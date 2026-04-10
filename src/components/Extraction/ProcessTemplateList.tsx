import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Snowflake, Flame, Beaker, ChevronRight, ChevronDown, Clock, Percent, Wrench, ArrowRight, Plus, Trash2, GripVertical, Pencil, Check, X, Copy, User, Cog, Info } from 'lucide-react';
import type { ProcessTemplate, ProcessStep, ProductType, SupplyItem } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';

// ── Catalog-driven material helpers ─────────────────────────────────────────
// Product types are loaded once from the catalog and threaded through as props.
// These helpers build the dropdown options and display labels from catalog data.

type MaterialOption = { value: string; label: string };

function buildMaterialLabels(productTypes: ProductType[]): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const pt of productTypes) labels[pt.name] = pt.displayName;
    return labels;
}

function buildGroupedMaterialOptions(productTypes: ProductType[]): { label: string; options: MaterialOption[] }[] {
    const groups: Record<string, MaterialOption[]> = {};
    const categoryOrder = ['biomass', 'intermediate', 'finished', 'additive'];
    const categoryLabels: Record<string, string> = {
        biomass: 'Biomass',
        intermediate: 'Intermediates',
        finished: 'Finished Goods',
        additive: 'Additives',
    };
    for (const pt of productTypes) {
        const cat = pt.category || 'other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ value: pt.name, label: pt.displayName });
    }
    return categoryOrder
        .filter(cat => groups[cat]?.length)
        .map(cat => ({ label: categoryLabels[cat] || cat, options: groups[cat] }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROCESS_COLORS: Record<string, string> = {
    solventless: '#1C9EFF',
    bho: '#FA9E52',
    distillate: '#3BB570',
    custom: '#959595',
};

const PROCESS_ICONS: Record<string, typeof Snowflake> = {
    solventless: Snowflake,
    bho: Flame,
    distillate: Beaker,
    custom: Wrench,
};

const PROCESS_LABELS: Record<string, string> = {
    solventless: 'Solventless',
    bho: 'BHO',
    distillate: 'Distillate',
    custom: 'Custom',
};

const EQUIP_LABELS: Record<string, string> = {
    wash_vessel: 'Wash Vessel',
    freeze_dryer: 'Freeze Dryer',
    rosin_press: 'Rosin Press',
    closed_loop_extractor: 'Closed Loop',
    vacuum_oven: 'Vacuum Oven',
    cart_filler: 'Cart Filler',
    filter_press: 'Filter Press',
    short_path: 'Short Path',
};

// MATERIAL_LABELS and MATERIAL_OPTIONS are now built from the product_types
// catalog at runtime. See buildMaterialLabels() and buildMaterialOptions().
const EQUIP_OPTIONS = Object.entries(EQUIP_LABELS).map(([value, label]) => ({ value, label }));

const formatDuration = (hours: number | null) => {
    if (hours == null) return null;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours >= 72) return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)}d`;
    return `${hours}h`;
};

// Product variants are now derived from template.producibleOutputs + catalog.
// The old PRODUCT_VARIANTS constant and getProductsForProcess() are removed.

// ── Editable step type ──────────────────────────────────────────────────────

interface EditableSupplyReq {
    supplyItemId: string;
    quantityPer: string;
    supplyName?: string;
    supplyUnit?: string;
}

interface EditableStep {
    _key: string; // client-side key for React
    stepOrder: number;
    name: string;
    description: string;
    inputType: string;
    outputType: string;
    equipmentType: string;
    expectedYieldPct: string;
    estDurationHours: string;
    estHandsOnHours: string;
    isOptional: boolean;
    // Composable step requirements (migration 047)
    requiresWeight: boolean;
    weightUnit: string; // empty string when not required
    requiresTimestamp: boolean;
    supplyRequirements: EditableSupplyReq[];
}

// Supported weight units — kept in sync with product_types.default_unit values
// plus the common operator-friendly ones. No DB-level constraint.
export const WEIGHT_UNIT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'g', label: 'grams' },
    { value: 'kg', label: 'kilograms' },
    { value: 'mg', label: 'milligrams' },
    { value: 'lb', label: 'pounds' },
    { value: 'oz', label: 'ounces' },
    { value: 'ml', label: 'milliliters' },
    { value: 'L', label: 'liters' },
    { value: 'each', label: 'count (each)' },
    { value: 'trays', label: 'trays' },
];

let _stepKey = 0;
const nextStepKey = () => `step_${++_stepKey}`;

function stepToEditable(step: ProcessStep): EditableStep {
    return {
        _key: nextStepKey(),
        stepOrder: step.stepOrder,
        name: step.name,
        description: step.description || '',
        inputType: step.inputType || '',
        outputType: step.outputType || '',
        equipmentType: step.equipmentType || '',
        expectedYieldPct: step.expectedYieldPct != null ? String(step.expectedYieldPct) : '',
        estDurationHours: step.estDurationHours != null ? String(step.estDurationHours) : '',
        estHandsOnHours: step.estHandsOnHours != null ? String(step.estHandsOnHours) : '',
        isOptional: step.isOptional,
        requiresWeight: step.requiresWeight ?? false,
        weightUnit: step.weightUnit ?? '',
        requiresTimestamp: step.requiresTimestamp ?? false,
        supplyRequirements: (step.supplyRequirements || []).map(r => ({
            supplyItemId: r.supplyItemId,
            quantityPer: String(r.quantityPer),
            supplyName: r.supplyName,
            supplyUnit: r.supplyUnit,
        })),
    };
}

function blankStep(order: number): EditableStep {
    return {
        _key: nextStepKey(),
        stepOrder: order,
        name: '',
        description: '',
        inputType: '',
        outputType: '',
        equipmentType: '',
        expectedYieldPct: '',
        estDurationHours: '',
        estHandsOnHours: '',
        isOptional: false,
        requiresWeight: false,
        weightUnit: '',
        requiresTimestamp: false,
        supplyRequirements: [],
    };
}

// ── Step Flow Diagram ───────────────────────────────────────────────────────

interface StepFlowProps {
    steps: ProcessStep[];
    color: string;
    materialLabels: Record<string, string>;
    hasProductFilter: boolean;
    excludedStepIds: Set<string>;
    onToggleStep?: (stepId: string) => void;
}

const StepFlow: React.FC<StepFlowProps> = ({ steps, color, materialLabels, hasProductFilter, excludedStepIds, onToggleStep }) => {
    const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

    return (
        <div className="sop-flow">
            <div className="sop-flow-grid" />

            <div className="sop-flow-track">
                {sortedSteps.map((step, i) => {
                    const excluded = excludedStepIds.has(step.id);
                    const active = !excluded && (!step.isOptional || hasProductFilter);
                    const stepColor = active ? color : '#D0D0D0';
                    const prevStep = i > 0 ? sortedSteps[i - 1] : null;
                    const clickable = hasProductFilter && onToggleStep;

                    return (
                        <div key={step.id} className={`sop-flow-segment ${excluded ? 'sop-flow-segment--excluded' : ''}`}>
                            {i > 0 && (
                                <div className="sop-flow-connector">
                                    <div
                                        className={`sop-flow-line ${!active ? 'sop-flow-line--dashed' : ''}`}
                                        style={{ background: excluded ? '#E8E8E8' : (active ? color : '#D0D0D0') }}
                                    />
                                    <ArrowRight size={12} style={{ color: excluded ? '#E8E8E8' : (active ? color : '#D0D0D0') }} />
                                    {step.inputType && step.inputType !== prevStep?.outputType && !excluded && (
                                        <span className="sop-flow-transition">
                                            {materialLabels[step.inputType] || step.inputType.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div
                                className={`sop-flow-node ${!active ? 'sop-flow-node--dimmed' : ''} ${excluded ? 'sop-flow-node--excluded' : ''} ${clickable ? 'sop-flow-node--clickable' : ''}`}
                                onClick={clickable ? () => onToggleStep(step.id) : undefined}
                                title={clickable ? (excluded ? 'Click to include this step' : 'Click to exclude this step') : undefined}
                            >
                                <div className="sop-flow-node-header" style={{ borderColor: excluded ? '#E8E8E8' : stepColor }}>
                                    <div
                                        className="sop-flow-node-num"
                                        style={{
                                            background: excluded ? '#E8E8E8' : (active ? stepColor : '#E8E8E8'),
                                            color: active && !excluded ? '#fff' : '#C0C0C0',
                                            textDecoration: excluded ? 'line-through' : undefined,
                                        }}
                                    >
                                        {step.stepOrder}
                                    </div>
                                    <span className="sop-flow-node-name" style={excluded ? { textDecoration: 'line-through', color: '#C0C0C0' } : undefined}>
                                        {step.name}
                                    </span>
                                    {step.isOptional && !excluded && (
                                        <span className="sop-flow-node-optional-tag">optional</span>
                                    )}
                                </div>
                                {!excluded && (
                                    <div className="sop-flow-node-body">
                                        {step.description && (
                                            <p className="sop-flow-node-desc">{step.description}</p>
                                        )}
                                        <div className="sop-flow-node-stats">
                                            {step.expectedYieldPct != null && (
                                                <span className="sop-flow-stat">
                                                    <Percent size={9} /> {step.expectedYieldPct}%
                                                </span>
                                            )}
                                            {step.estHandsOnHours != null && (
                                                <span className="sop-flow-stat sop-flow-stat--hands-on">
                                                    <User size={9} /> {formatDuration(step.estHandsOnHours)}
                                                </span>
                                            )}
                                            {step.estDurationHours != null && (
                                                <span className="sop-flow-stat sop-flow-stat--equip-time">
                                                    <Cog size={9} /> {formatDuration(step.estDurationHours)}
                                                </span>
                                            )}
                                            {step.equipmentType && (
                                                <span className="sop-flow-stat sop-flow-stat--equip">
                                                    <Wrench size={9} /> {EQUIP_LABELS[step.equipmentType] || step.equipmentType}
                                                </span>
                                            )}
                                        </div>
                                        {step.outputType && (
                                            <div className="sop-flow-node-output">
                                                <span className="sop-flow-material-pill sop-flow-material-pill--sm">
                                                    → {materialLabels[step.outputType] || step.outputType.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Inline select helper ────────────────────────────────────────────────────

const InlineSelect: React.FC<{
    value: string;
    options: { value: string; label: string }[];
    groups?: { label: string; options: { value: string; label: string }[] }[];
    placeholder: string;
    onChange: (v: string) => void;
}> = ({ value, options, groups, placeholder, onChange }) => (
    <select
        className="sop-edit-select"
        value={value}
        onChange={e => onChange(e.target.value)}
    >
        <option value="">{placeholder}</option>
        {groups ? groups.map(g => (
            <optgroup key={g.label} label={g.label}>
                {g.options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </optgroup>
        )) : options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
        ))}
    </select>
);

// ── Step Editor Row ─────────────────────────────────────────────────────────

const StepEditorRow: React.FC<{
    step: EditableStep;
    index: number;
    color: string;
    materialGroups: { label: string; options: MaterialOption[] }[];
    supplyItems: SupplyItem[];
    onChange: (updated: EditableStep) => void;
    onRemove: () => void;
    onMoveUp: (() => void) | null;
    onMoveDown: (() => void) | null;
    dragHandleProps?: {
        onDragStart: () => void;
        onDragEnd: () => void;
        onDragOver: (e: React.DragEvent) => void;
        onDrop: () => void;
        draggable: boolean;
    };
}> = ({ step, index, color, materialGroups, supplyItems, onChange, onRemove, dragHandleProps }) => {
    // Auto-expand on first render if any advanced field already has data
    // (editing an existing SOP). After that, the user's toggle is the sole
    // authority — useState initializer only runs once per component instance.
    const hasAdvancedValues = Boolean(
        step.description || step.inputType || step.outputType ||
        step.expectedYieldPct || step.estHandsOnHours || step.requiresTimestamp
    );
    const [showAdvanced, setShowAdvanced] = useState(hasAdvancedValues);
    const set = (field: keyof EditableStep, value: string | boolean) =>
        onChange({ ...step, [field]: value });

    return (
        <div
            className="sop-step-editor"
            draggable={dragHandleProps?.draggable}
            onDragStart={dragHandleProps?.onDragStart}
            onDragEnd={dragHandleProps?.onDragEnd}
            onDragOver={dragHandleProps?.onDragOver}
            onDrop={dragHandleProps?.onDrop}
        >
            <div className="sop-step-editor-grip" title="Drag to reorder">
                <GripVertical size={14} style={{ color: '#C0C0C0' }} />
            </div>

            <div className="sop-step-editor-num" style={{ background: color, color: '#fff' }}>
                {index + 1}
            </div>

            <div className="sop-step-editor-fields">
                {/* ── Always visible: name + optional ──────────────────── */}
                <div className="sop-step-editor-row-top">
                    <input
                        className="sop-edit-input sop-edit-input--name"
                        placeholder="Step name"
                        value={step.name}
                        onChange={e => set('name', e.target.value)}
                    />
                    <label className="sop-step-optional-toggle">
                        <input
                            type="checkbox"
                            checked={step.isOptional}
                            onChange={e => set('isOptional', e.target.checked)}
                        />
                        <span>Optional</span>
                    </label>
                </div>

                {/* ── Always visible: essential scheduling fields ──────── */}
                <div className="sop-step-editor-row-fields">
                    <InlineSelect
                        value={step.equipmentType}
                        options={EQUIP_OPTIONS}
                        placeholder="Equipment"
                        onChange={v => set('equipmentType', v)}
                    />
                    <div className="sop-step-editor-num-field" title="Step duration (hours)">
                        <Clock size={11} style={{ color: '#C0C0C0' }} />
                        <input
                            className="sop-edit-input sop-edit-input--sm"
                            type="number"
                            placeholder="Duration"
                            value={step.estDurationHours}
                            onChange={e => set('estDurationHours', e.target.value)}
                            min="0"
                            step="0.25"
                        />
                        <span style={{ fontSize: '10px', color: '#C0C0C0', marginLeft: '2px' }}>h</span>
                    </div>
                    <label className="sop-step-optional-toggle">
                        <input
                            type="checkbox"
                            checked={step.requiresWeight}
                            onChange={e => set('requiresWeight', e.target.checked)}
                        />
                        <span>Requires check-in</span>
                    </label>
                    {step.requiresWeight && (
                        <InlineSelect
                            value={step.weightUnit || 'g'}
                            options={WEIGHT_UNIT_OPTIONS}
                            placeholder="Unit"
                            onChange={v => set('weightUnit', v)}
                        />
                    )}
                </div>

                {/* ── Collapsible advanced fields ─────────────────────── */}
                <button
                    type="button"
                    className="sop-step-advanced-toggle"
                    onClick={() => setShowAdvanced(prev => !prev)}
                >
                    {showAdvanced ? (
                        <><ChevronDown size={11} /> Hide details</>
                    ) : (
                        <><ChevronRight size={11} /> Details</>
                    )}
                </button>

                {showAdvanced && (
                    <div className="sop-step-advanced">
                        <input
                            className="sop-edit-input sop-edit-input--desc"
                            placeholder="Description (optional)"
                            value={step.description}
                            onChange={e => set('description', e.target.value)}
                        />
                        <div className="sop-step-editor-row-fields">
                            <InlineSelect
                                value={step.inputType}
                                options={[]}
                                groups={materialGroups}
                                placeholder="Input type"
                                onChange={v => set('inputType', v)}
                            />
                            <span className="sop-step-arrow">→</span>
                            <InlineSelect
                                value={step.outputType}
                                options={[]}
                                groups={materialGroups}
                                placeholder="Output type"
                                onChange={v => set('outputType', v)}
                            />
                            <div className="sop-step-editor-num-field" title="Expected yield %">
                                <Percent size={11} style={{ color: '#C0C0C0' }} />
                                <input
                                    className="sop-edit-input sop-edit-input--sm"
                                    type="number"
                                    placeholder="Yield"
                                    value={step.expectedYieldPct}
                                    onChange={e => set('expectedYieldPct', e.target.value)}
                                    min="0"
                                    max="100"
                                    step="0.1"
                                />
                            </div>
                            <div className="sop-step-editor-num-field" title="Hands-on time (hours)">
                                <User size={11} style={{ color: '#C0C0C0' }} />
                                <input
                                    className="sop-edit-input sop-edit-input--sm"
                                    type="number"
                                    placeholder="Hands-on"
                                    value={step.estHandsOnHours}
                                    onChange={e => set('estHandsOnHours', e.target.value)}
                                    min="0"
                                    step="0.25"
                                />
                            </div>
                        </div>
                        <label className="sop-step-optional-toggle" style={{ marginTop: '4px' }}>
                            <input
                                type="checkbox"
                                checked={step.requiresTimestamp}
                                onChange={e => set('requiresTimestamp', e.target.checked)}
                            />
                            <span>Requires timestamp</span>
                        </label>

                        {/* ── Supply requirements ─────────────────────────── */}
                        {supplyItems.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#959595', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Supplies consumed
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                    {step.supplyRequirements.map((req, ri) => {
                                        const item = supplyItems.find(si => si.id === req.supplyItemId);
                                        return (
                                            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <select
                                                    className="sop-edit-select"
                                                    value={req.supplyItemId}
                                                    onChange={e => {
                                                        const updated = [...step.supplyRequirements];
                                                        const sel = supplyItems.find(si => si.id === e.target.value);
                                                        updated[ri] = { ...updated[ri], supplyItemId: e.target.value, supplyName: sel?.name, supplyUnit: sel?.unit };
                                                        onChange({ ...step, supplyRequirements: updated });
                                                    }}
                                                    style={{ flex: 1 }}
                                                >
                                                    <option value="">Select supply...</option>
                                                    {supplyItems.map(si => (
                                                        <option key={si.id} value={si.id}>{si.name}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    className="sop-edit-input sop-edit-input--sm"
                                                    type="number"
                                                    placeholder="Qty"
                                                    value={req.quantityPer}
                                                    onChange={e => {
                                                        const updated = [...step.supplyRequirements];
                                                        updated[ri] = { ...updated[ri], quantityPer: e.target.value };
                                                        onChange({ ...step, supplyRequirements: updated });
                                                    }}
                                                    min="0"
                                                    step="1"
                                                    style={{ width: '60px' }}
                                                />
                                                <span style={{ fontSize: '10px', color: '#959595' }}>{item?.unit || req.supplyUnit || 'ea'}</span>
                                                <button
                                                    type="button"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0C0C0', padding: '2px' }}
                                                    onClick={() => {
                                                        const updated = step.supplyRequirements.filter((_, i) => i !== ri);
                                                        onChange({ ...step, supplyRequirements: updated });
                                                    }}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        className="sop-step-advanced-toggle"
                                        onClick={() => {
                                            onChange({
                                                ...step,
                                                supplyRequirements: [...step.supplyRequirements, { supplyItemId: '', quantityPer: '1' }],
                                            });
                                        }}
                                    >
                                        <Plus size={11} /> Add supply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <button
                className="sop-step-editor-remove"
                onClick={onRemove}
                title="Remove step"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
};

// ── Template Editor ─────────────────────────────────────────────────────────

interface TemplateEditorProps {
    template?: ProcessTemplate;
    onSave: (saved: ProcessTemplate) => void;
    onCancel: () => void;
}

const PROCESS_TYPE_OPTIONS = [
    { value: 'solventless', label: 'Solventless' },
    { value: 'bho', label: 'BHO' },
    { value: 'distillate', label: 'Distillate' },
    { value: 'custom', label: 'Custom' },
];

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onCancel }) => {
    const [name, setName] = useState(template?.name || '');
    const [description, setDescription] = useState(template?.description || '');
    const [processType, setProcessType] = useState(template?.processType || 'solventless');
    const [acceptedInputs, setAcceptedInputs] = useState<string[]>(template?.acceptedInputs || []);
    const [producibleOutputs, setProducibleOutputs] = useState<string[]>(template?.producibleOutputs || []);
    const [standardBatchSizeG, setStandardBatchSizeG] = useState<string>(
        template?.standardBatchSizeG != null ? String(template.standardBatchSizeG) : ''
    );
    const [steps, setSteps] = useState<EditableStep[]>(() =>
        template?.steps.length
            ? [...template.steps].sort((a, b) => a.stepOrder - b.stepOrder).map(stepToEditable)
            : [blankStep(1)]
    );
    const [saving, setSaving] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    // ── Product types catalog + supply items ─────────────────────────────
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);
    useEffect(() => {
        apiService.getProductTypes().then(setProductTypes);
        apiService.getSupplyItems('extraction').then(setSupplyItems);
    }, []);

    const materialGroups = useMemo(() => buildGroupedMaterialOptions(productTypes), [productTypes]);

    // Filter product types by the template's process type.
    // Biomass/additives are universal (empty processTypes = all pathways).
    // Intermediates/finished show if their processTypes includes the current process OR is empty.
    const matchesProcess = (pt: ProductType) =>
        pt.processTypes.length === 0 || pt.processTypes.includes(processType);

    // Accepts: biomass + intermediates relevant to this process type
    const inputOptions = useMemo(
        () => productTypes
            .filter(pt => (pt.category === 'biomass' || pt.category === 'intermediate') && matchesProcess(pt))
            .map(pt => ({ value: pt.name, label: pt.displayName })),
        [productTypes, processType]
    );
    // Produces: intermediates + finished goods relevant to this process type
    const outputOptions = useMemo(
        () => productTypes
            .filter(pt => (pt.category === 'intermediate' || pt.category === 'finished') && matchesProcess(pt))
            .map(pt => ({ value: pt.name, label: pt.displayName })),
        [productTypes, processType]
    );

    const toggleArrayItem = (arr: string[], item: string) =>
        arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const color = PROCESS_COLORS[processType] || '#959595';

    const updateStep = (idx: number, updated: EditableStep) => {
        setSteps(prev => prev.map((s, i) => i === idx ? updated : s));
    };

    const removeStep = (idx: number) => {
        setSteps(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 }));
        });
    };

    const addStep = () => {
        setSteps(prev => [...prev, blankStep(prev.length + 1)]);
    };

    const moveStep = (from: number, to: number) => {
        if (to < 0 || to >= steps.length) return;
        setSteps(prev => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next.map((s, i) => ({ ...s, stepOrder: i + 1 }));
        });
    };

    const canSave = name.trim() && steps.some(s => s.name.trim());

    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            const payload = {
                id: template?.id,
                name: name.trim(),
                description: description.trim() || undefined,
                processType,
                acceptedInputs,
                producibleOutputs,
                standardBatchSizeG: standardBatchSizeG ? parseInt(standardBatchSizeG) : undefined,
                steps: steps
                    .filter(s => s.name.trim())
                    .map((s, i) => ({
                        stepOrder: i + 1,
                        name: s.name.trim(),
                        description: s.description.trim() || undefined,
                        inputType: s.inputType || undefined,
                        outputType: s.outputType || undefined,
                        equipmentType: s.equipmentType || undefined,
                        expectedYieldPct: s.expectedYieldPct ? parseFloat(s.expectedYieldPct) : undefined,
                        estDurationHours: s.estDurationHours ? parseFloat(s.estDurationHours) : undefined,
                        estHandsOnHours: s.estHandsOnHours ? parseFloat(s.estHandsOnHours) : undefined,
                        isOptional: s.isOptional,
                        // Migration 047 — composable step requirements
                        requiresWeight: s.requiresWeight,
                        weightUnit: s.requiresWeight ? (s.weightUnit || 'g') : undefined,
                        requiresTimestamp: s.requiresTimestamp,
                        supplyRequirements: s.supplyRequirements
                            .filter(r => r.supplyItemId && r.quantityPer)
                            .map(r => ({ supplyItemId: r.supplyItemId, quantityPer: parseFloat(r.quantityPer) || 0 })),
                    })),
            };
            const result = await apiService.saveProcessTemplate(payload);

            // Reload full template from server
            const all = await apiService.getProcessTemplates('extraction');
            const saved = all.find(t => t.id === (result as any).id);
            if (saved) onSave(saved);
        } catch (err) {
            console.error('Failed to save template:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="sop-editor">
            <div className="sop-editor-header">
                <h3 className="sop-editor-title">
                    {template ? 'Edit Process' : 'New Process'}
                </h3>
                <div className="sop-editor-actions">
                    <button className="sop-editor-btn sop-editor-btn--cancel" onClick={onCancel}>
                        <X size={14} /> Cancel
                    </button>
                    <button
                        className="sop-editor-btn sop-editor-btn--save"
                        onClick={handleSave}
                        disabled={!canSave || saving}
                    >
                        <Check size={14} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            <div className="sop-editor-meta">
                <div className="sop-editor-meta-row">
                    <input
                        ref={nameRef}
                        className="sop-edit-input sop-edit-input--title"
                        placeholder="Process name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    <div className="sop-editor-type-pills">
                        {PROCESS_TYPE_OPTIONS.map(opt => {
                            const c = PROCESS_COLORS[opt.value];
                            const Icon = PROCESS_ICONS[opt.value] || Wrench;
                            const active = processType === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    className={`sop-type-pill ${active ? 'sop-type-pill--active' : ''}`}
                                    style={active ? { background: c, borderColor: c, color: '#fff' } : undefined}
                                    onClick={() => setProcessType(opt.value as 'solventless' | 'bho' | 'distillate' | 'custom')}
                                >
                                    <Icon size={12} /> {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <input
                    className="sop-edit-input sop-edit-input--desc"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                />

                {/* ── I/O + batch size ─────────────────────────────────── */}
                <div className="sop-editor-io-section">
                    <div className="sop-editor-io-row">
                        <span className="sop-editor-io-label">Accepts</span>
                        <div className="sop-filter-pills">
                            {inputOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`sop-filter-pill ${acceptedInputs.includes(opt.value) ? 'sop-filter-pill--active' : ''}`}
                                    style={acceptedInputs.includes(opt.value) ? { background: color, borderColor: color } : undefined}
                                    onClick={() => setAcceptedInputs(prev => toggleArrayItem(prev, opt.value))}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="sop-editor-io-row">
                        <span className="sop-editor-io-label">Produces</span>
                        <div className="sop-filter-pills">
                            {outputOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`sop-filter-pill ${producibleOutputs.includes(opt.value) ? 'sop-filter-pill--active' : ''}`}
                                    style={producibleOutputs.includes(opt.value) ? { background: color, borderColor: color } : undefined}
                                    onClick={() => setProducibleOutputs(prev => toggleArrayItem(prev, opt.value))}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="sop-editor-io-row">
                        <span className="sop-editor-io-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Min batch
                            <span
                                className="sop-editor-info-icon"
                                title="Minimum output worth testing. Lab testing has a fixed cost, so runs below this threshold aren't cost-effective. Used by the planner to size runs — never blocks run creation."
                            >
                                <Info size={11} />
                            </span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                                className="sop-edit-input sop-edit-input--sm"
                                type="number"
                                placeholder="e.g. 500"
                                value={standardBatchSizeG}
                                onChange={e => setStandardBatchSizeG(e.target.value)}
                                min="0"
                                step="500"
                                style={{ width: '90px' }}
                            />
                            <span style={{ fontSize: '11px', color: '#959595' }}>g output min</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="sop-editor-steps-header">
                <span className="sop-editor-steps-label">Steps</span>
                <span className="sop-editor-steps-count">{steps.length}</span>
            </div>

            <div className="sop-editor-steps">
                {steps.map((step, idx) => (
                    <StepEditorRow
                        key={step._key}
                        step={step}
                        index={idx}
                        color={color}
                        materialGroups={materialGroups}
                        supplyItems={supplyItems}
                        onChange={updated => updateStep(idx, updated)}
                        onRemove={() => removeStep(idx)}
                        onMoveUp={idx > 0 ? () => moveStep(idx, idx - 1) : null}
                        onMoveDown={idx < steps.length - 1 ? () => moveStep(idx, idx + 1) : null}
                        dragHandleProps={{
                            draggable: true,
                            onDragStart: () => setDragIdx(idx),
                            onDragEnd: () => setDragIdx(null),
                            onDragOver: (e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) moveStep(dragIdx, idx); },
                            onDrop: () => setDragIdx(null),
                        }}
                    />
                ))}
            </div>

            <button className="sop-editor-add-step" onClick={addStep}>
                <Plus size={14} /> Add step
            </button>
        </div>
    );
};

// ── Template Card ───────────────────────────────────────────────────────────

const TemplateCard: React.FC<{
    template: ProcessTemplate;
    expanded: boolean;
    materialLabels: Record<string, string>;
    onToggle: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}> = ({ template, expanded, materialLabels, onToggle, onEdit, onDuplicate, onDelete }) => {
    const [selectedInput, setSelectedInput] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [excludedStepIds, setExcludedStepIds] = useState<Set<string>>(new Set());

    const color = PROCESS_COLORS[template.processType] || '#959595';
    const Icon = PROCESS_ICONS[template.processType] || Wrench;
    const requiredSteps = template.steps.filter(s => !s.isOptional);
    const optionalSteps = template.steps.filter(s => s.isOptional);

    const totalHours = requiredSteps.reduce((sum, step) => sum + (step.estDurationHours || 0), 0);
    const handsOnHours = requiredSteps.reduce((sum, step) => sum + (step.estHandsOnHours || 0), 0);

    const acceptedInputs = template.acceptedInputs.length > 0
        ? template.acceptedInputs
        : requiredSteps[0]?.inputType ? [requiredSteps[0].inputType] : [];

    // Producible outputs come from the template directly (catalog-driven).
    // Fall back to deriving from the last step's output_type for legacy templates.
    const products: MaterialOption[] = useMemo(() => {
        const outputs = template.producibleOutputs.length > 0
            ? template.producibleOutputs
            : (() => {
                const lastStep = [...template.steps].sort((a, b) => b.stepOrder - a.stepOrder)[0];
                return lastStep?.outputType ? [lastStep.outputType] : [];
            })();
        return outputs.map(name => ({ value: name, label: materialLabels[name] || name.replace(/_/g, ' ') }));
    }, [template.producibleOutputs, template.steps, materialLabels]);

    const handleInputClick = (input: string) => {
        setSelectedInput(prev => prev === input ? null : input);
    };

    const handleProductClick = (value: string) => {
        setSelectedProduct(prev => prev === value ? null : value);
        setExcludedStepIds(new Set());
    };

    const toggleStep = (stepId: string) => {
        setExcludedStepIds(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) next.delete(stepId);
            else next.add(stepId);
            return next;
        });
    };

    const handleToggle = () => {
        if (expanded) {
            setSelectedInput(null);
            setSelectedProduct(null);
            setExcludedStepIds(new Set());
        }
        onToggle();
    };

    return (
        <div className="process-template-card">
            <button className="process-template-header" onClick={handleToggle}>
                <div className="flex items-center gap-3">
                    <div className="process-template-icon" style={{ background: `${color}15`, color }}>
                        <Icon size={18} />
                    </div>
                    <div>
                        <h3 className="process-template-name">{template.name}</h3>
                        <div className="process-template-stats">
                            <span className="data-table-badge" style={{ background: color }}>
                                {PROCESS_LABELS[template.processType] || template.processType}
                            </span>
                            <span>{requiredSteps.length} steps{optionalSteps.length > 0 ? ` + ${optionalSteps.length} optional` : ''}</span>
                            {handsOnHours > 0 && (
                                <span className="sop-summary-duration"><User size={10} /> {formatDuration(handsOnHours)} hands-on</span>
                            )}
                            <span className="sop-summary-duration"><Cog size={10} /> {formatDuration(totalHours)} total</span>
                        </div>
                    </div>
                </div>
                <ChevronRight
                    size={18}
                    style={{
                        color: '#C0C0C0',
                        transition: 'transform 0.2s',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                    }}
                />
            </button>

            {expanded && (
                <div className="process-template-body">
                    {/* Card actions bar */}
                    <div className="sop-card-actions">
                        {template.description && (
                            <p className="process-template-desc" style={{ margin: 0, flex: 1 }}>{template.description}</p>
                        )}
                        <div className="sop-card-action-btns">
                            <button className="sop-card-action-btn" onClick={onEdit} title="Edit">
                                <Pencil size={13} /> Edit
                            </button>
                            <button className="sop-card-action-btn" onClick={onDuplicate} title="Duplicate">
                                <Copy size={13} /> Duplicate
                            </button>
                            {!template.isPreset && (
                                <button className="sop-card-action-btn sop-card-action-btn--danger" onClick={onDelete} title="Delete">
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter pills */}
                    <div className="sop-filter-rows">
                        {acceptedInputs.length > 0 && (
                            <div className="sop-filter-row">
                                <span className="sop-filter-label">Accepts</span>
                                <div className="sop-filter-pills">
                                    {acceptedInputs.map(input => (
                                        <button
                                            key={input}
                                            className={`sop-filter-pill ${selectedInput === input ? 'sop-filter-pill--active' : ''}`}
                                            style={selectedInput === input ? { background: color, borderColor: color } : undefined}
                                            onClick={() => handleInputClick(input)}
                                        >
                                            {materialLabels[input] || input.replace(/_/g, ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {products.length > 0 && (
                            <div className="sop-filter-row">
                                <span className="sop-filter-label">Creates</span>
                                <div className="sop-filter-pills">
                                    {products.map(p => (
                                        <button
                                            key={p.value}
                                            className={`sop-filter-pill ${selectedProduct === p.value ? 'sop-filter-pill--active' : ''}`}
                                            style={selectedProduct === p.value ? { background: color, borderColor: color } : undefined}
                                            onClick={() => handleProductClick(p.value)}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {(selectedInput || selectedProduct) && (
                        <p className="sop-flow-hint">Click steps to include or exclude them from this path.</p>
                    )}

                    <StepFlow
                        steps={template.steps}
                        color={color}
                        materialLabels={materialLabels}
                        hasProductFilter={!!selectedProduct}
                        excludedStepIds={excludedStepIds}
                        onToggleStep={selectedProduct ? toggleStep : undefined}
                    />
                </div>
            )}
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────

export const ProcessTemplateList: React.FC<{ domain?: string }> = ({ domain = 'extraction' }) => {
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ mode: 'new' | 'edit' | 'duplicate'; template?: ProcessTemplate } | null>(null);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);

    const materialLabels = useMemo(() => buildMaterialLabels(productTypes), [productTypes]);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        const [data, pt] = await Promise.all([
            apiService.getProcessTemplates(domain),
            apiService.getProductTypes(),
        ]);
        setTemplates(data);
        setProductTypes(pt);
        setLoading(false);
        if (data.length > 0 && !expandedId) setExpandedId(data[0].id);
    }, [domain]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const handleSave = (saved: ProcessTemplate) => {
        setTemplates(prev => {
            const idx = prev.findIndex(t => t.id === saved.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            return [saved, ...prev];
        });
        setEditing(null);
        setExpandedId(saved.id);
    };

    const handleDelete = async (id: string) => {
        try {
            await apiService.deleteProcessTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
            if (expandedId === id) setExpandedId(null);
        } catch (err) {
            console.error('Failed to delete template:', err);
        }
    };

    const startDuplicate = (template: ProcessTemplate) => {
        setEditing({ mode: 'duplicate', template });
    };

    if (loading) {
        return <CenteredSpinner label="Loading templates..." height="py-16" />;
    }

    // Show editor
    if (editing) {
        const editTemplate = editing.mode === 'duplicate' && editing.template
            ? { ...editing.template, id: undefined as any, name: `${editing.template.name} (copy)`, isPreset: false }
            : editing.template;

        return (
            <TemplateEditor
                template={editing.mode === 'new' ? undefined : editTemplate}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
            />
        );
    }

    return (
        <div className="process-template-list">
            <button
                className="sop-new-process-btn"
                onClick={() => setEditing({ mode: 'new' })}
            >
                <Plus size={15} /> New Process
            </button>

            {templates.length === 0 && (
                <div className="sop-empty-state">
                    <p className="sop-empty-title">Define your extraction processes</p>
                    <p className="sop-empty-desc">
                        Create templates for wash, press, and cart fill workflows. Each template defines the steps, inputs, and outputs — then launch it as a tracked run.
                    </p>
                </div>
            )}

            {templates.map(t => (
                <TemplateCard
                    key={t.id}
                    template={t}
                    expanded={expandedId === t.id}
                    materialLabels={materialLabels}
                    onToggle={() => setExpandedId(prev => prev === t.id ? null : t.id)}
                    onEdit={() => setEditing({ mode: 'edit', template: t })}
                    onDuplicate={() => startDuplicate(t)}
                    onDelete={() => handleDelete(t.id)}
                />
            ))}
        </div>
    );
};
