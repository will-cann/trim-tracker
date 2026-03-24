import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Mic, MicOff } from 'lucide-react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import type { Trimmer, TrimmerProfile } from '../types/definitions';
import { TimePicker } from './TimePicker';
import { calculateDuration, formatDuration } from '../utils/timeUtils';

const DEBOUNCE_MS = 800;

interface TrimmerItemProps {
    trimmer: Trimmer;
    profiles: TrimmerProfile[];
    onUpdate: (id: string, updates: Partial<Trimmer>) => void;
    onRemove: (id: string) => void;
    readOnly?: boolean;
}

export const TrimmerItem: React.FC<TrimmerItemProps> = ({ trimmer, profiles, onUpdate, onRemove, readOnly = false }) => {
    const { startListening, stopListening } = useSpeechToText();
    const [listeningField, setListeningField] = useState<string | null>(null);

    // Local state for weight inputs so typing is instant
    const [localWeights, setLocalWeights] = useState({
        flowerWeight: trimmer.flowerWeight,
        shakeWeight: trimmer.shakeWeight,
        trimWeight: trimmer.trimWeight,
        wasteWeight: trimmer.wasteWeight,
    });

    // Sync local state when trimmer prop changes from outside (e.g. after save completes)
    const lastSavedRef = useRef(localWeights);
    useEffect(() => {
        const incoming = {
            flowerWeight: trimmer.flowerWeight,
            shakeWeight: trimmer.shakeWeight,
            trimWeight: trimmer.trimWeight,
            wasteWeight: trimmer.wasteWeight,
        };
        // Only update local if server state differs from what we last saved
        // (avoids overwriting in-progress typing)
        if (
            incoming.flowerWeight !== lastSavedRef.current.flowerWeight ||
            incoming.shakeWeight !== lastSavedRef.current.shakeWeight ||
            incoming.trimWeight !== lastSavedRef.current.trimWeight ||
            incoming.wasteWeight !== lastSavedRef.current.wasteWeight
        ) {
            setLocalWeights(incoming);
            lastSavedRef.current = incoming;
        }
    }, [trimmer.flowerWeight, trimmer.shakeWeight, trimmer.trimWeight, trimmer.wasteWeight]);

    // Debounce timer ref
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingUpdatesRef = useRef<Partial<Trimmer>>({});

    const flushUpdates = useCallback(() => {
        const updates = pendingUpdatesRef.current;
        if (Object.keys(updates).length > 0) {
            lastSavedRef.current = { ...lastSavedRef.current, ...updates } as typeof lastSavedRef.current;
            onUpdate(trimmer.id, updates);
            pendingUpdatesRef.current = {};
        }
    }, [trimmer.id, onUpdate]);

    // Flush on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            flushUpdates();
        };
    }, [flushUpdates]);

    const debouncedUpdate = (field: keyof Trimmer, value: any) => {
        pendingUpdatesRef.current = { ...pendingUpdatesRef.current, [field]: value };
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(flushUpdates, DEBOUNCE_MS);
    };

    const handleWeightChange = (field: 'flowerWeight' | 'shakeWeight' | 'trimWeight' | 'wasteWeight', value: number) => {
        if (readOnly) return;
        setLocalWeights(prev => ({ ...prev, [field]: value }));
        debouncedUpdate(field, value);
    };

    // Immediate save for non-weight fields (dropdowns, time pickers)
    const handleChange = (field: keyof Trimmer, value: any) => {
        if (readOnly) return;
        onUpdate(trimmer.id, { [field]: value });
    };

    const handleSpeech = (field: keyof Trimmer) => {
        if (listeningField === field) {
            stopListening();
            setListeningField(null);
        } else {
            setListeningField(field);
            startListening((text) => {
                const num = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (!isNaN(num)) {
                    if (['flowerWeight', 'shakeWeight', 'trimWeight', 'wasteWeight'].includes(field)) {
                        handleWeightChange(field as any, num);
                    } else {
                        onUpdate(trimmer.id, { [field]: num });
                    }
                }
                setListeningField(null);
            });
        }
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
                    <div className="input-with-action-minimal">
                        <input
                            type="number"
                            value={localWeights.flowerWeight || ''}
                            onChange={(e) => handleWeightChange('flowerWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-minimal"
                            disabled={readOnly}
                        />
                        {!readOnly && (
                            <button
                                type="button"
                                className={`btn-icon-minimal ${listeningField === 'flowerWeight' ? 'listening' : ''}`}
                                onClick={() => handleSpeech('flowerWeight')}
                            >
                                {listeningField === 'flowerWeight' ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="output-group shake">
                    <label>Shake</label>
                    <div className="input-with-action-minimal">
                        <input
                            type="number"
                            value={localWeights.shakeWeight || ''}
                            onChange={(e) => handleWeightChange('shakeWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-minimal"
                            disabled={readOnly}
                        />
                        {!readOnly && (
                            <button
                                type="button"
                                className={`btn-icon-minimal ${listeningField === 'shakeWeight' ? 'listening' : ''}`}
                                onClick={() => handleSpeech('shakeWeight')}
                            >
                                {listeningField === 'shakeWeight' ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="output-group trim">
                    <label>Trim</label>
                    <div className="input-with-action-minimal">
                        <input
                            type="number"
                            value={localWeights.trimWeight || ''}
                            onChange={(e) => handleWeightChange('trimWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-minimal"
                            disabled={readOnly}
                        />
                        {!readOnly && (
                            <button
                                type="button"
                                className={`btn-icon-minimal ${listeningField === 'trimWeight' ? 'listening' : ''}`}
                                onClick={() => handleSpeech('trimWeight')}
                            >
                                {listeningField === 'trimWeight' ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="output-group waste">
                    <label>Waste</label>
                    <div className="input-with-action-minimal">
                        <input
                            type="number"
                            value={localWeights.wasteWeight || ''}
                            onChange={(e) => handleWeightChange('wasteWeight', Number(e.target.value))}
                            placeholder="0"
                            className="weight-input-minimal"
                            disabled={readOnly}
                        />
                        {!readOnly && (
                            <button
                                type="button"
                                className={`btn-icon-minimal ${listeningField === 'wasteWeight' ? 'listening' : ''}`}
                                onClick={() => handleSpeech('wasteWeight')}
                            >
                                {listeningField === 'wasteWeight' ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
