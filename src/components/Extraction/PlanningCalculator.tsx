import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowRight, AlertTriangle, Loader2, Copy, Printer, RotateCcw, Check, CalendarPlus, Plus, X, ChevronDown, Save, FileText } from 'lucide-react';
import type {
    BackwardPlan,
    ProductType,
    Strain,
    Package,
    ProcessTemplate,
    PlanTargetInput,
    PlanStage,
    BiomassOnHandBucket,
    PlanningSession,
} from '../../types/definitions';
import { apiService } from '../../services/apiService';
import type { StartRunPrefill } from './StartRunModal';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtQty = (n: number, digits = 1) =>
    n.toLocaleString(undefined, { maximumFractionDigits: digits });

const fmtBiomass = (g: number): string => {
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${Math.round(g)} g`;
};

// Smart weight formatter: auto-scales grams to kilograms above 1000 g so
// planning numbers read as "17.4 kg" instead of the theatrical "17,361.1 g".
// Non-gram units (carts, ea, l) pass through unchanged.
const fmtWeight = (qty: number, unit: string): { value: string; unit: string } => {
    const u = (unit || 'g').toLowerCase();
    if ((u === 'g' || u === 'grams') && qty >= 1000) {
        return { value: (qty / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), unit: 'kg' };
    }
    if (u === 'g' || u === 'grams') {
        return { value: Math.round(qty).toLocaleString(), unit: 'g' };
    }
    return { value: qty.toLocaleString(undefined, { maximumFractionDigits: 1 }), unit };
};

const defaultSessionName = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `Production plan ${mm}/${dd}`;
};

function formatPlanAsText(plan: BackwardPlan, name: string): string {
    const lines: string[] = [];
    lines.push(name);
    lines.push('');
    lines.push('TARGETS');
    plan.targets.forEach(t => {
        lines.push(`  · ${fmtQty(t.quantity)} ${t.resolvedUnit} ${t.displayName}${t.strain ? ` — ${t.strain}` : ''}`);
    });
    lines.push('');
    lines.push('BIOMASS');
    plan.biomassRequired.forEach(b => {
        const onHand = plan.biomassOnHand.find(o => o.type === b.type && o.strain === b.strain);
        const gap = plan.biomassGap.find(g => g.type === b.type && g.strain === b.strain);
        lines.push(`  ${b.strain || 'Any strain'}   need ${fmtQty(b.quantity)} ${b.unit} ${b.displayName}   on hand ${fmtQty(onHand?.quantity ?? 0)}${gap ? `   short ${fmtQty(gap.quantity)}` : ''}`);
    });
    lines.push('');
    lines.push('STAGES');
    plan.stages.forEach((s) => {
        lines.push(`  [${s.strain || 'Any strain'}] ${s.templateName}  —  ${s.yieldPct}% yield`);
        lines.push(`      ${fmtQty(s.inputQty)} ${s.inputUnit} ${s.inputDisplayName}  →  ${fmtQty(s.outputQty)} ${s.outputUnit} ${s.outputDisplayName}`);
    });
    if (plan.suppliesNeeded.length > 0) {
        lines.push('');
        lines.push('SUPPLIES');
        plan.suppliesNeeded.forEach(s => {
            lines.push(`  ${s.name}   need ${s.needed} ${s.unit}  have ${s.onHand}${s.gap > 0 ? `  (${s.gap} short)` : ''}`);
        });
    }
    return lines.join('\n');
}

// Count up from 0 to `target` over `duration` ms, ease-out-quart.
function useCountUp(target: number, duration = 520): number {
    const [value, setValue] = useState(target);
    const frame = useRef<number | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') { setValue(target); return; }
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || target === 0) { setValue(target); return; }
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 4);
            setValue(target * eased);
            if (t < 1) frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
        return () => { if (frame.current) cancelAnimationFrame(frame.current); };
    }, [target, duration]);
    return value;
}

// ─────────────────────────────────────────────────────────────────────────────

interface PlanningCalculatorProps {
    onStartRun?: (prefill: StartRunPrefill) => void;
}

export const PlanningCalculator: React.FC<PlanningCalculatorProps> = ({ onStartRun }) => {
    // Catalog state
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [strains, setStrains] = useState<Strain[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    // Session state
    const [session, setSession] = useState<PlanningSession | null>(null);
    const [sessionName, setSessionName] = useState<string>(defaultSessionName());
    const [dirty, setDirty] = useState(false);
    const [savedSessions, setSavedSessions] = useState<PlanningSession[]>([]);
    const [showSessionPicker, setShowSessionPicker] = useState(false);
    const [saving, setSaving] = useState(false);

    // Basket state
    const [targets, setTargets] = useState<PlanTargetInput[]>([]);

    // Draft-target form state
    const [draftQty, setDraftQty] = useState('');
    const [draftOutputType, setDraftOutputType] = useState('');
    const [draftStrain, setDraftStrain] = useState('');

    // Plan result state
    const [plan, setPlan] = useState<BackwardPlan | null>(null);
    const [planning, setPlanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Initial load
    useEffect(() => {
        Promise.all([
            apiService.getProductTypes(),
            apiService.getStrains(),
            apiService.getPackages({ status: 'active' }),
            apiService.getProcessTemplates('extraction'),
            apiService.getPlanningSessions('draft').catch(() => [] as PlanningSession[]),
        ]).then(([pt, st, pk, tmpl, sessions]) => {
            setProductTypes(pt);
            setStrains(st);
            setPackages(pk);
            setTemplates(tmpl);
            setSavedSessions(sessions);
            setLoading(false);
        });
    }, []);

    // Close the session picker when the user clicks outside of it.
    const pickerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!showSessionPicker) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowSessionPicker(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showSessionPicker]);

    // ── Derived catalog data ─────────────────────────────────────────────
    const plannableOutputs = useMemo(() => {
        const set = new Set<string>();
        for (const t of templates) for (const out of t.producibleOutputs || []) set.add(out);
        return set;
    }, [templates]);

    const finishedTypes = useMemo(
        () => productTypes.filter(pt =>
            (pt.category === 'finished' || pt.category === 'intermediate') &&
            plannableOutputs.has(pt.name)
        ),
        [productTypes, plannableOutputs]
    );

    const productByName = useMemo(() => {
        const m = new Map<string, ProductType>();
        for (const pt of productTypes) m.set(pt.name, pt);
        return m;
    }, [productTypes]);

    const draftPt = productByName.get(draftOutputType) || null;

    // Which biomass types does the draft target's SOPs accept?
    const relevantBiomassForDraft = useMemo(() => {
        if (!draftOutputType) return null;
        const set = new Set<string>();
        for (const t of templates) {
            if (!t.producibleOutputs?.includes(draftOutputType)) continue;
            const firstStep = t.steps?.find(s => !s.isOptional);
            const firstInput = firstStep?.inputType || t.acceptedInputs?.[0];
            if (!firstInput) continue;
            const firstPt = productByName.get(firstInput);
            if (firstPt?.category === 'biomass') {
                set.add(firstInput);
            } else {
                for (const t2 of templates) {
                    if (!t2.producibleOutputs?.includes(firstInput)) continue;
                    const s2 = t2.steps?.find(s => !s.isOptional);
                    const in2 = s2?.inputType || t2.acceptedInputs?.[0];
                    if (!in2) continue;
                    const pt2 = productByName.get(in2);
                    if (pt2?.category === 'biomass') set.add(in2);
                }
            }
        }
        return set.size > 0 ? set : null;
    }, [draftOutputType, templates, productByName]);

    const biomassByStrain = useMemo(() => {
        const biomassTypeNames = new Set(productTypes.filter(pt => pt.category === 'biomass').map(pt => pt.name));
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

    const strainRelevantQty = (strainName: string): { total: number; label: string } => {
        const byType = biomassByStrain.get(strainName);
        if (!byType) return { total: 0, label: '' };
        const wanted = relevantBiomassForDraft;
        let total = 0;
        const parts: string[] = [];
        for (const [type, g] of byType.entries()) {
            if (wanted && !wanted.has(type)) continue;
            total += g;
            const displayName = productByName.get(type)?.displayName || type.replace(/_/g, ' ');
            parts.push(`${fmtBiomass(g)} ${displayName}`);
        }
        return { total, label: parts.join(', ') };
    };

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
    }, [strains, biomassByStrain, relevantBiomassForDraft, productByName]);

    // ── Basket actions ───────────────────────────────────────────────────
    const canAddDraft = draftOutputType && draftQty && parseFloat(draftQty) > 0;

    const addDraftTarget = () => {
        if (!canAddDraft) return;
        const newTarget: PlanTargetInput = {
            outputType: draftOutputType,
            quantity: parseFloat(draftQty),
            unit: draftPt?.defaultUnit,
            strain: draftStrain.trim() || null,
        };
        setTargets(prev => [...prev, newTarget]);
        setDraftQty('');
        setDraftStrain('');
        // Keep draftOutputType so adding another target of the same type is fast.
        setDirty(true);
        // Targets changed — plan is stale.
        setPlan(null);
    };

    const removeTarget = (idx: number) => {
        setTargets(prev => prev.filter((_, i) => i !== idx));
        setDirty(true);
        setPlan(null);
    };

    const renameSession = (name: string) => {
        setSessionName(name);
        setDirty(true);
    };

    // ── Plan computation ─────────────────────────────────────────────────
    const canPlan = targets.length > 0 && !planning;

    const handlePlan = async () => {
        if (!canPlan) return;
        setPlanning(true);
        setError(null);
        setPlan(null);
        try {
            const result = await apiService.planBackward({
                targets: targets.map(t => ({
                    outputType: t.outputType,
                    quantity: t.quantity,
                    unit: t.unit,
                    strain: t.strain || undefined,
                })),
            });
            setPlan(result);
            setDirty(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Couldn't build a plan. Try different targets.");
        } finally {
            setPlanning(false);
        }
    };

    // ── Session actions ──────────────────────────────────────────────────
    // Guard both "new" and "load" against silent data loss. The unsaved dot
    // is the warning; this confirm makes it enforceable.
    const confirmDiscardIfDirty = (): boolean => {
        if (!dirty || targets.length === 0) return true;
        return window.confirm(
            `"${sessionName}" has unsaved changes. Discard them? (Hit Cancel and click Save to keep them.)`
        );
    };

    const handleNewPlan = () => {
        if (!confirmDiscardIfDirty()) return;
        setSession(null);
        setSessionName(defaultSessionName());
        setTargets([]);
        setPlan(null);
        setError(null);
        setDirty(false);
        setShowSessionPicker(false);
        setDraftQty('');
        setDraftOutputType('');
        setDraftStrain('');
    };

    const handleLoadSession = async (id: string) => {
        if (!confirmDiscardIfDirty()) return;
        try {
            const loaded = await apiService.getPlanningSession(id);
            setSession(loaded);
            setSessionName(loaded.name);
            setTargets(loaded.targets || []);
            setPlan(loaded.plan || null);
            setError(null);
            setDirty(false);
            setShowSessionPicker(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load plan');
        }
    };

    const handleSave = async () => {
        if (targets.length === 0) return;
        setSaving(true);
        try {
            const saved = await apiService.savePlanningSession({
                id: session?.id,
                name: sessionName.trim() || defaultSessionName(),
                targets,
                plan,
                status: 'draft',
            });
            setSession(saved);
            setDirty(false);
            // Refresh the list so the picker reflects the new save.
            const list = await apiService.getPlanningSessions('draft').catch(() => [] as PlanningSession[]);
            setSavedSessions(list);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save plan');
        } finally {
            setSaving(false);
        }
    };

    // ── Result-side actions ──────────────────────────────────────────────
    const handleCopy = async () => {
        if (!plan) return;
        try {
            await navigator.clipboard.writeText(formatPlanAsText(plan, sessionName));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard may be unavailable */
        }
    };
    const handlePrint = () => window.print();

    // Find the biomass bucket for a given stage, if one exists (only the first
    // stage of a chain reads from biomass — downstream stages have intermediate
    // inputs that don't exist in inventory yet).
    const bucketForStage = (stage: PlanStage): BiomassOnHandBucket | null => {
        if (!plan) return null;
        return plan.biomassOnHand.find(b => b.type === stage.inputType && b.strain === stage.strain) || null;
    };

    const handleStartRunForStage = (stage: PlanStage) => {
        if (!plan || !onStartRun) return;
        const bucket = bucketForStage(stage);
        let packageIds: string[] | undefined;
        let packageQuantities: Record<string, number> | undefined;
        if (bucket && bucket.packages.length > 0) {
            const need = stage.inputQty;
            const picks: string[] = [];
            const qtys: Record<string, number> = {};
            let remaining = need;
            for (const pkg of bucket.packages) {
                if (remaining <= 0) break;
                picks.push(pkg.id);
                if (pkg.quantity >= remaining) {
                    qtys[pkg.id] = Math.ceil(remaining * 100) / 100;
                    remaining = 0;
                } else {
                    qtys[pkg.id] = pkg.quantity;
                    remaining -= pkg.quantity;
                }
            }
            packageIds = picks;
            packageQuantities = qtys;
        }
        onStartRun({
            templateId: stage.templateId,
            targetProduct: stage.outputType,
            packageIds,
            packageQuantities,
            targetInputQty: stage.inputQty,
            targetInputUnit: stage.inputUnit,
            targetInputDisplayName: stage.inputDisplayName,
            sourcePlanningSessionId: session?.id,
            sessionName: session ? sessionName : undefined,
        });
    };

    // ── Derived result groupings ────────────────────────────────────────
    // Group stages by strain ("Any strain" bucket for null) in the order they
    // first appear, so downstream stages within a strain follow naturally.
    const stagesByStrain = useMemo(() => {
        if (!plan) return [] as { strain: string | null; stages: PlanStage[] }[];
        const groups = new Map<string, { strain: string | null; stages: PlanStage[] }>();
        for (const stage of plan.stages) {
            const key = stage.strain || '__any__';
            if (!groups.has(key)) groups.set(key, { strain: stage.strain, stages: [] });
            groups.get(key)!.stages.push(stage);
        }
        return Array.from(groups.values());
    }, [plan]);

    // Total biomass across all buckets, for the result headline count-up.
    const totalBiomassNeeded = useMemo(() => {
        if (!plan) return 0;
        return plan.biomassRequired.reduce((sum, b) => sum + b.quantity, 0);
    }, [plan]);
    const animatedTotal = useCountUp(totalBiomassNeeded);
    const totalDisplay = useMemo(() => {
        // Everything in biomassRequired is in grams per backend convention, so
        // we can safely scale the aggregate.
        return fmtWeight(animatedTotal, 'g');
    }, [animatedTotal]);

    // Multi-SOP warnings are load-bearing (they tell you which alternatives exist)
    // but don't deserve a top banner. Parse them into a per-template map and
    // render them as captions under each stage name where the chosen SOP appears.
    const { topWarnings, altsByTemplate } = useMemo(() => {
        const map = new Map<string, string[]>();
        const top: string[] = [];
        if (!plan) return { topWarnings: top, altsByTemplate: map };
        const re = /^Multiple SOPs produce "[^"]+"\. Using "([^"]+)" \(alternatives: ([^)]+)\)\.?$/;
        for (const w of plan.warnings) {
            const m = re.exec(w);
            if (m) {
                const chosen = m[1];
                const alts = m[2].split(',').map(s => s.trim());
                if (!map.has(chosen)) map.set(chosen, alts);
            } else {
                top.push(w);
            }
        }
        return { topWarnings: top, altsByTemplate: map };
    }, [plan]);

    // ── Render ──────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="planning-loading">
                <Loader2 size={18} className="animate-spin" /> Loading catalog and inventory…
            </div>
        );
    }

    return (
        <div className="planning-calculator">
            {/* ── Form column ───────────────────────────────────────────── */}
            <div className="planning-form-column">
                {/* Session header */}
                <div className="planning-session" ref={pickerRef}>
                    <div className="planning-session-row">
                        <input
                            className="planning-session-name"
                            value={sessionName}
                            onChange={e => renameSession(e.target.value)}
                            spellCheck={false}
                            aria-label="Plan name"
                        />
                        {dirty && <span className="planning-session-dot" title="Unsaved changes" />}
                        <button
                            type="button"
                            className={`planning-session-switch ${showSessionPicker ? 'is-open' : ''}`}
                            onClick={() => setShowSessionPicker(v => !v)}
                            aria-label="Switch plan"
                        >
                            <ChevronDown size={14} />
                        </button>
                    </div>
                    <div className="planning-session-meta">
                        {targets.length === 0
                            ? 'Empty basket'
                            : `${targets.length} target${targets.length === 1 ? '' : 's'}${dirty ? ' · unsaved' : session ? ' · saved' : ''}`}
                    </div>

                    {showSessionPicker && (
                        <div className="planning-session-popover">
                            <button className="planning-session-popover-item planning-session-popover-item--primary" onClick={handleNewPlan}>
                                <Plus size={13} /> New plan
                            </button>
                            {savedSessions.length > 0 && (
                                <>
                                    <div className="planning-session-popover-label">Recent plans</div>
                                    {savedSessions.map(s => (
                                        <button
                                            key={s.id}
                                            className={`planning-session-popover-item ${session?.id === s.id ? 'is-current' : ''}`}
                                            onClick={() => handleLoadSession(s.id)}
                                        >
                                            <FileText size={12} />
                                            <span className="planning-session-popover-name">{s.name}</span>
                                            <span className="planning-session-popover-count">
                                                {Array.isArray(s.targets) ? s.targets.length : 0}
                                            </span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Basket */}
                <div className="planning-basket">
                    {targets.length > 0 && (
                        <ul className="planning-basket-list">
                            {targets.map((t, i) => {
                                const pt = productByName.get(t.outputType);
                                return (
                                    <li key={i} className="planning-basket-row">
                                        <span className="planning-basket-qty">
                                            {fmtQty(t.quantity, 0)}
                                            <span className="planning-basket-unit">{t.unit || pt?.defaultUnit || 'g'}</span>
                                        </span>
                                        <span className="planning-basket-product">{pt?.displayName || t.outputType}</span>
                                        <span className={`planning-basket-strain ${t.strain ? '' : 'is-any'}`}>
                                            {t.strain || 'any strain'}
                                        </span>
                                        <button
                                            className="planning-basket-remove"
                                            onClick={() => removeTarget(i)}
                                            aria-label={`Remove ${pt?.displayName || t.outputType}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* Draft target form (sentence style) */}
                    <div className="planning-basket-add">
                        <div className="planning-draft-row">
                            <span className="planning-draft-prefix">Add</span>
                            <input
                                type="number"
                                className="planning-draft-qty"
                                placeholder="0"
                                value={draftQty}
                                onChange={e => setDraftQty(e.target.value)}
                                min="0"
                                step="1"
                                onKeyDown={e => { if (e.key === 'Enter' && canAddDraft) addDraftTarget(); }}
                            />
                            {draftPt?.defaultUnit && (
                                <span className="planning-draft-unit">{draftPt.defaultUnit}</span>
                            )}
                            <span className="planning-draft-prefix">of</span>
                            <select
                                className="planning-draft-input"
                                value={draftOutputType}
                                onChange={e => setDraftOutputType(e.target.value)}
                            >
                                <option value="">product</option>
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
                        <div className="planning-draft-row planning-draft-row--strain">
                            <span className="planning-draft-prefix">from</span>
                            <select
                                className="planning-draft-input planning-draft-input--strain"
                                value={draftStrain}
                                onChange={e => setDraftStrain(e.target.value)}
                            >
                                <option value="">any strain</option>
                                {sortedStrains.inStock.length > 0 && (
                                    <optgroup label={draftOutputType ? 'Compatible stock' : 'In stock'}>
                                        {sortedStrains.inStock.map(({ strain: s, label }) => (
                                            <option key={s.id} value={s.name}>{s.name} — {label}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {sortedStrains.outOfStock.length > 0 && (
                                    <optgroup label={draftOutputType ? 'No compatible stock' : 'Other strains'}>
                                        {sortedStrains.outOfStock.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <button
                                type="button"
                                className="planning-draft-add"
                                onClick={addDraftTarget}
                                disabled={!canAddDraft}
                                aria-label="Add target to basket"
                            >
                                <Plus size={13} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Primary actions */}
                <div className="planning-primary-actions">
                    <button
                        className="planning-btn"
                        onClick={handlePlan}
                        disabled={!canPlan}
                    >
                        {planning ? <Loader2 size={14} className="animate-spin" /> : 'Build plan'}
                    </button>
                    <button
                        className="planning-btn planning-btn--ghost"
                        onClick={handleSave}
                        disabled={targets.length === 0 || saving}
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <><Save size={13} /> Save</>}
                    </button>
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
                        {targets.length === 0
                            ? "Add targets to the basket — rosin, carts, distillate — and we'll work backward from each one."
                            : "Ready. Click Build plan to see biomass, supplies, and stages."}
                    </div>
                )}

                {plan && (
                    <div className="planning-result">
                        {topWarnings.length > 0 && (
                            <div className="planning-warnings">
                                {topWarnings.map((w, i) => (
                                    <div key={i} className="planning-warning-row">
                                        <AlertTriangle size={12} /> {w}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Biomass coverage table */}
                        <div className="planning-biomass-section">
                            <div className="planning-biomass-headline">
                                <span className="planning-biomass-label">You'll need</span>
                                <span className="planning-biomass-total-qty">{totalDisplay.value}</span>
                                <span className="planning-biomass-total-unit">{totalDisplay.unit} biomass</span>
                            </div>
                            <ul className="planning-biomass-table">
                                {plan.biomassRequired.map((b, i) => {
                                    const onHand = plan.biomassOnHand.find(o => o.type === b.type && o.strain === b.strain);
                                    const haveQty = onHand?.quantity ?? 0;
                                    const pkgCount = onHand?.packages.length ?? 0;
                                    const coverage = b.quantity > 0 ? Math.min(1, haveQty / b.quantity) : 0;
                                    const short = b.quantity > haveQty;
                                    const needFmt = fmtWeight(b.quantity, b.unit);
                                    const haveFmt = fmtWeight(haveQty, b.unit);
                                    const shortFmt = fmtWeight(Math.max(0, b.quantity - haveQty), b.unit);
                                    return (
                                        <li key={i} className={`planning-biomass-row ${short ? 'is-short' : 'is-covered'}`}>
                                            <div className="planning-biomass-row-top">
                                                <span className="planning-biomass-strain">{b.strain || 'Any strain'}</span>
                                                <span className="planning-biomass-material">{b.displayName}</span>
                                                <span className="planning-biomass-need">{needFmt.value} {needFmt.unit}</span>
                                            </div>
                                            <div className="planning-biomass-row-bottom">
                                                <div className="planning-biomass-track">
                                                    <div
                                                        className="planning-biomass-track-fill"
                                                        style={{ transform: `scaleX(${coverage})` }}
                                                    />
                                                </div>
                                                <span className="planning-biomass-onhand">
                                                    {haveFmt.value} {haveFmt.unit} on hand{pkgCount > 0 ? ` · ${pkgCount} pkg` : ''}
                                                    {short && <span className="planning-biomass-short"> · {shortFmt.value} {shortFmt.unit} short</span>}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {/* Strain-grouped waterfall */}
                        <div className="planning-strain-groups">
                            {stagesByStrain.map((group, gi) => (
                                <div key={gi} className="planning-strain-group">
                                    <div className="planning-strain-group-title">
                                        <span>{group.strain || 'Any strain'}</span>
                                        {group.stages.length > 1 && (
                                            <span className="planning-strain-group-count">{group.stages.length} stages</span>
                                        )}
                                    </div>
                                    <div className="planning-stages">
                                        {group.stages.map((stage, i) => {
                                            const alts = altsByTemplate.get(stage.templateName) || [];
                                            const inFmt = fmtWeight(stage.inputQty, stage.inputUnit);
                                            const outFmt = fmtWeight(stage.outputQty, stage.outputUnit);
                                            return (
                                                <div key={stage.key} className="planning-stage">
                                                    <span className="planning-stage-num">{String(i + 1).padStart(2, '0')}</span>
                                                    <div className="planning-stage-header">
                                                        <span className="planning-stage-name">{stage.templateName}</span>
                                                        <span className="planning-stage-yield" title={`Source: ${stage.yieldSource.replace(/_/g, ' ')}${stage.sampleCount ? ` (${stage.sampleCount} runs)` : ''}`}>
                                                            {stage.yieldPct}% yield
                                                            {stage.yieldSource === 'historical_avg' && <span className="planning-yield-badge">historical</span>}
                                                            {stage.yieldSource === 'template_default' && <span className="planning-yield-badge planning-yield-badge--default">template</span>}
                                                        </span>
                                                        {onStartRun && (
                                                            <button
                                                                type="button"
                                                                className="planning-stage-start"
                                                                onClick={() => handleStartRunForStage(stage)}
                                                                title="Schedule this stage as a planned run"
                                                            >
                                                                <CalendarPlus size={11} /> Plan run
                                                            </button>
                                                        )}
                                                    </div>
                                                    {alts.length > 0 && (
                                                        <div
                                                            className="planning-stage-alts"
                                                            title={`Alternatives: ${alts.join(', ')}`}
                                                        >
                                                            {alts.length} alt{alts.length === 1 ? '' : 's'} available
                                                        </div>
                                                    )}
                                                    <div className="planning-stage-flow">
                                                        <div className="planning-stage-material">
                                                            <span className="planning-stage-qty">{inFmt.value}</span>
                                                            <span className="planning-stage-unit">{inFmt.unit}</span>
                                                            <span className="planning-stage-type">{stage.inputDisplayName}</span>
                                                        </div>
                                                        <ArrowRight size={14} className="planning-stage-arrow" />
                                                        <div className="planning-stage-material planning-stage-material--output">
                                                            <span className="planning-stage-qty">{outFmt.value}</span>
                                                            <span className="planning-stage-unit">{outFmt.unit}</span>
                                                            <span className="planning-stage-type">{stage.outputDisplayName}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                                <Printer size={13} /> Print
                            </button>
                            <button className="planning-action planning-action--ghost" onClick={handleNewPlan} type="button">
                                <RotateCcw size={13} /> Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
