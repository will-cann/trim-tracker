import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowRight, AlertTriangle, Loader2, Copy, Printer, RotateCcw, Check } from 'lucide-react';
import type { BackwardPlan, ProductType, Strain, Package, ProcessTemplate } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// Count up from 0 to `target` over `duration` ms, ease-out-quart.
// Respects prefers-reduced-motion. Restarts whenever `target` changes.
function useCountUp(target: number, duration = 520): number {
    const [value, setValue] = useState(target);
    const frame = useRef<number | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') { setValue(target); return; }
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || target === 0) { setValue(target); return; }
        const start = performance.now();
        const from = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 4);
            setValue(from + (target - from) * eased);
            if (t < 1) frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
        return () => { if (frame.current) cancelAnimationFrame(frame.current); };
    }, [target, duration]);
    return value;
}

function formatPlanAsText(plan: BackwardPlan): string {
    const lines: string[] = [];
    lines.push(`You'll need ${plan.biomassRequired.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${plan.biomassRequired.unit} ${plan.biomassRequired.displayName}${plan.strain ? ` · ${plan.strain}` : ''}`);
    lines.push(`On hand   ${plan.biomassOnHand.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${plan.biomassOnHand.unit}${plan.biomassOnHand.packages.length > 0 ? ` (${plan.biomassOnHand.packages.length} package${plan.biomassOnHand.packages.length !== 1 ? 's' : ''})` : ''}`);
    if (plan.biomassGap.quantity > 0) {
        lines.push(`Short     ${plan.biomassGap.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${plan.biomassGap.unit} to source`);
    }
    lines.push('');
    plan.stages.forEach((s, i) => {
        lines.push(`${String(i + 1).padStart(2, '0')}  ${s.templateName}  —  ${s.yieldPct}% yield`);
        lines.push(`    ${s.inputQty.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${s.inputUnit} ${s.inputDisplayName}  →  ${s.outputQty.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${s.outputUnit} ${s.outputDisplayName}`);
    });
    if (plan.suppliesNeeded.length > 0) {
        lines.push('');
        lines.push('Supplies');
        plan.suppliesNeeded.forEach(s => {
            lines.push(`  ${s.name}   Need ${s.needed} ${s.unit} · have ${s.onHand}${s.gap > 0 ? ` (${s.gap} short)` : ''}`);
        });
    }
    return lines.join('\n');
}

