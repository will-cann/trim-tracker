import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Trimmer, TrimmerProfile } from '../types/definitions';
import { TimePicker } from './TimePicker';
import { calculateDuration, formatDuration } from '../utils/timeUtils';

interface TrimmerItemProps {
    trimmer: Trimmer;
    profiles: TrimmerProfile[]; // Added profiles prop
    onUpdate: (id: string, updates: Partial<Trimmer>) => void;
    onRemove: (id: string) => void;
    readOnly?: boolean;
}

export const TrimmerItem: React.FC<TrimmerItemProps> = ({ trimmer, profiles, onUpdate, onRemove, readOnly = false }) => {
    const handleChange = (field: keyof Trimmer, value: any) => {
        if (readOnly) return;
        onUpdate(trimmer.id, { [field]: value });
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (readOnly) return;
        const profileId = e.target.value;
        const profile = profiles.find(p => p.id === profileId);
        if (profile) {
            onUpdate(trimmer.id, {
                profileId: profile.id,
                name: profile.name
            });
        }
    };

    const duration = calculateDuration(trimmer.startTime, trimmer.endTime || '');
    const durationText = formatDuration(duration);

    return (
        <div className={`trimmer-row ${readOnly ? 'read-only' : ''}`}>
            <div className="trimmer-header">
                <div className="trimmer-header-left">
                    <div className="input-group-compact">
                        <select
                            value={trimmer.profileId || ''}
                            onChange={handleNameChange}
                            className="trimmer-select-minimal"
                            disabled={readOnly}
                        >
                            <option value="" disabled>Select Trimmer</option>
                            {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="input-group-compact">
                        <select
                            value={trimmer.tool || 'scissors'}
                            onChange={(e) => handleChange('tool', e.target.value)}
                            className="tool-select-minimal"
                            disabled={readOnly}
                        >
                            <option value="scissors">Scissors</option>
                            <option value="machine">Machine</option>
                        </select>
                    </div>
                    <div className="time-range-compact">
                        <TimePicker
                            value={trimmer.startTime}
                            onChange={(val) => handleChange('startTime', val)}
                            className="time-input-minimal"
                            readOnly={readOnly}
                        />
                        <span className="time-separator">-</span>
                        <TimePicker
                            value={trimmer.endTime || ''}
                            onChange={(val) => handleChange('endTime', val)}
                            className="time-input-minimal"
                            readOnly={readOnly}
                        />
                        {durationText && (
                            <span className="duration-badge">{durationText}</span>
                        )}
                    </div>
                </div>
                {!readOnly && (
                    <button
                        className="trimmer-delete-btn-minimal"
                        onClick={() => onRemove(trimmer.id)}
                        title="Remove Trimmer"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>

            <div className="trimmer-outputs">
                <div className="output-group flower">
                    <label>Flower</label>
                    <input
                        type="number"
                        value={trimmer.flowerWeight || ''}
                        onChange={(e) => handleChange('flowerWeight', Number(e.target.value))}
                        placeholder="0"
                        className="weight-input-minimal"
                        disabled={readOnly}
                    />
                </div>
                <div className="output-group shake">
                    <label>Shake</label>
                    <input
                        type="number"
                        value={trimmer.shakeWeight || ''}
                        onChange={(e) => handleChange('shakeWeight', Number(e.target.value))}
                        placeholder="0"
                        className="weight-input-minimal"
                        disabled={readOnly}
                    />
                </div>
                <div className="output-group trim">
                    <label>Trim</label>
                    <input
                        type="number"
                        value={trimmer.trimWeight || ''}
                        onChange={(e) => handleChange('trimWeight', Number(e.target.value))}
                        placeholder="0"
                        className="weight-input-minimal"
                        disabled={readOnly}
                    />
                </div>
                <div className="output-group waste">
                    <label>Waste</label>
                    <input
                        type="number"
                        value={trimmer.wasteWeight || ''}
                        onChange={(e) => handleChange('wasteWeight', Number(e.target.value))}
                        placeholder="0"
                        className="weight-input-minimal"
                        disabled={readOnly}
                    />
                </div>
            </div>
        </div>
    );
};
