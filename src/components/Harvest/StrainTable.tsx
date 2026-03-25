import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Leaf } from 'lucide-react';
import type { Strain } from '../../types/definitions';
import { apiService } from '../../services/apiService';

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
        return <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading strains...</div>;
    }

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                        Strain Registry
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#9ca3af' }}>
                        {strains.length} strain{strains.length !== 1 ? 's' : ''} tracked
                    </p>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn-new-batch"
                        style={{ padding: '0.5rem 1rem' }}
                    >
                        <Plus size={16} />
                        Add Strain
                    </button>
                )}
            </div>

            {/* Add input */}
            {isAdding && (
                <div style={{ marginBottom: '1rem' }}>
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
                <div className="trim-card" style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                    <Leaf size={48} color="#d1d5db" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ fontSize: '1rem', fontWeight: 500 }}>No strains registered</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Strains are auto-captured from harvests and trim sessions, or add one manually.
                    </p>
                </div>
            ) : (
                <div className="trim-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Strain
                                </th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 1rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Harvests
                                </th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 1rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Sessions
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    First Seen
                                </th>
                                <th style={{ width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {strains.map((strain) => (
                                <tr
                                    key={strain.id}
                                    style={{ borderBottom: '1px solid #f3f4f6' }}
                                    className="strain-table-row"
                                >
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: '#111827' }}>
                                        {strain.name}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#6b7280' }}>
                                        {strain.harvestCount}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#6b7280' }}>
                                        {strain.sessionCount}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#9ca3af', fontSize: '0.8125rem' }}>
                                        {new Date(strain.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem' }}>
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
