import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, ShoppingCart, Trash2, Leaf, Package } from 'lucide-react';
import type { Vendor, VendorType } from '../../types/definitions';
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
    vendorType: 'consumables', preferredChannel: 'email',
    strainsGrown: null, qualityNotes: '', preferredUnits: '', licenseNumber: '',
};

type TypeFilter = 'all' | VendorType;

const TYPE_LABELS: Record<VendorType, string> = {
    consumables: 'Consumables',
    biomass: 'Biomass',
    both: 'Both',
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
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [strainInput, setStrainInput] = useState('');

    // Counts mirror the filter: 'biomass' and 'consumables' both include 'both'-type vendors.
    const counts = useMemo(() => {
        const c: Record<TypeFilter, number> = { all: vendors.length, consumables: 0, biomass: 0, both: 0 };
        for (const v of vendors) {
            const t = v.vendorType ?? 'consumables';
            if (t === 'consumables' || t === 'both') c.consumables++;
            if (t === 'biomass' || t === 'both') c.biomass++;
            if (t === 'both') c.both++;
        }
        return c;
    }, [vendors]);

    const filtered = useMemo(() => {
        if (typeFilter === 'all') return vendors;
        return vendors.filter(v => {
            const t = v.vendorType ?? 'consumables';
            if (typeFilter === 'biomass') return t === 'biomass' || t === 'both';
            if (typeFilter === 'consumables') return t === 'consumables' || t === 'both';
            return t === typeFilter;
        });
    }, [vendors, typeFilter]);

    const handleSave = async () => {
        if (!editing.name?.trim()) return;
        setSaving(true);
        try {
            // Merge any in-progress strain input into strainsGrown before saving
            const pending = strainInput.trim();
            const strains = [
                ...(editing.strainsGrown ?? []),
                ...(pending ? [pending] : []),
            ].filter(Boolean);
            const payload: Partial<Vendor> = {
                ...editing,
                strainsGrown: strains.length ? strains : null,
            };
            // Only biomass/both carry biomass fields on create
            if (payload.vendorType === 'consumables') {
                payload.strainsGrown = null;
                payload.licenseNumber = null;
                payload.qualityNotes = null;
                payload.preferredUnits = null;
            }
            if (editing.id) {
                await apiService.updateVendor(editing.id, payload);
            } else {
                await apiService.createVendor(payload as any);
            }
            setShowForm(false);
            setEditing(EMPTY);
            setStrainInput('');
            await onRefresh();
        } finally {
            setSaving(false);
        }
    };

    const addStrain = () => {
        const val = strainInput.trim();
        if (!val) return;
        const current = editing.strainsGrown ?? [];
        if (current.includes(val)) { setStrainInput(''); return; }
        setEditing(p => ({ ...p, strainsGrown: [...current, val] }));
        setStrainInput('');
    };

    const removeStrain = (s: string) => {
        const current = editing.strainsGrown ?? [];
        setEditing(p => ({ ...p, strainsGrown: current.filter(x => x !== s) }));
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <EditableCell
                        value={v.name}
                        placeholder="Vendor name"
                        onSave={val => handleInlineUpdate(v.id, 'name', val)}
                    />
                    {(v.vendorType === 'biomass' || v.vendorType === 'both') && (
                        <span
                            title={TYPE_LABELS[v.vendorType]}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                padding: '2px 6px', borderRadius: 999,
                                background: 'rgba(59, 181, 112, 0.12)',
                                color: 'var(--color-flower)',
                                fontSize: '0.6875rem', fontWeight: 600,
                            }}
                        >
                            <Leaf size={10} /> {v.vendorType === 'both' ? 'Both' : 'Biomass'}
                        </span>
                    )}
                </div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'var(--space-md) 0' }}>
                <div className="run-list-filters" role="tablist" aria-label="Filter vendors by type">
                    {(['all', 'consumables', 'biomass'] as TypeFilter[]).map(key => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={typeFilter === key}
                            className={`run-filter-pill${typeFilter === key ? ' run-filter-pill--active' : ''}`}
                            onClick={() => setTypeFilter(key)}
                        >
                            {key === 'all' ? 'All' : TYPE_LABELS[key as VendorType]}
                            <span className="run-filter-count">{counts[key]}</span>
                        </button>
                    ))}
                </div>
                <button className="btn-primary" onClick={() => { setEditing(EMPTY); setStrainInput(''); setShowForm(true); }}>
                    <Plus size={15} style={{ marginRight: 4 }} /> Add Vendor
                </button>
            </div>

            <DataTable
                columns={columns}
                data={filtered}
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
                    <div className="field">
                        <label className="field-label">Vendor Type</label>
                        <div className="run-list-filters" role="radiogroup" aria-label="Vendor type">
                            {(['consumables', 'biomass', 'both'] as VendorType[]).map(t => {
                                const active = (editing.vendorType ?? 'consumables') === t;
                                const Icon = t === 'consumables' ? Package : Leaf;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        className={`run-filter-pill${active ? ' run-filter-pill--active' : ''}`}
                                        onClick={() => setEditing(p => ({ ...p, vendorType: t }))}
                                    >
                                        <Icon size={12} style={{ marginRight: 4 }} />
                                        {TYPE_LABELS[t]}
                                    </button>
                                );
                            })}
                        </div>
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
                    <div className="field-row">
                        <div className="field">
                            <label className="field-label">Preferred Channel</label>
                            <select
                                className="field-input"
                                value={editing.preferredChannel ?? 'email'}
                                onChange={e => setEditing(p => ({ ...p, preferredChannel: e.target.value as 'email' | 'sms' }))}
                            >
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                        </div>
                    </div>
                    {(editing.vendorType === 'biomass' || editing.vendorType === 'both') && (
                        <fieldset style={{
                            border: '1px solid var(--border-color)', borderRadius: 8,
                            padding: 'var(--space-md)', marginTop: 'var(--space-sm)',
                        }}>
                            <legend style={{
                                padding: '0 6px', fontSize: '0.75rem', fontWeight: 600,
                                color: 'var(--color-flower)',
                            }}>
                                Biomass details
                            </legend>
                            <div className="field-row">
                                <div className="field">
                                    <label className="field-label">License Number</label>
                                    <input
                                        className="field-input"
                                        value={editing.licenseNumber || ''}
                                        onChange={e => setEditing(p => ({ ...p, licenseNumber: e.target.value }))}
                                    />
                                </div>
                                <div className="field">
                                    <label className="field-label">Preferred Units</label>
                                    <select
                                        className="field-input"
                                        value={editing.preferredUnits || ''}
                                        onChange={e => setEditing(p => ({ ...p, preferredUnits: e.target.value || null }))}
                                    >
                                        <option value="">--</option>
                                        <option value="lb">lb</option>
                                        <option value="kg">kg</option>
                                        <option value="g">g</option>
                                        <option value="oz">oz</option>
                                    </select>
                                </div>
                            </div>
                            <div className="field">
                                <label className="field-label">Strains Grown</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                    {(editing.strainsGrown ?? []).map(s => (
                                        <span key={s} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 999,
                                            background: 'var(--background-color)', border: '1px solid var(--border-color)',
                                            fontSize: '0.75rem',
                                        }}>
                                            {s}
                                            <button
                                                type="button"
                                                onClick={() => removeStrain(s)}
                                                aria-label={`Remove ${s}`}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    className="field-input"
                                    placeholder="Type a strain and press Enter"
                                    value={strainInput}
                                    onChange={e => setStrainInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            addStrain();
                                        }
                                    }}
                                    onBlur={addStrain}
                                />
                            </div>
                            <div className="field">
                                <label className="field-label">Quality Notes</label>
                                <textarea
                                    className="field-input"
                                    rows={2}
                                    value={editing.qualityNotes || ''}
                                    onChange={e => setEditing(p => ({ ...p, qualityNotes: e.target.value }))}
                                    placeholder="Moisture, terp profile, consistency issues..."
                                />
                            </div>
                        </fieldset>
                    )}
                </Modal>
            )}
        </>
    );
};
