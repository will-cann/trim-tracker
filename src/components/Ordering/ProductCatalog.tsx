import { useState, useMemo } from 'react';
import { Plus, Leaf, Flame, Candy, Droplets, Wind, Sparkles, FlaskConical, Package } from 'lucide-react';
import type { Vendor, VendorProduct } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, FilterToolbar, Modal } from '../ui';
import type { Column, FilterDef } from '../ui';

const CATEGORY_STYLES: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
    flower:      { bg: '#E8F8EE', color: '#1A7A42', icon: <Leaf size={11} />,          label: 'Flower' },
    'pre-roll':  { bg: '#FFF3E8', color: '#B06A1F', icon: <Flame size={11} />,         label: 'Pre-Roll' },
    edible:      { bg: '#FCE8F0', color: '#A8305C', icon: <Candy size={11} />,          label: 'Edible' },
    concentrate: { bg: '#FEF3E2', color: '#8B5E14', icon: <Droplets size={11} />,       label: 'Concentrate' },
    vape:        { bg: '#E8F0FE', color: '#1B5EB5', icon: <Wind size={11} />,           label: 'Vape' },
    topical:     { bg: '#F0E8FE', color: '#6B3FA0', icon: <Sparkles size={11} />,       label: 'Topical' },
    tincture:    { bg: '#E8FEFA', color: '#167A6F', icon: <FlaskConical size={11} />,   label: 'Tincture' },
    accessory:   { bg: '#F1F1F1', color: '#1A1A1A', icon: <Package size={11} />,        label: 'Accessory' },
};

const CategoryBadge: React.FC<{ category: string | null }> = ({ category }) => {
    if (!category) return <span style={{ color: '#959595' }}>--</span>;
    const style = CATEGORY_STYLES[category.toLowerCase()];
    if (!style) {
        return <span className="data-table-badge data-table-badge--muted">{category}</span>;
    }
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: '0.6875rem',
            fontWeight: 700,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            background: style.bg,
            color: style.color,
        }}>
            {style.icon}
            {style.label}
        </span>
    );
};

interface Props {
    products: VendorProduct[];
    vendors: Vendor[];
    loading: boolean;
    onRefresh: () => Promise<void>;
}

const EMPTY: Partial<VendorProduct> & { vendorId?: string } = {
    vendorId: '', name: '', brand: '', category: '', sku: '',
    unitSize: '', caseSize: null, unitPrice: null, casePrice: null,
};

const fmt = (n: number | null) => n != null ? `$${n.toFixed(2)}` : '--';

