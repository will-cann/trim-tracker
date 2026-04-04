import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Wrench, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { CenteredSpinner } from '../Spinner';
import type { ExtractionEquipment } from '../../types/definitions';
import { apiService } from '../../services/apiService';

const EQUIPMENT_TYPES = [
    { value: 'wash_vessel', label: 'Wash Vessel' },
    { value: 'freeze_dryer', label: 'Freeze Dryer' },
    { value: 'rosin_press', label: 'Rosin Press' },
    { value: 'closed_loop_extractor', label: 'Closed Loop Extractor' },
    { value: 'vacuum_oven', label: 'Vacuum Oven' },
    { value: 'cart_filler', label: 'Cart Filler' },
    { value: 'filter_press', label: 'Filter Press' },
    { value: 'short_path', label: 'Short Path Distillation' },
    { value: 'other', label: 'Other' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(EQUIPMENT_TYPES.map(t => [t.value, t.label]));

const STATUS_OPTIONS = [
    { value: 'available', label: 'Available', color: '#3BB570' },
    { value: 'in_use', label: 'In Use', color: '#1C9EFF' },
    { value: 'maintenance', label: 'Maintenance', color: '#FA9E52' },
    { value: 'retired', label: 'Retired', color: '#959595' },
];

const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.color]));

type SortKey = 'name' | 'equipmentType' | 'capacityGrams' | 'status';
type SortDir = 'asc' | 'desc';

interface EquipmentSectionProps {
    loading: boolean;
}

// ── Save-flash hook ────────────────────────────────────────────────────────

function useFlash() {
    const timers = useRef<Map<string, number>>(new Map());

    const flash = useCallback((el: HTMLElement | null) => {
        if (!el) return;
        const key = el.dataset.flashKey ?? '';
        const prev = timers.current.get(key);
        if (prev) clearTimeout(prev);
        el.classList.add('just-saved');
        const t = window.setTimeout(() => {
            el.classList.remove('just-saved');
            timers.current.delete(key);
        }, 800);
        timers.current.set(key, t);
    }, []);

    return flash;
}

// ── Component ──────────────────────────────────────────────────────────────

