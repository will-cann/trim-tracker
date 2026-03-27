import React, { useState, useCallback } from 'react';
import { Map } from 'lucide-react';
import type { PlantPhase } from '../../types/plantMap';
import { PHASE_TABS } from '../../types/plantMap';
import { usePlantMap } from '../../hooks/usePlantMap';
import { PlantMapSummary } from './PlantMapSummary';
import { RoomCard } from './RoomCard';
import { ExpandedRoom } from './ExpandedRoom';

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
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-emerald-500" />
                </div>
            ) : rooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                        <Map size={24} className="text-emerald-300" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">
                        No rooms in {currentTab.label}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-xs">
                        Rooms with {currentTab.label.toLowerCase()} plants will appear here.
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
