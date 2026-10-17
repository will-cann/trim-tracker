import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PlantHealthEvent } from '../../types/plantMap';
import { contaminantLabel, SEVERITY_LABELS, rotScoreLabel } from '../../types/plantMap';
import { apiService } from '../../services/apiService';
import { SEVERITY_COLOR } from './plantMapColors';

interface HealthEventLogProps {
    events: PlantHealthEvent[];
    onChanged: () => void;
    onFocusPlant: (plantId: string) => void;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const HealthEventLog: React.FC<HealthEventLogProps> = ({ events, onChanged, onFocusPlant }) => {
    const [showResolved, setShowResolved] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const visible = events.filter(e => showResolved || e.status === 'active');

    const resolve = async (e: PlantHealthEvent) => {
        setBusy(e.id);
        setError(null);
        try {
            await apiService.resolvePlantHealthEvents({ eventIds: [e.id] });
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to resolve');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="room-map-panel-body">
            <label className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
                Show resolved ({events.filter(e => e.status === 'resolved').length})
            </label>
            {visible.length === 0 ? (
                <div className="room-map-empty"><p>No {showResolved ? '' : 'active '}issues logged in this room.</p></div>
            ) : (
                <ul className="room-map-events">
                    {visible.map(e => (
                        <li key={e.id} className={`room-map-event ${e.status}`}>
                            <span className="room-map-event-sev" style={{ background: SEVERITY_COLOR[e.severity] }} title={e.rotScore != null ? `Score ${e.rotScore} · ${rotScoreLabel(e.rotScore)}` : SEVERITY_LABELS[e.severity]}>{e.rotScore ?? e.severity}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-gray-800">{contaminantLabel(e.contaminant)}{e.rotScore != null ? ` · ${rotScoreLabel(e.rotScore)}` : ''}</span>
                                    {e.source === 'sheet' && <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1">sheet</span>}
                                    {e.plantId ? (
                                        <button className="room-map-plant-link" onClick={() => onFocusPlant(e.plantId!)}>{e.plantLabel}</button>
                                    ) : (
                                        <span className="text-xs text-gray-500">{e.plantLabel}</span>
                                    )}
                                    {e.row != null && e.col != null && <span className="text-[11px] text-gray-400">R{e.row + 1}·{e.col + 1}</span>}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                    {fmt(e.observedAt)}{e.floweringDay != null ? ` · flower day ${e.floweringDay}` : ''}{e.status === 'resolved' && e.resolvedAt ? ` · resolved ${fmt(e.resolvedAt)}` : ''}
                                </div>
                                {e.note && <div className="text-[11px] text-gray-600 mt-0.5">{e.note}</div>}
                            </div>
                            {e.status === 'active' && (
                                <button className="room-map-icon-btn" title="Mark resolved" onClick={() => resolve(e)} disabled={busy === e.id}>
                                    <CheckCircle2 size={14} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
    );
};
