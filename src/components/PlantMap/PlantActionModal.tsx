import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Loader2, Calendar, Flower2, Snowflake, ArrowRightLeft } from 'lucide-react';
import type { PlantPhase, PlantGroup } from '../../types/plantMap';
import { CONTAMINANT_MAP } from '../../types/plantMap';
import type { Strain, AllocationChoice, License } from '../../types/definitions';
import { apiService } from '../../services/apiService';

export type PlantActionType = 'destroy' | 'change-phase' | 'change-room' | 'plant-health' | 'create-harvest';

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
    'create-harvest': 'Create Harvest',
};

const ALLOCATION_OPTIONS: { value: AllocationChoice; label: string; sub: string; icon: typeof Flower2 }[] = [
    { value: 'Flower', label: 'Flower', sub: 'Dry Trim', icon: Flower2 },
    { value: 'Frozen', label: 'Fresh Frozen', sub: 'Extraction', icon: Snowflake },
    { value: 'Both', label: 'Both', sub: 'Split batch', icon: ArrowRightLeft },
];

const PHASE_OPTIONS = [
    { value: 'vegetative', label: 'Vegetative' },
    { value: 'flowering', label: 'Flowering' },
    { value: 'harvested', label: 'Harvested' },
];

function addDays(date: Date, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

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

    // Change phase state — auto-select vegetative for nursery uppotting
    const [targetPhase, setTargetPhase] = useState(
        action === 'change-phase' && phase === 'nursery' ? 'vegetative' : ''
    );

    // Change room state
    const [rooms, setRooms] = useState<Array<{ id: string; name: string; room_type: string }>>([]);
    const [targetRoomId, setTargetRoomId] = useState('');

    // Harvest date state (for flowering transition)
    const [strains, setStrains] = useState<Strain[]>([]);
    const [targetHarvestDate, setTargetHarvestDate] = useState('');

    // Create harvest state
    const [licenses, setLicenses] = useState<License[]>([]);
    const [harvestLicenseId, setHarvestLicenseId] = useState('');
    const [harvestAllocation, setHarvestAllocation] = useState<AllocationChoice>('Flower');
    const [harvestDryingLocation, setHarvestDryingLocation] = useState('');
    const [harvestTargetWeight, setHarvestTargetWeight] = useState('');
    const [harvestManicureLocation, setHarvestManicureLocation] = useState('');
    const [plannedHarvestDate, setPlannedHarvestDate] = useState(() => {
        // Pre-fill from the earliest harvestDate in the selection
        if (action !== 'create-harvest') return '';
        const dates = selectedGroups
            .map(g => g.harvestDate)
            .filter((d): d is string => !!d)
            .sort();
        return dates[0] || '';
    });

    // Plant health state
    const [health, setHealth] = useState(100);
    const [selectedContaminants, setSelectedContaminants] = useState<Set<string>>(new Set());

    const totalPlants = selectedGroups.reduce((sum, g) => sum + g.totalPlants, 0);
    const [uppotCount, setUppotCount] = useState(totalPlants);
    const plantIds = selectedGroups.flatMap(g => g.plants);
    const entityType = selectedGroups[0]?.type === 'plantbatches' ? 'plantbatches' as const : 'plants' as const;

    // Unique strain names in selection
    const selectedStrainNames = useMemo(() => {
        return [...new Set(selectedGroups.map(g => g.strain))];
    }, [selectedGroups]);

    // Fetch rooms for change-room and change-phase (optional room move)
    useEffect(() => {
        if (action === 'change-room' || action === 'change-phase') {
            apiService.getRooms().then(setRooms);
        }
    }, [action]);

    // Fetch licenses for create-harvest
    useEffect(() => {
        if (action === 'create-harvest') {
            apiService.getMyLicenses().then(lics => {
                setLicenses(lics);
                if (lics.length === 1) setHarvestLicenseId(lics[0].id);
            });
        }
    }, [action]);

    // Fetch strains for flowering time lookup
    useEffect(() => {
        if (action === 'change-phase') {
            apiService.getStrains().then(setStrains);
        }
    }, [action]);

    // Auto-calculate harvest date when flowering is selected
    useEffect(() => {
        if (targetPhase !== 'flowering' || strains.length === 0) {
            if (targetPhase !== 'flowering') setTargetHarvestDate('');
            return;
        }

        // Find flowering days for selected strains (use longest if multiple)
        const floweringDays = selectedStrainNames.map(name => {
            const strain = strains.find(s => s.name.toLowerCase() === name.toLowerCase());
            return strain?.defaultFloweringDays || null;
        });

        const validDays = floweringDays.filter((d): d is number => d !== null);
        if (validDays.length > 0) {
            const maxDays = Math.max(...validDays);
            setTargetHarvestDate(addDays(new Date(), maxDays));
        } else {
            setTargetHarvestDate('');
        }
    }, [targetPhase, strains, selectedStrainNames]);

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

    // Per-strain flowering time breakdown for display
    const strainFloweringInfo = useMemo(() => {
        if (targetPhase !== 'flowering') return [];
        return selectedStrainNames.map(name => {
            const strain = strains.find(s => s.name.toLowerCase() === name.toLowerCase());
            const days = strain?.defaultFloweringDays || null;
            return {
                name,
                days,
                estDate: days ? addDays(new Date(), days) : null,
            };
        });
    }, [targetPhase, strains, selectedStrainNames]);

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
                    if (isNurseryUppot && !targetRoomId) {
                        setError('Select a veg room to move plants into.');
                        setSubmitting(false);
                        return;
                    }
                    await apiService.executePlantAction({
                        action: 'change-phase',
                        plantIds,
                        entityType,
                        targetPhase,
                        ...(targetRoomId ? { targetRoomId } : {}),
                        ...(targetPhase === 'flowering' && targetHarvestDate ? { targetHarvestDate } : {}),
                        ...(isNurseryUppot ? { uppotCount } : {}),
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

                case 'create-harvest': {
                    const selectedLicense = licenses.find(l => l.id === harvestLicenseId);
                    if (!selectedLicense) {
                        setError('Select a license.');
                        setSubmitting(false);
                        return;
                    }
                    if (harvestAllocation === 'Both' && !harvestTargetWeight) {
                        setError('Frozen target weight is required for split allocation.');
                        setSubmitting(false);
                        return;
                    }
                    // One harvest per strain group — each with its own plant IDs
                    const harvestsByStrain = selectedGroups.reduce((acc, g) => {
                        if (!acc[g.strain]) acc[g.strain] = [];
                        acc[g.strain].push(...g.plants);
                        return acc;
                    }, {} as Record<string, string[]>);

                    const results = await Promise.allSettled(
                        Object.entries(harvestsByStrain).map(([strain, ids]) =>
                            apiService.createHarvest({
                                strain,
                                licenseNumber: selectedLicense.licenseNumber,
                                allocation: harvestAllocation,
                                plantIds: ids,
                                plantCount: ids.length,
                                dryingLocation: harvestDryingLocation || undefined,
                                targetWeight: harvestTargetWeight ? Number(harvestTargetWeight) : undefined,
                                manicureLocation: harvestManicureLocation || undefined,
                                plannedHarvestDate: plannedHarvestDate || undefined,
                            })
                        )
                    );

                    const failed = results.filter(r => r.status === 'rejected');
                    if (failed.length > 0 && failed.length < results.length) {
                        setError(`${results.length - failed.length} of ${results.length} harvests created. ${failed.length} failed.`);
                        setSubmitting(false);
                        return;
                    }
                    if (failed.length === results.length) {
                        throw new Error('All harvest creations failed');
                    }
                    break;
                }
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
    const isNurseryUppot = action === 'change-phase' && phase === 'nursery';
    const phaseOptionsFiltered = isNurseryUppot
        ? [{ value: 'vegetative', label: 'Vegetative' }]
        : PHASE_OPTIONS.filter(o => o.value !== phase);

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
                        <div className="space-y-4">
                            {/* Nursery uppot info + count */}
                            {isNurseryUppot && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-gray-600 space-y-3">
                                    <div>
                                        <p className="font-medium text-gray-700 mb-1">Uppot to Vegetative</p>
                                        <p>
                                            Select how many of the {totalPlants} clone{totalPlants !== 1 ? 's' : ''} to keep. The rest will be culled.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Plants to keep</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={totalPlants}
                                            value={uppotCount}
                                            onChange={e => setUppotCount(Math.min(totalPlants, Math.max(1, Number(e.target.value) || 1)))}
                                            className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 tabular-nums text-center"
                                        />
                                        <span className="text-[11px] text-gray-400">of {totalPlants}</span>
                                    </div>
                                    {uppotCount < totalPlants && (
                                        <p className="text-[11px] text-amber-600">
                                            {totalPlants - uppotCount} clone{totalPlants - uppotCount !== 1 ? 's' : ''} will be destroyed
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Phase selector (hidden for nursery since auto-selected) */}
                            {!isNurseryUppot && (
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
                            </div>
                            )}

                            {/* Harvest date — shown when flowering selected */}
                            {targetPhase === 'flowering' && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Calendar size={14} className="text-amber-600" />
                                        <label className="text-xs font-medium text-gray-700">
                                            Est. Harvest Date
                                        </label>
                                    </div>

                                    {/* Per-strain breakdown */}
                                    {strainFloweringInfo.length > 1 && (
                                        <div className="mb-2 space-y-1">
                                            {strainFloweringInfo.map(info => (
                                                <div key={info.name} className="flex items-center justify-between text-[11px]">
                                                    <span className="text-gray-600">{info.name}</span>
                                                    {info.days ? (
                                                        <span className="text-gray-500 tabular-nums">{info.days}d → {info.estDate}</span>
                                                    ) : (
                                                        <span className="text-amber-600 italic">No flowering time set</span>
                                                    )}
                                                </div>
                                            ))}
                                            <div className="border-t border-amber-200 my-1" />
                                        </div>
                                    )}

                                    {/* Single strain info */}
                                    {strainFloweringInfo.length === 1 && !strainFloweringInfo[0].days && (
                                        <p className="text-[11px] text-amber-600 mb-2">
                                            No flowering time configured for {strainFloweringInfo[0].name}. Enter a date manually.
                                        </p>
                                    )}
                                    {strainFloweringInfo.length === 1 && strainFloweringInfo[0].days && (
                                        <p className="text-[11px] text-gray-500 mb-2">
                                            Based on {strainFloweringInfo[0].name} ({strainFloweringInfo[0].days} days)
                                        </p>
                                    )}

                                    <input
                                        type="date"
                                        value={targetHarvestDate}
                                        onChange={e => setTargetHarvestDate(e.target.value)}
                                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                </div>
                            )}

                            {/* Room move — required for nursery, optional otherwise */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    {isNurseryUppot ? 'Move to veg room' : (<>Also move to room <span className="text-gray-400 font-normal">(optional)</span></>)}
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
                                            .filter(r => !isNurseryUppot || r.room_type === 'veg')
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

                    {action === 'create-harvest' && (
                        <div>
                            {/* Strain summary */}
                            <div className="harvest-plan-summary">
                                {selectedStrainNames.length > 1 ? (
                                    <>
                                        <p className="harvest-plan-title">
                                            Creating {selectedStrainNames.length} harvests
                                        </p>
                                        {selectedStrainNames.map(name => {
                                            const count = selectedGroups
                                                .filter(g => g.strain === name)
                                                .reduce((sum, g) => sum + g.totalPlants, 0);
                                            return (
                                                <p key={name} className="harvest-plan-line">{name} — {count} plant{count !== 1 ? 's' : ''}</p>
                                            );
                                        })}
                                    </>
                                ) : (
                                    <p className="harvest-plan-title">
                                        Harvesting {selectedStrainNames[0]} — {totalPlants} plant{totalPlants !== 1 ? 's' : ''}
                                    </p>
                                )}
                                <p className="harvest-plan-room">from {roomName}</p>
                                <p className="harvest-plan-note">Plants will be reserved for this harvest plan</p>
                            </div>

                            {/* Planned harvest date */}
                            <div className="field">
                                <label className="field-label">
                                    Planned Harvest Date
                                </label>
                                <input
                                    type="date"
                                    className="field-input"
                                    value={plannedHarvestDate}
                                    onChange={e => setPlannedHarvestDate(e.target.value)}
                                />
                            </div>

                            {/* License selector */}
                            <div className="field">
                                <label className="field-label">
                                    License <span className="required">*</span>
                                </label>
                                {licenses.length === 0 ? (
                                    <div className="field-loading">
                                        <Loader2 size={14} className="animate-spin" /> Loading licenses...
                                    </div>
                                ) : (
                                    <div className="chip-group">
                                        {licenses.map(lic => (
                                            <button
                                                key={lic.id}
                                                type="button"
                                                onClick={() => setHarvestLicenseId(lic.id)}
                                                className={`ai-license-pill ${harvestLicenseId === lic.id ? 'active' : ''}`}
                                            >
                                                {lic.label || lic.licenseNumber}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Allocation picker */}
                            <div className="field">
                                <label className="field-label">
                                    Allocation <span className="required">*</span>
                                </label>
                                <div className="chip-group">
                                    {ALLOCATION_OPTIONS.map(a => {
                                        const Icon = a.icon;
                                        return (
                                            <button
                                                key={a.value}
                                                type="button"
                                                onClick={() => setHarvestAllocation(a.value)}
                                                className={`chip chip-flex ${harvestAllocation === a.value ? 'chip-active' : ''}`}
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
                            {harvestAllocation === 'Both' && (
                                <div className="field-row">
                                    <div className="field">
                                        <label className="field-label">
                                            Frozen Target Weight <span className="required">*</span>
                                        </label>
                                        <div className="field-input-wrap">
                                            <input
                                                type="number"
                                                className="field-input"
                                                value={harvestTargetWeight}
                                                onChange={e => setHarvestTargetWeight(e.target.value)}
                                                placeholder="0"
                                                min="1"
                                            />
                                            <span className="field-input-unit">g</span>
                                        </div>
                                    </div>
                                    <div className="field">
                                        <label className="field-label">
                                            Frozen Storage Location <span className="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="field-input"
                                            value={harvestManicureLocation}
                                            onChange={e => setHarvestManicureLocation(e.target.value)}
                                            placeholder="Freezer 1"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Drying location */}
                            <div className="field">
                                <label className="field-label">Drying Location</label>
                                <input
                                    type="text"
                                    className="field-input"
                                    value={harvestDryingLocation}
                                    onChange={e => setHarvestDryingLocation(e.target.value)}
                                    placeholder="Drying Room 1"
                                />
                            </div>
                        </div>
                    )}

                    {action === 'plant-health' && (
                        <div className="space-y-4">
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
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    Contaminants
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(CONTAMINANT_MAP).map(([key, { label, abbrev }]) => {
                                        const isActive = selectedContaminants.has(key);
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => toggleContaminant(key)}
                                                title={label}
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
                        ) : action === 'create-harvest' ? (
                            selectedStrainNames.length > 1
                                ? `Harvest ${selectedStrainNames.length} Strains (${totalPlants} plants)`
                                : `Harvest ${totalPlants} Plant${totalPlants !== 1 ? 's' : ''}`
                        ) : (
                            'Apply'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
