import React from 'react';
import { getHealthColor, HEALTH_COLOR_MAP } from '../../types/plantMap';

interface PlantHealthCircleProps {
    health: number;
    size?: 'sm' | 'lg';
}

export const PlantHealthCircle: React.FC<PlantHealthCircleProps> = ({ health, size = 'lg' }) => {
    const color = HEALTH_COLOR_MAP[getHealthColor(health)];
    const diameter = size === 'lg' ? 80 : 56;
    const strokeWidth = size === 'lg' ? 5 : 4;
    const radius = (diameter - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (health / 100) * circumference;
    const center = diameter / 2;

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: diameter, height: diameter }}>
            <svg width={diameter} height={diameter} className="-rotate-90">
                {/* Background ring */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="#E0E0E0"
                    strokeWidth={strokeWidth}
                    strokeDasharray="4 3"
                />
                {/* Health arc */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <span
                className={`absolute font-semibold tabular-nums ${size === 'lg' ? 'text-base' : 'text-xs'}`}
                style={{ color }}
            >
                {health}%
            </span>
        </div>
    );
};
