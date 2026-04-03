import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Wrench } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { ExtractionEquipment } from '../../types/definitions';
import { apiService } from '../../services/apiService';

const EQUIPMENT_TYPES = [
    { value: 'wash_vessel', label: 'Wash Vessel' },
    { value: 'freeze_dryer', label: 'Freeze Dryer' },
    { value: 'rosin_press', label: 'Rosin Press' },
    { value: 'closed_loop_extractor', label: 'Closed Loop Extractor' },
    { value: 'vacuum_oven', label: 'Vacuum Oven' },
    { value: 'cart_filler', label: 'Cart Filler' },
    { value: 'filter_press', label: 'Filter Press' },
    { value: 'short_path', label: 'Short Path Distillation' },
    { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
    { value: 'available', label: 'Available', color: '#3BB570' },
    { value: 'in_use', label: 'In Use', color: '#1C9EFF' },
    { value: 'maintenance', label: 'Maintenance', color: '#FA9E52' },
    { value: 'retired', label: 'Retired', color: '#959595' },
];

interface EquipmentSectionProps {
    loading: boolean;
}

export const EquipmentSection: React.FC<EquipmentSectionProps> = ({ loading }) => {
    const [equipment, setEquipment] = useState<ExtractionEquipment[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('');
    const [newCapacity, setNewCapacity] = useState('');
    const [newNotes, setNewNotes] = useState('');

    const loadEquipment = useCallback(async () => {
        setDataLoading(true);
        const data = await apiService.getExtractionEquipment();
        setEquipment(data);
        setDataLoading(false);
    }, []);

    useEffect(() => {
        loadEquipment();
    }, [loadEquipment]);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name || !newType) { setIsAdding(false); return; }
        await apiService.createExtractionEquipment({
            name,
            equipmentType: newType,
            capacityGrams: newCapacity ? parseFloat(newCapacity) : undefined,
            notes: newNotes.trim() || undefined,
        });
        setNewName(''); setNewType(''); setNewCapacity(''); setNewNotes('');
        setIsAdding(false);
        await loadEquipment();
    };

    const handleUpdate = async (id: string, field: string, raw: string) => {
        let value: any;
        if (field === 'capacityGrams') {
            const num = parseFloat(raw);
            value = (!raw || isNaN(num) || num <= 0) ? null : num;
        } else {
            value = raw.trim() || null;
        }
        await apiService.updateExtractionEquipment(id, { [field]: value });
        await loadEquipment();
    };

    const handleDelete = async (id: string) => {
        await apiService.deleteExtractionEquipment(id);
        await loadEquipment();
    };

    if (loading || dataLoading) {
        return <CenteredSpinner label="Loading equipment…" height="py-12" />;
    }

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Extraction Equipment</h3>
                    <p className="settings-section-desc">Manage machines used in your extraction processes.</p>
                </div>
                <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                    <Plus size={14} /> Add Equipment
                </button>
            </div>

            {isAdding && (
                <div className="settings-add-form mt-4">
                    <div className="flex gap-2 flex-wrap">
                        <input
                            type="text"
                            className="field-input"
                            style={{ flex: '1 1 160px', minWidth: 0 }}
                            placeholder="Name (e.g. Sasquash M2)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <select
                            className="field-input"
                            style={{ flex: '0 0 180px' }}
                            value={newType}
                            onChange={e => setNewType(e.target.value)}
                        >
                            <option value="">Select type...</option>
                            {EQUIPMENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            className="field-input"
                            style={{ flex: '0 0 120px' }}
                            placeholder="Capacity (g)"
                            value={newCapacity}
                            onChange={e => setNewCapacity(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <input
                        type="text"
                        className="field-input mt-2"
                        placeholder="Notes (model, specs, column sizes...)"
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <div className="flex gap-2 mt-2">
                        <button onClick={handleAdd} disabled={!newName.trim() || !newType} className="btn-primary text-sm px-3 py-1.5">
                            Add
                        </button>
                        <button onClick={() => { setIsAdding(false); setNewName(''); setNewType(''); setNewCapacity(''); setNewNotes(''); }} className="btn-cancel text-sm px-3 py-1.5">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {equipment.length === 0 && !isAdding ? (
                <div className="settings-empty mt-4">
                    <Wrench size={20} style={{ color: '#C0C0C0', marginBottom: 8 }} />
                    <p>No equipment added yet. Add your extraction machines to track capacity and usage.</p>
                </div>
            ) : (
                <div className="settings-table-wrap mt-4">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">Name</th>
                                <th className="strain-th strain-th-days">Type</th>
                                <th className="strain-th strain-th-days">Capacity</th>
                                <th className="strain-th strain-th-days">Status</th>
                                <th className="strain-th strain-th-notes">Notes</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {equipment.map(eq => (
                                <tr key={eq.id} className="strain-row">
                                    <td className="strain-cell-name">
                                        <input
                                            type="text"
                                            className="strain-inline-input"
                                            defaultValue={eq.name}
                                            onBlur={e => {
                                                const v = e.target.value.trim();
                                                if (v && v !== eq.name) handleUpdate(eq.id, 'name', v);
                                            }}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        />
                                    </td>
                                    <td className="strain-cell-days">
                                        <select
                                            className="strain-inline-input"
                                            defaultValue={eq.equipmentType}
                                            onChange={e => handleUpdate(eq.id, 'equipmentType', e.target.value)}
                                            style={{ fontSize: '0.75rem' }}
                                        >
                                            {EQUIPMENT_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="strain-cell-days">
                                        <input
                                            type="number"
                                            className="strain-inline-input"
                                            style={{ width: 70, textAlign: 'right' }}
                                            defaultValue={eq.capacityGrams ?? ''}
                                            placeholder="—"
                                            onBlur={e => handleUpdate(eq.id, 'capacityGrams', e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        />
                                        {eq.capacityGrams && <span className="text-xs ml-0.5" style={{ color: '#959595' }}>g</span>}
                                    </td>
                                    <td className="strain-cell-days">
                                        <select
                                            className="strain-inline-input"
                                            defaultValue={eq.status}
                                            onChange={e => handleUpdate(eq.id, 'status', e.target.value)}
                                            style={{
                                                fontSize: '0.75rem',
                                                color: STATUS_OPTIONS.find(s => s.value === eq.status)?.color || '#959595',
                                            }}
                                        >
                                            {STATUS_OPTIONS.map(s => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="strain-cell-notes">
                                        <input
                                            type="text"
                                            className="strain-inline-input"
                                            defaultValue={eq.notes ?? ''}
                                            placeholder="—"
                                            onBlur={e => {
                                                const v = e.target.value.trim();
                                                if (v !== (eq.notes ?? '')) handleUpdate(eq.id, 'notes', v);
                                            }}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        />
                                    </td>
                                    <td className="strain-cell-action">
                                        <button
                                            onClick={() => handleDelete(eq.id)}
                                            className="strain-delete-btn"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
