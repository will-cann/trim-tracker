import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Package, Pause, CheckCircle, Flower2 } from 'lucide-react';
import type { Package as PackageType, PackageType as PkgType, CreatePackageDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { PackageCard } from './PackageCard';
import { CreatePackageModal } from './CreatePackageModal';
import { CardsSkeleton } from '../Skeleton';
import { FilterToolbar } from '../ui';
import type { FilterDef, SortOption } from '../ui';

export const PackageDashboard: React.FC = () => {
    const [packages, setPackages] = useState<PackageType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({ type: [], status: [] });
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
    const TYPE_LABELS: Record<PkgType, string> = {
        flower: 'Flower', trim: 'Trim', shake: 'Shake', fresh_frozen: 'Fresh Frozen',
        bubble_hash: 'Bubble Hash', rosin: 'Rosin', rosin_cart: 'Rosin Carts',
    };

    // Filter definitions for toolbar
    const typeFilterDef: FilterDef = {
        key: 'type',
        label: 'Type',
        multi: true,
        options: PRODUCT_TYPES.filter(t => packages.some(p => p.packageType === t)).map(t => ({
            value: t,
            label: TYPE_LABELS[t],
        })),
    };

    const statusFilterDef: FilterDef = {
        key: 'status',
        label: 'Status',
        multi: true,
        options: [
            { value: 'active', label: 'Active', dot: 'bg-[#3BB570]' },
            { value: 'on_hold', label: 'On Hold', dot: 'bg-[#FA9E52]' },
            { value: 'finished', label: 'Finished', dot: 'bg-gray-400' },
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
        setActiveFilters({ type: [], status: [] });
    };

    const handleSortChange = (value: string | null, dir: 'asc' | 'desc') => {
        setSortField(value);
        setSortDir(dir);
    };

    // Apply filters
    const filteredPackages = packages.filter(p => {
        // Exclude archived always
        if (p.status === 'archived') return false;

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const tag = p.label?.toLowerCase() || '';
            const strain = p.strain?.toLowerCase() || '';
            const loc = p.location?.toLowerCase() || '';
            if (!tag.includes(q) && !strain.includes(q) && !loc.includes(q)) return false;
        }

        // Type filter
        const typeFilter = activeFilters.type || [];
        if (typeFilter.length > 0 && !typeFilter.includes(p.packageType)) return false;

        // Status filter
        const statusFilter = activeFilters.status || [];
        if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;

        // Default: hide finished if no status filter is active
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

    // Stats
    const activePackages = packages.filter(p => p.status === 'active');
    const totalActiveWeight = activePackages.reduce((sum, p) => sum + p.quantity, 0);
    const onHoldCount = packages.filter(p => p.status === 'on_hold').length;
    const finishedCount = packages.filter(p => p.status === 'finished').length;

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

            {/* Search + Filters + Sort + New Package */}
            <FilterToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search packages..."
                filters={[typeFilterDef, statusFilterDef]}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                sortOptions={pkgSortOptions}
                activeSort={sortField}
                sortDir={sortDir}
                onSortChange={handleSortChange}
                trailing={
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

            {/* Content */}
            {loading ? (
                <CardsSkeleton count={3} />
            ) : sortedPackages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center mb-4 shadow-sm">
                        <Package size={28} className="text-emerald-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-600 mb-1">
                        {searchQuery || activeFilters.type.length > 0 || activeFilters.status.length > 0
                            ? 'No matching packages'
                            : 'No packages yet'}
                    </h3>
                    <p className="text-sm text-gray-400 max-w-xs mb-4">
                        {searchQuery || activeFilters.type.length > 0 || activeFilters.status.length > 0
                            ? 'Try adjusting your search or filters.'
                            : 'Create packages from your completed trim entries to track inventory.'}
                    </p>
                    {!searchQuery && activeFilters.type.length === 0 && activeFilters.status.length === 0 && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-new-batch px-4 py-2 text-sm"
                        >
                            <Plus size={16} />
                            Create First Package
                        </button>
                    )}
                </div>
            ) : (
                <div className="entry-list">
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
;
};
;
};
;
};
