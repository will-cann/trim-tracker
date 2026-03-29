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
            harvestName,
            strain,
            licenseNumber,
            startWeight: Number(startWeight),
            status: 'active'
        };
        onStart(dto);
    };

    const isValid = harvestName && strain && licenseNumber && startWeight;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Harvest Batch
                    </label>
                    <input
                        type="text"
                        value={harvestName}
                        onChange={e => setHarvestName(e.target.value)}
                        placeholder="H-123-ABC"
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                                   bg-white placeholder:text-gray-300
                                   focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10
                                   transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Strain
                    </label>
                    <input
                        type="text"
                        value={strain}
                        onChange={e => setStrain(e.target.value)}
                        placeholder="Blue Dream"
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                                   bg-white placeholder:text-gray-300
                                   focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10
                                   transition-colors"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        License
                    </label>
                    <input
                        type="text"
                        value={licenseNumber}
                        onChange={e => setLicenseNumber(e.target.value)}
                        placeholder="L-456-XYZ"
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                                   bg-white placeholder:text-gray-300 font-mono text-xs
                                   focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10
                                   transition-colors"
                    />
                </div>
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Start Weight
                </label>
                <div className="relative">
                    <input
                        type="number"
                        value={startWeight}
                        onChange={e => setStartWeight(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        required
                        className="w-full px-3 py-2 pr-8 text-sm rounded-lg border border-gray-200
                                   bg-white placeholder:text-gray-300
                                   focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10
                                   transition-colors tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">g</span>
                </div>
            </div>
            <button
                type="submit"
                disabled={!isValid}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors
                           bg-emerald-500 text-white hover:bg-emerald-600
                           disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
                Start Session
            </button>
        </form>
    );
};
