import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreatePackageDTO, PackageType, Strain, License } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface CreatePackageModalProps {
    onClose: () => void;
    onSubmit: (data: CreatePackageDTO | CreatePackageDTO[]) => void;
    prefill?: {
        strain?: string;
        licenseNumber?: string;
        harvestId?: string;
        trimEntryId?: string;
        flowerWeight?: number;
        trimWeight?: number;
        shakeWeight?: number;
    };
}

const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
    { value: 'flower', label: 'Flower' },
    { value: 'trim', label: 'Trim' },
    { value: 'shake', label: 'Shake' },
];

export const CreatePackageModal: React.FC<CreatePackageModalProps> = ({ onClose, onSubmit, prefill }) => {
    const [label, setLabel] = useState('');
    const [packageType, setPackageType] = useState<PackageType>('flower');
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [wasteWeight, setWasteWeight] = useState('');
    const [location, setLocation] = useState('');
    const [notes, setNotes] = useState('');

    const [strains, setStrains] = useState<Strain[]>([]);
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
        ]).finally(() => setLoading(false));
    }, []);

    // Auto-select strain/license from prefill
    useEffect(() => {
        if (!loading && prefill) {
            if (prefill.strain) {
                const match = strains.find(s => s.name.toLowerCase() === prefill.strain!.toLowerCase());
                if (match) setStrainId(match.id);
            }
            if (prefill.licenseNumber) {
                const match = licenses.find(l => l.licenseNumber === prefill.licenseNumber);
                if (match) setLicenseId(match.id);
            }
            if (prefill.flowerWeight && packageType === 'flower') {
                setQuantity(String(prefill.flowerWeight));
            }
        }
    }, [loading, prefill, strains, licenses, packageType]);

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);
    const canSubmit = label && strainId && licenseId && quantity && Number(quantity) > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || !selectedStrain || !selectedLicense) return;

        const dto: CreatePackageDTO = {
            label,
            packageType,
            strain: selectedStrain.name,
            licenseNumber: selectedLicense.licenseNumber,
            quantity: Number(quantity),
            wasteWeight: wasteWeight ? Number(wasteWeight) : undefined,
            location: location || undefined,
            notes: notes || undefined,
            harvestId: prefill?.harvestId,
            trimEntryId: prefill?.trimEntryId,
        };

        onSubmit(dto);
    };

    return (
        <Modal title="New Package" contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="create-package-form" disabled={!canSubmit}>
                    Create Package
                </Button>
            </>
        }>
            {loading ? (
                <div className="field-loading">
                    <Loader2 size={16} className="animate-spin" /> Loading...
                </div>
            ) : (
                <form id="create-package-form" onSubmit={handleSubmit}>
                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">
                                Label <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="field-input"
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                                placeholder="PKG-001"
                                required
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">
                                Type <span className="required">*</span>
                            </label>
                            <div className="chip-group">
                                {PACKAGE_TYPES.map(pt => (
                                    <button
                                        key={pt.value}
                                        type="button"
                                        onClick={() => setPackageType(pt.value)}
                                        className={`chip ${packageType === pt.value ? 'chip-active' : ''}`}
                                    >
                                        {pt.label}
                                    </button>
                                ))}
                            </div>
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
                    </div>

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">
                                Quantity <span className="required">*</span>
                            </label>
                            <div className="field-input-wrap">
                                <input
                                    type="number"
                                    className="field-input"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    min="0.01"
                                    step="0.01"
                                    required
                                />
                                <span className="field-input-unit">g</span>
                            </div>
                        </div>
                        <div className="field">
                            <label className="field-label">Waste</label>
                            <div className="field-input-wrap">
                                <input
                                    type="number"
                                    className="field-input"
                                    value={wasteWeight}
                                    onChange={e => setWasteWeight(e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                />
                                <span className="field-input-unit">g</span>
                            </div>
                        </div>
                    </div>

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Location</label>
                            <input
                                type="text"
                                className="field-input"
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                                placeholder="Storage Room A"
                            />
                        </div>
                    </div>

                    <div className="field">
                        <label className="field-label">Notes</label>
                        <textarea
                            className="field-input"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Optional notes..."
                            rows={2}
                        />
                    </div>
                </form>
            )}
        </Modal>
    );
};
