import { useState, useMemo, useEffect } from 'react';
import { ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import type { BackwardPlan, ProductType, Strain, Package } from '../../types/definitions';
import { apiService } from '../../services/apiService';

export const PlanningCalculator: React.FC = () => {
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [strains, setStrains] = useState<Strain[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
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
        ]).then(([pt, st, pk]) => {
            setProductTypes(pt);
            setStrains(st);
            setPackages(pk);
            setLoading(false);
        });
    }, []);

    const finishedTypes = useMemo(
        () => productTypes.filter(pt => pt.category === 'finished' || pt.category === 'intermediate'),
        [productTypes]
    );

    const selectedPt = productTypes.find(pt => pt.name === targetOutputType);

    // Per-strain biomass availability — sum all active biomass packages per strain.
    // When the user picks a target output, we'd ideally filter to the specific
    // biomass that SOP accepts, but without running the full planner we don't
    // know which one — so show total biomass across all types. Good enough for
    // sorting the list; the real gap check runs server-side during Calculate.
    const biomassByStrain = useMemo(() => {
        const biomassTypeNames = new Set(
            productTypes.filter(pt => pt.category === 'biomass').map(pt => pt.name)
        );
        const map = new Map<string, number>();
        for (const p of packages) {
            if (!p.strain || !biomassTypeNames.has(p.packageType)) continue;
            const qty = typeof p.quantity === 'number' ? p.quantity : parseFloat(p.quantity as unknown as string);
            if (!qty || qty <= 0) continue;
            map.set(p.strain, (map.get(p.strain) || 0) + qty);
        }
        return map;
    }, [packages, productTypes]);

    // Sort strains: in-stock first (descending qty), then out-of-stock alphabetical
    const sortedStrains = useMemo(() => {
        const inStock: { strain: Strain; qty: number }[] = [];
        const outOfStock: Strain[] = [];
        for (const s of strains) {
            const qty = biomassByStrain.get(s.name) || 0;
            if (qty > 0) inStock.push({ strain: s, qty });
            else outOfStock.push(s);
        }
        inStock.sort((a, b) => b.qty - a.qty);
        outOfStock.sort((a, b) => a.name.localeCompare(b.name));
        return { inStock, outOfStock };
    }, [strains, biomassByStrain]);

    const formatBiomassQty = (g: number) => {
        if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
        return `${Math.round(g)} g`;
    };

    const canPlan = targetOutputType && targetQuantity && parseFloat(targetQuantity) > 0 && !planning;

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
            setError(err.message || 'Planning failed');
        } finally {
            setPlanning(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: '#959595' }}><Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} /> Loading catalog...</div>;
    }

    return (
        <div className="planning-calculator">
            {/* ── Form ──────────────────────────────────────────────────── */}
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
                    <span className="planning-unit">{selectedPt?.defaultUnit || '—'}</span>
                    <span className="planning-form-prefix">of</span>
                    <select
                        className="planning-input planning-input--type"
                        value={targetOutputType}
                        onChange={e => setTargetOutputType(e.target.value)}
                    >
                        <option value="">select product</option>
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
                <div className="planning-form-row">
                    <select
                        className="planning-input planning-input--strain"
                        value={strain}
                        onChange={e => setStrain(e.target.value)}
                    >
                        <option value="">Any strain (template yields)</option>
                        {sortedStrains.inStock.length > 0 && (
                            <optgroup label="In stock">
                                {sortedStrains.inStock.map(({ strain: s, qty }) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name} — {formatBiomassQty(qty)} available
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {sortedStrains.outOfStock.length > 0 && (
                            <optgroup label="Other strains">
                                {sortedStrains.outOfStock.map(s => (
                                    <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                    <button
                        className="planning-btn"
                        onClick={handlePlan}
                        disabled={!canPlan}
                    >
                        {planning ? <Loader2 size={14} className="animate-spin" /> : 'Calculate'}
                    </button>
                </div>
            </div>

            {/* ── Error ─────────────────────────────────────────────────── */}
            {error && (
                <div className="planning-error">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* ── Result ────────────────────────────────────────────────── */}
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

                    {/* Stage waterfall */}
                    <div className="planning-stages">
                        <h4 className="planning-section-title">Production Chain</h4>
                        {plan.stages.map((stage, i) => (
                            <div key={i} className="planning-stage">
                                <div className="planning-stage-header">
                                    <span className="planning-stage-num">{i + 1}</span>
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
                                    <ArrowRight size={14} style={{ color: '#C0C0C0', flexShrink: 0 }} />
                                    <div className="planning-stage-material planning-stage-material--output">
                                        <span className="planning-stage-qty">{stage.outputQty.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                        <span className="planning-stage-unit">{stage.outputUnit}</span>
                                        <span className="planning-stage-type">{stage.outputDisplayName}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Biomass summary */}
                    <div className="planning-biomass">
                        <h4 className="planning-section-title">Raw Material</h4>
                        <div className="planning-biomass-summary">
                            <div className="planning-biomass-row">
                                <span className="planning-biomass-label">Need</span>
                                <span className="planning-biomass-value">
                                    {plan.biomassRequired.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {plan.biomassRequired.unit} {plan.biomassRequired.displayName}
                                    {plan.strain && <span className="planning-strain-tag">{plan.strain}</span>}
                                </span>
                            </div>
                            <div className="planning-biomass-row">
                                <span className="planning-biomass-label">On hand</span>
                                <span className={`planning-biomass-value ${plan.biomassOnHand.quantity >= plan.biomassRequired.quantity ? 'planning-biomass-value--good' : ''}`}>
                                    {plan.biomassOnHand.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {plan.biomassOnHand.unit}
                                    {plan.biomassOnHand.packages.length > 0 && (
                                        <span className="planning-pkg-count">({plan.biomassOnHand.packages.length} package{plan.biomassOnHand.packages.length !== 1 ? 's' : ''})</span>
                                    )}
                                </span>
                            </div>
                            {plan.biomassGap.quantity > 0 && (
                                <div className="planning-biomass-row planning-biomass-row--gap">
                                    <span className="planning-biomass-label">Gap</span>
                                    <span className="planning-biomass-value planning-biomass-value--gap">
                                        {plan.biomassGap.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })} {plan.biomassGap.unit} to source
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Supplies */}
                    {plan.suppliesNeeded.length > 0 && (
                        <div className="planning-supplies">
                            <h4 className="planning-section-title">Supplies</h4>
                            <div className="planning-supply-list">
                                {plan.suppliesNeeded.map((s, i) => (
                                    <div key={i} className={`planning-supply-row ${s.gap > 0 ? 'planning-supply-row--gap' : ''}`}>
                                        <span className="planning-supply-name">{s.name}</span>
                                        <span className="planning-supply-detail">
                                            need {s.needed} / have {s.onHand} {s.unit}
                                            {s.gap > 0 && <span className="planning-supply-gap">({s.gap} short)</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
