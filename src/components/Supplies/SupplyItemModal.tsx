import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { SupplyItem, SupplyPoolSlug } from '../../types/definitions';

const UNIT_OPTIONS: { value: string; label: string }[] = [
    { value: 'ea', label: 'Each' },
    { value: 'box', label: 'Box' },
    { value: 'case', label: 'Case' },
    { value: 'bag', label: 'Bag' },
    { value: 'roll', label: 'Roll' },
    { value: 'gal', label: 'Gallon' },
    { value: 'L', label: 'Liter' },
    { value: 'mL', label: 'mL' },
    { value: 'lb', label: 'Pound' },
    { value: 'oz', label: 'Ounce' },
];

const CATEGORY_OPTIONS: Record<SupplyPoolSlug, { value: string; label: string }[]> = {
    extraction: [
        { value: 'carts', label: 'Carts' },
        { value: 'filters', label: 'Filters' },
        { value: 'bags', label: 'Bags' },
        { value: 'parchment', label: 'Parchment' },
        { value: 'screens', label: 'Screens' },
        { value: 'tubes', label: 'Tubes / Jars' },
        { value: 'other', label: 'Other' },
    ],
    cultivation: [
        { value: 'nutrients', label: 'Nutrients' },
        { value: 'soil', label: 'Soil / Media' },
        { value: 'ipm', label: 'IPM' },
        { value: 'beneficial_insects', label: 'Beneficial Insects' },
        { value: 'grow_media', label: 'Grow Media' },
        { value: 'other', label: 'Other' },
    ],
    facility: [
        { value: 'gloves', label: 'Gloves' },
        { value: 'ppe', label: 'PPE' },
        { value: 'cleaning', label: 'Cleaning' },
        { value: 'labels', label: 'Labels' },
        { value: 'bags', label: 'Bags' },
        { value: 'tools', label: 'Tools' },
        { value: 'other', label: 'Other' },
    ],
};

interface SupplyItemModalProps {
    poolSlug: SupplyPoolSlug;
    item?: SupplyItem | null;
    onSave: (data: Partial<SupplyItem> & { poolSlug: string; name: string }) => Promise<unknown>;
    onClose: () => void;
}

export const SupplyItemModal = ({ poolSlug, item, onSave, onClose }: SupplyItemModalProps) => {
    const [name, setName] = useState(item?.name ?? '');
    const [description, setDescription] = useState(item?.description ?? '');
    const [category, setCategory] = useState(item?.category ?? '');
    const [unit, setUnit] = useState(item?.unit ?? 'ea');
    const [parLevel, setParLevel] = useState(item?.parLevel?.toString() ?? '');
    const [reorderQty, setReorderQty] = useState(item?.reorderQty?.toString() ?? '');
    const [vendorName, setVendorName] = useState(item?.vendorName ?? '');
    const [sku, setSku] = useState(item?.sku ?? '');
    const [unitCost, setUnitCost] = useState(item?.unitCost?.toString() ?? '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        try {
            await onSave({
                id: item?.id,
                poolSlug,
                name: name.trim(),
                description: description.trim() || undefined,
                category: category || undefined,
                unit,
                parLevel: parLevel ? Number(parLevel) : undefined,
                reorderQty: reorderQty ? Number(reorderQty) : undefined,
                vendorName: vendorName.trim() || undefined,
                sku: sku.trim() || undefined,
                unitCost: unitCost ? Number(unitCost) : undefined,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const categories = CATEGORY_OPTIONS[poolSlug] || CATEGORY_OPTIONS.facility;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content creation-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{item ? 'Edit Supply Item' : 'Add Supply Item'}</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                    <div className="modal-body">
                        <div className="field">
                            <label className="field-label">Name <span className="required">*</span></label>
                            <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 0.5g Carts" autoFocus />
                        </div>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Category</label>
                                <select className="field-input" value={category} onChange={e => setCategory(e.target.value)}>
                                    <option value="">-- Select --</option>
                                    {categories.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label className="field-label">Unit</label>
                                <select className="field-input" value={unit} onChange={e => setUnit(e.target.value)}>
                                    {UNIT_OPTIONS.map(u => (
                                        <option key={u.value} value={u.value}>{u.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Par Level</label>
                                <input className="field-input" type="number" min="0" step="any" value={parLevel} onChange={e => setParLevel(e.target.value)} placeholder="Reorder threshold" />
                            </div>
                            <div className="field">
                                <label className="field-label">Reorder Qty</label>
                                <input className="field-input" type="number" min="0" step="any" value={reorderQty} onChange={e => setReorderQty(e.target.value)} placeholder="Order amount" />
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Vendor</label>
                                <input className="field-input" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Supplier name" />
                            </div>
                            <div className="field">
                                <label className="field-label">SKU</label>
                                <input className="field-input" value={sku} onChange={e => setSku(e.target.value)} placeholder="Vendor SKU" />
                            </div>
                        </div>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Unit Cost ($)</label>
                                <input className="field-input" type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" />
                            </div>
                            <div className="field">
                                <label className="field-label">Description</label>
                                <input className="field-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" />
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={!name.trim() || saving}>
                            {saving ? 'Saving...' : item ? 'Update' : 'Add Item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
