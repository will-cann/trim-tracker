import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import type { CreateTrimSessionDTO } from '../types/definitions';

interface StartSessionProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
}

export const StartSession: React.FC<StartSessionProps> = ({ onStart }) => {
    const [harvestName, setHarvestName] = useState('');
    const [strain, setStrain] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [startWeight, setStartWeight] = useState('');

    const { isListening, startListening, stopListening } = useSpeechToText();
    const [listeningField, setListeningField] = useState<string | null>(null);

    const handleSpeech = (field: string, setter: (val: string) => void) => {
        if (listeningField === field) {
            stopListening();
            setListeningField(null);
        } else {
            setListeningField(field);
            startListening((text) => {
                setter(text);
                setListeningField(null);
            });
        }
    };

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

    return (
        <div className="card">
            <h2>Start New Trim Session</h2>
            <form onSubmit={handleSubmit} className="start-form">
                <div className="form-group">
                    <label>Harvest Batch Name</label>
                    <div className="input-with-action">
                        <input
                            type="text"
                            value={harvestName}
                            onChange={e => setHarvestName(e.target.value)}
                            placeholder="e.g. H-123-ABC"
                            required
                        />
                        <button
                            type="button"
                            className={`btn-icon ${listeningField === 'harvest' ? 'listening' : ''}`}
                            onClick={() => handleSpeech('harvest', setHarvestName)}
                            title="Use voice input"
                        >
                            {listeningField === 'harvest' ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                </div>
                <div className="form-group">
                    <label>Strain</label>
                    <div className="input-with-action">
                        <input
                            type="text"
                            value={strain}
                            onChange={e => setStrain(e.target.value)}
                            placeholder="e.g. Blue Dream"
                            required
                        />
                        <button
                            type="button"
                            className={`btn-icon ${listeningField === 'strain' ? 'listening' : ''}`}
                            onClick={() => handleSpeech('strain', setStrain)}
                            title="Use voice input"
                        >
                            {listeningField === 'strain' ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                </div>
                <div className="form-group">
                    <label>License Number</label>
                    <div className="input-with-action">
                        <input
                            type="text"
                            value={licenseNumber}
                            onChange={e => setLicenseNumber(e.target.value)}
                            placeholder="e.g. L-456-XYZ"
                            required
                        />
                        <button
                            type="button"
                            className={`btn-icon ${listeningField === 'license' ? 'listening' : ''}`}
                            onClick={() => handleSpeech('license', setLicenseNumber)}
                            title="Use voice input"
                        >
                            {listeningField === 'license' ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                </div>
                <div className="form-group">
                    <label>Start Weight (g)</label>
                    <div className="input-with-action">
                        <input
                            type="number"
                            value={startWeight}
                            onChange={e => setStartWeight(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            required
                        />
                        <button
                            type="button"
                            className={`btn-icon ${listeningField === 'weight' ? 'listening' : ''}`}
                            onClick={() => handleSpeech('weight', (text) => {
                                // Extract numbers only for weight
                                const num = text.replace(/[^0-9.]/g, '');
                                if (num) setStartWeight(num);
                            })}
                            title="Use voice input"
                        >
                            {listeningField === 'weight' ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                </div>
                <button type="submit" className="btn-primary">Start Session</button>
            </form>
        </div>
    );
};
