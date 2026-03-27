import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { LocationMeta } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, buildWeekRatioString, abbreviateContaminants } from '../../types/plantMap';
import { PlantHealthCircle } from './PlantHealthCircle';
import { PlantHealthCode } from './PlantHealthCode';

interface RoomCardProps {
    name: string;
    room: LocationMeta;
    phaseLabel: string;
    onClick: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ name, room, phaseLabel, onClick }) => {
    const healthColor = getHealthColor(room.plantHealth);
    const borderColor = HEALTH_COLOR_MAP[healthColor];
    const weekRatio = room.phaseDates[0] && room.harvestDates[0]
        ? buildWeekRatioString(room.phaseDates[0], room.harvestDates[0])
        : undefined;
    const subtitle = weekRatio || `${phaseLabel} Room`;
    const harvestDate = room.harvestDates[0];
    const extraHarvests = room.harvestDates.length - 1;
    const contaminantStr = abbreviateContaminants(room.contaminants);

    return (
        <button
            onClick={onClick}
            className="plant-map-room-card group"
            style={{ borderColor }}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
                </div>
                <Maximize2
                    size={14}
                    className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0 mt-0.5"
                />
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                {harvestDate && (
                    <div>
                        <span className="text-gray-400">Harvest </span>
                        <span className="font-medium text-amber-600 tabular-nums">
                            ~{harvestDate.slice(5).replace('-', '/')}
                        </span>
                        {extraHarvests > 0 && (
                            <span className="text-gray-400"> (+{extraHarvests})</span>
                        )}
                    </div>
                )}
                <div>
                    <span className="font-medium text-gray-700 tabular-nums">{room.totalStrains}</span>
                    <span className="text-gray-400"> strain{room.totalStrains !== 1 ? 's' : ''}</span>
                </div>
                <div>
                    <span className="font-medium text-gray-700 tabular-nums">{room.totalPlants}</span>
                    <span className="text-gray-400"> plant{room.totalPlants !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {/* Health section */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Plant Health</p>
                    <PlantHealthCode health={room.plantHealth} />
                    {room.contaminants.length > 0 && (
                        <p className="text-[10px] text-gray-400">{contaminantStr}</p>
                    )}
                </div>
                <PlantHealthCircle health={room.plantHealth} size="lg" />
            </div>
        </button>
    );
};
