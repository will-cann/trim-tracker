import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, buildWeekRatioString, buildPhaseProgress, abbreviateContaminants } from '../../types/plantMap';
import { PlantHealthCircle } from './PlantHealthCircle';
import { PlantHealthCode } from './PlantHealthCode';

interface RoomCardProps {
    name: string;
    room: LocationMeta;
    phase: PlantPhase;
    phaseLabel: string;
    onClick: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ name, room, phase, phaseLabel, onClick }) => {
    const healthColor = getHealthColor(room.plantHealth);
    const borderColor = HEALTH_COLOR_MAP[healthColor];

    const isFlowering = phase === 'flowering';
    const isVeg = phase === 'vegetative';

    // Flowering rooms show week ratio + harvest date
    // Veg rooms show flip date
    // Nursery rooms show no milestone date
    const weekRatio = isFlowering && room.phaseDates[0] && room.harvestDates[0]
        ? buildWeekRatioString(room.phaseDates[0], room.harvestDates[0])
        : undefined;
    const subtitle = weekRatio || `${phaseLabel} Room`;

    let dateLabel: string | null = null;
    let primaryDate: string | undefined;
    let extraDates = 0;

    if (isFlowering && room.harvestDates.length > 0) {
        dateLabel = 'Harvest';
        primaryDate = room.harvestDates[0];
        extraDates = room.harvestDates.length - 1;
    } else if (isVeg && room.flipDates && room.flipDates.length > 0) {
        dateLabel = 'Flip';
        primaryDate = room.flipDates[0];
        extraDates = room.flipDates.length - 1;
    }

    const contaminantStr = abbreviateContaminants(room.contaminants);

    // Flowering progress: % through the flowering cycle
    const flowerProgress = isFlowering && room.phaseDates[0] && room.harvestDates[0]
        ? buildPhaseProgress(room.phaseDates[0], room.harvestDates[0])
        : undefined;

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
                {dateLabel && primaryDate && (
                    <div>
                        <span className="text-gray-400">{dateLabel} </span>
                        <span className={`font-medium tabular-nums ${isFlowering ? 'text-amber-600' : 'text-blue-500'}`}>
                            ~{primaryDate.slice(5).replace('-', '/')}
                        </span>
                        {extraDates > 0 && (
                            <span className="text-gray-400"> (+{extraDates})</span>
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

            {/* Flowering progress bar */}
            {flowerProgress != null && (
                <div className="mb-3">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${flowerProgress}%`,
                                background: flowerProgress >= 90
                                    ? '#f59e0b'
                                    : 'var(--color-chameleon, #3BB570)',
                            }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{flowerProgress}% complete</p>
                </div>
            )}

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
