import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Package, Pause, CheckCircle, Flower2 } from 'lucide-react';
import type { Package as PackageType, PackageType as PkgType, CreatePackageDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { PackageCard } from './PackageCard';
import { CreatePackageModal } from './CreatePackageModal';
import { CardsSkeleton } from '../Skeleton';
import { FilterToolbar, DataTable, ViewToggle, useViewMode } from '../ui';
import type { FilterDef, SortOption, Column } from '../ui';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    active: '#3BB570',
    on_hold: '#FA9E52',
    finished: '#959595',
};

const LAB_COLORS: Record<string, string> = {
    not_submitted: '#959595',
    submitted: '#1C9EFF',
    passed: '#3BB570',
    failed: '#DF5B59',
};

const TYPE_LABELS: Record<PkgType, string> = {
    flower: 'Flower', trim: 'Trim', shake: 'Shake', fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash', rosin: 'Rosin', rosin_cart: 'Rosin Carts',
};

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const formatWeight = (qty: number, unit?: string) => {
    const u = unit || 'g';
    if (u === 'g' || u === 'grams' || u === 'Grams') {
        if (qty >= 1000) {
            const kg = qty / 1000;
            return `${kg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
        }
        return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} g`;
    }
    return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u}`;
};

// ── Column definitions ───────────────────────────────────────────────────────

const PACKAGE_COLUMNS: Column<PackageType>[] = [
    {
        key: 'label', label: 'Label', sortable: true,
        render: (r) => (
            <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8125rem' }}>
                {r.label || '—'}
            </span>
        ),
    },
    {
        key: 'packageType', label: 'Type', sortable: true, width: 110,
        render: (r) => (
            <span className="data-table-badge data-table-badge--muted">
                {TYPE_LABELS[r.packageType] || r.packageType}
            </span>
        ),
    },
    { key: 'strain', label: 'Strain', sortable: true },
    {
        key: 'quantity', label: 'Weight', sortable: true, width: 100, align: 'right',
        render: (r) => (
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {formatWeight(r.quantity, r.unit)}
            </span>
        ),
    },
    {
        key: 'status', label: 'Status', sortable: true, width: 90,
        render: (r) => (
            <span className="data-table-badge" style={{ background: STATUS_COLORS[r.status] || '#959595' }}>
                {r.status === 'on_hold' ? 'On Hold' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
            </span>
        ),
    },
    {
        key: 'labTestingState', label: 'Lab', sortable: true, width: 100,
        render: (r) => {
            const state = r.labTestingState || 'not_submitted';
            const label = state === 'not_submitted' ? 'Not Sent' : state.charAt(0).toUpperCase() + state.slice(1);
            return (
                <span className="flex items-center gap-1.5">
                    <span className="data-table-dot" style={{ background: LAB_COLORS[state] || '#959595' }} />
                    <span style={{ color: '#959595', fontSize: '0.8125rem' }}>{label}</span>
                </span>
            );
        },
    },
    {
        key: 'location', label: 'Location', sortable: true,
        render: (r) => <span style={{ color: '#959595' }}>{r.location || '—'}</span>,
    },
    {
        key: 'packagedDate', label: 'Packaged', sortable: true, width: 120,
        render: (r) => <span style={{ color: '#959595' }}>{formatDate(r.packagedDate)}</span>,
    },
];

// ── Main Component ──────────────────────────────────────────────────────────

export const PackageDashboard: React.FC = () => {
    const [packages, setPackages] = useState<PackageType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({ type: [], strain: [], status: [] });
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [viewMode, setViewMode] = useViewMode('packages');

    const loadPackages = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getPackages();
        setPackages(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadPackages();
    }, [loadPackages]);

    const PRODUCT_TYPES: PkgType[] = ['flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'];

    // Filter definitions for toolbar
    const typeFilterDef: FilterDef = {
        key: 'type',
        label: 'Type',
        multi: true,
        options: PRODUCT_TYPES.map(t => ({
            value: t,
            label: TYPE_LABELS[t],
        })),
    };

    const strainFilterDef: FilterDef = {
        key: 'strain',
        label: 'Strain',
        multi: true,
        options: [...new Set(packages.map(p => p.strain).filter(Boolean))].sort().map(s => ({
            value: s,
            label: s,
        })),
    };

    const statusFilterDef: FilterDef = {
        key: 'status',
        label: 'Status',
        multi: true,
        options: [
            { value: 'active', label: 'Active', dot: 'bg-[#3BB570]' },
            { value: 'on_hold', label: 'On Hold', dot: 'bg-[#FA9E52]' },
            { value: 'finished', label: 'Finished', dot: 'bg-[#C0C0C0]' },
        ],
    };

    const pkgSortOptions: SortOption[] = [
        { value: 'tag', label: 'Package tag' },
        { value: 'quantity', label: 'Weight' },
        { value: 'strain', label: 'Strain' },
        { value: 'type', label: 'Type' },
    ];

    const handleFilterChange = (key: string, values: string[]) => {
        setActiveFilters(prev => ({ ...prev, [key]: values }));
    };

    const handleClearFilters = () => {
        setActiveFilters({ type: [], strain: [], status: [] });
    };

    const handleSortChange = (value: string | null, dir: 'asc' | 'desc') => {
        setSortField(value);
        setSortDir(dir);
    };

    // Apply filters
    const filteredPackages = packages.filter(p => {
        if (p.status === 'archived') return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const tag = p.label?.toLowerCase() || '';
            const strain = p.strain?.toLowerCase() || '';
            const loc = p.location?.toLowerCase() || '';
            if (!tag.includes(q) && !strain.includes(q) && !loc.includes(q)) return false;
        }
        const typeFilter = activeFilters.type || [];
        if (typeFilter.length > 0 && !typeFilter.includes(p.packageType)) return false;
        const strainFilter = activeFilters.strain || [];
        if (strainFilter.length > 0 && !strainFilter.includes(p.strain)) return false;
        const statusFilter = activeFilters.status || [];
        if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;
        if (statusFilter.length === 0 && p.status === 'finished') return false;
        return true;
    });

    // Apply sort
    const sortedPackages = sortField
        ? [...filteredPackages].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'tag': cmp = (a.label || '').localeCompare(b.label || ''); break;
                case 'quantity': cmp = a.quantity - b.quantity; break;
                case 'strain': cmp = (a.strain || '').localeCompare(b.strain || ''); break;
                case 'type': cmp = a.packageType.localeCompare(b.packageType); break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        })
        : filteredPackages;

    const handleCreate = async (data: CreatePackageDTO | CreatePackageDTO[]) => {
        if (Array.isArray(data)) {
            await apiService.createPackages(data);
        } else {
            await apiService.createPackage(data);
        }
        setShowCreateModal(false);
        await loadPackages();
    };

    const handleUpdate = async (packageId: string, updates: Record<string, any>) => {
        await apiService.updatePackage(packageId, updates);
        await loadPackages();
    };

    const handleDelete = async (packageId: string) => {
        await apiService.deletePackage(packageId);
        await loadPackages();
    };

    // Table sort handler
    const handleTableSort = (key: string) => {
        // Map column keys to existing sort field names
        const sortMap: Record<string, string> = { label: 'tag', packageType: 'type' };
        const mapped = sortMap[key] || key;
        if (sortField === mapped) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortField(null); setSortDir('asc'); }
        } else {
            setSortField(mapped);
            setSortDir('asc');
        }
    };

    // Stats
    const activePackages = packages.filter(p => p.status === 'active');
    const totalActiveWeight = activePackages.reduce((sum, p) => sum + p.quantity, 0);
    const onHoldCount = packages.filter(p => p.status === 'on_hold').length;
    const finishedCount = packages.filter(p => p.status === 'finished').length;

    const hasFilters = searchQuery || activeFilters.type.length > 0 || activeFilters.status.length > 0;

    return (
        <div className="dashboard">
            {/* Stats */}
            <div className="dashboard-top-section">
                <div className="stats-grid">
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 181, 112, 0.1)', color: '#3BB570' }}>
                            <Package size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Active Packages</label>
                            <p className="stat-value">{activePackages.length}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon flower-icon">
                            <Flower2 size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Active Weight</label>
                            <p className="stat-value">{totalActiveWeight.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(250, 158, 82, 0.15)', color: '#FA9E52' }}>
                            <Pause size={24} />
                        </div>
                        <div className="stat-content">
                            <label>On Hold</label>
                            <p className="stat-value">{onHoldCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 181, 112, 0.15)', color: '#3BB570' }}>
                            <CheckCircle size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Finished</label>
                            <p className="stat-value">{finishedCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search + Filters + Sort + Toggle + New Package */}
            <FilterToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search packages..."
                filters={[typeFilterDef, strainFilterDef, statusFilterDef]}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                sortOptions={viewMode === 'cards' ? pkgSortOptions : undefined}
                activeSort={viewMode === 'cards' ? sortField : undefined}
                sortDir={sortDir}
                onSortChange={viewMode === 'cards' ? handleSortChange : undefined}
                trailing={
                    <div className="flex items-center gap-2">
                        <ViewToggle mode={viewMode} onChange={setViewMode} />
                        <button
                            type="button"
                            className="btn-new-batch"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <Plus size={20} />
                            New Package
                        </button>
                    </div>
                }
            />

            {/* Content */}
            {loading ? (
                <CardsSkeleton count={3} />
            ) : sortedPackages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-full bg-[#F1F1F1] flex items-center justify-center mb-4">
                        <Package size={24} className="text-[#C0C0C0]" />
                    </div>
                    <h3 className="text-base font-semibold text-[#1A1A1A] mb-1">
                        {hasFilters ? 'No matching packages' : 'Package your finished product'}
                    </h3>
                    <p className="text-sm text-[#959595] max-w-xs mb-4">
                        {hasFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Packages are the final inventory units — flower, trim, or shake — ready for sale or transfer. Create them from completed trim entries.'}
                    </p>
                    {!hasFilters && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-new-batch px-4 py-2 text-sm"
                        >
                            <Plus size={16} />
                            Create First Package
                        </button>
                    )}
                </div>
            ) : viewMode === 'table' ? (
                <div className="mt-4">
                    <DataTable
                        columns={PACKAGE_COLUMNS}
                        data={sortedPackages}
                        emptyMessage={hasFilters ? 'No packages match your filters.' : 'No packages found.'}
                        sortKey={sortField === 'tag' ? 'label' : sortField === 'type' ? 'packageType' : sortField}
                        sortDir={sortDir}
                        onSort={handleTableSort}
                    />
                </div>
            ) : (
                <div className="entry-grid">
                    {sortedPackages.map(pkg => (
                        <PackageCard
                            key={pkg.id}
                            pkg={pkg}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {showCreateModal && (
                <CreatePackageModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreate}
                />
            )}
        </div>
    );
};
