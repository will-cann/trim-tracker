import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Package } from 'lucide-react';
import type { Package as PackageType, PackageType as PkgType, CreatePackageDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { PackageCard } from './PackageCard';
import { PackagesSummary } from './PackagesSummary';
import { CreatePackageModal } from './CreatePackageModal';
import { PackageDetailModal } from './PackageDetailModal';
import { useAuth } from '../../contexts/authContext';
import { CardsSkeleton } from '../Skeleton';
import { FilterToolbar, DataTable, ViewToggle, useViewMode, TypeChip, getTypeChipStyle, EmptyState, DashboardHeader } from '../ui';
import type { FilterDef, SortOption, Column } from '../ui';
import { formatPackageQuantity, packageTitle } from './packageConstants';

// ── Helpers ──────────────────────────────────────────────────────────────────

const typeLabel = (t: PkgType): string =>
    getTypeChipStyle('packageType', t)?.label || t;

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const formatWeight = formatPackageQuantity;

// ── Column definitions ───────────────────────────────────────────────────────

const PACKAGE_COLUMNS: Column<PackageType>[] = [
    {
        key: 'label', label: 'Label', sortable: true,
        render: (r) => (
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '0.8125rem' }}>
                {r.label || '—'}
            </span>
        ),
    },
    {
        key: 'packageType', label: 'Type', sortable: true, width: 130,
        render: (r) => <TypeChip palette="packageType" value={r.packageType} />,
    },
    {
        key: 'strain', label: 'Strain / Item', sortable: true,
        render: (r) => <span className="cell-ellipsis" style={{ maxWidth: '34ch' }} title={r.itemName || r.strain || undefined}>{packageTitle(r)}</span>,
    },
    {
        key: 'quantity', label: 'Weight', sortable: true, width: 100, align: 'right',
        render: (r) => (
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {formatWeight(r.quantity, r.unit)}
            </span>
        ),
    },
    {
        key: 'status', label: 'Status', sortable: true, width: 120,
        render: (r) => <TypeChip palette="packageStatus" value={r.status} />,
    },
    {
        key: 'labTestingState', label: 'Lab', sortable: true, width: 120,
        render: (r) => <TypeChip palette="labState" value={r.labTestingState || 'not_submitted'} />,
    },
    {
        key: 'licenseNumber', label: 'License', sortable: true, width: 140,
        render: (r) => r.licenseNumber
            ? <span className="license-number">{r.licenseNumber}</span>
            : <span style={{ color: '#C0C0C0' }}>—</span>,
    },
    {
        key: 'location', label: 'Location', sortable: true,
        render: (r) => <span className="cell-ellipsis" style={{ color: '#959595', maxWidth: '22ch' }} title={r.location || undefined}>{r.location || '—'}</span>,
    },
    {
        key: 'packagedDate', label: 'Packaged', sortable: true, width: 110,
        render: (r) => <span style={{ color: '#959595', whiteSpace: 'nowrap' }}>{formatDate(r.packagedDate)}</span>,
    },
];

// ── Main Component ──────────────────────────────────────────────────────────

export const PackageDashboard: React.FC = () => {
    const { user } = useAuth();
    const [packages, setPackages] = useState<PackageType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState<PackageType | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({ type: [], strain: [], status: [] });
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [viewMode, setViewMode] = useViewMode('packages');

    // A Metrc-synced facility can hold tens of thousands of packages; render
    // them in slices so the page stays responsive.
    const PAGE = 150;
    const [visibleCount, setVisibleCount] = useState(PAGE);
    useEffect(() => { setVisibleCount(PAGE); }, [searchQuery, activeFilters, sortField, sortDir, viewMode]);

    const loadPackages = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getPackages();
        setPackages(data);
        setLoading(false);
        return data;
    }, []);

    const refreshPackages = useCallback(async () => {
        const fresh = await loadPackages();
        setSelectedPackage(prev =>
            prev ? fresh.find((p: PackageType) => p.id === prev.id) ?? null : null
        );
    }, [loadPackages]);

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
            label: typeLabel(t),
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
            { value: 'in_transit', label: 'In Transit', dot: 'bg-[#5B8DEF]' },
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
                case 'strain': cmp = packageTitle(a).localeCompare(packageTitle(b)); break;
                case 'type': cmp = a.packageType.localeCompare(b.packageType); break;
                case 'licenseNumber': cmp = (a.licenseNumber || '').localeCompare(b.licenseNumber || ''); break;
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
        await refreshPackages();
    };

    const handleUpdate = async (packageId: string, updates: Record<string, any>) => {
        await apiService.updatePackage(packageId, updates);
        await refreshPackages();
    };

    const handleDelete = async (packageId: string) => {
        setSelectedPackage(null);
        await apiService.deletePackage(packageId);
        await refreshPackages();
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

    const hasFilters = searchQuery || activeFilters.type.length > 0 || activeFilters.status.length > 0;
    const visiblePackages = sortedPackages.slice(0, visibleCount);
    const remaining = sortedPackages.length - visiblePackages.length;
    const showMore = remaining > 0 && (
        <div className="pkg-more">
            <span>Showing {visiblePackages.length.toLocaleString()} of {sortedPackages.length.toLocaleString()}</span>
            <button type="button" className="btn-cancel text-xs px-3 py-1" onClick={() => setVisibleCount(c => c + PAGE * 2)}>
                Show {Math.min(PAGE * 2, remaining).toLocaleString()} more
            </button>
        </div>
    );

    return (
        <div className="dashboard">
            <DashboardHeader
                eyebrow="Inventory"
                title="Packages"
                density="compact"
                actions={
                    <button
                        type="button"
                        className="btn-new-batch"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={20} />
                        New Package
                    </button>
                }
            />

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
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                }
            />

            {/* Inventory at a glance (unfiltered) */}
            {!loading && packages.length > 0 && <PackagesSummary packages={packages} />}

            {/* Content */}
            {loading ? (
                <CardsSkeleton count={3} />
            ) : sortedPackages.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title={hasFilters ? 'No matching packages' : 'Package your finished product'}
                    description={
                        hasFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Packages are the final inventory units — flower, trim, or shake — ready for sale or transfer. Create them from completed trim entries.'
                    }
                    action={
                        !hasFilters && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn-new-batch px-4 py-2 text-sm"
                            >
                                <Plus size={16} />
                                Create First Package
                            </button>
                        )
                    }
                />
            ) : viewMode === 'table' ? (
                <div>
                    <DataTable
                        columns={PACKAGE_COLUMNS}
                        data={visiblePackages}
                        emptyMessage={hasFilters ? 'No packages match your filters.' : 'Create packages from completed trim entries to track your finished inventory.'}
                        sortKey={sortField === 'tag' ? 'label' : sortField === 'type' ? 'packageType' : sortField}
                        sortDir={sortDir}
                        onSort={handleTableSort}
                        onRowClick={(pkg) => setSelectedPackage(pkg)}
                    />
                    {showMore}
                </div>
            ) : (
                <>
                    <div className="pkg-grid">
                        {visiblePackages.map(pkg => (
                            <PackageCard
                                key={pkg.id}
                                pkg={pkg}
                                onClick={() => setSelectedPackage(pkg)}
                            />
                        ))}
                    </div>
                    {showMore}
                </>
            )}

            {showCreateModal && (
                <CreatePackageModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreate}
                />
            )}

            {selectedPackage && (
                <PackageDetailModal
                    pkg={selectedPackage}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onRefresh={refreshPackages}
                    onClose={() => setSelectedPackage(null)}
                    userRole={user?.role}
                />
            )}
        </div>
    );
};
