import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { Harvest, HarvestBin, CreateBinDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

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
        <Modal
            title={`Create Bins from ${harvest.batchId}`}
            contentClassName="creation-modal"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="button" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Creating…' : `Create ${binCount} Bin${binCount > 1 ? 's' : ''}`}
                    </Button>
                </>
            }
        >
            <div className="modal-meta">
                <span>Strain: <strong>{harvest.strain}</strong></span>
                <span>License: <strong>{harvest.licenseNumber}</strong></span>
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="field-label" style={{ margin: 0 }}>Number of bins</label>
                <div className="qty-stepper">
                    <button
                        type="button"
                        className="qty-stepper-btn"
                        onClick={() => handleCountChange(-1)}
                        disabled={binCount <= 1}
                        aria-label="Decrease"
                    >
                        <Minus size={14} />
                    </button>
                    <span className="qty-stepper-value">{binCount}</span>
                    <button
                        type="button"
                        className="qty-stepper-btn"
                        onClick={() => handleCountChange(1)}
                        disabled={binCount >= 20}
                        aria-label="Increase"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            <div className="field">
                <label className="field-label">Bins</label>
                <div className="bin-row-list">
                    {bins.map((bin, idx) => (
                        <div key={idx} className="bin-row">
                            <span className="bin-row-label">
                                BIN-{String((harvest.bins?.length || 0) + idx + 1).padStart(3, '0')}
                            </span>
                            <input
                                type="number"
                                className="field-input bin-row-weight"
                                placeholder="Weight (g)"
                                value={bin.weight ?? ''}
                                onChange={e => updateBin(idx, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                            <select
                                className="field-input bin-row-location"
                                value={bin.location || ''}
                                onChange={e => updateBin(idx, 'location', e.target.value)}
                            >
                                <option value="">Location…</option>
                                {rooms.map(r => (
                                    <option key={r.id} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            {error && <div className="modal-error">{error}</div>}
        </Modal>
    );
};
