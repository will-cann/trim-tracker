import React, { useState, useEffect } from 'react';
import { Flower2, Snowflake, ArrowRightLeft } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { AllocationChoice, CreateHarvestDTO, Strain, License } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface CreateHarvestModalProps {
    onClose: () => void;
    onSubmit: (data: CreateHarvestDTO) => void;
}

const ALLOCATIONS: { value: AllocationChoice; label: string; sub: string; icon: typeof Flower2 }[] = [
    { value: 'Flower', label: 'Flower', sub: 'Dry Trim', icon: Flower2 },
    { value: 'Frozen', label: 'Fresh Frozen', sub: 'Extraction', icon: Snowflake },
    { value: 'Both', label: 'Both', sub: 'Split batch', icon: ArrowRightLeft },
];

export const CreateHarvestModal: React.FC<CreateHarvestModalProps> = ({ onClose, onSubmit }) => {
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [name, setName] = useState('');
    const [plantCount, setPlantCount] = useState('');
    const [dryingLocation, setDryingLocation] = useState('');
    const [allocation, setAllocation] = useState<AllocationChoice>('Flower');
    const [targetWeight, setTargetWeight] = useState('');
    const [manicureLocation, setManicureLocation] = useState('');

    const [strains, setStrains] = useState<Strain[]>([]);
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
        ]).finally(() => setLoading(false));
    }, []);

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);
    const canSubmit = strainId && licenseId && (allocation !== 'Both' || targetWeight);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || !selectedStrain || !selectedLicense) return;
        onSubmit({
            strain: selectedStrain.name,
            licenseNumber: selectedLicense.licenseNumber,
            allocation,
            name: name || undefined,
            plantCount: plantCount ? Number(plantCount) : undefined,
            dryingLocation: dryingLocation || undefined,
            targetWeight: targetWeight ? Number(targetWeight) : undefined,
            manicureLocation: manicureLocation || undefined,
        });
    };

    return (
        <Modal title="New Harvest" contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="create-harvest-form" disabled={!canSubmit}>
                    Create Harvest
                </Button>
            </>
        }>
            {loading ? (
                <CenteredSpinner label="Loading harvest data…" height="py-12" />
            ) : (
                <form id="create-harvest-form" onSubmit={handleSubmit}>
                    {/* Core info */}
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
                            <label className="field-label">Batch ID</label>
                            <input
                                type="text"
                                className="field-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Auto-generated"
                            />
                        </div>
                    </div>

                    {/* License chips */}
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

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Plant Count</label>
                            <input
                                type="number"
                                className="field-input"
                                value={plantCount}
                                onChange={e => setPlantCount(e.target.value)}
                                placeholder="0"
                                min="0"
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Drying Location</label>
                            <input
                                type="text"
                                className="field-input"
                                value={dryingLocation}
                                onChange={e => setDryingLocation(e.target.value)}
                                placeholder="Drying Room 1"
                            />
                        </div>
                    </div>

                    <div className="field-divider" />

                    {/* Allocation picker */}
                    <div className="field">
                        <label className="field-label">
                            Allocation <span className="required">*</span>
                        </label>
                        <div className="chip-group">
                            {ALLOCATIONS.map(a => {
                                const Icon = a.icon;
                                return (
                                    <button
                                        key={a.value}
                                        type="button"
                                        onClick={() => setAllocation(a.value)}
                                        className={`chip chip-flex ${allocation === a.value ? 'chip-active' : ''}`}
                                    >
                                        <span className="chip-label-row">
                                            <Icon size={14} />
                                            {a.label}
                                        </span>
                                        <span className="chip-sub">{a.sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Conditional fields for Both */}
                    {allocation === 'Both' && (
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">
                                    Frozen Target Weight <span className="required">*</span>
                                </label>
                                <div className="field-input-wrap">
                                    <input
                                        type="number"
                                        className="field-input"
                                        value={targetWeight}
                                        onChange={e => setTargetWeight(e.target.value)}
                                        placeholder="0"
                                        min="1"
                                        required
                                    />
                                    <span className="field-input-unit">g</span>
                                </div>
                            </div>
                            <div className="field">
                                <label className="field-label">
                                    Manicure Location <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="field-input"
                                    value={manicureLocation}
                                    onChange={e => setManicureLocation(e.target.value)}
                                    placeholder="Storage room"
                                    required
                                />
                            </div>
                        </div>
                    )}
                </form>
            )}
        </Modal>
    );
};
