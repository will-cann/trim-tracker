import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Leaf, Plus } from 'lucide-react';
import type { PlantPhase } from '../../types/plantMap';
import type { PlantListItem } from './cultivationScheduleAdapter';
import { PHASE_TABS } from '../../types/plantMap';
import { usePlantMap } from '../../hooks/usePlantMap';
import { PlantMapSummary } from './PlantMapSummary';
import { RoomCard } from './RoomCard';
import { ExpandedRoom } from './ExpandedRoom';
import { RoomGridSkeleton } from '../Skeleton';
import { CreatePlantingModal } from './CreatePlantingModal';
import { DataTable, ViewToggle, useViewMode, FilterToolbar } from '../ui';
import type { Column, FilterDef } from '../ui';
import { apiService } from '../../services/apiService';
import ResourceTimeline from '../ui/ResourceTimeline';
import ResourceCalendar from '../ui/ResourceCalendar';
import { buildCultivationSchedule } from './cultivationScheduleAdapter';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
    nursery: '#1C9EFF',
    vegetative: '#3BB570',
    flowering: '#FA9E52',
    harvested: '#959595',
};

const healthDotColor = (h: number) => h >= 80 ? '#3BB570' : h >= 50 ? '#FA9E52' : '#DF5B59';

const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const phaseDate = (row: any) =>
    row.floweringDate || row.vegetativeDate || row.plantedDate || null;

// ── Column definitions ───────────────────────────────────────────────────────

const PLANT_COLUMNS: Column<any>[] = [
    {
        key: 'label', label: 'Label', sortable: true,
        render: (r) => (
            <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8125rem' }}>
                {r.label}
                {r.batchCount && <span style={{ color: '#959595', fontWeight: 400 }}> ({r.batchCount})</span>}
            </span>
        ),
    },
    { key: 'strainName', label: 'Strain', sortable: true },
    {
        key: 'growthPhase', label: 'Phase', sortable: true, width: 100,
        render: (r) => (
            <span className="data-table-badge" style={{ background: PHASE_COLORS[r.growthPhase] || '#959595' }}>
                {r.growthPhase === 'vegetative' ? 'Veg' : r.growthPhase.charAt(0).toUpperCase() + r.growthPhase.slice(1)}
            </span>
        ),
    },
    { key: 'roomName', label: 'Room', sortable: true },
    {
        key: 'plantHealth', label: 'Health', sortable: true, width: 80, align: 'center',
        render: (r) => (
            <span className="flex items-center justify-center gap-1.5">
                <span className="data-table-dot" style={{ background: healthDotColor(r.plantHealth) }} />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.plantHealth}</span>
            </span>
        ),
    },
    {
        key: 'phaseDate', label: 'Phase Date', sortable: true, width: 120,
        render: (r) => <span style={{ color: '#959595' }}>{formatDate(phaseDate(r))}</span>,
    },
    {
        key: 'targetHarvestDate', label: 'Target Harvest', sortable: true, width: 120,
        render: (r) => <span style={{ color: '#959595' }}>{formatDate(r.targetHarvestDate)}</span>,
    },
];


// ── Main Component ──────────────────────────────────────────────────────────

interface PlantMapDashboardProps {
    refreshKey?: number;
}

