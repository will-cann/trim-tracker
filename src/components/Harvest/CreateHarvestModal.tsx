import React, { useState, useEffect } from 'react';
import { Flower2, Snowflake, ArrowRightLeft, ChevronRight, MapPin, Calendar, CheckSquare, Square, Sprout } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { AllocationChoice, CreateHarvestDTO, Strain, License, FloweringBatchGroup } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface CreateHarvestModalProps {
    onClose: () => void;
    onSubmit: (data: CreateHarvestDTO) => void;
}

const ALLOCATIONS: { value: AllocationChoice; label: string; sub: string; icon: typeof Flower2 }[] = [
    { value: 'Flower', label: 'Flower', sub: 'Dry Trim', icon: Flower2 },
    { value: 'Frozen', label: 'Fresh Frozen', sub: 'Extraction', icon: Snowflake },
    { value: 'Both', label: 'Both', sub: 'Split batch', icon: ArrowRightLeft },
];

export const CreateHarvestModal: React.FC<CreateHarvestModalProps> = ({ onClose, onSubmit }) => {
    const [strainId, setStrainId] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [name, setName] = useState('');
    const [plantCount, setPlantCount] = useState('');
    const [dryingLocation, setDryingLocation] = useState('');
    const [allocation, setAllocation] = useState<AllocationChoice>('Flower');
    const [targetWeight, setTargetWeight] = useState('');
    const [manicureLocation, setManicureLocation] = useState('');
    const [plannedHarvestDate, setPlannedHarvestDate] = useState('');

    const [strains, setStrains] = useState<Strain[]>([]);
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);

    // Flowering batch picker state
    const [floweringGroups, setFloweringGroups] = useState<FloweringBatchGroup[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);
    const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
    const [selectedBatch, setSelectedBatch] = useState<FloweringBatchGroup | null>(null);

    useEffect(() => {
        Promise.all([
            apiService.getStrains().then(setStrains),
            apiService.getMyLicenses().then(setLicenses),
            apiService.getFloweringPlants().then(setFloweringGroups),
        ]).finally(() => setLoading(false));
    }, []);

    const selectedStrain = strains.find(s => s.id === strainId);
    const selectedLicense = licenses.find(l => l.id === licenseId);
    const hasSourcePlants = selectedBatch !== null && selectedPlantIds.size > 0;
    const hasFloweringPlants = floweringGroups.length > 0;
    // When flowering plants exist, plant selection is mandatory for traceability
    const strainResolved = hasSourcePlants || (!hasFloweringPlants && strainId);
    const canSubmit = strainResolved && licenseId && (allocation !== 'Both' || targetWeight);

    const getGroupKey = (group: FloweringBatchGroup) => `${group.strainName}::${group.roomId}`;

    const handleSelectBatch = (group: FloweringBatchGroup) => {
        const key = getGroupKey(group);
        // Expand/collapse the plant list
        if (expandedBatchKey === key) {
            setExpandedBatchKey(null);
            return;
        }
        setExpandedBatchKey(key);
        // Auto-select all plants and set strain
        setSelectedPlantIds(new Set(group.plants.map(p => p.id)));
        setSelectedBatch(group);
        // Auto-fill strain dropdown
        const matchingStrain = strains.find(s => s.name.toLowerCase() === group.strainName.toLowerCase());
        if (matchingStrain) setStrainId(matchingStrain.id);
        setPlantCount(String(group.plants.length));
        // Pre-fill harvest date from batch target
        if (group.targetHarvestDate) {
            setPlannedHarvestDate(group.targetHarvestDate.split('T')[0]);
        }
    };

    const togglePlant = (plantId: string) => {
        setSelectedPlantIds(prev => {
            const next = new Set(prev);
            if (next.has(plantId)) next.delete(plantId);
            else next.add(plantId);
            return next;
        });
    };

    const toggleAllPlants = (group: FloweringBatchGroup) => {
        const allIds = group.plants.map(p => p.id);
        const allSelected = allIds.every(id => selectedPlantIds.has(id));
        if (allSelected) {
            setSelectedPlantIds(new Set());
        } else {
            setSelectedPlantIds(new Set(allIds));
        }
    };


    const isReady = (group: FloweringBatchGroup) => {
        if (!group.targetHarvestDate) return false;
        return new Date(group.targetHarvestDate) <= new Date();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || !selectedLicense) return;

        const resolvedStrain = hasSourcePlants
            ? selectedBatch!.strainName
            : selectedStrain?.name;

        if (!resolvedStrain) return;

        onSubmit({
            strain: resolvedStrain,
            licenseNumber: selectedLicense.licenseNumber,
            allocation,
            name: name || undefined,
            plantCount: hasSourcePlants ? selectedPlantIds.size : (plantCount ? Number(plantCount) : undefined),
            dryingLocation: dryingLocation || undefined,
            targetWeight: targetWeight ? Number(targetWeight) : undefined,
            manicureLocation: manicureLocation || undefined,
            plantIds: hasSourcePlants ? Array.from(selectedPlantIds) : undefined,
            sourceBatchId: hasSourcePlants ? (selectedBatch!.batchId || undefined) : undefined,
            plannedHarvestDate: plannedHarvestDate || undefined,
        });
    };

    return (
        <Modal title="New Harvest" contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="create-harvest-form" disabled={!canSubmit}>
                    {hasSourcePlants
                        ? `Harvest ${selectedPlantIds.size} Plant${selectedPlantIds.size !== 1 ? 's' : ''}`
                        : 'Create Harvest'
                    }
                </Button>
            </>
        }>
            {loading ? (
                <CenteredSpinner label="Loading harvest data…" height="py-12" />
            ) : (
                <form id="create-harvest-form" onSubmit={handleSubmit}>

                    {/* Source plants — required when flowering plants exist */}
                    {floweringGroups.length > 0 && (
                        <>
                            {hasSourcePlants && !pickerOpen ? (
                                /* Compact selected-state pill */
                                <div className="source-plants-pill">
                                    <Sprout size={14} />
                                    <div className="source-plants-pill-info">
                                        <span className="source-plants-pill-strain">{selectedBatch!.strainName}</span>
                                        <span className="source-plants-pill-meta">
                                            {selectedPlantIds.size} plant{selectedPlantIds.size !== 1 ? 's' : ''} from {selectedBatch!.roomName}
                                        </span>
                                    </div>
                                    <div className="source-plants-pill-actions">
                                        <button type="button" onClick={() => setPickerOpen(true)} className="source-plants-pill-edit">
                                            Edit
                                        </button>
                                    </div>
                                </div>
                            ) : !hasSourcePlants && !pickerOpen ? (
                                /* Required selection prompt */
                                <button
                                    type="button"
                                    className="source-plants-toggle source-plants-toggle--required"
                                    onClick={() => setPickerOpen(true)}
                                >
                                    <Sprout size={14} />
                                    <span>Select plants to harvest <span className="required">*</span></span>
                                    <span className="source-plants-toggle-count">{floweringGroups.reduce((s, g) => s + g.plants.length, 0)} available</span>
                                    <ChevronRight size={14} className="source-plants-toggle-chevron" />
                                </button>
                            ) : (
                                /* Expanded picker */
                                <div className="field">
                                    <div className="source-plants-header">
                                        <label className="field-label" style={{ margin: 0 }}>Source Plants</label>
                                        <button
                                            type="button"
                                            className="source-plants-done"
                                            onClick={() => setPickerOpen(false)}
                                        >
                                            {hasSourcePlants ? 'Done' : 'Cancel'}
                                        </button>
                                    </div>
                                    <div className="hd-picker-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                        {floweringGroups.map(group => {
                                            const key = getGroupKey(group);
                                            const expanded = expandedBatchKey === key;
                                            const ready = isReady(group);
                                            const isSelectedBatch = selectedBatch && getGroupKey(selectedBatch) === key;
                                            const allSelected = isSelectedBatch && group.plants.every(p => selectedPlantIds.has(p.id));

                                            return (
                                                <div key={key} className="hd-picker-batch">
                                                    <div
                                                        className={`hd-picker-batch-header ${expanded ? 'hd-picker-expanded' : ''}`}
                                                        onClick={() => handleSelectBatch(group)}
                                                    >
                                                        <div className="hd-picker-batch-info">
                                                            <span className="hd-picker-strain">{group.strainName}</span>
                                                            <span className="hd-picker-detail">
                                                                <MapPin size={12} />
                                                                {group.roomName}
                                                            </span>
                                                            <span className="hd-picker-detail">
                                                                {group.plants.length} plant{group.plants.length !== 1 ? 's' : ''}
                                                            </span>
                                                            {group.plants.some(p => p.harvestId) && (
                                                                <span className="hd-picker-detail" style={{ color: 'var(--warning-color)', fontWeight: 600 }}>
                                                                    {group.plants.filter(p => p.harvestId).length} planned
                                                                </span>
                                                            )}
                                                            {group.targetHarvestDate && (
                                                                <span className={`hd-picker-detail ${ready ? 'hd-picker-ready' : ''}`}>
                                                                    <Calendar size={12} />
                                                                    {new Date(group.targetHarvestDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                    {ready && ' \u2014 Ready'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <ChevronRight
                                                            size={16}
                                                            style={{
                                                                color: 'var(--text-secondary)',
                                                                transition: 'transform 0.2s',
                                                                transform: expanded ? 'rotate(90deg)' : 'none',
                                                            }}
                                                        />
                                                    </div>

                                                    {expanded && isSelectedBatch && (
                                                        <div className="hd-picker-plants">
                                                            <label className="hd-picker-plant hd-picker-select-all" onClick={() => toggleAllPlants(group)}>
                                                                {allSelected
                                                                    ? <CheckSquare size={16} style={{ color: 'var(--primary-color)' }} />
                                                                    : <Square size={16} style={{ color: 'var(--text-secondary)' }} />
                                                                }
                                                                <span style={{ fontWeight: 600 }}>Select all ({group.plants.length})</span>
                                                            </label>
                                                            {group.plants.map(plant => {
                                                                const selected = selectedPlantIds.has(plant.id);
                                                                return (
                                                                    <label
                                                                        key={plant.id}
                                                                        className={`hd-picker-plant ${selected ? 'hd-picker-plant-selected' : ''}`}
                                                                        onClick={() => togglePlant(plant.id)}
                                                                    >
                                                                        {selected
                                                                            ? <CheckSquare size={16} style={{ color: 'var(--primary-color)' }} />
                                                                            : <Square size={16} style={{ color: 'var(--color-dolphin)' }} />
                                                                        }
                                                                        <span className="hd-picker-plant-label">{plant.label}</span>
                                                                        {plant.harvestId && (
                                                                            <span className="hd-picker-plant-planned">Planned</span>
                                                                        )}
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Consequence line */}
                            {hasSourcePlants ? (
                                <p className="source-plants-consequence">
                                    {selectedPlantIds.size} plant{selectedPlantIds.size !== 1 ? 's' : ''} will be linked to this harvest for traceability
                                </p>
                            ) : (
                                <p className="source-plants-consequence" style={{ color: '#DF5B59' }}>
                                    Plant selection is required for harvest traceability
                                </p>
                            )}

                            <div className="field-divider" />
                        </>
                    )}

                    {/* Core info */}
                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">
                                Strain {!hasSourcePlants && <span className="required">*</span>}
                            </label>
                            <select
                                className="field-input"
                                value={strainId}
                                onChange={e => setStrainId(e.target.value)}
                                required={!hasSourcePlants}
                                disabled={hasSourcePlants}
                            >
                                <option value="">{hasSourcePlants ? selectedBatch!.strainName : 'Select strain'}</option>
                                {strains.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Batch ID</label>
                            <input
                                type="text"
                                className="field-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Auto-generated"
                            />
                        </div>
                    </div>

                    {/* License chips */}
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

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Plant Count</label>
                            <input
                                type="number"
                                className="field-input"
                                value={hasSourcePlants ? selectedPlantIds.size : plantCount}
                                onChange={e => setPlantCount(e.target.value)}
                                placeholder="0"
                                min="0"
                                disabled={hasSourcePlants}
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Planned Harvest Date</label>
                            <input
                                type="date"
                                className="field-input"
                                value={plannedHarvestDate}
                                onChange={e => setPlannedHarvestDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="field">
                        <label className="field-label">Drying Location</label>
                        <input
                            type="text"
                            className="field-input"
                            value={dryingLocation}
                            onChange={e => setDryingLocation(e.target.value)}
                            placeholder="Drying Room 1"
                        />
                    </div>

                    <div className="field-divider" />

                    {/* Allocation picker */}
                    <div className="field">
                        <label className="field-label">
                            Allocation <span className="required">*</span>
                        </label>
                        <div className="chip-group">
                            {ALLOCATIONS.map(a => {
                                const Icon = a.icon;
                                return (
                                    <button
                                        key={a.value}
                                        type="button"
                                        onClick={() => setAllocation(a.value)}
                                        className={`chip chip-flex ${allocation === a.value ? 'chip-active' : ''}`}
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
                    {allocation === 'Both' && (
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">
                                    Frozen Target Weight <span className="required">*</span>
                                </label>
                                <div className="field-input-wrap">
                                    <input
                                        type="number"
                                        className="field-input"
                                        value={targetWeight}
                                        onChange={e => setTargetWeight(e.target.value)}
                                        placeholder="0"
                                        min="1"
                                        required
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
                                    value={manicureLocation}
                                    onChange={e => setManicureLocation(e.target.value)}
                                    placeholder="Freezer 1"
                                    required
                                />
                            </div>
                        </div>
                    )}
                </form>
            )}
        </Modal>
    );
};
