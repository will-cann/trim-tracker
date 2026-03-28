import React, { useState, useCallback } from 'react';
import { Map, Leaf } from 'lucide-react';
import type { PlantPhase } from '../../types/plantMap';
import { PHASE_TABS } from '../../types/plantMap';
import { usePlantMap } from '../../hooks/usePlantMap';
import { PlantMapSummary } from './PlantMapSummary';
import { RoomCard } from './RoomCard';
import { ExpandedRoom } from './ExpandedRoom';
import { RoomGridSkeleton } from '../Skeleton';

export const PlantMapDashboard: React.FC = () => {
    const [activePhase, setActivePhase] = useState<PlantPhase>('flowering');
    const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
    const { data, loading, refetch } = usePlantMap(activePhase);

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
            <div className="dashboard-top-section">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Map size={20} className="text-emerald-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Plant Map</h1>
                        <p className="text-xs text-gray-400">Spatial overview of facility rooms and plant health</p>
                    </div>
                </div>
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
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center mb-4 shadow-sm">
                        <Leaf size={28} className="text-emerald-400" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-600 mb-1">
                        No {currentTab.label.toLowerCase()} plants
                    </h3>
                    <p className="text-sm text-gray-400 max-w-xs">
                        Rooms with {currentTab.label.toLowerCase()} plants will appear here automatically.
                        Try adding plants via the AI assistant.
                    </p>
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
                                phaseLabel={currentTab.label}
                                onClick={() => handleRoomClick(name)}
                            />
                        )
                    ))}
                </div>
            )}
        </div>
    );
};
