import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Sprout, Package, Snowflake, Flower2 } from 'lucide-react';
import type { Harvest, HarvestStatus, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { CreateHarvestModal } from './CreateHarvestModal';
import { StrainTable } from './StrainTable';

const TABS: { key: HarvestStatus | 'all' | 'strains'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'planning', label: 'Planning' },
    { key: 'active', label: 'Active' },
    { key: 'drying', label: 'Drying' },
    { key: 'ready', label: 'Ready' },
    { key: 'completed', label: 'Completed' },
    { key: 'strains', label: 'Strains' },
];

export const HarvestDashboard: React.FC = () => {
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<HarvestStatus | 'all' | 'strains'>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);

    const loadHarvests = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getHarvests();
        setHarvests(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadHarvests();
    }, [loadHarvests]);

    const filteredHarvests = activeTab === 'all'
        ? harvests.filter(h => h.status !== 'completed')
        : activeTab === 'strains'
            ? []
            : harvests.filter(h => h.status === activeTab);

    const handleCreate = async (data: CreateHarvestDTO) => {
        await apiService.createHarvest(data);
        setShowCreateModal(false);
        await loadHarvests();
    };

    const handleRecordWetWeight = async (harvestId: string, weight: number) => {
        await apiService.recordWetWeight(harvestId, weight);
        await loadHarvests();
    };

    const handleAllocate = async (harvestId: string, allocations: Array<{ type: 'flower' | 'frozen'; targetWeight: number }>) => {
        await apiService.allocateHarvest(harvestId, allocations);
        await loadHarvests();
    };

    const handleRecordWaste = async (harvestId: string, wasteType: HarvestWasteType, weight: number) => {
        await apiService.recordHarvestWaste(harvestId, wasteType, weight);
        await loadHarvests();
    };

    const handleConvertToTrim = async (allocationId: string) => {
        await apiService.convertToTrim(allocationId);
        await loadHarvests();
    };

    const handleDelete = async (harvestId: string) => {
        await apiService.deleteHarvest(harvestId);
        await loadHarvests();
    };

    const handleUpdate = async (harvestId: string, updates: Record<string, any>) => {
        await apiService.updateHarvest(harvestId, updates);
        await loadHarvests();
    };

    // Stats
    const statusCounts = harvests.reduce((acc, h) => {
        acc[h.status] = (acc[h.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const activeCount = (statusCounts.planning || 0) + (statusCounts.active || 0) + (statusCounts.drying || 0) + (statusCounts.ready || 0);

    const totalWetWeight = harvests
        .filter(h => h.status !== 'completed')
        .reduce((sum, h) => sum + h.totalWetWeight, 0);

    const flowerWeight = harvests
        .filter(h => h.status !== 'completed')
        .flatMap(h => h.allocations)
        .filter(a => a.allocationType === 'flower')
        .reduce((sum, a) => sum + a.targetWeight, 0);

    const frozenWeight = harvests
        .filter(h => h.status !== 'completed')
        .flatMap(h => h.allocations)
        .filter(a => a.allocationType === 'frozen')
        .reduce((sum, a) => sum + a.targetWeight, 0);

    return (
        <div className="dashboard">
            {/* Stats */}
            <div className="dashboard-top-section">
                <div className="stats-grid">
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}>
                            <Sprout size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Active Harvests</label>
                            <p className="stat-value">{activeCount}</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon start-icon">
                            <Package size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Total Wet Weight</label>
                            <p className="stat-value">{totalWetWeight.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon flower-icon">
                            <Flower2 size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Flower Allocated</label>
                            <p className="stat-value">{flowerWeight.toFixed(0)}g</p>
                        </div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-icon" style={{ backgroundColor: '#dbeafe', color: '#3b82f6' }}>
                            <Snowflake size={24} />
                        </div>
                        <div className="stat-content">
                            <label>Frozen Allocated</label>
                            <p className="stat-value">{frozenWeight.toFixed(0)}g</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs + New Harvest button */}
            <div className="actions-row">
                <div className="tabs-container">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            {tab.key !== 'all' && statusCounts[tab.key] ? ` (${statusCounts[tab.key]})` : ''}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="btn-new-batch"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus size={20} />
                    New Harvest
                </button>
            </div>

            {/* Content */}
            {activeTab === 'strains' ? (
                <StrainTable />
            ) : loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-emerald-500"></div>
                </div>
            ) : filteredHarvests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                        <Sprout size={24} className="text-emerald-300" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">
                        No harvests{activeTab !== 'all' ? ` in ${activeTab}` : ''}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-xs">
                        Create a new harvest to start tracking plants through drying and allocation.
                    </p>
                </div>
            ) : (
                <div className="entry-list">
                    {filteredHarvests.map(harvest => (
                        <HarvestCard
                            key={harvest.id}
                            harvest={harvest}
                            onRecordWetWeight={handleRecordWetWeight}
                            onAllocate={handleAllocate}
                            onRecordWaste={handleRecordWaste}
                            onConvertToTrim={handleConvertToTrim}
                            onDelete={handleDelete}
                            onUpdate={handleUpdate}
                        />
                    ))}
                </div>
            )}

            {showCreateModal && (
                <CreateHarvestModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreate}
                />
            )}
        </div>
    );
};
