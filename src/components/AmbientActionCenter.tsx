import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown, ClipboardList, Scissors, Sprout, Leaf,
    Package, Thermometer, Scale, Shield, Dna, DoorOpen, Tag,
    type LucideIcon,
} from 'lucide-react';
import type { ProposedAction, ProposedActionType } from '../types/definitions';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AmbientCapture {
    id: string;
    actionType: ProposedActionType;
    label: string;      // "Task created", "Trim session started"
    summary: string;    // strain · weight · etc
    kind: 'task' | 'action' | 'review';
    timestamp: number;
}

export interface TranscriptLine {
    id: string;
    text: string;
    timestamp: number;
}

interface AmbientActionCenterProps {
    isPaused: boolean;
    interimText: string;
    hasVoiceSignal: boolean;
    captures: AmbientCapture[];
    pendingActions: ProposedAction[] | null;
    isExecuting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    transcript: TranscriptLine[];
    onUpdateCapture?: (capture: AmbientCapture, updates: { title?: string }) => Promise<boolean>;
    micError?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_META: Partial<Record<ProposedActionType, { icon: LucideIcon; color: string; label: string }>> = {
    create_human_task:   { icon: ClipboardList, color: '#959595', label: 'Task captured' },
    update_human_task:   { icon: ClipboardList, color: '#959595', label: 'Task updated' },
    delete_human_task:   { icon: ClipboardList, color: '#959595', label: 'Task removed' },
    create_session:      { icon: Scissors,      color: '#1C9EFF', label: 'Trim session' },
    add_batch:           { icon: Package,       color: '#1C9EFF', label: 'Batch added' },
    assign_trimmer:      { icon: Scissors,      color: '#1C9EFF', label: 'Trimmer assigned' },
    submit_session:      { icon: Scissors,      color: '#1C9EFF', label: 'Session submitted' },
    create_harvest:      { icon: Sprout,        color: '#FA9E52', label: 'Harvest created' },
    record_wet_weight:   { icon: Scale,         color: '#FA9E52', label: 'Weight recorded' },
    record_plant_weight: { icon: Scale,         color: '#FA9E52', label: 'Plants weighed' },
    allocate_harvest:    { icon: Sprout,        color: '#FA9E52', label: 'Harvest allocated' },
    record_harvest_waste:{ icon: Sprout,        color: '#DF5B59', label: 'Waste recorded' },
    move_harvest:        { icon: Sprout,        color: '#FA9E52', label: 'Harvest moved' },
    record_extraction:   { icon: Thermometer,   color: '#FA9E52', label: 'Extraction run' },
    create_planting:     { icon: Leaf,          color: '#3BB570', label: 'Plants added' },
    move_plants:         { icon: Leaf,          color: '#3BB570', label: 'Plants moved' },
    change_plant_phase:  { icon: Leaf,          color: '#3BB570', label: 'Phase changed' },
    destroy_plants:      { icon: Leaf,          color: '#DF5B59', label: 'Plants destroyed' },
    update_plant_health: { icon: Leaf,          color: '#3BB570', label: 'Health updated' },
    flag_contamination:  { icon: Leaf,          color: '#DF5B59', label: 'Contamination flagged' },
    create_package:      { icon: Package,       color: '#3BB570', label: 'Package created' },
    finish_package:      { icon: Package,       color: '#3BB570', label: 'Package finished' },
    create_strain:       { icon: Dna,           color: '#959595', label: 'Strain added' },
    create_license:      { icon: Shield,        color: '#959595', label: 'License added' },
    create_room:         { icon: DoorOpen,      color: '#959595', label: 'Room added' },
    assign_tag:          { icon: Tag,           color: '#959595', label: 'Tag assigned' },
    auto_assign_tags:    { icon: Tag,           color: '#959595', label: 'Tags assigned' },
    import_tags:         { icon: Tag,           color: '#959595', label: 'Tags imported' },
};

// eslint-disable-next-line react-refresh/only-export-components
export function describeAction(action: ProposedAction): { label: string; summary: string; color: string; icon: LucideIcon; kind: 'task' | 'action' | 'review' } {
    const meta = ACTION_META[action.type] || { icon: ClipboardList, color: '#959595', label: action.type.replace(/_/g, ' ') };
    const d = action.data || {};
    let summary = '';
    switch (action.type) {
        case 'create_human_task':
        case 'update_human_task':
            summary = d.title || d.taskTitle || ''; break;
        case 'create_session':
            summary = [d.strain, d.harvestName].filter(Boolean).join(' · '); break;
        case 'add_batch':
            summary = [d.strain, d.startWeight && `${d.startWeight}g`].filter(Boolean).join(' · '); break;
        case 'assign_trimmer':
            summary = [d.name, d.entryName].filter(Boolean).join(' → '); break;
        case 'create_harvest':
            summary = [d.strain, d.plantCount && `${d.plantCount} plants`].filter(Boolean).join(' · '); break;
        case 'record_wet_weight':
            summary = [d.harvestIdentifier, d.weight && `${d.weight}g`].filter(Boolean).join(' · '); break;
        case 'record_extraction':
            summary = [d.strain, d.inputPackageType?.replace('_', ' '), '→', d.outputPackageType?.replace('_', ' ')].filter(Boolean).join(' '); break;
        case 'create_planting':
            summary = [d.strainName, d.count && `${d.count} plants`].filter(Boolean).join(' · '); break;
        case 'move_plants':
            summary = [d.strain, d.targetRoomName].filter(Boolean).join(' → '); break;
        case 'flag_contamination':
            summary = d.contaminants?.join(', ') || ''; break;
        default:
            summary = d.strain || d.name || d.label || d.entryName || d.title || '';
    }
    const kind: 'task' | 'action' | 'review' =
        action.type === 'create_human_task' ? 'task' : 'action';
    return { ...meta, summary, kind };
}

function formatClock(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const AmbientActionCenter: React.FC<AmbientActionCenterProps> = ({
    isPaused,
    interimText,
    hasVoiceSignal,
    captures,
    pendingActions,
    isExecuting,
    onConfirm,
    onCancel,
    transcript,
    onUpdateCapture,
    micError,
}) => {
    const [transcriptOpen, setTranscriptOpen] = useState(false);
    const [pulse, setPulse] = useState(0);
    // Tagline shows the most recent capture for ~6s after it arrives,
    // then reverts to the default. Tracked as state so render is pure.
    const [recentCaptureLabel, setRecentCaptureLabel] = useState<string | null>(null);
    const lastCaptureIdRef = useRef<string | null>(null);

    // Inline-edit state for capture chips
    const [editingCaptureId, setEditingCaptureId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const startEditing = (cap: AmbientCapture) => {
        if (cap.kind !== 'task' || !onUpdateCapture) return;
        setEditingCaptureId(cap.id);
        setEditDraft(cap.summary || cap.label);
        setEditError(null);
    };

    const cancelEditing = () => {
        setEditingCaptureId(null);
        setEditDraft('');
        setEditError(null);
    };

    const saveEditing = async (cap: AmbientCapture) => {
        if (!onUpdateCapture) return;
        const trimmed = editDraft.trim();
        if (!trimmed || trimmed === cap.summary) {
            cancelEditing();
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            const ok = await onUpdateCapture(cap, { title: trimmed });
            if (ok) {
                cancelEditing();
            } else {
                setEditError('Could not find the task to update.');
            }
        } catch {
            setEditError('Update failed.');
        } finally {
            setEditSaving(false);
        }
    };

    useEffect(() => {
        const last = captures[captures.length - 1];
        if (!last || last.id === lastCaptureIdRef.current) return;
        lastCaptureIdRef.current = last.id;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPulse(p => p + 1);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRecentCaptureLabel(last.label.toLowerCase());
        const id = setTimeout(() => setRecentCaptureLabel(null), 6000);
        return () => clearTimeout(id);
    }, [captures]);

    const tagline = useMemo(() => {
        if (micError) return micError;
        if (isPaused) {
            return captures.length > 0
                ? 'Stopped — review captures or resume to keep listening'
                : 'Stopped — resume to keep listening';
        }
        if (recentCaptureLabel) return `Heard "${recentCaptureLabel}"`;
        if (interimText) return 'Hearing you';
        return 'Listening for tasks';
    }, [micError, recentCaptureLabel, interimText, isPaused, captures.length]);

    const taskCount = captures.filter(c => c.kind === 'task').length;
    const actionCount = captures.filter(c => c.kind === 'action').length;

    // Newest first for the captures log
    const recentCaptures = useMemo(() => [...captures].reverse().slice(0, 8), [captures]);

    return (
        <div className="ambient-body">
            {/* Subtle radial wash — bleeds into the AI home white */}
            <div className="ambient-body-wash" aria-hidden />

            {/* Orb anchor — sits where the input textarea was */}
            <div className="ambient-stage">
                <div
                    className={`ambient-orb${hasVoiceSignal ? ' active' : ''}${isPaused ? ' paused' : ''}`}
                    aria-hidden
                >
                    <div className="ambient-orb-ring r1" />
                    <div className="ambient-orb-ring r2" />
                    <div className="ambient-orb-ring r3" />
                    <div className="ambient-orb-core" />
                </div>
                <p
                    key={pulse}
                    className={`ambient-tagline${micError ? ' error' : ''}`}
                >
                    {tagline}
                </p>
            </div>

            {/* Tally — free-floating, no card */}
            <div className="ambient-tally">
                <div className="ambient-tally-cell">
                    <span className="ambient-tally-num tabular">{actionCount}</span>
                    <span className="ambient-tally-label">Actions</span>
                </div>
                <span className="ambient-tally-rule" />
                <div className="ambient-tally-cell">
                    <span className="ambient-tally-num tabular">{taskCount}</span>
                    <span className="ambient-tally-label">Tasks</span>
                </div>
                <span className="ambient-tally-rule" />
                <div className="ambient-tally-cell">
                    <span className="ambient-tally-num tabular">{pendingActions?.length || 0}</span>
                    <span className="ambient-tally-label">Review</span>
                </div>
            </div>

            {/* Pending review — the only legitimate card on this surface */}
            {pendingActions && pendingActions.length > 0 && (
                <div className="ambient-review">
                    <div className="ambient-review-head">
                        <span className="ambient-review-label">Needs your OK</span>
                        <span className="ambient-review-count tabular">
                            {pendingActions.length} action{pendingActions.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="ambient-review-list">
                        {pendingActions.slice(0, 4).map((action, idx) => {
                            const d = describeAction(action);
                            const Icon = d.icon;
                            return (
                                <div className="ambient-review-row" key={idx}>
                                    <div className="ambient-review-icon" style={{ color: d.color, background: `${d.color}14` }}>
                                        <Icon size={14} />
                                    </div>
                                    <div className="ambient-review-text">
                                        <span className="ambient-review-row-label">{d.label}</span>
                                        {d.summary && <span className="ambient-review-row-summary">{d.summary}</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {pendingActions.length > 4 && (
                            <div className="ambient-review-more">+{pendingActions.length - 4} more</div>
                        )}
                    </div>
                    <div className="ambient-review-actions">
                        <button type="button" className="ambient-btn ghost" onClick={onCancel} disabled={isExecuting}>
                            Dismiss
                        </button>
                        <button type="button" className="ambient-btn primary" onClick={onConfirm} disabled={isExecuting}>
                            {isExecuting ? 'Applying…' : 'Confirm all'}
                        </button>
                    </div>
                </div>
            )}

            {/* Captures log — hairline-divided rows, no card chrome.
                Task captures expand inline on click for quick title edits. */}
            {recentCaptures.length > 0 && (
                <div className="ambient-log">
                    <div className="ambient-log-label">Captured</div>
                    <div className="ambient-log-list">
                        {recentCaptures.map(cap => {
                            const meta = ACTION_META[cap.actionType] || { icon: ClipboardList, color: '#959595', label: cap.label };
                            const Icon = meta.icon;
                            const isEditing = editingCaptureId === cap.id;
                            const isEditable = cap.kind === 'task' && !!onUpdateCapture;
                            return (
                                <div
                                    key={cap.id}
                                    className={`ambient-log-row${isEditable ? ' editable' : ''}${isEditing ? ' editing' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="ambient-log-row-body"
                                        onClick={() => isEditable && (isEditing ? cancelEditing() : startEditing(cap))}
                                        disabled={!isEditable}
                                    >
                                        <div className="ambient-log-icon" style={{ color: meta.color, background: `${meta.color}12` }}>
                                            <Icon size={13} />
                                        </div>
                                        <div className="ambient-log-text">
                                            <span className="ambient-log-row-label">{cap.label}</span>
                                            {cap.summary && <span className="ambient-log-row-summary">{cap.summary}</span>}
                                        </div>
                                        <span className="ambient-log-time tabular">{formatClock(cap.timestamp)}</span>
                                    </button>
                                    {isEditing && (
                                        <div className="ambient-log-edit">
                                            <input
                                                type="text"
                                                className="ambient-log-edit-input"
                                                value={editDraft}
                                                onChange={(e) => setEditDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEditing(cap);
                                                    if (e.key === 'Escape') cancelEditing();
                                                }}
                                                disabled={editSaving}
                                                autoFocus
                                            />
                                            <div className="ambient-log-edit-actions">
                                                {editError && <span className="ambient-log-edit-error">{editError}</span>}
                                                <button
                                                    type="button"
                                                    className="ambient-log-edit-btn ghost"
                                                    onClick={cancelEditing}
                                                    disabled={editSaving}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ambient-log-edit-btn primary"
                                                    onClick={() => saveEditing(cap)}
                                                    disabled={editSaving || !editDraft.trim()}
                                                >
                                                    {editSaving ? 'Saving…' : 'Save'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state hint when nothing yet */}
            {recentCaptures.length === 0 && !pendingActions?.length && (
                <p className="ambient-hint">
                    Talk through your day. Tasks and actions will surface here as you mention them.
                </p>
            )}

            {/* Transcript drawer — pinned to the bottom of the body */}
            <div className={`ambient-drawer${transcriptOpen ? ' open' : ''}`}>
                <button
                    type="button"
                    className="ambient-drawer-handle"
                    onClick={() => setTranscriptOpen(v => !v)}
                    aria-expanded={transcriptOpen}
                >
                    <ChevronDown size={13} className="ambient-drawer-chevron" />
                    <span>Transcript</span>
                    <span className="ambient-drawer-count tabular">{transcript.length}</span>
                </button>

                <div className="ambient-drawer-panel">
                    <div className="ambient-drawer-inner">
                        {interimText && (
                            <div className="ambient-drawer-line interim">
                                <span className="ambient-drawer-time">now</span>
                                <span className="ambient-drawer-text">{interimText}</span>
                            </div>
                        )}
                        {[...transcript].reverse().map(line => (
                            <div className="ambient-drawer-line" key={line.id}>
                                <span className="ambient-drawer-time tabular">{formatClock(line.timestamp)}</span>
                                <span className="ambient-drawer-text">{line.text}</span>
                            </div>
                        ))}
                        {transcript.length === 0 && !interimText && (
                            <div className="ambient-drawer-empty">No speech captured yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
