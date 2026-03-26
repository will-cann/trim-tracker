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
            <div className="modal-content max-w-md">
                <div className="modal-header">
                    <h3>Allocate Harvest</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <div className="px-6 mb-3">
                    <p className="text-sm text-gray-500">
                        Available: <strong>{available.toFixed(0)}g</strong>
                        <span className="ml-2 text-xs">
                            (Wet {harvest.totalWetWeight.toFixed(0)}g - Waste {harvest.totalWasteWeight.toFixed(0)}g)
                        </span>
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Allocation Type</label>
                        <div className="flex gap-2">
                            {(['flower', 'frozen', 'both'] as const).map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    className={`flex-1 py-2 rounded-md text-sm capitalize cursor-pointer transition-colors ${
                                        mode === m
                                            ? 'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                                            : 'border border-gray-300 bg-white text-gray-700'
                                    }`}
                                >
                                    {m === 'flower' ? 'Flower' : m === 'frozen' ? 'Fresh Frozen' : 'Both'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {mode === 'flower' && (
                        <p className="text-sm text-gray-500 px-1">
                            All {available.toFixed(0)}g will be allocated to flower (dry trim).
                        </p>
                    )}

                    {mode === 'frozen' && (
                        <p className="text-sm text-gray-500 px-1">
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
                                <p className="text-red-500 text-xs">
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
