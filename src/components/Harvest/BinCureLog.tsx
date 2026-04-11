import React, { useState } from 'react';
import { Droplets, Wind, Eye, StickyNote, Plus } from 'lucide-react';
import type { BinCureLog as BinCureLogType, CureAction } from '../../types/definitions';
import { apiService } from '../../services/apiService';

interface BinCureLogProps {
    binId: string;
    logs: BinCureLogType[];
    onLogged: (log: BinCureLogType) => void;
}

const ACTION_CONFIG: Record<CureAction, { label: string; icon: typeof Droplets; color: string }> = {
    burp: { label: 'Burp', icon: Wind, color: '#1C9EFF' },
    aerate: { label: 'Aerate', icon: Droplets, color: '#3BB570' },
    inspect: { label: 'Inspect', icon: Eye, color: '#FA9E52' },
    note: { label: 'Note', icon: StickyNote, color: '#959595' },
};

const DEFAULT_SCHEDULE_HOURS: Record<number, number> = {
    // Days since binning → hours until next burp
    0: 12, 1: 12, 2: 12,  // First 3 days: every 12h
    3: 24, 4: 24, 5: 24, 6: 24,  // Days 4-7: every 24h
};
const DEFAULT_AFTER_WEEK = 48; // After day 7: every 48h

const getSuggestedNextHours = (daysSinceBinning: number): number => {
    return DEFAULT_SCHEDULE_HOURS[daysSinceBinning] ?? DEFAULT_AFTER_WEEK;
};

const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

export const BinCureLog: React.FC<BinCureLogProps> = ({ binId, logs, onLogged }) => {
    const [showForm, setShowForm] = useState(false);
    const [action, setAction] = useState<CureAction>('burp');
    const [notes, setNotes] = useState('');
    const [moistureReading, setMoistureReading] = useState('');
    const [saving, setSaving] = useState(false);

    const handleLog = async () => {
        setSaving(true);
        try {
            // Calculate suggested next action time
            const nextHours = getSuggestedNextHours(0); // simplified — backend can refine
            const nextActionAt = new Date(Date.now() + nextHours * 60 * 60 * 1000).toISOString();

            const log = await apiService.logBinCure(binId, {
                action,
                notes: notes || undefined,
                moistureReading: moistureReading ? parseFloat(moistureReading) : undefined,
                nextActionAt,
            });
            onLogged(log);
            setShowForm(false);
            setNotes('');
            setMoistureReading('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#959595', letterSpacing: '0.05em' }}>
                    Cure Log
                </span>
                {!showForm && (
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowForm(true)}
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                        <Plus size={12} /> Log Action
                    </button>
                )}
            </div>

            {showForm && (
                <div style={{
                    background: '#F8F8F8', border: '1px solid #E0E0E0', borderRadius: 8,
                    padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(Object.keys(ACTION_CONFIG) as CureAction[]).map(a => {
                            const cfg = ACTION_CONFIG[a];
                            const Icon = cfg.icon;
                            const selected = action === a;
                            return (
                                <button
                                    key={a}
                                    onClick={() => setAction(a)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem',
                                        border: `1px solid ${selected ? cfg.color : '#E0E0E0'}`,
                                        background: selected ? `${cfg.color}15` : 'white',
                                        color: selected ? cfg.color : '#737373',
                                        cursor: 'pointer', fontWeight: selected ? 600 : 400,
                                    }}
                                >
                                    <Icon size={12} /> {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: '0.813rem' }}
                        />
                        <input
                            type="number"
                            placeholder="Moisture %"
                            value={moistureReading}
                            onChange={e => setMoistureReading(e.target.value)}
                            style={{ width: 90, padding: '6px 10px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: '0.813rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ fontSize: '0.75rem' }}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleLog} disabled={saving} style={{ fontSize: '0.75rem' }}>
                            {saving ? 'Saving...' : 'Log'}
                        </button>
                    </div>
                </div>
            )}

            {/* Timeline */}
            {logs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {logs.slice(0, 10).map((log, i) => {
                        const cfg = ACTION_CONFIG[log.action as CureAction] || ACTION_CONFIG.note;
                        const Icon = cfg.icon;
                        return (
                            <div key={log.id} style={{
                                display: 'flex', gap: 10, padding: '6px 0',
                                borderLeft: `2px solid ${i === 0 ? cfg.color : '#E0E0E0'}`,
                                marginLeft: 8, paddingLeft: 14,
                            }}>
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                    background: `${cfg.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginLeft: -25,
                                }}>
                                    <Icon size={11} color={cfg.color} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                                        <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                                        <span style={{ color: '#959595' }}>{formatTimestamp(log.createdAt)}</span>
                                        {log.moistureReading != null && (
                                            <span style={{ color: '#737373' }}>{log.moistureReading}%</span>
                                        )}
                                    </div>
                                    {log.notes && (
                                        <div style={{ fontSize: '0.75rem', color: '#737373', marginTop: 2 }}>{log.notes}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ fontSize: '0.75rem', color: '#C0C0C0', textAlign: 'center', padding: '8px 0' }}>
                    No cure actions logged yet
                </div>
            )}
        </div>
    );
};
