import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { Vendor, VendorProduct } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, FilterToolbar, Modal } from '../ui';
import type { Column, FilterDef } from '../ui';

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

    const filtered = useMemo(() => {
        let list = products;
        if (vendorFilter) list = list.filter(p => p.vendorId === vendorFilter);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
        }
        return list;
    }, [products, vendorFilter, search]);

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
    ];

    const activeFilters: Record<string, string[]> = vendorFilter ? { vendor: [vendorFilter] } : {};
    const handleFilterChange = (key: string, values: string[]) => {
        if (key === 'vendor') setVendorFilter(values[0] || '');
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
            render: (p) => p.category ? (
                <span className="data-table-badge data-table-badge--muted">{p.category}</span>
            ) : <span style={{ color: '#959595' }}>--</span>,
        },
        { key: 'sku', label: 'SKU', width: 100,
            render: (p) => p.sku ? <code style={{ fontSize: '0.75rem' }}>{p.sku}</code> : '--',
        },
        { key: 'unitSize', label: 'Unit', width: 80, render: (p) => p.unitSize || '--' },
        { key: 'caseSize', label: 'Case', width: 70, align: 'center', render: (p) => p.caseSize ?? '--' },
        { key: 'unitPrice', label: 'Unit $', width: 80, align: 'right', render: (p) => fmt(p.unitPrice) },
        { key: 'casePrice', label: 'Case $', width: 80, align: 'right', render: (p) => fmt(p.casePrice) },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md) 0' }}>
                <FilterToolbar
                    filters={filters}
                    activeFilters={activeFilters}
                    onFilterChange={handleFilterChange}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Search products..."
                />
                <button className="btn-primary" onClick={() => { setEditing({ ...EMPTY, vendorId: vendorFilter || vendors[0]?.id || '' }); setShowForm(true); }}>
                    <Plus size={15} style={{ marginRight: 4 }} /> Add Product
                </button>
            </div>

            <DataTable
                columns={columns}
                data={filtered}
                loading={loading}
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
