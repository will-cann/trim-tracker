import React, { useEffect, useRef, useCallback } from 'react';
import { Minimize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, contaminantLabel } from '../../types/plantMap';
import { useRoomMap } from '../../hooks/useRoomMap';
import { StrainsList } from './StrainsList';

interface ExpandedRoomProps {
    name: string;
    room: LocationMeta;
    phase: PlantPhase;
    phaseLabel: string;
    onCollapse: () => void;
    onRevalidate: () => void;
}

export const ExpandedRoom: React.FC<ExpandedRoomProps> = ({
    name,
    room,
    phase,
    phaseLabel,
    onCollapse,
    onRevalidate,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const healthColor = getHealthColor(room.plantHealth);
    const borderColor = HEALTH_COLOR_MAP[healthColor];
    const contaminantStr = room.contaminants.length
        ? [...new Set(room.contaminants)].map(c => contaminantLabel(c)).sort().join(', ')
        : 'N/A';
    const showHarvestDate = phase === 'flowering' && room.harvestDates[0];

    const { data: roomMapData, loading: roomMapLoading, error: roomMapError, refetch: refetchRoomMap } = useRoomMap(phase, name);

    const handleRevalidate = useCallback(() => {
        onRevalidate();
        refetchRoomMap();
    }, [onRevalidate, refetchRoomMap]);

    // Scroll into view on mount
    useEffect(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    const healthColorKey = getHealthColor(room.plantHealth);
    const healthHex = HEALTH_COLOR_MAP[healthColorKey];
    const healthLabel = `Code ${healthColorKey.charAt(0).toUpperCase() + healthColorKey.slice(1)}`;

    return (
        <div
            ref={containerRef}
            className="plant-map-expanded-room"
            style={{ borderColor }}
        >
            {/* Header bar */}
            <div className="expanded-room-header relative" style={{ backgroundColor: `${borderColor}0D` }}>
                <button
                    onClick={onCollapse}
                    className="absolute top-3 right-3 p-1 rounded hover:bg-black/5 transition-colors"
                >
                    <Minimize2 size={14} className="text-gray-400" />
                </button>
                <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 pr-8">
                    <h3 className="text-sm font-semibold text-gray-900">{name}</h3>
                    <div className="flex items-baseline gap-3 text-xs text-gray-500">
                        {showHarvestDate && (
                            <span>
                                <span className="text-gray-400">Harvest </span>
                                <span className="font-medium text-gray-700 tabular-nums">{formatDate(room.harvestDates[0])}</span>
                            </span>
                        )}
                        <span>
                            <span className="font-semibold text-gray-900 tabular-nums">{room.totalStrains}</span>
                            <span className="text-gray-400"> strain{room.totalStrains !== 1 ? 's' : ''}</span>
                        </span>
                        <span>
                            <span className="font-semibold text-gray-900 tabular-nums">{room.totalPlants}</span>
                            <span className="text-gray-400"> plant{room.totalPlants !== 1 ? 's' : ''}</span>
                        </span>
                    </div>
                    <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-1 text-xs">
                        <span className="text-gray-400">Health</span>
                        <span className="font-semibold uppercase tracking-wide" style={{ color: healthHex }}>
                            {healthLabel}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="font-semibold tabular-nums" style={{ color: healthHex }}>
                            {room.plantHealth}%
                        </span>
                        {room.contaminants.length > 0 && (
                            <>
                                <span className="text-gray-300">·</span>
                                <span className="text-gray-500 font-medium">{contaminantStr}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Full-width strains list */}
            <div className="expanded-room-body">
                <StrainsList
                    data={roomMapData}
                    loading={roomMapLoading}
                    error={roomMapError}
                    phase={phase}
                    phaseLabel={phaseLabel}
                    roomName={name}
                    onRevalidate={handleRevalidate}
                />
            </div>
        </div>
    );
};

function formatDate(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
}
