import React, { useState } from 'react';
import type { Harvest } from '../../types/definitions';
import { Modal, Button } from '../ui';

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
        <Modal title="Allocate Harvest" contentClassName="max-w-md" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="allocate-form">Allocate</Button>
            </>
        }>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Available: <strong style={{ color: 'var(--text-color)' }}>{available.toFixed(0)}g</strong>
                <span className="ml-2 text-xs">
                    (Wet {harvest.totalWetWeight.toFixed(0)}g - Waste {harvest.totalWasteWeight.toFixed(0)}g)
                </span>
            </p>
            <form id="allocate-form" onSubmit={handleSubmit}>
                <div className="field">
                    <label className="field-label">Allocation Type</label>
                    <div className="chip-group">
                        {(['flower', 'frozen', 'both'] as const).map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`chip ${mode === m ? 'chip-active' : ''}`}
                            >
                                {m === 'flower' ? 'Flower' : m === 'frozen' ? 'Fresh Frozen' : 'Both'}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === 'flower' && (
                    <p className="text-sm px-1" style={{ color: 'var(--text-secondary)' }}>
                        All {available.toFixed(0)}g will be allocated to flower (dry trim).
                    </p>
                )}

                {mode === 'frozen' && (
                    <p className="text-sm px-1" style={{ color: 'var(--text-secondary)' }}>
                        All {available.toFixed(0)}g will be allocated to fresh frozen.
                    </p>
                )}

                {mode === 'both' && (
                    <>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Flower Weight (g)</label>
                                <input
                                    type="number"
                                    className="field-input"
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
                            <div className="field">
                                <label className="field-label">Fresh Frozen Weight (g)</label>
                                <input
                                    type="number"
                                    className="field-input"
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
                        </div>
                        {Number(flowerWeight) + Number(frozenWeight) > available && (
                            <p className="text-xs" style={{ color: 'var(--danger-color)' }}>
                                Total exceeds available weight
                            </p>
                        )}
                    </>
                )}
            </form>
        </Modal>
    );
};
