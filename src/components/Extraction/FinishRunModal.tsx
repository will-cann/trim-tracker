import { useState, useMemo, useEffect } from 'react';
import { Check, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal, Button } from '../ui';
import { apiService, type FinalizeRunOutput, type FinalizeRunCheckIn } from '../../services/apiService';
import type { ExtractionRun, ProductType } from '../../types/definitions';

// ─────────────────────────────────────────────────────────────────────────────
// FinishRunModal — schedule-driven run finalization
//
// Opens from two entry points:
//   1. "Finalize Run" button in RunDetail
//   2. Drag-to-Completed in RunKanban
//
// Three sections:
//   1. Check-in summary — every step with requires_weight=true. Pre-filled
//      from check_in_value if the operator already entered it during the run.
//      Blank ones get inline inputs. Finalize is disabled until all are filled.
//   2. Outputs produced — pre-filled with one line derived from the run's
//      target_product + final weight check-in. Operator can edit, add, or
//      remove lines. At least one output with quantity > 0 is required.
//   3. Sources to decrement — read-only display of what the completion hook
//      will consume. Just informational.
//
// On Finalize: submits { status: 'completed', outputs, checkIns } to the
// update-extraction-run endpoint. The completion hook runs server-side in
// a transaction, and the modal closes on success.
// ─────────────────────────────────────────────────────────────────────────────

interface FinishRunModalProps {
    run: ExtractionRun;
    onClose: () => void;
    onCompleted: () => void;
}

interface OutputLine {
    _key: string;
    packageType: string;
    quantity: string; // string for controlled input
    unit: string;
    label: string;
}

let _lineKey = 0;
const nextLineKey = () => `out_${++_lineKey}`;

