import React, { useState } from 'react';
import type { CreateTrimSessionDTO } from '../types/definitions';

interface StartSessionProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
}

export const StartSession: React.FC<StartSessionProps> = ({ onStart }) => {
    const [harvestName, setHarvestName] = useState('');
    const [strain, setStrain] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [startWeight, setStartWeight] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!harvestName || !strain || !licenseNumber || !startWeight) return;

        const dto: CreateTrimSessionDTO = {
            timestamp: new Date().toISOString(),
            entries: [{
                harvestName,
                strain,
                licenseNumber,
                startWeight: Number(startWeight),
            }]
        };
        onStart(dto);
    };

    return (
        <div className="card">
            <h2>Start New Trim Session</h2>
            <form onSubmit={handleSubmit} className="start-form">
                <div className="form-group">
                    <label>Harvest Batch Name</label>
                    <input
                        type="text"
                        value={harvestName}
                        onChange={e => setHarvestName(e.target.value)}
                        placeholder="e.g. H-123-ABC"
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Strain</label>
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
                        placeholder="e.g. L-456-XYZ"
                        required
                    />
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
                <button type="submit" className="btn-primary">Start Session</button>
            </form>
        </div>
    );
};
