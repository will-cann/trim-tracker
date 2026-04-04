import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Sprout, Scissors } from 'lucide-react';
import type { Harvest, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { CreateHarvestModal } from './CreateHarvestModal';
import { CardsSkeleton } from '../Skeleton';
import { DataTable, FilterToolbar, ViewToggle, useViewMode } from '../ui';
import type { Column } from '../ui';
import ResourceTimeline from '../ui/ResourceTimeline';
import { buildDryingSchedule } from './harvestDryingAdapter';

const STATUS_FILTER_OPTIONS = [
    { value: 'planning', label: 'Planning' },
    { value: 'active', label: 'Active' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'drying', label: 'Drying' },
    { value: 'ready', label: 'Ready' },
    { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS: Record<string, string> = {
    planning: '#1C9EFF',
    active: '#3BB570',
    submitted: '#3BB570',
    drying: '#FA9E52',
    ready: '#FA9E52',
    completed: '#959595',
};

const STATUS_LABELS: Record<string, string> = {
    planning: 'Planning',
    active: 'Active',
    submitted: 'Submitted',
    drying: 'Drying',
    ready: 'Ready',
    completed: 'Completed',
};

const formatWeight = (g: number) => {
    if (g === 0) return '—';
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${g.toLocaleString(undefined, { maximumFractionDigits: 0 })} g`;
};

const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

const HARVEST_COLUMNS: Column<Harvest>[] = [
    {
        key: 'strain', label: 'Strain', sortable: true,
        render: (h) => <span style={{ fontWeight: 600 }}>{h.strain}</span>,
    },
    {
        key: 'batchId', label: 'Batch', sortable: true,
        render: (h) => <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#959595' }}>{h.batchId}</span>,
    },
    {
        key: 'status', label: 'Status', sortable: true, width: 100,
        render: (h) => (
            <span className="data-table-badge" style={{ background: STATUS_COLORS[h.status] || '#959595' }}>
                {STATUS_LABELS[h.status] || h.status}
            </span>
        ),
    },
    {
        key: 'plantCount', label: 'Plants', sortable: true, width: 70, align: 'right',
        render: (h) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{h.plantCount}</span>,
    },
    {
        key: 'totalWetWeight', label: 'Wet Weight', sortable: true, width: 110, align: 'right',
        render: (h) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatWeight(h.totalWetWeight)}</span>,
    },
    {
        key: 'dryWeight', label: 'Dry Weight', sortable: true, width: 110, align: 'right',
        render: (h) => <span style={{ fontVariantNumeric: 'tabular-nums', color: h.dryWeight ? '#1A1A1A' : '#C0C0C0' }}>{h.dryWeight ? formatWeight(h.dryWeight) : '—'}</span>,
    },
    {
        key: 'harvestStartDate', label: 'Start', sortable: true, width: 90,
        render: (h) => <span style={{ color: '#959595' }}>{formatDate(h.harvestStartDate)}</span>,
    },
    {
        key: 'createdAt', label: 'Created', sortable: true, width: 90,
        render: (h) => <span style={{ color: '#959595' }}>{formatDate(h.createdAt)}</span>,
    },
];

interface HarvestDashboardProps {
    onStartHarvestDay?: () => void;
}

export const HarvestDashboard: React.FC<HarvestDashboardProps> = ({ onStartHarvestDay }) => {
    const [harvests, setHarvests] = useState<Harvest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [viewMode, setViewMode] = useViewMode('harvests');
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [sortKey, setSortKey] = useState<string | null>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const [dryingRooms, setDryingRooms] = useState<Array<{ id: string; name: string; room_type: string }>>([]);
    const [dryingRoomsLoaded, setDryingRoomsLoaded] = useState(false);

    const loadHarvests = useCallback(async () => {
        setLoading(true);
        const data = await apiService.getHarvests();
        setHarvests(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadHarvests();
    }, [loadHarvests]);

    // Load rooms lazily for drying schedule
    useEffect(() => {
        if (viewMode !== 'schedule' || dryingRoomsLoaded) return;
        apiService.getRooms().then(rooms => {
            setDryingRooms(rooms as Array<{ id: string; name: string; room_type: string }>);
            setDryingRoomsLoaded(true);
        });
    }, [viewMode, dryingRoomsLoaded]);

    const dryingSchedule = useMemo(
        () => buildDryingSchedule(harvests, dryingRooms),
        [harvests, dryingRooms],
    );

    const uniqueStrains = [...new Set(harvests.map(h => h.strain).filter(Boolean))].sort();

    const strainFilterDef = {
        key: 'strain', label: 'Strain', multi: true,
        options: uniqueStrains.map(s => ({ value: s, label: s })),
    };

    const statusFilterDef = {
        key: 'status', label: 'Status', multi: true,
        options: STATUS_FILTER_OPTIONS,
    };

    const searchedHarvests = harvests.filter(h => {
        if (search) {
            const q = search.toLowerCase();
            if (
                !h.strain?.toLowerCase().includes(q) &&
                !h.batchId?.toLowerCase().includes(q) &&
                !h.name?.toLowerCase().includes(q)
            ) return false;
        }
        if (activeFilters.status?.length && !activeFilters.status.includes(h.status)) return false;
        if (activeFilters.strain?.length && !activeFilters.strain.includes(h.strain)) return false;
        return true;
    });

    const filteredHarvests = [...searchedHarvests].sort((a, b) => {
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

    const handleCreatePackage = async (data: Parameters<typeof apiService.createPackage>[0]) => {
        await apiService.createPackage(data);
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

            <FilterToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search harvests..."
                filters={[statusFilterDef, strainFilterDef]}
                activeFilters={activeFilters}
                onFilterChange={(key, values) => setActiveFilters(prev => ({ ...prev, [key]: values }))}
                onClearFilters={() => setActiveFilters({})}
                trailing={
                    <div className="flex items-center gap-2">
                        <ViewToggle mode={viewMode} onChange={setViewMode} showSchedule />
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
                }
            />

            {/* Content */}
            {viewMode === 'schedule' ? (
                <div className="mt-2">
                    <ResourceTimeline
                        resources={dryingSchedule.resources}
                        blocks={dryingSchedule.blocks}
                    />
                </div>
            ) : viewMode === 'table' ? (
                <div className="mt-4">
                    <DataTable
                        columns={HARVEST_COLUMNS}
                        data={filteredHarvests}
                        loading={loading}
                        emptyMessage={hasFilters ? 'No harvests match your filters.' : 'No harvests yet.'}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                    />
                </div>
            ) : loading ? (
                <CardsSkeleton count={3} />
            ) : filteredHarvests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(59, 181, 112, 0.08)' }}>
                        <Sprout size={28} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {hasFilters ? 'No harvests match your filters' : 'No harvests yet'}
                    </h3>
                    <p className="text-sm max-w-xs mb-4" style={{ color: 'var(--color-dolphin)' }}>
                        {hasFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Start tracking your plants from wet weight through drying and final allocation.'}
                    </p>
                    {!hasFilters && (
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
                            onCreatePackage={handleCreatePackage}
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
