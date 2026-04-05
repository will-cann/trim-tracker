import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Sprout, Scissors } from 'lucide-react';
import type { Harvest, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { HarvestKanban } from './HarvestKanban';
import { CreateHarvestModal } from './CreateHarvestModal';
import { CardsSkeleton } from '../Skeleton';
import { DataTable, FilterToolbar, ViewToggle, useViewMode } from '../ui';
import type { Column } from '../ui';
import ResourceTimeline from '../ui/ResourceTimeline';
import ResourceCalendar from '../ui/ResourceCalendar';
import { buildDryingSchedule } from './harvestDryingAdapter';

const STATUS_FILTER_OPTIONS = [
    { value: 'planning', label: 'Planning' },
    { value: 'cutting', label: 'Cutting' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'hanging', label: 'Hanging' },
    { value: 'bucking', label: 'Binning' },
    { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS: Record<string, string> = {
    planning: '#1C9EFF',
    cutting: '#3BB570',
    active: '#3BB570',
    submitted: '#FA9E52',
    hanging: '#FA9E52',
    drying: '#FA9E52',
    bucking: '#C27ADB',
    ready: '#C27ADB',
    completed: '#959595',
};

const STATUS_LABELS: Record<string, string> = {
    planning: 'Planning',
    cutting: 'Cutting',
    active: 'Active',
    submitted: 'Submitted',
    hanging: 'Hanging',
    drying: 'Drying',
    bucking: 'Binning',
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
    const [viewMode, setViewMode] = useViewMode('harvests', 'kanban');
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
        if ((viewMode !== 'schedule' && viewMode !== 'calendar') || dryingRoomsLoaded) return;
        apiService.getRooms().then(rooms => {
            setDryingRooms(rooms as Array<{ id: string; name: string; room_type: string }>);
            setDryingRoomsLoaded(true);
        });
    }, [viewMode, dryingRoomsLoaded]);

    const dryingScheduleRaw = useMemo(
        () => buildDryingSchedule(harvests, dryingRooms),
        [harvests, dryingRooms],
    );

    // Apply search/filters to drying schedule
    const dryingSchedule = useMemo(() => {
        let { resources, blocks } = dryingScheduleRaw;
        if (search) {
            const q = search.toLowerCase();
            blocks = blocks.filter(b =>
                b.label.toLowerCase().includes(q) || b.sublabel?.toLowerCase().includes(q)
            );
        }
        if (activeFilters.strain?.length) {
            blocks = blocks.filter(b => activeFilters.strain.some(s => b.label.toLowerCase().includes(s.toLowerCase())));
        }
        if (activeFilters.status?.length) {
            blocks = blocks.filter(b => activeFilters.status.includes(b.status));
        }
        if (search || activeFilters.strain?.length || activeFilters.status?.length) {
            const usedIds = new Set(blocks.map(b => b.resourceId));
            resources = resources.filter(r => usedIds.has(r.id));
        }
        return { resources, blocks };
    }, [dryingScheduleRaw, search, activeFilters]);

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

    // Pipeline stats
    const statusMap = new Map<string, number>();
    for (const h of harvests) {
        const s = h.status;
        statusMap.set(s, (statusMap.get(s) || 0) + 1);
    }
    const pipelineCounts = {
        planning: (statusMap.get('planning') || 0),
        cutting: (statusMap.get('cutting') || 0) + (statusMap.get('active') || 0),
        submitted: (statusMap.get('submitted') || 0),
        hanging: (statusMap.get('hanging') || 0) + (statusMap.get('drying') || 0),
        bucking: (statusMap.get('bucking') || 0) + (statusMap.get('ready') || 0),
    };
    const activeCount = Object.values(pipelineCounts).reduce((a, b) => a + b, 0);

    const allBins = harvests.flatMap(h => h.bins || []);
    const binsCuring = allBins.filter(b => b.status === 'curing').length;
    const binsReady = allBins.filter(b => b.status === 'ready').length;

    // Expanded card state (for kanban card clicks)
    const [expandedHarvestId, setExpandedHarvestId] = useState<string | null>(null);


    return (
        <div className="dashboard">
            {/* Pipeline summary bar */}
            {activeCount > 0 && (
                <div className="harvest-summary-bar">
                    {pipelineCounts.planning > 0 && (
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: '#1C9EFF' }}>{pipelineCounts.planning}</span>
                            <span className="stat-label">planning</span>
                        </div>
                    )}
                    {pipelineCounts.cutting > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: '#3BB570' }}>{pipelineCounts.cutting}</span>
                            <span className="stat-label">cutting</span>
                        </div>
                    </>)}
                    {pipelineCounts.hanging > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: '#FA9E52' }}>{pipelineCounts.hanging}</span>
                            <span className="stat-label">hanging</span>
                        </div>
                    </>)}
                    {pipelineCounts.bucking > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: '#C27ADB' }}>{pipelineCounts.bucking}</span>
                            <span className="stat-label">binning</span>
                        </div>
                    </>)}
                    {(binsCuring > 0 || binsReady > 0) && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number">{binsCuring}</span>
                            <span className="stat-label">bins curing</span>
                        </div>
                        {binsReady > 0 && (<>
                            <div className="harvest-summary-divider" />
                            <div className="harvest-summary-stat">
                                <span className="stat-number" style={{ color: '#3BB570' }}>{binsReady}</span>
                                <span className="stat-label">bins ready</span>
                            </div>
                        </>)}
                    </>)}
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
                        <ViewToggle mode={viewMode} onChange={setViewMode} showKanban showSchedule showCalendar />
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
            {viewMode === 'kanban' ? (
                <div className="mt-2">
                    {/* Expanded card above kanban when clicking a card */}
                    {expandedHarvestId && (() => {
                        const h = harvests.find(x => x.id === expandedHarvestId);
                        if (!h) return null;
                        return (
                            <div style={{ marginBottom: 12 }}>
                                <HarvestCard
                                    harvest={h}
                                    onRecordWetWeight={handleRecordWetWeight}
                                    onAllocate={handleAllocate}
                                    onRecordWaste={handleRecordWaste}
                                    onConvertToTrim={handleConvertToTrim}
                                    onDelete={handleDelete}
                                    onUpdate={handleUpdate}
                                    onCreatePackage={handleCreatePackage}
                                    defaultExpanded
                                    onClose={() => setExpandedHarvestId(null)}
                                />
                            </div>
                        );
                    })()}
                    <HarvestKanban
                        harvests={filteredHarvests}
                        onUpdate={loadHarvests}
                        onCardClick={(id) => setExpandedHarvestId(expandedHarvestId === id ? null : id)}
                        onNavigateHarvestDay={onStartHarvestDay}
                    />
                </div>
            ) : viewMode === 'schedule' ? (
                <div className="mt-2">
                    <ResourceTimeline
                        resources={dryingSchedule.resources}
                        blocks={dryingSchedule.blocks}
                    />
                </div>
            ) : viewMode === 'calendar' ? (
                <div className="mt-2">
                    <ResourceCalendar
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
                        {hasFilters ? 'No harvests match your filters' : 'Ready to track a harvest'}
                    </h3>
                    <p className="text-sm max-w-xs mb-4" style={{ color: 'var(--color-dolphin)' }}>
                        {hasFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Record wet weights, track drying progress, and allocate flower vs. frozen. Each harvest flows through the pipeline from cut to completion.'}
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
