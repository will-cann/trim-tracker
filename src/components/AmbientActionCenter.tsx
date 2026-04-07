import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Square, Play, X, ChevronDown, ClipboardList, Scissors, Sprout, Leaf,
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
    // session state
    elapsedMs: number;
    isPaused: boolean;
    interimText: string;
    hasVoiceSignal: boolean;
    // captures
    captures: AmbientCapture[];
    // pending review (actions that need confirmation)
    pendingActions: ProposedAction[] | null;
    isExecuting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    // transcript
    transcript: TranscriptLine[];
    // controls
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
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

function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatClock(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const AmbientActionCenter: React.FC<AmbientActionCenterProps> = ({
    elapsedMs,
    isPaused,
    interimText,
    hasVoiceSignal,
    captures,
    pendingActions,
    isExecuting,
    onConfirm,
    onCancel,
    transcript,
    onPause,
    onResume,
    onEnd,
    micError,
}) => {
    const [transcriptOpen, setTranscriptOpen] = useState(false);
    const [pulse, setPulse] = useState(0);
    const lastCaptureIdRef = useRef<string | null>(null);

    // Pulse the orb label when a new capture arrives
    useEffect(() => {
        const last = captures[captures.length - 1];
        if (last && last.id !== lastCaptureIdRef.current) {
            lastCaptureIdRef.current = last.id;
            setPulse(p => p + 1);
        }
    }, [captures]);

    const lastCapture = captures[captures.length - 1];
    const sinceLast = lastCapture ? Date.now() - lastCapture.timestamp : Infinity;
    const tagline = useMemo(() => {
        if (micError) return micError;
        if (isPaused) {
            return captures.length > 0
                ? 'Stopped — review captures or resume listening'
                : 'Stopped — press resume to continue';
        }
        if (lastCapture && sinceLast < 6000) return `Heard "${lastCapture.label.toLowerCase()}"`;
        if (interimText) return 'Hearing you…';
        return 'Listening for tasks';
    }, [micError, lastCapture, sinceLast, interimText, isPaused, captures.length]);

    const taskCount = captures.filter(c => c.kind === 'task').length;
    const actionCount = captures.filter(c => c.kind === 'action').length;

    // Most recent 6 for visible strip (newest first)
    const recentCaptures = useMemo(() => [...captures].reverse().slice(0, 6), [captures]);

    return (
        <div className="ambient-center">
            {/* Ambient background wash */}
            <div className="ambient-wash" aria-hidden />

            {/* Top status bar */}
            <div className="ambient-top">
                <div className="ambient-status">
                    <span className={`ambient-dot${hasVoiceSignal ? ' hot' : ''}${isPaused ? ' paused' : ''}`} />
                    <span className="ambient-status-label">
                        {isPaused ? 'Session paused' : 'Ambient listening'}
                    </span>
                    <span className="ambient-sep">·</span>
                    <span className="ambient-timer tabular">{formatElapsed(elapsedMs)}</span>
                </div>
                <div className="ambient-top-controls">
                    {isPaused && (
                        <button type="button" className="ambient-end-link" onClick={onEnd}>
                            <X size={12} />
                            End session
                        </button>
                    )}
                    {isPaused ? (
                        <button type="button" className="ambient-resume-pill" onClick={onResume}>
                            <Play size={11} fill="currentColor" />
                            Resume
                        </button>
                    ) : (
                        <button type="button" className="ambient-stop-pill" onClick={onPause}>
                            <Square size={11} fill="currentColor" />
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Orb + headline */}
            <div className="ambient-stage">
                <div className={`ambient-orb${hasVoiceSignal ? ' active' : ''}${isPaused ? ' paused' : ''}`} aria-hidden>
                    <div className="ambient-orb-ring r1" />
                    <div className="ambient-orb-ring r2" />
                    <div className="ambient-orb-ring r3" />
                    <div className="ambient-orb-core" />
                </div>

                <div className="ambient-headline">
                    <h1 className="ambient-title">Action Center</h1>
                    <p key={pulse} className={`ambient-tagline${micError ? ' error' : ''}`}>{tagline}</p>
                </div>

                {/* Tally */}
                <div className="ambient-tally">
                    <div className="ambient-tally-cell">
                        <span className="ambient-tally-num tabular">{actionCount}</span>
                        <span className="ambient-tally-label">Actions</span>
                    </div>
                    <div className="ambient-tally-divider" />
                    <div className="ambient-tally-cell">
                        <span className="ambient-tally-num tabular">{taskCount}</span>
                        <span className="ambient-tally-label">Tasks</span>
                    </div>
                    <div className="ambient-tally-divider" />
                    <div className="ambient-tally-cell">
                        <span className="ambient-tally-num tabular">{pendingActions?.length || 0}</span>
                        <span className="ambient-tally-label">Review</span>
                    </div>
                </div>
            </div>

            {/* Pending review card */}
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

            {/* Recent captures strip */}
            {recentCaptures.length > 0 && (
                <div className="ambient-captures">
                    <div className="ambient-captures-label">Captured</div>
                    <div className="ambient-captures-list">
                        {recentCaptures.map(cap => {
                            const meta = ACTION_META[cap.actionType] || { icon: ClipboardList, color: '#959595', label: cap.label };
                            const Icon = meta.icon;
                            return (
                                <div className="ambient-capture" key={cap.id}>
                                    <div className="ambient-capture-icon" style={{ color: meta.color, background: `${meta.color}12` }}>
                                        <Icon size={13} />
                                    </div>
                                    <div className="ambient-capture-text">
                                        <span className="ambient-capture-label">{cap.label}</span>
                                        {cap.summary && <span className="ambient-capture-summary">{cap.summary}</span>}
                                    </div>
                                    <span className="ambient-capture-time tabular">{formatClock(cap.timestamp)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state hint when nothing yet */}
            {recentCaptures.length === 0 && !pendingActions?.length && (
                <div className="ambient-hint">
                    Talk through your day. Tasks and actions will surface here as you mention them.
                </div>
            )}

            {/* Transcript drawer — out of view by default, tucked under a low-profile handle */}
            <div className={`ambient-drawer${transcriptOpen ? ' open' : ''}`}>
                <button
                    type="button"
                    className="ambient-drawer-handle"
                    onClick={() => setTranscriptOpen(v => !v)}
                    aria-expanded={transcriptOpen}
                >
                    <ChevronDown size={14} className="ambient-drawer-chevron" />
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
