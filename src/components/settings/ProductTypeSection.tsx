import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, Leaf, RotateCcw } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { ProductType } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// ─────────────────────────────────────────────────────────────────────────────
// ProductTypeSection — manage the product catalog (materials + outputs)
//
// The catalog powers every dropdown that asks "what kind of thing is this?"
// Units, cannabis compliance, and extraction pathway associations all live
// here. Each row is inline-editable; changes save on blur or toggle.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: ProductType['category']; label: string; desc: string }[] = [
    { value: 'biomass', label: 'Biomass', desc: 'Raw input — flower, trim, fresh frozen' },
    { value: 'intermediate', label: 'Intermediate', desc: 'In-process — hash, rosin, distillate' },
    { value: 'finished', label: 'Finished', desc: 'Sellable — carts, edibles, pre-rolls' },
    { value: 'additive', label: 'Additive', desc: 'Terpenes, binders, flavoring' },
];

const CATEGORY_LABELS: Record<string, string> = {
    biomass: 'Biomass',
    intermediate: 'Intermediate',
    finished: 'Finished',
    additive: 'Additive',
};

const PROCESS_PATHWAYS: { value: string; label: string }[] = [
    { value: 'solventless', label: 'Solventless' },
    { value: 'bho', label: 'BHO' },
    { value: 'distillate', label: 'Distillate' },
    { value: 'custom', label: 'Custom' },
];

const UNIT_OPTIONS = [
    { value: 'g', label: 'grams' },
    { value: 'kg', label: 'kilograms' },
    { value: 'mg', label: 'milligrams' },
    { value: 'ml', label: 'milliliters' },
    { value: 'L', label: 'liters' },
    { value: 'each', label: 'each' },
];

interface ProductTypeRowProps {
    pt: ProductType;
    onUpdate: (updates: Partial<ProductType>) => Promise<void>;
    onDeactivate: () => Promise<void>;
}

