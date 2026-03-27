import React from 'react';
import { getHealthColor, HEALTH_COLOR_MAP } from '../../types/plantMap';

interface PlantHealthCodeProps {
    health: number;
}

export const PlantHealthCode: React.FC<PlantHealthCodeProps> = ({ health }) => {
    const colorKey = getHealthColor(health);
    const color = HEALTH_COLOR_MAP[colorKey];
    const label = colorKey.charAt(0).toUpperCase() + colorKey.slice(1);

    return (
        <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color }}
        >
            Code {label}
        </span>
    );
};
