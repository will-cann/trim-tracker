import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Minus, AlertCircle } from 'lucide-react';
import type { PlantPhase, Room } from '../../types/plantMap';
import type { Strain } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { Modal, Button } from '../ui';

interface CreatePlantingModalProps {
    activePhase: PlantPhase;
    onClose: () => void;
    onSuccess: () => void;
}

type Mode = 'batch' | 'plant';

const BATCH_TYPES = [
    { value: 'clone', label: 'Clone' },
    { value: 'seed', label: 'Seed' },
    { value: 'tissue_culture', label: 'Tissue Culture' },
] as const;

export const CreatePlantingModal: React.FC<CreatePlantingModalProps> = ({
    activePhase,
    onClose,
    onSuccess,
}) => {
    const defaultMode: Mode = activePhase === 'nursery' ? 'batch' : 'plant';
    const [mode, setMode] = useState<Mode>(defaultMode);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Shared state
    const [strains, setStrains] = useState<Strain[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [strainId, setStrainId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [plantedDate, setPlantedDate] = useState(new Date().toISOString().slice(0, 10));

    // Batch state
    const [batchName, setBatchName] = useState('');
    const [batchType, setBatchType] = useState<'clone' | 'seed' | 'tissue_culture'>('clone');
    const [batchCount, setBatchCount] = useState(10);

    // Plant state
    const [labelPrefix, setLabelPrefix] = useState('');
    const [plantCount, setPlantCount] = useState(1);
    const [growthPhase, setGrowthPhase] = useState<'vegetative' | 'flowering'>(
        activePhase === 'flowering' ? 'flowering' : 'vegetative'
    );

    useEffect(() => {
        apiService.getStrains().then(setStrains);
        apiService.getRooms().then(r => setRooms(r as Room[]));
    }, []);

    // Auto-generate batch name
    useEffect(() => {
        if (mode === 'batch' && strainId) {
            const strain = strains.find(s => s.id === strainId);
            if (strain) {
                const typeLabel = batchType === 'tissue_culture' ? 'TC' : batchType.charAt(0).toUpperCase() + batchType.slice(1);
                setBatchName(`${strain.name}-${typeLabel}-${plantedDate}`);
            }
        }
    }, [strainId, batchType, plantedDate, mode, strains]);

    // Auto-set label prefix
    useEffect(() => {
        if (mode === 'plant' && strainId) {
            const strain = strains.find(s => s.id === strainId);
            if (strain) {
                const abbrev = strain.name.replace(/\s+/g, '').slice(0, 6).toUpperCase();
                const phaseChar = growthPhase === 'flowering' ? 'F' : 'V';
                setLabelPrefix(`${abbrev}-${phaseChar}`);
            }
        }
    }, [strainId, growthPhase, mode, strains]);

    const selectedStrain = strains.find(s => s.id === strainId);

    const filteredRooms = rooms.filter(r => {
        if (mode === 'batch') return r.roomType === 'nursery' || r.roomType === 'general';
        if (growthPhase === 'vegetative') return r.roomType === 'veg' || r.roomType === 'general';
        if (growthPhase === 'flowering') return r.roomType === 'flower' || r.roomType === 'general';
        return true;
    });

    const displayRooms = filteredRooms.length > 0 ? filteredRooms : rooms;

    const plantLabels = Array.from({ length: plantCount }, (_, i) =>
        `${labelPrefix}-${String(i + 1).padStart(3, '0')}`
    );

    const canSubmit = () => {
        if (!strainId || !roomId) return false;
        if (mode === 'batch') return batchName.trim().length > 0 && batchCount > 0;
        if (mode === 'plant') return labelPrefix.trim().length > 0 && plantCount > 0;
        return false;
    };

    const handleSubmit = async () => {
        if (!canSubmit() || !selectedStrain) return;
        setSubmitting(true);
        setError(null);
        try {
            if (mode === 'batch') {
                await apiService.createPlanting({
                    type: 'batch',
                    name: batchName.trim(),
                    batchType,
                    strainId,
                    strainName: selectedStrain.name,
                    roomId,
                    untrackedCount: batchCount,
                    plantedDate,
                });
            } else {
                await apiService.createPlanting({
                    type: 'plant',
                    plants: plantLabels.map(label => ({
                        label,
                        strainId,
                        strainName: selectedStrain.name,
                        roomId,
                    })),
                    growthPhase,
                    plantedDate,
                });
            }
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to create planting');
        } finally {
            setSubmitting(false);
        }
    };

    const submitLabel = submitting
        ? 'Creating...'
        : mode === 'batch'
            ? `Create Batch (${batchCount})`
            : `Create ${plantCount} Plant${plantCount !== 1 ? 's' : ''}`;

    return (
        <Modal title="New Planting" contentClassName="creation-modal" onClose={onClose} footer={
            <>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleSubmit} disabled={submitting || !canSubmit()}>
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : submitLabel}
                </Button>
            </>
        }>
            {/* Mode toggle */}
            <div className="field">
                <div className="toggle-group">
                    <button
                        type="button"
                        onClick={() => setMode('batch')}
                        className={`toggle-option ${mode === 'batch' ? 'toggle-active' : ''}`}
                    >
                        Plant Batch
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('plant')}
                        className={`toggle-option ${mode === 'plant' ? 'toggle-active' : ''}`}
                    >
                        Individual Plants
                    </button>
                </div>
                <p className="field-hint">
                    {mode === 'batch'
                        ? 'Untracked group for nursery and immature plants'
                        : 'Individually labeled plants for veg or flower rooms'}
                </p>
            </div>

            {/* Strain */}
            <div className="field">
                <label className="field-label">
                    Strain <span className="required">*</span>
                </label>
                {strains.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading...
                    </div>
                ) : (
                    <select
                        className="field-input"
                        value={strainId}
                        onChange={e => setStrainId(e.target.value)}
                    >
                        <option value="">Select a strain</option>
                        {strains.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                )}
            </div>

            {/* Room */}
            <div className="field">
                <label className="field-label">
                    Room <span className="required">*</span>
                </label>
                {rooms.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading...
                    </div>
                ) : (
                    <>
                        {filteredRooms.length === 0 && rooms.length > 0 && (
                            <p className="field-hint" style={{ marginBottom: 6, marginTop: 0 }}>
                                No matching rooms for this phase. Showing all:
                            </p>
                        )}
                        <div className="room-grid">
                            {displayRooms.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setRoomId(r.id)}
                                    className={`chip ${roomId === r.id ? 'chip-active' : ''}`}
                                >
                                    {r.name}
                                    <span className="chip-sub">{r.roomType}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Date */}
            <div className="field">
                <label className="field-label">Planted Date</label>
                <input
                    type="date"
                    className="field-input"
                    value={plantedDate}
                    onChange={e => setPlantedDate(e.target.value)}
                />
            </div>

            <div className="field-divider" />

            {/* ── Batch fields ── */}
            {mode === 'batch' && (
                <>
                    <div className="field">
                        <label className="field-label">Batch Type</label>
                        <div className="chip-group">
                            {BATCH_TYPES.map(bt => (
                                <button
                                    key={bt.value}
                                    type="button"
                                    onClick={() => setBatchType(bt.value)}
                                    className={`chip chip-flex ${batchType === bt.value ? 'chip-active' : ''}`}
                                >
                                    {bt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field">
                        <label className="field-label">Batch Name</label>
                        <input
                            type="text"
                            className="field-input"
                            value={batchName}
                            onChange={e => setBatchName(e.target.value)}
                            placeholder="Auto-generated from strain"
                        />
                    </div>

                    <div className="field">
                        <label className="field-label">Plant Count</label>
                        <div className="stepper">
                            <button type="button" className="stepper-btn" onClick={() => setBatchCount(c => Math.max(1, c - 10))}>
                                <Minus size={14} />
                            </button>
                            <input
                                type="number"
                                className="stepper-input"
                                min={1}
                                value={batchCount}
                                onChange={e => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            <button type="button" className="stepper-btn" onClick={() => setBatchCount(c => c + 10)}>
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Plant fields ── */}
            {mode === 'plant' && (
                <>
                    <div className="field">
                        <label className="field-label">Growth Phase</label>
                        <div className="toggle-group" style={{ maxWidth: 260 }}>
                            {(['vegetative', 'flowering'] as const).map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setGrowthPhase(p)}
                                    className={`toggle-option ${growthPhase === p ? 'toggle-active' : ''}`}
                                    style={{ textTransform: 'capitalize' }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Label Prefix</label>
                            <input
                                type="text"
                                className="field-input"
                                value={labelPrefix}
                                onChange={e => setLabelPrefix(e.target.value)}
                                placeholder="GG4-V"
                            />
                        </div>
                        <div className="field">
                            <label className="field-label">Count</label>
                            <div className="stepper">
                                <button type="button" className="stepper-btn" onClick={() => setPlantCount(c => Math.max(1, c - 1))}>
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="number"
                                    className="stepper-input"
                                    min={1}
                                    max={500}
                                    value={plantCount}
                                    onChange={e => setPlantCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                                />
                                <button type="button" className="stepper-btn" onClick={() => setPlantCount(c => Math.min(500, c + 1))}>
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Label preview */}
                    {labelPrefix && plantCount > 0 && (
                        <div className="field">
                            <label className="field-label">
                                Labels ({plantCount})
                            </label>
                            <div className="label-tags">
                                {plantLabels.slice(0, 20).map(label => (
                                    <span key={label} className="label-tag">{label}</span>
                                ))}
                                {plantCount > 20 && (
                                    <span className="label-tag" style={{ background: 'none', border: 'none', color: '#9CA3AF' }}>
                                        +{plantCount - 20} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Error */}
            {error && (
                <div className="modal-error">
                    <AlertCircle size={14} />
                    {error}
                </div>
            )}
        </Modal>
    );
};
