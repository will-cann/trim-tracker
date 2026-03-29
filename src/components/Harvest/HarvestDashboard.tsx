import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Sprout, Scissors } from 'lucide-react';
import type { Harvest, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { CreateHarvestModal } from './CreateHarvestModal';
import { StrainTable } from './StrainTable';
import { CardsSkeleton } from '../Skeleton';

type ViewTab = 'active' | 'completed' | 'strains';

const TABS: { key: ViewTab; label: string }[] = [
    { key: 'active', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'strains', label: 'Strains' },
];

interface HarvestDashboardProps {
    onStartHarvestDay?: () => void;
}

export const HarvestDashboard: React.FC<HarvestDashboardProps> = ({ onStartHarvestDay }) => {
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<ViewTab>('active');
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

    const filteredHarvests = activeTab === 'active'
        ? harvests.filter(h => h.status !== 'completed')
        : activeTab === 'completed'
            ? harvests.filter(h => h.status === 'completed')
            : [];

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

    // Summary stats (only for non-completed)
    const activeHarvests = harvests.filter(h => h.status !== 'completed');
    const activeCount = activeHarvests.length;

    const totalWetWeight = activeHarvests.reduce((sum, h) => sum + h.totalWetWeight, 0);

    const flowerWeight = activeHarvests
        .flatMap(h => h.allocations)
        .filter(a => a.allocationType === 'flower')
        .reduce((sum, a) => sum + a.targetWeight, 0);

    const frozenWeight = activeHarvests
        .flatMap(h => h.allocations)
        .filter(a => a.allocationType === 'frozen')
        .reduce((sum, a) => sum + a.targetWeight, 0);

    const statusCounts = harvests.reduce((acc, h) => {
        acc[h.status] = (acc[h.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="dashboard">
            {/* Compact summary bar */}
            {activeCount > 0 && (
                <div className="harvest-summary-bar">
                    <div className="harvest-summary-stat">
                        <span className="stat-number">{activeCount}</span>
                        <span className="stat-label">active</span>
                    </div>
                    <div className="harvest-summary-divider" />
                    <div className="harvest-summary-stat">
                        <span className="stat-number">{totalWetWeight.toFixed(0)}</span>
                        <span className="stat-label">g wet</span>
                    </div>
                    {flowerWeight > 0 && (
                        <>
                            <div className="harvest-summary-divider" />
                            <div className="harvest-summary-stat">
                                <span className="stat-number" style={{ color: 'var(--warning-color)' }}>{flowerWeight.toFixed(0)}</span>
                                <span className="stat-label">g flower</span>
                            </div>
                        </>
                    )}
                    {frozenWeight > 0 && (
                        <>
                            <div className="harvest-summary-divider" />
                            <div className="harvest-summary-stat">
                                <span className="stat-number" style={{ color: 'var(--secondary-color)' }}>{frozenWeight.toFixed(0)}</span>
                                <span className="stat-label">g frozen</span>
                            </div>
                        </>
                    )}
                </div>
            )}

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
                            {tab.key === 'active' && activeCount > 0 ? ` (${activeCount})` : ''}
                            {tab.key === 'completed' && statusCounts.completed ? ` (${statusCounts.completed})` : ''}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    {onStartHarvestDay && (
                        <button
                            type="button"
                            className="btn-start-batch"
                            onClick={onStartHarvestDay}
                        >
                            <Scissors size={16} />
                            Harvest Day
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn-new-batch"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={20} />
                        New Harvest
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === 'strains' ? (
                <StrainTable />
            ) : loading ? (
                <CardsSkeleton count={3} />
            ) : filteredHarvests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(59, 181, 112, 0.08)' }}>
                        <Sprout size={28} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {activeTab === 'completed' ? 'No completed harvests' : 'No harvests yet'}
                    </h3>
                    <p className="text-sm max-w-xs mb-4" style={{ color: 'var(--color-dolphin)' }}>
                        {activeTab === 'active'
                            ? 'Start tracking your plants from wet weight through drying and final allocation.'
                            : 'Harvests will appear here once they are marked complete.'}
                    </p>
                    {activeTab === 'active' && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-new-batch px-4 py-2 text-sm"
                        >
                            <Plus size={16} />
                            Create First Harvest
                        </button>
                    )}
                </div>
            ) : (
                <div className="harvest-grid">
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
