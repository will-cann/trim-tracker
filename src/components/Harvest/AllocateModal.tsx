import React, { useState } from 'react';
import type { Harvest } from '../../types/definitions';
import { Modal, Button } from '../ui';

interface AllocateModalProps {
    harvest: Harvest;
    onClose: () => void;
    onSubmit: (allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }>) => void;
}

// ── Default yield estimates (until historical data is available) ─────────────
const DEFAULT_WET_PER_PLANT_G = 1000;  // avg wet weight per plant
const DEFAULT_MOISTURE_LOSS_PCT = 85;  // wet → dry
const DEFAULT_DRY_BREAKDOWN = {
    flower: 0.70,
    shake: 0.15,
    trim: 0.10,
    waste: 0.05,
};

const formatWeight = (g: number) => {
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${Math.round(g).toLocaleString()} g`;
};

export const AllocateModal: React.FC<AllocateModalProps> = ({ harvest, onClose, onSubmit }) => {
    const [mode, setMode] = useState<'flower' | 'frozen' | 'both'>('flower');
    const [frozenWeight, setFrozenWeight] = useState('');

    const hasWetWeight = harvest.totalWetWeight > 0;
    const moisturePct = harvest.moistureLossPct || DEFAULT_MOISTURE_LOSS_PCT;

    // Actual or estimated wet weight
    const wetWeight = hasWetWeight
        ? harvest.totalWetWeight - harvest.totalWasteWeight
        : (harvest.plantCount || 0) * DEFAULT_WET_PER_PLANT_G;

    // Compute projections for each mode
    const computeProjections = (frozenAmount: number) => {
        const flowerWet = wetWeight - frozenAmount;
        const dryWeight = flowerWet * (1 - moisturePct / 100);

        return {
            frozenAmount,
            flowerWet,
            dryWeight,
            flower: dryWeight * DEFAULT_DRY_BREAKDOWN.flower,
            shake: dryWeight * DEFAULT_DRY_BREAKDOWN.shake,
            trim: dryWeight * DEFAULT_DRY_BREAKDOWN.trim,
            waste: dryWeight * DEFAULT_DRY_BREAKDOWN.waste,
        };
    };

    const projections = mode === 'frozen'
        ? computeProjections(wetWeight)
        : mode === 'flower'
            ? computeProjections(0)
            : computeProjections(Number(frozenWeight) || 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }> = [];

        if (mode === 'flower') {
            allocations.push({ type: 'flower', targetWeight: wetWeight });
        } else if (mode === 'frozen') {
            allocations.push({ type: 'frozen', targetWeight: wetWeight });
        } else {
            const fz = Number(frozenWeight);
            if (!fz || fz > wetWeight) return;
            allocations.push({ type: 'flower', targetWeight: wetWeight - fz });
            allocations.push({ type: 'frozen', targetWeight: fz });
        }

        onSubmit(allocations);
    };

    const canSubmit = mode !== 'both' || (Number(frozenWeight) > 0 && Number(frozenWeight) <= wetWeight);

    return (
        <Modal title="Allocate Harvest" contentClassName="max-w-md" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="allocate-form" disabled={!canSubmit}>Allocate</Button>
            </>
        }>
            {/* Weight summary */}
            <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                marginBottom: 16, fontSize: '0.875rem',
            }}>
                {hasWetWeight ? (
                    <>
                        <span style={{ color: 'var(--text-secondary)' }}>Available:</span>
                        <strong>{formatWeight(wetWeight)}</strong>
                        <span className="text-xs" style={{ color: 'var(--color-dolphin)' }}>
                            (Wet {formatWeight(harvest.totalWetWeight)} - Waste {formatWeight(harvest.totalWasteWeight)})
                        </span>
                    </>
                ) : (
                    <>
                        <span style={{ color: 'var(--text-secondary)' }}>Est. wet weight:</span>
                        <strong style={{ color: '#FA9E52' }}>{formatWeight(wetWeight)}</strong>
                        <span className="text-xs" style={{ color: 'var(--color-dolphin)' }}>
                            ({harvest.plantCount} plants x ~{formatWeight(DEFAULT_WET_PER_PLANT_G)}/plant)
                        </span>
                    </>
                )}
            </div>

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

                {/* Both mode: user sets fresh frozen amount */}
                {mode === 'both' && (
                    <div className="field" style={{ marginBottom: 12 }}>
                        <label className="field-label">Fresh frozen needed (g)</label>
                        <input
                            type="number"
                            className="field-input"
                            value={frozenWeight}
                            onChange={e => setFrozenWeight(e.target.value)}
                            placeholder="0"
                            min="1"
                            max={Math.round(wetWeight)}
                            required
                        />
                        {Number(frozenWeight) > wetWeight && (
                            <p className="text-xs mt-1" style={{ color: 'var(--danger-color)' }}>
                                Exceeds available weight
                            </p>
                        )}
                    </div>
                )}

                {/* Projections */}
                <div style={{
                    background: '#F8F8F8', border: '1px solid #E0E0E0', borderRadius: 8,
                    padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <div style={{ fontSize: '0.688rem', fontWeight: 600, textTransform: 'uppercase', color: '#959595', letterSpacing: '0.05em' }}>
                        {hasWetWeight ? 'Estimated yield' : 'Projected yield'}
                    </div>

                    {/* Frozen output */}
                    {(mode === 'frozen' || mode === 'both') && projections.frozenAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.813rem' }}>
                            <span style={{ color: '#1B5EB5', fontWeight: 500 }}>Fresh Frozen</span>
                            <strong>{formatWeight(projections.frozenAmount)}</strong>
                        </div>
                    )}

                    {/* Flower path output */}
                    {(mode === 'flower' || mode === 'both') && projections.flowerWet > 0 && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.813rem' }}>
                                <span style={{ color: '#959595' }}>Dry weight ({100 - moisturePct}% of {formatWeight(projections.flowerWet)})</span>
                                <span style={{ fontWeight: 500 }}>{formatWeight(projections.dryWeight)}</span>
                            </div>
                            <div style={{ borderTop: '1px solid #E0E0E0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                                    <span style={{ color: '#3BB570', fontWeight: 500 }}>Flower</span>
                                    <strong>{formatWeight(projections.flower)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                                    <span style={{ color: '#1C9EFF', fontWeight: 500 }}>Shake</span>
                                    <span>{formatWeight(projections.shake)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                                    <span style={{ color: '#FA9E52', fontWeight: 500 }}>Trim</span>
                                    <span>{formatWeight(projections.trim)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                                    <span style={{ color: '#DF5B59', fontWeight: 500 }}>Waste</span>
                                    <span>{formatWeight(projections.waste)}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {!hasWetWeight && (
                        <p className="text-xs" style={{ color: '#C0C0C0', fontStyle: 'italic', marginTop: 4 }}>
                            Based on default estimates. Actuals will be recorded on harvest day.
                        </p>
                    )}
                </div>
            </form>
        </Modal>
    );
};
