import { useState, useCallback, useMemo } from 'react';
import { Plus, PackagePlus, PackageMinus, History, Pencil, Trash2, FlaskConical, Leaf, HardHat, AlertTriangle } from 'lucide-react';
import { useSupplyInventory } from '../../hooks/useSupplyInventory';
import { FilterToolbar } from '../ui';
import { SupplyItemModal } from './SupplyItemModal';
import { ReceiveModal } from './ReceiveModal';
import { SupplyLedgerPanel } from './SupplyLedgerPanel';
import type { SupplyItem, SupplyPoolSlug, SupplyLedgerEntry, SupplyChangeType } from '../../types/definitions';
import type { FilterDef } from '../ui/FilterToolbar';

type Tab = SupplyPoolSlug;

const TABS: { key: Tab; label: string; icon: typeof FlaskConical }[] = [
    { key: 'extraction', label: 'Extraction', icon: FlaskConical },
    { key: 'cultivation', label: 'Cultivation', icon: Leaf },
    { key: 'facility', label: 'Facility', icon: HardHat },
];

function parStatus(item: SupplyItem): 'ok' | 'low' | 'out' {
    if (item.parLevel == null) return 'ok';
    if (item.quantityOnHand <= 0) return 'out';
    if (item.quantityOnHand <= item.parLevel) return 'low';
    return 'ok';
}

const PAR_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: '#E8F5E9', text: '#3BB570', label: 'In Stock' },
    low: { bg: '#FFF3E0', text: '#FA9E52', label: 'Low' },
    out: { bg: '#FFEBEE', text: '#DF5B59', label: 'Out' },
};