const ProductTypeRow: React.FC<ProductTypeRowProps> = ({ pt, onUpdate, onDeactivate }) => {
    const toggleProcess = async (proc: string) => {
        const next = pt.processTypes.includes(proc)
            ? pt.processTypes.filter(p => p !== proc)
            : [...pt.processTypes, proc];
        await onUpdate({ processTypes: next });
    };

    return (
        <tr className={`product-type-row ${!pt.isActive ? 'product-type-row--inactive' : ''}`}>
            <td className="product-type-cell-name">
                <input
                    type="text"
                    defaultValue={pt.displayName}
                    onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && val !== pt.displayName) onUpdate({ displayName: val });
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="product-type-name-input"
                />
            </td>
            <td className="product-type-cell">
                <select
                    value={pt.category}
                    onChange={e => onUpdate({ category: e.target.value as ProductType['category'] })}
                    className="product-type-select"
                >
                    {CATEGORY_OPTIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
            </td>
            <td className="product-type-cell">
                <select
                    value={pt.defaultUnit}
                    onChange={e => onUpdate({ defaultUnit: e.target.value })}
                    className="product-type-select"
                >
                    {UNIT_OPTIONS.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                </select>
            </td>
            <td className="product-type-cell-pathways">
                <div className="product-type-pathways">
                    {PROCESS_PATHWAYS.map(p => {
                        const active = pt.processTypes.includes(p.value);
                        return (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => toggleProcess(p.value)}
                                className={`product-type-pathway-pill product-type-pathway-pill--${p.value}${active ? ' product-type-pathway-pill--active' : ''}`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>
            </td>
            <td className="product-type-cell product-type-cell-cannabis">
                <label className="product-type-toggle" title={pt.isCannabis ? 'Cannabis product (METRC tracked)' : 'Non-cannabis (no METRC)'}>
                    <input
                        type="checkbox"
                        checked={pt.isCannabis}
                        onChange={e => onUpdate({ isCannabis: e.target.checked })}
                    />
                    <span className="product-type-toggle-dot">{pt.isCannabis && <Check size={10} />}</span>
                </label>
            </td>
            <td className="product-type-cell-action">
                <button
                    onClick={onDeactivate}
                    className="product-type-delete-btn"
                    title={pt.isActive ? 'Deactivate' : 'Reactivate'}
                >
                    {pt.isActive ? <Trash2 size={13} /> : <RotateCcw size={13} />}
                </button>
            </td>
        </tr>
    );
};

interface ProductTypeSectionProps {
    loading?: boolean;
}

export const ProductTypeSection: React.FC<ProductTypeSectionProps> = () => {
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState<ProductType['category']>('intermediate');
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

    const load = useCallback(async () => {
        const data = await apiService.getProductTypes({ includeInactive: true });
        setProductTypes(data);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) { setIsAdding(false); return; }
        await apiService.upsertProductType({
            name,
            displayName: name,
            category: newCategory,
            defaultUnit: newCategory === 'finished' ? 'each' : 'g',
            isCannabis: true,
            processTypes: [],
        });
        setNewName('');
        setIsAdding(false);
        await load();
    };

    const handleUpdate = async (pt: ProductType, updates: Partial<ProductType>) => {
        await apiService.upsertProductType({
            id: pt.id,
            name: pt.name,
            displayName: updates.displayName ?? pt.displayName,
            category: updates.category ?? pt.category,
            defaultUnit: updates.defaultUnit ?? pt.defaultUnit,
            isCannabis: updates.isCannabis ?? pt.isCannabis,
            processTypes: updates.processTypes ?? pt.processTypes,
            isActive: updates.isActive ?? pt.isActive,
            sortOrder: pt.sortOrder,
        });
        await load();
    };

    const handleDeactivate = async (pt: ProductType) => {
        await handleUpdate(pt, { isActive: !pt.isActive });
    };

    const visible = categoryFilter
        ? productTypes.filter(pt => pt.category === categoryFilter)
        : productTypes;

    // Group by category for the table rendering
    const categoryCounts = productTypes.reduce<Record<string, number>>((acc, pt) => {
        acc[pt.category] = (acc[pt.category] || 0) + 1;
        return acc;
    }, {});

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Product Catalog</h3>
                    <p className="settings-section-desc">
                        Every material and product in your operation. Used by SOPs, packages, and the planner.
                    </p>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                        <Plus size={14} /> Add Product Type
                    </button>
                )}
            </div>

            {/* Category filter pills */}
            <div className="product-type-filters">
                <button
                    className={`product-type-filter-pill ${!categoryFilter ? 'product-type-filter-pill--active' : ''}`}
                    onClick={() => setCategoryFilter(null)}
                >
                    All <span className="product-type-filter-count">{productTypes.length}</span>
                </button>
                {CATEGORY_OPTIONS.map(c => (
                    <button
                        key={c.value}
                        className={`product-type-filter-pill ${categoryFilter === c.value ? 'product-type-filter-pill--active' : ''}`}
                        onClick={() => setCategoryFilter(prev => prev === c.value ? null : c.value)}
                    >
                        {c.label} <span className="product-type-filter-count">{categoryCounts[c.value] || 0}</span>
                    </button>
                ))}
            </div>

            {isAdding && (
                <div className="settings-add-form">
                    <div className="flex gap-2 items-center">
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Display name (e.g. Live Rosin Jar)"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                            className="field-input flex-1"
                        />
                        <select
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value as ProductType['category'])}
                            className="field-input"
                            style={{ width: 140 }}
                        >
                            {CATEGORY_OPTIONS.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        <button onClick={handleAdd} className="btn-primary text-sm px-3 py-1.5">Save</button>
                        <button onClick={() => { setIsAdding(false); setNewName(''); }} className="btn-cancel text-sm px-3 py-1.5">Cancel</button>
                    </div>
                    <p className="product-type-add-hint">
                        After saving, you can assign it to specific extraction pathways (Solventless, BHO, etc.) by clicking the pills in its row.
                    </p>
                </div>
            )}

            {loading ? (
                <CenteredSpinner label="Loading product catalog…" height="py-12" />
            ) : visible.length === 0 ? (
                <div className="settings-empty">
                    No product types {categoryFilter ? `in ${CATEGORY_LABELS[categoryFilter]}` : 'yet'}.{' '}
                    {!isAdding && (
                        <button onClick={() => setIsAdding(true)} className="settings-empty-action">
                            Add your first product type
                        </button>
                    )}
                </div>
            ) : (
                <div className="settings-table-wrap">
                    <table className="product-type-table">
                        <thead>
                            <tr>
                                <th className="product-type-th">Product</th>
                                <th className="product-type-th">Category</th>
                                <th className="product-type-th">Unit</th>
                                <th className="product-type-th">Pathways</th>
                                <th className="product-type-th" style={{ width: 48, textAlign: 'center', padding: '0.6875rem 0.25rem' }} title="Cannabis">
                                    <Leaf size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                                </th>
                                <th className="product-type-th" style={{ width: 44 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(pt => (
                                <ProductTypeRow
                                    key={pt.id}
                                    pt={pt}
                                    onUpdate={updates => handleUpdate(pt, updates)}
                                    onDeactivate={() => handleDeactivate(pt)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
