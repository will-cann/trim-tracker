import React, { useState, useEffect } from 'react';
import { X, Mic } from 'lucide-react';
import type { CreateTrimSessionDTO } from '../types/definitions';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface AddBatchModalProps {
    onClose: () => void;
    onSubmit: (data: CreateTrimSessionDTO) => void;
}

export const AddBatchModal: React.FC<AddBatchModalProps> = ({ onClose, onSubmit }) => {
    const [harvestName, setHarvestName] = useState('');
    const [strain, setStrain] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [startWeight, setStartWeight] = useState('');

    const { isListening, transcript, startListening, stopListening, hasSupport } = useSpeechRecognition();
    const [activeField, setActiveField] = useState<string | null>(null);

    useEffect(() => {
        if (transcript && activeField) {
            switch (activeField) {
                case 'harvestName':
                    setHarvestName(transcript);
                    break;
                case 'strain':
                    setStrain(transcript);
                    break;
                case 'licenseNumber':
                    setLicenseNumber(transcript);
                    break;
            }
        }
    }, [transcript, activeField]);

    const handleMicClick = (field: string) => {
        if (isListening && activeField === field) {
            stopListening();
            setActiveField(null);
        } else {
            setActiveField(field);
            startListening();
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!harvestName || !strain || !licenseNumber || !startWeight) return;

        onSubmit({
            harvestName,
            strain,
            licenseNumber,
            startWeight: Number(startWeight),
            status: 'upcoming'
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Add New Batch</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Harvest Batch Name</label>
                        <div className="input-with-icon">
                            <input
                                type="text"
                                value={harvestName}
                                onChange={e => setHarvestName(e.target.value)}
                                placeholder="e.g. H-123-ABC"
                                required
                            />
                            {hasSupport && (
                                <button
                                    type="button"
                                    className={`mic-btn ${isListening && activeField === 'harvestName' ? 'listening' : ''}`}
                                    onClick={() => handleMicClick('harvestName')}
                                    title="Dictate"
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Strain</label>
                        <div className="input-with-icon">
                            <input
                                type="text"
                                value={strain}
                                onChange={e => setStrain(e.target.value)}
                                placeholder="e.g. Blue Dream"
                                required
                            />
                            {hasSupport && (
                                <button
                                    type="button"
                                    className={`mic-btn ${isListening && activeField === 'strain' ? 'listening' : ''}`}
                                    onClick={() => handleMicClick('strain')}
                                    title="Dictate"
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="form-group">
                        <label>License Number</label>
                        <div className="input-with-icon">
                            <input
                                type="text"
                                value={licenseNumber}
                                onChange={e => setLicenseNumber(e.target.value)}
                                placeholder="e.g. L-456-XYZ"
                                required
                            />
                            {hasSupport && (
                                <button
                                    type="button"
                                    className={`mic-btn ${isListening && activeField === 'licenseNumber' ? 'listening' : ''}`}
                                    onClick={() => handleMicClick('licenseNumber')}
                                    title="Dictate"
                                >
                                    <Mic size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Start Weight (g)</label>
                        <input
                            type="number"
                            value={startWeight}
                            onChange={e => setStartWeight(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            required
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Add Batch</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
