import React, { useState, useEffect } from 'react';
import { X, Loader2, Plus, Minus } from 'lucide-react';
import type { PlantPhase, Room } from '../../types/plantMap';
import type { Strain } from '../../types/definitions';
import { apiService } from '../../services/apiService';

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

    // Fetch strains and rooms
    useEffect(() => {
        apiService.getStrains().then(setStrains);
        apiService.getRooms().then(r => setRooms(r as Room[]));
    }, []);

    // Auto-generate batch name when strain or type changes
    useEffect(() => {
        if (mode === 'batch' && strainId) {
            const strain = strains.find(s => s.id === strainId);
            if (strain) {
                const typeLabel = batchType === 'tissue_culture' ? 'TC' : batchType.charAt(0).toUpperCase() + batchType.slice(1);
                setBatchName(`${strain.name}-${typeLabel}-${plantedDate}`);
            }
        }
    }, [strainId, batchType, plantedDate, mode, strains]);

    // Auto-set label prefix from strain
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

    // Filter rooms by type based on mode
    const filteredRooms = rooms.filter(r => {
        if (mode === 'batch') return r.roomType === 'nursery' || r.roomType === 'general';
        if (growthPhase === 'vegetative') return r.roomType === 'veg' || r.roomType === 'general';
        if (growthPhase === 'flowering') return r.roomType === 'flower' || r.roomType === 'general';
        return true;
    });

    // Generate plant labels
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

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h3 className="text-base font-semibold text-gray-900">New Planting</h3>
                    <button onClick={onClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setMode('batch')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            mode === 'batch'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                        Plant Batch
                        <div className="text-[10px] mt-0.5 opacity-70">Nursery / immature</div>
                    </button>
                    <button
                        onClick={() => setMode('plant')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            mode === 'plant'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                        Individual Plants
                        <div className="text-[10px] mt-0.5 opacity-70">Vegetative / flowering</div>
                    </button>
                </div>

                <div className="modal-body space-y-4">
                    {/* Strain selector */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Strain</label>
                        {strains.length === 0 ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                <Loader2 size={14} className="animate-spin" />
                                Loading strains...
                            </div>
                        ) : (
                            <select
                                value={strainId}
                                onChange={e => setStrainId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                            >
                                <option value="">Select a strain</option>
                                {strains.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Room selector */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Room</label>
                        {rooms.length === 0 ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                                <Loader2 size={14} className="animate-spin" />
                                Loading rooms...
                            </div>
                        ) : filteredRooms.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">No matching rooms. Showing all:</p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2 max-h-36 overflow-auto">
                            {(filteredRooms.length > 0 ? filteredRooms : rooms).map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setRoomId(r.id)}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left ${
                                        roomId === r.id
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    <div>{r.name}</div>
                                    <div className="text-[10px] text-gray-400 capitalize">{r.roomType}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Planted date */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Planted Date</label>
                        <input
                            type="date"
                            value={plantedDate}
                            onChange={e => setPlantedDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                        />
                    </div>

                    {/* ── Batch-specific fields ── */}
                    {mode === 'batch' && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Batch Type</label>
                                <div className="flex gap-2">
                                    {BATCH_TYPES.map(bt => (
                                        <button
                                            key={bt.value}
                                            onClick={() => setBatchType(bt.value)}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                                batchType === bt.value
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                            }`}
                                        >
                                            {bt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Batch Name</label>
                                <input
                                    type="text"
                                    value={batchName}
                                    onChange={e => setBatchName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                    placeholder="e.g., GG4-Clone-2026-03-28"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Plant Count</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setBatchCount(c => Math.max(1, c - 10))}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        value={batchCount}
                                        onChange={e => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-20 text-center px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                    />
                                    <button
                                        onClick={() => setBatchCount(c => c + 10)}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Plant-specific fields ── */}
                    {mode === 'plant' && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Growth Phase</label>
                                <div className="flex gap-2">
                                    {(['vegetative', 'flowering'] as const).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setGrowthPhase(p)}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${
                                                growthPhase === p
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Label Prefix</label>
                                <input
                                    type="text"
                                    value={labelPrefix}
                                    onChange={e => setLabelPrefix(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                    placeholder="e.g., GG4-V"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Labels will be: {labelPrefix || '???'}-001, {labelPrefix || '???'}-002, ...
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Number of Plants</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setPlantCount(c => Math.max(1, c - 1))}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={plantCount}
                                        onChange={e => setPlantCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                                        className="w-20 text-center px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                    />
                                    <button
                                        onClick={() => setPlantCount(c => Math.min(500, c + 1))}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Preview labels */}
                            {labelPrefix && plantCount > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Label Preview ({plantCount} plant{plantCount !== 1 ? 's' : ''})
                                    </label>
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                                        {plantLabels.slice(0, 20).map(label => (
                                            <span
                                                key={label}
                                                className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-[11px] text-gray-600 font-mono"
                                            >
                                                {label}
                                            </span>
                                        ))}
                                        {plantCount > 20 && (
                                            <span className="px-2 py-0.5 text-[11px] text-gray-400">
                                                +{plantCount - 20} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
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
                        disabled={submitting || !canSubmit()}
                        className="btn-primary"
                    >
                        {submitting ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : mode === 'batch' ? (
                            `Create Batch (${batchCount} plants)`
                        ) : (
                            `Create ${plantCount} Plant${plantCount !== 1 ? 's' : ''}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
