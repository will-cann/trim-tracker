import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Sprout, Scissors, ArrowRight } from 'lucide-react';
import type { Harvest, HarvestWasteType, CreateHarvestDTO } from '../../types/definitions';
import { getHarvestPathway } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { HarvestCard } from './HarvestCard';
import { HarvestKanban } from './HarvestKanban';
import { CreateHarvestModal } from './CreateHarvestModal';
import { CardsSkeleton } from '../Skeleton';
import { DataTable, FilterToolbar, ViewToggle, useViewMode, TypeChip, EmptyState, DashboardHeader } from '../ui';
import type { Column } from '../ui';
import ResourceTimeline from '../ui/ResourceTimeline';
import ResourceCalendar from '../ui/ResourceCalendar';
import { buildDryingSchedule } from './harvestDryingAdapter';

const STATUS_FILTER_OPTIONS = [
    { value: 'planning', label: 'Planning' },
    { value: 'cutting', label: 'Cutting' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'hanging', label: 'Hanging' },
    { value: 'bucking', label: 'Final Prep' },
    { value: 'completed', label: 'Completed' },
];

const formatWeight = (g: number) => {
    if (g === 0) return '—';
    if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
    return `${g.toLocaleString(undefined, { maximumFractionDigits: 0 })} g`;
};

const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

// Next-stage action map — mirrors the kanban drag transitions so the table view
// gives mobile/tap users the same pipeline advance capability.
const DRY_NEXT_STAGE: Record<string, { nextStatus: string; label: string; useApprove?: boolean }> = {
    planning:  { nextStatus: 'cutting',   label: 'Start Cutting' },
    cutting:   { nextStatus: 'submitted', label: 'Submit' },
    submitted: { nextStatus: 'hanging',   label: 'Approve & Hang', useApprove: true },
    hanging:   { nextStatus: 'bucking',   label: 'Move to Final Prep' },
    drying:    { nextStatus: 'bucking',   label: 'Move to Final Prep' },
    bucking:   { nextStatus: 'completed', label: 'Complete' },
    ready:     { nextStatus: 'completed', label: 'Complete' },
};

const FROZEN_NEXT_STAGE: Record<string, { nextStatus: string; label: string }> = {
    planning:  { nextStatus: 'cutting',   label: 'Start Cutting' },
    cutting:   { nextStatus: 'submitted', label: 'Submit' },
    submitted: { nextStatus: 'completed', label: 'Complete' },
};

const buildHarvestColumns = (
    onAdvance: (h: Harvest) => void,
): Column<Harvest>[] => [
    {
        key: 'strain', label: 'Strain', sortable: true,
        render: (h) => <span style={{ fontWeight: 600 }}>{h.strain}</span>,
    },
    {
        key: 'batchId', label: 'Batch', sortable: true,
        render: (h) => <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem', color: '#959595' }}>{h.batchId}</span>,
    },
    {
        key: 'status', label: 'Status', sortable: true, width: 120,
        render: (h) => <TypeChip palette="harvestStatus" value={h.status} />,
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
    {
        key: 'advance', label: '', width: 160, sortable: false,
        render: (h) => {
            const pathway = getHarvestPathway(h.allocations);
            const stageMap = pathway === 'frozen' ? FROZEN_NEXT_STAGE : DRY_NEXT_STAGE;
            const next = stageMap[h.status];
            if (!next) return null;
            return (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAdvance(h); }}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #E0E0E0',
                        background: '#FFFFFF',
                        color: '#1A1A1A',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                    title={`Advance to ${next.nextStatus}`}
                >
                    {next.label}
                    <ArrowRight size={12} />
                </button>
            );
        },
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

    const handleAdvance = useCallback(async (h: Harvest) => {
        const pathway = getHarvestPathway(h.allocations);
        const stageMap = pathway === 'frozen' ? FROZEN_NEXT_STAGE : DRY_NEXT_STAGE;
        const next = stageMap[h.status];
        if (!next) return;
        try {
            if ('useApprove' in next && next.useApprove) {
                await apiService.approveHarvestDay([h.id]);
            } else {
                await apiService.updateHarvest(h.id, { status: next.nextStatus });
            }
            await loadHarvests();
        } catch (e) {
            console.error('Failed to advance harvest stage:', e);
        }
    }, [loadHarvests]);

    const tableColumns = useMemo(() => buildHarvestColumns(handleAdvance), [handleAdvance]);

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
            <DashboardHeader
                eyebrow="Harvests"
                title={activeCount > 0 ? `${activeCount} active ${activeCount === 1 ? 'batch' : 'batches'}` : 'Harvests'}
                density="compact"
                actions={
                    <>
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
                    </>
                }
            />

            {/* Pipeline summary bar */}
            {activeCount > 0 && (
                <div className="harvest-summary-bar">
                    {pipelineCounts.planning > 0 && (
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: 'var(--color-trim)' }}>{pipelineCounts.planning}</span>
                            <span className="stat-label">planning</span>
                        </div>
                    )}
                    {pipelineCounts.cutting > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: 'var(--color-flower)' }}>{pipelineCounts.cutting}</span>
                            <span className="stat-label">cutting</span>
                        </div>
                    </>)}
                    {pipelineCounts.hanging > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: 'var(--color-shake)' }}>{pipelineCounts.hanging}</span>
                            <span className="stat-label">hanging</span>
                        </div>
                    </>)}
                    {pipelineCounts.bucking > 0 && (<>
                        <div className="harvest-summary-divider" />
                        <div className="harvest-summary-stat">
                            <span className="stat-number" style={{ color: 'var(--color-flower)' }}>{pipelineCounts.bucking}</span>
                            <span className="stat-label">final prep</span>
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
                                <span className="stat-number" style={{ color: 'var(--color-flower)' }}>{binsReady}</span>
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
                    <ViewToggle mode={viewMode} onChange={setViewMode} showKanban showSchedule showCalendar />
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
                        columns={tableColumns}
                        data={filteredHarvests}
                        loading={loading}
                        emptyMessage={hasFilters ? 'No harvests match your filters.' : 'Create your first harvest to start tracking weights and allocations.'}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                    />
                </div>
            ) : loading ? (
                <CardsSkeleton count={3} />
            ) : filteredHarvests.length === 0 ? (
                <EmptyState
                    icon={Sprout}
                    title={hasFilters ? 'No harvests match your filters' : 'Ready to track a harvest'}
                    description={
                        hasFilters
                            ? 'Try adjusting your search or filters.'
                            : 'Record wet weights, track drying progress, and allocate flower vs. frozen. Each harvest flows through the pipeline from cut to completion.'
                    }
                    action={
                        !hasFilters && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn-new-batch px-4 py-2 text-sm"
                            >
                                <Plus size={16} />
                                Create First Harvest
                            </button>
                        )
                    }
                />
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