export const SupplyDashboard = () => {
    const [tab, setTab] = useState<Tab>('extraction');
    const { items, loading, saveItem, deleteItem, receiveStock, consumeStock, adjustStock, getLedger } = useSupplyInventory(tab);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [showItemModal, setShowItemModal] = useState(false);
    const [editingItem, setEditingItem] = useState<SupplyItem | null>(null);
    const [receiveItem, setReceiveItem] = useState<SupplyItem | null>(null);
    const [receiveMode, setReceiveMode] = useState<SupplyChangeType>('receive');
    const [ledgerItem, setLedgerItem] = useState<SupplyItem | null>(null);
    const [ledgerEntries, setLedgerEntries] = useState<SupplyLedgerEntry[]>([]);
    const [ledgerLoading, setLedgerLoading] = useState(false);

    // Build category filter from current items
    const categoryFilterDef: FilterDef = useMemo(() => {
        const cats = [...new Set(items.map(i => i.category).filter(Boolean))] as string[];
        return {
            key: 'category',
            label: 'Category',
            options: cats.map(c => ({ value: c, label: c.replace(/_/g, ' ') })),
            multi: true,
        };
    }, [items]);

    const statusFilterDef: FilterDef = useMemo(() => ({
        key: 'status',
        label: 'Status',
        options: [
            { value: 'ok', label: 'In Stock', dot: 'bg-emerald-400' },
            { value: 'low', label: 'Low', dot: 'bg-amber-400' },
            { value: 'out', label: 'Out', dot: 'bg-red-400' },
        ],
        multi: true,
    }), []);

    const handleFilterChange = useCallback((key: string, values: string[]) => {
        setActiveFilters(prev => ({ ...prev, [key]: values }));
    }, []);

    const handleClearFilters = useCallback(() => {
        setActiveFilters({});
        setSearchQuery('');
    }, []);

    // Filter items
    const filtered = useMemo(() => {
        let result = items;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i =>
                i.name.toLowerCase().includes(q) ||
                i.category?.toLowerCase().includes(q) ||
                i.vendorName?.toLowerCase().includes(q) ||
                i.sku?.toLowerCase().includes(q)
            );
        }
        const catFilter = activeFilters.category;
        if (catFilter?.length) {
            result = result.filter(i => i.category && catFilter.includes(i.category));
        }
        const statusFilter = activeFilters.status;
        if (statusFilter?.length) {
            result = result.filter(i => statusFilter.includes(parStatus(i)));
        }
        return result;
    }, [items, searchQuery, activeFilters]);

    const lowCount = items.filter(i => parStatus(i) === 'low').length;
    const outCount = items.filter(i => parStatus(i) === 'out').length;

    const handleOpenLedger = useCallback(async (item: SupplyItem) => {
        setLedgerItem(item);
        setLedgerLoading(true);
        const entries = await getLedger(item.id);
        setLedgerEntries(entries);
        setLedgerLoading(false);
    }, [getLedger]);

    const handleReceive = useCallback((item: SupplyItem, mode: SupplyChangeType) => {
        setReceiveItem(item);
        setReceiveMode(mode);
    }, []);

    const handleReceiveSubmit = useCallback(async (itemId: string, quantity: number, notes?: string) => {
        if (receiveMode === 'receive') {
            await receiveStock(itemId, quantity, notes);
        } else if (receiveMode === 'consume') {
            await consumeStock(itemId, quantity, notes);
        } else if (receiveMode === 'adjust') {
            await adjustStock(itemId, quantity, notes);
        }
    }, [receiveMode, receiveStock, consumeStock, adjustStock]);

    const handleEdit = useCallback((item: SupplyItem) => {
        setEditingItem(item);
        setShowItemModal(true);
    }, []);

    const handleDelete = useCallback(async (item: SupplyItem) => {
        if (!confirm(`Delete "${item.name}"?`)) return;
        await deleteItem(item.id);
    }, [deleteItem]);

    const filters = useMemo(() => {
        const f: FilterDef[] = [];
        if (categoryFilterDef.options.length > 0) f.push(categoryFilterDef);
        f.push(statusFilterDef);
        return f;
    }, [categoryFilterDef, statusFilterDef]);

    return (
        <div className="dashboard">
            <div className="dashboard-top-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="header-title">
                    <h4>Supplies</h4>
                </div>
            </div>

            {/* Tabs */}
            <div className="extraction-tabs">
                {TABS.map(t => {
                    return (
                        <button
                            key={t.key}
                            className={`extraction-tab ${tab === t.key ? 'extraction-tab--active' : ''}`}
                            onClick={() => { setTab(t.key); setSearchQuery(''); setActiveFilters({}); }}
                        >
                            <t.icon size={15} style={{ marginRight: 6, opacity: 0.7 }} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Low stock alert */}
            {(lowCount > 0 || outCount > 0) && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: '1rem',
                    background: outCount > 0 ? '#FFEBEE' : '#FFF3E0', borderRadius: 8, fontSize: '0.8125rem',
                }}>
                    <AlertTriangle size={15} color={outCount > 0 ? '#DF5B59' : '#FA9E52'} />
                    <span style={{ color: '#1A1A1A' }}>
                        {outCount > 0 && <strong style={{ color: '#DF5B59' }}>{outCount} out of stock</strong>}
                        {outCount > 0 && lowCount > 0 && ', '}
                        {lowCount > 0 && <strong style={{ color: '#FA9E52' }}>{lowCount} low</strong>}
                    </span>
                </div>
            )}

            {/* Toolbar */}
            <FilterToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search supplies..."
                filters={filters}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                trailing={
                    <button className="btn-new-batch" onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
                        <Plus size={18} /> Add Item
                    </button>
                }
            />

            {/* Table */}
            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#959595' }}>Loading supplies...</div>
            ) : filtered.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#959595' }}>
                    {items.length === 0 ? 'No supply items yet. Add one to get started.' : 'No items match your filters.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #E8E8E8' }}>
                                <th style={thStyle}>Name</th>
                                <th style={thStyle}>Category</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>On Hand</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Par</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Vendor</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Unit Cost</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item, idx) => {
                                const status = parStatus(item);
                                const statusCfg = PAR_COLORS[status];
                                const rowBg = idx % 2 === 1 ? '#FAFAFA' : 'transparent';
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #E8E8E8', background: rowBg }}>
                                        <td style={{ ...tdStyle, fontWeight: 600, color: '#1A1A1A' }}>{item.name}</td>
                                        <td style={{ ...tdStyle, color: '#6B7280', textTransform: 'capitalize' }}>{item.category?.replace(/_/g, ' ') || '\u2014'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#1A1A1A' }}>
                                            {item.quantityOnHand} <span style={{ color: '#6B7280', fontWeight: 400 }}>{item.unit}</span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6B7280' }}>
                                            {item.parLevel != null ? `${item.parLevel} ${item.unit}` : '\u2014'}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600,
                                                padding: '2px 8px', borderRadius: 10,
                                                background: statusCfg.bg, color: statusCfg.text,
                                            }}>
                                                {statusCfg.label}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, color: '#6B7280' }}>{item.vendorName || '\u2014'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1A1A1A' }}>
                                            {item.unitCost != null ? `$${item.unitCost.toFixed(2)}` : <span style={{ color: '#C0C0C0' }}>{'\u2014'}</span>}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                                <ActionBtn title="Receive" onClick={() => handleReceive(item, 'receive')}><PackagePlus size={14} color="#3BB570" /></ActionBtn>
                                                <ActionBtn title="Use" onClick={() => handleReceive(item, 'consume')}><PackageMinus size={14} color="#DF5B59" /></ActionBtn>
                                                <ActionBtn title="History" onClick={() => handleOpenLedger(item)}><History size={14} color="#6B7280" /></ActionBtn>
                                                <ActionBtn title="Edit" onClick={() => handleEdit(item)}><Pencil size={14} color="#6B7280" /></ActionBtn>
                                                <ActionBtn title="Delete" onClick={() => handleDelete(item)}><Trash2 size={14} color="#6B7280" /></ActionBtn>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {showItemModal && (
                <SupplyItemModal
                    poolSlug={tab}
                    item={editingItem}
                    onSave={saveItem}
                    onClose={() => { setShowItemModal(false); setEditingItem(null); }}
                />
            )}
            {receiveItem && (
                <ReceiveModal
                    item={receiveItem}
                    mode={receiveMode}
                    onSubmit={handleReceiveSubmit}
                    onClose={() => setReceiveItem(null)}
                />
            )}
            {ledgerItem && (
                <SupplyLedgerPanel
                    item={ledgerItem}
                    entries={ledgerEntries}
                    loading={ledgerLoading}
                    onClose={() => setLedgerItem(null)}
                />
            )}
        </div>
    );
};

// ── Helpers ──────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', color: '#959595', fontWeight: 600, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    padding: '8px 10px', whiteSpace: 'nowrap',
};

const ActionBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4,
            display: 'inline-flex', alignItems: 'center',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F1F1F1')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
        {children}
    </button>
);
