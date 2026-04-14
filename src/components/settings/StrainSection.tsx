import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Percent, X } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type {
    Strain,
    StretchTrait,
    ProcessTemplate,
    ProductType,
    Phenotype,
    TerpeneTag,
} from '../../types/definitions';
import { TERPENE_TAGS, TERPENE_TAG_LABELS, MAX_TERPENE_TAGS } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { StrainYieldsModal } from './StrainYieldsModal';

/** Inline-editable row for a single strain */
const STRETCH_OPTIONS: { value: StretchTrait | ''; label: string }[] = [
    { value: '', label: '—' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Med' },
    { value: 'high', label: 'High' },
];

const PHENOTYPE_OPTIONS: { value: Phenotype | ''; label: string }[] = [
    { value: '', label: '—' },
    { value: 'sativa', label: 'Sativa' },
    { value: 'indica', label: 'Indica' },
    { value: 'hybrid', label: 'Hybrid' },
];

/**
 * Popover picker for the up-to-3 terpene tags. Renders the current tags
 * as removable chips; clicking the row opens a dropdown with checkboxes
 * for the full 9-bucket taxonomy. Disabled buckets light up once the
 * strain hits MAX_TERPENE_TAGS so operators can't silently exceed the cap.
 */
const TerpenePicker = ({
    value,
    onChange,
}: {
    value: TerpeneTag[] | null;
    onChange: (next: TerpeneTag[] | null) => void;
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const tags: TerpeneTag[] = value ?? [];
    const atCap = tags.length >= MAX_TERPENE_TAGS;

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const toggle = (tag: TerpeneTag) => {
        if (tags.includes(tag)) {
            const next = tags.filter(t => t !== tag);
            onChange(next.length ? next : null);
        } else if (!atCap) {
            onChange([...tags, tag]);
        }
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative', minWidth: 140 }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="strain-days-input"
                style={{ width: '100%', textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', minHeight: 26, padding: '2px 6px' }}
                title={tags.length ? tags.map(t => TERPENE_TAG_LABELS[t]).join(', ') : 'Add terpene tags'}
            >
                {tags.length === 0 ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                ) : (
                    tags.map(t => (
                        <span
                            key={t}
                            onClick={(e) => { e.stopPropagation(); toggle(t); }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                padding: '1px 6px', borderRadius: 999,
                                background: 'rgba(59, 181, 112, 0.12)',
                                color: 'var(--color-flower, #3BB570)',
                                fontSize: '0.6875rem', fontWeight: 600,
                            }}
                        >
                            {TERPENE_TAG_LABELS[t]}
                            <X size={9} />
                        </span>
                    ))
                )}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
                    background: '#fff', border: '1px solid var(--border-color)', borderRadius: 6,
                    boxShadow: '0 6px 18px rgba(0,0,0,0.08)', padding: 4, minWidth: 180,
                }}>
                    {TERPENE_TAGS.map(tag => {
                        const checked = tags.includes(tag);
                        const disabled = !checked && atCap;
                        return (
                            <label
                                key={tag}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '4px 8px', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.45 : 1, fontSize: '0.8125rem',
                                }}
                                onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = 'var(--background-color)'); }}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggle(tag)}
                                />
                                {TERPENE_TAG_LABELS[tag]}
                            </label>
                        );
                    })}
                    {atCap && (
                        <div style={{ padding: '6px 8px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Max {MAX_TERPENE_TAGS} tags. Remove one to add another.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

type StrainUpdates = {
    defaultVegDays?: number | null;
    defaultFloweringDays?: number | null;
    stretchTrait?: StretchTrait | null;
    notes?: string | null;
    phenotype?: Phenotype | null;
    terpeneTags?: TerpeneTag[] | null;
    expectedYieldPct?: number | null;
    avgCostPerG?: number | null;
};

const StrainRow = ({ strain, onUpdate, onDelete, onOpenYields }: {
    strain: Strain;
    onUpdate: (updates: StrainUpdates) => Promise<void>;
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

    // Percent and currency inputs share the same "parse or clear" shape.
    // Range is enforced by the backend; the UI just has to send a number
    // or null. `yieldPct` is clamped 0-100 because the slider feels more
    // direct than a text input and it's the only control the operator
    // needs for this field.
    const savePercent = async (raw: string) => {
        if (!raw.trim()) return onUpdate({ expectedYieldPct: null });
        const val = parseFloat(raw);
        if (isNaN(val) || val < 0 || val > 100) return;
        await onUpdate({ expectedYieldPct: val });
    };

    const saveCost = async (raw: string) => {
        if (!raw.trim()) return onUpdate({ avgCostPerG: null });
        const val = parseFloat(raw);
        if (isNaN(val) || val < 0) return;
        await onUpdate({ avgCostPerG: val });
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
            <td className="strain-cell-days">
                <select
                    defaultValue={strain.phenotype ?? ''}
                    onChange={e => onUpdate({ phenotype: (e.target.value as Phenotype) || null })}
                    className="strain-days-input"
                >
                    {PHENOTYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </td>
            <td className="strain-cell-notes">
                <TerpenePicker
                    value={strain.terpeneTags}
                    onChange={tags => onUpdate({ terpeneTags: tags })}
                />
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
            <td className="strain-cell-days">
                <input
                    type="number"
                    defaultValue={strain.expectedYieldPct ?? ''}
                    placeholder="—"
                    min={0}
                    max={100}
                    step={0.1}
                    onBlur={e => savePercent(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="strain-days-input"
                    title="Expected yield % (output ÷ input). The variety planner uses this as a filter / weight."
                />
            </td>
            <td className="strain-cell-days">
                <input
                    type="number"
                    defaultValue={strain.avgCostPerG ?? ''}
                    placeholder="—"
                    min={0}
                    step={0.01}
                    onBlur={e => saveCost(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="strain-days-input"
                    title="Average input cost per gram ($). Used for cost filtering in the variety planner."
                />
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
                                <th className="strain-th strain-th-days">Pheno</th>
                                <th className="strain-th strain-th-notes">Terpenes</th>
                                <th className="strain-th strain-th-days">Veg</th>
                                <th className="strain-th strain-th-days">Flower</th>
                                <th className="strain-th strain-th-days">Stretch</th>
                                <th className="strain-th strain-th-days" title="Expected yield %">Yield %</th>
                                <th className="strain-th strain-th-days" title="Average input cost ($/g)">$/g</th>
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
