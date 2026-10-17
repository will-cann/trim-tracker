import React, { useState } from 'react';
import { ArrowRight, Check, ClipboardList, Flame, ShieldAlert, Scissors, Eye, MoveRight } from 'lucide-react';
import type { MovePlan, MoveSuggestion, SuggestionKind, HotspotSummary } from '../../types/plantMap';
import { apiService } from '../../services/apiService';
import type { HumanTaskPriority, HumanTaskCategory, ProposedActionType } from '../../types/definitions';

interface MovePlannerPanelProps {
    roomName: string;
    plan: MovePlan;
    hotspots: HotspotSummary | null;
    onApplied: () => void;
    onFocusPlant: (plantId: string) => void;
}

const KIND_META: Record<SuggestionKind, { label: string; icon: React.FC<{ size?: number; className?: string }>; color: string }> = {
    cull:     { label: 'Remove',   icon: Scissors,   color: '#C53030' },
    isolate:  { label: 'Isolate',  icon: ShieldAlert, color: '#E0604A' },
    relocate: { label: 'Relocate', icon: MoveRight,  color: '#C05621' },
    inspect:  { label: 'Inspect',  icon: Eye,        color: '#B7791F' },
};

const cellLabel = (c: { row: number; col: number } | null) => c ? `R${c.row + 1}·${c.col + 1}` : '—';

export interface PlannerTaskInput {
    title: string;
    description: string;
    priority: HumanTaskPriority;
    category: HumanTaskCategory;
    location: string;
    onCompleteAction?: { type: ProposedActionType; data: Record<string, unknown> };
}

export function suggestionToTask(s: MoveSuggestion, roomName: string): PlannerTaskInput {
    const priority: HumanTaskPriority = s.priority;
    const base = {
        priority,
        location: s.from?.roomName ?? roomName,
        description: s.reason,
    };
    switch (s.kind) {
        case 'cull':
            return {
                ...base,
                title: `Remove ${s.plantLabel} (${s.strainName}) — bud rot`,
                category: 'ipm' as const,
                onCompleteAction: { type: 'destroy_plants' as const, data: { plantIds: [s.plantId], entityType: 'plants' } },
            };
        case 'isolate':
        case 'relocate': {
            const to = s.to;
            return {
                ...base,
                title: to
                    ? `Move ${s.plantLabel} from ${cellLabel(s.from)} to ${to.roomName !== (s.from?.roomName ?? roomName) ? `${to.roomName} ` : ''}${cellLabel(to)}`
                    : `Treat ${s.plantLabel} in place (no free cell)`,
                category: 'cultivation' as const,
                onCompleteAction: to
                    ? { type: 'place_plants' as const, data: { roomId: to.roomId, roomName: to.roomName, placements: [{ plantId: s.plantId, row: to.row, col: to.col }] } }
                    : undefined,
            };
        }
        case 'inspect':
        default:
            return {
                ...base,
                title: `Inspect ${s.plantLabel} (${s.strainName}) for bud rot daily`,
                category: 'ipm' as const,
            };
    }
}

