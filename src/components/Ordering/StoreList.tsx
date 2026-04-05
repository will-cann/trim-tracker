import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import type { Store } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, Modal } from '../ui';
import type { Column } from '../ui';

interface Props {
    stores: Store[];
    loading: boolean;
    onRefresh: () => Promise<void>;
}

const EMPTY: Partial<Store> = { name: '', posStoreId: '', address: '', vaultCapacityNotes: '' };

export const StoreList: React.FC<Props> = ({ stores, loading, onRefresh }) => {
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Partial<Store>>(EMPTY);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            await apiService.saveStore({
                storeId: editing.id,
                name: editing.name.trim(),
                posStoreId: editing.posStoreId || undefined,
                address: editing.address || undefined,
                vaultCapacityNotes: editing.vaultCapacityNotes || undefined,
            });
            setShowForm(false);
            setEditing(EMPTY);
            await onRefresh();
        } finally {
            setSaving(false);
        }
    };

    const columns: Column<Store>[] = [
        { key: 'name', label: 'Store Name', sortable: true,
            render: (s) => <span style={{ fontWeight: 500 }}>{s.name}</span>,
        },
        { key: 'address', label: 'Address',
            render: (s) => s.address || <span style={{ color: '#959595' }}>--</span>,
        },
        { key: 'posStoreId', label: 'POS ID', width: 120,
            render: (s) => s.posStoreId ? <code style={{ fontSize: '0.75rem' }}>{s.posStoreId}</code> : '--',
        },
        { key: 'vaultCapacityNotes', label: 'Vault Notes',
            render: (s) => s.vaultCapacityNotes || <span style={{ color: '#959595' }}>--</span>,
        },
        {
            key: 'actions', label: '', width: 50,
            render: (s) => (
                <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(s); setShowForm(true); }}>
                    <Pencil size={14} />
                </button>
            ),
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-md) 0' }}>
                <button className="btn-primary" onClick={() => { setEditing(EMPTY); setShowForm(true); }}>
                    <Plus size={15} style={{ marginRight: 4 }} /> Add Store
                </button>
            </div>

            <DataTable
                columns={columns}
                data={stores}
                loading={loading}
                emptyMessage="Add your retail locations here. Each store gets its own column in the order builder so you can order per-location."
            />

            {showForm && (
                <Modal
                    title={editing.id ? 'Edit Store' : 'Add Store'}
                    onClose={() => { setShowForm(false); setEditing(EMPTY); }}
                    contentClassName="creation-modal"
                    footer={
                        <>
                            <button className="btn-cancel" onClick={() => { setShowForm(false); setEditing(EMPTY); }}>Cancel</button>
                            <button className="btn-primary" disabled={saving || !editing.name?.trim()} onClick={handleSave}>
                                {saving ? 'Saving...' : editing.id ? 'Update' : 'Add Store'}
                            </button>
                        </>
                    }
                >
                    <div className="field">
                        <label className="field-label">Store Name *</label>
                        <input className="field-input" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} autoFocus />
                    </div>
                    <div className="field">
                        <label className="field-label">Address</label>
                        <input className="field-input" value={editing.address || ''} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="field">
                            <label className="field-label">POS Store ID (Dutchie)</label>
                            <input className="field-input" value={editing.posStoreId || ''} onChange={e => setEditing(p => ({ ...p, posStoreId: e.target.value }))} placeholder="For future POS sync" />
                        </div>
                        <div className="field">
                            <label className="field-label">Vault Capacity Notes</label>
                            <input className="field-input" value={editing.vaultCapacityNotes || ''} onChange={e => setEditing(p => ({ ...p, vaultCapacityNotes: e.target.value }))} />
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};
