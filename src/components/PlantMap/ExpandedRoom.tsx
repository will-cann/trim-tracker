import React, { useEffect, useRef } from 'react';
import { Minimize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, abbreviateContaminants } from '../../types/plantMap';
import { useRoomMap } from '../../hooks/useRoomMap';
import { PlantHealthCircle } from './PlantHealthCircle';
import { PlantHealthCode } from './PlantHealthCode';
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
    const contaminantStr = abbreviateContaminants(room.contaminants);
    const showHarvestDate = phase === 'flowering' && room.harvestDates[0];

    const { data: roomMapData, loading: roomMapLoading } = useRoomMap(phase, name);

    // Scroll into view on mount
    useEffect(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    return (
        <div
            ref={containerRef}
            className="plant-map-expanded-room"
            style={{ borderColor }}
        >
            {/* Left column */}
            <div className="expanded-room-left">
                {/* Room Summary */}
                <div
                    className="expanded-room-summary"
                    style={{ backgroundColor: `${borderColor}0D` }}
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">{phaseLabel} Phase</p>
                        </div>
                        <button
                            onClick={onCollapse}
                            className="p-1 rounded hover:bg-black/5 transition-colors shrink-0"
                        >
                            <Minimize2 size={14} className="text-gray-400" />
                        </button>
                    </div>

                    <div className="space-y-2.5 text-xs">
                        {showHarvestDate && (
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Harvest</span>
                                <span className="font-medium text-gray-700 tabular-nums">
                                    {formatDate(room.harvestDates[0])}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Strains</span>
                            <span className="font-semibold text-gray-900 tabular-nums">{room.totalStrains}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Plants</span>
                            <span className="font-semibold text-gray-900 tabular-nums">{room.totalPlants}</span>
                        </div>
                    </div>
                </div>

                {/* Health Summary */}
                <div className="expanded-room-health">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Plant Health</p>
                    <div className="flex items-center justify-between mb-3">
                        <PlantHealthCode health={room.plantHealth} />
                        <PlantHealthCircle health={room.plantHealth} size="sm" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Contamination</p>
                        <p className="text-xs text-gray-600 font-medium">{contaminantStr}</p>
                    </div>
                </div>
            </div>

            {/* Right column — Strains List */}
            <div className="expanded-room-right">
                <StrainsList
                    data={roomMapData}
                    loading={roomMapLoading}
                    phase={phase}
                    phaseLabel={phaseLabel}
                    roomName={name}
                    onRevalidate={() => { onRevalidate(); }}
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