export const MovePlannerPanel: React.FC<MovePlannerPanelProps> = ({ roomName, plan, hotspots, onApplied, onFocusPlant }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [done, setDone] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const apply = async (s: MoveSuggestion) => {
        if (!s.to) return;
        setBusy(s.plantId);
        setError(null);
        try {
            await apiService.setPlantPositions({ roomId: s.to.roomId, placements: [{ plantId: s.plantId, row: s.to.row, col: s.to.col }] });
            onApplied();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to move plant');
        } finally {
            setBusy(null);
        }
    };

    const createTask = async (s: MoveSuggestion) => {
        setBusy(s.plantId);
        setError(null);
        try {
            await apiService.createTask(suggestionToTask(s, roomName) as never);
            setDone(prev => new Set(prev).add(`${s.kind}:${s.plantId}`));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create task');
        } finally {
            setBusy(null);
        }
    };

    const createAll = async () => {
        setBusy('all');
        setError(null);
        try {
            const pending = plan.suggestions.filter(s => !done.has(`${s.kind}:${s.plantId}`));
            if (pending.length) {
                await apiService.createTasks(pending.map(s => suggestionToTask(s, roomName)) as never);
                setDone(prev => {
                    const next = new Set(prev);
                    pending.forEach(s => next.add(`${s.kind}:${s.plantId}`));
                    return next;
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create tasks');
        } finally {
            setBusy(null);
        }
    };

    const { summary } = plan;
    const strainRows = (hotspots?.strains ?? []).filter(s => s.events > 0 || s.activeEvents > 0).slice(0, 6);

    return (
        <div className="room-map-panel-body">
            <div className="room-map-stats">
                <Stat label="Spreading now" value={summary.plantsWithActiveSpread} tone={summary.plantsWithActiveSpread ? 'bad' : 'ok'} />
                <Stat label="Plants at risk" value={summary.plantsAtRisk} tone={summary.plantsAtRisk ? 'warn' : 'ok'} />
                <Stat label="Dry cells free" value={summary.emptySafeCells} />
                <Stat label="Hot cells empty" value={summary.emptyHotCells} tone={summary.emptyHotCells ? 'warn' : undefined} />
            </div>

            {plan.suggestions.length === 0 ? (
                <div className="room-map-empty">
                    <Check size={16} className="text-emerald-500" />
                    <p>Nothing to move. No active spread and nobody is sitting on a hot cell.</p>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-wider text-gray-400">{plan.suggestions.length} suggestion{plan.suggestions.length === 1 ? '' : 's'}</span>
                        <button className="room-map-link-btn" onClick={createAll} disabled={busy === 'all'}>
                            <ClipboardList size={12} /> Create all as tasks
                        </button>
                    </div>
                    <ul className="room-map-suggestions">
                        {plan.suggestions.map(s => {
                            const meta = KIND_META[s.kind];
                            const Icon = meta.icon;
                            const key = `${s.kind}:${s.plantId}`;
                            const tasked = done.has(key);
                            return (
                                <li key={key} className={`room-map-suggestion priority-${s.priority}`}>
                                    <div className="flex items-start gap-2">
                                        <span className="room-map-kind" style={{ color: meta.color, borderColor: meta.color }}>
                                            <Icon size={11} /> {meta.label}
                                        </span>
                                        <button className="room-map-plant-link" onClick={() => onFocusPlant(s.plantId)}>
                                            {s.plantLabel}
                                        </button>
                                        <span className="text-[11px] text-gray-400 truncate">{s.strainName}</span>
                                        <span className={`room-map-priority ${s.priority}`}>{s.priority}</span>
                                    </div>
                                    {(s.from || s.to) && (
                                        <div className="room-map-route">
                                            <span>{s.from ? cellLabel(s.from) : '—'}</span>
                                            {s.to && (
                                                <>
                                                    <ArrowRight size={11} />
                                                    <span>{s.to.roomId !== (s.from?.roomId ?? plan.roomId) ? `${s.to.roomName} ` : ''}{cellLabel(s.to)}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <p className="room-map-reason">{s.reason}</p>
                                    <div className="room-map-suggestion-actions">
                                        {s.to && (
                                            <button className="btn-primary text-xs px-2 py-1" onClick={() => apply(s)} disabled={busy === s.plantId}>
                                                {busy === s.plantId ? 'Moving…' : 'Apply move'}
                                            </button>
                                        )}
                                        <button className="btn-secondary text-xs px-2 py-1" onClick={() => createTask(s)} disabled={busy === s.plantId || tasked}>
                                            {tasked ? <><Check size={11} /> Task created</> : 'Create task'}
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            {plan.avoidCells.length > 0 && (
                <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1"><Flame size={11} /> Leave empty at next flip</p>
                    <div className="flex flex-wrap gap-1">
                        {plan.avoidCells.map(c => (
                            <span key={`${c.row}:${c.col}`} className="room-map-cell-chip">{cellLabel(c)} <span className="text-gray-400">{Math.round(c.score * 100)}%</span></span>
                        ))}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            {strainRows.length > 0 && (
                <div className="mt-5">
                    <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">
                        Strain incidence{hotspots?.windowDays ? ` · last ${hotspots.windowDays} days` : ''}
                    </p>
                    <table className="room-map-mini-table">
                        <thead><tr><th>Strain</th><th>Plants hit</th><th>Flowered</th><th>Rate</th></tr></thead>
                        <tbody>
                            {strainRows.map(s => (
                                <tr key={s.strainName}>
                                    <td>{s.strainName}</td>
                                    <td>{s.plantsAffected}{s.activeEvents ? <span className="text-red-500"> ({s.activeEvents} active)</span> : null}</td>
                                    <td>{s.plantsFlowered || '—'}</td>
                                    <td>{s.incidence == null ? '—' : `${Math.round(s.incidence * 100)}%`}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-[11px] text-gray-400 mt-1">A strain that keeps rotting across rooms needs a shorter flower or a drier bench, not another move.</p>
                </div>
            )}
        </div>
    );
};

const Stat: React.FC<{ label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }> = ({ label, value, tone }) => (
    <div className={`room-map-stat ${tone ?? ''}`}>
        <span className="room-map-stat-value">{value}</span>
        <span className="room-map-stat-label">{label}</span>
    </div>
);
