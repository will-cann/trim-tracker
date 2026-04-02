import React, { useState, useEffect } from 'react';
import { Snowflake, Plus, Trash2 } from 'lucide-react';
import type { Harvest, Package, Tag } from '../../types/definitions';
import { apiService } from '../../services/apiService';

interface HarvestRightColumnProps {
    harvest: Harvest;
    rooms: Array<{ id: string; name: string; room_type: string }>;
    onUpdate: () => void;
}

export const HarvestRightColumn: React.FC<HarvestRightColumnProps> = ({
    harvest,
    rooms,
    onUpdate,
}) => {
    const [packages, setPackages] = useState<Package[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [tagId, setTagId] = useState('');
    const [weight, setWeight] = useState('');
    const [storageRoom, setStorageRoom] = useState(harvest.manicureLocation || '');

    const frozenAllocation = harvest.allocations.find(a => a.allocationType === 'frozen');
    const ffBatchId = `${harvest.batchId}-FF`;

    useEffect(() => {
        loadPackages();
        loadTags();
    }, [harvest.id]);

    const loadPackages = async () => {
        const all = await apiService.getPackages({ type: 'fresh_frozen' });
        setPackages(all.filter(p => p.harvestId === harvest.id));
    };

    const loadTags = async () => {
        try {
            const available = await apiService.getTags({ status: 'available' });
            setTags(available);
        } catch {
            setTags([]);
        }
    };

    const totalPackaged = packages.reduce((sum, p) => sum + p.quantity, 0);
    const target = frozenAllocation?.targetWeight || 0;

    const handleCreatePackage = async () => {
        const val = Number(weight);
        if (!val || val <= 0) return;

        await apiService.createPackage({
            harvestId: harvest.id,
            tagId: tagId || undefined,
            label: `${ffBatchId}-${packages.length + 1}`,
            packageType: 'fresh_frozen',
            strain: harvest.strain,
            licenseNumber: harvest.licenseNumber,
            quantity: val,
            location: storageRoom || undefined,
        });

        setWeight('');
        setTagId('');
        await loadPackages();
        await loadTags();
        onUpdate();
    };

    const handleDeletePackage = async (id: string) => {
        await apiService.deletePackage(id);
        await loadPackages();
        await loadTags();
        onUpdate();
    };

    const handleRoomChange = async (room: string) => {
        setStorageRoom(room);
        await apiService.updateHarvest(harvest.id, { manicureLocation: room });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCreatePackage();
        }
    };

    const coldRooms = rooms.filter(r => r.room_type === 'general' || r.room_type === 'dry');

    return (
        <div className="hd-column hd-right">
            <div className="hd-batch-header">
                <h2 className="hd-batch-id" style={{ fontSize: '1rem' }}>
                    <Snowflake size={16} style={{ color: 'var(--secondary-color)' }} />
                    {ffBatchId}
                </h2>
                <span className="hd-ff-label">Fresh Frozen</span>
            </div>

            {/* Storage room */}
            <div className="hd-field-row">
                <label className="field-label">Storage Room</label>
                <select
                    className="field-input"
                    value={storageRoom}
                    onChange={e => handleRoomChange(e.target.value)}
                >
                    <option value="">Select room...</option>
                    {coldRooms.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                </select>
            </div>

            {/* Allocation progress */}
            <div className="hd-allocation-progress">
                <span className="hd-stat-value" style={{ color: 'var(--secondary-color)' }}>
                    {totalPackaged.toFixed(0)}g
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    / {target.toFixed(0)}g target
                </span>
            </div>

            {/* Create package */}
            <div className="hd-section">
                <h3 className="hd-section-title">Create Package</h3>
                <div className="hd-field-row">
                    <label className="field-label">Tag</label>
                    <select
                        className="field-input"
                        value={tagId}
                        onChange={e => setTagId(e.target.value)}
                    >
                        <option value="">No tag</option>
                        {tags.map(t => (
                            <option key={t.id} value={t.id}>{t.tagNumber}</option>
                        ))}
                    </select>
                </div>
                <div className="hd-weight-input-row" style={{ marginTop: 'var(--space-sm)' }}>
                    <div className="hd-weight-input-wrap">
                        <input
                            type="number"
                            className="hd-weight-input"
                            value={weight}
                            onChange={e => setWeight(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Weight"
                            min="1"
                        />
                        <span className="hd-weight-unit">g</span>
                    </div>
                    <button
                        className="hd-action-btn"
                        onClick={handleCreatePackage}
                        disabled={!weight || Number(weight) <= 0}
                    >
                        <Plus size={14} />
                        Package
                    </button>
                </div>
            </div>

            {/* Package list */}
            {packages.length > 0 && (
                <div className="hd-section">
                    <h3 className="hd-section-title">Packages</h3>
                    <div className="hd-package-list">
                        {packages.map(pkg => (
                            <div key={pkg.id} className="hd-package-row">
                                <div>
                                    <span className="hd-package-label">{pkg.label}</span>
                                    {pkg.tagNumber && (
                                        <span className="hd-package-tag">{pkg.tagNumber}</span>
                                    )}
                                    {(pkg.contaminants?.length ?? 0) > 0 && (
                                        <span className="hd-contaminant-dot" title={pkg.contaminants?.join(', ')} />
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span style={{ fontWeight: 600 }}>{pkg.quantity.toFixed(0)}g</span>
                                    <button
                                        className="plant-weight-del"
                                        onClick={() => handleDeletePackage(pkg.id)}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
