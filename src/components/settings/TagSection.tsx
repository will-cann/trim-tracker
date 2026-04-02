import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Trash2, XCircle, Loader2 } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { Tag, TagSettings, TagStats } from '../../types/definitions';
import { apiService } from '../../services/apiService';

interface TagSectionProps {
    tagSettings: TagSettings;
    onSaveSettings: (updates: Partial<TagSettings>) => Promise<void>;
    loading: boolean;
}

export const TagSection: React.FC<TagSectionProps> = ({ tagSettings, onSaveSettings, loading }) => {
    const [tagStats, setTagStats] = useState<TagStats>({ total: 0, available: 0, assigned: 0, voided: 0 });
    const [tags, setTags] = useState<Tag[]>([]);
    const [tagFilter, setTagFilter] = useState<'all' | 'available' | 'assigned' | 'voided'>('all');
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [importing, setImporting] = useState(false);

    const loadTagData = useCallback(async () => {
        const [stats, tagList] = await Promise.all([
            apiService.getTagStats(),
            apiService.getTags({ status: tagFilter === 'all' ? undefined : tagFilter }),
        ]);
        setTagStats(stats);
        setTags(tagList);
    }, [tagFilter]);

    useEffect(() => {
        if (tagSettings.tagSource === 'upload') loadTagData();
    }, [tagSettings.tagSource, tagFilter, loadTagData]);

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

    if (loading) {
        return <CenteredSpinner label="Loading tag settings…" height="py-12" />;
    }

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Plant Tags</h3>
                    <p className="settings-section-desc">Configure how plant tags are generated and assigned.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {tagSettings.useTags ? 'Enabled' : 'Disabled'}
                    </span>
                    <input
                        type="checkbox"
                        checked={tagSettings.useTags}
                        onChange={e => onSaveSettings({ useTags: e.target.checked })}
                        className="accent-emerald-500 w-4 h-4"
                    />
                </label>
            </div>

            {!tagSettings.useTags ? (
                <div className="settings-empty">
                    Plant tags are disabled. Enable them to track individual plants with unique identifiers.
                </div>
            ) : (
                <div className="space-y-5 mt-4">
                    {/* Tag source */}
                    <div className="field">
                        <label className="field-label">Tag Source</label>
                        <div className="toggle-group" style={{ maxWidth: 320 }}>
                            <button
                                type="button"
                                onClick={() => onSaveSettings({ tagSource: 'auto' })}
                                className={`toggle-option ${tagSettings.tagSource === 'auto' ? 'toggle-active' : ''}`}
                            >
                                Auto-generate
                            </button>
                            <button
                                type="button"
                                onClick={() => onSaveSettings({ tagSource: 'upload' })}
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
                                onClick={() => onSaveSettings({ tagOnPhase: 'nursery_to_veg' })}
                                className={`toggle-option ${tagSettings.tagOnPhase === 'nursery_to_veg' ? 'toggle-active' : ''}`}
                            >
                                Nursery → Veg
                            </button>
                            <button
                                type="button"
                                onClick={() => onSaveSettings({ tagOnPhase: 'veg_to_flower' })}
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
                                    if (v !== tagSettings.autoTagPrefix) onSaveSettings({ autoTagPrefix: v });
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
                            onChange={e => onSaveSettings({ requireBatchTag: e.target.checked })}
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
                                <div className="settings-table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
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
    );
};
