import { useState, useRef, useEffect } from 'react';
import { Play, CheckCircle2, SkipForward, Scale, ArrowRight, Pencil } from 'lucide-react';
import type { ExtractionRun, ExtractionRunStep } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STEP_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: '#959595' },
    active: { label: 'In Progress', color: '#1C9EFF' },
    completed: { label: 'Done', color: '#3BB570' },
    skipped: { label: 'Skipped', color: '#C0C0C0' },
};

const formatWeight = (g: number | null) => {
    if (g == null) return '—';
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
    return `${g.toLocaleString(undefined, { maximumFractionDigits: 2 })} g`;
};

// ── Step Row ─────────────────────────────────────────────────────────────────

const StepRow: React.FC<{
    step: ExtractionRunStep;
    isNext: boolean;
    runStatus: string;
    onUpdate: () => void;
}> = ({ step, isNext, runStatus, onUpdate }) => {
    const cfg = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.pending;
    const [inputG, setInputG] = useState(step.inputWeightG?.toString() || '');
    const [outputG, setOutputG] = useState(step.outputWeightG?.toString() || '');
    const [notes, setNotes] = useState(step.notes || '');
    const [saving, setSaving] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState(step.description || '');
    const descRef = useRef<HTMLTextAreaElement>(null);

    const canEdit = runStatus === 'active' && (step.status === 'active' || step.status === 'pending');

    useEffect(() => {
        if (editingDesc && descRef.current) {
            descRef.current.focus();
            descRef.current.selectionStart = descRef.current.value.length;
        }
    }, [editingDesc]);

    const handleSaveDescription = async () => {
        const trimmed = descDraft.trim();
        if (trimmed === (step.description || '').trim()) {
            setEditingDesc(false);
            return;
        }
        setSaving(true);
        await apiService.updateRunStep(step.id, { description: trimmed || null });
        onUpdate();
        setSaving(false);
        setEditingDesc(false);
    };

    const handleStartStep = async () => {
        setSaving(true);
        await apiService.updateRunStep(step.id, { status: 'active' });
        onUpdate();
        setSaving(false);
    };

    const handleCompleteStep = async () => {
        setSaving(true);
        const updates: Record<string, any> = { status: 'completed' };
        if (inputG) updates.inputWeightG = parseFloat(inputG);
        if (outputG) updates.outputWeightG = parseFloat(outputG);
        if (notes.trim()) updates.notes = notes.trim();
        await apiService.updateRunStep(step.id, updates);
        onUpdate();
        setSaving(false);
    };

    const handleSkipStep = async () => {
        setSaving(true);
        await apiService.updateRunStep(step.id, { status: 'skipped' });
        onUpdate();
        setSaving(false);
    };

    const handleSaveWeights = async () => {
        if (!inputG && !outputG) return;
        setSaving(true);
        const updates: Record<string, any> = {};
        if (inputG) updates.inputWeightG = parseFloat(inputG);
        if (outputG) updates.outputWeightG = parseFloat(outputG);
        if (notes.trim()) updates.notes = notes.trim();
        await apiService.updateRunStep(step.id, updates);
        onUpdate();
        setSaving(false);
    };

    return (
        <div className={`run-step ${step.status === 'active' ? 'run-step--active' : ''} ${step.status === 'completed' ? 'run-step--completed' : ''} ${step.status === 'skipped' ? 'run-step--skipped' : ''}`}>
            {/* Step indicator */}
            <div className="run-step-indicator" style={{ background: cfg.color }}>
                {step.status === 'completed' ? (
                    <CheckCircle2 size={14} style={{ color: '#fff' }} />
                ) : (
                    <span className="run-step-number">{step.stepOrder}</span>
                )}
            </div>

            <div className="run-step-content">
                <div className="run-step-header">
                    <div className="run-step-name-row">
                        <span className="run-step-name">{step.name}</span>
                        {step.isOptional && <span className="run-step-optional">Optional</span>}
                        <span className="run-step-status-badge" style={{ color: cfg.color }}>{cfg.label}</span>
                    </div>

                    {/* Step description (SOP instructions) */}
                    {editingDesc ? (
                        <div className="run-step-desc-edit">
                            <textarea
                                ref={descRef}
                                className="field-input run-step-desc-textarea"
                                value={descDraft}
                                onChange={e => setDescDraft(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveDescription(); }
                                    if (e.key === 'Escape') { setDescDraft(step.description || ''); setEditingDesc(false); }
                                }}
                                placeholder="Add process instructions for this step..."
                                rows={2}
                                disabled={saving}
                            />
                            <div className="run-step-desc-actions">
                                <button className="btn-primary text-xs px-2 py-1" onClick={handleSaveDescription} disabled={saving}>Save</button>
                                <button className="btn-cancel text-xs px-2 py-1" onClick={() => { setDescDraft(step.description || ''); setEditingDesc(false); }}>Cancel</button>
                            </div>
                        </div>
                    ) : step.description ? (
                        <p
                            className="run-step-desc"
                            onClick={() => { setDescDraft(step.description || ''); setEditingDesc(true); }}
                            title="Click to edit"
                        >
                            {step.description}
                            <Pencil size={11} className="run-step-desc-icon" />
                        </p>
                    ) : canEdit ? (
                        <button
                            className="run-step-desc-add"
                            onClick={() => { setDescDraft(''); setEditingDesc(true); }}
                        >
                            + Add process instructions
                        </button>
                    ) : null}

                    {/* Completed step summary */}
                    {step.status === 'completed' && (
                        <div className="run-step-summary">
                            {step.inputWeightG != null && (
                                <>
                                    <span>{formatWeight(step.inputWeightG)}</span>
                                    <ArrowRight size={12} style={{ color: '#C0C0C0' }} />
                                    <span style={{ fontWeight: 600 }}>{formatWeight(step.outputWeightG)}</span>
                                </>
                            )}
                            {step.yieldPct != null && (
                                <span className="run-step-yield" style={{
                                    color: step.yieldPct >= 50 ? '#3BB570' : step.yieldPct >= 20 ? '#FA9E52' : '#959595',
                                }}>
                                    {step.yieldPct}%
                                </span>
                            )}
                            {step.notes && <span className="run-step-notes-preview">{step.notes}</span>}
                        </div>
                    )}

                    {/* Active step — weight inputs */}
                    {step.status === 'active' && canEdit && (
                        <div className="run-step-inputs">
                            <div className="run-step-weight-row">
                                <div className="run-step-field">
                                    <label>Input (g)</label>
                                    <div className="run-step-field-row">
                                        <Scale size={13} style={{ color: '#959595' }} />
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={inputG}
                                            onChange={e => setInputG(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                                <ArrowRight size={14} style={{ color: '#C0C0C0', marginTop: 20, flexShrink: 0 }} />
                                <div className="run-step-field">
                                    <label>Output (g)</label>
                                    <div className="run-step-field-row">
                                        <Scale size={13} style={{ color: '#959595' }} />
                                        <input
                                            type="number"
                                            className="field-input"
                                            value={outputG}
                                            onChange={e => setOutputG(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                                {inputG && outputG && parseFloat(inputG) > 0 && (
                                    <span className="run-step-live-yield" style={{ marginTop: 20 }}>
                                        {((parseFloat(outputG) / parseFloat(inputG)) * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                            <input
                                type="text"
                                className="field-input run-step-notes-input"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Step notes (temps, pressures, observations...)"
                            />
                            <div className="run-step-actions">
                                <button
                                    className="btn-primary text-sm px-3 py-1.5"
                                    onClick={handleCompleteStep}
                                    disabled={saving}
                                >
                                    <CheckCircle2 size={13} /> Complete Step
                                </button>
                                <button
                                    className="btn-cancel text-sm px-3 py-1.5"
                                    onClick={handleSaveWeights}
                                    disabled={saving || (!inputG && !outputG)}
                                >
                                    Save Weights
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Pending step — start / skip buttons */}
                    {step.status === 'pending' && isNext && runStatus === 'active' && (
                        <div className="run-step-actions">
                            <button
                                className="btn-primary text-sm px-3 py-1.5"
                                onClick={handleStartStep}
                                disabled={saving}
                            >
                                <Play size={13} /> Start Step
                            </button>
                            {step.isOptional && (
                                <button
                                    className="btn-cancel text-sm px-3 py-1.5"
                                    onClick={handleSkipStep}
                                    disabled={saving}
                                >
                                    <SkipForward size={13} /> Skip
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────

export const RunDetail: React.FC<{
    run: ExtractionRun;
    onUpdate: () => void;
}> = ({ run, onUpdate }) => {
    const [updating, setUpdating] = useState(false);

    // Find the next actionable step
    const nextStepIndex = run.steps.findIndex(s => s.status === 'pending' || s.status === 'active');

    const handleStartRun = async () => {
        setUpdating(true);
        await apiService.updateExtractionRun(run.id, { status: 'active' });
        // Also start the first step
        if (run.steps.length > 0 && run.steps[0].status === 'pending') {
            await apiService.updateRunStep(run.steps[0].id, { status: 'active' });
        }
        onUpdate();
        setUpdating(false);
    };

    const handleCompleteRun = async () => {
        setUpdating(true);
        await apiService.updateExtractionRun(run.id, { status: 'completed' });
        onUpdate();
        setUpdating(false);
    };

    const handleCancelRun = async () => {
        setUpdating(true);
        await apiService.updateExtractionRun(run.id, { status: 'cancelled' });
        onUpdate();
        setUpdating(false);
    };

    const allStepsDone = run.steps.every(s => s.status === 'completed' || s.status === 'skipped');

    return (
        <div className="run-detail">
            {/* Run-level actions */}
            {run.status === 'planned' && (
                <div className="run-detail-start">
                    <button
                        className="btn-primary text-sm px-4 py-2"
                        onClick={handleStartRun}
                        disabled={updating}
                    >
                        <Play size={14} /> Start Run
                    </button>
                    <button
                        className="btn-cancel text-sm px-3 py-1.5"
                        onClick={handleCancelRun}
                        disabled={updating}
                    >
                        Cancel Run
                    </button>
                </div>
            )}

            {run.status === 'active' && allStepsDone && (
                <div className="run-detail-complete">
                    <p className="run-detail-complete-msg">All steps complete. Ready to finalize?</p>
                    <button
                        className="btn-primary text-sm px-4 py-2"
                        onClick={handleCompleteRun}
                        disabled={updating}
                    >
                        <CheckCircle2 size={14} /> Complete Run
                    </button>
                </div>
            )}

            {/* Steps */}
            <div className="run-step-list">
                {run.steps.map((step, i) => (
                    <StepRow
                        key={step.id}
                        step={step}
                        isNext={i === nextStepIndex}
                        runStatus={run.status}
                        onUpdate={onUpdate}
                    />
                ))}
            </div>

            {/* Run notes */}
            {run.notes && (
                <p className="run-detail-notes">{run.notes}</p>
            )}

            {run.status === 'active' && !allStepsDone && (
                <div className="run-detail-cancel">
                    <button
                        className="btn-cancel text-xs px-2 py-1"
                        onClick={handleCancelRun}
                        disabled={updating}
                    >
                        Cancel Run
                    </button>
                </div>
            )}
        </div>
    );
};
