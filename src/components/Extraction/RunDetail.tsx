import { useState, useMemo } from 'react';
import { Play, CheckCircle2, SkipForward, Scale, ArrowRight, Clock, Timer, ChevronDown, ChevronUp } from 'lucide-react';
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

const formatElapsed = (start: string | null) => {
    if (!start) return null;
    const ms = Date.now() - new Date(start).getTime();
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

// ── Completed Step (collapsed summary line) ─────────────────────────────────

const CompletedStep: React.FC<{ step: ExtractionRunStep }> = ({ step }) => (
    <div className="cockpit-done-step">
        <div className="cockpit-done-check">
            {step.status === 'skipped' ? (
                <SkipForward size={10} style={{ color: '#C0C0C0' }} />
            ) : (
                <CheckCircle2 size={12} style={{ color: '#3BB570' }} />
            )}
        </div>
        <span className="cockpit-done-name">{step.name}</span>
        {step.status === 'completed' && step.inputWeightG != null && (
            <span className="cockpit-done-weights">
                {formatWeight(step.inputWeightG)}
                <ArrowRight size={10} style={{ color: '#C0C0C0' }} />
                {formatWeight(step.outputWeightG)}
            </span>
        )}
        {step.yieldPct != null && (
            <span className="cockpit-done-yield" style={{
                color: step.yieldPct >= 50 ? '#3BB570' : step.yieldPct >= 20 ? '#FA9E52' : '#959595',
            }}>
                {step.yieldPct}%
            </span>
        )}
        {step.status === 'skipped' && (
            <span className="cockpit-done-skipped">Skipped</span>
        )}
    </div>
);

// ── Active Step (cockpit center — dominant) ─────────────────────────────────

const ActiveStep: React.FC<{
    step: ExtractionRunStep;
    suggestedInput: number | null;
    onUpdate: () => void;
}> = ({ step, suggestedInput, onUpdate }) => {
    const defaultInput = step.inputWeightG?.toString() || (suggestedInput ? suggestedInput.toString() : '');
    const [inputG, setInputG] = useState(defaultInput);
    const [outputG, setOutputG] = useState(step.outputWeightG?.toString() || '');
    const [notes, setNotes] = useState(step.notes || '');
    const [saving, setSaving] = useState(false);

    const liveYield = inputG && outputG && parseFloat(inputG) > 0
        ? ((parseFloat(outputG) / parseFloat(inputG)) * 100).toFixed(1)
        : null;

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

    const handleSaveWeights = async () => {
        if (!inputG && !outputG && !notes.trim()) return;
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
        <div className="cockpit-active">
            <div className="cockpit-active-header">
                <div className="cockpit-active-indicator" />
                <div className="cockpit-active-title">
                    <span className="cockpit-active-step-num">Step {step.stepOrder}</span>
                    <h3 className="cockpit-active-name">{step.name}</h3>
                </div>
                {step.startedAt && (
                    <div className="cockpit-active-timer">
                        <Timer size={12} />
                        {formatElapsed(step.startedAt)}
                    </div>
                )}
            </div>

            {step.description && (
                <p className="cockpit-active-desc">{step.description}</p>
            )}

            <div className="cockpit-active-inputs">
                <div className="cockpit-weight-pair">
                    <div className="cockpit-weight-field">
                        <label>Input</label>
                        <div className="cockpit-weight-input-row">
                            <Scale size={14} style={{ color: '#959595' }} />
                            <input
                                type="number"
                                className="field-input cockpit-weight-input"
                                value={inputG}
                                onChange={e => setInputG(e.target.value)}
                                placeholder="0.00"
                                step="0.01"
                            />
                            <span className="cockpit-weight-unit">g</span>
                        </div>
                    </div>
                    <div className="cockpit-weight-arrow">
                        <ArrowRight size={16} style={{ color: '#C0C0C0' }} />
                    </div>
                    <div className="cockpit-weight-field">
                        <label>Output</label>
                        <div className="cockpit-weight-input-row">
                            <Scale size={14} style={{ color: '#959595' }} />
                            <input
                                type="number"
                                className="field-input cockpit-weight-input"
                                value={outputG}
                                onChange={e => setOutputG(e.target.value)}
                                placeholder="0.00"
                                step="0.01"
                            />
                            <span className="cockpit-weight-unit">g</span>
                        </div>
                    </div>
                    {liveYield && (
                        <div className="cockpit-live-yield">
                            <span className="cockpit-live-yield-value" style={{
                                color: parseFloat(liveYield) >= 50 ? '#3BB570'
                                    : parseFloat(liveYield) >= 20 ? '#FA9E52' : '#959595',
                            }}>
                                {liveYield}%
                            </span>
                            <span className="cockpit-live-yield-label">yield</span>
                        </div>
                    )}
                </div>
                <input
                    type="text"
                    className="field-input cockpit-notes-input"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Notes — temps, pressures, observations..."
                />
            </div>

            <div className="cockpit-active-actions">
                <button
                    className="btn-primary cockpit-btn-complete"
                    onClick={handleCompleteStep}
                    disabled={saving}
                >
                    <CheckCircle2 size={14} /> Complete Step
                </button>
                <button
                    className="btn-cancel text-sm px-3 py-1.5"
                    onClick={handleSaveWeights}
                    disabled={saving || (!inputG && !outputG && !notes.trim())}
                >
                    Save
                </button>
            </div>
        </div>
    );
};

// ── Pending Step (muted, compact) ───────────────────────────────────────────

const PendingStep: React.FC<{
    step: ExtractionRunStep;
    isNext: boolean;
    runStatus: string;
    onUpdate: () => void;
}> = ({ step, isNext, runStatus, onUpdate }) => {
    const [saving, setSaving] = useState(false);

    const handleStartStep = async () => {
        setSaving(true);
        await apiService.updateRunStep(step.id, { status: 'active' });
        onUpdate();
        setSaving(false);
    };

    const handleSkipStep = async () => {
        setSaving(true);
        await apiService.updateRunStep(step.id, { status: 'skipped' });
        onUpdate();
        setSaving(false);
    };

    return (
        <div className={`cockpit-pending ${isNext ? 'cockpit-pending--next' : ''}`}>
            <div className="cockpit-pending-num">{step.stepOrder}</div>
            <span className="cockpit-pending-name">{step.name}</span>
            {step.isOptional && <span className="cockpit-pending-optional">Optional</span>}
            {isNext && runStatus === 'active' && (
                <div className="cockpit-pending-actions">
                    <button
                        className="btn-primary text-xs px-2.5 py-1"
                        onClick={handleStartStep}
                        disabled={saving}
                    >
                        <Play size={11} /> Start
                    </button>
                    {step.isOptional && (
                        <button
                            className="btn-cancel text-xs px-2 py-1"
                            onClick={handleSkipStep}
                            disabled={saving}
                        >
                            Skip
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Run Progress Header ─────────────────────────────────────────────────────

const RunProgress: React.FC<{ run: ExtractionRun }> = ({ run }) => {
    const completedSteps = run.steps.filter(s => s.status === 'completed').length;
    const skippedSteps = run.steps.filter(s => s.status === 'skipped').length;
    const doneCount = completedSteps + skippedSteps;
    const totalSteps = run.steps.length;

    // Cumulative yield across completed steps
    const cumulativeYield = run.steps
        .filter(s => s.status === 'completed' && s.yieldPct != null)
        .reduce((pct, s) => pct * (s.yieldPct! / 100), 1);
    const hasYield = run.steps.some(s => s.yieldPct != null);

    // Total input (first step) and total output (last completed step)
    const firstInput = run.steps.find(s => s.inputWeightG != null)?.inputWeightG;
    const completedWithOutput = run.steps.filter(s => s.status === 'completed' && s.outputWeightG != null);
    const lastOutput = completedWithOutput.length > 0
        ? completedWithOutput[completedWithOutput.length - 1].outputWeightG
        : null;

    return (
        <div className="cockpit-progress">
            <div className="cockpit-progress-bar-wrap">
                <div className="cockpit-progress-bar">
                    {run.steps.map((step) => {
                        const isDone = step.status === 'completed' || step.status === 'skipped';
                        const isActive = step.status === 'active';
                        return (
                            <div
                                key={step.id}
                                className={`cockpit-progress-segment ${isDone ? 'cockpit-progress-segment--done' : ''} ${isActive ? 'cockpit-progress-segment--active' : ''}`}
                                style={{ flex: 1 }}
                                title={`${step.name} — ${STEP_STATUS_CONFIG[step.status]?.label}`}
                            />
                        );
                    })}
                </div>
                <span className="cockpit-progress-label">{doneCount}/{totalSteps}</span>
            </div>
            <div className="cockpit-progress-stats">
                {run.startedAt && (
                    <div className="cockpit-stat">
                        <Clock size={11} />
                        <span>{formatElapsed(run.startedAt)}</span>
                    </div>
                )}
                {firstInput != null && (
                    <div className="cockpit-stat">
                        <span className="cockpit-stat-label">In</span>
                        <span className="cockpit-stat-value">{formatWeight(firstInput)}</span>
                    </div>
                )}
                {lastOutput != null && (
                    <div className="cockpit-stat">
                        <span className="cockpit-stat-label">Out</span>
                        <span className="cockpit-stat-value">{formatWeight(lastOutput)}</span>
                    </div>
                )}
                {hasYield && (
                    <div className="cockpit-stat">
                        <span className="cockpit-stat-label">Yield</span>
                        <span className="cockpit-stat-value cockpit-stat-yield" style={{
                            color: cumulativeYield * 100 >= 50 ? '#3BB570'
                                : cumulativeYield * 100 >= 20 ? '#FA9E52' : '#959595',
                        }}>
                            {(cumulativeYield * 100).toFixed(1)}%
                        </span>
                    </div>
                )}
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
    const [showCompleted, setShowCompleted] = useState(false);

    const completedSteps = useMemo(() => run.steps.filter(s => s.status === 'completed' || s.status === 'skipped'), [run.steps]);
    const activeStep = useMemo(() => run.steps.find(s => s.status === 'active'), [run.steps]);
    const pendingSteps = useMemo(() => run.steps.filter(s => s.status === 'pending'), [run.steps]);
    const nextPendingIndex = useMemo(() => run.steps.findIndex(s => s.status === 'pending'), [run.steps]);

    const allStepsDone = run.steps.every(s => s.status === 'completed' || s.status === 'skipped');

    const handleStartRun = async () => {
        setUpdating(true);
        await apiService.updateExtractionRun(run.id, { status: 'active' });
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

    // ── Planned run: just show start/cancel ──
    if (run.status === 'planned') {
        return (
            <div className="run-detail">
                <div className="cockpit-planned">
                    <div className="cockpit-planned-steps">
                        {run.steps.map(step => (
                            <div key={step.id} className="cockpit-planned-step">
                                <span className="cockpit-pending-num">{step.stepOrder}</span>
                                <span className="cockpit-pending-name">{step.name}</span>
                                {step.isOptional && <span className="cockpit-pending-optional">Optional</span>}
                            </div>
                        ))}
                    </div>
                    <div className="cockpit-planned-actions">
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
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Completed run: show all steps as summary ──
    if (run.status === 'completed' || run.status === 'cancelled') {
        return (
            <div className="run-detail">
                <RunProgress run={run} />
                <div className="cockpit-done-zone">
                    {run.steps.map(step => (
                        <CompletedStep key={step.id} step={step} />
                    ))}
                </div>
                {run.notes && <p className="cockpit-run-notes">{run.notes}</p>}
            </div>
        );
    }

    // ── Active run: the cockpit ──
    return (
        <div className="run-detail">
            <RunProgress run={run} />

            {/* Zone 1: Completed steps — collapsed */}
            {completedSteps.length > 0 && (
                <div className="cockpit-done-zone">
                    {completedSteps.length <= 2 || showCompleted ? (
                        completedSteps.map(step => (
                            <CompletedStep key={step.id} step={step} />
                        ))
                    ) : (
                        <>
                            <CompletedStep step={completedSteps[completedSteps.length - 1]} />
                        </>
                    )}
                    {completedSteps.length > 2 && (
                        <button
                            className="cockpit-done-toggle"
                            onClick={() => setShowCompleted(!showCompleted)}
                        >
                            {showCompleted ? (
                                <><ChevronUp size={12} /> Hide previous steps</>
                            ) : (
                                <><ChevronDown size={12} /> {completedSteps.length - 1} more completed</>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Zone 2: Active step — dominant cockpit */}
            {activeStep && (
                <ActiveStep
                    step={activeStep}
                    suggestedInput={(() => {
                        if (activeStep.inputWeightG != null) return null; // already has a value
                        // Find the previous completed step's output
                        const prevCompleted = completedSteps.filter(s => s.status === 'completed' && s.outputWeightG != null);
                        if (prevCompleted.length > 0) return prevCompleted[prevCompleted.length - 1].outputWeightG;
                        // First step: sum of source package quantities
                        const sourceTotal = run.sourcePackages?.reduce((sum, p) => sum + (p.quantityUsed ?? p.quantity ?? 0), 0);
                        return sourceTotal && sourceTotal > 0 ? sourceTotal : null;
                    })()}
                    onUpdate={onUpdate}
                />
            )}

            {/* Zone 3: Pending steps — muted list */}
            {pendingSteps.length > 0 && (
                <div className="cockpit-pending-zone">
                    <span className="cockpit-zone-label">Up next</span>
                    {pendingSteps.map((step) => (
                        <PendingStep
                            key={step.id}
                            step={step}
                            isNext={run.steps.indexOf(step) === nextPendingIndex}
                            runStatus={run.status}
                            onUpdate={onUpdate}
                        />
                    ))}
                </div>
            )}

            {/* All done — finalize prompt */}
            {allStepsDone && (
                <div className="cockpit-finalize">
                    <p className="cockpit-finalize-msg">All steps complete</p>
                    <button
                        className="btn-primary text-sm px-4 py-2"
                        onClick={handleCompleteRun}
                        disabled={updating}
                    >
                        <CheckCircle2 size={14} /> Finalize Run
                    </button>
                </div>
            )}

            {run.notes && <p className="cockpit-run-notes">{run.notes}</p>}

            <div className="cockpit-cancel">
                <button
                    className="btn-cancel text-xs px-2 py-1"
                    onClick={handleCancelRun}
                    disabled={updating}
                >
                    Cancel Run
                </button>
            </div>
        </div>
    );
};
