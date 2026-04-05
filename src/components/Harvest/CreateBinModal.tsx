import React, { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import type { Harvest, HarvestBin, CreateBinDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';

interface CreateBinModalProps {
    harvest: Harvest;
    rooms: { id: string; name: string }[];
    onCreated: (bins: HarvestBin[]) => void;
    onClose: () => void;
}

export const CreateBinModal: React.FC<CreateBinModalProps> = ({ harvest, rooms, onCreated, onClose }) => {
    const [binCount, setBinCount] = useState(1);
    const [bins, setBins] = useState<CreateBinDTO[]>([{ weight: undefined, location: '' }]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleCountChange = (delta: number) => {
        const next = Math.max(1, Math.min(20, binCount + delta));
        setBinCount(next);
        setBins(prev => {
            if (next > prev.length) {
                return [...prev, ...Array(next - prev.length).fill(null).map(() => ({ weight: undefined, location: '' } as CreateBinDTO))];
            }
            return prev.slice(0, next);
        });
    };

    const updateBin = (idx: number, field: keyof CreateBinDTO, value: any) => {
        setBins(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
    };

    const handleSubmit = async () => {
        setSaving(true);
        setError('');
        try {
            const result = await apiService.createBins(harvest.id, bins);
            onCreated(result.bins);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to create bins');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Create Bins from {harvest.batchId}</h3>
                    <button className="icon-button" onClick={onClose}><X size={18} /></button>
                </div>

                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Info */}
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.813rem', color: '#6B7280' }}>
                        <span>Strain: <strong style={{ color: '#1A1A1A' }}>{harvest.strain}</strong></span>
                        <span>License: <strong style={{ color: '#1A1A1A' }}>{harvest.licenseNumber}</strong></span>
                    </div>

                    {/* Bin count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: '0.813rem', fontWeight: 500, color: '#374151' }}>Number of bins:</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                                className="icon-button"
                                onClick={() => handleCountChange(-1)}
                                disabled={binCount <= 1}
                                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB' }}
                            >
                                <Minus size={14} />
                            </button>
                            <span style={{ width: 32, textAlign: 'center', fontWeight: 600 }}>{binCount}</span>
                            <button
                                className="icon-button"
                                onClick={() => handleCountChange(1)}
                                disabled={binCount >= 20}
                                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB' }}
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Per-bin fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                        {bins.map((bin, idx) => (
                            <div key={idx} style={{
                                display: 'flex', gap: 8, alignItems: 'center',
                                padding: '8px 12px', background: '#F9FAFB', borderRadius: 8,
                                border: '1px solid #F1F1F1',
                            }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#959595', width: 52, flexShrink: 0 }}>
                                    BIN-{String((harvest.bins?.length || 0) + idx + 1).padStart(3, '0')}
                                </span>
                                <input
                                    type="number"
                                    placeholder="Weight (g)"
                                    value={bin.weight ?? ''}
                                    onChange={e => updateBin(idx, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                                    style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: '0.813rem' }}
                                />
                                <select
                                    value={bin.location || ''}
                                    onChange={e => updateBin(idx, 'location', e.target.value)}
                                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: '0.813rem' }}
                                >
                                    <option value="">Location...</option>
                                    {rooms.map(r => (
                                        <option key={r.id} value={r.name}>{r.name}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div style={{ color: '#DF5B59', fontSize: '0.813rem' }}>{error}</div>
                    )}
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 8,
                    padding: '12px 20px', borderTop: '1px solid #F1F1F1',
                }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Creating...' : `Create ${binCount} Bin${binCount > 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
