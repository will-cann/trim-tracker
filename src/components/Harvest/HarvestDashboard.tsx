import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Sprout, Package, Snowflake, Flower2 } from 'lucide-react';
import type { Harvest, HarvestStatus, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { CreateHarvestModal } from './CreateHarvestModal';

const TABS: { key: HarvestStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'planning', label: 'Planning' },
    { key: 'active', label: 'Active' },
    { key: 'drying', label: 'Drying' },
    { key: 'ready', label: 'Ready' },
    { key: 'completed', label: 'Completed' },
];

export const HarvestDashboard: React.FC = () => {
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<HarvestStatus | 'all'>('all');
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
        <div className="dashboard" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
            {/* Stats row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '1.5rem',
            }}>
                <div className="stat-item">
                    <div className="stat-icon" style={{ backgroundColor: '#ecfdf5' }}>
                        <Sprout size={24} color="#10b981" />
                    </div>
                    <div className="stat-content">
                        <label>Active Harvests</label>
                        <p className="stat-value">{(statusCounts.planning || 0) + (statusCounts.active || 0) + (statusCounts.drying || 0) + (statusCounts.ready || 0)}</p>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
                        <Package size={24} color="#3b82f6" />
                    </div>
                    <div className="stat-content">
                        <label>Total Wet Weight</label>
                        <p className="stat-value">{totalWetWeight.toFixed(0)}g</p>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon" style={{ backgroundColor: '#fef3c7' }}>
                        <Flower2 size={24} color="#d97706" />
                    </div>
                    <div className="stat-content">
                        <label>Flower Allocated</label>
                        <p className="stat-value">{flowerWeight.toFixed(0)}g</p>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
                        <Snowflake size={24} color="#3b82f6" />
                    </div>
                    <div className="stat-content">
                        <label>Frozen Allocated</label>
                        <p className="stat-value">{frozenWeight.toFixed(0)}g</p>
                    </div>
                </div>
            </div>

            {/* Tabs + New Harvest button */}
            <div className="actions-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
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

            {/* Harvest list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading harvests...</div>
            ) : filteredHarvests.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    color: '#9ca3af',
                    backgroundColor: 'white',
                    borderRadius: '0.75rem',
                    border: '1px solid #e5e7eb',
                }}>
                    <Sprout size={48} color="#d1d5db" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ fontSize: '1rem', fontWeight: 500 }}>No harvests{activeTab !== 'all' ? ` in ${activeTab}` : ''}</p>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Create a new harvest to get started.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
