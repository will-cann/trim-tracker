import { useState, useEffect, useCallback, useMemo } from 'react';
import { Snowflake, Flame, Beaker, Wrench, ChevronRight, Check, ChevronDown, AlertTriangle } from 'lucide-react';
import type { ProcessTemplate, Package, ExtractionEquipment, ProductType } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

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

// Material labels and product variants are now catalog-driven.
// Loaded from apiService.getProductTypes() at mount time.

// ── Capacity chain calculation ───────────────────────────────────────────────

interface StepProjection {
    stepOrder: number;
    name: string;
    equipmentType: string | null;
    inputG: number;
    outputG: number;
    yieldPct: number;      // template expected yield for this step
    equipCapacity: number | null;  // capacity of assigned equipment
    equipName: string | null;
    isOverCapacity: boolean;
}

function computeCapacityChain(
    templateSteps: ProcessTemplate['steps'],
    inputWeightG: number,
    stepEquipmentMap: Record<number, string>,
    allEquipment: ExtractionEquipment[],
): { projections: StepProjection[]; bottleneck: StepProjection | null; maxInputG: number } {
    const equipById = new Map(allEquipment.map(e => [e.id, e]));
    const projections: StepProjection[] = [];
    let currentWeight = inputWeightG;
    let bottleneck: StepProjection | null = null;

    // Required steps only (optional steps don't constrain the main flow)
    const requiredSteps = templateSteps.filter(s => !s.isOptional);

    for (const ts of requiredSteps) {
        const yieldPct = ts.expectedYieldPct ?? 100;
        const outputWeight = currentWeight * (yieldPct / 100);
        const equipId = stepEquipmentMap[ts.stepOrder];
        const equip = equipId ? equipById.get(equipId) : null;
        const capG = equip?.capacityGrams ?? null;
        const isOver = capG != null && currentWeight > capG;

        const proj: StepProjection = {
            stepOrder: ts.stepOrder,
            name: ts.name,
            equipmentType: ts.equipmentType,
            inputG: currentWeight,
            outputG: outputWeight,
            yieldPct,
            equipCapacity: capG,
            equipName: equip?.name ?? null,
            isOverCapacity: isOver,
        };
        projections.push(proj);

        if (isOver && (!bottleneck || (capG! / proj.inputG) < (bottleneck.equipCapacity! / bottleneck.inputG))) {
            bottleneck = proj;
        }

        currentWeight = outputWeight;
    }

    // Calculate max feasible input: work backwards from each equipment constraint
    let maxInputG = Infinity;
    for (const proj of projections) {
        if (proj.equipCapacity == null) continue;
        // How much original input would produce exactly this step's capacity?
        // inputG at this step = originalInput * cumulative_yield_before_this_step
        // So: originalInput = equipCapacity / (inputG_at_step / originalInput)
        const ratio = proj.inputG / inputWeightG; // fraction of original input that reaches this step
        if (ratio > 0) {
            const maxForThisStep = proj.equipCapacity / ratio;
            if (maxForThisStep < maxInputG) {
                maxInputG = maxForThisStep;
            }
        }
    }
    if (!isFinite(maxInputG)) maxInputG = inputWeightG;

    return { projections, bottleneck, maxInputG };
}

const EQUIP_TYPE_LABELS: Record<string, string> = {
    wash_vessel: 'Wash Vessel',
    freeze_dryer: 'Freeze Dryer',
    rosin_press: 'Rosin Press',
    closed_loop_extractor: 'Closed Loop',
    vacuum_oven: 'Vacuum Oven',
    cart_filler: 'Cart Filler',
    filter_press: 'Filter Press',
    short_path: 'Short Path',
};

