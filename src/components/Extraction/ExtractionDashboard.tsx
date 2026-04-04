import { useState, useEffect, useCallback } from 'react';
import { Snowflake, Droplets, Flame, Package, ArrowRight, ClipboardList, FlaskConical, Play } from 'lucide-react';
import type { ExtractionLog } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { DataTable, FilterToolbar } from '../ui';
import type { Column, FilterDef } from '../ui';
import { ProcessTemplateList } from './ProcessTemplateList';
import { RunList } from './RunList';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    ice_water: 'Ice Water Wash',
    rosin_press: 'Rosin Press',
    cart_fill: 'Cart Fill',
    other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
    ice_water: '#1C9EFF',
    rosin_press: '#FA9E52',
    cart_fill: '#3BB570',
    other: '#959595',
};

const MATERIAL_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    rosin_cart: 'Rosin Carts',
};

const MATERIAL_ICONS: Record<string, typeof Snowflake> = {
    fresh_frozen: Snowflake,
    bubble_hash: Droplets,
    rosin: Flame,
    rosin_cart: Package,
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const formatQty = (qty: number | null, type?: string) => {
    if (qty == null) return '—';
    const unit = type === 'rosin_cart' ? 'ea' : 'g';
    if (unit === 'g' && qty >= 1000) {
        return `${(qty / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
    }
    return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
};

// ── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: Column<ExtractionLog>[] = [
    {
        key: 'strain', label: 'Strain', sortable: true,
        render: (r) => (
            <span style={{ fontWeight: 500 }}>{r.strain}</span>
        ),
    },
    {
        key: 'extractionType', label: 'Process', sortable: true, width: 140,
        render: (r) => (
            <span
                className="data-table-badge"
                style={{ background: TYPE_COLORS[r.extractionType] || '#959595' }}
            >
                {TYPE_LABELS[r.extractionType] || r.extractionType}
            </span>
        ),
    },
    {
        key: 'flow', label: 'Flow', sortable: false, width: 200,
        render: (r) => {
            const InIcon = MATERIAL_ICONS[r.inputPackageType] || Package;
            const OutIcon = MATERIAL_ICONS[r.outputPackageType] || Package;
            return (
                <span className="flex items-center gap-1.5" style={{ fontSize: '0.8125rem' }}>
                    <InIcon size={13} style={{ color: '#959595', flexShrink: 0 }} />
                    <span style={{ color: '#959595' }}>
                        {MATERIAL_LABELS[r.inputPackageType] || r.inputPackageType}
                    </span>
                    <ArrowRight size={11} style={{ color: '#C0C0C0', flexShrink: 0 }} />
                    <OutIcon size={13} style={{ color: '#1A1A1A', flexShrink: 0 }} />
                    <span style={{ color: '#1A1A1A', fontWeight: 500 }}>
                        {MATERIAL_LABELS[r.outputPackageType] || r.outputPackageType}
                    </span>
                </span>
            );
        },
    },
    {
        key: 'inputQuantity', label: 'Input', sortable: true, width: 100, align: 'right',
        render: (r) => (
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: '#959595' }}>
                {formatQty(r.inputQuantity, r.inputPackageType)}
            </span>
        ),
    },
    {
        key: 'outputQuantity', label: 'Output', sortable: true, width: 100, align: 'right',
        render: (r) => (
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {formatQty(r.outputQuantity, r.outputPackageType)}
            </span>
        ),
    },
    {
        key: 'yieldPercentage', label: 'Yield', sortable: true, width: 80, align: 'right',
        render: (r) => (
            <span style={{
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                color: r.yieldPercentage != null
                    ? r.yieldPercentage >= 50 ? '#3BB570' : r.yieldPercentage >= 20 ? '#FA9E52' : '#959595'
                    : '#C0C0C0',
            }}>
                {r.yieldPercentage != null ? `${r.yieldPercentage}%` : '—'}
            </span>
        ),
    },
    {
        key: 'notes', label: 'Notes', sortable: false,
        render: (r) => (
            <span style={{ color: '#959595', fontSize: '0.75rem' }}>
                {r.notes || '—'}
            </span>
        ),
    },
    {
        key: 'createdAt', label: 'Date', sortable: true, width: 120,
        render: (r) => <span style={{ color: '#959595' }}>{formatDate(r.createdAt)}</span>,
    },
];

// ── Main Component ──────────────────────────────────────────────────────────

type Tab = 'runs' | 'log' | 'processes';

export const ExtractionDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('runs');
    const [logs, setLogs] = useState<ExtractionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [sortKey, setSortKey] = useState<string | null>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getExtractionLogs();
        setLogs(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    // Filters
    const uniqueStrains = [...new Set(logs.map(l => l.strain).filter(Boolean))].sort();

    const processFilter: FilterDef = {
        key: 'process', label: 'Process', multi: true,
        options: [
            { value: 'ice_water', label: 'Ice Water Wash' },
            { value: 'rosin_press', label: 'Rosin Press' },
            { value: 'cart_fill', label: 'Cart Fill' },
        ],
    };

    const strainFilter: FilterDef = {
        key: 'strain', label: 'Strain', multi: true,
        options: uniqueStrains.map(s => ({ value: s, label: s })),
    };

    const filteredLogs = logs.filter(l => {
        if (search) {
            const q = search.toLowerCase();
            if (
                !l.strain?.toLowerCase().includes(q) &&
                !l.notes?.toLowerCase().includes(q) &&
                !l.sourceLabel?.toLowerCase().includes(q) &&
                !l.outputLabel?.toLowerCase().includes(q)
            ) return false;
        }
        if (activeFilters.process?.length && !activeFilters.process.includes(l.extractionType)) return false;
        if (activeFilters.strain?.length && !activeFilters.strain.includes(l.strain)) return false;
        return true;
    });

    const sortedLogs = [...filteredLogs].sort((a, b) => {
        if (!sortKey) return 0;
        const aVal = (a as any)[sortKey];
        const bVal = (b as any)[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const handleSort = (key: string) => {
        if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortKey(null); setSortDir('asc'); }
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const hasFilters = search || Object.values(activeFilters).some(v => v.length);

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Extraction Workspace</h1>
                    <p className="text-xs text-gray-400">Processing history and SOPs for your extraction pipeline</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="extraction-tabs">
                <button
                    className={`extraction-tab ${activeTab === 'runs' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setActiveTab('runs')}
                >
                    <Play size={15} />
                    Runs
                </button>
                <button
                    className={`extraction-tab ${activeTab === 'log' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setActiveTab('log')}
                >
                    <ClipboardList size={15} />
                    Log
                </button>
                <button
                    className={`extraction-tab ${activeTab === 'processes' ? 'extraction-tab--active' : ''}`}
                    onClick={() => setActiveTab('processes')}
                >
                    <FlaskConical size={15} />
                    Processes
                </button>
            </div>

            {activeTab === 'runs' && (
                <div className="mt-4">
                    <RunList />
                </div>
            )}

            {activeTab === 'log' && (
                <>
                    {/* Filters */}
                    <FilterToolbar
                        search={search}
                        onSearchChange={setSearch}
                        searchPlaceholder="Search extractions..."
                        filters={[processFilter, strainFilter]}
                        activeFilters={activeFilters}
                        onFilterChange={(key, values) => setActiveFilters(prev => ({ ...prev, [key]: values }))}
                        onClearFilters={() => setActiveFilters({})}
                    />

                    {/* Table */}
                    <div className="mt-4">
                        <DataTable
                            columns={COLUMNS}
                            data={sortedLogs}
                            loading={loading}
                            emptyMessage={hasFilters ? 'No extractions match your filters.' : 'No extraction runs logged yet.'}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                        />
                    </div>
                </>
            )}

            {activeTab === 'processes' && (
                <div className="mt-4">
                    <ProcessTemplateList />
                </div>
            )}

        </div>
    );
};
