import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Plus, Save, ArrowLeft, Repeat, AlertTriangle, Leaf, Bug, Thermometer, Flag, UtensilsCrossed } from 'lucide-react';
import type { ProcessTemplate, ProcessStep, SOPTrack, SOPPhase } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { SOPEventEditor } from './SOPEventEditor';
import {
    TRACK_COLORS, TRACK_LABELS, TRACK_ORDER,
    PHASE_COLORS, PHASE_LABELS, PHASE_ORDER,
    getPhaseColumns, getTotalWeeks,
} from './cultivationSOPAdapter';

// ── Track icons ─────────────────────────────────────────────────────────────

const TRACK_ICONS: Record<string, typeof Leaf> = {
    feeding: UtensilsCrossed,
    training: Leaf,
    ipm: Bug,
    environment: Thermometer,
    milestone: Flag,
};

// ── Quick-add presets per track ─────────────────────────────────────────────

interface Preset {
    name: string;
    description?: string;
    taskCategory?: string;
    isSpan?: boolean;
    isCritical?: boolean;
    recurrence?: { everyWeeks: number };
    envTargets?: Record<string, any>;
}

const TRACK_PRESETS: Record<string, Preset[]> = {
    feeding: [
        { name: 'Weekly feed', taskCategory: 'cultivation', recurrence: { everyWeeks: 1 } },
        { name: 'Flush', taskCategory: 'cultivation', description: "pH'd water only, no nutrients" },
    ],
    training: [
        { name: 'Top', taskCategory: 'cultivation', description: 'Top above 5th node' },
        { name: 'LST', taskCategory: 'cultivation', description: 'Low stress training — tie down branches' },
        { name: 'Lollipop', taskCategory: 'cultivation', description: 'Strip bottom 1/3 of canopy' },
        { name: 'Defoliation', taskCategory: 'cultivation', description: 'Remove large fan leaves blocking bud sites' },
        { name: 'SCROG net', taskCategory: 'cultivation', description: 'Install and weave trellis net' },
    ],
    ipm: [
        { name: 'Scout', taskCategory: 'ipm', description: 'Check undersides of leaves, sticky traps, log findings', recurrence: { everyWeeks: 1 } },
        { name: 'Preventive spray', taskCategory: 'ipm', description: 'Rotate spray products to prevent resistance', recurrence: { everyWeeks: 2 } },
        { name: 'Beneficial release', taskCategory: 'ipm', description: 'Release beneficial insects (persimilis, swirskii, etc.)' },
        { name: 'No-spray zone', taskCategory: 'ipm', isSpan: true, description: 'No foliar sprays — too close to harvest' },
    ],
    environment: [
        { name: 'Set targets', isSpan: true, envTargets: { tempDay: 76, tempNight: 68, humidity: 50, co2: 1200, light: '18/6', ppfd: 600 } },
    ],
    milestone: [
        { name: 'Transplant', taskCategory: 'cultivation', description: 'Move to larger container or next room' },
        { name: 'Flip to flower', taskCategory: 'cultivation', description: 'Switch light schedule to 12/12' },
        { name: 'Trichome check', taskCategory: 'harvest', description: 'Check trichomes under 60x — target 20% amber' },
        { name: 'Flush start', taskCategory: 'cultivation', description: 'Begin final flush — plain water only' },
        { name: 'Chop', taskCategory: 'harvest', description: 'Cut plants and hang/rack for drying', isCritical: true },
    ],
};

// ── Default phase durations ─────────────────────────────────────────────────

const DEFAULT_DURATIONS: Record<string, number> = { nursery: 2, vegetative: 4, flowering: 9, drying: 2 };

// ── Types ───────────────────────────────────────────────────────────────────

interface EditableStep extends Omit<ProcessStep, 'id' | 'templateId'> {
    _key: string; // client-side key
    id?: string;
}

