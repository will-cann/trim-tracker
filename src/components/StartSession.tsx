import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreateTrimSessionDTO, Strain, License } from '../types/definitions';
import { apiService } from '../services/apiService';

interface StartSessionProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
}

export const StartSession: React.FC<StartSessionProps> = ({ onStart }) => {
    const [harvestName, setHarvestName] = useState('');
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [startWeight, setStartWeight] = useState('');

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
    const isValid = harvestName && strainId && licenseId && startWeight;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || !selectedStrain || !selectedLicense) return;

        onStart({
            harvestName,
            strain: selectedStrain.name,
            licenseNumber: selectedLicense.licenseNumber,
            startWeight: Number(startWeight),
            status: 'active',
        });
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

            {/* License chips */}
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
