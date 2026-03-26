import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Shield, KeyRound } from 'lucide-react';
import type { License } from '../types/definitions';
import { apiService } from '../services/apiService';

export const SettingsPanel: React.FC = () => {
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newNumber, setNewNumber] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');

    const loadLicenses = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getAllLicenses();
        setLicenses(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadLicenses();
    }, [loadLicenses]);

    const handleAdd = async () => {
        const num = newNumber.trim();
        if (!num) { setIsAdding(false); return; }
        await apiService.createLicense(num, newLabel.trim() || undefined);
        setNewNumber('');
        setNewLabel('');
        setIsAdding(false);
        await loadLicenses();
    };

    const handleSaveLabel = async (id: string) => {
        await apiService.updateLicenseLabel(id, editLabel.trim());
        setEditingId(null);
        await loadLicenses();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this license? This cannot be undone.')) return;
        await apiService.deleteLicense(id);
        await loadLicenses();
    };

    return (
        <div className="dashboard max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Shield size={20} className="text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
                        <p className="text-sm text-gray-400">Manage your company licenses and configuration</p>
                    </div>
                </div>
            </div>

            {/* License Management */}
            <div className="trim-card !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <KeyRound size={16} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-700">License Numbers</h3>
                    </div>
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="btn-new-batch text-sm px-3 py-1.5"
                        >
                            <Plus size={14} />
                            Add License
                        </button>
                    )}
                </div>

                {/* Add form */}
                {isAdding && (
                    <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={newNumber}
                                onChange={e => setNewNumber(e.target.value)}
                                placeholder="License number (e.g. ABC-12345)"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg
                                           focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                            />
                            <input
                                type="text"
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                placeholder="Label (optional)"
                                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                                className="w-40 text-sm px-3 py-2 border border-gray-200 rounded-lg
                                           focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleAdd}
                                className="text-sm font-medium px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors border-none cursor-pointer"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => { setIsAdding(false); setNewNumber(''); setNewLabel(''); }}
                                className="text-sm px-3 py-1.5 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors border-none cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* License list */}
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : licenses.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <KeyRound size={32} className="text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No licenses configured</p>
                        <p className="text-sm mt-1">Add a license number to get started. It will auto-fill when creating harvests and sessions.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    License Number
                                </th>
                                <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    Label
                                </th>
                                <th className="text-left px-5 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                                    Added
                                </th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map(lic => (
                                <tr key={lic.id} className="border-b border-gray-100 strain-table-row">
                                    <td className="px-5 py-3 font-medium text-gray-900 font-mono">
                                        {lic.licenseNumber}
                                    </td>
                                    <td className="px-5 py-2 text-gray-500">
                                        {editingId === lic.id ? (
                                            <input
                                                type="text"
                                                value={editLabel}
                                                onChange={e => setEditLabel(e.target.value)}
                                                onBlur={() => handleSaveLabel(lic.id)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveLabel(lic.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                autoFocus
                                                className="text-sm px-2 py-1 border border-emerald-300 rounded
                                                           focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full"
                                            />
                                        ) : (
                                            <span
                                                onClick={() => { setEditingId(lic.id); setEditLabel(lic.label || ''); }}
                                                className="cursor-pointer border-b border-dashed border-gray-300 pb-px"
                                                title="Click to edit"
                                            >
                                                {lic.label || '—'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-gray-400 text-sm">
                                        {new Date(lic.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-2 py-3">
                                        <button
                                            onClick={() => handleDelete(lic.id)}
                                            className="strain-delete-btn"
                                            title="Delete license"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
