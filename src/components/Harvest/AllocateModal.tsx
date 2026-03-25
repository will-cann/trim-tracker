import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Harvest } from '../../types/definitions';

interface AllocateModalProps {
    harvest: Harvest;
    onClose: () => void;
    onSubmit: (allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }>) => void;
}

export const AllocateModal: React.FC<AllocateModalProps> = ({ harvest, onClose, onSubmit }) => {
    const [mode, setMode] = useState<'flower' | 'frozen' | 'both'>('flower');
    const [flowerWeight, setFlowerWeight] = useState('');
    const [frozenWeight, setFrozenWeight] = useState('');

    const available = harvest.totalWetWeight - harvest.totalWasteWeight;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }> = [];

        if (mode === 'flower') {
            allocations.push({ type: 'flower', targetWeight: available });
        } else if (mode === 'frozen') {
            allocations.push({ type: 'frozen', targetWeight: available });
        } else {
            const fw = Number(flowerWeight);
            const fz = Number(frozenWeight);
            if (!fw || !fz || fw + fz > available) return;
            allocations.push({ type: 'flower', targetWeight: fw });
            allocations.push({ type: 'frozen', targetWeight: fz });
        }

        onSubmit(allocations);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '440px' }}>
                <div className="modal-header">
                    <h3>Allocate Harvest</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <div style={{ padding: '0 1.5rem', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        Available: <strong>{available.toFixed(0)}g</strong>
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                            (Wet {harvest.totalWetWeight.toFixed(0)}g - Waste {harvest.totalWasteWeight.toFixed(0)}g)
                        </span>
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Allocation Type</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {(['flower', 'frozen', 'both'] as const).map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem',
                                        borderRadius: '0.375rem',
                                        border: mode === m ? '2px solid #10b981' : '1px solid #d1d5db',
                                        backgroundColor: mode === m ? '#ecfdf5' : 'white',
                                        color: mode === m ? '#065f46' : '#374151',
                                        fontWeight: mode === m ? 600 : 400,
                                        fontSize: '0.875rem',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {m === 'flower' ? 'Flower' : m === 'frozen' ? 'Fresh Frozen' : 'Both'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {mode === 'flower' && (
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0 0.25rem' }}>
                            All {available.toFixed(0)}g will be allocated to flower (dry trim).
                        </p>
                    )}

                    {mode === 'frozen' && (
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0 0.25rem' }}>
                            All {available.toFixed(0)}g will be allocated to fresh frozen.
                        </p>
                    )}

                    {mode === 'both' && (
                        <>
                            <div className="form-group">
                                <label>Flower Weight (g)</label>
                                <input
                                    type="number"
                                    value={flowerWeight}
                                    onChange={e => {
                                        setFlowerWeight(e.target.value);
                                        const remaining = available - Number(e.target.value);
                                        if (remaining >= 0) setFrozenWeight(String(Math.round(remaining)));
                                    }}
                                    placeholder="0"
                                    min="1"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Fresh Frozen Weight (g)</label>
                                <input
                                    type="number"
                                    value={frozenWeight}
                                    onChange={e => {
                                        setFrozenWeight(e.target.value);
                                        const remaining = available - Number(e.target.value);
                                        if (remaining >= 0) setFlowerWeight(String(Math.round(remaining)));
                                    }}
                                    placeholder="0"
                                    min="1"
                                    required
                                />
                            </div>
                            {Number(flowerWeight) + Number(frozenWeight) > available && (
                                <p style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                                    Total exceeds available weight
                                </p>
                            )}
                        </>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Allocate</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
