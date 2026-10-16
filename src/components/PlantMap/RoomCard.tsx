import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { LocationMeta, PlantPhase } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, buildWeekRatioString, buildPhaseProgress, contaminantAbbrev, contaminantLabel } from '../../types/plantMap';
import { TypeChip } from '../ui';
import { shortDate } from './shortDate';

interface RoomCardProps {
    name: string;
    room: LocationMeta;
    phase: PlantPhase;
    phaseLabel: string;
    onClick: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ name, room, phase, onClick }) => {
    const healthColorKey = getHealthColor(room.plantHealth);
    const healthHex = HEALTH_COLOR_MAP[healthColorKey];
    const healthLabel = `Code ${healthColorKey.charAt(0).toUpperCase() + healthColorKey.slice(1)}`;

    const isFlowering = phase === 'flowering';
    const isVeg = phase === 'vegetative';

    const weekRatio = isFlowering && room.phaseDates[0] && room.harvestDates[0]
        ? buildWeekRatioString(room.phaseDates[0], room.harvestDates[0])
        : undefined;

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

    const contaminants = [...new Set(room.contaminants)];

    return (
        <button
            onClick={onClick}
            className="plant-map-room-card group"
            style={{ '--room-health': healthHex } as React.CSSProperties}
            title={`Open ${name}`}
        >
            {/* Name + phase */}
            <div className="room-card-head">
                <h3 className="room-card-name" title={name}>{name}</h3>
                <TypeChip palette="plantPhase" value={phase} />
                <Maximize2 size={13} className="room-card-expand text-gray-300 group-hover:text-emerald-500" />
            </div>

            {/* Counts and the next milestone, one line */}
            <div className="room-card-metrics">
                <span>
                    <span className="room-card-metric-value">{room.totalPlants.toLocaleString()}</span>
                    <span className="room-card-metric-label"> plant{room.totalPlants !== 1 ? 's' : ''}</span>
                </span>
                <span>
                    <span className="room-card-metric-value">{room.totalStrains}</span>
                    <span className="room-card-metric-label"> strain{room.totalStrains !== 1 ? 's' : ''}</span>
                </span>
                {dateLabel && primaryDate && (
                    <span className="room-card-milestone">
                        <span className="room-card-metric-label">{dateLabel} </span>
                        <span className="room-card-metric-value">{shortDate(primaryDate)}</span>
                        {extraDates > 0 && <span className="room-card-metric-label"> +{extraDates}</span>}
                    </span>
                )}
            </div>

            {/* Flowering progress */}
            {flowerProgress != null && (
                <div className="room-card-progress" title={weekRatio}>
                    <div className="room-card-progress-track">
                        <div className="room-card-progress-fill" style={{ width: `${flowerProgress}%`, background: healthHex }} />
                    </div>
                    <span className="room-card-progress-label tabular-nums">{weekRatio ?? `${flowerProgress}%`}</span>
                </div>
            )}

            {/* Health */}
            <div className="room-card-health" title={`Plant health ${room.plantHealth}% · ${healthLabel}`}>
                <span className="data-table-dot" style={{ background: healthHex }} />
                <span className="room-card-health-value tabular-nums" style={{ color: healthHex }}>{room.plantHealth}%</span>
                <span className="room-card-health-code">{healthLabel}</span>
                {contaminants.length > 0 && (
                    <span className="room-card-issues">
                        {contaminants.map(c => (
                            <span key={c} className="room-card-issue" title={contaminantLabel(c)}>{contaminantAbbrev(c)}</span>
                        ))}
                    </span>
                )}
            </div>
        </button>
    );
};
