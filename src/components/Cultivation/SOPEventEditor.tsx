import { useState, useCallback } from 'react';
import { Trash2, AlertTriangle, Repeat } from 'lucide-react';
import type { SOPTrack, SOPPhase } from '../../types/definitions';
import { TRACK_LABELS, PHASE_LABELS, TRACK_COLORS } from './cultivationSOPAdapter';
import { Modal } from '../ui/Modal';

// ── Types ───────────────────────────────────────────────────────────────────

interface EditableStep {
    _key: string;
    id?: string;
    stepOrder: number;
    name: string;
    description: string | null;
    inputType: string | null;
    outputType: string | null;
    equipmentType: string | null;
    expectedYieldPct: number | null;
    estDurationHours: number | null;
    estHandsOnHours: number | null;
    isOptional: boolean;
    track: SOPTrack | null;
    phase: SOPPhase | null;
    phaseWeek: number | null;
    phaseDay: number | null;
    isSpan: boolean;
    spanEndWeek: number | null;
    envTargets: Record<string, any> | null;
    taskCategory: string | null;
    onCompleteAction: { type: string; data: Record<string, any> } | null;
    requiresSupplies: string[] | null;
    isCritical: boolean;
    recurrence: { everyWeeks?: number } | null;
}

interface Props {
    step: EditableStep | null;  // null = new step
    track: SOPTrack;
    phase: SOPPhase;
    week: number;
    phaseDuration: number;
    onSave: (step: EditableStep) => void;
    onDelete?: () => void;
    onClose: () => void;
    nextKey: () => string;
}

// ── Task categories for dropdown ────────────────────────────────────────────

