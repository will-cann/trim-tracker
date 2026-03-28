import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Leaf } from 'lucide-react';
import type { Strain } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { TableSkeleton } from '../Skeleton';

export const StrainTable: React.FC = () => {
    const [strains, setStrains] = useState<Strain[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');

    const loadStrains = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getStrains();
        setStrains(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadStrains();
    }, [loadStrains]);

    const handleAdd = async () => {
        const trimmed = newName.trim();
        if (!trimmed) { setIsAdding(false); return; }
        await apiService.upsertStrain(trimmed);
        setNewName('');
        setIsAdding(false);
        await loadStrains();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this strain from the registry?')) return;
        await apiService.deleteStrain(id);
        await loadStrains();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAdd();
        if (e.key === 'Escape') { setNewName(''); setIsAdding(false); }
    };

    if (loading) {
        return <TableSkeleton rows={4} cols={4} />;
    }

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-base font-semibold text-gray-700">
                        Strain Registry
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        {strains.length} strain{strains.length !== 1 ? 's' : ''} tracked
                    </p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn-new-batch px-4 py-2"
                    >
                        <Plus size={16} />
                        Add Strain
                    </button>
                )}
            </div>

            {/* Add input */}
            {isAdding && (
                <div className="mb-4">
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleAdd}
                        placeholder="Strain name..."
                        autoFocus
                        className="w-full text-sm px-3 py-2 border border-emerald-300 rounded-lg
                                   focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                </div>
            )}

            {/* Table */}
            {strains.length === 0 ? (
                <div className="trim-card text-center p-12 text-gray-400">
                    <Leaf size={48} className="text-gray-300 mx-auto mb-4" />
                    <p className="text-base font-medium">No strains registered</p>
                    <p className="text-sm mt-1">
                        Strains are auto-captured from harvests and trim sessions, or add one manually.
                    </p>
                </div>
            ) : (
                <div className="trim-card !p-0 overflow-hidden">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    Strain
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    Harvests
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    Sessions
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    First Seen
                                </th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {strains.map((strain) => (
                                <tr
                                    key={strain.id}
                                    className="border-b border-gray-100 strain-table-row"
                                >
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {strain.name}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-500">
                                        {strain.harvestCount}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-500">
                                        {strain.sessionCount}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm">
                                        {new Date(strain.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-2 py-3">
                                        <button
                                            onClick={() => handleDelete(strain.id)}
                                            className="strain-delete-btn"
                                            title="Remove strain"
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
