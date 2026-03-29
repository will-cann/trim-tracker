import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Package, Pause, CheckCircle, Flower2 } from 'lucide-react';
import type { Package as PackageType, PackageType as PkgType, CreatePackageDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { PackageCard } from './PackageCard';
import { CreatePackageModal } from './CreatePackageModal';
import { CardsSkeleton } from '../Skeleton';

type TabKey = 'all' | PkgType | 'on_hold' | 'finished';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'flower', label: 'Flower' },
    { key: 'trim', label: 'Trim' },
    { key: 'shake', label: 'Shake' },
    { key: 'on_hold', label: 'On Hold' },
    { key: 'finished', label: 'Finished' },
];

export const PackageDashboard: React.FC = () => {
    const [packages, setPackages] = useState<PackageType[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);

    const loadPackages = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getPackages();
        setPackages(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadPackages();
    }, [loadPackages]);

    const filteredPackages = (() => {
        switch (activeTab) {
            case 'all':
                return packages.filter(p => p.status !== 'finished' && p.status !== 'archived');
            case 'flower':
            case 'trim':
            case 'shake':
                return packages.filter(p => p.packageType === activeTab && p.status !== 'archived');
            case 'on_hold':
                return packages.filter(p => p.status === 'on_hold');
            case 'finished':
                return packages.filter(p => p.status === 'finished');
            default:
                return packages;
        }
    })();

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

    const tabCounts: Record<string, number> = {
        flower: packages.filter(p => p.packageType === 'flower' && p.status !== 'archived').length,
        trim: packages.filter(p => p.packageType === 'trim' && p.status !== 'archived').length,
        shake: packages.filter(p => p.packageType === 'shake' && p.status !== 'archived').length,
        on_hold: onHoldCount,
        finished: finishedCount,
    };

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
                        <div className="stat-icon" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                            <Pause size={24} />
                        </div>
                        <div className="stat-content">
                            <label>On Hold</label>
                            <p className="stat-value">{onHoldCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>
                            <CheckCircle size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Finished</label>
                            <p className="stat-value">{finishedCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs + New Package button */}
            <div className="actions-row">
                <div className="tabs-container">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            {tab.key !== 'all' && tabCounts[tab.key] ? ` (${tabCounts[tab.key]})` : ''}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="btn-new-batch"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus size={20} />
                    New Package
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <CardsSkeleton count={3} />
            ) : filteredPackages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center mb-4 shadow-sm">
                        <Package size={28} className="text-emerald-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-600 mb-1">
                        {activeTab !== 'all' ? `No ${activeTab} packages` : 'No packages yet'}
                    </h3>
                    <p className="text-sm text-gray-400 max-w-xs mb-4">
                        {activeTab === 'all'
                            ? 'Create packages from your completed trim entries to track inventory.'
                            : `Packages will appear here when they match the ${activeTab} filter.`}
                    </p>
                    {activeTab === 'all' && (
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
                    {filteredPackages.map(pkg => (
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
