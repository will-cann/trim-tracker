import { useState } from 'react';
import { Plus, ShoppingCart, Pencil, Trash2 } from 'lucide-react';
import type { Vendor } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, Modal } from '../ui';
import type { Column } from '../ui';

interface Props {
    vendors: Vendor[];
    loading: boolean;
    onRefresh: () => Promise<void>;
    onStartOrder: (vendorId: string) => void;
}

const EMPTY: Partial<Vendor> = {
    name: '', contactName: '', contactEmail: '', contactPhone: '',
    leadTimeDays: 3, orderCadenceDays: 7, notes: '',
};

export const VendorList: React.FC<Props> = ({ vendors, loading, onRefresh, onStartOrder }) => {
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Partial<Vendor>>(EMPTY);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            if (editing.id) {
                await apiService.updateVendor(editing.id, editing);
            } else {
                await apiService.createVendor(editing as any);
            }
            setShowForm(false);
            setEditing(EMPTY);
            await onRefresh();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this vendor and all associated products?')) return;
        await apiService.deleteVendor(id);
        await onRefresh();
    };

    const columns: Column<Vendor>[] = [
        {
            key: 'name', label: 'Vendor', sortable: true,
            render: (v) => <span style={{ fontWeight: 500 }}>{v.name}</span>,
        },
        { key: 'contactName', label: 'Contact', sortable: true,
            render: (v) => v.contactName || <span style={{ color: '#959595' }}>--</span>,
        },
        { key: 'contactEmail', label: 'Email',
            render: (v) => v.contactEmail || <span style={{ color: '#959595' }}>--</span>,
        },
        { key: 'leadTimeDays', label: 'Lead Time', width: 100, align: 'center',
            render: (v) => `${v.leadTimeDays}d`,
        },
        { key: 'orderCadenceDays', label: 'Cadence', width: 100, align: 'center',
            render: (v) => `${v.orderCadenceDays}d`,
        },
        { key: 'productCount', label: 'Products', width: 90, align: 'center',
            render: (v) => v.productCount,
        },
        { key: 'orderCount', label: 'Orders', width: 80, align: 'center',
            render: (v) => v.orderCount,
        },
        {
            key: 'actions', label: '', width: 120,
            render: (v) => (
                <div className="flex items-center gap-1">
                    <button className="icon-btn" title="New order" onClick={(e) => { e.stopPropagation(); onStartOrder(v.id); }}>
                        <ShoppingCart size={14} />
                    </button>
                    <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(v); setShowForm(true); }}>
                        <Pencil size={14} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}>
                        <Trash2 size={14} color="#DF5B59" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-md) 0' }}>
                <button className="btn-primary" onClick={() => { setEditing(EMPTY); setShowForm(true); }}>
                    <Plus size={15} style={{ marginRight: 4 }} /> Add Vendor
                </button>
            </div>

            <DataTable
                columns={columns}
                data={vendors}
                loading={loading}
                emptyMessage="No vendors yet. Add your first vendor to start building orders."
            />

            {showForm && (
                <Modal
                    title={editing.id ? 'Edit Vendor' : 'Add Vendor'}
                    onClose={() => { setShowForm(false); setEditing(EMPTY); }}
                    contentClassName="creation-modal"
                    footer={
                        <>
                            <button className="btn-cancel" onClick={() => { setShowForm(false); setEditing(EMPTY); }}>Cancel</button>
                            <button className="btn-primary" disabled={saving || !editing.name?.trim()} onClick={handleSave}>
                                {saving ? 'Saving...' : editing.id ? 'Update' : 'Add Vendor'}
                            </button>
                        </>
                    }
                >
                    <div className="field">
                        <label className="field-label">Vendor Name *</label>
                        <input className="field-input" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} autoFocus />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">Contact Name</label>
                            <input className="field-input" value={editing.contactName || ''} onChange={e => setEditing(p => ({ ...p, contactName: e.target.value }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Email</label>
                            <input className="field-input" type="email" value={editing.contactEmail || ''} onChange={e => setEditing(p => ({ ...p, contactEmail: e.target.value }))} />
                        </div>
                    </div>
                    <div className="field">
                        <label className="field-label">Phone</label>
                        <input className="field-input" value={editing.contactPhone || ''} onChange={e => setEditing(p => ({ ...p, contactPhone: e.target.value }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">Lead Time (days)</label>
                            <input className="field-input" type="number" min={0} value={editing.leadTimeDays ?? 3} onChange={e => setEditing(p => ({ ...p, leadTimeDays: +e.target.value }))} />
                        </div>
                        <div className="field">
                            <label className="field-label">Order Cadence (days)</label>
                            <input className="field-input" type="number" min={1} value={editing.orderCadenceDays ?? 7} onChange={e => setEditing(p => ({ ...p, orderCadenceDays: +e.target.value }))} />
                        </div>
                    </div>
                    <div className="field">
                        <label className="field-label">Notes</label>
                        <textarea className="field-input" rows={3} value={editing.notes || ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                </Modal>
            )}
        </>
    );
};
