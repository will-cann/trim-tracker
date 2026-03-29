import React, { useState, useRef, useEffect } from 'react';
import { Scale, Plus, Loader2 } from 'lucide-react';
import type { Harvest, HarvestPlantWeight } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { PlantWeightList } from './PlantWeightList';

interface HarvestCenterColumnProps {
    harvest: Harvest;
    plantWeights: HarvestPlantWeight[];
    rooms: Array<{ id: string; name: string; room_type: string }>;
    onUpdate: () => void;
}

export const HarvestCenterColumn: React.FC<HarvestCenterColumnProps> = ({
    harvest,
    plantWeights,
    rooms,
    onUpdate,
}) => {
    const [mode, setMode] = useState<'plant' | 'bulk'>('plant');
    const [weightInput, setWeightInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [newestId, setNewestId] = useState<string | undefined>();
    const inputRef = useRef<HTMLInputElement>(null);

    const dryRooms = rooms.filter(r => r.room_type === 'dry' || r.room_type === 'general');

    useEffect(() => {
        if (!saving) inputRef.current?.focus();
    }, [plantWeights.length, saving]);

    const handleAddPlant = async () => {
        const val = Number(weightInput);
        if (!val || val <= 0 || saving) return;
        setSaving(true);
        try {
            const result = await apiService.recordPlantWeight(harvest.id, undefined, val);
            setNewestId(result.id);
            setWeightInput('');
            await onUpdate();
        } finally {
            setSaving(false);
            inputRef.current?.focus();
        }
    };

    const handleBulkSubmit = async () => {
        const val = Number(bulkInput);
        if (!val || val <= 0 || saving) return;
        setSaving(true);
        try {
            await apiService.recordWetWeight(harvest.id, val);
            setBulkInput('');
            await onUpdate();
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteWeight = async (id: string) => {
        await apiService.deletePlantWeight(id);
        if (newestId === id) setNewestId(undefined);
        await onUpdate();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (mode === 'plant') handleAddPlant();
            else handleBulkSubmit();
        }
    };

    const handleRoomChange = async (roomName: string) => {
        await apiService.updateHarvest(harvest.id, { dryingLocation: roomName });
        await onUpdate();
    };

    const total = harvest.totalWetWeight;
    const count = harvest.plantCount;
    const avg = count > 0 ? total / count : 0;

    return (
        <div className="hd-column hd-center">
            {/* Batch header */}
            <div className="hd-batch-header">
                <h2 className="hd-batch-id">
                    {harvest.batchId}
                    {harvest.contaminants.length > 0 && (
                        <span className="hd-contaminant-dot" title={harvest.contaminants.join(', ')} />
                    )}
                </h2>
                <div className="hd-batch-meta">
                    <span className="hd-strain-chip">{harvest.strain}</span>
                    <span className="hd-license-chip">{harvest.licenseNumber}</span>
                </div>
            </div>

            {/* Room selector — compact */}
            <div style={{ marginBottom: 'var(--space-sm)' }}>
                <select
                    className="field-input"
                    value={harvest.dryingLocation || ''}
                    onChange={e => handleRoomChange(e.target.value)}
                    style={{ fontSize: '0.8125rem', padding: '6px 10px' }}
                >
                    <option value="">Drying room...</option>
                    {dryRooms.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                </select>
            </div>

            {/* Live stats */}
            <div className="hd-live-stats">
                <div className="hd-stat">
                    <span className="hd-stat-value">{count}</span>
                    <span className="hd-stat-label">plants</span>
                </div>
                <div className="hd-stat">
                    <span className="hd-stat-value">{total.toFixed(0)}g</span>
                    <span className="hd-stat-label">wet</span>
                </div>
                {count > 0 && (
                    <div className="hd-stat">
                        <span className="hd-stat-value">{avg.toFixed(0)}g</span>
                        <span className="hd-stat-label">avg</span>
                    </div>
                )}
                {saving && (
                    <span className="hd-saving">
                        <span className="hd-saving-dot" />
                        saving
                    </span>
                )}
            </div>

            {/* Mode toggle */}
            <div className="hd-mode-toggle">
                <button
                    className={`chip ${mode === 'plant' ? 'chip-active' : ''}`}
                    onClick={() => setMode('plant')}
                >
                    Per Plant
                </button>
                <button
                    className={`chip ${mode === 'bulk' ? 'chip-active' : ''}`}
                    onClick={() => setMode('bulk')}
                >
                    Bulk
                </button>
            </div>

            {/* Weight entry */}
            {mode === 'plant' ? (
                <div className="hd-weight-entry">
                    <div className="hd-weight-input-row">
                        <div className="hd-weight-input-wrap">
                            <Scale size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            <input
                                ref={inputRef}
                                type="number"
                                className="hd-weight-input"
                                value={weightInput}
                                onChange={e => setWeightInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                                min="1"
                                autoFocus
                                disabled={saving}
                            />
                            <span className="hd-weight-unit">g</span>
                        </div>
                        <button
                            className="btn-start-batch"
                            onClick={handleAddPlant}
                            disabled={!weightInput || Number(weightInput) <= 0 || saving}
                            style={{ padding: '12px 20px', fontSize: '0.9375rem' }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Add
                        </button>
                    </div>
                    <PlantWeightList
                        weights={plantWeights}
                        onDelete={handleDeleteWeight}
                        newestId={newestId}
                    />
                </div>
            ) : (
                <div className="hd-weight-entry">
                    <div className="hd-weight-input-row">
                        <div className="hd-weight-input-wrap">
                            <Scale size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            <input
                                type="number"
                                className="hd-weight-input"
                                value={bulkInput}
                                onChange={e => setBulkInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Total wet weight"
                                min="1"
                                disabled={saving}
                            />
                            <span className="hd-weight-unit">g</span>
                        </div>
                        <button
                            className="btn-start-batch"
                            onClick={handleBulkSubmit}
                            disabled={!bulkInput || Number(bulkInput) <= 0 || saving}
                            style={{ padding: '12px 20px', fontSize: '0.9375rem' }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                            Save
                        </button>
                    </div>
                    {total > 0 && (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
                            Current total: {total.toFixed(0)}g
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
