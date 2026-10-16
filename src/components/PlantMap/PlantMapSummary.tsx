import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PlantMapData } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP, contaminantAbbrev, contaminantLabel } from '../../types/plantMap';

interface PlantMapSummaryProps {
    data: PlantMapData;
}

/** Strain chips shown before the list collapses behind "+N more". */
const STRAIN_CHIP_LIMIT = 10;
/** Rooms listed under "Needs attention". */
const ATTENTION_LIMIT = 4;

/**
 * One-line facility summary that sits above the room grid: headline counts,
 * the rooms that need attention, and the strain mix. Replaces the former
 * tall "Facility Overview" card so every room card fits on the first screen.
 */
export const PlantMapSummary: React.FC<PlantMapSummaryProps> = ({ data }) => {
    const [showAllStrains, setShowAllStrains] = useState(false);
    const rooms = Object.entries(data);

    const totalPlants = rooms.reduce((sum, [, r]) => sum + r.totalPlants, 0);
    const uniqueStrains = [...new Set(rooms.flatMap(([, r]) => r.strains))].sort();
    const avgHealth = totalPlants
        ? Math.round(rooms.reduce((sum, [, r]) => sum + r.plantHealth * r.totalPlants, 0) / totalPlants)
        : 100;
    const avgHex = HEALTH_COLOR_MAP[getHealthColor(avgHealth)];

    const needsAttention = rooms
        .filter(([, r]) => r.plantHealth < 100 || r.contaminants.length > 0)
        .map(([name, r]) => ({ name, health: r.plantHealth, contaminants: [...new Set(r.contaminants)] }))
        .sort((a, b) => a.health - b.health)
        .slice(0, ATTENTION_LIMIT);

    const shownStrains = showAllStrains ? uniqueStrains : uniqueStrains.slice(0, STRAIN_CHIP_LIMIT);
    const hiddenStrains = uniqueStrains.length - shownStrains.length;

    return (
        <div className="plant-map-strip">
            <div className="plant-map-strip-stats">
                <Stat value={rooms.length} label={rooms.length === 1 ? 'room' : 'rooms'} />
                <Stat value={totalPlants.toLocaleString()} label="plants" />
                <Stat value={uniqueStrains.length} label={uniqueStrains.length === 1 ? 'strain' : 'strains'} />
                <Stat value={`${avgHealth}%`} label="avg health" color={avgHex} />
            </div>

            <div className="plant-map-strip-attention">
                <span className="plant-map-strip-label">
                    <AlertTriangle size={12} />
                    Needs attention
                </span>
                {needsAttention.length === 0 ? (
                    <span className="text-xs text-gray-500">All rooms healthy</span>
                ) : needsAttention.map(room => {
                    const hex = HEALTH_COLOR_MAP[getHealthColor(room.health)];
                    const issues = room.contaminants.map(c => contaminantAbbrev(c)).join(', ');
                    return (
                        <span
                            key={room.name}
                            className="plant-map-attention-chip"
                            title={room.contaminants.map(c => contaminantLabel(c)).join(', ') || undefined}
                        >
                            <span className="data-table-dot" style={{ background: hex }} />
                            <span className="font-semibold text-gray-900">{room.name}</span>
                            <span className="tabular-nums font-semibold" style={{ color: hex }}>{room.health}%</span>
                            {issues && <span className="text-gray-500">{issues}</span>}
                        </span>
                    );
                })}
            </div>

            {uniqueStrains.length > 0 && (
                <div className="plant-map-strip-strains">
                    <span className="plant-map-strip-label">Strains</span>
                    {shownStrains.map(s => (
                        <span key={s} className="plant-map-strain-chip">{s}</span>
                    ))}
                    {(hiddenStrains > 0 || showAllStrains) && (
                        <button
                            type="button"
                            onClick={() => setShowAllStrains(v => !v)}
                            className="plant-map-strain-chip plant-map-strain-chip--more"
                        >
                            {showAllStrains ? 'Show fewer' : `+${hiddenStrains} more`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const Stat: React.FC<{ value: React.ReactNode; label: string; color?: string }> = ({ value, label, color }) => (
    <span className="plant-map-strip-stat">
        <span className="plant-map-strip-stat-value tabular-nums" style={color ? { color } : undefined}>{value}</span>
        <span className="plant-map-strip-stat-label">{label}</span>
    </span>
);
