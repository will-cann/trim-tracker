import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { AllocationChoice, CreateHarvestDTO } from '../../types/definitions';

interface CreateHarvestModalProps {
    onClose: () => void;
    onSubmit: (data: CreateHarvestDTO) => void;
}

export const CreateHarvestModal: React.FC<CreateHarvestModalProps> = ({ onClose, onSubmit }) => {
    const [strain, setStrain] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [name, setName] = useState('');
    const [plantCount, setPlantCount] = useState('');
    const [dryingLocation, setDryingLocation] = useState('');
    const [allocation, setAllocation] = useState<AllocationChoice>('Flower');
    const [targetWeight, setTargetWeight] = useState('');
    const [manicureLocation, setManicureLocation] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!strain) return;

        if (allocation === 'Both' && !targetWeight) return;

        onSubmit({
            strain,
            licenseNumber: licenseNumber || '',
            allocation,
            name: name || undefined,
            plantCount: plantCount ? Number(plantCount) : undefined,
            dryingLocation: dryingLocation || undefined,
            targetWeight: targetWeight ? Number(targetWeight) : undefined,
            manicureLocation: manicureLocation || undefined,
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3>New Harvest</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="add-batch-form">
                    <div className="form-group">
                        <label>Strain *</label>
                        <input
                            type="text"
                            value={strain}
                            onChange={e => setStrain(e.target.value)}
                            placeholder="e.g. Blue Dream"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>License Number</label>
                        <input
                            type="text"
                            value={licenseNumber}
                            onChange={e => setLicenseNumber(e.target.value)}
                            placeholder="Optional"
                        />
                    </div>
                    <div className="form-group">
                        <label>Batch ID (auto-generated if blank)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Leave blank to auto-generate"
                        />
                    </div>
                    <div className="form-group">
                        <label>Plant Count</label>
                        <input
                            type="number"
                            value={plantCount}
                            onChange={e => setPlantCount(e.target.value)}
                            placeholder="0"
                            min="0"
                        />
                    </div>
                    <div className="form-group">
                        <label>Drying Location</label>
                        <input
                            type="text"
                            value={dryingLocation}
                            onChange={e => setDryingLocation(e.target.value)}
                            placeholder="e.g. Drying Room 1"
                        />
                    </div>
                    <div className="form-group">
                        <label>Allocation *</label>
                        <select
                            value={allocation}
                            onChange={e => setAllocation(e.target.value as AllocationChoice)}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                fontSize: '0.875rem',
                                backgroundColor: 'white',
                            }}
                        >
                            <option value="Flower">Flower (Dry Trim)</option>
                            <option value="Frozen">Fresh Frozen</option>
                            <option value="Both">Both</option>
                        </select>
                    </div>

                    {allocation === 'Both' && (
                        <>
                            <div className="form-group">
                                <label>Fresh Frozen Target Weight (g) *</label>
                                <input
                                    type="number"
                                    value={targetWeight}
                                    onChange={e => setTargetWeight(e.target.value)}
                                    placeholder="Weight to allocate to fresh frozen"
                                    min="1"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Manicure Location *</label>
                                <input
                                    type="text"
                                    value={manicureLocation}
                                    onChange={e => setManicureLocation(e.target.value)}
                                    placeholder="Fresh frozen storage room"
                                    required
                                />
                            </div>
                        </>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary">Create Harvest</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