function makeDefaultOutputLine(run: ExtractionRun, productTypes: ProductType[]): OutputLine {
    // Derive the initial output line from the run's target_product (if set)
    // and the final step's check_in_value (the last weight the operator entered).
    const targetType = run.targetProduct || '';
    const catalogEntry = productTypes.find(p => p.name === targetType);
    const defaultUnit = catalogEntry?.defaultUnit || 'g';

    // Find the last weight check-in in the run as the default quantity
    const weightSteps = (run.steps || [])
        .filter(s => s.requiresWeight && s.checkInValue != null)
        .sort((a, b) => a.stepOrder - b.stepOrder);
    const lastWeight = weightSteps[weightSteps.length - 1];
    const defaultQty = lastWeight?.checkInValue != null ? String(lastWeight.checkInValue) : '';
    const defaultUnitFromStep = lastWeight?.checkInUnit || defaultUnit;

    const todayStr = new Date().toISOString().slice(0, 10);
    const strainLabel = run.strain || 'Unknown';
    const displayType = catalogEntry?.displayName
        || (targetType ? targetType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Output');
    const label = targetType
        ? `${strainLabel} - ${displayType} - ${todayStr}`
        : '';

    return {
        _key: nextLineKey(),
        packageType: targetType,
        quantity: defaultQty,
        unit: defaultUnitFromStep,
        label,
    };
}

export const FinishRunModal: React.FC<FinishRunModalProps> = ({ run, onClose, onCompleted }) => {
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [templateOutputs, setTemplateOutputs] = useState<string[]>([]); // producibleOutputs from the run's SOP
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [outputs, setOutputs] = useState<OutputLine[]>([]);
    // Check-in values — map of stepId → numeric string being edited
    const [checkInValues, setCheckInValues] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load the product catalog + template's producible outputs
    useEffect(() => {
        let cancelled = false;
        const loadCatalog = async () => {
            const [types, templates] = await Promise.all([
                apiService.getProductTypes(),
                run.templateId ? apiService.getProcessTemplates('extraction') : Promise.resolve([]),
            ]);
            if (cancelled) return;
            setProductTypes(types);
            const tmpl = templates.find(t => t.id === run.templateId);
            if (tmpl?.producibleOutputs?.length) setTemplateOutputs(tmpl.producibleOutputs);
            return types;
        };
        loadCatalog()
            .then(types => {
                if (cancelled || !types) return;
                // Seed one default output line once the catalog is loaded
                setOutputs([makeDefaultOutputLine(run, types)]);
                // Seed check-in values from existing run data
                const seed: Record<string, string> = {};
                for (const step of run.steps || []) {
                    if (step.requiresWeight) {
                        seed[step.id] = step.checkInValue != null ? String(step.checkInValue) : '';
                    }
                }
                setCheckInValues(seed);
                setLoadingCatalog(false);
            })
            .catch(() => {
                if (cancelled) return;
                setLoadingCatalog(false);
                setError('Failed to load product catalog');
            });
        return () => { cancelled = true; };
    }, [run]);

    // Weight-requiring steps, sorted by order, so the UI reads naturally
    const checkInSteps = useMemo(
        () => (run.steps || [])
            .filter(s => s.requiresWeight)
            .sort((a, b) => a.stepOrder - b.stepOrder),
        [run.steps]
    );

    // Output type options: constrained to SOP's producibleOutputs if set,
    // otherwise all intermediate+finished from the catalog.
    const outputTypeOptions = useMemo(() => {
        const base = productTypes.filter(p => p.category === 'intermediate' || p.category === 'finished');
        if (templateOutputs.length === 0) return base;
        const allowed = new Set(templateOutputs);
        return base.filter(p => allowed.has(p.name));
    }, [productTypes, templateOutputs]);

    const allCheckInsFilled = useMemo(
        () => checkInSteps.every(s => {
            const v = checkInValues[s.id];
            return v !== undefined && v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) >= 0;
        }),
        [checkInSteps, checkInValues]
    );

    const hasValidOutput = useMemo(
        () => outputs.some(o => o.packageType.trim() && parseFloat(o.quantity) > 0),
        [outputs]
    );

    const canFinalize = !loadingCatalog && allCheckInsFilled && hasValidOutput && !submitting;

    const handleAddOutputLine = () => {
        setOutputs(prev => [...prev, {
            _key: nextLineKey(),
            packageType: '',
            quantity: '',
            unit: 'g',
            label: '',
        }]);
    };

    const handleRemoveOutputLine = (key: string) => {
        setOutputs(prev => prev.filter(o => o._key !== key));
    };

    const handleUpdateOutput = (key: string, field: keyof OutputLine, value: string) => {
        setOutputs(prev => prev.map(o => {
            if (o._key !== key) return o;
            const updated = { ...o, [field]: value };
            // When packageType changes, auto-update the unit to the catalog default
            // and regenerate the label if the user hasn't customized it.
            if (field === 'packageType' && value !== o.packageType) {
                const entry = productTypes.find(p => p.name === value);
                if (entry) {
                    updated.unit = entry.defaultUnit;
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const strainLabel = run.strain || 'Unknown';
                    updated.label = `${strainLabel} - ${entry.displayName} - ${todayStr}`;
                }
            }
            return updated;
        }));
    };

    const handleFinalize = async () => {
        if (!canFinalize) return;
        setSubmitting(true);
        setError(null);
        try {
            const finalOutputs: FinalizeRunOutput[] = outputs
                .filter(o => o.packageType.trim() && parseFloat(o.quantity) > 0)
                .map(o => ({
                    packageType: o.packageType,
                    quantity: parseFloat(o.quantity),
                    unit: o.unit || undefined,
                    label: o.label || undefined,
                }));

            const finalCheckIns: FinalizeRunCheckIn[] = [];
            for (const s of checkInSteps) {
                const v = checkInValues[s.id];
                if (v === undefined || v === '') continue;
                const num = parseFloat(v);
                if (isNaN(num)) continue;
                const checkIn: FinalizeRunCheckIn = { stepId: s.id, value: num };
                if (s.weightUnit) checkIn.unit = s.weightUnit;
                finalCheckIns.push(checkIn);
            }

            await apiService.updateExtractionRun(run.id, {
                status: 'completed',
                outputs: finalOutputs,
                checkIns: finalCheckIns,
            });

            onCompleted();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to finalize run';
            setError(msg);
            setSubmitting(false);
        }
    };

    // Source packages to decrement — read-only display
    const sources = run.sourcePackages || [];

    return (
        <Modal
            title={`Finalize: ${run.name}`}
            contentClassName="creation-modal finish-run-modal"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleFinalize} disabled={!canFinalize}>
                        {submitting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> Finalizing…
                            </>
                        ) : (
                            <>
                                <Check size={14} /> Finalize Run
                            </>
                        )}
                    </Button>
                </>
            }
        >
            {loadingCatalog ? (
                <div className="finish-run-loading">
                    <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
            ) : (
                <div className="finish-run-body">
                    {error && (
                        <div className="finish-run-error">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    {/* ── Section 1: check-ins ────────────────────────────────── */}
                    {checkInSteps.length > 0 && (
                        <section className="finish-run-section">
                            <h4 className="finish-run-section-title">Check your check-ins</h4>
                            <div className="finish-run-checkins">
                                {checkInSteps.map(step => {
                                    const val = checkInValues[step.id] ?? '';
                                    const filled = val !== '' && !isNaN(parseFloat(val));
                                    return (
                                        <div
                                            key={step.id}
                                            className={`finish-run-checkin-row ${filled ? 'finish-run-checkin-row--filled' : 'finish-run-checkin-row--missing'}`}
                                        >
                                            <span className="finish-run-checkin-step">
                                                Step {step.stepOrder}: {step.name}
                                            </span>
                                            <div className="finish-run-checkin-input">
                                                <input
                                                    type="number"
                                                    className="field-input"
                                                    value={val}
                                                    onChange={e => setCheckInValues(prev => ({ ...prev, [step.id]: e.target.value }))}
                                                    placeholder="—"
                                                    min="0"
                                                    step="0.01"
                                                />
                                                <span className="finish-run-checkin-unit">
                                                    {step.weightUnit || 'g'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── Section 2: outputs ──────────────────────────────────── */}
                    <section className="finish-run-section">
                        <h4 className="finish-run-section-title">Outputs produced</h4>
                        <div className="finish-run-outputs">
                            {outputs.map(output => {
                                const catalogEntry = productTypes.find(p => p.name === output.packageType);
                                return (
                                    <div key={output._key} className="finish-run-output-row">
                                        <div className="finish-run-output-fields">
                                            <select
                                                className="field-input"
                                                value={output.packageType}
                                                onChange={e => handleUpdateOutput(output._key, 'packageType', e.target.value)}
                                            >
                                                <option value="">— Select type —</option>
                                                {outputTypeOptions.map(p => (
                                                        <option key={p.id} value={p.name}>
                                                            {p.displayName}
                                                        </option>
                                                    ))}
                                            </select>
                                            <input
                                                type="number"
                                                className="field-input finish-run-output-qty"
                                                value={output.quantity}
                                                onChange={e => handleUpdateOutput(output._key, 'quantity', e.target.value)}
                                                placeholder="Qty"
                                                min="0"
                                                step="0.01"
                                            />
                                            <span className="finish-run-output-unit">
                                                {output.unit || catalogEntry?.defaultUnit || 'g'}
                                            </span>
                                            {outputs.length > 1 && (
                                                <button
                                                    className="finish-run-output-remove"
                                                    onClick={() => handleRemoveOutputLine(output._key)}
                                                    title="Remove output"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            className="field-input finish-run-output-label"
                                            value={output.label}
                                            onChange={e => handleUpdateOutput(output._key, 'label', e.target.value)}
                                            placeholder="Package label (auto-generated if blank)"
                                        />
                                    </div>
                                );
                            })}
                            <button
                                className="finish-run-add-output"
                                onClick={handleAddOutputLine}
                                type="button"
                            >
                                <Plus size={12} /> Add another output
                            </button>
                        </div>
                    </section>

                    {/* ── Section 3: sources to decrement (read-only) ─────────── */}
                    {sources.length > 0 && (
                        <section className="finish-run-section">
                            <h4 className="finish-run-section-title">Sources to decrement</h4>
                            <div className="finish-run-sources">
                                {sources.map(src => {
                                    const used = src.quantityUsed != null ? src.quantityUsed : src.quantity;
                                    return (
                                        <div key={src.packageId} className="finish-run-source-row">
                                            <span className="finish-run-source-label">{src.label}</span>
                                            <span className="finish-run-source-delta">
                                                {src.quantity != null ? `${src.quantity}${src.unit || 'g'}` : '—'}
                                                {' → '}
                                                {src.quantity != null && used != null
                                                    ? `${Math.max(0, src.quantity - used)}${src.unit || 'g'}`
                                                    : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
};