export const ProductCatalog: React.FC<Props> = ({ products, vendors, loading, onRefresh }) => {
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Partial<VendorProduct> & { vendorId?: string }>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach(p => { if (p.category) cats.add(p.category); });
        return Array.from(cats).sort();
    }, [products]);

    const filtered = useMemo(() => {
        let list = products;
        if (vendorFilter) list = list.filter(p => p.vendorId === vendorFilter);
        if (categoryFilter) list = list.filter(p => p.category === categoryFilter);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
        }
        if (sortKey) {
            list = [...list].sort((a, b) => {
                let av: any, bv: any;
                switch (sortKey) {
                    case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
                    case 'vendorName': av = (a.vendorName || '').toLowerCase(); bv = (b.vendorName || '').toLowerCase(); break;
                    case 'category': av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); break;
                    case 'sku': av = (a.sku || '').toLowerCase(); bv = (b.sku || '').toLowerCase(); break;
                    case 'caseSize': av = a.caseSize ?? 0; bv = b.caseSize ?? 0; break;
                    case 'unitPrice': av = a.unitPrice ?? 0; bv = b.unitPrice ?? 0; break;
                    case 'casePrice': av = a.casePrice ?? 0; bv = b.casePrice ?? 0; break;
                    default: return 0;
                }
                if (av < bv) return sortDir === 'asc' ? -1 : 1;
                if (av > bv) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return list;
    }, [products, vendorFilter, categoryFilter, search, sortKey, sortDir]);

    const handleSave = async () => {
        if (!editing.vendorId || !editing.name?.trim()) return;
        setSaving(true);
        try {
            await apiService.upsertVendorProduct({
                vendorId: editing.vendorId,
                productId: editing.id,
                name: editing.name.trim(),
                brand: editing.brand || undefined,
                category: editing.category || undefined,
                sku: editing.sku || undefined,
                unitSize: editing.unitSize || undefined,
                caseSize: editing.caseSize || undefined,
                unitPrice: editing.unitPrice || undefined,
                casePrice: editing.casePrice || undefined,
            });
            setShowForm(false);
            setEditing(EMPTY);
            await onRefresh();
        } finally {
            setSaving(false);
        }
    };

    const filters: FilterDef[] = [
        {
            key: 'vendor', label: 'Vendor',
            options: [{ value: '', label: 'All Vendors' }, ...vendors.map(v => ({ value: v.id, label: v.name }))],
        },
        {
            key: 'category', label: 'Category',
            options: [
                { value: '', label: 'All Categories' },
                ...categories.map(c => {
                    const s = CATEGORY_STYLES[c.toLowerCase()];
                    return { value: c, label: s?.label || c.charAt(0).toUpperCase() + c.slice(1), dot: undefined };
                }),
            ],
        },
    ];

    const activeFilters: Record<string, string[]> = {
        ...(vendorFilter ? { vendor: [vendorFilter] } : {}),
        ...(categoryFilter ? { category: [categoryFilter] } : {}),
    };
    const handleFilterChange = (key: string, values: string[]) => {
        if (key === 'vendor') setVendorFilter(values[0] || '');
        if (key === 'category') setCategoryFilter(values[0] || '');
    };
    const handleClearFilters = () => { setVendorFilter(''); setCategoryFilter(''); };
    const handleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortKey(null); setSortDir('asc'); }
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const columns: Column<VendorProduct>[] = [
        { key: 'name', label: 'Product', sortable: true,
            render: (p) => (
                <div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    {p.brand && <span style={{ color: '#959595', marginLeft: 6, fontSize: '0.75rem' }}>{p.brand}</span>}
                </div>
            ),
        },
        { key: 'vendorName', label: 'Vendor', sortable: true,
            render: (p) => p.vendorName || '--',
        },
        { key: 'category', label: 'Category', sortable: true,
            render: (p) => <CategoryBadge category={p.category} />,
        },
        { key: 'sku', label: 'SKU', width: 100, sortable: true,
            render: (p) => p.sku ? <code style={{ fontSize: '0.75rem' }}>{p.sku}</code> : '--',
        },
        { key: 'unitSize', label: 'Unit', width: 80, render: (p) => p.unitSize || '--' },
        { key: 'caseSize', label: 'Case', width: 70, align: 'center', sortable: true, render: (p) => p.caseSize ?? '--' },
        { key: 'unitPrice', label: 'Unit $', width: 80, align: 'right', sortable: true, render: (p) => fmt(p.unitPrice) },
        { key: 'casePrice', label: 'Case $', width: 80, align: 'right', sortable: true, render: (p) => fmt(p.casePrice) },
    ];

    return (
        <>
            <div style={{ padding: 'var(--space-md) 0' }}>
                <FilterToolbar
                    filters={filters}
                    activeFilters={activeFilters}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search products..."
                    trailing={
                        <button className="btn-primary" onClick={() => { setEditing({ ...EMPTY, vendorId: vendorFilter || vendors[0]?.id || '' }); setShowForm(true); }}>
                            <Plus size={15} style={{ marginRight: 4 }} /> Add Product
                        </button>
                    }
                />
            </div>

            <DataTable
                columns={columns}
                data={filtered}
                loading={loading}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                emptyMessage="No products found. Add products manually or upload a vendor menu."
                onRowClick={(p) => { setEditing({ ...p }); setShowForm(true); }}
            />

            {showForm && (
                <Modal
                    title={editing.id ? 'Edit Product' : 'Add Product'}
                    onClose={() => { setShowForm(false); setEditing(EMPTY); }}
                    contentClassName="creation-modal"
                    footer={
                        <>
                            <button className="btn-cancel" onClick={() => { setShowForm(false); setEditing(EMPTY); }}>Cancel</button>
                            <button className="btn-primary" disabled={saving || !editing.name?.trim() || !editing.vendorId} onClick={handleSave}>
                                {saving ? 'Saving...' : editing.id ? 'Update' : 'Add Product'}
                            </button>
                        </>
                    }
                >
                    <div className="field">
                        <label className="field-label">Vendor *</label>
                        <select className="field-input" value={editing.vendorId || ''} onChange={e => setEditing(p => ({ ...p, vendorId: e.target.value }))}>
                            <option value="">Select vendor...</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                    </div>
                    <div className="field">
                        <label className="field-label">Product Name *</label>
                        <input className="field-input" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} autoFocus />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">Brand</label>
                            <input className="field-input" value={editing.brand || ''} onChange={e => setEditing(p => ({ ...p, brand: e.target.value }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Category</label>
                            <input className="field-input" value={editing.category || ''} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">SKU</label>
                            <input className="field-input" value={editing.sku || ''} onChange={e => setEditing(p => ({ ...p, sku: e.target.value }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Unit Size</label>
                            <input className="field-input" value={editing.unitSize || ''} onChange={e => setEditing(p => ({ ...p, unitSize: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">Case Size</label>
                            <input className="field-input" type="number" min={1} value={editing.caseSize ?? ''} onChange={e => setEditing(p => ({ ...p, caseSize: e.target.value ? +e.target.value : null }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Unit Price</label>
                            <input className="field-input" type="number" step="0.01" min={0} value={editing.unitPrice ?? ''} onChange={e => setEditing(p => ({ ...p, unitPrice: e.target.value ? +e.target.value : null }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Case Price</label>
                            <input className="field-input" type="number" step="0.01" min={0} value={editing.casePrice ?? ''} onChange={e => setEditing(p => ({ ...p, casePrice: e.target.value ? +e.target.value : null }))} />
                        </div>
                    </div>
                </Modal>
            )}

        </>
    );
};
