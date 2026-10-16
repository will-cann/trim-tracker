import React, { useEffect, useRef, useCallback } from 'react';
import { Minimize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, contaminantLabel } from '../../types/plantMap';
import { useRoomMap } from '../../hooks/useRoomMap';
import { StrainsList } from './StrainsList';
import { shortDate } from './shortDate';
import { TypeChip } from '../ui';

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
            <div className="expanded-room-header" style={{ backgroundColor: `${borderColor}0D` }}>
                <h3 className="expanded-room-name">{name}</h3>
                <TypeChip palette="plantPhase" value={phase} />
                <div className="expanded-room-facts">
                    <span>
                        <span className="font-bold text-gray-900 tabular-nums">{room.totalPlants.toLocaleString()}</span>
                        <span className="text-gray-500"> plant{room.totalPlants !== 1 ? 's' : ''}</span>
                    </span>
                    <span>
                        <span className="font-bold text-gray-900 tabular-nums">{room.totalStrains}</span>
                        <span className="text-gray-500"> strain{room.totalStrains !== 1 ? 's' : ''}</span>
                    </span>
                    {showHarvestDate && (
                        <span>
                            <span className="text-gray-500">Harvest </span>
                            <span className="font-bold text-gray-900 tabular-nums">{shortDate(room.harvestDates[0])}</span>
                            {room.harvestDates.length > 1 && <span className="text-gray-500"> +{room.harvestDates.length - 1}</span>}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1.5" title={`Plant health ${room.plantHealth}% · ${healthLabel}`}>
                        <span className="data-table-dot" style={{ background: healthHex }} />
                        <span className="font-bold tabular-nums" style={{ color: healthHex }}>{room.plantHealth}%</span>
                        <span className="text-gray-500">{healthLabel}</span>
                    </span>
                    {room.contaminants.length > 0 && (
                        <span className="text-gray-700 font-medium">{contaminantStr}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onCollapse}
                    className="expanded-room-collapse"
                    title="Collapse room"
                    aria-label="Collapse room"
                >
                    <Minimize2 size={14} />
                </button>
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
