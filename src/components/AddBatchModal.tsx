import React, { useState, useEffect } from 'react';
import { Mic, Loader2, Package, PenLine } from 'lucide-react';
import type { CreateTrimSessionDTO, Strain, License, Harvest } from '../types/definitions';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { apiService } from '../services/apiService';
import { Modal, Button } from './ui';

interface AddBatchModalProps {
    onClose: () => void;
    onSubmit: (data: CreateTrimSessionDTO) => void;
}

export const AddBatchModal: React.FC<AddBatchModalProps> = ({ onClose, onSubmit }) => {
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

    const { isListening, finalTranscript, startListening, stopListening, hasSupport } = useSpeechRecognition();
    const [activeField, setActiveField] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            apiService.getHarvests().then(setHarvests),
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
        ]).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (finalTranscript && activeField === 'harvestName') {
            setHarvestName(finalTranscript);
        }
    }, [finalTranscript, activeField]);

    const handleMicClick = (field: string) => {
        if (isListening && activeField === field) {
            stopListening();
            setActiveField(null);
        } else {
            setActiveField(field);
            startListening();
        }
    };

    const trimmableHarvests = harvests.filter(h => {
        const hasFlowerAllocation = h.allocations?.some(
            a => a.allocationType === 'flower' && a.status !== 'completed'
        );
        return h.status !== 'completed' && (hasFlowerAllocation || !h.allocations?.length);
    });

    const selectedHarvest = harvests.find(h => h.id === selectedHarvestId);
    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);

    const isValidHarvest = !!selectedHarvestId;
    const isValidManual = harvestName && strainId && licenseId && startWeight;
    const canSubmit = mode === 'harvest' ? isValidHarvest : isValidManual;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (mode === 'harvest' && selectedHarvest) {
            const flowerAlloc = selectedHarvest.allocations?.find(
                a => a.allocationType === 'flower' && a.status !== 'completed'
            );
            onSubmit({
                harvestName: selectedHarvest.batchId,
                strain: selectedHarvest.strain,
                licenseNumber: selectedHarvest.licenseNumber,
                startWeight: flowerAlloc?.targetWeight ?? selectedHarvest.totalWetWeight,
                status: 'upcoming',
                harvestId: selectedHarvest.id,
            });
        } else if (mode === 'manual' && selectedStrain && selectedLicense) {
            onSubmit({
                harvestName,
                strain: selectedStrain.name,
                licenseNumber: selectedLicense.licenseNumber,
                startWeight: Number(startWeight),
                status: 'upcoming',
            });
        }
    };

    return (
        <Modal title="New Trim Batch" contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="add-batch-form" disabled={!canSubmit}>
                    Add Batch
                </Button>
            </>
        }>
            {loading ? (
                <div className="field-loading">
                    <Loader2 size={16} className="animate-spin" /> Loading...
                </div>
            ) : (
                <form id="add-batch-form" onSubmit={handleSubmit}>
                    {/* Mode toggle */}
                    <div className="chip-group" style={{ justifyContent: 'center', marginBottom: '16px' }}>
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
                            <label className="field-label">
                                Select Harvest Batch <span className="required">*</span>
                            </label>
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
                        </div>
                    ) : (
                        /* ── Manual Entry ── */
                        <>
                            <div className="field">
                                <label className="field-label">
                                    Harvest Batch Name <span className="required">*</span>
                                </label>
                                <div className="field-input-wrap">
                                    <input
                                        type="text"
                                        className="field-input"
                                        value={harvestName}
                                        onChange={e => setHarvestName(e.target.value)}
                                        placeholder="H-123-ABC"
                                        autoFocus
                                        required
                                    />
                                    {hasSupport && (
                                        <button
                                            type="button"
                                            className={`field-input-addon ${isListening && activeField === 'harvestName' ? 'active' : ''}`}
                                            onClick={() => handleMicClick('harvestName')}
                                            title="Dictate"
                                        >
                                            <Mic size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="field-row">
                                <div className="field">
                                    <label className="field-label">
                                        Strain <span className="required">*</span>
                                    </label>
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
                                    <label className="field-label">
                                        Start Weight <span className="required">*</span>
                                    </label>
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
                                <label className="field-label">
                                    License <span className="required">*</span>
                                </label>
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
                </form>
            )}
        </Modal>
    );
};