export const EquipmentSection: React.FC<EquipmentSectionProps> = ({ loading }) => {
    const [equipment, setEquipment] = useState<ExtractionEquipment[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('');
    const [newCapacity, setNewCapacity] = useState('');
    const [newNotes, setNewNotes] = useState('');

    // Search + sort
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // Delete confirmation
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const flash = useFlash();

    const loadEquipment = useCallback(async () => {
        setDataLoading(true);
        const data = await apiService.getExtractionEquipment();
        setEquipment(data);
        setDataLoading(false);
    }, []);

    useEffect(() => { loadEquipment(); }, [loadEquipment]);

    // ── Sorted + filtered list ─────────────────────────────────────────────

    const filtered = equipment.filter(eq => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            eq.name.toLowerCase().includes(q) ||
            (TYPE_LABEL[eq.equipmentType] ?? eq.equipmentType).toLowerCase().includes(q) ||
            (eq.notes ?? '').toLowerCase().includes(q) ||
            eq.status.toLowerCase().includes(q)
        );
    });

    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
            case 'name': cmp = a.name.localeCompare(b.name); break;
            case 'equipmentType': cmp = (TYPE_LABEL[a.equipmentType] ?? '').localeCompare(TYPE_LABEL[b.equipmentType] ?? ''); break;
            case 'capacityGrams': cmp = (a.capacityGrams ?? 0) - (b.capacityGrams ?? 0); break;
            case 'status': cmp = a.status.localeCompare(b.status); break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name || !newType) return;
        await apiService.createExtractionEquipment({
            name,
            equipmentType: newType,
            capacityGrams: newCapacity ? parseFloat(newCapacity) : undefined,
            notes: newNotes.trim() || undefined,
        });
        setNewName(''); setNewType(''); setNewCapacity(''); setNewNotes('');
        setIsAdding(false);
        await loadEquipment();
    };

    const handleUpdate = async (id: string, field: string, raw: string, el: HTMLElement | null) => {
        let value: any;
        if (field === 'capacityGrams') {
            const num = parseFloat(raw);
            value = (!raw || isNaN(num) || num <= 0) ? null : num;
        } else {
            value = raw.trim() || null;
        }
        await apiService.updateExtractionEquipment(id, { [field]: value });
        flash(el);
        await loadEquipment();
    };

    const handleDelete = async (id: string) => {
        setConfirmDelete(null);
        await apiService.deleteExtractionEquipment(id);
        await loadEquipment();
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }: { col: SortKey }) => (
        <span className="equip-th-sort">
            {sortKey === col
                ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                : <ChevronUp size={10} />
            }
        </span>
    );

    // ── Render ─────────────────────────────────────────────────────────────

    if (loading || dataLoading) {
        return <CenteredSpinner label="Loading equipment..." height="py-12" />;
    }

    return (
        <div>
            <div className="settings-section-header">
                <div>
                    <h3 className="settings-section-title">Extraction Equipment</h3>
                    <p className="settings-section-desc">Manage machines used in your extraction processes.</p>
                </div>
                <button onClick={() => setIsAdding(true)} className="btn-new-batch text-sm px-3 py-1.5">
                    <Plus size={14} /> Add Equipment
                </button>
            </div>

            {isAdding && (
                <div className="equip-add-form">
                    <div className="equip-add-required">Required</div>
                    <div className="equip-add-row">
                        <input
                            type="text"
                            className="field-input"
                            style={{ flex: '1 1 180px', minWidth: 0 }}
                            placeholder="Name (e.g. Sasquash M2)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <select
                            className="field-input"
                            style={{ flex: '0 0 200px' }}
                            value={newType}
                            onChange={e => setNewType(e.target.value)}
                        >
                            <option value="">Select type...</option>
                            {EQUIPMENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="equip-add-optional">Optional</div>
                    <div className="equip-add-row">
                        <input
                            type="number"
                            className="field-input"
                            style={{ flex: '0 0 130px' }}
                            placeholder="Capacity (g)"
                            value={newCapacity}
                            onChange={e => setNewCapacity(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <input
                            type="text"
                            className="field-input"
                            style={{ flex: 1, minWidth: 0 }}
                            placeholder="Notes — model, specs, column sizes..."
                            value={newNotes}
                            onChange={e => setNewNotes(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button onClick={handleAdd} disabled={!newName.trim() || !newType} className="btn-primary text-sm px-3 py-1.5">
                            Add
                        </button>
                        <button onClick={() => { setIsAdding(false); setNewName(''); setNewType(''); setNewCapacity(''); setNewNotes(''); }} className="btn-cancel text-sm px-3 py-1.5">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {equipment.length === 0 && !isAdding ? (
                <div className="settings-empty mt-4">
                    <Wrench size={20} style={{ color: '#3BB570', marginBottom: 8 }} />
                    <p>No equipment yet. Add your extraction machines to track capacity, status, and usage across runs.</p>
                </div>
            ) : equipment.length > 0 && (
                <>
                    {/* Toolbar: search + count */}
                    <div className="equip-toolbar">
                        <div className="equip-search-wrap">
                            <Search size={14} className="equip-search-icon" />
                            <input
                                type="text"
                                className="equip-search"
                                placeholder="Search equipment..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <span className="equip-count">
                            {filtered.length === equipment.length
                                ? `${equipment.length} item${equipment.length === 1 ? '' : 's'}`
                                : `${filtered.length} of ${equipment.length}`
                            }
                        </span>
                    </div>

                    <div className="settings-table-wrap">
                        <table className="equip-table">
                            <thead>
                                <tr>
                                    <th className={`equip-th equip-col-name${sortKey === 'name' ? ' equip-th--active' : ''}`} onClick={() => toggleSort('name')}>
                                        Name <SortIcon col="name" />
                                    </th>
                                    <th className={`equip-th equip-col-type${sortKey === 'equipmentType' ? ' equip-th--active' : ''}`} onClick={() => toggleSort('equipmentType')}>
                                        Type <SortIcon col="equipmentType" />
                                    </th>
                                    <th className={`equip-th equip-col-capacity${sortKey === 'capacityGrams' ? ' equip-th--active' : ''}`} onClick={() => toggleSort('capacityGrams')} style={{ textAlign: 'right' }}>
                                        Capacity <SortIcon col="capacityGrams" />
                                    </th>
                                    <th className={`equip-th equip-col-status${sortKey === 'status' ? ' equip-th--active' : ''}`} onClick={() => toggleSort('status')}>
                                        Status <SortIcon col="status" />
                                    </th>
                                    <th className="equip-th equip-col-notes" style={{ cursor: 'default' }}>Notes</th>
                                    <th className="equip-th equip-col-action" style={{ cursor: 'default' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(eq => (
                                    <tr key={eq.id} className="equip-row">
                                        <td className="equip-cell equip-cell-name">
                                            <input
                                                type="text"
                                                className="settings-inline-input"
                                                data-flash-key={`name-${eq.id}`}
                                                defaultValue={eq.name}
                                                onBlur={e => {
                                                    const v = e.target.value.trim();
                                                    if (v && v !== eq.name) handleUpdate(eq.id, 'name', v, e.target);
                                                }}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            />
                                        </td>
                                        <td className="equip-cell">
                                            <select
                                                className="settings-inline-input"
                                                data-flash-key={`type-${eq.id}`}
                                                defaultValue={eq.equipmentType}
                                                onChange={e => handleUpdate(eq.id, 'equipmentType', e.target.value, e.target)}
                                            >
                                                {EQUIPMENT_TYPES.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="equip-cell equip-cell-capacity">
                                            <input
                                                type="number"
                                                className="settings-inline-input"
                                                data-flash-key={`cap-${eq.id}`}
                                                defaultValue={eq.capacityGrams ?? ''}
                                                placeholder="--"
                                                onBlur={e => handleUpdate(eq.id, 'capacityGrams', e.target.value, e.target)}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            />
                                            {eq.capacityGrams != null && <span className="equip-unit">g</span>}
                                        </td>
                                        <td className="equip-cell">
                                            <div className="equip-status-wrap">
                                                <span className="equip-status-dot" style={{ background: STATUS_COLOR[eq.status] ?? '#959595' }} />
                                                <select
                                                    className="settings-inline-input"
                                                    data-flash-key={`status-${eq.id}`}
                                                    defaultValue={eq.status}
                                                    onChange={e => handleUpdate(eq.id, 'status', e.target.value, e.target)}
                                                >
                                                    {STATUS_OPTIONS.map(s => (
                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        <td className="equip-cell">
                                            <input
                                                type="text"
                                                className="settings-inline-input"
                                                data-flash-key={`notes-${eq.id}`}
                                                defaultValue={eq.notes ?? ''}
                                                placeholder="Add notes..."
                                                onBlur={e => {
                                                    const v = e.target.value.trim();
                                                    if (v !== (eq.notes ?? '')) handleUpdate(eq.id, 'notes', v, e.target);
                                                }}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            />
                                        </td>
                                        <td className="equip-cell-action">
                                            {confirmDelete === eq.id ? (
                                                <div className="equip-delete-confirm">
                                                    <button className="equip-delete-yes" onClick={() => handleDelete(eq.id)}>Delete</button>
                                                    <button className="equip-delete-no" onClick={() => setConfirmDelete(null)}>No</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDelete(eq.id)}
                                                    className="strain-delete-btn"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {sorted.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: '#959595', fontSize: '0.8125rem' }}>
                                            No equipment matches "{search}"
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
