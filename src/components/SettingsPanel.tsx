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

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this license? This cannot be undone.')) return;
        await apiService.deleteLicense(id);
        await loadLicenses();
    };

    return (
        <div className="dashboard" style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <div className="flex items-center gap-3 mb-1">
                    <div style={{ width: 40, height: 40, borderRadius: '0.75rem', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={20} color="#10b981" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Settings</h2>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#9ca3af' }}>Manage your company licenses and configuration</p>
                    </div>
                </div>
            </div>

            {/* License Management */}
            <div className="trim-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="flex items-center gap-2">
                        <KeyRound size={16} color="#6b7280" />
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>License Numbers</h3>
                    </div>
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="btn-new-batch"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                        >
                            <Plus size={14} />
                            Add License
                        </button>
                    )}
                </div>

                {/* Add form */}
                {isAdding && (
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
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
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={handleAdd}
                                className="text-sm px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                style={{ border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Save
                            </button>
                            <button
                                onClick={() => { setIsAdding(false); setNewNumber(''); setNewLabel(''); }}
                                className="text-sm px-3 py-1.5 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                                style={{ border: 'none', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* License list */}
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
                ) : licenses.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                        <KeyRound size={32} color="#d1d5db" style={{ margin: '0 auto 0.75rem' }} />
                        <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>No licenses configured</p>
                        <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Add a license number to get started. It will auto-fill when creating harvests and sessions.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                                <th style={{ textAlign: 'left', padding: '0.625rem 1.25rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    License Number
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.625rem 1.25rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Label
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.625rem 1.25rem', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Added
                                </th>
                                <th style={{ width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map(lic => (
                                <tr key={lic.id} style={{ borderBottom: '1px solid #f3f4f6' }} className="strain-table-row">
                                    <td style={{ padding: '0.75rem 1.25rem', fontWeight: 500, color: '#111827', fontFamily: 'monospace' }}>
                                        {lic.licenseNumber}
                                    </td>
                                    <td style={{ padding: '0.75rem 1.25rem', color: '#6b7280' }}>
                                        {lic.label || '—'}
                                    </td>
                                    <td style={{ padding: '0.75rem 1.25rem', color: '#9ca3af', fontSize: '0.8125rem' }}>
                                        {new Date(lic.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.5rem' }}>
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