const formatWeight = (qty: number, unit: string) => {
    const u = unit || 'g';
    if ((u === 'g' || u === 'grams') && qty >= 1000) {
        return `${(qty / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
    }
    return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u}`;
};

interface StartRunModalProps {
    templates: ProcessTemplate[];
    onClose: () => void;
    onCreated: () => void;
}

type Step = 'template' | 'packages' | 'product' | 'details';

export const StartRunModal: React.FC<StartRunModalProps> = ({ templates, onClose, onCreated }) => {
    const [step, setStep] = useState<Step>('template');
    const [selectedTemplate, setSelectedTemplate] = useState<ProcessTemplate | null>(null);
    const [packages, setPackages] = useState<Package[]>([]);
    const [equipment, setEquipment] = useState<ExtractionEquipment[]>([]);
    const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
    const [packageQuantities, setPackageQuantities] = useState<Record<string, number>>({}); // pkgId → grams to use
    const [targetProduct, setTargetProduct] = useState('');
    const [stepEquipment, setStepEquipment] = useState<Record<number, string>>({});
    const [name, setName] = useState('');
    const [plannedStart, setPlannedStart] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [packagesLoading, setPackagesLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const [productTypes, setProductTypes] = useState<ProductType[]>([]);

    const materialLabels = useMemo(() => {
        const labels: Record<string, string> = {};
        for (const pt of productTypes) labels[pt.name] = pt.displayName;
        return labels;
    }, [productTypes]);

    const loadData = useCallback(async () => {
        setPackagesLoading(true);
        const [pkgs, equip, pt] = await Promise.all([
            apiService.getPackages({ status: 'active' }),
            apiService.getExtractionEquipment(),
            apiService.getProductTypes(),
        ]);
        setPackages(pkgs);
        setEquipment(equip.filter((e: ExtractionEquipment) => e.status === 'available' || e.status === 'in_use'));
        setProductTypes(pt);
        setPackagesLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Derived values
    const acceptedInputs = selectedTemplate?.acceptedInputs || [];
    const hasInputFilter = acceptedInputs.length > 0;
    const relevantPackages = hasInputFilter
        ? packages.filter(p => acceptedInputs.includes(p.packageType) && (!typeFilter || p.packageType === typeFilter))
        : typeFilter ? packages.filter(p => p.packageType === typeFilter) : packages;
    const otherPackages = hasInputFilter
        ? packages.filter(p => !acceptedInputs.includes(p.packageType) && p.quantity > 0)
        : [];
    const selectedPkgs = packages.filter(p => selectedPackageIds.includes(p.id));
    const derivedStrain = selectedPkgs.length > 0 ? selectedPkgs[0].strain : '';
    // Total = sum of user-specified quantities (defaults to full package qty)
    const totalInputWeight = selectedPkgs.reduce((sum, p) => sum + (packageQuantities[p.id] ?? p.quantity), 0);
    // Target product options: use template's producibleOutputs if set,
    // otherwise fall back to all intermediate+finished types from catalog.
    const variants = useMemo(() => {
        const outputs = selectedTemplate?.producibleOutputs?.length
            ? selectedTemplate.producibleOutputs
            : productTypes
                .filter(pt => pt.category === 'intermediate' || pt.category === 'finished')
                .map(pt => pt.name);
        return outputs.map(name => ({
            value: name,
            label: materialLabels[name] || name.replace(/_/g, ' '),
        }));
    }, [selectedTemplate, productTypes, materialLabels]);

    // Auto-assign equipment: for each template step with equipment_type, find a matching piece
    const autoAssignEquipment = useCallback(() => {
        if (!selectedTemplate) return {};
        const assigned: Record<number, string> = {};
        const usedIds = new Set<string>();

        for (const ts of selectedTemplate.steps) {
            if (!ts.equipmentType) continue;
            const match = equipment.find(
                e => e.equipmentType === ts.equipmentType && !usedIds.has(e.id)
            );
            if (match) {
                assigned[ts.stepOrder] = match.id;
                usedIds.add(match.id);
            }
        }
        return assigned;
    }, [selectedTemplate, equipment]);

    // Use actual stepEquipment if user has been to Step 3, otherwise preview with auto-assignment
    const effectiveEquipment = useMemo(() => {
        return Object.keys(stepEquipment).length > 0 ? stepEquipment : autoAssignEquipment();
    }, [stepEquipment, autoAssignEquipment]);

    // Capacity chain projection — runs on Step 2 and Step 3
    const capacityChain = useMemo(() => {
        if (!selectedTemplate || totalInputWeight <= 0) return null;
        return computeCapacityChain(selectedTemplate.steps, totalInputWeight, effectiveEquipment, equipment);
    }, [selectedTemplate, totalInputWeight, effectiveEquipment, equipment]);

    const handleSelectTemplate = (t: ProcessTemplate) => {
        setSelectedTemplate(t);
        setSelectedPackageIds([]);
        setPackageQuantities({});
        setTargetProduct('');
        setTypeFilter(null);
        setStep('packages');
    };

    const togglePackage = (id: string) => {
        setSelectedPackageIds(prev => {
            if (prev.includes(id)) {
                // Deselecting — clean up quantity
                setPackageQuantities(pq => { const next = { ...pq }; delete next[id]; return next; });
                return prev.filter(x => x !== id);
            }
            return [...prev, id];
        });
    };

    const setPackageQty = (id: string, qty: number) => {
        setPackageQuantities(prev => ({ ...prev, [id]: qty }));
    };

    const handleContinueToProduct = () => {
        // Packages are optional — backend allows runs without source packages.
        // Auto-assign equipment
        setStepEquipment(autoAssignEquipment());
        setStep('product');
    };

    const handleContinueToDetails = () => {
        const strainName = derivedStrain || 'Unknown';
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const dateStr = `${mm}${dd}${yy}`;

        let productLabel = '';
        if (targetProduct) {
            productLabel = materialLabels[targetProduct] || targetProduct.replace(/_/g, ' ');
        } else {
            productLabel = selectedTemplate?.name || 'Run';
        }

        setName(`${strainName} - ${productLabel} - ${dateStr}`);
        setStep('details');
    };

    const handleEquipmentChange = (stepOrder: number, equipId: string) => {
        setStepEquipment(prev => {
            const next = { ...prev };
            if (equipId) next[stepOrder] = equipId;
            else delete next[stepOrder];
            return next;
        });
    };

    const handleCreate = async () => {
        if (!selectedTemplate || !name.trim()) return;
        setSubmitting(true);
        try {
            // Build quantity map: pkgId → quantity to use
            const sourcePackageQuantities: Record<string, number> = {};
            for (const pkg of selectedPkgs) {
                sourcePackageQuantities[pkg.id] = packageQuantities[pkg.id] ?? pkg.quantity;
            }
            await apiService.createExtractionRun({
                templateId: selectedTemplate.id,
                name: name.trim(),
                strain: derivedStrain || undefined,
                targetProduct: targetProduct || undefined,
                sourcePackageIds: selectedPackageIds,
                sourcePackageQuantities,
                plannedStart: plannedStart || undefined,
                stepEquipment: Object.keys(stepEquipment).length > 0 ? stepEquipment : undefined,
                notes: notes.trim() || undefined,
            });
            onCreated();
        } catch {
            setSubmitting(false);
        }
    };

    const handleBack = () => {
        if (step === 'details') setStep('product');
        else if (step === 'product') { setStep('packages'); setTargetProduct(''); }
        else if (step === 'packages') { setStep('template'); setSelectedPackageIds([]); setPackageQuantities({}); setTargetProduct(''); }
    };

    // Steps that need equipment
    const equipSteps = selectedTemplate?.steps.filter(s => s.equipmentType) || [];

    const title = step === 'template' ? 'Choose a Process'
        : step === 'packages' ? 'Select Source Material'
        : step === 'product' ? 'Configure Run'
        : 'Run Details';

    const footer = step === 'template' ? null
        : step === 'packages' ? (
            <>
                <Button variant="secondary" onClick={handleBack}>Back</Button>
                <Button variant="primary" onClick={handleContinueToProduct}>
                    {selectedPackageIds.length === 0 ? 'Skip' : 'Continue'}
                </Button>
            </>
        ) : step === 'product' ? (
            <>
                <Button variant="secondary" onClick={handleBack}>Back</Button>
                <Button variant="primary" onClick={handleContinueToDetails}>Continue</Button>
            </>
        ) : (
            <>
                <Button variant="secondary" onClick={() => setStep('product')}>Back</Button>
                <Button variant="primary" onClick={handleCreate} disabled={!name.trim() || submitting}>
                    {submitting ? 'Creating…' : 'Create Run'}
                </Button>
            </>
        );

    const STEPS: { key: Step; label: string }[] = [
        { key: 'template', label: 'Process' },
        { key: 'packages', label: 'Material' },
        { key: 'product', label: 'Configure' },
        { key: 'details', label: 'Details' },
    ];
    const currentStepIdx = STEPS.findIndex(s => s.key === step);

    return (
        <Modal
            title={title}
            contentClassName="creation-modal start-run-modal"
            onClose={onClose}
            footer={footer}
        >
            <>
                {/* ── Step Progress ─────────────────────────────────────── */}
                <div className="start-run-progress">
                    {STEPS.map((s, i) => (
                        <div
                            key={s.key}
                            className={`start-run-progress-step ${i <= currentStepIdx ? 'start-run-progress-step--active' : ''} ${i === currentStepIdx ? 'start-run-progress-step--current' : ''}`}
                        >
                            <div className="start-run-progress-dot">
                                {i < currentStepIdx ? <Check size={10} /> : <span>{i + 1}</span>}
                            </div>
                            <span className="start-run-progress-label">{s.label}</span>
                        </div>
                    ))}
                    <div className="start-run-progress-track">
                        <div
                            className="start-run-progress-fill"
                            style={{ width: `${(currentStepIdx / (STEPS.length - 1)) * 100}%` }}
                        />
                    </div>
                </div>

                {/* ── Step 1: Template ────────────────────────────────────── */}
                {step === 'template' && (
                    <div className="start-run-templates">
                        {templates.filter(t => t.domain === 'extraction').map(t => {
                            const color = PROCESS_COLORS[t.processType] || '#959595';
                            const Icon = PROCESS_ICONS[t.processType] || Wrench;
                            const requiredSteps = t.steps.filter(s => !s.isOptional);
                            const firstInput = t.steps[0]?.inputType;
                            return (
                                <button
                                    key={t.id}
                                    className="start-run-template-btn"
                                    onClick={() => handleSelectTemplate(t)}
                                >
                                    <div className="start-run-template-icon" style={{ background: `${color}15`, color }}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="start-run-template-info">
                                        <span className="start-run-template-name">{t.name}</span>
                                        <span className="start-run-template-meta">
                                            {requiredSteps.length} steps
                                            {firstInput && ` · Starts from ${firstInput.replace(/_/g, ' ')}`}
                                        </span>
                                    </div>
                                    <ChevronRight size={16} style={{ color: '#C0C0C0' }} />
                                </button>
                            );
                        })}
                        {templates.length === 0 && (
                            <p className="start-run-empty">
                                You need at least one process template before starting a run. Switch to the Processes tab to create one.
                            </p>
                        )}
                    </div>
                )}

                {/* ── Step 2: Package selection ───────────────────────────── */}
                {step === 'packages' && selectedTemplate && (
                    <div className="start-run-packages">
                        <div className="start-run-selected">
                            Process: <strong>{selectedTemplate.name}</strong>
                            <button className="start-run-change" onClick={handleBack}>Change</button>
                        </div>

                        {hasInputFilter && (
                            <p className="start-run-hint">
                                This process accepts{' '}
                                <strong>
                                    {acceptedInputs.map(i => materialLabels[i] || i.replace(/_/g, ' ')).join(', ')}
                                </strong>
                                . Select the packages to use as input.
                            </p>
                        )}

                        {/* Type filter pills */}
                        {(() => {
                            const basePackages = hasInputFilter
                                ? packages.filter(p => acceptedInputs.includes(p.packageType))
                                : packages;
                            const typeCounts: Record<string, number> = {};
                            for (const p of basePackages) {
                                typeCounts[p.packageType] = (typeCounts[p.packageType] || 0) + 1;
                            }
                            const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
                            if (types.length <= 1) return null;
                            return (
                                <div className="start-run-type-filters">
                                    <button
                                        className={`start-run-type-pill ${!typeFilter ? 'start-run-type-pill--active' : ''}`}
                                        onClick={() => setTypeFilter(null)}
                                    >
                                        All ({basePackages.length})
                                    </button>
                                    {types.map(([type, count]) => (
                                        <button
                                            key={type}
                                            className={`start-run-type-pill ${typeFilter === type ? 'start-run-type-pill--active' : ''}`}
                                            onClick={() => setTypeFilter(prev => prev === type ? null : type)}
                                        >
                                            {materialLabels[type] || type.replace(/_/g, ' ')} ({count})
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}

                        {packagesLoading ? (
                            <p className="start-run-empty">Loading packages...</p>
                        ) : relevantPackages.length === 0 ? (
                            <p className="start-run-empty">
                                No active {hasInputFilter ? acceptedInputs.map(i => (materialLabels[i] || i.replace(/_/g, ' ')).toLowerCase()).join(' or ') : ''} packages found.
                            </p>
                        ) : (
                            <div className="start-run-pkg-list">
                                {relevantPackages.map(pkg => {
                                    const isSelected = selectedPackageIds.includes(pkg.id);
                                    const qtyUsed = packageQuantities[pkg.id] ?? pkg.quantity;
                                    const isPartial = isSelected && qtyUsed < pkg.quantity;
                                    return (
                                        <div key={pkg.id} className={`start-run-pkg-row ${isSelected ? 'start-run-pkg-row--selected' : ''}`}>
                                            <button
                                                className={`start-run-pkg-btn ${isSelected ? 'start-run-pkg-btn--selected' : ''}`}
                                                onClick={() => togglePackage(pkg.id)}
                                            >
                                                <div className={`start-run-pkg-check ${isSelected ? 'start-run-pkg-check--on' : ''}`}>
                                                    {isSelected && <Check size={12} />}
                                                </div>
                                                <div className="start-run-pkg-info">
                                                    <span className="start-run-pkg-label">{pkg.label}</span>
                                                    <span className="start-run-pkg-meta">
                                                        {pkg.strain} · {formatWeight(pkg.quantity, pkg.unit)} available
                                                    </span>
                                                </div>
                                                <span className="start-run-pkg-type">
                                                    {materialLabels[pkg.packageType] || pkg.packageType}
                                                </span>
                                            </button>
                                            {isSelected && (
                                                <div className="start-run-pkg-qty">
                                                    <label className="start-run-pkg-qty-label">
                                                        Use:
                                                        <input
                                                            type="number"
                                                            className="field-input start-run-pkg-qty-input"
                                                            value={qtyUsed}
                                                            min={1}
                                                            max={pkg.quantity}
                                                            step={1}
                                                            onChange={e => setPackageQty(pkg.id, Math.min(pkg.quantity, Math.max(0, Number(e.target.value))))}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                        <span className="start-run-pkg-qty-unit">g</span>
                                                    </label>
                                                    {isPartial && (
                                                        <span className="start-run-pkg-qty-remainder">
                                                            {formatWeight(pkg.quantity - qtyUsed, 'g')} remains
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {otherPackages.length > 0 && (
                            <details className="start-run-other-pkgs">
                                <summary>Other active packages ({otherPackages.length})</summary>
                                <div className="start-run-pkg-list start-run-pkg-list--other">
                                    {otherPackages.map(pkg => {
                                        const isSelected = selectedPackageIds.includes(pkg.id);
                                        return (
                                            <button
                                                key={pkg.id}
                                                className={`start-run-pkg-btn ${isSelected ? 'start-run-pkg-btn--selected' : ''}`}
                                                onClick={() => togglePackage(pkg.id)}
                                            >
                                                <div className={`start-run-pkg-check ${isSelected ? 'start-run-pkg-check--on' : ''}`}>
                                                    {isSelected && <Check size={12} />}
                                                </div>
                                                <div className="start-run-pkg-info">
                                                    <span className="start-run-pkg-label">{pkg.label}</span>
                                                    <span className="start-run-pkg-meta">
                                                        {pkg.strain} · {formatWeight(pkg.quantity, pkg.unit)}
                                                    </span>
                                                </div>
                                                <span className="start-run-pkg-type">
                                                    {materialLabels[pkg.packageType] || pkg.packageType}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </details>
                        )}

                        {selectedPackageIds.length > 0 && (
                            <div className="start-run-pkg-summary">
                                <span>{selectedPackageIds.length} package{selectedPackageIds.length > 1 ? 's' : ''} selected</span>
                                <span className="start-run-pkg-total">{formatWeight(totalInputWeight, 'g')} total</span>
                            </div>
                        )}

                        {/* Live capacity warning on Step 2 */}
                        {capacityChain?.bottleneck && (
                            <div className="start-run-capacity-warn">
                                <AlertTriangle size={14} />
                                <span>
                                    <strong>{capacityChain.bottleneck.name}</strong> ({capacityChain.bottleneck.equipName}) can only handle {formatWeight(capacityChain.bottleneck.equipCapacity!, 'g')} — this run would send ~{formatWeight(Math.round(capacityChain.bottleneck.inputG), 'g')}.
                                    {capacityChain.maxInputG < totalInputWeight && (
                                        <> Reduce to <strong>{formatWeight(Math.floor(capacityChain.maxInputG), 'g')}</strong> or less to fit your equipment.</>
                                    )}
                                </span>
                            </div>
                        )}

                    </div>
                )}

                {/* ── Step 3: Product variant + equipment ─────────────────── */}
                {step === 'product' && selectedTemplate && (
                    <div className="start-run-config">
                        <div className="start-run-selected">
                            <div>
                                <div>{selectedTemplate.name}</div>
                                <div className="start-run-selected-sub">
                                    {selectedPkgs.length} pkg{selectedPkgs.length > 1 ? 's' : ''} · {derivedStrain} · {formatWeight(totalInputWeight, 'g')}
                                </div>
                            </div>
                            <button className="start-run-change" onClick={handleBack}>Change</button>
                        </div>

                        {/* Product variant */}
                        {variants.length > 0 && (
                            <div className="start-run-section">
                                <h4 className="start-run-section-title">Target Product</h4>
                                <div className="start-run-variant-list">
                                    {variants.map(v => (
                                        <button
                                            key={v.value}
                                            className={`start-run-variant-btn ${targetProduct === v.value ? 'start-run-variant-btn--selected' : ''}`}
                                            onClick={() => setTargetProduct(v.value)}
                                        >
                                            <div className="start-run-variant-check">
                                                {targetProduct === v.value && <Check size={12} />}
                                            </div>
                                            <div>
                                                <span className="start-run-variant-name">{v.label}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Equipment assignment with capacity projections */}
                        {equipSteps.length > 0 && (
                            <div className="start-run-section">
                                <h4 className="start-run-section-title">Equipment</h4>

                                {/* Bottleneck warning */}
                                {capacityChain?.bottleneck && (
                                    <div className="start-run-capacity-warn">
                                        <AlertTriangle size={14} />
                                        <span>
                                            <strong>{capacityChain.bottleneck.name}</strong> is over capacity
                                            ({formatWeight(capacityChain.bottleneck.inputG, 'g')} input vs {formatWeight(capacityChain.bottleneck.equipCapacity!, 'g')} max).
                                            {capacityChain.maxInputG < totalInputWeight && (
                                                <> Max feasible run: <strong>{formatWeight(Math.floor(capacityChain.maxInputG), 'g')}</strong></>
                                            )}
                                        </span>
                                    </div>
                                )}

                                <div className="start-run-equip-list">
                                    {equipSteps.map(ts => {
                                        const matchingEquip = equipment.filter(e => e.equipmentType === ts.equipmentType);
                                        const assignedId = stepEquipment[ts.stepOrder] || '';
                                        const proj = capacityChain?.projections.find(p => p.stepOrder === ts.stepOrder);
                                        const isOver = proj?.isOverCapacity ?? false;

                                        return (
                                            <div key={ts.stepOrder} className={`start-run-equip-row ${isOver ? 'start-run-equip-row--over' : ''}`}>
                                                <div className="start-run-equip-step">
                                                    <span className="start-run-equip-step-num">{ts.stepOrder}</span>
                                                    <span className="start-run-equip-step-name">{ts.name}</span>
                                                    <span className="start-run-equip-type">
                                                        {EQUIP_TYPE_LABELS[ts.equipmentType!] || ts.equipmentType}
                                                    </span>
                                                </div>
                                                {/* Projected weight at this step */}
                                                {proj && (
                                                    <div className={`start-run-equip-proj ${isOver ? 'start-run-equip-proj--over' : ''}`}>
                                                        <span className="start-run-equip-proj-weight">
                                                            ~{formatWeight(Math.round(proj.inputG), 'g')} in
                                                        </span>
                                                        {proj.equipCapacity != null && (
                                                            <span className="start-run-equip-proj-cap">
                                                                / {formatWeight(proj.equipCapacity, 'g')} cap
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="start-run-equip-select-wrap">
                                                    <select
                                                        className={`field-input start-run-equip-select ${isOver ? 'start-run-equip-select--over' : ''}`}
                                                        value={assignedId}
                                                        onChange={e => handleEquipmentChange(ts.stepOrder, e.target.value)}
                                                    >
                                                        <option value="">— None —</option>
                                                        {matchingEquip.map(eq => {
                                                            const capOver = proj && eq.capacityGrams != null && proj.inputG > eq.capacityGrams;
                                                            return (
                                                                <option key={eq.id} value={eq.id}>
                                                                    {eq.name}{eq.capacityGrams ? ` (${eq.capacityGrams}g)` : ''}{capOver ? ' ⚠' : ''}
                                                                </option>
                                                            );
                                                        })}
                                                        {equipment.filter(e => e.equipmentType !== ts.equipmentType).length > 0 && (
                                                            <optgroup label="Other equipment">
                                                                {equipment
                                                                    .filter(e => e.equipmentType !== ts.equipmentType)
                                                                    .map(eq => (
                                                                        <option key={eq.id} value={eq.id}>
                                                                            {eq.name} ({EQUIP_TYPE_LABELS[eq.equipmentType] || eq.equipmentType})
                                                                        </option>
                                                                    ))
                                                                }
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    <ChevronDown size={13} className="start-run-equip-chevron" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {equipment.length === 0 && (
                                    <p className="start-run-hint">No equipment added yet. Add equipment in Settings to assign here.</p>
                                )}
                            </div>
                        )}

                    </div>
                )}

                {/* ── Step 4: Final details ───────────────────────────────── */}
                {step === 'details' && selectedTemplate && (
                    <div className="start-run-details">
                        <div className="start-run-selected">
                            <div>
                                <div>{selectedTemplate.name}{targetProduct ? ` → ${variants.find(v => v.value === targetProduct)?.label || targetProduct}` : ''}</div>
                                <div className="start-run-selected-sub">
                                    {selectedPkgs.length} pkg{selectedPkgs.length > 1 ? 's' : ''} · {derivedStrain} · {formatWeight(totalInputWeight, 'g')}
                                </div>
                            </div>
                            <button className="start-run-change" onClick={() => setStep('product')}>Change</button>
                        </div>

                        <label className="start-run-label">
                            Run Name
                            <input
                                type="text"
                                className="field-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. OGK Live Rosin Batch #4"
                                autoFocus
                            />
                        </label>

                        <label className="start-run-label">
                            Planned Start
                            <input
                                type="datetime-local"
                                className="field-input"
                                value={plannedStart}
                                onChange={e => setPlannedStart(e.target.value)}
                            />
                        </label>

                        <label className="start-run-label">
                            Notes
                            <input
                                type="text"
                                className="field-input"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Optional notes..."
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
                        </label>

                    </div>
                )}
            </>
        </Modal>
    );
};
