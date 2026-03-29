import React, { useState, useEffect } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import type { CreateTrimSessionDTO, Strain, License } from '../types/definitions';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { apiService } from '../services/apiService';
import { Modal, Button } from './ui';

interface AddBatchModalProps {
    onClose: () => void;
    onSubmit: (data: CreateTrimSessionDTO) => void;
}

export const AddBatchModal: React.FC<AddBatchModalProps> = ({ onClose, onSubmit }) => {
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

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);
    const canSubmit = harvestName && strainId && licenseId && startWeight;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || !selectedStrain || !selectedLicense) return;
        onSubmit({
            harvestName,
            strain: selectedStrain.name,
            licenseNumber: selectedLicense.licenseNumber,
            startWeight: Number(startWeight),
            status: 'upcoming',
        });
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
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                    <Loader2 size={16} className="animate-spin" /> Loading...
                </div>
            ) : (
                <form id="add-batch-form" onSubmit={handleSubmit}>
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

                    {/* License chips */}
                    <div className="field">
                        <label className="field-label">
                            License <span className="required">*</span>
                        </label>
                        {licenses.length === 0 ? (
                            <p className="field-hint" style={{ marginTop: 0 }}>No licenses found</p>
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
                </form>
            )}
        </Modal>
    );
};
