import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Leaf } from 'lucide-react';
import type { Strain } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { TableSkeleton } from '../Skeleton';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';

export const StrainTable: React.FC = () => {
    const [strains, setStrains] = useState<Strain[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<Strain | null>(null);

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
        await apiService.deleteStrain(id);
        setDeleteTarget(null);
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
                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-color)' }}>
                        Strain Registry
                    </h3>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
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
                        className="field-input"
                    />
                </div>
            )}

            {/* Table */}
            {strains.length === 0 ? (
                <div className="trim-card text-center p-12" style={{ color: 'var(--text-secondary)' }}>
                    <Leaf size={48} className="mx-auto mb-4" style={{ color: 'var(--color-dolphin)' }} />
                    <p className="text-base font-medium">No strains registered</p>
                    <p className="text-sm mt-1">
                        Strains are auto-captured from harvests and trim sessions, or add one manually.
                    </p>
                </div>
            ) : (
                <div className="trim-card !p-0 overflow-hidden">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--background-color)' }}>
                                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                    Strain
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                    Harvests
                                </th>
                                <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                    Sessions
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                    First Seen
                                </th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {strains.map((strain) => (
                                <tr
                                    key={strain.id}
                                    className="strain-table-row"
                                    style={{ borderBottom: '1px solid var(--background-color)' }}
                                >
                                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-color)' }}>
                                        {strain.name}
                                    </td>
                                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                                        {strain.harvestCount}
                                    </td>
                                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                                        {strain.sessionCount}
                                    </td>
                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-dolphin)' }}>
                                        {new Date(strain.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-2 py-3">
                                        <button
                                            onClick={() => setDeleteTarget(strain)}
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
            {deleteTarget && (
                <DeleteConfirmationModal
                    title="Remove Strain"
                    message={`Remove "${deleteTarget.name}" from the registry? This won't affect existing harvests or sessions that use it.`}
                    onConfirm={() => handleDelete(deleteTarget.id)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};
