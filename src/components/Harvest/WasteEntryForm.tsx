import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { HarvestWasteEntry, HarvestWasteType } from '../../types/definitions';

const WASTE_TYPES: { value: HarvestWasteType; label: string; group: string }[] = [
    { value: 'powdery_mildew', label: 'Powdery Mildew', group: 'Contamination' },
    { value: 'bud_rot', label: 'Bud Rot', group: 'Contamination' },
    { value: 'insects', label: 'Insects', group: 'Contamination' },
    { value: 'other', label: 'Other', group: 'Contamination' },
    { value: 'stems', label: 'Stems', group: 'Biomass' },
    { value: 'leaves', label: 'Leaves', group: 'Biomass' },
    { value: 'plant_material', label: 'Plant Material', group: 'Post-Harvest' },
    { value: 'fibrous', label: 'Fibrous', group: 'Post-Harvest' },
    { value: 'root_ball', label: 'Root Ball', group: 'Post-Harvest' },
];

interface WasteEntryFormProps {
    wasteEntries: HarvestWasteEntry[];
    onAdd: (wasteType: HarvestWasteType, weight: number) => void;
    onDelete?: (wasteId: string) => void;
    totalWasteWeight: number;
}

export const WasteEntryForm: React.FC<WasteEntryFormProps> = ({
    wasteEntries,
    onAdd,
    onDelete,
    totalWasteWeight,
}) => {
    const [wasteType, setWasteType] = useState<HarvestWasteType>('stems');
    const [weight, setWeight] = useState('');

    const handleAdd = () => {
        const val = Number(weight);
        if (!val || val <= 0) return;
        onAdd(wasteType, val);
        setWeight('');
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Type</label>
                    <select
                        value={wasteType}
                        onChange={e => setWasteType(e.target.value as HarvestWasteType)}
                        style={{
                            width: '100%',
                            padding: '0.375rem 0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            fontSize: '0.8125rem',
                            backgroundColor: 'white',
                        }}
                    >
                        {WASTE_TYPES.map(wt => (
                            <option key={wt.value} value={wt.value}>{wt.label}</option>
                        ))}
                    </select>
                </div>
                <div style={{ width: '100px' }}>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Grams</label>
                    <input
                        type="number"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="0"
                        min="1"
                        style={{
                            width: '100%',
                            padding: '0.375rem 0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            fontSize: '0.8125rem',
                        }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleAdd}
                    style={{
                        padding: '0.375rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #10b981',
                        backgroundColor: '#ecfdf5',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Plus size={18} color="#10b981" />
                </button>
            </div>

            {wasteEntries.length > 0 && (
                <div style={{ fontSize: '0.8125rem' }}>
                    {wasteEntries.map(entry => {
                        const typeLabel = WASTE_TYPES.find(wt => wt.value === entry.wasteType)?.label || entry.wasteType;
                        return (
                            <div
                                key={entry.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.375rem 0.5rem',
                                    borderBottom: '1px solid #f3f4f6',
                                }}
                            >
                                <span style={{ color: '#374151' }}>{typeLabel}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: '#6b7280' }}>{entry.weight.toFixed(0)}g</span>
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={() => onDelete(entry.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                                        >
                                            <Trash2 size={14} color="#ef4444" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.5rem',
                        fontWeight: 600,
                        borderTop: '1px solid #e5e7eb',
                        marginTop: '0.25rem',
                    }}>
                        <span>Total Waste</span>
                        <span>{totalWasteWeight.toFixed(0)}g</span>
                    </div>
                </div>
            )}
        </div>
    );
};
