import { useState, useRef, useEffect } from 'react';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
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

// ── Inline editable cell ────────────────────────────────────────────────────

const EditableCell = ({
    value,
    placeholder,
    type = 'text',
    suffix,
    onSave,
}: {
    value: string | number | null | undefined;
    placeholder: string;
    type?: 'text' | 'number' | 'email';
    suffix?: string;
    onSave: (val: string) => void;
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value ?? ''));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
    useEffect(() => { setDraft(String(value ?? '')); }, [value]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== String(value ?? '')) {
            onSave(trimmed);
        }
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                type={type}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false); }
                }}
                className="field-input"
                style={{ padding: '4px 8px', fontSize: '0.8125rem', minWidth: 80 }}
                placeholder={placeholder}
            />
        );
    }

    const display = value != null && String(value) !== '' ? String(value) : null;

    return (
        <button
            onClick={() => setEditing(true)}
            style={{
                background: 'none', border: 'none', cursor: 'text', textAlign: 'left',
                padding: '4px 8px', margin: '-4px -8px', borderRadius: 4, width: 'calc(100% + 16px)',
                minHeight: 28, display: 'flex', alignItems: 'center',
                color: display ? 'var(--text-color)' : 'var(--border-color)',
                fontSize: '0.8125rem',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--background-color)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
            {display ? (
                <>{display}{suffix && <span style={{ color: 'var(--text-secondary)', marginLeft: 2 }}>{suffix}</span>}</>
            ) : (
                placeholder
            )}
        </button>
    );
};

// ── VendorList ──────────────────────────────────────────────────────────────

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

    const handleInlineUpdate = async (id: string, field: string, value: string) => {
        const update: Record<string, any> = {};
        if (field === 'leadTimeDays' || field === 'orderCadenceDays') {
            update[field] = value ? Number(value) : null;
        } else {
            update[field] = value || null;
        }
        await apiService.updateVendor(id, update);
        await onRefresh();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this vendor and all associated products?')) return;
        await apiService.deleteVendor(id);
        await onRefresh();
    };

    const columns: Column<Vendor>[] = [
        {
            key: 'name', label: 'Vendor', sortable: true,
            render: (v) => (
                <EditableCell
                    value={v.name}
                    placeholder="Vendor name"
                    onSave={val => handleInlineUpdate(v.id, 'name', val)}
                />
            ),
        },
        { key: 'contactName', label: 'Contact', sortable: true,
            render: (v) => (
                <EditableCell
                    value={v.contactName}
                    placeholder="Add contact"
                    onSave={val => handleInlineUpdate(v.id, 'contactName', val)}
                />
            ),
        },
        { key: 'contactEmail', label: 'Email',
            render: (v) => (
                <EditableCell
                    value={v.contactEmail}
                    placeholder="Add email"
                    type="email"
                    onSave={val => handleInlineUpdate(v.id, 'contactEmail', val)}
                />
            ),
        },
        { key: 'leadTimeDays', label: 'Lead', width: 80, align: 'center',
            render: (v) => (
                <EditableCell
                    value={v.leadTimeDays}
                    placeholder="--"
                    type="number"
                    suffix="d"
                    onSave={val => handleInlineUpdate(v.id, 'leadTimeDays', val)}
                />
            ),
        },
        { key: 'orderCadenceDays', label: 'Cadence', width: 90, align: 'center',
            render: (v) => (
                <EditableCell
                    value={v.orderCadenceDays}
                    placeholder="--"
                    type="number"
                    suffix="d"
                    onSave={val => handleInlineUpdate(v.id, 'orderCadenceDays', val)}
                />
            ),
        },
        { key: 'productCount', label: 'Products', width: 80, align: 'center',
            render: (v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{v.productCount}</span>,
        },
        {
            key: 'actions', label: '', width: 80,
            render: (v) => (
                <div className="flex items-center gap-1">
                    <button className="icon-btn" title="New order" onClick={(e) => { e.stopPropagation(); onStartOrder(v.id); }}>
                        <ShoppingCart size={14} />
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
                emptyMessage="Your vendor list builds automatically when you upload menus. You can also add vendors manually."
            />

            {showForm && (
                <Modal
                    title="Add Vendor"
                    onClose={() => { setShowForm(false); setEditing(EMPTY); }}
                    contentClassName="creation-modal"
                    footer={
                        <>
                            <button className="btn-cancel" onClick={() => { setShowForm(false); setEditing(EMPTY); }}>Cancel</button>
                            <button className="btn-primary" disabled={saving || !editing.name?.trim()} onClick={handleSave}>
                                {saving ? 'Saving...' : 'Add Vendor'}
                            </button>
                        </>
                    }
                >
                    <div className="field">
                        <label className="field-label">Vendor Name *</label>
                        <input className="field-input" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} autoFocus />
                    </div>
                    <div className="field-row">
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
                    <div className="field-row">
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
