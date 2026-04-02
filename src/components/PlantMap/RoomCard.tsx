import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, buildWeekRatioString, buildPhaseProgress, contaminantAbbrev } from '../../types/plantMap';

interface RoomCardProps {
    name: string;
    room: LocationMeta;
    phase: PlantPhase;
    phaseLabel: string;
    onClick: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ name, room, phase, phaseLabel, onClick }) => {
    const healthColorKey = getHealthColor(room.plantHealth);
    const healthHex = HEALTH_COLOR_MAP[healthColorKey];
    const healthLabel = `Code ${healthColorKey.charAt(0).toUpperCase() + healthColorKey.slice(1)}`;

    const isFlowering = phase === 'flowering';
    const isVeg = phase === 'vegetative';

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

    // Flowering progress: % through the flowering cycle
    const flowerProgress = isFlowering && room.phaseDates[0] && room.harvestDates[0]
        ? buildPhaseProgress(room.phaseDates[0], room.harvestDates[0])
        : undefined;

    return (
        <button
            onClick={onClick}
            className="plant-map-room-card group relative"
            style={{ borderColor: healthHex }}
        >
            <Maximize2
                size={13}
                className="absolute top-3 right-3 text-gray-300 group-hover:text-emerald-500 transition-colors"
            />

            {/* Header */}
            <div className="mb-3 pr-6">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{name}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                {dateLabel && primaryDate && (
                    <div>
                        <span className="text-gray-400">{dateLabel} </span>
                        <span className="font-medium tabular-nums text-gray-700">
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
                                background: healthHex,
                            }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{flowerProgress}% complete</p>
                </div>
            )}

            {/* Health section */}
            <div className="pt-4 mt-1 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Plant Health</p>
                <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-1">
                    <span
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: healthHex }}
                    >
                        {healthLabel}
                    </span>
                    <span className="text-[10px] text-gray-300">·</span>
                    <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: healthHex }}
                    >
                        {room.plantHealth}%
                    </span>
                    {room.contaminants.length > 0 && (
                        <>
                            <span className="text-[10px] text-gray-300">·</span>
                            {[...new Set(room.contaminants)].map((c, i) => (
                                <React.Fragment key={c}>
                                    {i > 0 && <span className="text-[10px] text-gray-300">·</span>}
                                    <span
                                        className="text-[10px] font-medium"
                                        style={{ color: healthHex }}
                                    >
                                        {contaminantAbbrev(c)}
                                    </span>
                                </React.Fragment>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </button>
    );
};
