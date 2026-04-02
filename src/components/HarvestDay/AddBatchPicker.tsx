import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, Leaf, CheckSquare, Square, MapPin, Calendar } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { FloweringBatchGroup, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface AddBatchPickerProps {
    onClose: () => void;
    onSubmit: (data: CreateHarvestDTO) => void;
}

export const AddBatchPicker: React.FC<AddBatchPickerProps> = ({ onClose, onSubmit }) => {
    const [groups, setGroups] = useState<FloweringBatchGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
    const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
    const [selectedBatch, setSelectedBatch] = useState<FloweringBatchGroup | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [licenses, setLicenses] = useState<Array<{ id: string; licenseNumber: string; label?: string }>>([]);
    const [licenseId, setLicenseId] = useState('');

    useEffect(() => {
        Promise.all([
            apiService.getFloweringPlants().then(setGroups),
            apiService.getAllLicenses().then(lics => {
                setLicenses(lics);
                if (lics.length === 1) setLicenseId(lics[0].id);
            }),
        ]).finally(() => setLoading(false));
    }, []);

    const getGroupKey = (group: FloweringBatchGroup) => `${group.strainName}::${group.roomId}`;

    const handleExpandBatch = (group: FloweringBatchGroup) => {
        const key = getGroupKey(group);
        if (expandedBatchId === key) {
            setExpandedBatchId(null);
            return;
        }
        setExpandedBatchId(key);
        // Auto-select all plants in this batch
        const ids = new Set(group.plants.map(p => p.id));
        setSelectedPlantIds(ids);
        setSelectedBatch(group);
    };

    const togglePlant = (plantId: string) => {
        setSelectedPlantIds(prev => {
            const next = new Set(prev);
            if (next.has(plantId)) next.delete(plantId);
            else next.add(plantId);
            return next;
        });
    };

    const toggleAll = (group: FloweringBatchGroup) => {
        const allIds = group.plants.map(p => p.id);
        const allSelected = allIds.every(id => selectedPlantIds.has(id));
        if (allSelected) {
            setSelectedPlantIds(new Set());
        } else {
            setSelectedPlantIds(new Set(allIds));
        }
    };

    const handleSubmit = async () => {
        if (!selectedBatch || selectedPlantIds.size === 0) return;

        const selectedLicense = licenses.find(l => l.id === licenseId);

        setSubmitting(true);
        try {
            onSubmit({
                strain: selectedBatch.strainName,
                licenseNumber: selectedLicense?.licenseNumber || '',
                allocation: 'Flower', // Default — user changes in cockpit
                plantIds: Array.from(selectedPlantIds),
                sourceBatchId: selectedBatch.batchId || undefined,
                plantCount: selectedPlantIds.size,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const isReady = (group: FloweringBatchGroup) => {
        if (!group.targetHarvestDate) return false;
        return new Date(group.targetHarvestDate) <= new Date();
    };

    const canSubmit = selectedBatch && selectedPlantIds.size > 0;

    return (
        <Modal
            title="Harvest Plants"
            contentClassName="creation-modal"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                    >
                        {submitting && <Loader2 size={16} className="animate-spin" style={{ marginRight: 4 }} />}
                        Create Harvest ({selectedPlantIds.size} plant{selectedPlantIds.size !== 1 ? 's' : ''})
                    </Button>
                </>
            }
        >
            {loading ? (
                <CenteredSpinner label="Loading flowering plants…" height="py-12" />
            ) : groups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0', color: 'var(--text-secondary)' }}>
                    <Leaf size={32} style={{ color: 'var(--color-dolphin)', marginBottom: 'var(--space-sm)' }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No flowering plants</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
                        Move plants to flowering in the Plant Map first.
                    </p>
                </div>
            ) : (
                <>
                    {/* License selector */}
                    <div className="field" style={{ marginBottom: 'var(--space-md)' }}>
                        <label className="field-label">License <span className="required">*</span></label>
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

                    <div className="field-divider" />

                    {/* Batch list */}
                    <div className="hd-picker-list">
                        {groups.map(group => {
                            const expanded = expandedBatchId === getGroupKey(group);
                            const ready = isReady(group);
                            const allSelected = expanded && group.plants.every(p => selectedPlantIds.has(p.id));

                            return (
                                <div key={getGroupKey(group)} className="hd-picker-batch">
                                    <div
                                        className={`hd-picker-batch-header ${expanded ? 'hd-picker-expanded' : ''}`}
                                        onClick={() => handleExpandBatch(group)}
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

                                    {expanded && (
                                        <div className="hd-picker-plants">
                                            {/* Select all toggle */}
                                            <label className="hd-picker-plant hd-picker-select-all" onClick={() => toggleAll(group)}>
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
                                                        {plant.contaminants.length > 0 && (
                                                            <span className="hd-contaminant-dot" title={plant.contaminants.join(', ')} />
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
                </>
            )}
        </Modal>
    );
};
