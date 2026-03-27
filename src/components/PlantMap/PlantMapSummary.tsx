import React from 'react';
import { TreePine, AlertTriangle } from 'lucide-react';
import type { PlantMapData } from '../../types/plantMap';
import { getHealthColor, HEALTH_COLOR_MAP } from '../../types/plantMap';
import { PlantHealthCode } from './PlantHealthCode';

interface PlantMapSummaryProps {
    data: PlantMapData;
}

export const PlantMapSummary: React.FC<PlantMapSummaryProps> = ({ data }) => {
    const rooms = Object.entries(data);

    const totalPlants = rooms.reduce((sum, [, r]) => sum + r.totalPlants, 0);
    const uniqueStrains = [...new Set(rooms.flatMap(([, r]) => r.strains))];

    const leastHealthy = rooms
        .map(([name, r]) => ({ name, health: r.plantHealth }))
        .sort((a, b) => a.health - b.health)
        .slice(0, 3);

    return (
        <div className="plant-map-summary">
            <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <TreePine size={16} className="text-emerald-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Facility Overview</h3>
            </div>

            <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Rooms</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{rooms.length}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Total Plants</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{totalPlants.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Unique Strains</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{uniqueStrains.length}</span>
                </div>
            </div>

            {uniqueStrains.length > 0 && (
                <div className="mb-6">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Strains</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {uniqueStrains.sort().map(s => (
                            <span key={s} className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 rounded-full">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {leastHealthy.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={11} />
                        Needs Attention
                    </h4>
                    <div className="space-y-2">
                        {leastHealthy.map(room => (
                            <div key={room.name} className="flex items-center justify-between py-1.5">
                                <span className="text-xs text-gray-700 truncate mr-2">{room.name}</span>
                                <div className="flex items-center gap-2">
                                    <PlantHealthCode health={room.health} />
                                    <span
                                        className="text-xs font-semibold tabular-nums"
                                        style={{ color: HEALTH_COLOR_MAP[getHealthColor(room.health)] }}
                                    >
                                        {room.health}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