const TASK_CATEGORIES = [
    { value: 'cultivation', label: 'Cultivation' },
    { value: 'harvest', label: 'Harvest' },
    { value: 'ipm', label: 'IPM' },
    { value: 'environmental', label: 'Environmental' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'qc_testing', label: 'QC / Testing' },
    { value: 'sanitation', label: 'Sanitation' },
    { value: 'other', label: 'Other' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SOPEventEditor({ step, track, phase, week, phaseDuration, onSave, onDelete, onClose, nextKey }: Props) {
    const isNew = !step;

    // Form state
    const [name, setName] = useState(step?.name ?? '');
    const [description, setDescription] = useState(step?.description ?? '');
    const [taskCategory, setTaskCategory] = useState(step?.taskCategory ?? track);
    const [estimatedMinutes, setEstimatedMinutes] = useState(
        step?.estHandsOnHours ? Math.round(step.estHandsOnHours * 60) : ''
    );
    const [isCritical, setIsCritical] = useState(step?.isCritical ?? false);
    const [suppliesStr, setSuppliesStr] = useState((step?.requiresSupplies ?? []).join(', '));
    const [phaseDay, setPhaseDay] = useState<string>(step?.phaseDay?.toString() ?? '');

    // Recurrence
    const [hasRecurrence, setHasRecurrence] = useState(!!step?.recurrence);
    const [everyWeeks, setEveryWeeks] = useState(step?.recurrence?.everyWeeks ?? 1);

    // Span (environment / no-spray zones)
    const [isSpan, setIsSpan] = useState(step?.isSpan ?? track === 'environment');
    const [spanEndWeek, setSpanEndWeek] = useState(step?.spanEndWeek ?? phaseDuration);

    // Environment targets
    const [envTargets, setEnvTargets] = useState<Record<string, any>>(step?.envTargets ?? {});
    const updateEnv = (key: string, val: string) => setEnvTargets(prev => ({ ...prev, [key]: val }));

    const canSave = name.trim().length > 0;

    const handleSave = useCallback(() => {
        const supplies = suppliesStr.trim() ? suppliesStr.split(',').map(s => s.trim()).filter(Boolean) : null;
        const minutes = typeof estimatedMinutes === 'number' ? estimatedMinutes : parseInt(estimatedMinutes as string);

        const saved: EditableStep = {
            _key: step?._key ?? nextKey(),
            id: step?.id,
            stepOrder: step?.stepOrder ?? 0,
            name: name.trim(),
            description: description.trim() || null,
            inputType: null,
            outputType: null,
            equipmentType: null,
            expectedYieldPct: null,
            estDurationHours: null,
            estHandsOnHours: !isNaN(minutes) && minutes > 0 ? minutes / 60 : null,
            isOptional: false,
            track,
            phase,
            phaseWeek: week,
            phaseDay: phaseDay ? parseInt(phaseDay) || null : null,
            isSpan,
            spanEndWeek: isSpan ? spanEndWeek : null,
            envTargets: track === 'environment' ? envTargets : null,
            taskCategory: taskCategory || null,
            onCompleteAction: step?.onCompleteAction ?? null,
            requiresSupplies: supplies,
            isCritical,
            recurrence: hasRecurrence ? { everyWeeks } : null,
        };
        onSave(saved);
    }, [step, name, description, taskCategory, estimatedMinutes, isCritical, suppliesStr, phaseDay, hasRecurrence, everyWeeks, isSpan, spanEndWeek, envTargets, track, phase, week, nextKey, onSave]);

    const trackColor = TRACK_COLORS[track] || '#959595';

    return (
        <Modal
            title={isNew ? `Add ${TRACK_LABELS[track]} Event` : `Edit: ${step?.name}`}
            titleIcon={<div style={{ width: 12, height: 12, borderRadius: 3, background: trackColor }} />}
            onClose={onClose}
            footer={
                <>
                    {onDelete && (
                        <button className="btn-delete-confirm" onClick={onDelete} style={{ marginRight: 'auto' }}>
                            <Trash2 size={14} /> Delete
                        </button>
                    )}
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
                        {isNew ? 'Add Event' : 'Save'}
                    </button>
                </>
            }
        >
            {/* Context badge */}
            <div className="harvest-plan-summary" style={{ borderLeftColor: trackColor, marginBottom: 16 }}>
                <strong>{PHASE_LABELS[phase]}</strong> — Week {week}
                {phaseDay && ` / Day ${phaseDay}`}
                {isSpan && ` to W${spanEndWeek}`}
            </div>

            {/* Name */}
            <div className="field">
                <label className="field-label">Name <span style={{ color: 'var(--danger-color)' }}>*</span></label>
                <input
                    className="field-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Top, Weekly feed, Set targets"
                    autoFocus
                />
            </div>

            {/* Description */}
            <div className="field">
                <label className="field-label">Instructions</label>
                <textarea
                    className="field-input"
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Detailed how-to for this step..."
                />
            </div>

            {/* ── Track-specific sections ─────────────────────────────── */}

            {track === 'environment' && (
                <div className="sop-env-grid">
                    <div className="field">
                        <label className="field-label">Day Temp (F)</label>
                        <input className="field-input" value={envTargets.tempDay ?? ''} onChange={e => updateEnv('tempDay', e.target.value)} placeholder="76" />
                    </div>
                    <div className="field">
                        <label className="field-label">Night Temp (F)</label>
                        <input className="field-input" value={envTargets.tempNight ?? ''} onChange={e => updateEnv('tempNight', e.target.value)} placeholder="68" />
                    </div>
                    <div className="field">
                        <label className="field-label">Humidity (%)</label>
                        <input className="field-input" value={envTargets.humidity ?? ''} onChange={e => updateEnv('humidity', e.target.value)} placeholder="50 or 45→40" />
                    </div>
                    <div className="field">
                        <label className="field-label">CO2 (ppm)</label>
                        <input className="field-input" value={envTargets.co2 ?? ''} onChange={e => updateEnv('co2', e.target.value)} placeholder="1200" />
                    </div>
                    <div className="field">
                        <label className="field-label">VPD (kPa)</label>
                        <input className="field-input" value={envTargets.vpd ?? ''} onChange={e => updateEnv('vpd', e.target.value)} placeholder="1.0-1.2" />
                    </div>
                    <div className="field">
                        <label className="field-label">Light Schedule</label>
                        <input className="field-input" value={envTargets.light ?? ''} onChange={e => updateEnv('light', e.target.value)} placeholder="18/6" />
                    </div>
                    <div className="field">
                        <label className="field-label">PPFD (umol)</label>
                        <input className="field-input" value={envTargets.ppfd ?? ''} onChange={e => updateEnv('ppfd', e.target.value)} placeholder="900" />
                    </div>
                </div>
            )}

            {track === 'environment' && (
                <div className="field-row" style={{ marginTop: 8 }}>
                    <div className="field">
                        <label className="field-label">Span: Week {week} to</label>
                        <input
                            className="field-input"
                            type="number"
                            min={week}
                            max={phaseDuration}
                            value={spanEndWeek}
                            onChange={e => setSpanEndWeek(parseInt(e.target.value) || week)}
                        />
                    </div>
                </div>
            )}

            {track !== 'environment' && (
                <>
                    {/* Category + time row */}
                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Task Category</label>
                            <select className="field-input" value={taskCategory} onChange={e => setTaskCategory(e.target.value)}>
                                {TASK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Est. Time</label>
                            <div className="field-input-wrap">
                                <input
                                    className="field-input"
                                    type="number"
                                    value={estimatedMinutes}
                                    onChange={e => setEstimatedMinutes(e.target.value as any)}
                                    placeholder="30"
                                />
                                <span className="field-input-unit">min</span>
                            </div>
                        </div>
                    </div>

                    {/* Specific day */}
                    {(track === 'training' || track === 'milestone') && (
                        <div className="field">
                            <label className="field-label">Day of Phase (optional)</label>
                            <div className="field-input-wrap" style={{ maxWidth: 200 }}>
                                <input
                                    className="field-input"
                                    type="number"
                                    min={1}
                                    value={phaseDay}
                                    onChange={e => setPhaseDay(e.target.value)}
                                    placeholder={`e.g. ${((week - 1) * 7) + 1}`}
                                />
                                <span className="field-input-unit">day</span>
                            </div>
                            <span className="field-hint">Absolute day within {PHASE_LABELS[phase]} (Week {week} = days {(week - 1) * 7 + 1}–{week * 7})</span>
                        </div>
                    )}

                    {/* Recurrence */}
                    {(track === 'feeding' || track === 'ipm') && (
                        <div className="field">
                            <label className="field-label">
                                <label className="sop-checkbox-label">
                                    <input type="checkbox" checked={hasRecurrence} onChange={e => setHasRecurrence(e.target.checked)} />
                                    <Repeat size={12} />
                                    Repeat every
                                </label>
                            </label>
                            {hasRecurrence && (
                                <div className="field-input-wrap" style={{ maxWidth: 160, marginTop: 4 }}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={1}
                                        value={everyWeeks}
                                        onChange={e => setEveryWeeks(parseInt(e.target.value) || 1)}
                                    />
                                    <span className="field-input-unit">week(s)</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Span toggle for IPM (no-spray zones) */}
                    {track === 'ipm' && (
                        <div className="field">
                            <label className="sop-checkbox-label">
                                <input type="checkbox" checked={isSpan} onChange={e => setIsSpan(e.target.checked)} />
                                Span (no-spray zone)
                            </label>
                            {isSpan && (
                                <div className="field-input-wrap" style={{ maxWidth: 160, marginTop: 4 }}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={week}
                                        max={phaseDuration}
                                        value={spanEndWeek}
                                        onChange={e => setSpanEndWeek(parseInt(e.target.value) || week)}
                                    />
                                    <span className="field-input-unit">end week</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Supplies */}
                    <div className="field">
                        <label className="field-label">Supplies Needed</label>
                        <input
                            className="field-input"
                            value={suppliesStr}
                            onChange={e => setSuppliesStr(e.target.value)}
                            placeholder="Comma-separated: Athena Bloom, pH Down"
                        />
                    </div>

                    {/* Critical checkbox */}
                    <div className="field">
                        <label className="sop-checkbox-label">
                            <input type="checkbox" checked={isCritical} onChange={e => setIsCritical(e.target.checked)} />
                            <AlertTriangle size={12} />
                            Compliance-critical (cannot be skipped)
                        </label>
                    </div>
                </>
            )}
        </Modal>
    );
}
