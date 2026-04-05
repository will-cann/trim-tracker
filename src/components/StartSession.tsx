import React, { useState, useEffect } from 'react';
import { Package, PenLine, Droplets } from 'lucide-react';
import { CenteredSpinner } from './Spinner';
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
    const trimmableHarvests = harvests
        .filter(h => {
            const hasFlowerAllocation = h.allocations?.some(
                a => a.allocationType === 'flower' && a.status !== 'completed'
            );
            // Show harvests that are active/drying/ready and have a flower allocation,
            // or any harvest not yet completed (user may want to start trim early)
            return h.status !== 'completed' && (hasFlowerAllocation || !h.allocations?.length);
        })
        // Sort: "ready" first, then "drying", then everything else
        .sort((a, b) => {
            const priority: Record<string, number> = { ready: 0, drying: 1, submitted: 2, active: 3, planning: 4 };
            return (priority[a.status] ?? 5) - (priority[b.status] ?? 5);
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
            const wetWeight = flowerAlloc?.targetWeight ?? selectedHarvest.totalWetWeight;
            onStart({
                harvestName: selectedHarvest.batchId,
                strain: selectedHarvest.strain,
                licenseNumber: selectedHarvest.licenseNumber,
                startWeight: wetWeight,
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
        return <CenteredSpinner label="Loading session data…" height="py-12" />;
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
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '10px',
                        }}>
                            {trimmableHarvests.map(h => {
                                const flowerAlloc = h.allocations?.find(
                                    a => a.allocationType === 'flower' && a.status !== 'completed'
                                );
                                const wetWeight = flowerAlloc?.targetWeight ?? h.totalWetWeight;
                                const moisturePct = h.moistureLossPct ?? 75;
                                const estDryWeight = h.dryWeight ?? Math.round(wetWeight * (1 - moisturePct / 100));
                                const moistureLossG = wetWeight - estDryWeight;
                                const isSelected = selectedHarvestId === h.id;
                                const isReady = h.status === 'ready';
                                const isDrying = h.status === 'drying';

                                const statusLabel: Record<string, string> = {
                                    ready: 'Ready for Trim',
                                    drying: 'Drying',
                                    active: 'Active',
                                    submitted: 'Submitted',
                                    planning: 'Planning',
                                };

                                const statusColor: Record<string, string> = {
                                    ready: 'var(--color-chameleon)',
                                    drying: 'var(--color-lion)',
                                    active: 'var(--color-dolphin, #3b82f6)',
                                    submitted: 'var(--detail-text-light)',
                                    planning: 'var(--color-dolphin)',
                                };

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
                                                : isReady
                                                    ? '1.5px solid var(--color-chameleon-300, rgba(76,175,80,0.4))'
                                                    : '1.5px solid var(--detail-border)',
                                            background: isSelected
                                                ? 'var(--color-chameleon-50, rgba(76,175,80,0.06))'
                                                : isReady
                                                    ? 'rgba(76,175,80,0.03)'
                                                    : 'var(--detail-bg)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            width: '100%',
                                            fontFamily: 'inherit',
                                            transition: 'border-color 0.15s, background 0.15s',
                                        }}
                                    >
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    fontSize: '14px',
                                                    color: 'var(--text-color)',
                                                }}>
                                                    {h.batchId}
                                                </span>
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: 600,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: `${statusColor[h.status] ?? 'var(--color-dolphin)'}20`,
                                                    color: statusColor[h.status] ?? 'var(--detail-text)',
                                                }}>
                                                    {statusLabel[h.status] ?? h.status}
                                                </span>
                                            </div>
                                            <div style={{
                                                fontSize: '12px',
                                                color: 'var(--detail-text)',
                                                marginTop: '2px',
                                            }}>
                                                {h.strain} &middot; {h.licenseNumber}
                                            </div>
                                        </div>
                                        <div style={{
                                            textAlign: 'right',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            <div style={{
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: 'var(--detail-text-strong)',
                                            }}>
                                                {h.dryWeight
                                                    ? `${h.dryWeight.toLocaleString()}g dry`
                                                    : `~${estDryWeight.toLocaleString()}g dry`
                                                }
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: 'var(--detail-text-light)',
                                            }}>
                                                {wetWeight.toLocaleString()}g wet
                                            </div>
                                            {(isDrying || isReady) && moistureLossG > 0 && (
                                                <div style={{
                                                    fontSize: '10px',
                                                    color: 'var(--color-dolphin, #3b82f6)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'flex-end',
                                                    gap: '3px',
                                                    marginTop: '1px',
                                                }}>
                                                    <Droplets size={10} />
                                                    -{moistureLossG.toLocaleString()}g ({moisturePct}%)
                                                </div>
                                            )}
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
                            background: 'var(--detail-bg)',
                            fontSize: '12px',
                            color: 'var(--detail-text)',
                        }}>
                            Strain: <strong style={{ color: 'var(--text-color)' }}>{selectedHarvest.strain}</strong>
                            {' '}&middot; License: <strong style={{ color: 'var(--text-color)' }}>{selectedHarvest.licenseNumber}</strong>
                            {' '}&middot; Status: <strong style={{ color: 'var(--text-color)' }}>{selectedHarvest.status}</strong>
                        </div>
                    )}
                </div>
            ) : (
                /* ── Manual Entry ── */
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px',
                }}>
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
                </div>
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
