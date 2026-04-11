import React, { useState } from 'react';
import { Plus, Trash2, Percent } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { Strain, StretchTrait, ProcessTemplate, ProductType } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { StrainYieldsModal } from './StrainYieldsModal';

/** Inline-editable row for a single strain */
const STRETCH_OPTIONS: { value: StretchTrait | ''; label: string }[] = [
    { value: '', label: '—' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Med' },
    { value: 'high', label: 'High' },
];

const StrainRow = ({ strain, onUpdate, onDelete, onOpenYields }: {
    strain: Strain;
    onUpdate: (updates: { defaultVegDays?: number | null; defaultFloweringDays?: number | null; stretchTrait?: StretchTrait | null; notes?: string | null }) => Promise<void>;
    onDelete: () => void;
    onOpenYields: () => void;
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
            <td className="strain-cell-days">
                <select
                    defaultValue={strain.stretchTrait ?? ''}
                    onChange={e => onUpdate({ stretchTrait: (e.target.value as StretchTrait) || null })}
                    className="strain-days-input"
                >
                    {STRETCH_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </td>
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
                <button onClick={onOpenYields} className="strain-yields-btn" title="Known yields per SOP">
                    <Percent size={13} />
                </button>
                <button onClick={onDelete} className="strain-delete-btn" title="Delete strain">
                    <Trash2 size={14} />
                </button>
            </td>
        </tr>
    );
};

interface StrainSectionProps {
    strains: Strain[];
    loading: boolean;
    onReload: () => void;
    onDelete: (id: string, name: string) => void;
}

export const StrainSection: React.FC<StrainSectionProps> = ({ strains, loading, onReload, onDelete }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newStrainName, setNewStrainName] = useState('');
    const [yieldsFor, setYieldsFor] = useState<Strain | null>(null);
    const [templates, setTemplates] = useState<ProcessTemplate[] | null>(null);
    const [productTypes, setProductTypes] = useState<ProductType[] | null>(null);
    const [loadingMeta, setLoadingMeta] = useState(false);

    // Lazy-load SOP templates + product catalog on first open of the yields
    // modal. Cheaper than eager-loading just for the sake of a low-frequency
    // settings action.
    const openYields = async (strain: Strain) => {
        if (!templates || !productTypes) {
            setLoadingMeta(true);
            try {
                const [tmpls, pts] = await Promise.all([
                    apiService.getProcessTemplates('extraction'),
                    apiService.getProductTypes(),
                ]);
                setTemplates(tmpls);
                setProductTypes(pts);
            } finally {
                setLoadingMeta(false);
            }
        }
        setYieldsFor(strain);
    };

    const handleAdd = async () => {
        const name = newStrainName.trim();
        if (!name) { setIsAdding(false); return; }
        await apiService.upsertStrain(name);
        setNewStrainName('');
        setIsAdding(false);
        await onReload();
    };

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Strains</h3>
                    <p className="settings-section-desc">Configure strains with default veg and flowering timelines.</p>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                        <Plus size={14} /> Add Strain
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="settings-add-form">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newStrainName}
                            onChange={e => setNewStrainName(e.target.value)}
                            placeholder="Strain name (e.g. Blue Dream)"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input flex-1"
                        />
                        <button onClick={handleAdd} className="btn-primary text-sm px-3 py-1.5">Save</button>
                        <button onClick={() => { setIsAdding(false); setNewStrainName(''); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                    </div>
                </div>
            )}

            {loading ? (
                <CenteredSpinner label="Loading strains…" height="py-12" />
            ) : strains.length === 0 ? (
                <div className="settings-empty">
                    Strains are used to track harvests, batches, and plant records across your facility.{' '}
                    <button onClick={() => setIsAdding(true)} className="settings-empty-action">
                        Add your strains
                    </button>
                </div>
            ) : (
                <div className="settings-table-wrap">
                    <table className="strain-table">
                        <thead>
                            <tr>
                                <th className="strain-th strain-th-name">Strain</th>
                                <th className="strain-th strain-th-days">Veg</th>
                                <th className="strain-th strain-th-days">Flower</th>
                                <th className="strain-th strain-th-days">Stretch</th>
                                <th className="strain-th strain-th-notes">Notes</th>
                                <th className="strain-th" style={{ width: 40 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {strains.map(s => (
                                <StrainRow
                                    key={s.id}
                                    strain={s}
                                    onUpdate={async (updates) => {
                                        await apiService.upsertStrain(s.name, updates);
                                        await onReload();
                                    }}
                                    onDelete={() => onDelete(s.id, s.name)}
                                    onOpenYields={() => openYields(s)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {yieldsFor && templates && productTypes && (
                <StrainYieldsModal
                    strain={yieldsFor}
                    templates={templates}
                    productTypes={productTypes}
                    onClose={() => setYieldsFor(null)}
                />
            )}
            {loadingMeta && (
                <div className="strain-yields-loading-toast">Loading SOPs…</div>
            )}
        </div>
    );
};
