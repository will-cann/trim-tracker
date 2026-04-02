import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { License } from '../../types/definitions';
import { apiService } from '../../services/apiService';

interface LicenseSectionProps {
    licenses: License[];
    loading: boolean;
    onReload: () => void;
    onDelete: (id: string, name: string) => void;
}

export const LicenseSection: React.FC<LicenseSectionProps> = ({ licenses, loading, onReload, onDelete }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newNumber, setNewNumber] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');

    const handleAdd = async () => {
        const num = newNumber.trim();
        if (!num) { setIsAdding(false); return; }
        await apiService.createLicense(num, newLabel.trim() || undefined);
        setNewNumber('');
        setNewLabel('');
        setIsAdding(false);
        onReload();
    };

    const handleSaveLabel = async (id: string) => {
        await apiService.updateLicenseLabel(id, editLabel.trim());
        setEditingId(null);
        onReload();
    };

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Licenses</h3>
                    <p className="settings-section-desc">Facility license numbers auto-fill when creating harvests and sessions.</p>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                        <Plus size={14} /> Add License
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="settings-add-form">
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newNumber}
                            onChange={e => setNewNumber(e.target.value)}
                            placeholder="License number (e.g. ABC-12345)"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input flex-1"
                        />
                        <input
                            type="text"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            placeholder="Label (optional)"
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input"
                            style={{ width: 160 }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleAdd} className="btn-primary text-sm px-3 py-1.5">Save</button>
                        <button onClick={() => { setIsAdding(false); setNewNumber(''); setNewLabel(''); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                    </div>
                </div>
            )}

            {loading ? (
                <CenteredSpinner label="Loading licenses…" height="py-12" />
            ) : licenses.length === 0 ? (
                <div className="settings-empty">
                    No licenses configured yet.{' '}
                    <button onClick={() => setIsAdding(true)} className="settings-empty-action">
                        Add your first license
                    </button>
                </div>
            ) : (
                <div className="settings-table-wrap">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">License Number</th>
                                <th className="strain-th strain-th-notes">Label</th>
                                <th className="strain-th strain-th-days">Added</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {licenses.map(lic => (
                                <tr key={lic.id} className="strain-row">
                                    <td className="strain-cell-name">
                                        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{lic.licenseNumber}</span>
                                    </td>
                                    <td className="strain-cell-notes">
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
                                    <td className="strain-cell-days">
                                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(lic.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </td>
                                    <td className="strain-cell-action">
                                        <button
                                            onClick={() => onDelete(lic.id, lic.label || lic.licenseNumber)}
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
                </div>
            )}
        </div>
    );
};
