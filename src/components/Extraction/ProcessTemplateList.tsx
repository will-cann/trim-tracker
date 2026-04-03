import { useState, useEffect, useCallback, useMemo } from 'react';
import { Snowflake, Flame, Beaker, ChevronRight, Clock, Percent, Wrench, ArrowRight } from 'lucide-react';
import type { ProcessTemplate, ProcessStep } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';

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

const MATERIAL_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    rosin_cart: 'Rosin Cart',
    crude_extract: 'Crude',
    bho_concentrate: 'Concentrate',
    winterized: 'Winterized',
    filtered: 'Filtered',
    distillate: 'Distillate',
    trim: 'Trim',
    flower: 'Flower',
    kief: 'Kief',
    dry_trim: 'Dry Trim',
    shake: 'Shake',
};

const formatDuration = (hours: number | null) => {
    if (hours == null) return null;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours >= 72) return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)}d`;
    return `${hours}h`;
};

// ── Product variants (shared with StartRunModal) ─────────────────────────────

type ProductVariant = { value: string; label: string };

const PRODUCT_VARIANTS: Record<string, { fresh_frozen: ProductVariant[]; dry: ProductVariant[] }> = {
    bho: {
        fresh_frozen: [
            { value: 'live_resin_diamonds', label: 'Live Resin Diamonds' },
            { value: 'live_resin_sugar', label: 'Live Resin Sugar' },
            { value: 'live_resin_sauce', label: 'Live Resin Sauce' },
            { value: 'live_resin_badder', label: 'Live Resin Badder' },
            { value: 'live_resin_shatter', label: 'Live Resin Shatter' },
            { value: 'live_resin_pens', label: 'Live Resin Pens' },
        ],
        dry: [
            { value: 'shatter', label: 'Shatter' },
            { value: 'wax', label: 'Wax / Budder' },
            { value: 'crumble', label: 'Crumble' },
        ],
    },
    solventless: {
        fresh_frozen: [
            { value: 'live_rosin', label: 'Live Rosin' },
            { value: 'live_rosin_badder', label: 'Live Rosin Badder' },
            { value: 'live_rosin_carts', label: 'Live Rosin Carts' },
            { value: 'bubble_hash', label: 'Bubble Hash' },
        ],
        dry: [
            { value: 'rosin', label: 'Rosin' },
            { value: 'dry_sift', label: 'Dry Sift' },
            { value: 'temple_balls', label: 'Temple Balls' },
        ],
    },
    distillate: {
        fresh_frozen: [
            { value: 'distillate', label: 'Distillate' },
            { value: 'distillate_carts', label: 'Distillate Carts' },
        ],
        dry: [
            { value: 'distillate', label: 'Distillate' },
            { value: 'distillate_carts', label: 'Distillate Carts' },
            { value: 'isolate', label: 'Isolate' },
        ],
    },
};

function getProductsForProcess(processType: string, acceptedInputs: string[], selectedInput: string | null): ProductVariant[] {
    const group = PRODUCT_VARIANTS[processType];
    if (!group) return [];

    if (selectedInput) {
        const isFresh = selectedInput === 'fresh_frozen';
        return isFresh ? group.fresh_frozen : group.dry;
    }

    // No input selected — show all unique products
    const seen = new Set<string>();
    const all: ProductVariant[] = [];
    const inputs = acceptedInputs.length > 0 ? acceptedInputs : ['fresh_frozen', 'dry'];
    for (const input of inputs) {
        const variants = input === 'fresh_frozen' ? group.fresh_frozen : group.dry;
        for (const v of variants) {
            if (!seen.has(v.value)) {
                seen.add(v.value);
                all.push(v);
            }
        }
    }
    return all;
}

// ── Step Flow Diagram ───────────────────────────────────────────────────────

interface StepFlowProps {
    steps: ProcessStep[];
    color: string;
    hasProductFilter: boolean;
    excludedStepIds: Set<string>;
    onToggleStep?: (stepId: string) => void;
}

const StepFlow: React.FC<StepFlowProps> = ({ steps, color, hasProductFilter, excludedStepIds, onToggleStep }) => {
    const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

    return (
        <div className="sop-flow">
            <div className="sop-flow-grid" />

            <div className="sop-flow-track">
                {sortedSteps.map((step, i) => {
                    const excluded = excludedStepIds.has(step.id);
                    // Active = not excluded. Without a product filter, optional steps start dimmed.
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
                                            {MATERIAL_LABELS[step.inputType] || step.inputType}
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
                                            {step.estDurationHours != null && (
                                                <span className="sop-flow-stat">
                                                    <Clock size={9} /> {formatDuration(step.estDurationHours)}
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
                                                    → {MATERIAL_LABELS[step.outputType] || step.outputType}
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

// ── Template Card ───────────────────────────────────────────────────────────

const TemplateCard: React.FC<{ template: ProcessTemplate; expanded: boolean; onToggle: () => void }> = ({
    template, expanded, onToggle,
}) => {
    const [selectedInput, setSelectedInput] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [excludedStepIds, setExcludedStepIds] = useState<Set<string>>(new Set());

    const color = PROCESS_COLORS[template.processType] || '#959595';
    const Icon = PROCESS_ICONS[template.processType] || Wrench;
    const requiredSteps = template.steps.filter(s => !s.isOptional);
    const optionalSteps = template.steps.filter(s => s.isOptional);

    // Total estimated duration (required steps only)
    const totalHours = requiredSteps.reduce((sum, step) => sum + (step.estDurationHours || 0), 0);

    // Accepted inputs
    const acceptedInputs = template.acceptedInputs.length > 0
        ? template.acceptedInputs
        : requiredSteps[0]?.inputType ? [requiredSteps[0].inputType] : [];

    // Products this process creates (filtered by selected input)
    const products = useMemo(
        () => getProductsForProcess(template.processType, acceptedInputs, selectedInput),
        [template.processType, acceptedInputs, selectedInput]
    );

    const handleInputClick = (input: string) => {
        const next = selectedInput === input ? null : input;
        setSelectedInput(next);
        // Clear product if it's no longer valid for the new input filter
        if (next && selectedProduct) {
            const validProducts = getProductsForProcess(template.processType, acceptedInputs, next);
            if (!validProducts.find(p => p.value === selectedProduct)) {
                setSelectedProduct(null);
            }
        }
    };

    const handleProductClick = (value: string) => {
        setSelectedProduct(prev => prev === value ? null : value);
        setExcludedStepIds(new Set()); // reset step toggles on product change
    };

    const toggleStep = (stepId: string) => {
        setExcludedStepIds(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) next.delete(stepId);
            else next.add(stepId);
            return next;
        });
    };

    // Reset filters when collapsing
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
                            <span>{formatDuration(totalHours)} est.</span>
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
                    {template.description && (
                        <p className="process-template-desc">{template.description}</p>
                    )}

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
                                            {MATERIAL_LABELS[input] || input.replace(/_/g, ' ')}
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

export const ProcessTemplateList: React.FC = () => {
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getProcessTemplates();
        setTemplates(data);
        setLoading(false);
        if (data.length > 0) setExpandedId(data[0].id);
    }, []);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    if (loading) {
        return <CenteredSpinner label="Loading templates…" height="py-16" />;
    }

    return (
        <div className="process-template-list">
            {templates.map(t => (
                <TemplateCard
                    key={t.id}
                    template={t}
                    expanded={expandedId === t.id}
                    onToggle={() => setExpandedId(prev => prev === t.id ? null : t.id)}
                />
            ))}
        </div>
    );
};
