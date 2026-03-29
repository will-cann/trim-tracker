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
            <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Type</label>
                    <select
                        value={wasteType}
                        onChange={e => setWasteType(e.target.value as HarvestWasteType)}
                        className="field-input"
                        style={{ padding: '6px 8px', fontSize: '0.875rem' }}
                    >
                        {Object.entries(
                            WASTE_TYPES.reduce<Record<string, typeof WASTE_TYPES>>((acc, wt) => {
                                (acc[wt.group] ??= []).push(wt);
                                return acc;
                            }, {})
                        ).map(([group, types]) => (
                            <optgroup key={group} label={group}>
                                {types.map(wt => (
                                    <option key={wt.value} value={wt.value}>{wt.label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <div className="w-24">
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Grams</label>
                    <input
                        type="number"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="0"
                        min="1"
                        className="field-input"
                        style={{ padding: '6px 8px', fontSize: '0.875rem' }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!weight || Number(weight) <= 0}
                    className="waste-add-btn"
                >
                    <Plus size={18} />
                </button>
            </div>

            {wasteEntries.length > 0 && (
                <div className="text-sm">
                    {wasteEntries.map(entry => {
                        const typeLabel = WASTE_TYPES.find(wt => wt.value === entry.wasteType)?.label || entry.wasteType;
                        return (
                            <div
                                key={entry.id}
                                className="flex justify-between items-center px-2 py-1.5"
                                style={{ borderBottom: '1px solid var(--background-color)' }}
                            >
                                <span style={{ color: 'var(--text-color)' }}>{typeLabel}</span>
                                <div className="flex items-center gap-2">
                                    <span style={{ color: 'var(--text-secondary)' }}>{entry.weight.toFixed(0)}g</span>
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={() => onDelete(entry.id)}
                                            className="p-0.5 bg-transparent border-none cursor-pointer transition-colors"
                                            style={{ color: 'var(--danger-color)' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div className="flex justify-between px-2 py-2 font-semibold mt-1" style={{ borderTop: '1px solid var(--border-color)' }}>
                        <span>Total Waste</span>
                        <span>{totalWasteWeight.toFixed(0)}g</span>
                    </div>
                </div>
            )}
        </div>
    );
};