export const PlanningCalculator: React.FC = () => {
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [strains, setStrains] = useState<Strain[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [targetOutputType, setTargetOutputType] = useState('');
    const [targetQuantity, setTargetQuantity] = useState('');
    const [strain, setStrain] = useState('');

    // Result state
    const [plan, setPlan] = useState<BackwardPlan | null>(null);
    const [planning, setPlanning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            apiService.getProductTypes(),
            apiService.getStrains(),
            apiService.getPackages({ status: 'active' }),
            apiService.getProcessTemplates('extraction'),
        ]).then(([pt, st, pk, tmpl]) => {
            setProductTypes(pt);
            setStrains(st);
            setPackages(pk);
            setTemplates(tmpl);
            setLoading(false);
        });
    }, []);

    // Only include products that at least one SOP can actually produce.
    // Anything without a matching template is unplannable, so don't show it.
    const plannableOutputs = useMemo(() => {
        const set = new Set<string>();
        for (const t of templates) {
            for (const out of t.producibleOutputs || []) set.add(out);
        }
        return set;
    }, [templates]);

    const finishedTypes = useMemo(
        () => productTypes.filter(pt =>
            (pt.category === 'finished' || pt.category === 'intermediate') &&
            plannableOutputs.has(pt.name)
        ),
        [productTypes, plannableOutputs]
    );

    const selectedPt = productTypes.find(pt => pt.name === targetOutputType);

    // When a target product is selected, figure out which biomass types
    // its matching SOPs actually accept. This lets the strain dropdown
    // show availability of the RIGHT biomass (not just "any biomass") —
    // so fresh frozen inventory doesn't get counted for a dry-flower SOP.
    const relevantBiomassTypes = useMemo(() => {
        if (!targetOutputType) return null; // null = "no target yet, show all biomass"
        const set = new Set<string>();
        // Walk backward from the target through any matching SOP's first step,
        // following the input chain until we hit biomass. Simple one-hop for
        // single-stage SOPs; full chain via plan-backward for multi-stage.
        // Here we just collect the "first input" of any SOP producing the target.
        for (const t of templates) {
            if (!t.producibleOutputs?.includes(targetOutputType)) continue;
            // The first required step's input_type is the biomass entry point.
            // If the first step's input isn't biomass, walk back through SOPs
            // that produce that intermediate until we find biomass.
            const firstStep = t.steps?.find(s => !s.isOptional);
            const firstInput = firstStep?.inputType || t.acceptedInputs?.[0];
            if (!firstInput) continue;

            // If the first input is biomass, we're done for this template
            const firstPt = productTypes.find(pt => pt.name === firstInput);
            if (firstPt?.category === 'biomass') {
                set.add(firstInput);
            } else {
                // Recurse one more hop: what biomass feeds into SOPs producing firstInput?
                for (const t2 of templates) {
                    if (!t2.producibleOutputs?.includes(firstInput)) continue;
                    const s2 = t2.steps?.find(s => !s.isOptional);
                    const in2 = s2?.inputType || t2.acceptedInputs?.[0];
                    if (!in2) continue;
                    const pt2 = productTypes.find(pt => pt.name === in2);
                    if (pt2?.category === 'biomass') set.add(in2);
                }
            }
        }
        return set.size > 0 ? set : null;
    }, [targetOutputType, templates, productTypes]);

    // Per-strain biomass availability — grouped by biomass type so we can
    // show a useful label like "Wi Fi OG — 115 kg fresh frozen".
    const biomassByStrain = useMemo(() => {
        const biomassTypeNames = new Set(
            productTypes.filter(pt => pt.category === 'biomass').map(pt => pt.name)
        );
        // strain → packageType → grams
        const map = new Map<string, Map<string, number>>();
        for (const p of packages) {
            if (!p.strain || !biomassTypeNames.has(p.packageType)) continue;
            const qty = typeof p.quantity === 'number' ? p.quantity : parseFloat(p.quantity as unknown as string);
            if (!qty || qty <= 0) continue;
            if (!map.has(p.strain)) map.set(p.strain, new Map());
            const byType = map.get(p.strain)!;
            byType.set(p.packageType, (byType.get(p.packageType) || 0) + qty);
        }
        return map;
    }, [packages, productTypes]);

    // Relevant quantity per strain, given the current target:
    // - If a target is selected, sum only biomass types its SOPs accept
    // - If no target, sum all biomass
    const strainRelevantQty = (strainName: string): { total: number; label: string } => {
        const byType = biomassByStrain.get(strainName);
        if (!byType) return { total: 0, label: '' };
        const wanted = relevantBiomassTypes;
        let total = 0;
        const parts: string[] = [];
        for (const [type, g] of byType.entries()) {
            if (wanted && !wanted.has(type)) continue;
            total += g;
            const displayName = productTypes.find(pt => pt.name === type)?.displayName || type.replace(/_/g, ' ');
            parts.push(`${formatBiomassQty(g)} ${displayName}`);
        }
        return { total, label: parts.join(', ') };
    };

    // Sort strains: in-stock first (descending relevant qty), then out-of-stock alphabetical
    const sortedStrains = useMemo(() => {
        const inStock: { strain: Strain; qty: number; label: string }[] = [];
        const outOfStock: Strain[] = [];
        for (const s of strains) {
            const { total, label } = strainRelevantQty(s.name);
            if (total > 0) inStock.push({ strain: s, qty: total, label });
            else outOfStock.push(s);
        }
        inStock.sort((a, b) => b.qty - a.qty);
        outOfStock.sort((a, b) => a.name.localeCompare(b.name));
        return { inStock, outOfStock };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strains, biomassByStrain, relevantBiomassTypes, productTypes]);

    function formatBiomassQty(g: number): string {
        if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
        return `${Math.round(g)} g`;
    }

    const canPlan = targetOutputType && targetQuantity && parseFloat(targetQuantity) > 0 && !planning;

    // Count up the headline biomass number when a new plan arrives.
    // Hooks must be declared before any early return to satisfy rules-of-hooks.
    const animatedNeed = useCountUp(plan?.biomassRequired.quantity ?? 0);
    const [copied, setCopied] = useState(false);

    const handlePlan = async () => {
        if (!canPlan) return;
        setPlanning(true);
        setError(null);
        setPlan(null);
        try {
            const result = await apiService.planBackward({
                targetOutputType,
                targetQuantity: parseFloat(targetQuantity),
                targetUnit: selectedPt?.defaultUnit || 'g',
                strain: strain.trim() || undefined,
            });
            setPlan(result);
        } catch (err: any) {
            setError(err.message || "Couldn't build a plan. Try a different product or quantity.");
        } finally {
            setPlanning(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: '#959595' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} /> Loading products and inventory…</div>;
    }

    const onHandMeetsNeed = plan ? plan.biomassOnHand.quantity >= plan.biomassRequired.quantity : false;
    const pkgCount = plan?.biomassOnHand.packages.length ?? 0;

    const handleCopy = async () => {
        if (!plan) return;
        try {
            await navigator.clipboard.writeText(formatPlanAsText(plan));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard may be unavailable (http, permissions). Silently no-op.
        }
    };
    const handlePrint = () => window.print();
    const handleStartOver = () => {
        setPlan(null);
        setError(null);
        setTargetQuantity('');
        setTargetOutputType('');
        setStrain('');
    };

    return (
        <div className="planning-calculator">
            {/* ── Form column ───────────────────────────────────────────── */}
            <div className="planning-form-column">
                <div className="planning-form">
                    <div className="planning-form-sentence">
                        <span className="planning-form-prefix">I need</span>
                        <input
                            type="number"
                            className="planning-input planning-input--qty"
                            placeholder="0"
                            value={targetQuantity}
                            onChange={e => setTargetQuantity(e.target.value)}
                            min="0"
                            step="1"
                        />
                        {selectedPt?.defaultUnit && (
                            <span className="planning-unit">{selectedPt.defaultUnit}</span>
                        )}
                        <span className="planning-form-prefix">of</span>
                        <select
                            className="planning-input planning-input--type"
                            value={targetOutputType}
                            onChange={e => setTargetOutputType(e.target.value)}
                        >
                            <option value="">Choose a product</option>
                            <optgroup label="Finished Goods">
                                {finishedTypes.filter(pt => pt.category === 'finished').map(pt => (
                                    <option key={pt.id} value={pt.name}>{pt.displayName}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Intermediates">
                                {finishedTypes.filter(pt => pt.category === 'intermediate').map(pt => (
                                    <option key={pt.id} value={pt.name}>{pt.displayName}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                    <div className="planning-form-sentence planning-form-sentence--continuation">
                        <span className="planning-form-prefix">from</span>
                        <select
                            className="planning-input planning-input--strain"
                            value={strain}
                            onChange={e => setStrain(e.target.value)}
                        >
                            <option value="">Any strain — use template averages</option>
                            {sortedStrains.inStock.length > 0 && (
                                <optgroup label={targetOutputType ? 'Compatible stock' : 'In stock'}>
                                    {sortedStrains.inStock.map(({ strain: s, label }) => (
                                        <option key={s.id} value={s.name}>
                                            {s.name} — {label}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {sortedStrains.outOfStock.length > 0 && (
                                <optgroup label={targetOutputType ? 'No compatible stock' : 'Other strains'}>
                                    {sortedStrains.outOfStock.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>
                    <div className="planning-form-actions">
                        <button
                            className="planning-btn"
                            onClick={handlePlan}
                            disabled={!canPlan}
                        >
                            {planning ? <Loader2 size={14} className="animate-spin" /> : 'Plan run'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Result column ─────────────────────────────────────────── */}
            <div className="planning-result-column">
                {error && (
                    <div className="planning-error">
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}

                {!plan && !error && !planning && (
                    <div className="planning-empty">
                        Set a target and we'll work backward — biomass needed, supplies to pull, and anything you're short on.
                    </div>
                )}

                {plan && (
                    <div className="planning-result">
                        {/* Warnings */}
                        {plan.warnings.length > 0 && (
                            <div className="planning-warnings">
                                {plan.warnings.map((w, i) => (
                                    <div key={i} className="planning-warning-row">
                                        <AlertTriangle size={12} /> {w}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Headline: biomass requirement */}
                        <div className="planning-headline">
                            <div className="planning-headline-label">You'll need</div>
                            <div className="planning-headline-value">
                                <span className="planning-headline-qty">
                                    {animatedNeed.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                </span>
                                <span className="planning-headline-unit">{plan.biomassRequired.unit}</span>
                                <span className="planning-headline-type">{plan.biomassRequired.displayName}</span>
                                {plan.strain && <span className="planning-strain-tag">{plan.strain}</span>}
                            </div>
                            <div className="planning-headline-rails">
                                <div className="planning-rail">
                                    <span className="planning-rail-label">On hand</span>
                                    <span className={`planning-rail-value ${onHandMeetsNeed ? 'planning-rail-value--good' : ''}`}>
                                        {plan.biomassOnHand.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {plan.biomassOnHand.unit}
                                        {pkgCount > 0 && <span className="planning-rail-sub"> · {pkgCount} package{pkgCount !== 1 ? 's' : ''}</span>}
                                    </span>
                                </div>
                                {plan.biomassGap.quantity > 0 && (
                                    <div className="planning-rail">
                                        <span className="planning-rail-label">Short</span>
                                        <span className="planning-rail-value planning-rail-value--gap">
                                            {plan.biomassGap.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {plan.biomassGap.unit} to source
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stage waterfall */}
                        <div className="planning-stages">
                            {plan.stages.map((stage, i) => (
                                <div key={i} className="planning-stage">
                                    <span className="planning-stage-num">{String(i + 1).padStart(2, '0')}</span>
                                    <div className="planning-stage-header">
                                        <span className="planning-stage-name">{stage.templateName}</span>
                                        <span className="planning-stage-yield" title={`Source: ${stage.yieldSource.replace(/_/g, ' ')}${stage.sampleCount ? ` (${stage.sampleCount} runs)` : ''}`}>
                                            {stage.yieldPct}% yield
                                            {stage.yieldSource === 'historical_avg' && <span className="planning-yield-badge">historical</span>}
                                            {stage.yieldSource === 'template_default' && <span className="planning-yield-badge planning-yield-badge--default">template</span>}
                                        </span>
                                    </div>
                                    <div className="planning-stage-flow">
                                        <div className="planning-stage-material">
                                            <span className="planning-stage-qty">{stage.inputQty.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                            <span className="planning-stage-unit">{stage.inputUnit}</span>
                                            <span className="planning-stage-type">{stage.inputDisplayName}</span>
                                        </div>
                                        <ArrowRight size={14} className="planning-stage-arrow" />
                                        <div className="planning-stage-material planning-stage-material--output">
                                            <span className="planning-stage-qty">{stage.outputQty.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                            <span className="planning-stage-unit">{stage.outputUnit}</span>
                                            <span className="planning-stage-type">{stage.outputDisplayName}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Supplies */}
                        {plan.suppliesNeeded.length > 0 && (
                            <div className="planning-supplies">
                                <div className="planning-supply-list">
                                    {plan.suppliesNeeded.map((s, i) => (
                                        <div key={i} className={`planning-supply-row ${s.gap > 0 ? 'planning-supply-row--gap' : ''}`}>
                                            <span className="planning-supply-name">{s.name}</span>
                                            <span className="planning-supply-detail">
                                                Need {s.needed} {s.unit} · have {s.onHand}
                                                {s.gap > 0 && <span className="planning-supply-gap">{s.gap} short</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action bar */}
                        <div className="planning-actions">
                            <button className="planning-action" onClick={handleCopy} type="button">
                                {copied ? <Check size={13} /> : <Copy size={13} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <button className="planning-action" onClick={handlePrint} type="button">
                                <Printer size={13} />
                                Print
                            </button>
                            <button className="planning-action planning-action--ghost" onClick={handleStartOver} type="button">
                                <RotateCcw size={13} />
                                Start over
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
