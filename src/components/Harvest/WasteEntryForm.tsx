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
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select
                        value={wasteType}
                        onChange={e => setWasteType(e.target.value as HarvestWasteType)}
                        className="w-full px-2 py-1.5 rounded-md border border-gray-300 text-sm bg-white
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                    >
                        {WASTE_TYPES.map(wt => (
                            <option key={wt.value} value={wt.value}>{wt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="w-24">
                    <label className="block text-xs text-gray-500 mb-1">Grams</label>
                    <input
                        type="number"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="0"
                        min="1"
                        className="w-full px-2 py-1.5 rounded-md border border-gray-300 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                    />
                </div>
                <button
                    type="button"
                    onClick={handleAdd}
                    className="p-1.5 rounded-md border border-emerald-500 bg-emerald-50
                               hover:bg-emerald-100 transition-colors cursor-pointer flex items-center"
                >
                    <Plus size={18} className="text-emerald-500" />
                </button>
            </div>

            {wasteEntries.length > 0 && (
                <div className="text-sm">
                    {wasteEntries.map(entry => {
                        const typeLabel = WASTE_TYPES.find(wt => wt.value === entry.wasteType)?.label || entry.wasteType;
                        return (
                            <div
                                key={entry.id}
                                className="flex justify-between items-center px-2 py-1.5 border-b border-gray-100"
                            >
                                <span className="text-gray-700">{typeLabel}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500">{entry.weight.toFixed(0)}g</span>
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={() => onDelete(entry.id)}
                                            className="p-0.5 bg-transparent border-none cursor-pointer text-red-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div className="flex justify-between px-2 py-2 font-semibold border-t border-gray-200 mt-1">
                        <span>Total Waste</span>
                        <span>{totalWasteWeight.toFixed(0)}g</span>
                    </div>
                </div>
            )}
        </div>
    );
};
