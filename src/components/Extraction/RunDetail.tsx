import { useState, useMemo, useEffect } from 'react';
import { Play, CheckCircle2, Clock, Timer, Scale, Calendar, Cog } from 'lucide-react';
import type { ExtractionRun, ExtractionRunStep } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { FinishRunModal } from './FinishRunModal';

// ─────────────────────────────────────────────────────────────────────────────
// RunDetail — schedule-driven run view
//
// For planned runs, shows the step list and a Start Run button.
// For active runs:
//   - Steps auto-advance virtually from wall clock against run.started_at +
//     cumulative est_duration_hours per step. Nothing in the DB changes.
//   - Steps with requires_weight=true show an inline numeric input. The
//     operator taps any weight-required step in any order to enter a value.
//     Entering a value auto-saves via update-run-step and marks that step
//     status=completed in the DB.
//   - The Finalize Run button opens FinishRunModal. Gated on all required
//     weights being filled (or lets the modal collect the blanks).
// For completed/cancelled runs, shows the full step list + any check-ins.
//
// See `~/.claude/plans/p2-p3-run-lifecycle.md` for the full design.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatQuantity = (value: number | null, unit: string | null | undefined) => {
    if (value == null) return '—';
    const u = unit || 'g';
    if ((u === 'g' || u === 'grams') && value >= 1000) {
        return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
    }
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u}`;
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

const formatTimeRange = (start: Date, end: Date) => {
    const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${fmt(start)} – ${fmt(end)}`;
};

/**
 * Compute a virtual schedule from the run's started_at and each step's
 * est_duration_hours. Steps are scheduled back-to-back. Returns a map of
 * stepId → { scheduledStart, scheduledEnd }.
 *
 * If the run has no started_at, returns an empty map — the UI falls back to
 * showing all steps as "upcoming" without a live indicator.
 */
function computeSchedule(run: ExtractionRun): Map<string, { scheduledStart: Date; scheduledEnd: Date }> {
    const map = new Map<string, { scheduledStart: Date; scheduledEnd: Date }>();
    if (!run.startedAt) return map;

    const base = new Date(run.startedAt).getTime();
    let cursor = base;
    for (const step of [...run.steps].sort((a, b) => a.stepOrder - b.stepOrder)) {
        const durationH = step.estDurationHours ?? 0;
        const durationMs = durationH * 3600 * 1000;
        const scheduledStart = new Date(cursor);
        const scheduledEnd = new Date(cursor + durationMs);
        map.set(step.id, { scheduledStart, scheduledEnd });
        cursor += durationMs;
    }
    return map;
}

/**
 * Derive the "current" phase for a step relative to wall clock:
 *   - 'done-on-schedule': scheduled window has fully passed
 *   - 'current': wall clock is inside the scheduled window
 *   - 'upcoming': scheduled window hasn't started yet
 * If no schedule is available, returns 'upcoming' for everything.
 */
type StepPhase = 'done-on-schedule' | 'current' | 'upcoming';

function derivePhase(
    stepId: string,
    schedule: Map<string, { scheduledStart: Date; scheduledEnd: Date }>,
    now: Date
): StepPhase {
    const window = schedule.get(stepId);
    if (!window) return 'upcoming';
    if (now >= window.scheduledEnd) return 'done-on-schedule';
    if (now >= window.scheduledStart) return 'current';
    return 'upcoming';
}

// ── Inline weight check-in row (for steps with requires_weight=true) ────────

