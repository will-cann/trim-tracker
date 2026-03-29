import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Shield, KeyRound, Leaf, Tag as TagIcon, Upload, XCircle, Loader2 } from 'lucide-react';
import type { License, Strain, TrimmerProfile, Tag, TagSettings, TagStats } from '../types/definitions';
import { apiService } from '../services/apiService';
import { TeamSection } from './TeamSection';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

/** Inline-editable row for a single strain */
const StrainRow = ({ strain, onUpdate, onDelete }: {
    strain: Strain;
    onUpdate: (updates: { defaultVegDays?: number | null; defaultFloweringDays?: number | null; notes?: string | null }) => Promise<void>;
    onDelete: () => void;
}) => {
    const saveDays = async (field: 'defaultVegDays' | 'defaultFloweringDays', raw: string) => {
        const val = parseInt(raw);
        const days = (!raw || isNaN(val) || val <= 0) ? null : Math.min(val, 120);
        await onUpdate({ [field]: days });
    };

    const saveNotes = async (raw: string) => {
        await onUpdate({ notes: raw.trim() || null });
    };

    const daysInput = (field: 'defaultVegDays' | 'defaultFloweringDays', value: number | null) => (
        <input
            type="number"
            defaultValue={value ?? ''}
            placeholder="—"
            min={1}
            max={120}
            onBlur={e => saveDays(field, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="strain-days-input"
        />
    );

    return (
        <tr className="strain-row">
            <td className="strain-cell-name">
                <span className="strain-name-text">{strain.name}</span>
            </td>
            <td className="strain-cell-days">{daysInput('defaultVegDays', strain.defaultVegDays)}</td>
            <td className="strain-cell-days">{daysInput('defaultFloweringDays', strain.defaultFloweringDays)}</td>
            <td className="strain-cell-notes">
                <input
                    type="text"
                    defaultValue={strain.notes ?? ''}
                    placeholder="Add notes..."
                    onBlur={e => saveNotes(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="strain-notes-input"
                />
            </td>
            <td className="strain-cell-action">
                <button onClick={onDelete} className="strain-delete-btn" title="Delete strain">
                    <Trash2 size={14} />
                </button>
            </td>
        </tr>
    );
};

export const SettingsPanel: React.FC = () => {
    const [licenses, setLicenses] = useState<License[]>([]);
    const [strains, setStrains] = useState<Strain[]>([]);
    const [profiles, setProfiles] = useState<TrimmerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newNumber, setNewNumber] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [isAddingStrain, setIsAddingStrain] = useState(false);
    const [newStrainName, setNewStrainName] = useState('');

    // Tag state
    const [tagSettings, setTagSettings] = useState<TagSettings>({ useTags: false, tagSource: 'auto', tagOnPhase: 'nursery_to_veg', requireBatchTag: false, autoTagPrefix: 'PLT', autoTagCounter: 0 });
    const [tagStats, setTagStats] = useState<TagStats>({ total: 0, available: 0, assigned: 0, voided: 0 });
    const [tags, setTags] = useState<Tag[]>([]);
    const [tagFilter, setTagFilter] = useState<'all' | 'available' | 'assigned' | 'voided'>('all');
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [importing, setImporting] = useState(false);

    const loadLicenses = useCallback(async () => {
        const data = await apiService.getAllLicenses();
        setLicenses(data);
    }, []);

    const loadStrains = useCallback(async () => {
        const data = await apiService.getStrains();
        setStrains(data);
    }, []);

    const loadProfiles = useCallback(async () => {
        const data = await apiService.getTrimmerProfiles();
        setProfiles(data);
    }, []);

    const loadTagSettings = useCallback(async () => {
        const data = await apiService.getTagSettings();
        setTagSettings(data);
    }, []);

    const loadTagData = useCallback(async () => {
        const [stats, tagList] = await Promise.all([
            apiService.getTagStats(),
            apiService.getTags({ status: tagFilter === 'all' ? undefined : tagFilter }),
        ]);
        setTagStats(stats);
        setTags(tagList);
    }, [tagFilter]);

    useEffect(() => {
        Promise.all([loadLicenses(), loadStrains(), loadProfiles(), loadTagSettings()]).finally(() => setLoading(false));
    }, [loadLicenses, loadStrains, loadProfiles, loadTagSettings]);

    useEffect(() => {
        if (tagSettings.tagSource === 'upload') loadTagData();
    }, [tagSettings.tagSource, tagFilter, loadTagData]);

    const handleAddStrain = async () => {
        const name = newStrainName.trim();
        if (!name) { setIsAddingStrain(false); return; }
        await apiService.upsertStrain(name);
        setNewStrainName('');
        setIsAddingStrain(false);
        await loadStrains();
    };

    const handleSaveTagSettings = async (updates: Partial<TagSettings>) => {
        const newSettings = await apiService.updateTagSettings({ ...tagSettings, ...updates });
        setTagSettings(newSettings);
    };

    const handleImportTags = async () => {
        const lines = importText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        if (lines.length === 0) return;
        setImporting(true);
        try {
            await apiService.importTags(lines, 'plant');
            setImportText('');
            setShowImport(false);
            await loadTagData();
        } finally {
            setImporting(false);
        }
    };

    const handleVoidTag = async (tagId: string) => {
        await apiService.voidTag(tagId);
        await loadTagData();
    };

    const handleUnassignTag = async (tagId: string) => {
        await apiService.unassignTag(tagId);
        await loadTagData();
    };

    const [deleteTarget, setDeleteTarget] = useState<{ type: 'strain' | 'license'; id: string; name: string } | null>(null);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        if (deleteTarget.type === 'strain') {
            await apiService.deleteStrain(deleteTarget.id);
            await loadStrains();
        } else {
            await apiService.deleteLicense(deleteTarget.id);
            await loadLicenses();
        }
        setDeleteTarget(null);
    };

    const handleDeleteStrain = (id: string) => {
        const s = strains.find(s => s.id === id);
        setDeleteTarget({ type: 'strain', id, name: s?.name || 'this strain' });
    };

    const handleDeleteLicense = (id: string) => {
        const l = licenses.find(l => l.id === id);
        setDeleteTarget({ type: 'license', id, name: l?.label || l?.licenseNumber || 'this license' });
    };

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

    return (
        <>
        {deleteTarget && (
            <DeleteConfirmationModal
                title={`Delete ${deleteTarget.type === 'strain' ? 'Strain' : 'License'}`}
                message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        )}
        <div className="dashboard max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Shield size={20} className="text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
                        <p className="text-sm text-gray-400">Manage your team, licenses, and configuration</p>
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
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-emerald-500"></div>
                    </div>
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
                                            onClick={() => handleDeleteLicense(lic.id)}
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

            {/* Strain Management */}
            <div className="trim-card !p-0 overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Leaf size={16} style={{ color: 'var(--color-flower)' }} />
                        <h3 className="text-sm font-semibold text-gray-700">Strains</h3>
                        <span className="text-xs text-gray-400">({strains.length})</span>
                    </div>
                    {!isAddingStrain && (
                        <button
                            onClick={() => setIsAddingStrain(true)}
                            className="btn-new-batch text-sm px-3 py-1.5"
                        >
                            <Plus size={14} />
                            Add Strain
                        </button>
                    )}
                </div>

                {isAddingStrain && (
                    <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newStrainName}
                                onChange={e => setNewStrainName(e.target.value)}
                                placeholder="Strain name (e.g. Blue Dream)"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleAddStrain(); if (e.key === 'Escape') setIsAddingStrain(false); }}
                                className="field-input flex-1"
                            />
                            <button onClick={handleAddStrain} className="btn-primary text-sm px-3 py-1.5">Save</button>
                            <button onClick={() => { setIsAddingStrain(false); setNewStrainName(''); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200" style={{ borderTopColor: 'var(--primary-color)' }}></div>
                    </div>
                ) : strains.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <Leaf size={32} className="text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No strains yet</p>
                        <p className="text-sm mt-1">Add strains to use them in sessions, harvests, and plantings.</p>
                    </div>
                ) : (
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">Strain</th>
                                <th className="strain-th strain-th-days">Veg</th>
                                <th className="strain-th strain-th-days">Flower</th>
                                <th className="strain-th strain-th-notes">Notes</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {strains.map(s => (
                                <StrainRow key={s.id} strain={s} onUpdate={async (updates) => {
                                    await apiService.upsertStrain(s.name, updates);
                                    await loadStrains();
                                }} onDelete={() => handleDeleteStrain(s.id)} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Tag Configuration */}
            <div className="trim-card !p-0 overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <TagIcon size={16} style={{ color: 'var(--color-trim)' }} />
                        <h3 className="text-sm font-semibold text-gray-700">Plant Tags</h3>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {tagSettings.useTags ? 'Enabled' : 'Disabled'}
                        </span>
                        <input
                            type="checkbox"
                            checked={tagSettings.useTags}
                            onChange={e => handleSaveTagSettings({ useTags: e.target.checked })}
                            className="accent-emerald-500 w-4 h-4"
                        />
                    </label>
                </div>

                {tagSettings.useTags && (
                    <div className="px-5 py-4 space-y-5">
                        {/* Tag source */}
                        <div className="field">
                            <label className="field-label">Tag Source</label>
                            <div className="toggle-group" style={{ maxWidth: 320 }}>
                                <button
                                    type="button"
                                    onClick={() => handleSaveTagSettings({ tagSource: 'auto' })}
                                    className={`toggle-option ${tagSettings.tagSource === 'auto' ? 'toggle-active' : ''}`}
                                >
                                    Auto-generate
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveTagSettings({ tagSource: 'upload' })}
                                    className={`toggle-option ${tagSettings.tagSource === 'upload' ? 'toggle-active' : ''}`}
                                >
                                    Metrc / CSV
                                </button>
                            </div>
                            <p className="field-hint">
                                {tagSettings.tagSource === 'auto'
                                    ? 'Tags are generated automatically during phase promotion.'
                                    : 'Upload pre-issued tags from Metrc or CSV. Tags are consumed from the pool during promotion.'}
                            </p>
                        </div>

                        {/* When to tag */}
                        <div className="field">
                            <label className="field-label">Assign Tags On</label>
                            <div className="toggle-group" style={{ maxWidth: 320 }}>
                                <button
                                    type="button"
                                    onClick={() => handleSaveTagSettings({ tagOnPhase: 'nursery_to_veg' })}
                                    className={`toggle-option ${tagSettings.tagOnPhase === 'nursery_to_veg' ? 'toggle-active' : ''}`}
                                >
                                    Nursery → Veg
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveTagSettings({ tagOnPhase: 'veg_to_flower' })}
                                    className={`toggle-option ${tagSettings.tagOnPhase === 'veg_to_flower' ? 'toggle-active' : ''}`}
                                >
                                    Veg → Flower
                                </button>
                            </div>
                        </div>

                        {/* Auto prefix */}
                        {tagSettings.tagSource === 'auto' && (
                            <div className="field" style={{ maxWidth: 200 }}>
                                <label className="field-label">Tag Prefix</label>
                                <input
                                    type="text"
                                    className="field-input"
                                    defaultValue={tagSettings.autoTagPrefix}
                                    placeholder="PLT"
                                    maxLength={20}
                                    onBlur={e => {
                                        const v = e.target.value.trim() || 'PLT';
                                        if (v !== tagSettings.autoTagPrefix) handleSaveTagSettings({ autoTagPrefix: v });
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                />
                                <p className="field-hint">
                                    Tags will be: {tagSettings.autoTagPrefix}-{String(tagSettings.autoTagCounter + 1).padStart(6, '0')}
                                </p>
                            </div>
                        )}

                        {/* Batch tags */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={tagSettings.requireBatchTag}
                                onChange={e => handleSaveTagSettings({ requireBatchTag: e.target.checked })}
                                className="accent-emerald-500 w-4 h-4"
                            />
                            <span className="text-sm" style={{ color: 'var(--text-color)' }}>Tag nursery batches</span>
                        </label>

                        {/* Upload mode: pool management */}
                        {tagSettings.tagSource === 'upload' && (
                            <>
                                <div className="field-divider" />

                                {/* Stats */}
                                <div className="flex gap-3">
                                    {[
                                        { label: 'Available', value: tagStats.available, color: 'var(--color-flower)' },
                                        { label: 'Assigned', value: tagStats.assigned, color: 'var(--color-trim)' },
                                        { label: 'Voided', value: tagStats.voided, color: 'var(--text-secondary)' },
                                    ].map(s => (
                                        <div key={s.label} className="flex items-center gap-1.5">
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                                            <span className="text-xs font-medium" style={{ color: 'var(--text-color)' }}>{s.value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Import */}
                                {showImport ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={importText}
                                            onChange={e => setImportText(e.target.value)}
                                            placeholder="Paste tag numbers, one per line or comma-separated..."
                                            rows={5}
                                            autoFocus
                                            className="field-input"
                                            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.75rem' }}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleImportTags}
                                                disabled={importing || !importText.trim()}
                                                className="btn-primary text-sm px-3 py-1.5"
                                            >
                                                {importing ? <Loader2 size={14} className="animate-spin" /> : `Import ${importText.split(/[\n,]/).filter(s => s.trim()).length} tags`}
                                            </button>
                                            <button onClick={() => { setShowImport(false); setImportText(''); }} className="btn-cancel text-sm px-3 py-1.5">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowImport(true)} className="btn-new-batch text-sm px-3 py-1.5">
                                        <Upload size={14} /> Import Tags
                                    </button>
                                )}

                                {/* Filter tabs */}
                                <div className="flex gap-1">
                                    {(['all', 'available', 'assigned', 'voided'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setTagFilter(f)}
                                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                                                tagFilter === f
                                                    ? 'border-transparent text-white'
                                                    : ''
                                            }`}
                                            style={tagFilter === f
                                                ? { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }
                                                : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
                                            }
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>

                                {/* Tag table */}
                                {tags.length === 0 ? (
                                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                                        {tagFilter === 'all' ? 'No tags imported yet.' : `No ${tagFilter} tags.`}
                                    </p>
                                ) : (
                                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="strain-table">
                                            <thead>
                                                <tr>
                                                    <th className="strain-th strain-th-name">Tag Number</th>
                                                    <th className="strain-th strain-th-days">Type</th>
                                                    <th className="strain-th strain-th-days">Status</th>
                                                    <th className="strain-th strain-th-notes">Assigned To</th>
                                                    <th className="strain-th" style={{ width: 60 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tags.map(t => (
                                                    <tr key={t.id} className="strain-row">
                                                        <td className="strain-cell-name">
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 500 }}>
                                                                {t.tagNumber}
                                                            </span>
                                                        </td>
                                                        <td className="strain-cell-days">
                                                            <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{t.tagType}</span>
                                                        </td>
                                                        <td className="strain-cell-days">
                                                            <span className="text-xs capitalize" style={{
                                                                color: t.status === 'available' ? 'var(--color-flower)' :
                                                                       t.status === 'assigned' ? 'var(--color-trim)' : 'var(--text-secondary)'
                                                            }}>
                                                                {t.status}
                                                            </span>
                                                        </td>
                                                        <td className="strain-cell-notes">
                                                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                                {t.assignedTo || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="strain-cell-action" style={{ display: 'flex', gap: 4 }}>
                                                            {t.status === 'assigned' && (
                                                                <button onClick={() => handleUnassignTag(t.id)} className="strain-delete-btn" title="Unassign" style={{ opacity: 1 }}>
                                                                    <XCircle size={14} />
                                                                </button>
                                                            )}
                                                            {t.status !== 'voided' && (
                                                                <button onClick={() => handleVoidTag(t.id)} className="strain-delete-btn" title="Void" style={{ opacity: 1 }}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Team Management */}
            <div className="mt-6">
                <TeamSection profiles={profiles} onReload={loadProfiles} />
            </div>
        </div>
        </>
    );
};
