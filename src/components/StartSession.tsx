import React, { useState, useEffect } from 'react';
import { Loader2, Package, PenLine } from 'lucide-react';
import type { CreateTrimSessionDTO, Strain, License, Harvest } from '../types/definitions';
import { apiService } from '../services/apiService';

interface StartSessionProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
}

export const StartSession: React.FC<StartSessionProps> = ({ onStart }) => {
    const [mode, setMode] = useState<'harvest' | 'manual'>('harvest');

    // Harvest picker state
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [selectedHarvestId, setSelectedHarvestId] = useState('');

    // Manual entry state
    const [harvestName, setHarvestName] = useState('');
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [startWeight, setStartWeight] = useState('');

    const [strains, setStrains] = useState<Strain[]>([]);
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            apiService.getHarvests().then(setHarvests),
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
        ]).finally(() => setLoading(false));
    }, []);

    // Harvests that have flower allocations ready for trim
    const trimmableHarvests = harvests.filter(h => {
        const hasFlowerAllocation = h.allocations?.some(
            a => a.allocationType === 'flower' && a.status !== 'completed'
        );
        // Show harvests that are active/drying/ready and have a flower allocation,
        // or any harvest not yet completed (user may want to start trim early)
        return h.status !== 'completed' && (hasFlowerAllocation || !h.allocations?.length);
    });

    const selectedHarvest = harvests.find(h => h.id === selectedHarvestId);

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);

    const isValidHarvest = !!selectedHarvestId;
    const isValidManual = harvestName && strainId && licenseId && startWeight;
    const isValid = mode === 'harvest' ? isValidHarvest : isValidManual;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (mode === 'harvest' && selectedHarvest) {
            const flowerAlloc = selectedHarvest.allocations?.find(
                a => a.allocationType === 'flower' && a.status !== 'completed'
            );
            onStart({
                harvestName: selectedHarvest.batchId,
                strain: selectedHarvest.strain,
                licenseNumber: selectedHarvest.licenseNumber,
                startWeight: flowerAlloc?.targetWeight ?? selectedHarvest.totalWetWeight,
                status: 'active',
                harvestId: selectedHarvest.id,
            });
        } else if (mode === 'manual' && selectedStrain && selectedLicense) {
            onStart({
                harvestName,
                strain: selectedStrain.name,
                licenseNumber: selectedLicense.licenseNumber,
                startWeight: Number(startWeight),
                status: 'active',
            });
        }
    };

    if (loading) {
        return (
            <div className="field-loading">
                <Loader2 size={16} className="animate-spin" /> Loading...
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Mode toggle */}
            <div className="chip-group" style={{ justifyContent: 'center' }}>
                <button
                    type="button"
                    onClick={() => setMode('harvest')}
                    className={`ai-license-pill ${mode === 'harvest' ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <Package size={14} />
                    From Harvest
                </button>
                <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className={`ai-license-pill ${mode === 'manual' ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <PenLine size={14} />
                    Manual Entry
                </button>
            </div>

            {mode === 'harvest' ? (
                /* ── Harvest Picker ── */
                <div className="field">
                    <label className="field-label">Select Harvest Batch</label>
                    {trimmableHarvests.length === 0 ? (
                        <div className="field-hint" style={{ textAlign: 'center', padding: '16px 0' }}>
                            No harvests available for trim.
                            <br />
                            <button
                                type="button"
                                onClick={() => setMode('manual')}
                                style={{
                                    color: 'var(--color-chameleon)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    marginTop: '4px',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Enter batch manually
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {trimmableHarvests.map(h => {
                                const flowerAlloc = h.allocations?.find(
                                    a => a.allocationType === 'flower' && a.status !== 'completed'
                                );
                                const weight = flowerAlloc?.targetWeight ?? h.totalWetWeight;
                                const isSelected = selectedHarvestId === h.id;
                                return (
                                    <button
                                        key={h.id}
                                        type="button"
                                        onClick={() => setSelectedHarvestId(isSelected ? '' : h.id)}
                                        className="harvest-pick-card"
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            border: isSelected
                                                ? '2px solid var(--color-chameleon)'
                                                : '1.5px solid var(--color-elephant-200)',
                                            background: isSelected
                                                ? 'var(--color-chameleon-50, rgba(76,175,80,0.06))'
                                                : 'var(--color-elephant-50)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            width: '100%',
                                            fontFamily: 'inherit',
                                            transition: 'border-color 0.15s, background 0.15s',
                                        }}
                                    >
                                        <div>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '14px',
                                                color: 'var(--color-elephant-800)',
                                            }}>
                                                {h.batchId}
                                            </div>
                                            <div style={{
                                                fontSize: '12px',
                                                color: 'var(--color-elephant-500)',
                                                marginTop: '2px',
                                            }}>
                                                {h.strain} &middot; {h.licenseNumber}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            color: 'var(--color-elephant-600)',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {weight.toLocaleString()}g
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Show selected harvest summary */}
                    {selectedHarvest && (
                        <div style={{
                            marginTop: '8px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'var(--color-elephant-50)',
                            fontSize: '12px',
                            color: 'var(--color-elephant-500)',
                        }}>
                            Strain: <strong style={{ color: 'var(--color-elephant-700)' }}>{selectedHarvest.strain}</strong>
                            {' '}&middot; License: <strong style={{ color: 'var(--color-elephant-700)' }}>{selectedHarvest.licenseNumber}</strong>
                            {' '}&middot; Status: <strong style={{ color: 'var(--color-elephant-700)' }}>{selectedHarvest.status}</strong>
                        </div>
                    )}
                </div>
            ) : (
                /* ── Manual Entry ── */
                <>
                    <div className="field">
                        <label className="field-label">Harvest Batch</label>
                        <input
                            type="text"
                            className="field-input"
                            value={harvestName}
                            onChange={e => setHarvestName(e.target.value)}
                            placeholder="H-123-ABC"
                            required
                        />
                    </div>

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Strain</label>
                            <select
                                className="field-input"
                                value={strainId}
                                onChange={e => setStrainId(e.target.value)}
                                required
                            >
                                <option value="">Select strain</option>
                                {strains.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Start Weight</label>
                            <div className="field-input-wrap">
                                <input
                                    type="number"
                                    className="field-input"
                                    value={startWeight}
                                    onChange={e => setStartWeight(e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    required
                                />
                                <span className="field-input-unit">g</span>
                            </div>
                        </div>
                    </div>

                    <div className="field">
                        <label className="field-label">License</label>
                        {licenses.length === 0 ? (
                            <p className="field-hint">No licenses found</p>
                        ) : (
                            <div className="chip-group">
                                {licenses.map(lic => (
                                    <button
                                        key={lic.id}
                                        type="button"
                                        onClick={() => setLicenseId(lic.id)}
                                        className={`ai-license-pill ${lic.id === licenseId ? 'active' : ''}`}
                                    >
                                        {lic.label || lic.licenseNumber}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            <button
                type="submit"
                disabled={!isValid}
                className="btn-primary"
                style={{ width: '100%' }}
            >
                Start Session
            </button>
        </form>
    );
};
