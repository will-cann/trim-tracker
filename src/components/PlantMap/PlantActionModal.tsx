import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import type { PlantPhase, PlantGroup } from '../../types/plantMap';
import { CONTAMINANT_ABBREVS } from '../../types/plantMap';
import { apiService } from '../../services/apiService';

export type PlantActionType = 'destroy' | 'change-phase' | 'change-room' | 'plant-health';

interface PlantActionModalProps {
    action: PlantActionType;
    phase: PlantPhase;
    phaseLabel: string;
    roomName: string;
    selectedGroups: Array<PlantGroup & { id: string }>;
    onClose: () => void;
    onSuccess: () => void;
}

const ACTION_TITLES: Record<PlantActionType, string> = {
    'destroy': 'Destroy Plants',
    'change-phase': 'Change Growth Phase',
    'change-room': 'Change Room',
    'plant-health': 'Plant Health Report',
};

const PHASE_OPTIONS = [
    { value: 'vegetative', label: 'Vegetative' },
    { value: 'flowering', label: 'Flowering' },
    { value: 'harvested', label: 'Harvested' },
];

export const PlantActionModal: React.FC<PlantActionModalProps> = ({
    action,
    phase,
    phaseLabel,
    roomName,
    selectedGroups,
    onClose,
    onSuccess,
}) => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Change phase state
    const [targetPhase, setTargetPhase] = useState('');

    // Change room state
    const [rooms, setRooms] = useState<Array<{ id: string; name: string; room_type: string }>>([]);
    const [targetRoomId, setTargetRoomId] = useState('');

    // Plant health state
    const [health, setHealth] = useState(100);
    const [selectedContaminants, setSelectedContaminants] = useState<Set<string>>(new Set());

    const totalPlants = selectedGroups.reduce((sum, g) => sum + g.totalPlants, 0);
    const plantIds = selectedGroups.flatMap(g => g.plants);
    const entityType = selectedGroups[0]?.type === 'plantbatches' ? 'plantbatches' as const : 'plants' as const;

    // Fetch rooms for change-room and change-phase (optional room move)
    useEffect(() => {
        if (action === 'change-room' || action === 'change-phase') {
            apiService.getRooms().then(setRooms);
        }
    }, [action]);

    // Pre-fill health from selected groups average
    useEffect(() => {
        if (action === 'plant-health' && selectedGroups.length > 0) {
            const avgHealth = Math.round(
                selectedGroups.reduce((sum, g) => sum + g.plantHealth * g.totalPlants, 0) / totalPlants
            );
            setHealth(avgHealth);
            const contams = new Set<string>();
            selectedGroups.forEach(g => g.contamination.forEach(c => contams.add(c)));
            setSelectedContaminants(contams);
        }
    }, [action, selectedGroups, totalPlants]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            switch (action) {
                case 'destroy':
                    await apiService.executePlantAction({
                        action: 'destroy',
                        plantIds,
                        entityType,
                    });
                    break;

                case 'change-phase':
                    if (!targetPhase) {
                        setError('Select a target phase.');
                        setSubmitting(false);
                        return;
                    }
                    await apiService.executePlantAction({
                        action: 'change-phase',
                        plantIds,
                        entityType,
                        targetPhase,
                        ...(targetRoomId ? { targetRoomId } : {}),
                    });
                    break;

                case 'change-room':
                    if (!targetRoomId) {
                        setError('Select a target room.');
                        setSubmitting(false);
                        return;
                    }
                    await apiService.executePlantAction({
                        action: 'change-room',
                        plantIds,
                        entityType,
                        targetRoomId,
                    });
                    break;

                case 'plant-health':
                    await apiService.executePlantAction({
                        action: 'plant-health',
                        plantIds,
                        entityType,
                        health,
                        contaminants: [...selectedContaminants],
                    });
                    break;
            }

            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleContaminant = (name: string) => {
        setSelectedContaminants(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const isDestructive = action === 'destroy';
    const phaseOptionsFiltered = PHASE_OPTIONS.filter(o => o.value !== phase);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-content ${isDestructive ? 'delete-modal' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        {isDestructive && (
                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                                <AlertTriangle size={16} className="text-red-500" />
                            </div>
                        )}
                        <h3 className="text-base font-semibold text-gray-900">
                            {ACTION_TITLES[action]}
                        </h3>
                    </div>
                    <button onClick={onClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-gray-50 px-4 py-3 mb-4 text-xs text-gray-600">
                    <span className="font-semibold text-gray-900">{totalPlants} plant{totalPlants !== 1 ? 's' : ''}</span>
                    {' '}from{' '}
                    <span className="font-semibold text-gray-900">{selectedGroups.length} strain group{selectedGroups.length !== 1 ? 's' : ''}</span>
                    {' '}in{' '}
                    <span className="font-medium">{roomName}</span>
                    {' '}({phaseLabel})
                </div>

                {/* Action-specific content */}
                <div className="modal-body">
                    {action === 'destroy' && (
                        <div className="text-sm text-gray-600">
                            <p className="mb-2">
                                This will permanently mark <strong>{totalPlants} plant{totalPlants !== 1 ? 's' : ''}</strong> as destroyed.
                            </p>
                            <p className="text-xs text-gray-400">
                                {entityType === 'plantbatches'
                                    ? 'Plant batches will be deleted from the system.'
                                    : 'Plants will be moved to destroyed status with today\'s date.'}
                            </p>
                        </div>
                    )}

                    {action === 'change-phase' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                                Move to Phase
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                    {phaseOptionsFiltered.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setTargetPhase(opt.value)}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                                targetPhase === opt.value
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                            {/* Optional room move */}
                            <div className="mt-4">
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    Also move to room <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                {rooms.length === 0 ? (
                                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        Loading rooms...
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-auto">
                                        {rooms
                                            .filter(r => r.name !== roomName)
                                            .map(r => (
                                                <button
                                                    key={r.id}
                                                    onClick={() => setTargetRoomId(prev => prev === r.id ? '' : r.id)}
                                                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                                                        targetRoomId === r.id
                                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                                    }`}
                                                >
                                                    <div>{r.name}</div>
                                                    <div className="text-[10px] text-gray-400 capitalize">{r.room_type}</div>
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {action === 'change-room' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                                Move to Room
                            </label>
                            {rooms.length === 0 ? (
                                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Loading rooms...
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                                    {rooms
                                        .filter(r => r.name !== roomName)
                                        .map(r => (
                                            <button
                                                key={r.id}
                                                onClick={() => setTargetRoomId(r.id)}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                                                    targetRoomId === r.id
                                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                                }`}
                                            >
                                                <div>{r.name}</div>
                                                <div className="text-[10px] text-gray-400 capitalize">{r.room_type}</div>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}

                    {action === 'plant-health' && (
                        <div className="space-y-4">
                            {/* Health slider */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-gray-700">Health Score</label>
                                    <span className="text-sm font-semibold tabular-nums text-gray-900">{health}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={health}
                                    onChange={e => setHealth(Number(e.target.value))}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                    <span>Critical</span>
                                    <span>Perfect</span>
                                </div>
                            </div>

                            {/* Contaminants */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    Contaminants
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(CONTAMINANT_ABBREVS).map(([name, abbrev]) => {
                                        const isActive = selectedContaminants.has(name);
                                        return (
                                            <button
                                                key={name}
                                                onClick={() => toggleContaminant(name)}
                                                title={name}
                                                className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                                                    isActive
                                                        ? 'border-red-300 bg-red-50 text-red-700'
                                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                                }`}
                                            >
                                                {abbrev}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <p className="text-xs text-red-500 mt-3">{error}</p>
                )}

                {/* Actions */}
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-cancel">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={isDestructive ? 'btn-delete-confirm' : 'btn-primary'}
                    >
                        {submitting ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : isDestructive ? (
                            `Destroy ${totalPlants} Plant${totalPlants !== 1 ? 's' : ''}`
                        ) : (
                            'Apply'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