const WeightCheckInInput: React.FC<{
    step: ExtractionRunStep;
    onSaved: () => void;
}> = ({ step, onSaved }) => {
    const [value, setValue] = useState(step.checkInValue != null ? String(step.checkInValue) : '');
    const [saving, setSaving] = useState(false);
    const [touched, setTouched] = useState(false);

    const unit = step.weightUnit || step.checkInUnit || 'g';
    const filled = step.checkInValue != null;

    const handleSave = async () => {
        if (!touched || saving) return;
        if (value === '' || isNaN(parseFloat(value))) return;
        setSaving(true);
        try {
            await apiService.updateRunStep(step.id, {
                checkInValue: parseFloat(value),
                checkInUnit: unit,
                status: 'completed',
            });
            setTouched(false);
            onSaved();
        } catch {
            // Error handling is minimal here — the Finalize modal will surface
            // any blank/invalid weights at finalization time.
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`run-step-checkin ${filled ? 'run-step-checkin--filled' : 'run-step-checkin--missing'}`}>
            <Scale size={12} style={{ color: filled ? '#3BB570' : '#FA9E52' }} />
            <input
                type="number"
                className="field-input run-step-checkin-input"
                value={value}
                onChange={e => { setValue(e.target.value); setTouched(true); }}
                onBlur={handleSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="—"
                min="0"
                step="0.01"
                disabled={saving}
            />
            <span className="run-step-checkin-unit">{unit}</span>
            {!filled && (
                <span className="run-step-checkin-badge">needs check-in</span>
            )}
        </div>
    );
};

// ── Step row — renders a single step in the schedule-driven timeline ────────

const StepRow: React.FC<{
    step: ExtractionRunStep;
    phase: StepPhase;
    scheduleWindow: { scheduledStart: Date; scheduledEnd: Date } | undefined;
    runStatus: string;
    onUpdate: () => void;
}> = ({ step, phase, scheduleWindow, runStatus, onUpdate }) => {
    const isCurrent = phase === 'current' && runStatus === 'active';
    const isDoneOnSchedule = phase === 'done-on-schedule' || step.status === 'completed';
    const isActive = runStatus === 'active' || runStatus === 'completed';

    // When a step is marked completed in the DB (via a check-in entry or run finalize)
    // we show it as fully done regardless of schedule phase.
    const stepCompleted = step.status === 'completed';

    const rowClass = [
        'run-step-row',
        isCurrent && 'run-step-row--current',
        isDoneOnSchedule && 'run-step-row--done',
        phase === 'upcoming' && !stepCompleted && 'run-step-row--upcoming',
    ].filter(Boolean).join(' ');

    return (
        <div className={rowClass}>
            <div className="run-step-marker">
                <div className="run-step-num">{step.stepOrder}</div>
                {stepCompleted && <CheckCircle2 size={12} className="run-step-check" />}
            </div>
            <div className="run-step-body">
                <div className="run-step-header">
                    <span className="run-step-name">{step.name}</span>
                    {step.isOptional && <span className="run-step-optional">Optional</span>}
                </div>
                {step.description && (
                    <p className="run-step-desc">{step.description}</p>
                )}
                <div className="run-step-meta">
                    {scheduleWindow && isActive && (
                        <span className="run-step-meta-item">
                            <Calendar size={10} />
                            {formatTimeRange(scheduleWindow.scheduledStart, scheduleWindow.scheduledEnd)}
                        </span>
                    )}
                    {step.estDurationHours != null && step.estDurationHours > 0 && (
                        <span className="run-step-meta-item">
                            <Timer size={10} />
                            {step.estDurationHours < 1
                                ? `${Math.round(step.estDurationHours * 60)}m`
                                : `${step.estDurationHours}h`}
                        </span>
                    )}
                    {step.equipmentType && (
                        <span className="run-step-meta-item">
                            <Cog size={10} />
                            {step.equipmentType.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>
                {step.requiresWeight && runStatus === 'active' && (
                    <WeightCheckInInput step={step} onSaved={onUpdate} />
                )}
                {step.requiresWeight && runStatus !== 'active' && step.checkInValue != null && (
                    <div className="run-step-checkin run-step-checkin--filled">
                        <Scale size={12} style={{ color: '#3BB570' }} />
                        <span className="run-step-checkin-value">
                            {step.checkInValue} {step.weightUnit || step.checkInUnit || 'g'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Run Progress Header ─────────────────────────────────────────────────────

const RunProgress: React.FC<{ run: ExtractionRun }> = ({ run }) => {
    const totalDurationH = useMemo(
        () => run.steps.reduce((sum, s) => sum + (s.estDurationHours ?? 0), 0),
        [run.steps]
    );
    const totalSources = run.sourcePackages?.reduce((sum, p) => sum + (p.quantityUsed ?? p.quantity ?? 0), 0);

    return (
        <div className="cockpit-progress">
            <div className="cockpit-progress-stats">
                {run.startedAt && run.status === 'active' && (
                    <div className="cockpit-stat">
                        <Clock size={11} />
                        <span>{formatElapsed(run.startedAt)} of ~{totalDurationH.toFixed(1)}h</span>
                    </div>
                )}
                {run.startedAt && run.status !== 'active' && (
                    <div className="cockpit-stat">
                        <Clock size={11} />
                        <span>Started {new Date(run.startedAt).toLocaleString()}</span>
                    </div>
                )}
                {totalSources != null && totalSources > 0 && (
                    <div className="cockpit-stat">
                        <span className="cockpit-stat-label">Sources</span>
                        <span className="cockpit-stat-value">{formatQuantity(totalSources, 'g')}</span>
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
    const [showFinishModal, setShowFinishModal] = useState(false);

    // Tick every 60s so the schedule-derived phase updates without a full refetch.
    // Cheaper than polling the server — the phase is a pure function of wall clock.
    const [nowTick, setNowTick] = useState(() => Date.now());
    useEffect(() => {
        if (run.status !== 'active') return;
        const id = setInterval(() => setNowTick(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [run.status]);

    const schedule = useMemo(() => computeSchedule(run), [run]);
    const now = useMemo(() => new Date(nowTick), [nowTick]);

    const sortedSteps = useMemo(
        () => [...run.steps].sort((a, b) => a.stepOrder - b.stepOrder),
        [run.steps]
    );

    // Count steps that require a weight but don't have one yet.
    const missingCheckIns = useMemo(
        () => sortedSteps.filter(s => s.requiresWeight && s.checkInValue == null).length,
        [sortedSteps]
    );

    const handleStartRun = async () => {
        setUpdating(true);
        try {
            await apiService.updateExtractionRun(run.id, { status: 'active' });
            onUpdate();
        } finally {
            setUpdating(false);
        }
    };

    const handleOpenFinalize = () => {
        setShowFinishModal(true);
    };

    const handleCancelRun = async () => {
        setUpdating(true);
        try {
            await apiService.updateExtractionRun(run.id, { status: 'cancelled' });
            onUpdate();
        } finally {
            setUpdating(false);
        }
    };

    const handleModalCompleted = () => {
        setShowFinishModal(false);
        onUpdate();
    };

    // ── Planned run: show step list + start / cancel ──
    if (run.status === 'planned') {
        return (
            <div className="run-detail">
                <div className="run-step-list">
                    {sortedSteps.map(step => (
                        <StepRow
                            key={step.id}
                            step={step}
                            phase="upcoming"
                            scheduleWindow={undefined}
                            runStatus={run.status}
                            onUpdate={onUpdate}
                        />
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
        );
    }

    // ── Completed or cancelled run: read-only summary with check-ins ──
    if (run.status === 'completed' || run.status === 'cancelled') {
        return (
            <div className="run-detail">
                <RunProgress run={run} />
                <div className="run-step-list">
                    {sortedSteps.map(step => (
                        <StepRow
                            key={step.id}
                            step={step}
                            phase="done-on-schedule"
                            scheduleWindow={schedule.get(step.id)}
                            runStatus={run.status}
                            onUpdate={onUpdate}
                        />
                    ))}
                </div>
                {run.notes && <p className="cockpit-run-notes">{run.notes}</p>}
            </div>
        );
    }

    // ── Active run: schedule-driven timeline ──
    return (
        <div className="run-detail">
            <RunProgress run={run} />

            <div className="run-step-list">
                {sortedSteps.map(step => {
                    const phase = derivePhase(step.id, schedule, now);
                    return (
                        <StepRow
                            key={step.id}
                            step={step}
                            phase={phase}
                            scheduleWindow={schedule.get(step.id)}
                            runStatus={run.status}
                            onUpdate={onUpdate}
                        />
                    );
                })}
            </div>

            <div className="run-finalize-bar">
                {missingCheckIns > 0 && (
                    <span className="run-finalize-hint">
                        {missingCheckIns} check-in{missingCheckIns !== 1 ? 's' : ''} pending — you can enter them now or at finalize
                    </span>
                )}
                <button
                    className="btn-primary text-sm px-4 py-2"
                    onClick={handleOpenFinalize}
                    disabled={updating}
                >
                    <CheckCircle2 size={14} /> Finalize Run
                </button>
                <button
                    className="btn-cancel text-xs px-2 py-1"
                    onClick={handleCancelRun}
                    disabled={updating}
                >
                    Cancel Run
                </button>
            </div>

            {run.notes && <p className="cockpit-run-notes">{run.notes}</p>}

            {showFinishModal && (
                <FinishRunModal
                    run={run}
                    onClose={() => setShowFinishModal(false)}
                    onCompleted={handleModalCompleted}
                />
            )}
        </div>
    );
};
