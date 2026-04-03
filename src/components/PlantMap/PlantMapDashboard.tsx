import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Leaf, Plus } from 'lucide-react';
import type { PlantPhase } from '../../types/plantMap';
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
    const [activePhase, setActivePhase] = useState<PlantPhase>('flowering');
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

    const currentTab = PHASE_TABS.find(t => t.key === activePhase)!;
    const rooms = data ? Object.entries(data) : [];

    const handlePhaseChange = useCallback((phase: PlantPhase) => {
        setExpandedRoom(null);
        setActivePhase(phase);
    }, []);

    const handleRoomClick = useCallback((name: string) => {
        setExpandedRoom(prev => prev === name ? null : name);
    }, []);

    // ── Table mode: filtering & sorting ──

    const uniqueStrains = [...new Set(plantList.map(p => p.strainName).filter(Boolean))].sort();
    const uniqueRooms = [...new Set(plantList.map(p => p.roomName).filter(Boolean))].sort();

    const phaseFilter: FilterDef = {
        key: 'phase', label: 'Phase', multi: true,
        options: [
            { value: 'nursery', label: 'Nursery' },
            { value: 'vegetative', label: 'Veg' },
            { value: 'flowering', label: 'Flowering' },
            { value: 'harvested', label: 'Harvested' },
        ],
    };

    const strainFilter: FilterDef = {
        key: 'strain', label: 'Strain', multi: true,
        options: uniqueStrains.map(s => ({ value: s, label: s })),
    };

    const roomFilter: FilterDef = {
        key: 'room', label: 'Room', multi: true,
        options: uniqueRooms.map(r => ({ value: r, label: r })),
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
                            {viewMode === 'cards' ? 'Rooms and plant health by growth phase' : 'All plants across your facility'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ViewToggle mode={viewMode} onChange={setViewMode} />
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-new-batch"
                    >
                        <Plus size={16} />
                        New Planting
                    </button>
                </div>
            </div>

            {viewMode === 'cards' ? (
                <>
                    {/* Phase tabs */}
                    <div className="actions-row">
                        <div className="tabs-container">
                            {PHASE_TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`tab-button ${activePhase === tab.key ? 'active' : ''}`}
                                    onClick={() => handlePhaseChange(tab.key)}
                                >
                                    {tab.label}
                                    {data && activePhase === tab.key && rooms.length > 0 && (
                                        <span className="ml-1.5 text-gray-400">({rooms.length})</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Card content */}
                    {loading ? (
                        <RoomGridSkeleton count={3} />
                    ) : rooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                                <Leaf size={22} className="text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">
                                No {currentTab.label.toLowerCase()} plants
                            </h3>
                            <p className="text-xs text-gray-400 max-w-[240px] mb-5">
                                Rooms with {currentTab.label.toLowerCase()} plants will appear here once added.
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn-new-batch"
                            >
                                <Plus size={16} />
                                Add Plants
                            </button>
                        </div>
                    ) : (
                        <div className="plant-map-grid">
                            <PlantMapSummary data={data!} />
                            {rooms.map(([name, room]) => (
                                expandedRoom === name ? (
                                    <ExpandedRoom
                                        key={name}
                                        name={name}
                                        room={room}
                                        phase={activePhase}
                                        phaseLabel={currentTab.label}
                                        onCollapse={() => setExpandedRoom(null)}
                                        onRevalidate={refetch}
                                    />
                                ) : (
                                    <RoomCard
                                        key={name}
                                        name={name}
                                        room={room}
                                        phase={activePhase}
                                        phaseLabel={currentTab.label}
                                        onClick={() => handleRoomClick(name)}
                                    />
                                )
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Table mode */}
                    <FilterToolbar
                        search={search}
                        onSearchChange={setSearch}
                        searchPlaceholder="Search plants..."
                        filters={[phaseFilter, strainFilter, roomFilter]}
                        activeFilters={activeFilters}
                        onFilterChange={(key, values) => setActiveFilters(prev => ({ ...prev, [key]: values }))}
                        onClearFilters={() => setActiveFilters({})}
                    />
                    <div className="mt-4">
                        <DataTable
                            columns={PLANT_COLUMNS}
                            data={sortedPlants}
                            loading={tableLoading}
                            emptyMessage={search || Object.values(activeFilters).some(v => v.length) ? 'No plants match your filters.' : 'No plants found.'}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                        />
                    </div>
                </>
            )}

            {showCreateModal && (
                <CreatePlantingModal
                    activePhase={activePhase}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => { setShowCreateModal(false); refetch(); if (viewMode === 'table') loadPlantList(); }}
                />
            )}
        </div>
    );
};
