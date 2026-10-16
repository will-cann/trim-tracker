import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui';
import { apiService } from '../../services/apiService';
import { CONTAMINANT_MAP, SEVERITY_LABELS } from '../../types/plantMap';
import { SEVERITY_COLOR } from './plantMapColors';

interface LogHealthEventModalProps {
    plants: Array<{ id: string; label: string; strainName: string }>;
    defaultContaminant?: string;
    onClose: () => void;
    onLogged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export const LogHealthEventModal: React.FC<LogHealthEventModalProps> = ({ plants, defaultContaminant = 'botrytis', onClose, onLogged }) => {
    const [contaminant, setContaminant] = useState(defaultContaminant);
    const [severity, setSeverity] = useState(3);
    const [note, setNote] = useState('');
    const [observedAt, setObservedAt] = useState(today());
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await apiService.logPlantHealthEvent({
                plantIds: plants.map(p => p.id),
                contaminant,
                severity,
                note: note.trim() || undefined,
                observedAt: observedAt ? `${observedAt}T12:00:00` : undefined,
            });
            onLogged();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to log issue');
            setSubmitting(false);
        }
    };

    const groups = Object.entries(CONTAMINANT_MAP).reduce<Record<string, Array<[string, string]>>>((acc, [key, info]) => {
        (acc[info.category] ??= []).push([key, info.label]);
        return acc;
    }, {});
    const groupLabel: Record<string, string> = { fungus: 'Fungi', pest: 'Pests', virus: 'Viruses', general: 'General' };

    return (
        <Modal
            title="Log plant health issue"
            titleIcon={<AlertTriangle size={16} className="text-amber-500" />}
            contentClassName="creation-modal"
            size="sm"
            onClose={onClose}
            footer={
                <>
                    <button onClick={onClose} className="btn-cancel" disabled={submitting}>Cancel</button>
                    <button onClick={submit} className="btn-primary" disabled={submitting || plants.length === 0}>
                        {submitting ? 'Saving…' : `Log on ${plants.length} plant${plants.length === 1 ? '' : 's'}`}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Plants</p>
                    <div className="flex flex-wrap gap-1">
                        {plants.map(p => (
                            <span key={p.id} className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700 rounded-full">
                                {p.label} <span className="text-gray-400">· {p.strainName}</span>
                            </span>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="field-label">Issue</label>
                    <select value={contaminant} onChange={e => setContaminant(e.target.value)} className="field-input w-full">
                        {['fungus', 'pest', 'virus', 'general'].map(cat => (
                            <optgroup key={cat} label={groupLabel[cat]}>
                                {(groups[cat] ?? []).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="field-label">Severity</label>
                    <div className="room-map-severity">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type="button"
                                className={`room-map-severity-btn ${severity === n ? 'active' : ''}`}
                                style={severity === n ? { background: SEVERITY_COLOR[n], borderColor: SEVERITY_COLOR[n] } : undefined}
                                onClick={() => setSeverity(n)}
                                title={SEVERITY_LABELS[n]}
                            >
                                {n}
                            </button>
                        ))}
                        <span className="text-xs text-gray-500 ml-2">{SEVERITY_LABELS[severity]}</span>
                    </div>
                    {contaminant === 'botrytis' && severity >= 4 && (
                        <p className="text-[11px] text-red-600 mt-1">Severity 4+ bud rot: the planner will recommend removing the plant rather than moving it.</p>
                    )}
                </div>

                <div>
                    <label className="field-label">Observed on</label>
                    <input type="date" value={observedAt} max={today()} onChange={e => setObservedAt(e.target.value)} className="field-input w-full" />
                </div>

                <div>
                    <label className="field-label">Notes</label>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={2}
                        placeholder="e.g. Grey mold inside the top cola, bench edge near the dehumidifier"
                        className="field-input w-full"
                    />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
        </Modal>
    );
};