export const PlantMapDashboard: React.FC<PlantMapDashboardProps> = ({ refreshKey }) => {
    const [activePhase, setActivePhase] = useState<PlantPhase | 'all'>('all');
    const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [viewMode, setViewMode] = useViewMode('plant-map');
    const { data, loading, refetch } = usePlantMap(activePhase);

    // Table mode state
    const [plantList, setPlantList] = useState<any[]>([]);
    const [tableLoading, setTableLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Rooms list (shared between schedule and "all" phase detection)
    const [allRooms, setAllRooms] = useState<Array<{ id: string; name: string; room_type: string }>>([]);
    const [roomsLoaded, setRoomsLoaded] = useState(false);

    // Schedule mode state
    const [schedulePlants, setSchedulePlants] = useState<PlantListItem[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleLoaded, setScheduleLoaded] = useState(false);

    // Refetch when external actions modify plant data
    const prevRefreshKey = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
            prevRefreshKey.current = refreshKey;
            refetch();
            if (viewMode === 'table') loadPlantList();
        }
    }, [refreshKey, refetch]);

    // Load flat plant list when entering table mode
    const loadPlantList = useCallback(async () => {
        setTableLoading(true);
        const data = await apiService.getPlantsList();
        setPlantList(data);
        setTableLoading(false);
    }, []);

    useEffect(() => {
        if (viewMode === 'table') loadPlantList();
    }, [viewMode, loadPlantList]);

    // Load rooms when needed (for "all" phase detection or schedule view)
    useEffect(() => {
        if (roomsLoaded) return;
        if (activePhase !== 'all' && viewMode !== 'schedule' && viewMode !== 'calendar') return;
        apiService.getRooms().then(rooms => {
            setAllRooms(rooms as Array<{ id: string; name: string; room_type: string }>);
            setRoomsLoaded(true);
        });
    }, [activePhase, viewMode, roomsLoaded]);

    // Load schedule data lazily
    useEffect(() => {
        if ((viewMode !== 'schedule' && viewMode !== 'calendar') || scheduleLoaded) return;
        let cancelled = false;
        setScheduleLoading(true);
        apiService.getPlantsList().then(plants => {
            if (cancelled) return;
            setSchedulePlants(plants as PlantListItem[]);
            setScheduleLoaded(true);
            setScheduleLoading(false);
        }).catch(() => {
            if (!cancelled) setScheduleLoading(false);
        });
        return () => { cancelled = true; };
    }, [viewMode, scheduleLoaded]);

    const scheduleDataRaw = useMemo(
        () => buildCultivationSchedule(schedulePlants, allRooms),
        [schedulePlants, allRooms],
    );

    // Apply search/filters to schedule data
    const scheduleData = useMemo(() => {
        let { resources, blocks } = scheduleDataRaw;
        if (search) {
            const q = search.toLowerCase();
            blocks = blocks.filter(b =>
                b.label.toLowerCase().includes(q) || b.sublabel?.toLowerCase().includes(q)
            );
        }
        if (activeFilters.strain?.length) {
            blocks = blocks.filter(b => activeFilters.strain.some(s => b.label.toLowerCase().includes(s.toLowerCase())));
        }
        if (activeFilters.room?.length) {
            const roomIds = new Set(resources.filter(r => activeFilters.room.includes(r.name)).map(r => r.id));
            blocks = blocks.filter(b => roomIds.has(b.resourceId));
            resources = resources.filter(r => roomIds.has(r.id));
        }
        // Remove empty resources if filtering
        if (search || activeFilters.strain?.length) {
            const usedIds = new Set(blocks.map(b => b.resourceId));
            resources = resources.filter(r => usedIds.has(r.id));
        }
        return { resources, blocks };
    }, [scheduleDataRaw, search, activeFilters]);

    const currentTab = PHASE_TABS.find(t => t.key === activePhase) || { key: 'all' as const, label: 'All', entity: 'plants' as const };
    const rooms = data ? Object.entries(data) : [];

    // Room name → room type lookup for phase detection in "all" mode
    const roomTypeByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of allRooms) map.set(r.name, r.room_type || '');
        return map;
    }, [allRooms]);

    // Filter rooms by search and active filters
    const filteredRooms = rooms.filter(([name, room]) => {
        if (search) {
            const q = search.toLowerCase();
            if (!name.toLowerCase().includes(q)
                && !(room as any).strains?.some((s: string) => s.toLowerCase().includes(q))) return false;
        }
        if (activeFilters.strain?.length) {
            if (!(room as any).strains?.some((s: string) => activeFilters.strain.includes(s))) return false;
        }
        if (activeFilters.room?.length) {
            if (!activeFilters.room.includes(name)) return false;
        }
        return true;
    });

    const handlePhaseChange = useCallback((phase: PlantPhase | 'all') => {
        setExpandedRoom(null);
        setActivePhase(phase);
    }, []);

    const handleRoomClick = useCallback((name: string) => {
        setExpandedRoom(prev => prev === name ? null : name);
    }, []);

    // Shared filter definitions across card and table views
    const allStrains = viewMode === 'table'
        ? [...new Set(plantList.map(p => p.strainName).filter(Boolean))].sort()
        : [...new Set(rooms.flatMap(([, r]) => (r as any).strains || []))].sort();

    const allRoomNames = viewMode === 'table'
        ? [...new Set(plantList.map(p => p.roomName).filter(Boolean))].sort()
        : rooms.map(([name]) => name).sort();

    const phaseFilter: FilterDef = {
        key: 'phase', label: 'Phase', multi: false,
        options: [
            { value: 'nursery', label: 'Nursery' },
            { value: 'vegetative', label: 'Veg' },
            { value: 'flowering', label: 'Flowering' },
            ...(viewMode === 'table' ? [{ value: 'harvested', label: 'Harvested' }] : []),
        ],
    };

    const strainFilter: FilterDef = {
        key: 'strain', label: 'Strain', multi: true,
        options: allStrains.map(s => ({ value: s, label: s })),
    };

    const roomFilter: FilterDef = {
        key: 'room', label: 'Room', multi: true,
        options: allRoomNames.map(r => ({ value: r, label: r })),
    };

    const filteredPlants = plantList.filter(p => {
        const q = search.toLowerCase();
        if (q && ![p.label, p.strainName, p.roomName].some(v => v?.toLowerCase().includes(q))) return false;
        if (activeFilters.phase?.length && !activeFilters.phase.includes(p.growthPhase)) return false;
        if (activeFilters.strain?.length && !activeFilters.strain.includes(p.strainName)) return false;
        if (activeFilters.room?.length && !activeFilters.room.includes(p.roomName)) return false;
        return true;
    });

    const sortedPlants = [...filteredPlants].sort((a, b) => {
        if (!sortKey) return 0;
        let aVal = sortKey === 'phaseDate' ? phaseDate(a) : a[sortKey];
        let bVal = sortKey === 'phaseDate' ? phaseDate(b) : b[sortKey];
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

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Plant Map</h1>
                        <p className="text-xs text-gray-400">
                            {viewMode === 'schedule' ? 'Room occupancy timeline' : viewMode === 'calendar' ? 'Monthly cultivation calendar' : viewMode === 'table' ? 'All plants across your facility' : 'Rooms and plant health across your facility'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ViewToggle mode={viewMode} onChange={setViewMode} showSchedule showCalendar />
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-new-batch"
                    >
                        <Plus size={16} />
                        New Planting
                    </button>
                </div>
            </div>

            <FilterToolbar
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={viewMode === 'cards' ? 'Search rooms...' : 'Search plants...'}
                    filters={[phaseFilter, strainFilter, roomFilter]}
                    activeFilters={activeFilters}
                    onFilterChange={(key, values) => {
                        setActiveFilters(prev => ({ ...prev, [key]: values }));
                        // Drive phase data fetch from phase filter
                        if (key === 'phase') {
                            if (values.length === 1) handlePhaseChange(values[0] as PlantPhase);
                            else handlePhaseChange('all');
                        }
                    }}
                    onClearFilters={() => { setActiveFilters({}); handlePhaseChange('all'); }}
                />

            {viewMode === 'cards' && (
                <>

                    {loading ? (
                        <RoomGridSkeleton count={3} />
                    ) : filteredRooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                                <Leaf size={22} className="text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">
                                {search || Object.values(activeFilters).some(v => v.length) ? 'No rooms match your filters' : activePhase === 'all' ? 'No plants yet' : `No ${currentTab.label.toLowerCase()} plants`}
                            </h3>
                            <p className="text-xs text-gray-400 max-w-[240px] mb-5">
                                {search || Object.values(activeFilters).some(v => v.length)
                                    ? 'Try adjusting your search or filters.'
                                    : activePhase === 'all' ? 'Rooms with plants will appear here once added.' : `Rooms with ${currentTab.label.toLowerCase()} plants will appear here once added.`}
                            </p>
                            {!search && !Object.values(activeFilters).some(v => v.length) && (
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="btn-new-batch"
                                >
                                    <Plus size={16} />
                                    Add Plants
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="plant-map-grid">
                            <PlantMapSummary data={data!} />
                            {filteredRooms.map(([name, room]) => {
                                // For expanded room in "all" view, derive phase from room type
                                const rt = roomTypeByName.get(name) || '';
                                const roomPhase: PlantPhase = activePhase === 'all'
                                    ? (rt === 'nursery' ? 'nursery'
                                        : rt === 'veg' || rt === 'vegetative' ? 'vegetative'
                                        : 'flowering')
                                    : activePhase;
                                const roomPhaseLabel = activePhase === 'all'
                                    ? (roomPhase === 'nursery' ? 'Nursery' : roomPhase === 'vegetative' ? 'Vegetative' : 'Flowering')
                                    : currentTab.label;

                                return expandedRoom === name ? (
                                    <ExpandedRoom
                                        key={name}
                                        name={name}
                                        room={room}
                                        phase={roomPhase}
                                        phaseLabel={roomPhaseLabel}
                                        onCollapse={() => setExpandedRoom(null)}
                                        onRevalidate={refetch}
                                    />
                                ) : (
                                    <RoomCard
                                        key={name}
                                        name={name}
                                        room={room}
                                        phase={roomPhase}
                                        phaseLabel={roomPhaseLabel}
                                        onClick={() => handleRoomClick(name)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {viewMode === 'table' && (
                <>
                    <div className="mt-4">
                        <DataTable
                            columns={PLANT_COLUMNS}
                            data={sortedPlants}
                            loading={tableLoading}
                            emptyMessage={search || Object.values(activeFilters).some(v => v.length) ? 'No plants match your filters.' : 'Add plantings from the AI chat or create them above to start tracking your canopy.'}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                        />
                    </div>
                </>
            )}

            {viewMode === 'schedule' && (
                <div className="mt-2">
                    {scheduleLoading ? (
                        <div className="data-table-empty">Loading schedule...</div>
                    ) : (
                        <ResourceTimeline
                            resources={scheduleData.resources}
                            blocks={scheduleData.blocks}
                        />
                    )}
                </div>
            )}

            {viewMode === 'calendar' && (
                <div className="mt-2">
                    {scheduleLoading ? (
                        <div className="data-table-empty">Loading calendar...</div>
                    ) : (
                        <ResourceCalendar
                            resources={scheduleData.resources}
                            blocks={scheduleData.blocks}
                        />
                    )}
                </div>
            )}

            {showCreateModal && (
                <CreatePlantingModal
                    activePhase={activePhase === 'all' ? 'flowering' : activePhase}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => { setShowCreateModal(false); refetch(); if (viewMode === 'table') loadPlantList(); }}
                />
            )}
        </div>
    );
};
