import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Trimmer, TrimmerProfile } from '../types/definitions';
import { TimePicker } from './TimePicker';

interface TrimmerItemProps {
    trimmer: Trimmer;
    profiles: TrimmerProfile[]; // Added profiles prop
    onUpdate: (id: string, updates: Partial<Trimmer>) => void;
    onRemove: (id: string) => void;
}

export const TrimmerItem: React.FC<TrimmerItemProps> = ({ trimmer, profiles, onUpdate, onRemove }) => {
    const handleChange = (field: keyof Trimmer, value: string | number) => {
        onUpdate(trimmer.id, { [field]: value });
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedProfile = profiles.find(p => p.id === e.target.value);
        if (selectedProfile) {
            onUpdate(trimmer.id, {
                name: selectedProfile.name,
                profileId: selectedProfile.id
            });
        } else {
            // Handle case where no profile is selected (e.g., "Select Trimmer" option)
            onUpdate(trimmer.id, { name: '', profileId: '' });
        }
    };

    return (
        <div className="trimmer-row">
            <div className="trimmer-row-content">
                <div className="trimmer-row-top">
                    <div className="name-section">
                        <label className="input-label">Name</label>
                        <select
                            value={trimmer.profileId || ''}
                            onChange={handleNameChange}
                            className="trimmer-select-compact"
                        >
                            <option value="" disabled>Select Trimmer</option>
                            {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="time-input-group">
                        <label className="time-label">Start</label>
                        <TimePicker
                            value={trimmer.startTime}
                            onChange={(val) => handleChange('startTime', val)}
                            className="time-input-compact"
                        />
                    </div>
                    <div className="weight-input-group">
                        <label className="weight-label text-flower">Flower</label>
                        <input
                            type="number"
                            value={trimmer.flowerWeight || ''}
                            onChange={(e) => handleChange('flowerWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-compact"
                        />
                    </div>
                    <div className="weight-input-group">
                        <label className="weight-label text-shake">Shake</label>
                        <input
                            type="number"
                            value={trimmer.shakeWeight || ''}
                            onChange={(e) => handleChange('shakeWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-compact"
                        />
                    </div>
                </div>
                <div className="trimmer-row-bottom">
                    <div className="tool-section">
                        <label className="input-label">Tools</label>
                        <select
                            value={trimmer.tool || ''}
                            onChange={(e) => handleChange('tool', e.target.value)}
                            className="tool-select-compact"
                        >
                            <option value="">Select Tool</option>
                            <option value="scissors">Scissors</option>
                            <option value="machine">Machine</option>
                        </select>
                    </div>
                    <div className="time-input-group">
                        <label className="time-label">End</label>
                        <TimePicker
                            value={trimmer.endTime || ''}
                            onChange={(val) => handleChange('endTime', val)}
                            className="time-input-compact"
                        />
                    </div>
                    <div className="weight-input-group">
                        <label className="weight-label text-trim">Trim</label>
                        <input
                            type="number"
                            value={trimmer.trimWeight || ''}
                            onChange={(e) => handleChange('trimWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-compact"
                        />
                    </div>
                    <div className="weight-input-group">
                        <label className="weight-label text-waste">Waste</label>
                        <input
                            type="number"
                            value={trimmer.wasteWeight || ''}
                            onChange={(e) => handleChange('wasteWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-compact"
                        />
                    </div>
                </div>
            </div>
            <button
                className="trimmer-delete-btn"
                onClick={() => onRemove(trimmer.id)}
                title="Remove Trimmer"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );
};
