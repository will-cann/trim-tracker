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

interface PlantMapDashboardProps {
    refreshKey?: number;
}

export const PlantMapDashboard: React.FC<PlantMapDashboardProps> = ({ refreshKey }) => {
    const [activePhase, setActivePhase] = useState<PlantPhase>('flowering');
    const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const { data, loading, refetch } = usePlantMap(activePhase);

    // Refetch when external actions (ambient, chat) modify plant data
    const prevRefreshKey = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
            prevRefreshKey.current = refreshKey;
            refetch();
        }
    }, [refreshKey, refetch]);

    const currentTab = PHASE_TABS.find(t => t.key === activePhase)!;
    const rooms = data ? Object.entries(data) : [];

    const handlePhaseChange = useCallback((phase: PlantPhase) => {
        setExpandedRoom(null);
        setActivePhase(phase);
    }, []);

    const handleRoomClick = useCallback((name: string) => {
        setExpandedRoom(prev => prev === name ? null : name);
    }, []);

    return (
        <div className="dashboard">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Plant Map</h1>
                        <p className="text-xs text-gray-400">Rooms and plant health by growth phase</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-new-batch"
                >
                    <Plus size={16} />
                    New Planting
                </button>
            </div>

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

            {/* Content */}
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
            {showCreateModal && (
                <CreatePlantingModal
                    activePhase={activePhase}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => { setShowCreateModal(false); refetch(); }}
                />
            )}
        </div>
    );
};