interface Props {
    initialTemplate?: ProcessTemplate;
    onBack: () => void;
    onSaved: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function CultivationSOPBuilder({ initialTemplate, onBack, onSaved }: Props) {
    // Template-level state
    const [title, setTitle] = useState(initialTemplate?.name ?? '');
    const [description, setDescription] = useState(initialTemplate?.description ?? '');
    const [phaseDurations, setPhaseDurations] = useState<Record<string, number>>(
        initialTemplate?.phaseDurations ?? { ...DEFAULT_DURATIONS }
    );
    const [steps, setSteps] = useState<EditableStep[]>(() =>
        initialTemplate?.steps
            .filter(s => s.track && s.phase)
            .map((s, i) => ({ ...s, _key: `init-${i}` })) ?? []
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Event editor state
    const [editingStep, setEditingStep] = useState<EditableStep | null>(null);
    const [editContext, setEditContext] = useState<{ track: SOPTrack; phase: SOPPhase; week: number } | null>(null);

    // Quick-add popover state
    const [quickAdd, setQuickAdd] = useState<{ track: string; phase: string; week: number; x: number; y: number } | null>(null);
    const quickAddRef = useRef<HTMLDivElement>(null);

    // Close quick-add on outside click
    useEffect(() => {
        if (!quickAdd) return;
        const handler = (e: MouseEvent) => {
            if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
                setQuickAdd(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [quickAdd]);

    // Phase columns
    const phaseColumns = useMemo(() => getPhaseColumns(phaseDurations), [phaseDurations]);
    const totalWeeks = useMemo(() => getTotalWeeks(phaseDurations), [phaseDurations]);

    // ── Key counter for new steps ───────────────────────────────────────────
    const keyCounter = useRef(0);
    const nextKey = () => `new-${++keyCounter.current}`;

    // ── Get steps at a (track, phase, week) position ────────────────────────
    const getStepsAt = useCallback((track: string, phase: string, week: number) =>
        steps.filter(s => s.track === track && s.phase === phase && s.phaseWeek === week),
    [steps]);

    // Get the span step for a cell (for environment)
    const getSpanStep = useCallback((track: string, phase: string, week: number) =>
        steps.find(s =>
            s.track === track && s.phase === phase && s.isSpan &&
            (s.phaseWeek ?? 1) <= week && (s.spanEndWeek ?? s.phaseWeek ?? 1) >= week
        ),
    [steps]);

    // ── Handle cell click → quick-add ───────────────────────────────────────
    const handleCellClick = useCallback((track: string, phase: string, week: number, e: React.MouseEvent) => {
        // If environment track and span already exists, edit the span
        if (track === 'environment') {
            const span = getSpanStep(track, phase, week);
            if (span) {
                setEditingStep(span);
                setEditContext({ track: track as SOPTrack, phase: phase as SOPPhase, week });
                return;
            }
        }
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setQuickAdd({ track, phase, week, x: rect.left, y: rect.bottom + 4 });
    }, [getSpanStep]);

    // ── Quick-add a preset ──────────────────────────────────────────────────
    const handlePresetAdd = useCallback((preset: Preset) => {
        if (!quickAdd) return;
        const { track, phase, week } = quickAdd;
        const phaseDuration = phaseDurations[phase] ?? 0;

        const newStep: EditableStep = {
            _key: nextKey(),
            stepOrder: steps.length + 1,
            name: preset.name,
            description: preset.description || null,
            inputType: null,
            outputType: null,
            equipmentType: null,
            expectedYieldPct: null,
            estDurationHours: null,
            estHandsOnHours: null,
            isOptional: false,
            track: track as SOPTrack,
            phase: phase as SOPPhase,
            phaseWeek: week,
            phaseDay: null,
            isSpan: preset.isSpan ?? false,
            spanEndWeek: preset.isSpan ? phaseDuration : null,
            envTargets: preset.envTargets ?? null,
            taskCategory: preset.taskCategory ?? null,
            onCompleteAction: null,
            requiresSupplies: null,
            isCritical: preset.isCritical ?? false,
            recurrence: preset.recurrence ?? null,
        };
        setSteps(prev => [...prev, newStep]);
        setQuickAdd(null);
    }, [quickAdd, steps.length, phaseDurations]);

    // ── Open custom editor ──────────────────────────────────────────────────
    const handleCustomAdd = useCallback(() => {
        if (!quickAdd) return;
        const { track, phase, week } = quickAdd;
        setEditContext({ track: track as SOPTrack, phase: phase as SOPPhase, week });
        setEditingStep(null); // null = new step
        setQuickAdd(null);
    }, [quickAdd]);

    // ── Handle event click → edit ───────────────────────────────────────────
    const handleEventClick = useCallback((step: EditableStep, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingStep(step);
        setEditContext({ track: step.track as SOPTrack, phase: step.phase as SOPPhase, week: step.phaseWeek ?? 1 });
    }, []);

    // ── Save event from editor ──────────────────────────────────────────────
    const handleEventSave = useCallback((updated: EditableStep) => {
        setSteps(prev => {
            const idx = prev.findIndex(s => s._key === updated._key);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
            }
            return [...prev, updated];
        });
        setEditingStep(null);
        setEditContext(null);
    }, []);

    // ── Delete event ────────────────────────────────────────────────────────
    const handleEventDelete = useCallback((key: string) => {
        setSteps(prev => prev.filter(s => s._key !== key));
        setEditingStep(null);
        setEditContext(null);
    }, []);

    // ── Phase duration change ───────────────────────────────────────────────
    const handleDurationChange = useCallback((phase: string, delta: number) => {
        setPhaseDurations(prev => ({
            ...prev,
            [phase]: Math.max(1, (prev[phase] ?? 1) + delta),
        }));
    }, []);

    // ── Save template ───────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (!title.trim()) { setError('SOP title is required'); return; }
        if (steps.length === 0) { setError('Add at least one event'); return; }
        setError(null);
        setSaving(true);
        try {
            await apiService.saveProcessTemplate({
                id: initialTemplate?.id,
                name: title.trim(),
                description: description.trim() || undefined,
                processType: 'custom',
                domain: 'cultivation',
                phaseDurations,
                steps: steps.map((s, i) => ({
                    stepOrder: i + 1,
                    name: s.name,
                    description: s.description || undefined,
                    track: s.track || undefined,
                    phase: s.phase || undefined,
                    phaseWeek: s.phaseWeek || undefined,
                    phaseDay: s.phaseDay || undefined,
                    isSpan: s.isSpan || undefined,
                    spanEndWeek: s.spanEndWeek || undefined,
                    envTargets: s.envTargets || undefined,
                    taskCategory: s.taskCategory || undefined,
                    onCompleteAction: s.onCompleteAction || undefined,
                    requiresSupplies: s.requiresSupplies || undefined,
                    isCritical: s.isCritical || undefined,
                    recurrence: s.recurrence || undefined,
                    estDurationHours: s.estDurationHours || undefined,
                    estHandsOnHours: s.estHandsOnHours || undefined,
                    isOptional: s.isOptional || undefined,
                })),
            });
            onSaved();
        } catch (e) {
            setError('Failed to save SOP');
        } finally {
            setSaving(false);
        }
    }, [title, description, phaseDurations, steps, initialTemplate?.id, onSaved]);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="cultivation-sop-builder">
            {/* ── Top bar ──────────────────────────────────────────────── */}
            <div className="sop-builder-header">
                <button className="btn-ghost" onClick={onBack} title="Back to list">
                    <ArrowLeft size={18} />
                </button>
                <input
                    className="sop-title-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="SOP title (e.g. Heavy Indica 9-week)"
                    autoFocus
                />
                <div className="sop-builder-actions">
                    <button className="btn-cancel" onClick={onBack}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save SOP'}
                    </button>
                </div>
            </div>

            {/* ── Description ──────────────────────────────────────────── */}
            <div className="sop-builder-desc">
                <input
                    className="field-input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Optional description..."
                    style={{ maxWidth: 600 }}
                />
            </div>

            {/* ── Phase duration chips ─────────────────────────────────── */}
            <div className="sop-phase-chips">
                {PHASE_ORDER.map(phase => (
                    <div key={phase} className="sop-phase-chip" style={{ borderColor: PHASE_COLORS[phase] }}>
                        <span className="sop-phase-chip-dot" style={{ background: PHASE_COLORS[phase] }} />
                        <span className="sop-phase-chip-label">{PHASE_LABELS[phase]}</span>
                        <button className="sop-phase-chip-btn" onClick={() => handleDurationChange(phase, -1)}>-</button>
                        <span className="sop-phase-chip-val">{phaseDurations[phase] ?? 0}w</span>
                        <button className="sop-phase-chip-btn" onClick={() => handleDurationChange(phase, 1)}>+</button>
                    </div>
                ))}
                <span className="sop-phase-total">{totalWeeks} weeks total</span>
            </div>

            {error && (
                <div className="modal-error" style={{ margin: '0 0 12px' }}>
                    <AlertTriangle size={14} />{error}
                </div>
            )}

            {/* ── Phase-lane grid ─────────────────────────────────────── */}
            <div className="sop-grid-wrapper">
                <div className="sop-grid" style={{ gridTemplateColumns: `120px repeat(${totalWeeks}, 1fr)` }}>
                    {/* ── Column headers: phase groupings ───────────────── */}
                    <div className="sop-grid-corner" />
                    {phaseColumns.map(col => (
                        <div
                            key={col.phase}
                            className="sop-phase-header"
                            style={{
                                gridColumn: `span ${col.weeks}`,
                                background: `${col.color}15`,
                                borderBottom: `2px solid ${col.color}`,
                            }}
                        >
                            {col.label}
                        </div>
                    ))}

                    {/* ── Week number sub-headers ───────────────────────── */}
                    <div className="sop-grid-corner sop-week-row" />
                    {phaseColumns.flatMap(col =>
                        Array.from({ length: col.weeks }, (_, i) => (
                            <div key={`${col.phase}-w${i + 1}`} className="sop-week-header">
                                W{i + 1}
                            </div>
                        ))
                    )}

                    {/* ── Track rows ────────────────────────────────────── */}
                    {TRACK_ORDER.map(track => {
                        const Icon = TRACK_ICONS[track] || Flag;
                        return (
                            <div key={track} className="sop-grid-track-row" style={{ display: 'contents' }}>
                                {/* Track label */}
                                <div className="sop-track-label" style={{ borderLeft: `3px solid ${TRACK_COLORS[track]}` }}>
                                    <Icon size={14} color={TRACK_COLORS[track]} />
                                    <span>{TRACK_LABELS[track]}</span>
                                </div>
                                {/* Week cells */}
                                {phaseColumns.flatMap(col =>
                                    Array.from({ length: col.weeks }, (_, i) => {
                                        const week = i + 1;
                                        const cellSteps = getStepsAt(track, col.phase, week);
                                        const spanStep = track === 'environment' ? getSpanStep(track, col.phase, week) : null;
                                        const isSpanStart = spanStep && spanStep.phaseWeek === week;
                                        const isSpanMiddle = spanStep && spanStep.phaseWeek !== week;

                                        return (
                                            <div
                                                key={`${track}-${col.phase}-${week}`}
                                                className={`sop-cell ${isSpanMiddle ? 'sop-cell-span-mid' : ''}`}
                                                onClick={(e) => handleCellClick(track, col.phase, week, e)}
                                                title={`${TRACK_LABELS[track]} — ${col.label} W${week}`}
                                            >
                                                {/* Environment span block */}
                                                {isSpanStart && spanStep && (
                                                    <div
                                                        className="sop-event sop-event-span"
                                                        style={{
                                                            background: `${TRACK_COLORS[track]}20`,
                                                            borderLeft: `3px solid ${TRACK_COLORS[track]}`,
                                                            width: `calc(${((spanStep.spanEndWeek ?? week) - week + 1) * 100}% + ${((spanStep.spanEndWeek ?? week) - week) * 1}px)`,
                                                        }}
                                                        onClick={(e) => handleEventClick(spanStep as EditableStep, e)}
                                                    >
                                                        <span className="sop-event-label">{spanStep.name}</span>
                                                        {spanStep.envTargets && (
                                                            <span className="sop-event-sub">
                                                                {spanStep.envTargets.tempDay && `${spanStep.envTargets.tempDay}F`}
                                                                {spanStep.envTargets.humidity && ` / ${spanStep.envTargets.humidity}%`}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Point events */}
                                                {!isSpanMiddle && cellSteps.filter(s => !s.isSpan).map(step => (
                                                    <div
                                                        key={step._key}
                                                        className={`sop-event ${step.isCritical ? 'sop-event-critical' : ''}`}
                                                        style={{
                                                            background: `${TRACK_COLORS[track]}20`,
                                                            borderLeft: `3px solid ${TRACK_COLORS[track]}`,
                                                        }}
                                                        onClick={(e) => handleEventClick(step, e)}
                                                    >
                                                        <span className="sop-event-label">{step.name}</span>
                                                        {step.recurrence && <Repeat size={10} className="sop-event-repeat" />}
                                                    </div>
                                                ))}
                                                {/* Empty cell indicator */}
                                                {cellSteps.length === 0 && !isSpanMiddle && !isSpanStart && (
                                                    <div className="sop-cell-empty">
                                                        <Plus size={12} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Quick-add popover ────────────────────────────────────── */}
            {quickAdd && (
                <div
                    ref={quickAddRef}
                    className="sop-quick-add"
                    style={{ position: 'fixed', left: quickAdd.x, top: quickAdd.y, zIndex: 1100 }}
                >
                    <div className="sop-quick-add-header">
                        {TRACK_LABELS[quickAdd.track]} — {PHASE_LABELS[quickAdd.phase] || quickAdd.phase} W{quickAdd.week}
                    </div>
                    {(TRACK_PRESETS[quickAdd.track] || []).map((preset, i) => (
                        <button key={i} className="sop-quick-add-item" onClick={() => handlePresetAdd(preset)}>
                            {preset.name}
                            {preset.recurrence && <Repeat size={10} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                            {preset.isSpan && <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', opacity: 0.5 }}>span</span>}
                        </button>
                    ))}
                    <button className="sop-quick-add-item sop-quick-add-custom" onClick={handleCustomAdd}>
                        Custom...
                    </button>
                </div>
            )}

            {/* ── Event editor modal ──────────────────────────────────── */}
            {editContext && (
                <SOPEventEditor
                    step={editingStep}
                    track={editContext.track}
                    phase={editContext.phase}
                    week={editContext.week}
                    phaseDuration={phaseDurations[editContext.phase] ?? 1}
                    onSave={handleEventSave}
                    onDelete={editingStep ? () => handleEventDelete(editingStep._key) : undefined}
                    onClose={() => { setEditingStep(null); setEditContext(null); }}
                    nextKey={nextKey}
                />
            )}
        </div>
    );
}
